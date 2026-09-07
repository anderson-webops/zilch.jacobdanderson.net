/* eslint-disable test/no-import-node-test */
import type { GameState } from '../src/game/types.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createGame, rollDice } from '../src/game/engine.ts'
import { createRollPresentation, readRollingPreference, ROLL_ANIMATION_MS, ROLL_PREFERENCE_KEY, writeRollingPreference } from '../src/game/roll-presentation.ts'

const result = () => rollDice(createGame([{ name: 'Alice', kind: 'human' }]), () => 0)

test('rolling preference defaults off and accepts only an explicit saved true', () => {
  for (const stored of [null, '', 'false', '1', '{}', 'TRUE'])
    assert.equal(readRollingPreference({ getItem: () => stored }), false)
  assert.equal(readRollingPreference({ getItem: () => 'true' }), true)
  assert.equal(readRollingPreference(null), false)
  assert.equal(readRollingPreference({ getItem: () => {
    throw new Error('blocked')
  } }), false)
  writeRollingPreference({ setItem: () => {
    throw new Error('quota')
  } }, true)
  let saved: unknown[] = []
  writeRollingPreference({ setItem: (...args) => saved = args }, false)
  assert.deepEqual(saved, [ROLL_PREFERENCE_KEY, 'false'])
})

test('disabled presentation reveals the exact result immediately', () => {
  let revealed: GameState | null = null
  const presentation = createRollPresentation({ rolling: () => assert.fail('no animation'), reveal: value => revealed = value })
  const next = result()
  assert.equal(presentation.present(next, false), true)
  assert.strictEqual(revealed, next)
})

test('enabled presentation holds one result for 2.5 seconds without consuming randomness', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const next = result()
  let revealed: GameState | null = null
  let rolling: GameState | null = null
  context.mock.method(Math, 'random', () => assert.fail('animation must not roll dice'))
  const presentation = createRollPresentation({ rolling: value => rolling = value, reveal: value => revealed = value })
  assert.equal(presentation.present(next, true), true)
  assert.strictEqual(rolling, next)
  assert.equal(presentation.present(next, true), false)
  context.mock.timers.tick(ROLL_ANIMATION_MS - 1)
  assert.equal(revealed, null)
  context.mock.timers.tick(1)
  assert.strictEqual(revealed, next)
  assert.equal(rolling, null)
})

test('disabling motion reveals once; cancellation prevents a stale result', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const revealed: GameState[] = []
  const presentation = createRollPresentation({ rolling: () => {}, reveal: value => revealed.push(value) })
  const next = result()
  presentation.present(next, true)
  presentation.finish()
  presentation.finish()
  context.mock.timers.tick(ROLL_ANIMATION_MS)
  assert.deepEqual(revealed, [next])
  presentation.present(next, true)
  presentation.cancel()
  context.mock.timers.tick(ROLL_ANIMATION_MS)
  assert.deepEqual(revealed, [next])
})
