import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

const backendRequire = createRequire(new URL('../back-end/package.json', import.meta.url))
const vitestRequire = createRequire(backendRequire.resolve('vitest/package.json'))
const { MockerRegistry } = await import(pathToFileURL(vitestRequire.resolve('@vitest/mocker')))
const { interceptorPlugin } = await import(pathToFileURL(vitestRequire.resolve('@vitest/mocker/node')))

function interceptor(keys = ['answer']) {
  const root = resolve('/synthetic-zilch-mock-root').replaceAll('\\', '/')
  const events = new EventEmitter()
  const registry = new MockerRegistry()
  const plugin = interceptorPlugin({ registry, globalThisAccessor: '"__zilchMockTest__"' })
  plugin.configureServer({
    config: {
      root,
      server: { fs: { strict: true, allow: [root] } },
      fsDenyGlob: () => false,
      safeModulePaths: new Set(),
    },
    ws: {
      on: events.on.bind(events),
      send(event, url) {
        if (event === 'vitest:interceptor:resolve')
          queueMicrotask(() => events.emit('vitest:interceptor:resolved', { url, keys }))
      },
    },
  })
  return {
    root,
    registry,
    register: event => events.emit('vitest:interceptor:register', event),
    load: id => plugin.load.handler(id),
  }
}

async function verifyManual(url, names = ['answer']) {
  const hook = interceptor(names)
  const id = `${hook.root}/module.js`
  hook.register({ type: 'manual', raw: id, id, url })
  const source = await hook.load(id)
  let receivedUrl
  globalThis.__zilchMockTest__ = {
    getFactoryModule(value) {
      receivedUrl = value
      return Object.fromEntries(names.map(name => [name, 42]))
    },
  }
  try {
    const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
    assert.equal(globalThis.__zilchMockInjection__, undefined)
    assert.equal(receivedUrl, url)
    for (const name of names)
      assert.equal(module[name], 42)
  }
  finally {
    delete globalThis.__zilchMockTest__
    delete globalThis.__zilchMockInjection__
  }
}

test('ordinary manual mock registration still serves the factory exports', async () => {
  await verifyManual('/ordinary.js')
})

test('manual mock URLs remain data rather than generated code', async () => {
  // GHSA-qxg6-89mg-rqv8: registration must not turn an untrusted URL into code.
  for (const url of ['x"); globalThis.__zilchMockInjection__ = true; void("', 'quote"\\newline\n雪'])
    await verifyManual(url)
})

test('quoted export names remain valid module exports', async () => {
  await verifyManual('/exports.js', ['answer', 'quote"backslash\\newline\n雪'])
})

test('redirect registration rejects slash and backslash escapes before file loading', async () => {
  // GHSA-xp26-3454-mjgp: custom schemes preserve the separator until the plugin checks it.
  const hook = interceptor()
  for (const redirect of ['mock:../outside.js', String.raw`mock:..\outside.js`, String.raw`mock:fixtures/..\..\outside.js`]) {
    const id = `${hook.root}/${encodeURIComponent(redirect)}.js`
    hook.register({ type: 'redirect', raw: id, id, url: id, redirect })
    assert.equal(hook.registry.getById(id), undefined, `Outside-root redirect was registered: ${redirect}`)
    assert.equal(await hook.load(id), undefined)
  }
})

test('redirect registration preserves in-root paths with either separator', () => {
  const hook = interceptor()
  for (const redirect of ['mock:fixtures/inside.js', String.raw`mock:fixtures\inside.js`]) {
    const id = `${hook.root}/${encodeURIComponent(redirect)}.js`
    hook.register({ type: 'redirect', raw: id, id, url: id, redirect })
    assert.equal(hook.registry.getById(id)?.redirect, `${hook.root}/fixtures/inside.js`)
  }
})
