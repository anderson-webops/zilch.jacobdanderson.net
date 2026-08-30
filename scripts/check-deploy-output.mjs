#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const paths = {
  apiApp: resolve(projectRoot, 'back-end/dist/app.js'),
  apiServer: resolve(projectRoot, 'back-end/dist/server.js'),
  directNginx: resolve(projectRoot, 'deploy/nginx/zilch.jacobdanderson.net.server.conf'),
  directSecurityHeaders: resolve(projectRoot, 'deploy/nginx/zilch-security-headers.conf'),
  directInstall: resolve(projectRoot, 'deploy/systemd/install-service.sh'),
  directPrepare: resolve(projectRoot, 'deploy/systemd/prepare-release.sh'),
  directPromote: resolve(projectRoot, 'deploy/systemd/promote-release.sh'),
  directService: resolve(projectRoot, 'deploy/systemd/zilch-api.service'),
  directWorkflow: resolve(projectRoot, '.github/workflows/direct-release.yml'),
  frontendHealth: resolve(projectRoot, 'front-end/.output/public/healthz'),
  frontendIndex: resolve(projectRoot, 'front-end/.output/public/index.html'),
  netlifyConfig: resolve(projectRoot, 'netlify.toml'),
  netlifyFunction: resolve(projectRoot, 'netlify/functions/api.ts'),
}

for (const path of Object.values(paths))
  await access(path)

const [apiApp, apiServer, directNginx, directSecurityHeaders, directInstall, directPrepare, directPromote, directService, directWorkflow, frontendHealth, frontendIndex, netlifyConfig] = await Promise.all([
  readFile(paths.apiApp, 'utf8'),
  readFile(paths.apiServer, 'utf8'),
  readFile(paths.directNginx, 'utf8'),
  readFile(paths.directSecurityHeaders, 'utf8'),
  readFile(paths.directInstall, 'utf8'),
  readFile(paths.directPrepare, 'utf8'),
  readFile(paths.directPromote, 'utf8'),
  readFile(paths.directService, 'utf8'),
  readFile(paths.directWorkflow, 'utf8'),
  readFile(paths.frontendHealth, 'utf8'),
  readFile(paths.frontendIndex, 'utf8'),
  readFile(paths.netlifyConfig, 'utf8'),
])

function assert(condition, message) {
  if (!condition)
    throw new Error(message)
}

assert(JSON.parse(frontendHealth).ok === true, 'Static health check must return {"ok":true}')
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
assert(!apiApp.includes('startedAt') && !apiApp.includes('pageview'), 'Compiled API must not expose process timing or page-view state')
assert(!apiApp.includes('sourceMappingURL') && !apiServer.includes('sourceMappingURL'), 'Production API output must not expose source maps')
assert(/^User=zilch-site$/m.test(directService), 'Direct API service must use its dedicated unprivileged account')
assert(/^Environment=PORT=3018$/m.test(directService), 'Direct API service must use the reviewed Zilch loopback port')
assert(/^Environment=HOST=127\.0\.0\.1$/m.test(directService), 'Direct API service must bind only to loopback')
assert(/^ExecStart=\/opt\/node-24\.18\.1\/bin\/node back-end\/dist\/server\.js$/m.test(directService), 'Direct API service must use the isolated Node 24.18.1 runtime')
assert(/^Environment=PATH=\/opt\/node-24\.18\.1\/bin:/m.test(directService), 'Direct API service must place the isolated runtime first on PATH')
assert(/^NoNewPrivileges=true$/m.test(directService), 'Direct API service must deny privilege escalation')
assert(/^ProtectSystem=strict$/m.test(directService), 'Direct API service must have a read-only system view')
assert(!/0\.0\.0\.0|docker/i.test(directService), 'Direct API service must not depend on a container listener')
assert(/proxy_pass http:\/\/127\.0\.0\.1:3018;/.test(directNginx), 'Nginx must proxy the API to the Zilch loopback port')
assert(/return 301 https:\/\/zilch\.jacobdanderson\.net\$request_uri;/.test(directNginx), 'Nginx HTTP redirects must use the fixed canonical host')
assert((directNginx.match(/include \/etc\/nginx\/snippets\/zilch-security-headers\.conf;/g) || []).length >= 4, 'Every header-bearing Nginx scope must restore the shared security headers')
assert(/Cache-Control "no-cache"/.test(directNginx), 'Nginx must revalidate HTML and SPA routes')
assert(/frame-ancestors 'none'/.test(directSecurityHeaders) && /Strict-Transport-Security/.test(directSecurityHeaders), 'Shared Nginx security headers must include frame and transport policy')
assert(/X-Forwarded-For \$remote_addr/.test(directNginx), 'Nginx must replace, not append, the forwarded chain')
assert(!/\$proxy_add_x_forwarded_for/.test(directNginx), 'Nginx must not trust a client-supplied forwarded chain')
assert(/npm audit signatures/.test(directPrepare), 'Direct preparation must verify package signatures')
assert(/NODE_BIN_DIR:-\/opt\/node-24\.18\.1\/bin/.test(directPrepare), 'Host preparation must default to the isolated Node 24.18.1 toolchain')
assert(/origin\/main/.test(directPrepare), 'Direct preparation must require the exact remote main revision')
assert(/refs\/heads\/main:refs\/remotes\/origin\/main/.test(directPrepare), 'Direct preparation must refresh the tracked origin/main ref explicitly')
assert(/--unset-all http\.https:\/\/github\.com\/\.extraheader/.test(directPrepare), 'Release preparation must remove the checkout credential before dependency scripts run')
assert(/node scripts\/clean\.mjs/.test(directPrepare), 'Release preparation must remove stale generated output before installing')
assert(/write-runtime-manifest\.mjs/.test(directPrepare), 'Release preparation must hash the complete direct runtime')
assert(/\/srv\/zilch\.jacobdanderson\.net\/staging/.test(directInstall) && /\/srv\/zilch\.jacobdanderson\.net\/quarantine/.test(directInstall), 'Installer must separate writable staging from root-only quarantine')
assert(/\/opt\/node-24\.18\.1\/bin\/node/.test(directInstall) && /\/opt\/node-24\.18\.1\/bin\/npm/.test(directInstall), 'Installer must verify the isolated Node and npm binaries')
assert(/sport = :3018/.test(directInstall), 'Installer must reserve the reviewed Zilch loopback port')
assert(/\/usr\/local\/sbin\/zilch-promote-release/.test(directInstall), 'Installer must install the root-owned promotion command')
assert(/GITHUB_REF_NAME/.test(directWorkflow) && /expected_tag/.test(directWorkflow), 'Direct release workflow must require the exact package-version tag')
assert(/--ipv4/.test(directPromote) && /--ipv6/.test(directPromote), 'Promotion must gate both address families')
assert(/node_bin=\/opt\/node-24\.18\.1\/bin\/node/.test(directPromote) && /127\.0\.0\.1:3018/.test(directPromote), 'Promotion must verify the isolated runtime and dedicated loopback port')
assert(/if \[\[ -L "\$current_link" \]\]; then/.test(directPromote), 'First promotion must not invent a rollback target')
assert(/restore the previous direct release/i.test(directPromote), 'Promotion must provide source rollback')
assert(/sha256sum --check --strict/.test(directPromote), 'Promotion must verify the complete SHA-256 runtime manifest')
assert(/root-owned command/.test(directPromote) && /chmod 0555/.test(directPromote), 'Promotion must freeze a readable root-owned runtime before activation')
assert(/&& systemctl enable "\$service_name"; then/.test(directPromote) && /systemctl disable "\$service_name"/.test(directPromote), 'Service enablement must participate in promotion and first-release rollback')
assert(/Cache-Control = "no-cache"/.test(netlifyConfig) && /Cache-Control = "no-store"/.test(netlifyConfig) && /immutable/.test(netlifyConfig), 'Netlify must preserve route, identity, and hashed-asset cache policy')

for (const removedPath of ['.dockerignore', 'Dockerfile', 'compose.yaml', 'docker-compose.yml', 'nginx.conf']) {
  try {
    await access(resolve(projectRoot, removedPath))
    throw new Error(`${removedPath} must be absent from the direct production repository`)
  }
  catch (error) {
    if (error?.code !== 'ENOENT')
      throw error
  }
}

console.log('Zilch deployment output check passed for direct systemd/Nginx and Netlify production paths.')
