#!/usr/bin/env node
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const manifestPath = path.join(repositoryRoot, '.zilch-runtime.sha256')
const temporaryManifestPath = `${manifestPath}.tmp`
const runtimeEntries = [
  '.zilch-release-prepared.json',
  'package.json',
  'package-lock.json',
  'back-end/package.json',
  'back-end/package-lock.json',
  'back-end/dist',
  'back-end/node_modules',
  'front-end/.output/public',
]

function assertSafeRelativePath(relativePath) {
  if (!relativePath || relativePath.includes('\\') || /[\r\n]/.test(relativePath))
    throw new Error(`Runtime path cannot be represented safely in a SHA-256 manifest: ${JSON.stringify(relativePath)}`)
}

async function collectFiles(relativePath, files) {
  assertSafeRelativePath(relativePath)
  const absolutePath = path.join(repositoryRoot, relativePath)
  const metadata = await lstat(absolutePath)

  if (metadata.isSymbolicLink())
    throw new Error(`Runtime symlinks are not allowed: ${relativePath}`)

  if (metadata.isDirectory()) {
    const children = await readdir(absolutePath)
    children.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))
    for (const child of children)
      await collectFiles(path.posix.join(relativePath, child), files)
    return
  }

  if (!metadata.isFile())
    throw new Error(`Runtime entries must be regular files or directories: ${relativePath}`)
  if (metadata.nlink !== 1)
    throw new Error(`Runtime files must not be hard-linked: ${relativePath}`)

  files.push(relativePath)
}

async function digestFile(relativePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path.join(repositoryRoot, relativePath)))
    hash.update(chunk)
  return hash.digest('hex')
}

const files = []
for (const entry of runtimeEntries)
  await collectFiles(entry, files)
files.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))

const lines = []
for (const file of files)
  lines.push(`${await digestFile(file)}  ${file}`)

await rm(temporaryManifestPath, { force: true })
await writeFile(temporaryManifestPath, `${lines.join('\n')}\n`, { mode: 0o600 })
await rename(temporaryManifestPath, manifestPath)

console.log(`Recorded ${files.length} immutable runtime files in .zilch-runtime.sha256`)
