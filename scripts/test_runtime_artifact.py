import contextlib
import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
import tempfile
import tarfile
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location("artifact", Path(__file__).with_name("runtime-artifact.py"))
artifact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(artifact)


class RuntimeArtifactTests(unittest.TestCase):
    def setUp(self):
        base = Path(__file__).resolve().parent.parent / ".ai-work/runs"
        base.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=base)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.contract = json.loads(artifact.CONTRACT.read_text())
        for name in self.contract["required"]:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("synthetic runtime module\n")
        (self.root / "package.json").write_text(json.dumps({"version": "1.0.0"}))
        (self.root / "back-end/package.json").write_text(json.dumps({"version": "1.0.0", "dependencies": {}}))
        (self.root / "front-end/package.json").write_text(json.dumps({"version": "1.0.0"}))
        (self.root / "package-lock.json").write_text(json.dumps({"version": "1.0.0", "packages": {"": {"version": "1.0.0"}}}))
        (self.root / "back-end/package-lock.json").write_text((self.root / "package-lock.json").read_text())
        marker = json.dumps({"repository": "anderson-webops/zilch.jacobdanderson.net", "release": "v1.0.0", "commitSha": "a"*40, "builtAt": "2026-09-16T00:00:00Z"})
        (self.root / "front-end/.output/public/release.json").write_text(marker)
        (self.root / ".zilch-release-prepared.json").write_text(marker)
        artifact.normalize_permissions(self.root)

    def manifest(self):
        return {"format": 2, "commit": "a" * 40, "contract": self.contract,
                "files": artifact.inventory(self.root)}

    def test_valid_tree(self):
        artifact.validate(self.root, self.manifest())

    def test_hash_tampering(self):
        manifest = self.manifest()
        (self.root / "back-end/dist/app.js").write_text("changed")
        with self.assertRaisesRegex(ValueError, "hashes"):
            artifact.validate(self.root, manifest)

    def test_runtime_modes_are_independently_enforced(self):
        cases = [
            (self.root / ".zilch-release-prepared.json", 0o644, "unsafe runtime mode"),
            (self.root / "front-end/.output/public/index.html", 0o600, "unsafe runtime mode"),
            (self.root / "front-end/.output/public", 0o700, "directory must be mode 0755"),
        ]
        for path, mode, message in cases:
            with self.subTest(path=path, mode=oct(mode)):
                artifact.normalize_permissions(self.root)
                path.chmod(mode)
                with self.assertRaisesRegex(ValueError, message):
                    artifact.validate(self.root, self.manifest())

    def test_previous_format_requires_explicit_rollback_scope(self):
        legacy = {"format": 1, "commit": "a" * 40, "contract": self.contract,
                  "files": artifact.inventory(self.root, include_modes=False)}
        with self.assertRaisesRegex(ValueError, "independently trusted runtime contract"):
            artifact.validate(self.root, legacy)
        artifact.validate(self.root, legacy, allow_format1_rollback=True)

    def test_version_specific_contract_is_explicit(self):
        alternate_contract = {**self.contract, "topology": "protected retained-release fixture"}
        contract_path = self.root.parent / f"{self.root.name}-contract.json"
        self.addCleanup(contract_path.unlink, missing_ok=True)
        contract_path.write_text(json.dumps(alternate_contract))
        manifest = {"format": 2, "commit": "a" * 40, "contract": alternate_contract,
                    "files": artifact.inventory(self.root)}
        with self.assertRaisesRegex(ValueError, "independently trusted runtime contract"):
            artifact.validate(self.root, manifest)
        artifact.validate(self.root, manifest, contract_path=contract_path)

    def test_format_1_cannot_be_unpacked_as_a_new_candidate(self):
        with tempfile.TemporaryDirectory(dir=self.root.parent) as temporary:
            output = Path(temporary)
            archive = output / "legacy-runtime.tar.gz"
            unpacked = output / "unpacked"
            unpacked.mkdir()
            legacy = {"format": 1, "commit": "a" * 40, "contract": self.contract,
                      "files": artifact.inventory(self.root, include_modes=False)}
            (self.root / artifact.MANIFEST).write_text(json.dumps(legacy))
            with tarfile.open(archive, "w:gz") as target:
                for path in self.root.rglob("*"):
                    if path.is_file():
                        target.add(path, arcname=path.relative_to(self.root).as_posix())
            command = [sys.executable, "-B", str(Path(artifact.__file__)), "unpack", str(unpacked),
                       "--archive", str(archive), "--sha256", artifact.digest(archive),
                       "--commit", "a" * 40]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("independently trusted runtime contract", result.stderr)

    def test_missing_module_even_if_the_inventory_omits_it(self):
        (self.root / "back-end/dist/boundedRateStore.js").unlink()
        with self.assertRaisesRegex(ValueError, "required runtime path missing"):
            artifact.validate(self.root, self.manifest())

    def test_symlinks_and_private_state(self):
        for name in [".env", "credentials.json", "back-end/dist/key.pem", "back-end/dist/enrollment.sqlite3"]:
            with self.subTest(name=name):
                path = self.root / name
                path.write_text("synthetic forbidden content")
                with self.assertRaisesRegex(ValueError, "forbidden"):
                    self.manifest()
                path.unlink()
        (self.root / "back-end/dist/escape").symlink_to("/tmp")
        with self.assertRaisesRegex(ValueError, "forbidden"):
            self.manifest()

    def test_missing_production_dependency(self):
        package = {"version": "1.0.0", "dependencies": {"fixture": "1.0.0"}}
        (self.root / "back-end/package.json").write_text(json.dumps(package))
        (self.root / "back-end/package-lock.json").write_text(json.dumps({
            "version": "1.0.0", "packages": {"": package, "node_modules/fixture": {"version": "1.0.0"}}}))
        with self.assertRaisesRegex(ValueError, "production dependency missing"):
            artifact.validate(self.root, self.manifest())

    def test_static_identity_cannot_be_rehashed_to_another_commit(self):
        path = self.root / "front-end/.output/public/release.json"
        value = json.loads(path.read_text())
        value["commitSha"] = "b" * 40
        path.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError, "static deployment identity"):
            artifact.validate(self.root, self.manifest())

    def test_malformed_identity_cannot_be_rehashed(self):
        for marker in [
            {},
            {"repository": "anderson-webops/zilch.jacobdanderson.net", "release": "v1.0.0", "commitSha": "a" * 40},
            {"repository": "anderson-webops/zilch.jacobdanderson.net", "release": "v1.0.0", "commitSha": "a" * 40, "builtAt": "2026-02-30T00:00:00Z"},
            {"repository": "attacker.invalid/repository", "release": "v1.0.0", "commitSha": "a" * 40, "builtAt": "2026-09-16T00:00:00Z"},
        ]:
            with self.subTest(marker=marker):
                for name in ["front-end/.output/public/release.json", ".zilch-release-prepared.json"]:
                    (self.root / name).write_text(json.dumps(marker))
                with self.assertRaisesRegex(ValueError, "invalid deployment identity"):
                    artifact.validate(self.root, self.manifest())

    def test_unlisted_native_and_development_packages_are_rejected(self):
        native = self.root / "back-end/dist/unreviewed.node"
        native.write_text("synthetic native fixture")
        with self.assertRaisesRegex(ValueError, "undeclared native binding"):
            artifact.validate(self.root, self.manifest())
        native.unlink()
        package = self.root / "back-end/node_modules/fixture/package.json"
        package.parent.mkdir(parents=True)
        package.write_text(json.dumps({"version": "1.0.0"}))
        lock = self.root / "back-end/package-lock.json"
        value = json.loads(lock.read_text())
        value["packages"]["node_modules/fixture"] = {"version": "1.0.0", "dev": True}
        lock.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError, "development dependency in runtime"):
            artifact.validate(self.root, self.manifest())

    def test_exact_archive_roundtrip_and_post_copier_verification(self):
        with tempfile.TemporaryDirectory(dir=self.root.parent) as temporary:
            output = Path(temporary)
            archive = output / "runtime.tar.gz"
            unpacked = output / "unpacked"
            unpacked.mkdir()
            command = [sys.executable, "-B", str(Path(artifact.__file__))]
            # Handcrafted synthetic fixture exercises verification on any host;
            # the production pack command itself requires Linux ARM64.
            (self.root / artifact.MANIFEST).write_text(json.dumps(self.manifest()))
            with tarfile.open(archive, "w:gz") as target:
                for path in self.root.rglob("*"):
                    if path.is_file(): target.add(path, arcname=path.relative_to(self.root).as_posix())
            sha = artifact.digest(archive)
            arguments = ["--archive", str(archive), "--sha256", sha, "--commit", "a" * 40]
            subprocess.run([*command, "unpack", str(unpacked), *arguments], check=True, capture_output=True)
            subprocess.run([*command, "verify", str(unpacked), *arguments], check=True, capture_output=True)
            self.assertEqual(os.stat(unpacked).st_mode & 0o777, 0o755)
            self.assertEqual(os.stat(unpacked / ".zilch-release-prepared.json").st_mode & 0o777, 0o600)
            self.assertEqual(os.stat(unpacked / "front-end/.output/public/index.html").st_mode & 0o777, 0o644)
            (unpacked / "back-end/dist/boundedRateStore.js").unlink()
            # Rehashing the copier's incomplete tree cannot override the trusted archive.
            manifest = json.loads((unpacked / artifact.MANIFEST).read_text())
            manifest["files"].pop("back-end/dist/boundedRateStore.js")
            (unpacked / artifact.MANIFEST).write_text(json.dumps(manifest))
            result = subprocess.run([*command, "verify", str(unpacked), *arguments], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("differs from trusted archive", result.stderr)

    def test_packing_normalizes_manifest_under_restrictive_umasks(self):
        observations = []
        for mask in (0o027, 0o077):
            with self.subTest(umask=oct(mask)), tempfile.TemporaryDirectory(dir=self.root.parent) as temporary:
                output = Path(temporary)
                tree = output / "tree"
                shutil.copytree(self.root, tree)
                archive = output / "runtime.tar.gz"
                previous_umask = os.umask(mask)
                try:
                    with (
                        mock.patch.object(artifact.platform, "system", return_value="Linux"),
                        mock.patch.object(artifact.platform, "machine", return_value="aarch64"),
                        mock.patch.object(sys, "argv", [
                            str(Path(artifact.__file__)), "pack", str(tree),
                            "--archive", str(archive), "--commit", "a" * 40,
                        ]),
                        contextlib.redirect_stdout(io.StringIO()),
                    ):
                        artifact.main()
                finally:
                    os.umask(previous_umask)
                manifest_path = tree / artifact.MANIFEST
                self.assertEqual(stat_mode(manifest_path), 0o644)
                self.assertEqual(stat_mode(tree / ".zilch-release-prepared.json"), 0o600)
                artifact.validate(tree, json.loads(manifest_path.read_text()))
                with tarfile.open(archive, "r:gz") as packaged:
                    members = {member.name: member.mode for member in packaged.getmembers()}
                self.assertEqual(members[artifact.MANIFEST], 0o644)
                self.assertEqual(members[".zilch-release-prepared.json"], 0o600)
                observations.append((manifest_path.read_bytes(), members))
        self.assertEqual(observations[0], observations[1])


def stat_mode(path):
    return path.stat().st_mode & 0o777


if __name__ == "__main__":
    unittest.main()
