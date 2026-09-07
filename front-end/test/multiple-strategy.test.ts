/* eslint-disable test/no-import-node-test */
import type { DieValue, GameState, MultipleChains } from '../src/game/types.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { bankScore, canBank, createGame, restoreGame, rollAgain, selectComputerRecommended, shouldComputerBank } from '../src/game/engine.ts'
import { nextRollRisk } from '../src/game/roll-risk.ts'
import { scoreSelection } from '../src/game/scoring.ts'

function checkpoint(values: DieValue[], risk = 0, own = 1000, opponent = 1000, chains: MultipleChains = {}) {
  const state = createGame([{ name: 'Computer', kind: 'computer', difficulty: 'hard' }, { name: 'Player', kind: 'human' }])
  Object.assign(state, { phase: 'selecting', dice: values.map((value, id) => ({ value, id })), diceInPlay: values.length, turnScore: risk, rollNumber: risk ? 2 : 1, scoredMultiples: chains })
  state.players[0]!.score = own
  state.players[1]!.score = opponent
  return state
}

function decision(state: GameState) {
  const before = JSON.stringify(state)
  const selected = selectComputerRecommended(state)
  assert.equal(JSON.stringify(state), before, 'Planning must not mutate live dice, chains, score, or history.')
  return { selected: selected.dice.filter(die => selected.selectedDieIds.includes(die.id)).map(die => die.value), bank: shouldComputerBank(selected), state: selected }
}

test('chain diagnostics use exact scorer outcomes and correct scoring-face risk', () => {
  const sixes = nextRollRisk(3, { 6: 3 })
  assert.deepEqual(sixes, { outcomes: 216, busts: 24, scoreSum: 94350, bustProbability: 24 / 216 })
  const ones = nextRollRisk(3, { 1: 3 })
  assert.equal(ones.busts, 60)
  assert.equal(ones.scoreSum / ones.busts, 2237.5)
  const twos = nextRollRisk(3, { 2: 3 })
  assert.equal(twos.busts, 24)
  assert.equal(twos.scoreSum / twos.busts, 1831.25)
  assert.equal(nextRollRisk(6, {}).busts, 1080)
  assert.strictEqual(nextRollRisk(3, { 6: 3 }), sixes, 'Identical scoring contexts reuse their immutable cache.')
})

test('Hard compares multiple selections, points at risk, and match position', () => {
  const roll: DieValue[] = [6, 6, 6, 5, 2, 3]
  const low = decision(checkpoint(roll))
  assert.deepEqual(low.selected, [6, 6, 6])
  assert.equal(low.bank, false)
  const middle = decision(checkpoint(roll, 950))
  assert.deepEqual(middle.selected, [6, 6, 6])
  assert.equal(middle.bank, false)
  const high = decision(checkpoint(roll, 2800))
  assert.deepEqual(high.selected, [6, 6, 6, 5])
  assert.equal(high.bank, true)
  const ahead = decision(checkpoint(roll, 950, 3500, 1000))
  assert.deepEqual(ahead.selected, [6, 6, 6, 5])
  assert.equal(ahead.bank, true)
  assert.equal(decision(checkpoint(roll, 950, 1000, 3500)).bank, false)
})

test('Hard values the actual multiple rather than assuming higher faces always favor rolling', () => {
  const ones = decision(checkpoint([1, 1, 1, 5, 2, 3], 1500))
  assert.deepEqual(ones.selected, [1, 1, 1, 5])
  assert.equal(ones.bank, true)
  const twos = decision(checkpoint([2, 2, 2, 5, 3, 4], 1500))
  assert.deepEqual(twos.selected, [2, 2, 2, 5])
  assert.equal(twos.bank, true)
  assert.equal(decision(checkpoint([6, 6, 6, 5, 2, 3], 1500)).bank, false)
})

test('Hard considers collecting a saved extension and singles for hot dice', () => {
  const state = checkpoint([6, 1, 5], 600, 1000, 1000, { 6: 3 })
  const result = decision(state)
  assert.deepEqual(result.selected, [6, 1, 5])
  assert.equal(result.bank, false)
  assert.equal(scoreSelection(result.state.dice, result.state.selectedDieIds, result.state.scoredMultiples).score, 750)
  const restored = restoreGame(JSON.parse(JSON.stringify(result.state)))
  assert.ok(restored)
  assert.equal(shouldComputerBank(restored), false)
  const next = rollAgain(restored, Math.random, [1, 2, 2, 3, 4, 6])
  assert.deepEqual(next.scoredMultiples, {})
  assert.equal(next.turnScore, 1350)
  assert.equal(decision(next).bank, false)

  const five = decision(checkpoint([6, 6, 6, 6, 6, 5]))
  assert.equal(five.selected.length, 6)
  assert.equal(five.bank, false)
})

test('Hard collects an outright final win instead of preserving a chain or accepting a tie', () => {
  const state = checkpoint([6, 6, 6, 5, 2, 3], 0, 4900, 5500)
  state.settings.allowTies = false
  state.endgame = { triggerPlayerId: state.players[1]!.id, remainingTurns: 1 }
  const result = decision(state)
  assert.equal(result.bank, true)
  assert.deepEqual(result.selected, [6, 6, 6, 5])
  const won = bankScore(result.state)
  assert.equal(won.phase, 'finished')
  assert.deepEqual(won.winnerIds, [won.players[0]!.id])
  assert.equal(won.players[0]!.score, 5550)
  state.players[0]!.score = 4850
  assert.equal(decision(state).bank, false, 'An exact tie is not an outright win when ties are disabled.')
})

test('opening limits and the separate Stealing strategy remain in force', () => {
  const opening = checkpoint([6, 6, 6, 5, 2, 3], 0, 0, 0)
  opening.settings.openingScore = 3000
  const unopened = decision(opening)
  assert.equal(unopened.bank, false)
  assert.equal(canBank(unopened.state), false)
  const stealing = checkpoint([6, 1, 5], 600, 1000, 1000, { 6: 3 })
  stealing.settings.stealing = true
  // Existing Stealing selection has its own incentives and is not replaced by
  // the newly validated non-Stealing joint planner.
  const result = decision(stealing)
  assert.deepEqual(result.selected, [6, 1, 5])
  assert.equal(result.bank, false)
})
