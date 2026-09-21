"""Administrative installer regression. Run only in the explicitly staged disposable VM."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys

assert os.geteuid() == 0 and sys.argv[1:] == ["--disposable-vm"]
marker = Path('/run/zilch-source-validation-vm')
assert marker.is_file() and marker.read_text() == 'isolated-public-source-fixture\n'
assert marker.stat().st_uid == 0
assert not Path('/srv/zilch.jacobdanderson.net').exists(), 'Use a fresh disposable VM, never an installed host'
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
                  'serviceNeverStarted': True, 'installerSha256': hashlib.sha256(installer.read_bytes()).hexdigest()}), flush=True)
