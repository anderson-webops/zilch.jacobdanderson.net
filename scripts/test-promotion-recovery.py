"""Run the actual trusted promoter under synthetic root with fake external services."""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tarfile

assert os.geteuid() == 0 and not Path('/srv').exists()
SOURCE = Path('/source')
VERSION = json.loads((SOURCE / 'package.json').read_text())['version']
HISTORY = Path('/history')
HISTORICAL = {
    version: {
        'commit': (HISTORY / f'v{version}.commit').read_text().strip(),
        'contract': HISTORY / f'v{version}.runtime-artifact.json',
        'nginx': HISTORY / f'v{version}.nginx.conf',
    }
    for version in ('1.4.3', '1.4.7')
}
PROMOTION_PROCESS_TIMEOUT = 45
STUB = r'''#!/usr/bin/python3
import json, os, pathlib, signal, sys
root = pathlib.Path(os.environ['FIXTURE_ROOT'])
mode = os.environ['FIXTURE_MODE']
name = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
current = root / 'current'
candidate = current.is_symlink() and current.resolve().name == 'candidate'
with (root/'commands').open('a') as f:f.write(name+' '+' '.join(args)+'\n')
def once(key):
    p=root/key
    if p.exists():return False
    p.touch();return True
if name == 'sleep':sys.exit(0)
if name == 'gh':sys.exit(99)
if name == 'systemctl':
    if args[0] == 'is-active':sys.exit(0 if current.is_symlink() else 3)
    if args[0] == 'is-enabled':sys.exit(0 if (root/'enabled').exists() else 1)
    if args[0] == 'enable':(root/'enabled').touch();sys.exit(0)
    if args[0] == 'disable':(root/'enabled').unlink(missing_ok=True);sys.exit(0)
    if args[0] == 'restart' and candidate and mode == 'interrupt' and once('interrupted'):
        os.kill(os.getppid(),signal.SIGTERM)
    if args[0] == 'restart' and candidate and mode == 'restart-failure' and once('restart-failed'):sys.exit(1)
    if args[0] == 'restart' and not candidate and mode == 'rollback-failure':sys.exit(1)
    sys.exit(0)
if name == 'nginx':
    if '-t' in args and candidate and mode == 'nginx-failure' and once('nginx-failed'):sys.exit(1)
    sys.exit(0)
if name == 'curl':
    if candidate and mode in ['bad-health','artifact-bad-health','rollback-failure','first-failure','legacy-probe-failure']:sys.exit(22)
    if candidate and mode == 'ipv6-failure' and '--ipv6' in args:sys.exit(22)
    url=next(a for a in args if a.startswith(('http://','https://')))
    if mode=='outer-network-restore' and url.startswith('https://zilch.jacobdanderson.net/') and '--resolve' not in args:sys.exit(28)
    nginx_config=root/'nginx/zilch.jacobdanderson.net'
    modern_nginx=nginx_config.is_file() and 'location = /readyz' in nginx_config.read_text()
    modern_probe=url.endswith(('/healthz','/readyz','/api/healthz','/api/readyz'))
    selected_release=json.loads((current/'.zilch-release-prepared.json').read_text())['release'] if current.is_symlink() else ''
    if modern_probe and (selected_release == 'v1.4.1' or ('--resolve' in args and not modern_nginx)):sys.exit(22)
    if mode=='legacy-probe-failure' and not candidate and url.endswith('/api/health') and '--resolve' in args:sys.exit(22)
    if mode in ['alternate-port','custom-probes'] and '127.0.0.1:3018' in url:sys.exit(22)
    if mode=='wrong-service-readiness' and candidate and ':4006/' in url and url.endswith('/readyz'):sys.exit(22)
    output=pathlib.Path(args[args.index('--output')+1])
    header=pathlib.Path(args[args.index('--dump-header')+1]) if '--dump-header' in args else None
    if '--write-out' in args:
        print('301' if url.startswith('http://') else '404',end='')
        if header and url.startswith('http://'):header.write_text('Location: https://zilch.jacobdanderson.net/\n')
        sys.exit(0)
    if url.endswith('/release.json') and candidate and mode=='empty-public-identity':
        output.write_text('{}')
    elif url.endswith('/release.json'):
        output.write_bytes((current/'front-end/.output/public/release.json').read_bytes())
    elif url.endswith(('/api/health','/healthz','/readyz','/status','/dependencies-ready')):
        output.write_text('{"ok":true}')
        if header:header.write_text('Cache-Control: no-store\n')
    else:
        output.write_text('Synthetic Zilch page')
        if header:header.write_text("Content-Security-Policy: frame-ancestors 'none'\nX-Content-Type-Options: nosniff\nX-Frame-Options: DENY\n")
    with (root/'probes').open('a') as f:f.write(' '.join(args)+'\n')
    sys.exit(0)
raise SystemExit('Unexpected fixture command')
'''


def install_artifact_helper(helper_parent, version, contract_source, nginx_source):
    helper = helper_parent/version
    (helper/'deploy/nginx').mkdir(parents=True)
    shutil.copy2(contract_source, helper/'deploy/runtime-artifact.json')
    shutil.copy2(nginx_source, helper/'deploy/nginx/zilch.jacobdanderson.net.server.conf')
    for path in [helper_parent, helper, helper/'deploy', helper/'deploy/nginx']:
        path.chmod(0o755)
    for path in [helper/'deploy/runtime-artifact.json', helper/'deploy/nginx/zilch.jacobdanderson.net.server.conf']:
        path.chmod(0o644)


def build_release(artifact, target, version, commit, contract_path, manifest_format, built_at):
    target.mkdir(parents=True)
    contract=json.loads(contract_path.read_text())
    required=contract['required']+[p.replace('*','fixture') for p in contract.get('requiredPatterns',[])]
    for name in required:
        path=target/name
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text('Synthetic runtime file\n')
    package={'version':version}
    backend={**package,'type':'module','dependencies':{'express':'5.2.1'}}
    express=target/'back-end/node_modules/express/package.json'
    express.parent.mkdir(parents=True)
    express.write_text(json.dumps({'version':'5.2.1'}))
    values=[
        ('package.json',package),
        ('front-end/package.json',package),
        ('back-end/package.json',backend),
        ('package-lock.json',{'version':version,'packages':{'':package,'back-end':backend}}),
        ('back-end/package-lock.json',{'version':version,'packages':{'':backend,'node_modules/express':{'version':'5.2.1'}}}),
    ]
    for name,value in values:
        (target/name).write_text(json.dumps(value))
    metadata={
        'repository':'anderson-webops/zilch.jacobdanderson.net',
        'release':f'v{version}',
        'commitSha':commit,
        'builtAt':built_at,
    }
    for name in ['.zilch-release-prepared.json','front-end/.output/public/release.json']:
        (target/name).write_text(json.dumps(metadata))
    # Application code is data to the privileged promoter and must never run as root.
    (target/'back-end/dist/app.js').write_text(
        "import { writeFileSync } from 'node:fs'; writeFileSync('/fixture/ROOT_CODE_EXECUTED','bad')")
    artifact.normalize_permissions(target)
    if manifest_format is not None:
        manifest={
            'format':manifest_format,
            'commit':commit,
            'contract':contract,
            'files':artifact.inventory(target,include_modes=manifest_format == 2),
        }
        manifest_path=target/artifact.MANIFEST
        manifest_path.write_text(json.dumps(manifest))
        manifest_path.chmod(0o644)
        artifact.validate(
            target,
            manifest,
            allow_format1_rollback=manifest_format == 1,
            contract_path=contract_path,
        )


def setup(root, mode):
    root.mkdir(parents=True, mode=0o755)
    root.chmod(0o755)
    control=root/'control'
    for folder in ['scripts','deploy']:
        shutil.copytree(SOURCE/folder,control/folder)
    spec=importlib.util.spec_from_file_location('artifact',control/'scripts/runtime-artifact.py')
    artifact=importlib.util.module_from_spec(spec);spec.loader.exec_module(artifact)
    (control/'package.json').write_text(json.dumps({'version': VERSION}))
    helper_parent=root/'helpers'
    helper_parent.mkdir(mode=0o755)
    historical_previous=mode in {'artifact-bad-health','outer-network-restore','mutable-previous-helper'}
    candidate_version='1.4.7' if mode == 'outer-network-restore' else VERSION
    candidate_commit=HISTORICAL['1.4.7']['commit'] if mode == 'outer-network-restore' else 'a'*40
    if candidate_version in HISTORICAL:
        candidate_contract=HISTORICAL[candidate_version]['contract']
        candidate_nginx=HISTORICAL[candidate_version]['nginx']
    else:
        candidate_contract=control/'deploy/runtime-artifact.json'
        candidate_nginx=control/'deploy/nginx/zilch.jacobdanderson.net.server.conf'
    install_artifact_helper(helper_parent,candidate_version,candidate_contract,candidate_nginx)
    candidate=root/'releases/candidate'
    build_release(
        artifact,candidate,candidate_version,candidate_commit,candidate_contract,2,
        '2026-09-21T00:00:00Z')
    archive=root/'approved.tar.gz'
    with tarfile.open(archive,'w:gz') as out:
        for path in sorted(candidate.rglob('*')):
            if path.is_file():
                out.add(path,arcname=path.relative_to(candidate).as_posix(),recursive=False)
    digest=hashlib.sha256(archive.read_bytes()).hexdigest()
    previous=root/'releases/previous'
    if historical_previous:
        previous_version='1.4.3'
        previous_commit=HISTORICAL[previous_version]['commit']
        previous_contract=HISTORICAL[previous_version]['contract']
        install_artifact_helper(
            helper_parent,previous_version,previous_contract,HISTORICAL[previous_version]['nginx'])
        build_release(
            artifact,previous,previous_version,previous_commit,previous_contract,1,
            '2026-09-20T00:00:00Z')
        installed_nginx=HISTORICAL[previous_version]['nginx']
    else:
        build_release(
            artifact,previous,'1.4.1','fc43e474c0c402fdea39828e02a59cab9aa60661',
            control/'deploy/runtime-artifact.json',None,'2026-09-20T00:00:00Z')
        installed_nginx=control/'deploy/nginx/zilch.jacobdanderson.net.legacy-v1.4.1.server.conf'
    (root/'current').symlink_to(previous)
    recovery=root/'.deployment-recovery';recovery.mkdir(mode=0o700)
    nginx_config=root/'nginx/zilch.jacobdanderson.net'
    nginx_config.parent.mkdir(mode=0o755)
    shutil.copy2(installed_nginx,nginx_config)
    nginx_config.chmod(0o644)
    return control,helper_parent,candidate,previous,archive,digest,recovery,nginx_config,candidate_commit


Path('/fixture/runtime').mkdir(parents=True)
shutil.copy2('/runtime/node', '/fixture/runtime/node')
Path('/usr/local/bin').mkdir(parents=True)
for name in ['curl','systemctl','nginx','sleep','gh']:
    p=Path('/usr/local/bin')/name;p.write_text(STUB);p.chmod(0o755)
modes=['success','bad-health','ipv6-failure','interrupt','restart-failure','nginx-failure','rollback-failure',
       'legacy-probe-failure','artifact-bad-health','outer-network-restore',
       'umask-027-success','umask-077-success',
       'lock-contention','invalid-current','tampered-artifact','mutable-helper','mutable-parent','mutable-candidate',
       'symlink-module','wrong-digest','first-success','first-failure','mutable-archive','mutable-contract',
       'mutable-target-helper','missing-target-helper','mutable-previous-helper',
       'mutable-previous','previous-is-parent','unsupported-legacy','empty-public-identity',
       'ambiguous-runtime-promoter','ambiguous-runtime-installer','alternate-port','wrong-service-readiness',
       'mismatched-readiness-origin','custom-probes']
if len(sys.argv) > 1 and sys.argv[1] != 'all':
    assert sys.argv[1] in modes, 'Unknown isolated regression case'
    modes = [sys.argv[1]]
for mode in modes:
    root=Path('/fixture')/mode
    previous_umask=os.umask(0o077 if mode in {'umask-077-success','outer-network-restore'} else 0o027)
    try:
        control,helper_parent,candidate,previous,archive,digest,recovery,nginx_config,candidate_commit=setup(root,mode)
    finally:
        os.umask(previous_umask)
    if mode.startswith('first-'):(root/'current').unlink()
    if mode=='invalid-current':(root/'current').unlink();(root/'current').mkdir()
    if mode=='tampered-artifact':(candidate/'back-end/dist/server.js').write_text('tampered')
    if mode=='mutable-helper':(control/'deploy/systemd/promote-release.sh').chmod(0o777)
    if mode=='mutable-parent':root.chmod(0o777)
    if mode=='mutable-candidate':(candidate/'back-end/dist/server.js').chmod(0o666)
    if mode=='symlink-module':
        p=candidate/'back-end/dist/server.js';p.unlink();p.symlink_to('/etc/passwd')
    if mode=='wrong-digest':digest='0'*64
    if mode=='mutable-archive':archive.chmod(0o666)
    if mode=='mutable-contract':(control/'deploy/runtime-artifact.json').chmod(0o666)
    candidate_version=json.loads((candidate/'.zilch-release-prepared.json').read_text())['release'].removeprefix('v')
    if mode=='mutable-target-helper':(helper_parent/candidate_version/'deploy/runtime-artifact.json').chmod(0o666)
    if mode=='missing-target-helper':(helper_parent/candidate_version).rename(root/'unavailable-target-helper')
    if mode=='mutable-previous-helper':(helper_parent/'1.4.3/deploy/nginx/zilch.jacobdanderson.net.server.conf').chmod(0o666)
    if mode=='mutable-previous':(previous/'back-end/dist/app.js').chmod(0o666)
    if mode=='previous-is-parent':
        (root/'current').unlink();(root/'current').symlink_to(root/'releases')
        shutil.copyfile(previous/'.zilch-release-prepared.json',root/'releases/.zilch-release-prepared.json')
        previous=root/'releases'
    if mode=='unsupported-legacy':
        unsupported=json.loads((previous/'.zilch-release-prepared.json').read_text())
        unsupported.update(release='v1.4.0',commitSha='b'*40)
        for name in ['.zilch-release-prepared.json','front-end/.output/public/release.json']:
            (previous/name).write_text(json.dumps(unsupported))
    held=None
    if mode=='lock-contention':
        held=(recovery/'promotion.lock').open('w');fcntl.flock(held,fcntl.LOCK_EX|fcntl.LOCK_NB)
    env={**os.environ,'NODE_BIN_DIR':'/fixture/runtime','PUBLIC_HOST':'zilch.jacobdanderson.net',
         'RELEASE_ROOT':str(root/'releases'),'ARCHIVE_ROOT':str(root),
         'CURRENT_LINK':str(root/'current'),
         'HELPER_PARENT':str(helper_parent),
         'NGINX_SERVER_CONFIG':str(nginx_config),
         'FIXTURE_ROOT':str(root),'FIXTURE_MODE':mode,
         'ZILCH_ISOLATED_TEST_MODE':'1'}
    command=['bash',str(control/'deploy/systemd/promote-release.sh'),str(candidate),str(archive),digest,candidate_commit]
    sentinel=root/'UNTRUSTED_RUNTIME_EXECUTED'
    if mode.startswith('ambiguous-runtime-'):
        (root/'protected/bin').mkdir(parents=True)
        shutil.copy2('/runtime/node',root/'protected/bin/node')
        (root/'build/subdir').mkdir(parents=True)
        (root/'build/bin').mkdir()
        (root/'protected/link').symlink_to(root/'build/subdir')
        unsafe=root/'build/bin/node'
        unsafe.write_text('#!/bin/sh\ntouch "'+str(sentinel)+'"\nprintf "v24.18.1\\n"\n')
        unsafe.chmod(0o755)
        (root/'build').chmod(0o777)
        env['NODE_BIN_DIR']=str(root/'protected/link')+'/../bin'
        if mode.endswith('-installer'):command=['bash',str(control/'deploy/systemd/install-service.sh')]
    if mode in ['alternate-port','wrong-service-readiness','mismatched-readiness-origin','custom-probes']:
        env['HEALTH_URL']='http://127.0.0.1:4006/api/health'
    if mode=='mismatched-readiness-origin':env['READINESS_URL']='http://127.0.0.1:3018/readyz'
    if mode=='custom-probes':
        env['HEALTH_URL']='http://127.0.0.1:4006/status'
        env['READINESS_URL']='http://127.0.0.1:4006/dependencies-ready'
    if mode=='bad-health':
        env['HEALTH_URL']='http://127.0.0.1:3018/status'
        env['READINESS_URL']='http://127.0.0.1:3018/dependencies-ready'
    try:
        result=subprocess.run(command,
                              env=env,capture_output=True,text=True,
                              timeout=PROMOTION_PROCESS_TIMEOUT)
    finally:
        if held:held.close()
    evidence=result.stdout+result.stderr
    success=mode in [
        'success','first-success','alternate-port','custom-probes',
        'umask-027-success','umask-077-success','outer-network-restore',
    ]
    assert not sentinel.exists(),(mode,'untrusted runtime executed as root')
    assert (result.returncode==0)==success,(mode,evidence)
    if mode=='outer-network-restore':
        assert 'Promoted' in evidence and (root/'current').resolve()==candidate,evidence
        assert json.loads((previous/'.zilch-release-prepared.json').read_text())['release']=='v1.4.3'
        assert json.loads((candidate/'.zilch-release-prepared.json').read_text())['release']=='v1.4.7'
        github=subprocess.run(['gh','release','view','v1.4.7'],env=env,capture_output=True,text=True)
        assert github.returncode==99,'GitHub-unavailable fixture unexpectedly succeeded'
        external=subprocess.run(
            ['curl','--ipv4','--fail','--max-time','5','https://zilch.jacobdanderson.net/healthz'],
            env=env,capture_output=True,text=True)
        assert external.returncode==28,'outer WAN fixture unexpectedly passed'
        restore=subprocess.run(
            ['bash',str(control/'deploy/systemd/promote-release.sh'),'--restore-retained',str(previous)],
            env=env,capture_output=True,text=True,timeout=PROMOTION_PROCESS_TIMEOUT)
        evidence+=restore.stdout+restore.stderr
        assert restore.returncode==0,evidence
        assert 'protected local evidence' in evidence,evidence
    assert not Path('/fixture/ROOT_CODE_EXECUTED').exists(),(mode,'candidate code executed as root')
    if mode=='first-failure':assert not (root/'current').exists(),evidence
    elif mode!='invalid-current':
        expected=previous if mode=='outer-network-restore' or not success else candidate
        assert (root/'current').resolve()==expected,(mode,evidence)
    records=list(recovery.glob('promotion-????????'))
    if mode in ['rollback-failure','legacy-probe-failure']:
        assert len(records)==1 and 'protected record retained' in evidence,evidence
        assert stat.S_IMODE(records[0].stat().st_mode)==0o600
    else:
        commands_path=root/'commands'
        commands=(commands_path.read_text()[-12000:] if commands_path.exists()
                  else '<no synthetic external commands invoked>')
        assert not records,(mode,evidence[-20000:],'synthetic command tail:\n'+commands)
    if mode=='interrupt':assert result.returncode==143 and (root/'interrupted').exists(),evidence
    if mode=='bad-health':
        probes=(root/'probes').read_text()
        assert '/api/health' in probes and '/healthz' not in probes and '/readyz' not in probes,probes
        legacy=(control/'deploy/nginx/zilch.jacobdanderson.net.legacy-v1.4.1.server.conf').read_bytes()
        assert nginx_config.read_bytes()==legacy,'legacy Nginx configuration was not restored'
        # Prove that the same candidate can move forward again after the
        # compatibility rollback, including the Nginx transition back to the
        # current probe contract.
        retry_env={**env,'FIXTURE_MODE':'success'}
        retry=subprocess.run(command,env=retry_env,capture_output=True,text=True,
                             timeout=PROMOTION_PROCESS_TIMEOUT)
        assert retry.returncode==0,retry.stdout+retry.stderr
        assert (root/'current').resolve()==candidate,'second forward promotion did not activate the candidate'
        current_config=(control/'deploy/nginx/zilch.jacobdanderson.net.server.conf').read_bytes()
        assert nginx_config.read_bytes()==current_config,'second forward promotion did not install current Nginx configuration'
    if mode=='artifact-bad-health':
        probes=(root/'probes').read_text()
        assert '/healthz' in probes and '/readyz' in probes and '/api/health' not in probes,probes
        historical=HISTORICAL['1.4.3']['nginx'].read_bytes()
        assert nginx_config.read_bytes()==historical,'artifact rollback did not restore its versioned Nginx configuration'
    if success:
        probes=(root/'probes').read_text();assert '--ipv4' in probes and '--ipv6' in probes
        assert ('/dependencies-ready' if mode=='custom-probes' else '/readyz') in probes
        if mode in ['alternate-port','custom-probes']:assert '127.0.0.1:3018' not in probes
        expected_nginx=(HISTORICAL['1.4.3']['nginx'] if mode=='outer-network-restore'
                        else control/'deploy/nginx/zilch.jacobdanderson.net.server.conf')
        assert nginx_config.read_bytes()==expected_nginx.read_bytes(),'promotion did not install the selected release Nginx configuration'
    if mode in {'umask-027-success','umask-077-success'}:
        assert stat.S_IMODE((candidate/'runtime-manifest.json').stat().st_mode)==0o644
    print(json.dumps({'promotionRecovery':mode,'result':'passed'}),flush=True)
