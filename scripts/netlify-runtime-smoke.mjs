#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { build } from 'esbuild'

const projectRoot = path.resolve(import.meta.dirname, '..')
const netlifyTemporaryDirectory = path.join(projectRoot, '.netlify')
await mkdir(netlifyTemporaryDirectory, { recursive: true })
const temporaryRoot = await mkdtemp(path.join(netlifyTemporaryDirectory, 'runtime-smoke-'))
const bundledFunction = path.join(temporaryRoot, 'api.cjs')

try {
  await build({
    bundle: true,
    entryPoints: [path.join(projectRoot, 'netlify/functions/api.ts')],
    format: 'cjs',
    logLevel: 'silent',
    outfile: bundledFunction,
    platform: 'node',
    sourcemap: false,
    target: 'node24',
  })

  const { handler } = await import(`${pathToFileURL(bundledFunction).href}?smoke=${Date.now()}`)
  assert.equal(typeof handler, 'function')

  const response = await handler({
    body: null,
    headers: { host: 'zilch.jacobdanderson.net' },
    httpMethod: 'GET',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    path: '/api/health',
    queryStringParameters: null,
    rawQuery: '',
    rawUrl: 'https://zilch.jacobdanderson.net/api/health',
    requestContext: { identity: { sourceIp: '127.0.0.1' } },
  }, {})

  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body || '{}'), { ok: true })
  assert.equal(response.headers?.['access-control-allow-origin'], undefined)
  console.log('Netlify esbuild bundle and health-function runtime smoke passed')
}
finally {
  await rm(temporaryRoot, { force: true, recursive: true })
}
