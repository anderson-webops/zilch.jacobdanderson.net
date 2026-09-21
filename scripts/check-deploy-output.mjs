#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const paths = {
  apiApp: resolve(projectRoot, 'back-end/dist/app.js'),
  apiServer: resolve(projectRoot, 'back-end/dist/server.js'),
  artifactContract: resolve(projectRoot, 'deploy/runtime-artifact.json'),
  artifactVerifier: resolve(projectRoot, 'scripts/runtime-artifact.py'),
  ciNginxInstaller: resolve(projectRoot, 'scripts/install-ci-nginx.sh'),
  ciWorkflow: resolve(projectRoot, '.github/workflows/ci.yml'),
  directInstall: resolve(projectRoot, 'deploy/systemd/install-service.sh'),
  legacyNginx: resolve(projectRoot, 'deploy/nginx/zilch.jacobdanderson.net.legacy-v1.4.1.server.conf'),
  directNginx: resolve(projectRoot, 'deploy/nginx/zilch.jacobdanderson.net.server.conf'),
  sourceValidator: resolve(projectRoot, 'scripts/validate-tagged-source.sh'),
  directPromote: resolve(projectRoot, 'deploy/systemd/promote-release.sh'),
  directService: resolve(projectRoot, 'deploy/systemd/zilch-api.service'),
  directWorkflow: resolve(projectRoot, '.github/workflows/direct-release.yml'),
  frontendIndex: resolve(projectRoot, 'front-end/.output/public/index.html'),
  frontendTips: resolve(projectRoot, 'front-end/.output/public/tips/index.html'),
  netlifyConfig: resolve(projectRoot, 'netlify.toml'),
  netlifyFunction: resolve(projectRoot, 'netlify/functions/api.ts'),
  promotionRecovery: resolve(projectRoot, 'scripts/test-promotion-recovery.py'),
  runtimePackager: resolve(projectRoot, 'scripts/package-runtime.sh'),
  rootBootstrapTest: resolve(projectRoot, 'scripts/test-bootstrap-in-vm.py'),
  trustedPaths: resolve(projectRoot, 'deploy/systemd/trusted-paths.py'),
}

for (const path of Object.values(paths))
  await access(path)

const values = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([name, path]) => [name, await readFile(path, 'utf8')]),
))

function assert(condition, message) {
  if (!condition)
    throw new Error(message)
}

const {
  apiApp,
  apiServer,
  artifactContract,
  artifactVerifier,
  ciNginxInstaller,
  ciWorkflow,
  directInstall,
  legacyNginx,
  directNginx,
  sourceValidator,
  directPromote,
  directService,
  directWorkflow,
  frontendIndex,
  frontendTips,
  netlifyConfig,
  promotionRecovery,
  runtimePackager,
  rootBootstrapTest,
  trustedPaths,
} = values

const cspMeta = frontendIndex.match(/<meta[^>]+http-equiv=["']content-security-policy["'][^>]*>/i)?.[0] || ''
const csp = cspMeta.match(/content="([^"]*)"/i)?.[1] || cspMeta.match(/content='([^']*)'/i)?.[1] || ''
for (const directive of ['base-uri \'none\'', 'default-src \'none\'', 'connect-src \'self\'', 'object-src \'none\'', 'script-src-attr \'none\'', 'style-src \'self\'', 'script-src \'self\''])
  assert(csp.includes(directive), `Generated CSP must include ${directive}`)
assert(!/https?:|\*/i.test(csp), 'Generated CSP must not authorize wildcard or external HTTP origins')

const executableAssetTags = [...frontendIndex.matchAll(/<(?:script|link)[^>]+(?:src|href)=["']\/_nuxt\/[^"']+["'][^>]*>/gi)]
  .map(match => match[0])
  .filter(tag => /^<script/i.test(tag) || /rel=["']stylesheet["']/i.test(tag))
assert(executableAssetTags.length > 0, 'Generated HTML must reference hashed executable assets')
for (const tag of executableAssetTags)
  assert(/integrity=["']sha384-[a-z0-9+/=]+["']/i.test(tag), 'Every generated script and stylesheet must carry SHA-384 integrity')
assert(!frontendIndex.includes('http://localhost:3006'), 'Generated HTML must not embed the local API origin')
assert(!frontendIndex.includes('/api/pageview'), 'Generated HTML must not reference the removed mutable endpoint')
assert(frontendTips.includes('https://zilch.jacobdanderson.net/tips/'), 'Generated Tips page must preserve its canonical route')
assert(frontendTips.includes('Strategy tips'), 'Generated Tips page must contain the strategy content')

assert(!apiApp.includes('startedAt') && !apiApp.includes('pageview'), 'Compiled API must not expose process timing or page-view state')
assert(!apiApp.includes('sourceMappingURL') && !apiServer.includes('sourceMappingURL'), 'Production API output must not expose source maps')
assert(/new BoundedRateStore\((?:2_048|2048)\)/.test(apiApp), 'Compiled API must use the fixed-capacity rate store')
assert(apiServer.includes('maxConnections = 256'), 'Compiled API must cap admitted backend connections')

assert(/^User=zilch-site$/m.test(directService), 'Direct API service must use its dedicated unprivileged account')
assert(/^Environment=PORT=3018$/m.test(directService), 'Direct API service must use the reviewed Zilch loopback port')
assert(/^Environment=HOST=127\.0\.0\.1$/m.test(directService), 'Direct API service must bind only to loopback')
assert(/^ExecStart=\/opt\/node-24\.18\.1\/bin\/node back-end\/dist\/server\.js$/m.test(directService), 'Direct API service must use isolated Node 24.18.1')
assert(/^Environment=PATH=\/opt\/node-24\.18\.1\/bin:/m.test(directService), 'Direct API service must place the isolated runtime first on PATH')
assert(/^NoNewPrivileges=true$/m.test(directService), 'Direct API service must deny privilege escalation')
assert(/^ProtectSystem=strict$/m.test(directService), 'Direct API service must have a read-only system view')
assert(!/0\.0\.0\.0|docker/i.test(directService), 'Direct API service must not depend on a container listener')

assert((directNginx.match(/proxy_pass http:\/\/127\.0\.0\.1:3018;/g) || []).length >= 3, 'Nginx must proxy API, liveness, and readiness to Zilch port 3018')
assert(/location = \/healthz/.test(directNginx) && /location = \/readyz/.test(directNginx), 'Nginx must route both root probes to the API')
assert(/return 301 https:\/\/zilch\.jacobdanderson\.net\$request_uri;/.test(directNginx), 'Nginx HTTP redirects must use the fixed canonical host')
assert(/X-Forwarded-For \$remote_addr/.test(directNginx), 'Nginx must replace, not append, the forwarded chain')
assert(!/\$proxy_add_x_forwarded_for/.test(directNginx), 'Nginx must not trust a client-supplied forwarded chain')

assert(/npm audit signatures/.test(sourceValidator), 'Tagged source validation must verify package signatures')
assert(/NODE_BIN_DIR:-\/opt\/node-24\.18\.1\/bin/.test(sourceValidator), 'Tagged source validation must default to isolated Node 24.18.1')
assert(/refs\/heads\/main:refs\/remotes\/origin\/main/.test(sourceValidator), 'Tagged source validation must refresh exact origin/main')
assert(/--unset-all http\.https:\/\/github\.com\/\.extraheader/.test(sourceValidator), 'Tagged source validation must remove checkout credentials before dependency scripts run')
assert(/node scripts\/clean\.mjs/.test(sourceValidator), 'Tagged source validation must remove stale generated output')
assert(/Source validation must not build or prepare a production release tree/.test(sourceValidator), 'Tagged source validation must reject production-tree builds')

assert(/\/usr\/local\/libexec\/zilch-release/.test(directInstall), 'Installer must use versioned root-owned helpers')
assert(/\/usr\/local\/sbin\/zilch-promote-release/.test(directInstall), 'Installer must atomically update the stable promotion wrapper')
assert(/legacy-v1\.4\.1\.server\.conf/.test(directInstall), 'Installer must preserve the exact legacy rollback Nginx contract')
assert(/base=\/srv\/zilch\.jacobdanderson\.net/.test(directInstall) && /ensure_directory "\$base\/staging"/.test(directInstall) && /ensure_directory "\$base\/quarantine"/.test(directInstall), 'Installer must preserve Zilch staging and quarantine paths')
assert(/ensure_directory "\$base\/shared" 0 "\$service_gid" 750/.test(directInstall) && /ensure_directory "\$base\/shared\/npm-cache" "\$service_uid" "\$service_gid" 700/.test(directInstall), 'Writable npm cache must stay beneath a root-owned no-swap parent')
assert(/sport = :3018/.test(directInstall), 'Installer must reserve the reviewed Zilch loopback port')
assert(!/sport = :3016/.test(directInstall), 'Installer must not claim the NP Service Request port')

assert(/runtime-artifact\.py" verify/.test(directPromote), 'Promotion must verify the protected candidate against the independent archive')
assert(/--archive "\$archive" --sha256 "\$archive_sha" --commit "\$commit"/.test(directPromote), 'Promotion must bind archive, digest, and exact source commit')
assert(/trusted-paths\.py/.test(directPromote), 'Promotion must reject mutable administrative inputs')
assert(/--ipv4/.test(directPromote) && /--ipv6/.test(directPromote), 'Promotion must gate local IPv4 and IPv6 with real TLS')
assert(/edge_http_redirects/.test(directPromote), 'Promotion must verify canonical HTTP redirects')
assert(/edge_probe_is_minimal/.test(directPromote) && !/-X POST/.test(directPromote), 'Promotion probes must use minimal GET and HEAD checks only')
assert(/restoring the previous direct release/i.test(directPromote), 'Promotion must provide source rollback')
assert(/runtime-manifest\.json/.test(directPromote), 'Promotion must revalidate artifact-era rollback targets')
assert(/--restore-retained/.test(directPromote) && /protected local evidence/.test(directPromote), 'Outer acceptance recovery must use the bounded retained-release path without GitHub')
assert(/artifact_helper_for_target/.test(directPromote) && /--contract/.test(directPromote), 'Artifact rollback must select its protected version-specific helper contract')
assert(/HELPER_PARENT is fixed in production/.test(directPromote), 'Versioned helper overrides must remain isolated-test-only')
assert(/fc43e474c0c402fdea39828e02a59cab9aa60661/.test(directPromote), 'Legacy rollback must be restricted to the exact retained v1.4.1 commit')
assert(/ed28fb3dc980ba2fd2f48464abed50f6228bcc3f578412f8697c03fdb358ba26/.test(directPromote), 'Forward promotion must pin the reviewed current Nginx bytes')
assert(/afd6eb84e6f35fa55b4cdc872bd4b7e759ec9b5ca1bb727c70ffba3a337adce4/.test(directPromote), 'Legacy rollback must pin the exact historical Nginx bytes')
assert(/legacy-v1\.4\.1[\s\S]*\/api\/health/.test(directPromote), 'Legacy rollback must use its actual minimal API health route')
assert(/nginx_server_config=\/etc\/nginx\/sites-available\/zilch\.jacobdanderson\.net/.test(directPromote), 'Production Nginx destination must be fixed to the reviewed Zilch server block')
assert(/ZILCH_ISOLATED_TEST_MODE/.test(directPromote) && /\^\/fixture\//.test(directPromote), 'Nginx destination overrides must be limited to the isolated regression fixture')
assert(/install_nginx_for_target/.test(directPromote) && /current_nginx_config/.test(directPromote) && /legacy_nginx_config/.test(directPromote), 'Forward and rollback activation must atomically install their compatible Nginx contracts')
assert(/location = \/healthz/.test(legacyNginx) && !/location = \/readyz/.test(legacyNginx), 'Legacy Nginx fixture must retain the v1.4.1 probe surface')
assert(/listen 443 ssl;/.test(directNginx) && /listen \[::\]:443 ssl;/.test(directNginx) && /http2 on;/.test(directNginx), 'Current Nginx must use the supported standalone HTTP/2 directive')
assert(!/listen .*http2/.test(directNginx), 'Current Nginx must not use deprecated listen http2 parameters')
assert(/listen 443 ssl http2;/.test(legacyNginx), 'Historical v1.4.1 rollback bytes must remain unchanged')
assert(/second forward promotion/.test(promotionRecovery) && /did not install current Nginx configuration/.test(promotionRecovery), 'Recovery regression must prove rollback and a subsequent forward Nginx transition')
assert(/outer-network-restore/.test(promotionRecovery) && /v1\.4\.3/.test(promotionRecovery) && /v1\.4\.7/.test(promotionRecovery), 'Recovery regression must cover the exact historical outer-acceptance sequence')
assert(/GitHub-unavailable fixture/.test(promotionRecovery) && /--restore-retained/.test(promotionRecovery), 'Recovery must pass from protected local evidence while GitHub is unavailable')

assert(JSON.parse(artifactContract).runtime.arch === 'arm64', 'Artifact contract must target Linux ARM64')
assert(JSON.parse(artifactContract).required.includes('back-end/dist/boundedRateStore.js'), 'Artifact contract must require the security control module')
assert(/trusted release record/.test(artifactVerifier), 'Artifact verifier must require independent archive identity')
assert(/Never overwrite an existing artifact/.test(artifactVerifier), 'Artifact verifier must keep release archives write-once')
assert(/normalize_permissions/.test(artifactVerifier) && /PRIVATE_MARKER/.test(artifactVerifier) && /"format": 2/.test(artifactVerifier), 'Root extraction must normalize public runtime modes while preserving the private marker')
assert(/manifest_path\.chmod\(required_file_mode\(MANIFEST\)\)/.test(artifactVerifier), 'The newly written manifest must be normalized before packaging')
assert(/--allow-format-1-rollback/.test(artifactVerifier) && /only valid for direct verify without archive inputs/.test(artifactVerifier), 'Format 1 must be scoped to explicit retained-tree rollback verification')
assert(/test-unpacked-artifact\.sh/.test(runtimePackager) && /missing-module/.test(runtimePackager), 'Packager must test the exact unpacked artifact and missing-module rejection')
assert(/install -d -m 0755/.test(runtimePackager) && /cp -a/.test(runtimePackager), 'Post-copier acceptance must preserve the reviewed artifact modes under restrictive umasks')
assert(/umask 027/.test(runtimePackager) && /umask-027-success/.test(promotionRecovery) && /umask-077-success/.test(promotionRecovery), 'Packing and recovery fixtures must cover restrictive umasks')
assert(/ubuntu-24\.04-arm/.test(directWorkflow) && /actions\/upload-artifact@/.test(directWorkflow), 'Release workflow must retain the accepted Linux ARM64 artifact')
assert(/test-bootstrap-in-vm\.py --disposable-vm/.test(directWorkflow) && /needs: \[prepare, installer\]/.test(directWorkflow), 'Artifact publication must wait for disposable-host installer acceptance')
assert(/install --yes --no-install-recommends nginx/.test(directWorkflow), 'Disposable-host acceptance must include the Nginx worker identity')
assert(/install-ci-nginx\.sh/.test(directWorkflow) && /install-ci-nginx\.sh/.test(ciWorkflow), 'Exact Nginx syntax checks must use a current signed CI binary')
assert(/573BFD6B3D8FBC641079A6ABABF5BD827BD9BF62/.test(ciNginxInstaller) && /nginx\.org\/packages\/mainline\/ubuntu/.test(ciNginxInstaller), 'CI Nginx must come from the fingerprint-verified official repository')
assert(/promotion-arm64:[\s\S]*fetch-depth: 0/.test(ciWorkflow), 'Historical recovery fixtures require complete local tagged history')
assert(/runuser.*zilch-site/s.test(rootBootstrapTest) && /runuser.*www-data/s.test(rootBootstrapTest) && /privateMarkerRootOnly/.test(rootBootstrapTest), 'Root extraction must be tested with separate service and Nginx identities')
assert(/stat\.S_ISLNK/.test(trustedPaths) && /st_mode & 0o022/.test(trustedPaths), 'Administrative path validation must reject links and mutable paths')

assert(/from = "\/healthz"[\s\S]*api\/healthz/.test(netlifyConfig), 'Netlify must route root liveness to the same Express app')
assert(/from = "\/readyz"[\s\S]*api\/readyz/.test(netlifyConfig), 'Netlify must route root readiness to the same Express app')
assert(/Cache-Control = "no-cache"/.test(netlifyConfig) && /Cache-Control = "no-store"/.test(netlifyConfig) && /immutable/.test(netlifyConfig), 'Netlify must preserve route, identity, probe, and hashed-asset cache policy')

for (const removedPath of ['.dockerignore', 'Dockerfile', 'compose.yaml', 'docker-compose.yml', 'nginx.conf', 'front-end/public/healthz', 'deploy/systemd/prepare-release.sh', 'scripts/write-runtime-manifest.mjs']) {
  try {
    await access(resolve(projectRoot, removedPath))
    throw new Error(`${removedPath} must be absent from the direct production repository`)
  }
  catch (error) {
    if (error?.code !== 'ENOENT')
      throw error
  }
}

console.log('Zilch deployment output check passed for protected exact artifacts, direct systemd/Nginx, and Netlify.')
