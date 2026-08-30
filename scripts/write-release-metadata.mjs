#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import process from 'node:process'

import backendLockfile from '../back-end/package-lock.json' with { type: 'json' }
import backendManifest from '../back-end/package.json' with { type: 'json' }
import frontendManifest from '../front-end/package.json' with { type: 'json' }
import rootLockfile from '../package-lock.json' with { type: 'json' }
import packageManifest from '../package.json' with { type: 'json' }

const release = process.env.ZILCH_RELEASE?.trim() || ''
const commitSha = process.env.ZILCH_COMMIT_SHA?.trim() || ''
const builtAt = process.env.ZILCH_BUILT_AT?.trim() || ''
const expectedRelease = `v${packageManifest.version}`
const repository = 'anderson-webops/zilch.jacobdanderson.net'

const identities = [
  ['root package', packageManifest, 'zilch-browser-game'],
  ['front-end package', frontendManifest, 'zilch-front-end'],
  ['back-end package', backendManifest, 'zilch-back-end'],
  ['root lock', rootLockfile.packages?.[''], 'zilch-browser-game'],
  ['root lock front-end workspace', rootLockfile.packages?.['front-end'], 'zilch-front-end'],
  ['root lock back-end workspace', rootLockfile.packages?.['back-end'], 'zilch-back-end'],
  ['standalone back-end lock', backendLockfile.packages?.[''], 'zilch-back-end'],
]

for (const [label, identity, expectedName] of identities) {
  if (identity?.name !== expectedName || identity?.version !== packageManifest.version)
    throw new Error(`${label} identity must be ${expectedName}@${packageManifest.version}`)
}

if (release !== expectedRelease || !/^v\d+\.\d+\.\d+$/.test(release))
  throw new Error(`ZILCH_RELEASE must be exactly ${expectedRelease}`)
if (!/^[0-9a-f]{40}$/.test(commitSha))
  throw new Error('ZILCH_COMMIT_SHA must be a full lowercase Git revision')
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(builtAt) || Number.isNaN(Date.parse(builtAt)))
  throw new Error('ZILCH_BUILT_AT must be a valid UTC timestamp')

const marker = `${JSON.stringify({ repository, release, commitSha, builtAt }, null, 2)}\n`
const publicDirectory = new URL('../front-end/.output/public/', import.meta.url)
await mkdir(publicDirectory, { recursive: true })
await Promise.all([
  writeFile(new URL('../.zilch-release-prepared.json', import.meta.url), marker, { mode: 0o600 }),
  writeFile(new URL('release.json', publicDirectory), marker, { mode: 0o644 }),
])

console.log(`Prepared release identity ${release} (${commitSha})`)
