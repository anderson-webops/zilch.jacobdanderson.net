#!/usr/bin/env python3
"""Build/verify a strictly inventoried production tree; never archive runtime state."""
import argparse
from contextlib import contextmanager
import datetime
import gzip
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import tarfile
import sys
import platform
sys.dont_write_bytecode = True

CONTRACT = Path(__file__).resolve().parent.parent / "deploy/runtime-artifact.json"
MANIFEST = "runtime-manifest.json"
PRIVATE_MARKER = ".zilch-release-prepared.json"
MAX_ARCHIVE_FILES = 100_000
MAX_ARCHIVE_FILE_BYTES = 1024 * 1024 * 1024
MAX_ARCHIVE_HEADERS = 200_000
MAX_ARCHIVE_METADATA_BYTES = 16 * 1024 * 1024
MAX_ARCHIVE_METADATA_ENTRY_BYTES = 1024 * 1024
MAX_ARCHIVE_METADATA_RECORDS = 250_000
MAX_ARCHIVE_DECOMPRESSED_BYTES = MAX_ARCHIVE_FILE_BYTES + 256 * 1024 * 1024
MAX_ARCHIVE_COMPRESSED_BYTES = MAX_ARCHIVE_DECOMPRESSED_BYTES + 32 * 1024 * 1024
MAX_RUNTIME_MANIFEST_BYTES = 64 * 1024 * 1024


def digest_stream(stream):
    checksum = hashlib.sha256()
    while chunk := stream.read(1024 * 1024):
        checksum.update(chunk)
    return checksum.hexdigest()


def digest(path):
    with path.open("rb") as stream:
        return digest_stream(stream)


def read_manifest(stream):
    payload = stream.read(MAX_RUNTIME_MANIFEST_BYTES + 1)
    if len(payload) > MAX_RUNTIME_MANIFEST_BYTES:
        raise ValueError("runtime manifest exceeds the reviewed size limit")
    return json.loads(payload)


def check_pax_metadata(payload):
    position = 0
    record_count = 0
    while position < len(payload):
        separator = payload.find(b" ", position)
        if separator < 0 or separator - position > 10:
            raise ValueError("invalid archive metadata record")
        length_bytes = payload[position:separator]
        if not length_bytes.isdigit():
            raise ValueError("invalid archive metadata record")
        length = int(length_bytes)
        end = position + length
        if length < 5 or end > len(payload):
            raise ValueError("invalid archive metadata record")
        record = payload[separator + 1:end]
        name, equals, _value = record[:-1].partition(b"=")
        if not record.endswith(b"\n") or not name or not equals:
            raise ValueError("invalid archive metadata record")
        if name == b"size" or name.startswith(b"GNU.sparse."):
            raise ValueError("archive metadata changes file size or sparse layout")
        position = end
        record_count += 1
    return record_count


def preflight_archive_stream(stream):
    consumed = 0
    file_count = 0
    file_bytes = 0
    header_count = 0
    metadata_bytes = 0
    metadata_records = 0
    zero_block = bytes(512)
    metadata_types = {
        tarfile.XHDTYPE,
        tarfile.GNUTYPE_LONGNAME,
        tarfile.GNUTYPE_LONGLINK,
    }

    def read_exact(length):
        nonlocal consumed
        if consumed + length > MAX_ARCHIVE_DECOMPRESSED_BYTES:
            raise ValueError("archive exceeds the decompressed size limit")
        data = stream.read(length)
        if len(data) != length:
            raise ValueError("truncated archive payload")
        consumed += length
        return data

    while True:
        header = read_exact(512)
        if header == zero_block:
            if read_exact(512) != zero_block:
                raise ValueError("invalid archive end marker")
            while True:
                remaining = MAX_ARCHIVE_DECOMPRESSED_BYTES - consumed
                trailing = stream.read(min(1024 * 1024, remaining + 1))
                if not trailing:
                    return
                consumed += len(trailing)
                if consumed > MAX_ARCHIVE_DECOMPRESSED_BYTES or trailing.strip(b"\0"):
                    raise ValueError("archive contains unexpected trailing data")

        header_count += 1
        if header_count > MAX_ARCHIVE_HEADERS:
            raise ValueError("archive contains too many headers")
        try:
            member = tarfile.TarInfo.frombuf(header, tarfile.ENCODING, "surrogateescape")
        except tarfile.HeaderError as error:
            raise ValueError("invalid archive header") from error
        if member.size < 0:
            raise ValueError("archive header has a negative size")
        if member.type == tarfile.XGLTYPE:
            raise ValueError("global archive metadata is not supported")
        if member.type in metadata_types:
            metadata_bytes += member.size
            if (member.size > MAX_ARCHIVE_METADATA_ENTRY_BYTES
                    or metadata_bytes > MAX_ARCHIVE_METADATA_BYTES):
                raise ValueError("archive metadata exceeds the reviewed size limit")
            payload = read_exact(member.size)
            if member.type == tarfile.XHDTYPE:
                metadata_records += check_pax_metadata(payload)
                if metadata_records > MAX_ARCHIVE_METADATA_RECORDS:
                    raise ValueError("archive metadata has too many records")
            read_exact((-member.size) % 512)
        elif member.isfile():
            file_count += 1
            file_bytes += member.size
            if file_count > MAX_ARCHIVE_FILES or file_bytes > MAX_ARCHIVE_FILE_BYTES:
                raise ValueError("archive file count or size exceeds the reviewed limit")
            remaining = member.size + (-member.size) % 512
            while remaining:
                length = min(remaining, 1024 * 1024)
                read_exact(length)
                remaining -= length
        else:
            raise ValueError("unsafe archive member type")


@contextmanager
def open_checked_archive(path, expected_sha256):
    with path.open("rb") as source:
        if source.seek(0, 2) > MAX_ARCHIVE_COMPRESSED_BYTES:
            raise ValueError("archive exceeds the compressed size limit")
        source.seek(0)
        if digest_stream(source) != expected_sha256:
            raise ValueError("trusted archive checksum mismatch")
        source.seek(0)
        with gzip.GzipFile(fileobj=source, mode="rb") as decompressed:
            preflight_archive_stream(decompressed)
        source.seek(0)
        with tarfile.open(fileobj=source, mode="r:gz") as archive:
            yield archive


def permitted(name):
    parts = PurePosixPath(name).parts
    if not parts or PurePosixPath(name).as_posix() != name or name.startswith("/"):
        return False
    top = parts[0]
    allowed = top in ("package.json", "package-lock.json", ".zilch-release-prepared.json", MANIFEST) and len(parts) == 1
    allowed |= top == "back-end" and (len(parts) == 1 or parts[1] in ("dist", "node_modules", "package.json", "package-lock.json"))
    allowed |= top == "front-end" and (len(parts) == 1 or parts[1] == "package.json" or parts[1] == ".output" and (len(parts) == 2 or parts[2] == "public"))
    return allowed and all(
        part not in (".", "..", ".git", ".ai-work", ".npmrc", "credentials.json")
        and not part.startswith(".env")
        and not part.endswith((".pem", ".key", ".sqlite3", ".sqlite3-wal", ".sqlite3-shm"))
        for part in parts
    )


def required_file_mode(name):
    return 0o600 if name == PRIVATE_MARKER else 0o644


def normalize_permissions(root):
    """Make a root-extracted tree readable by the service and Nginx accounts."""
    root.chmod(0o755)
    for path in sorted(root.rglob("*")):
        name = path.relative_to(root).as_posix()
        if path.is_symlink() or not permitted(name):
            raise ValueError(f"forbidden artifact path: {name}")
        if path.is_dir():
            path.chmod(0o755)
        elif path.is_file():
            path.chmod(required_file_mode(name))
        else:
            raise ValueError(f"not a regular file: {name}")


def validate_permissions(root):
    if stat.S_IMODE(root.stat().st_mode) != 0o755:
        raise ValueError("artifact root must be mode 0755")
    for path in sorted(root.rglob("*")):
        name = path.relative_to(root).as_posix()
        if path.is_symlink():
            raise ValueError(f"forbidden artifact path: {name}")
        mode = stat.S_IMODE(path.stat().st_mode)
        if path.is_dir() and mode != 0o755:
            raise ValueError(f"artifact directory must be mode 0755: {name}")
        if path.is_file() and mode != required_file_mode(name):
            raise ValueError(f"artifact file has an unsafe runtime mode: {name}")


def inventory(root, include_modes=True):
    files = {}
    for path in sorted(root.rglob("*")):
        name = path.relative_to(root).as_posix()
        if path.is_symlink() or not permitted(name):
            raise ValueError(f"forbidden artifact path: {name}")
        if path.is_dir():
            continue
        if not path.is_file():
            raise ValueError(f"not a regular file: {name}")
        if name != MANIFEST:
            files[name] = {"sha256": digest(path), "size": path.stat().st_size}
            if include_modes:
                files[name]["mode"] = stat.S_IMODE(path.stat().st_mode)
    return files


def runtime_dependencies(root, contract):
    lock = json.loads((root / "back-end/package-lock.json").read_text())
    # Direct runtime uses the independent backend lock, never the development workspace graph.
    pending = list(contract["dependencyRoots"])
    visited = set()
    while pending:
        directory = pending.pop()
        if directory in visited:
            continue
        visited.add(directory)
        package_path = root / directory / "package.json"
        current = json.loads(package_path.read_text())
        pinned = lock["packages"].get(directory.removeprefix("back-end").lstrip("/"))
        if not pinned or pinned.get("version") != current.get("version") or pinned.get("dev"):
            raise ValueError(f"runtime dependency version or provenance mismatch: {directory}")
        dependencies = {**current.get("dependencies", {}), **current.get("optionalDependencies", {}), **current.get("peerDependencies", {})}
        optional = set(current.get("optionalDependencies", {})) | {name for name, value in current.get("peerDependenciesMeta", {}).items() if value.get("optional")}
        for name in dependencies:
            ancestor = PurePosixPath(directory)
            candidates = []
            while True:
                if ancestor.name != "node_modules":
                    candidates.append((ancestor / "node_modules" / name).as_posix())
                if ancestor == PurePosixPath("."):
                    break
                ancestor = ancestor.parent
            found = next((candidate for candidate in candidates if (root / candidate / "package.json").is_file()), None)
            if found:
                pending.append(found)
            elif name not in optional:
                raise ValueError(f"production dependency missing: {directory} -> {name}")
    return visited


def validate(root, manifest, allow_format1_rollback=False, contract_path=CONTRACT):
    contract = json.loads(contract_path.read_text())
    format_version = manifest.get("format")
    accepted_formats = (1, 2) if allow_format1_rollback else (2,)
    if format_version not in accepted_formats or manifest.get("contract") != contract:
        raise ValueError("artifact does not match the independently trusted runtime contract")
    if not re.fullmatch(r"[0-9a-f]{40}", manifest.get("commit", "")):
        raise ValueError("an exact source commit is required")
    if format_version == 2:
        validate_permissions(root)
    actual = inventory(root, include_modes=format_version == 2)
    if actual != manifest.get("files"):
        raise ValueError("artifact paths, hashes, sizes or modes do not match")
    for name in contract["required"]:
        if name not in actual:
            raise ValueError(f"required runtime path missing: {name}")
    package = json.loads((root / "package.json").read_text())
    lock = json.loads((root / "back-end/package-lock.json").read_text())
    workspace_lock = json.loads((root / "package-lock.json").read_text())
    backend = json.loads((root / "back-end/package.json").read_text())
    frontend = json.loads((root / "front-end/package.json").read_text())
    if len({package["version"], lock["version"], workspace_lock["version"], backend["version"], frontend["version"]}) != 1:
        raise ValueError("manifest and lock disagree")
    metadata = json.loads((root / "front-end/.output/public/release.json").read_text())
    marker = json.loads((root / ".zilch-release-prepared.json").read_text())
    expected_keys = {"repository", "release", "commitSha", "builtAt"}
    if (not isinstance(metadata, dict) or set(metadata) != expected_keys
            or metadata.get("repository") != "anderson-webops/zilch.jacobdanderson.net"
            or not isinstance(metadata.get("builtAt"), str)
            or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z", metadata["builtAt"])):
        raise ValueError("invalid deployment identity")
    try:
        parsed = datetime.datetime.fromisoformat(metadata["builtAt"].replace("Z", "+00:00"))
        if parsed.tzinfo is None or parsed.utcoffset() != datetime.timedelta(0):
            raise ValueError
    except ValueError as error:
        raise ValueError("invalid deployment identity timestamp") from error
    if metadata != marker or metadata.get("commitSha") != manifest["commit"] or metadata.get("release") != "v" + package["version"]:
        raise ValueError("static deployment identity mismatch")
    visited = runtime_dependencies(root, contract)
    for name in actual:
        if re.search(r"(?:^|/)node_modules/(?:@[^/]+/)?[^/]+/package\.json$", name):
            directory = str(PurePosixPath(name).parent)
            if directory not in visited:
                raise ValueError(f"unrelated or development dependency in runtime: {directory}")
    for key, spec in lock["packages"].items():
        name = "back-end/" + key
        if spec.get("dev") and (root / name / "package.json").is_file():
            raise ValueError(f"development dependency in runtime: {name}")
    for key in lock["packages"]:
        name = "back-end/" + key
        if "node_modules" in PurePosixPath(name).parts and name not in visited and (root / name / "package.json").is_file():
            raise ValueError(f"unrelated dependency in runtime: {name}")
    for name in ("back-end/node_modules/tsx", "back-end/node_modules/typescript", "back-end/node_modules/vite", "back-end/node_modules/eslint"):
        if (root / name).exists():
            raise ValueError(f"development tool in runtime: {name}")
    for name in actual:
        if name.endswith(".node") or name.endswith(".so"):
            if name not in contract["nativeBindings"]:
                raise ValueError(f"undeclared native binding: {name}")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["pack", "verify", "unpack"])
    parser.add_argument("tree", type=Path)
    parser.add_argument("--archive", type=Path)
    parser.add_argument("--commit")
    parser.add_argument("--sha256")
    parser.add_argument(
        "--contract",
        type=Path,
        help="verify against a protected version-specific runtime contract",
    )
    parser.add_argument(
        "--allow-format-1-rollback",
        action="store_true",
        help="accept one retained format-1 tree only during rollback verification",
    )
    args = parser.parse_args()
    if args.allow_format_1_rollback and (
            args.operation != "verify" or args.archive or args.sha256):
        parser.error("--allow-format-1-rollback is only valid for direct verify without archive inputs")
    if args.contract and args.operation != "verify":
        parser.error("--contract is only valid for verification")
    contract_path = args.contract.resolve(strict=True) if args.contract else CONTRACT
    root = args.tree.resolve(strict=True)
    if args.operation == "unpack":
        if not args.archive or not args.sha256 or not args.commit:
            parser.error("unpack requires --archive, --sha256 and --commit from the trusted release record")
        if any(root.iterdir()):
            raise ValueError("destination is not empty")
        with open_checked_archive(args.archive, args.sha256) as archive:
            members = archive.getmembers()
            names = [member.name for member in members]
            if (len(names) != len(set(names)) or len(names) > MAX_ARCHIVE_FILES
                    or sum(member.size for member in members) > MAX_ARCHIVE_FILE_BYTES
                    or any(not member.isfile() or not permitted(member.name) for member in members)):
                raise ValueError("unsafe archive members")
            for member in members:
                target = root / member.name
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source, target.open("xb") as output:
                    while chunk := source.read(1024 * 1024):
                        output.write(chunk)
                target.chmod(required_file_mode(member.name))
        # Root commonly invokes unpack with umask 0077. Normalize every parent
        # explicitly so the distinct service UID can load Node modules and the
        # Nginx worker can read static files. The private marker stays root-only.
        normalize_permissions(root)
        with (root / MANIFEST).open("rb") as stream:
            manifest = validate(root, read_manifest(stream))
        if manifest["commit"] != args.commit:
            raise ValueError("artifact source identity mismatch")
        print(json.dumps({"unpacked": True, "commit": manifest["commit"], "files": len(manifest["files"])}))
    elif args.operation == "pack":
        if platform.system() != "Linux" or platform.machine() != "aarch64":
            raise ValueError("Build production artifacts on Linux ARM64")
        if not args.archive or not args.commit:
            parser.error("pack requires --archive and --commit")
        if args.archive.exists():
            raise ValueError("Never overwrite an existing artifact")
        normalize_permissions(root)
        manifest = {"format": 2, "commit": args.commit,
                    "contract": json.loads(CONTRACT.read_text()), "files": inventory(root)}
        manifest_path = root / MANIFEST
        manifest_payload = json.dumps(manifest, indent=2) + "\n"
        if len(manifest_payload.encode()) > MAX_RUNTIME_MANIFEST_BYTES:
            raise ValueError("runtime manifest exceeds the reviewed size limit")
        manifest_path.write_text(manifest_payload)
        # The manifest is created after the rest of the tree is normalized.
        # Normalize and validate it explicitly so restrictive caller umasks do
        # not produce an archive that Nginx or the service cannot inspect.
        manifest_path.chmod(required_file_mode(MANIFEST))
        validate(root, manifest)
        try:
            with tarfile.open(args.archive, "w:gz") as archive:
                for name in sorted([MANIFEST, *manifest["files"]]):
                    archive.add(root / name, arcname=name, recursive=False)
            with open_checked_archive(args.archive, digest(args.archive)):
                pass
        except Exception:
            args.archive.unlink(missing_ok=True)
            raise
        print(json.dumps({"archive": args.archive.name, "sha256": digest(args.archive),
                          "commit": args.commit, "files": len(manifest["files"])}))
    else:
        with (root / MANIFEST).open("rb") as stream:
            declared = read_manifest(stream)
        if args.archive or args.sha256:
            if not args.archive or not args.sha256:
                raise ValueError("trusted archive checksum is required")
            with open_checked_archive(args.archive, args.sha256) as archive:
                source = archive.extractfile(MANIFEST)
                if source is None:
                    raise ValueError("trusted archive lacks the runtime manifest")
                with source:
                    trusted = read_manifest(source)
            if declared != trusted:
                raise ValueError("staged manifest differs from trusted archive")
        manifest = validate(
            root,
            declared,
            allow_format1_rollback=args.allow_format_1_rollback,
            contract_path=contract_path,
        )
        if args.commit and manifest["commit"] != args.commit:
            raise ValueError("artifact source identity mismatch")
        print(json.dumps({"verified": True, "commit": manifest["commit"], "files": len(manifest["files"])}))


if __name__ == "__main__":
    main()
