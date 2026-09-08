/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test, { after, beforeEach } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileScript, parse } from '@vue/compiler-sfc'
import { build } from 'esbuild'
import { createRenderer, nextTick, reactive } from 'vue'
import { acknowledgeBust, bankScore, createGame, defaultSettings, restoreGame, rollDice, selectRecommended } from '../src/game/engine.ts'
import { ROLL_PREFERENCE_KEY } from '../src/game/roll-presentation.ts'
import { defaultSetupPreferences, readSetupPreferences, SETUP_PREFERENCE_KEY } from '../src/game/setup-preferences.ts'

// A Vue lifecycle harness, not a browser/DOM mock. Exercise the real component
// setup and composable with controlled storage, media preferences, and clocks.
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url))
const scratch = await mkdtemp(join(tmpdir(), 'zilch-preferences-test-'))
after(() => rm(scratch, { recursive: true, force: true }))

async function loadModule(relativePath: string, component = false) {
  const path = resolve(sourceRoot, relativePath)
  const original = await readFile(path, 'utf8')
  const contents = component ? compileScript(parse(original).descriptor, { id: 'setup-test' }).content : original
  const outfile = join(scratch, `${relativePath.replace(/[^a-z0-9]/gi, '_')}.mjs`)
  await build({
    stdin: { contents, sourcefile: path, resolveDir: sourceRoot, loader: 'ts' },
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    alias: { '~': sourceRoot },
    define: { 'import.meta.client': 'true' },
    plugins: [{
      name: 'shared-vue',
      setup(builder) {
        builder.onResolve({ filter: /^vue$/ }, () => ({ path: fileURLToPath(import.meta.resolve('vue')), external: true }))
      },
    }],
    banner: { js: `import { ref, shallowRef, shallowReadonly, markRaw, computed, watch, onMounted, onBeforeUnmount, nextTick, useTemplateRef } from ${JSON.stringify(import.meta.resolve('vue'))};
      const stateCache = new Map();
      export function resetTestState() { stateCache.clear(); }
      function useState(key, initial) {
        if (!stateCache.has(key)) stateCache.set(key, ref(initial()));
        return stateCache.get(key);
      }` },
  })
  return import(pathToFileURL(outfile).href)
}

const gameModule = await loadModule('composables/useZilchGame.ts')
const setupModule = await loadModule('components/GameSetup.vue', true)
const tableModule = await loadModule('components/GameTable.vue', true)
beforeEach(() => gameModule.resetTestState())
const renderer = createRenderer<object, object>({
  patchProp() {},
  insert() {},
  remove() {},
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText() {},
  setElementText() {},
  parentNode: () => null,
  nextSibling: () => null,
})

function mount<T>(setup: () => T) {
  let value: T
  const app = renderer.createApp({
    setup: () => {
      value = setup()
      return () => null
    },
  })
  app.mount({})
  return { value: value!, unmount: () => app.unmount() }
}

function browserFixture() {
  const data = new Map<string, string>()
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  }
  const listeners = new Set<() => void>()
  const motion = { matches: false, addEventListener: (_: string, handler: () => void) => listeners.add(handler), removeEventListener: (_: string, handler: () => void) => listeners.delete(handler) }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage, matchMedia: () => motion } })
  return {
    storage,
    reduceMotion() {
      motion.matches = true
      for (const handler of listeners)
        handler()
    },
    restore() {
      if (previous)
        Object.defineProperty(globalThis, 'window', previous)
      else
        Reflect.deleteProperty(globalThis, 'window')
      assert.equal(listeners.size, 0, 'media listeners must be removed on unmount')
    },
  }
}

const players = [{ name: 'Alice', kind: 'human' }, { name: 'Bob', kind: 'human' }]

test('finished-game review dismisses only presentation and resets for another table', async () => {
  const finished = bankScore(selectRecommended(rollDice(createGame(players, {
    ...defaultSettings,
    winningScore: 1000,
    finalChase: false,
  }), Math.random, [1, 1, 1, 2, 3, 4])))
  const before = JSON.stringify(finished)
  const props = reactive({ state: finished, rollingResult: null })
  const emitted: string[] = []
  const setup = () => tableModule.default.setup(props, { expose() {}, emit: (name: string) => emitted.push(name) })
  const mounted = mount(setup)
  const table = mounted.value
  assert.equal(table.showingFinalResults.value, false, 'a resumed finished game still opens the winner popup')
  table.showFinalResults()
  await nextTick()
  assert.equal(table.showingFinalResults.value, true)
  assert.equal(JSON.stringify(props.state), before, 'review cannot change scores, winners, events, or saved state')
  assert.deepEqual(emitted, [], 'review cannot emit newGame or pass')
  props.state = createGame(players)
  await nextTick()
  assert.equal(table.showingFinalResults.value, false)
  table.showFinalResults()
  assert.equal(table.showingFinalResults.value, false, 'review is unavailable during a live game')
  props.state = finished
  await nextTick()
  assert.equal(table.showingFinalResults.value, false, 'the next finished game gets its own popup')
  mounted.unmount()
})

test('a final chase bust and tied winners can be reviewed without advancing the game', async () => {
  const state = createGame(players)
  state.players[0]!.score = 5000
  state.players[1]!.score = 5000
  state.currentPlayerIndex = 1
  state.phase = 'bust'
  state.endgame = { triggerPlayerId: state.players[0]!.id, remainingTurns: 1 }
  const props = reactive({ state, rollingResult: null })
  const mounted = mount(() => tableModule.default.setup(props, { expose() {}, emit() {} }))
  assert.equal(mounted.value.nextTurnAction.value, 'Continue')
  props.state = acknowledgeBust(state)
  await nextTick()
  assert.equal(props.state.phase, 'finished')
  assert.equal(mounted.value.winnerTitle.value, 'Alice and Bob tie')
  const before = JSON.stringify(props.state)
  mounted.value.showFinalResults()
  await nextTick()
  assert.equal(mounted.value.showingFinalResults.value, true)
  assert.equal(JSON.stringify(props.state), before)
  mounted.unmount()
})

test('animation on and off consume the same rolls and produce identical game state', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const browser = browserFixture()
  const mounted = mount(() => gameModule.useZilchGame())
  const game = mounted.value
  let draws = 0
  context.mock.method(Math, 'random', () => ((draws++ % 6) + 0.5) / 6)
  game.startGame(players, defaultSettings)
  game.roll()
  const immediate = game.state.value
  assert.equal(draws, 6)
  draws = 0
  game.startGame(players, defaultSettings)
  game.setRollingAnimation(true)
  game.roll()
  assert.equal(draws, 6)
  context.mock.timers.tick(2500)
  assert.equal(draws, 6)
  assert.deepEqual(game.state.value, immediate)
  game.startGame(players, defaultSettings)
  game.roll()
  const pending = game.rollingResult.value
  game.setRollingAnimation(false)
  assert.equal(game.rollingResult.value, null)
  assert.deepEqual(game.state.value, pending)
  context.mock.timers.tick(2500)
  assert.equal(draws, 12)
  mounted.unmount()
  browser.restore()
})

test('actual setup restores custom scores and remembers valid edits across remounts', async () => {
  const browser = browserFixture()
  const saved = defaultSetupPreferences()
  saved.computerDifficulty = 'hard'
  saved.settings = { winningScore: 12345, openingScore: 650, firstRollBust: false, finalChase: false, allowTies: false, stealing: true }
  browser.storage.setItem(SETUP_PREFERENCE_KEY, JSON.stringify(saved))
  const setup = () => setupModule.default.setup({}, { expose() {}, emit() {} })
  const first = mount(setup)
  await nextTick()
  await nextTick()
  assert.equal(first.value.computerDifficulty.value, 'hard')
  assert.equal(first.value.winningScorePreset.value, 'custom')
  assert.equal(first.value.customWinningScore.value, '12345')
  assert.equal(first.value.customOpeningScore.value, '650')
  assert.equal(first.value.stealing.value, true)
  first.value.mode.value = 'local'
  first.value.playerCount.value = 4
  first.value.localNames.value[0] = 'Jacob'
  first.value.computerDifficulty.value = 'easy'
  await nextTick()
  first.value.customWinningScore.value = ''
  await nextTick()
  assert.equal(readSetupPreferences(browser.storage).settings.winningScore, 12345, 'invalid interim edits must not replace the last valid setup')
  first.unmount()
  const second = mount(setup)
  await nextTick()
  await nextTick()
  assert.equal(second.value.mode.value, 'local')
  assert.equal(second.value.playerCount.value, 4)
  assert.equal(second.value.localNames.value[0], 'Jacob')
  assert.equal(second.value.computerDifficulty.value, 'easy')
  assert.equal(second.value.winningScore.value, 12345)
  second.unmount()
  browser.restore()
})

test('actual game keeps animation off initially, saves pending results, and blocks actions until reveal', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const browser = browserFixture()
  const mounted = mount(() => gameModule.useZilchGame())
  const game = mounted.value
  game.startGame(players, defaultSettings)
  assert.equal(game.rollingAnimationEnabled.value, false)
  game.roll([1, 1, 2, 3, 4, 6])
  assert.equal(game.state.value.phase, 'selecting')
  assert.equal(game.rollingResult.value, null)
  game.setRollingAnimation(true)
  game.recommend()
  game.continueRolling([2, 3, 4, 6])
  const pending = game.rollingResult.value
  assert.equal(pending.phase, 'bust')
  assert.equal(pending.dice.length, 4)
  assert.deepEqual(restoreGame(JSON.parse(browser.storage.getItem('zilch-browser-game-v1')!)), pending)
  const before = game.state.value
  game.roll()
  game.continueRolling()
  game.toggle(0)
  game.recommend()
  game.bank()
  game.pass()
  game.steal(true)
  assert.strictEqual(game.state.value, before)
  context.mock.timers.tick(2499)
  assert.strictEqual(game.state.value, before)
  context.mock.timers.tick(1)
  assert.equal(game.state.value.phase, 'bust')
  await nextTick()
  context.mock.timers.tick(10000)
  assert.equal(game.state.value.phase, 'bust', 'a human bust waits for acknowledgement')
  game.leaveGame()
  assert.equal(browser.storage.getItem(ROLL_PREFERENCE_KEY), 'true')
  assert.equal(browser.storage.getItem('zilch-browser-game-v1'), null)
  mounted.unmount()
  browser.restore()
})

test('computer automation waits for animation and then gives the bust its full viewing time', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const browser = browserFixture()
  browser.storage.setItem(ROLL_PREFERENCE_KEY, 'true')
  const mounted = mount(() => gameModule.useZilchGame())
  const game = mounted.value
  game.startGame([{ name: 'Bot', kind: 'computer', difficulty: 'hard' }, ...players], { ...defaultSettings, firstRollBust: false })
  await nextTick()
  game.roll([2, 2, 3, 3, 4, 6])
  await nextTick()
  context.mock.timers.tick(2499)
  assert.equal(game.state.value.phase, 'ready')
  context.mock.timers.tick(1)
  await nextTick()
  assert.equal(game.state.value.phase, 'bust')
  context.mock.timers.tick(1239)
  assert.equal(game.state.value.phase, 'bust')
  context.mock.timers.tick(1)
  assert.equal(game.state.value.phase, 'ready')
  assert.equal(game.state.value.currentPlayerIndex, 1)
  mounted.unmount()
  browser.restore()
})

test('motion changes, navigation, and leaving cannot reroll or revive a discarded table', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const browser = browserFixture()
  const mounted = mount(() => gameModule.useZilchGame())
  const game = mounted.value
  game.setRollingAnimation(true)
  game.startGame(players, defaultSettings)
  game.roll([2, 2, 3, 3, 4, 6])
  assert.equal(game.rollingResult.value.turnScore, 50)
  browser.reduceMotion()
  assert.equal(game.rollingResult.value, null)
  assert.equal(game.state.value.turnScore, 50)
  game.roll([1, 2, 3, 4, 5, 6])
  assert.equal(game.rollingResult.value, null, 'reduced motion skips the wait entirely')
  mounted.unmount()
  browser.restore()

  const secondBrowser = browserFixture()
  const second = mount(() => gameModule.useZilchGame())
  const secondGame = second.value
  secondGame.setRollingAnimation(true)
  secondGame.startGame(players, defaultSettings)
  secondGame.roll([1, 2, 3, 4, 5, 6])
  const result = secondGame.rollingResult.value
  second.unmount()
  assert.deepEqual(secondGame.state.value, result, 'navigation reveals the already saved result')
  const resumed = mount(() => gameModule.useZilchGame())
  assert.deepEqual(resumed.value.state.value, result, 'returning to the page keeps its shared game state')
  resumed.unmount()
  context.mock.timers.tick(10000)
  secondBrowser.restore()

  const thirdBrowser = browserFixture()
  const third = mount(() => gameModule.useZilchGame())
  third.value.setRollingAnimation(true)
  third.value.startGame(players, defaultSettings)
  third.value.roll([1, 2, 3, 4, 5, 6])
  third.value.leaveGame()
  await nextTick()
  context.mock.timers.tick(10000)
  assert.equal(third.value.state.value, null)
  assert.equal(thirdBrowser.storage.getItem('zilch-browser-game-v1'), null)
  third.unmount()
  thirdBrowser.restore()
})
