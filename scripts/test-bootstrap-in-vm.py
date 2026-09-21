"""Administrative installer regression. Run only in the explicitly staged disposable VM."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import shutil
import socket
import stat
import subprocess
import sys
import tarfile
import time
import urllib.request

assert os.geteuid() == 0 and sys.argv[1:] == ["--disposable-vm"]
marker = Path('/run/zilch-source-validation-vm')
assert marker.is_file() and marker.read_text() == 'isolated-public-source-fixture\n'
assert marker.stat().st_uid == 0
assert not Path('/srv/zilch.jacobdanderson.net').exists(), 'Use a fresh disposable VM, never an installed host'
os.umask(0o077)
source = Path(__file__).resolve().parent.parent
control = Path('/root/zilch-admin-fixture')
control.mkdir(mode=0o700)
for name in ['deploy', 'scripts']:
    shutil.copytree(source / name, control / name)
shutil.copyfile(source / 'package.json', control / 'package.json')
installer = control / 'deploy/systemd/install-service.sh'
env = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'NODE_BIN_DIR': '/opt/node-24.18.1/bin'}

def run():
    return subprocess.run(['bash', str(installer)], env=env, text=True, capture_output=True, timeout=20)

result = run()
assert result.returncode == 0, result.stdout + result.stderr
version = json.loads((control / 'package.json').read_text())['version']
helper = Path('/usr/local/libexec/zilch-release') / version
assert (helper / 'deploy/systemd/promote-release.sh').is_file()
current_nginx = helper / 'deploy/nginx/zilch.jacobdanderson.net.server.conf'
assert current_nginx.read_bytes() == (source / 'deploy/nginx/zilch.jacobdanderson.net.server.conf').read_bytes()
assert hashlib.sha256(current_nginx.read_bytes()).hexdigest() == 'ed28fb3dc980ba2fd2f48464abed50f6228bcc3f578412f8697c03fdb358ba26'
legacy_nginx = helper / 'deploy/nginx/zilch.jacobdanderson.net.legacy-v1.4.1.server.conf'
assert legacy_nginx.read_bytes() == (source / 'deploy/nginx/zilch.jacobdanderson.net.legacy-v1.4.1.server.conf').read_bytes()
assert hashlib.sha256(legacy_nginx.read_bytes()).hexdigest() == 'afd6eb84e6f35fa55b4cdc872bd4b7e759ec9b5ca1bb727c70ffba3a337adce4'
assert helper.stat().st_uid == 0 and not helper.stat().st_mode & 0o022
unit = Path('/etc/systemd/system/zilch-api.service')
original_unit = unit.read_bytes()
assert subprocess.run(['systemctl', 'is-active', '--quiet', 'zilch-api.service']).returncode != 0
base = Path('/srv/zilch.jacobdanderson.net')
service_uid = int(subprocess.check_output(['id', '-u', 'zilch-site']))
service_gid = int(subprocess.check_output(['id', '-g', 'zilch-site']))
shared = base / 'shared'
cache = shared / 'npm-cache'
assert shared.stat().st_uid == 0 and shared.stat().st_gid == service_gid
assert stat.S_IMODE(shared.stat().st_mode) == 0o750
assert cache.stat().st_uid == service_uid and cache.stat().st_gid == service_gid
assert stat.S_IMODE(cache.stat().st_mode) == 0o700

# Exercise the exact root extractor with distinct service and Nginx worker UIDs.
# The root-owned private marker is administrative evidence, not a runtime input.
artifact_path = helper / 'scripts/runtime-artifact.py'
artifact_spec = importlib.util.spec_from_file_location('zilch_artifact', artifact_path)
artifact = importlib.util.module_from_spec(artifact_spec)
artifact_spec.loader.exec_module(artifact)
artifact_source = Path('/root/zilch-artifact-source')
artifact_source.mkdir(mode=0o700)
contract = json.loads((helper / 'deploy/runtime-artifact.json').read_text())
for name in contract['required'] + [value.replace('*', 'fixture') for value in contract.get('requiredPatterns', [])]:
    path = artifact_source / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('synthetic runtime file\n')
release_commit = 'a' * 40
release_metadata = {
    'repository': 'anderson-webops/zilch.jacobdanderson.net',
    'release': f'v{version}',
    'commitSha': release_commit,
    'builtAt': '2026-09-21T00:00:00Z',
}
root_package = {'name': 'zilch-browser-game', 'version': version}
backend_package = {'name': 'zilch-back-end', 'version': version, 'type': 'module', 'dependencies': {}}
frontend_package = {'name': 'zilch-front-end', 'version': version}
(artifact_source / 'package.json').write_text(json.dumps(root_package))
(artifact_source / 'front-end/package.json').write_text(json.dumps(frontend_package))
(artifact_source / 'back-end/package.json').write_text(json.dumps(backend_package))
(artifact_source / 'package-lock.json').write_text(json.dumps({'version': version, 'packages': {'': root_package}}))
(artifact_source / 'back-end/package-lock.json').write_text(json.dumps({'version': version, 'packages': {'': backend_package}}))
(artifact_source / '.zilch-release-prepared.json').write_text(json.dumps(release_metadata))
(artifact_source / 'front-end/.output/public/release.json').write_text(json.dumps(release_metadata))
(artifact_source / 'front-end/.output/public/index.html').write_text('<!doctype html><title>Zilch fixture</title>\n')
(artifact_source / 'back-end/dist/server.js').write_text('''
import http from 'node:http'
const host = process.env.HOST
const port = Number(process.env.PORT)
const server = http.createServer((request, response) => {
  if (request.url === '/healthz' || request.url === '/readyz' || request.url === '/api/health') {
    response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' })
    response.end('{"ok":true}')
    return
  }
  response.writeHead(404).end()
})
server.listen(port, host)
process.on('SIGTERM', () => server.close(() => process.exit(0)))
''')
artifact.normalize_permissions(artifact_source)
manifest = {'format': 2, 'commit': release_commit, 'contract': contract, 'files': artifact.inventory(artifact_source)}
manifest_path = artifact_source / artifact.MANIFEST
manifest_path.write_text(json.dumps(manifest))
manifest_path.chmod(0o644)
artifact.validate(artifact_source, manifest)
assert stat.S_IMODE(manifest_path.stat().st_mode) == 0o644
artifact_archive = Path('/root/zilch-root-extractor-fixture.tar.gz')
with tarfile.open(artifact_archive, 'w:gz') as archive:
    for path in sorted(artifact_source.rglob('*')):
        if path.is_file():
            archive.add(path, arcname=path.relative_to(artifact_source).as_posix(), recursive=False)
artifact_digest = hashlib.sha256(artifact_archive.read_bytes()).hexdigest()
extracted = base / 'releases/root-extractor-fixture'
extracted.mkdir(mode=0o700)
result = subprocess.run([
    '/usr/bin/python3', '-I', str(artifact_path), 'unpack', str(extracted),
    '--archive', str(artifact_archive), '--sha256', artifact_digest, '--commit', release_commit,
], text=True, capture_output=True, timeout=20)
assert result.returncode == 0, result.stdout + result.stderr
private_marker = extracted / '.zilch-release-prepared.json'
public_index = extracted / 'front-end/.output/public/index.html'
assert stat.S_IMODE(extracted.stat().st_mode) == 0o755
assert stat.S_IMODE(private_marker.stat().st_mode) == 0o600 and private_marker.stat().st_uid == 0
assert stat.S_IMODE(public_index.stat().st_mode) == 0o644
assert subprocess.run(['runuser', '-u', 'zilch-site', '--', 'test', '-r', str(extracted / 'back-end/dist/server.js')]).returncode == 0
assert subprocess.run(['runuser', '-u', 'zilch-site', '--', 'test', '!', '-r', str(private_marker)]).returncode == 0
nginx_uid = int(subprocess.check_output(['id', '-u', 'www-data']))
assert nginx_uid not in (0, service_uid)
assert subprocess.run(['runuser', '-u', 'www-data', '--', 'test', '-r', str(public_index)]).returncode == 0
with socket.socket() as reservation:
    reservation.bind(('127.0.0.1', 0))
    acceptance_port = reservation.getsockname()[1]
runtime = subprocess.Popen([
    'runuser', '-u', 'zilch-site', '--', 'env', 'HOST=127.0.0.1', f'PORT={acceptance_port}',
    'NODE_ENV=production', '/opt/node-24.18.1/bin/node', 'back-end/dist/server.js',
], cwd=extracted, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
try:
    deadline = time.monotonic() + 10
    while True:
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{acceptance_port}/healthz', timeout=1) as response:
                assert response.status == 200 and response.read() == b'{"ok":true}'
            with urllib.request.urlopen(f'http://127.0.0.1:{acceptance_port}/readyz', timeout=1) as response:
                assert response.status == 200 and response.read() == b'{"ok":true}'
            break
        except OSError:
            if runtime.poll() is not None or time.monotonic() >= deadline:
                stdout, stderr = runtime.communicate(timeout=1)
                raise AssertionError(stdout + stderr)
            time.sleep(0.1)
finally:
    if runtime.poll() is None:
        os.killpg(runtime.pid, signal.SIGTERM)
        runtime.wait(timeout=5)
for path in [base / 'current', base / 'releases/unauthorized']:
    denied = subprocess.run(['runuser', '-u', 'zilch-site', '--', 'touch', str(path)], capture_output=True)
    assert denied.returncode != 0, 'Build account changed administrative state'
assert run().returncode != 0, 'Existing helper version was overwritten'
assert unit.read_bytes() == original_unit

# Existing directory metadata is a host contract, not something this installer
# silently normalizes. A new helper must not be installed when review is needed.
package = json.loads((control / 'package.json').read_text())
package['version'] = '999.0.0'
(control / 'package.json').write_text(json.dumps(package))
base.chmod(0o700)
result = run()
assert result.returncode != 0 and 'left unchanged' in result.stderr
assert base.stat().st_mode & 0o777 == 0o700
assert not Path('/usr/local/libexec/zilch-release/999.0.0').exists()
base.chmod(0o755)

# Race the exact service identity against a helper upgrade. Owning the cache
# directory is insufficient to replace its entry when the parent is root-owned.
package['version'] = '999.0.1'
(control / 'package.json').write_text(json.dumps(package))
race = subprocess.Popen([
    'runuser', '-u', 'zilch-site', '--', '/usr/bin/python3', '-c', f'''
import json, pathlib, time
cache = pathlib.Path({str(cache)!r})
end = time.monotonic() + 2
attempts = swaps = 0
while time.monotonic() < end:
    attempts += 1
    try:
        cache.rmdir()
        cache.symlink_to('/root/zilch-cache-race-target')
        swaps += 1
    except OSError:
        pass
print(json.dumps({{"attempts": attempts, "swaps": swaps}}))
'''], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
result = run()
race_stdout, race_stderr = race.communicate(timeout=5)
race_result = json.loads(race_stdout.strip())
assert result.returncode == 0, result.stdout + result.stderr
assert race_result['attempts'] > 0 and race_result['swaps'] == 0, race_stdout + race_stderr
assert cache.is_dir() and not cache.is_symlink()
assert (Path('/usr/local/libexec/zilch-release/999.0.1')).is_dir()

# Model replacement after a privileged existence check. The old cache creation
# pattern follows this symlink; the updated installer must never visit that path.
sink = Path('/root/zilch-cache-fixture')
sink.mkdir(mode=0o755)
cache.rmdir()
cache.symlink_to(sink)
old = subprocess.run(['/usr/bin/install', '-d', '-o', 'zilch-site', '-g', 'zilch-site', '-m', '0700', str(cache)], capture_output=True)
followed = sink.stat().st_uid != 0 or sink.stat().st_mode & 0o777 != 0o755
print(json.dumps({'historicalCachePath': 'followed' if followed else 'rejected', 'exit': old.returncode}), flush=True)
os.chown(sink, 0, 0)
sink.chmod(0o755)
package['version'] = '999.0.2'  # Synthetic helper revision, never a source release.
(control / 'package.json').write_text(json.dumps(package))
result = run()
assert result.returncode != 0
assert sink.stat().st_uid == 0 and sink.stat().st_mode & 0o777 == 0o755
assert not Path('/usr/local/libexec/zilch-release/999.0.2').exists()
assert unit.read_bytes() == original_unit
cache.unlink()
cache.mkdir(mode=0o700)
os.chown(cache, service_uid, service_gid)
# A mutable adjacent service unit fails the trusted bootstrap guard before effects.
package['version'] = '999.0.3'
(control / 'package.json').write_text(json.dumps(package))
(control / 'deploy/systemd/zilch-api.service').chmod(0o666)
assert run().returncode != 0
assert not Path('/usr/local/libexec/zilch-release/999.0.3').exists()
assert unit.read_bytes() == original_unit
print(json.dumps({'administrativeBootstrap': 'passed', 'protectedPointerAndReleaseRoot': True,
                  'immutableHelpers': True, 'existingUnitPreserved': True,
                  'existingDirectoryMetadataPreserved': True,
                  'cacheParentRootOwned': True, 'concurrentCacheSwapBlocked': True,
                  'cacheSymlinkUntouched': True, 'mutableUnitRejected': True,
                  'serviceNeverStarted': True, 'rootArtifactExtraction': True,
                  'separateRuntimeUid': True, 'nginxReadableStaticTree': True,
                  'privateMarkerRootOnly': True,
                  'installerSha256': hashlib.sha256(installer.read_bytes()).hexdigest()}), flush=True)
