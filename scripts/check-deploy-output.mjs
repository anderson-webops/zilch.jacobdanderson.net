#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const paths = {
  apiApp: resolve(projectRoot, 'back-end/dist/app.js'),
  apiServer: resolve(projectRoot, 'back-end/dist/server.js'),
  artifactContract: resolve(projectRoot, 'deploy/runtime-artifact.json'),
  artifactVerifier: resolve(projectRoot, 'scripts/runtime-artifact.py'),
  directInstall: resolve(projectRoot, 'deploy/systemd/install-service.sh'),
  directNginx: resolve(projectRoot, 'deploy/nginx/zilch.jacobdanderson.net.server.conf'),
  directPrepare: resolve(projectRoot, 'deploy/systemd/prepare-release.sh'),
  directPromote: resolve(projectRoot, 'deploy/systemd/promote-release.sh'),
  directService: resolve(projectRoot, 'deploy/systemd/zilch-api.service'),
  directWorkflow: resolve(projectRoot, '.github/workflows/direct-release.yml'),
  frontendIndex: resolve(projectRoot, 'front-end/.output/public/index.html'),
  frontendTips: resolve(projectRoot, 'front-end/.output/public/tips/index.html'),
  netlifyConfig: resolve(projectRoot, 'netlify.toml'),
  netlifyFunction: resolve(projectRoot, 'netlify/functions/api.ts'),
  runtimePackager: resolve(projectRoot, 'scripts/package-runtime.sh'),
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
  directInstall,
  directNginx,
  directPrepare,
  directPromote,
  directService,
  directWorkflow,
  frontendIndex,
  frontendTips,
  netlifyConfig,
  runtimePackager,
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

assert(/npm audit signatures/.test(directPrepare), 'Direct preparation must verify package signatures')
assert(/NODE_BIN_DIR:-\/opt\/node-24\.18\.1\/bin/.test(directPrepare), 'Preparation must default to isolated Node 24.18.1')
assert(/refs\/heads\/main:refs\/remotes\/origin\/main/.test(directPrepare), 'Preparation must refresh exact origin/main')
assert(/--unset-all http\.https:\/\/github\.com\/\.extraheader/.test(directPrepare), 'Preparation must remove checkout credentials before dependency scripts run')
assert(/node scripts\/clean\.mjs/.test(directPrepare), 'Preparation must remove stale generated output')

assert(/\/usr\/local\/libexec\/zilch-release/.test(directInstall), 'Installer must use versioned root-owned helpers')
assert(/\/usr\/local\/sbin\/zilch-promote-release/.test(directInstall), 'Installer must atomically update the stable promotion wrapper')
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

assert(JSON.parse(artifactContract).runtime.arch === 'arm64', 'Artifact contract must target Linux ARM64')
assert(JSON.parse(artifactContract).required.includes('back-end/dist/boundedRateStore.js'), 'Artifact contract must require the security control module')
assert(/trusted release record/.test(artifactVerifier), 'Artifact verifier must require independent archive identity')
assert(/Never overwrite an existing artifact/.test(artifactVerifier), 'Artifact verifier must keep release archives write-once')
assert(/test-unpacked-artifact\.sh/.test(runtimePackager) && /missing-module/.test(runtimePackager), 'Packager must test the exact unpacked artifact and missing-module rejection')
assert(/ubuntu-24\.04-arm/.test(directWorkflow) && /actions\/upload-artifact@/.test(directWorkflow), 'Release workflow must retain the accepted Linux ARM64 artifact')
assert(/test-bootstrap-in-vm\.py --disposable-vm/.test(directWorkflow) && /needs: \[prepare, installer\]/.test(directWorkflow), 'Artifact publication must wait for disposable-host installer acceptance')
assert(/stat\.S_ISLNK/.test(trustedPaths) && /st_mode & 0o022/.test(trustedPaths), 'Administrative path validation must reject links and mutable paths')

assert(/from = "\/healthz"[\s\S]*api\/healthz/.test(netlifyConfig), 'Netlify must route root liveness to the same Express app')
assert(/from = "\/readyz"[\s\S]*api\/readyz/.test(netlifyConfig), 'Netlify must route root readiness to the same Express app')
assert(/Cache-Control = "no-cache"/.test(netlifyConfig) && /Cache-Control = "no-store"/.test(netlifyConfig) && /immutable/.test(netlifyConfig), 'Netlify must preserve route, identity, probe, and hashed-asset cache policy')

for (const removedPath of ['.dockerignore', 'Dockerfile', 'compose.yaml', 'docker-compose.yml', 'nginx.conf', 'front-end/public/healthz']) {
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
