#!/usr/bin/env node
import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import path from 'node:path'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const backendModules = path.join(repositoryRoot, 'back-end/node_modules')

for (const packageName of ['dotenv', 'express', 'express-rate-limit', 'helmet'])
  await access(path.join(backendModules, packageName, 'package.json'))

for (const packageName of ['@types', 'supertest', 'tsx', 'typescript-eslint', 'vitest'])
  await assert.rejects(access(path.join(backendModules, packageName)), undefined, `${packageName} must be absent from production`)

for (const removedPath of ['node_modules', 'front-end/node_modules', 'front-end/.nuxt'])
  await assert.rejects(access(path.join(repositoryRoot, removedPath)), undefined, `${removedPath} must be absent from production`)

for (const requiredPath of [
  'back-end/dist/server.js',
  'front-end/.output/public/index.html',
  'front-end/.output/public/release.json',
]) {
  await access(path.join(repositoryRoot, requiredPath))
}

console.log('Direct production install contains only the compiled API, static frontend, and backend runtime dependencies')
