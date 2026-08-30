/* eslint-disable test/no-import-node-test */
import type { DieValue, GameSettings } from '../src/game/types.ts'
import assert from 'node:assert/strict'

import test from 'node:test'
import {
  acknowledgePass,
  bankScore,
  canBank,
  chooseSteal,
  createGame,
  defaultSettings,
  restoreGame,
  rollAgain,
  rollDice,
  selectRecommended,
  toggleDie,
} from '../src/game/engine.ts'

const localPlayers = [
  { name: 'Alice', kind: 'human' as const },
  { name: 'Bob', kind: 'human' as const },
]

function settings(overrides: Partial<GameSettings> = {}): GameSettings {
  return { ...defaultSettings, ...overrides }
}

function roll(values: DieValue[], overrides: Partial<GameSettings> = {}) {
  return rollDice(createGame(localPlayers, settings(overrides)), Math.random, values)
}

test('uses the shared Zilch defaults', () => {
  const game = createGame(localPlayers)

  assert.equal(game.players.length, 2)
  assert.equal(game.diceInPlay, 6)
  assert.deepEqual(game.settings, defaultSettings)
})

test('computer turns reject human die-selection input at the engine boundary', () => {
  const game = createGame([
    { name: 'Computer', kind: 'computer' },
    { name: 'Alice', kind: 'human' },
  ])
  const rolled = rollDice(game, Math.random, [1, 2, 3, 4, 5, 6])
  const unchanged = toggleDie(rolled, rolled.dice[0]!.id)

  assert.strictEqual(unchanged, rolled)
  assert.deepEqual(unchanged.selectedDieIds, [])
})

test('saved games restore only after the complete state shape is validated', () => {
  const game = createGame(localPlayers)
  const selecting = roll([1, 2, 3, 4, 5, 6])
  const passing = bankScore(selectRecommended(roll([1, 2, 3, 4, 6, 2], {
    openingScore: 0,
    stealing: true,
  })))
  const stealing = acknowledgePass(passing)
  const finished = bankScore(selectRecommended(roll([1, 1, 1, 2, 3, 4], {
    winningScore: 1_000,
    openingScore: 0,
    finalChase: false,
  })))

  for (const validState of [game, selecting, passing, stealing, finished])
    assert.deepEqual(restoreGame(validState), validState)

  const malformedStates = [
    { ...game, currentPlayerIndex: 9 },
    { ...game, phase: 'selecting', dice: [] },
    { ...game, selectedDieIds: [999] },
    { ...game, players: [{ ...game.players[0], kind: 'robot' }] },
    { ...game, settings: { ...game.settings, finalChase: 'yes' } },
  ]

  for (const malformed of malformedStates)
    assert.equal(restoreGame(malformed), null)
})

test('first-roll mercy awards 50 at-risk points once, then a later Zilch busts', () => {
  const firstZilch = roll([2, 2, 3, 3, 4, 6])
  assert.equal(firstZilch.phase, 'ready')
  assert.equal(firstZilch.turnScore, 50)

  const laterZilch = rollDice(firstZilch, Math.random, [2, 2, 3, 3, 4, 6])
  assert.equal(laterZilch.phase, 'pass')
  assert.equal(laterZilch.turnScore, 0)
})

test('an unopened player must reach the opening score before banking', () => {
  const singleFive = selectRecommended(roll([5, 2, 3, 4, 6, 2]))
  assert.equal(canBank(singleFive), false)

  const tripleOnes = selectRecommended(roll([1, 1, 1, 2, 3, 4]))
  assert.equal(canBank(tripleOnes), true)
  const banked = bankScore(tripleOnes)
  assert.equal(banked.players[0]!.score, 1_000)
})

test('hot dice restore all six and clear the multiple-extension chain', () => {
  const straight = selectRecommended(roll([1, 2, 3, 4, 5, 6]))
  const nextRoll = rollAgain(straight, Math.random, [1, 5, 2, 3, 4, 6])

  assert.equal(nextRoll.turnScore, 1_000)
  assert.equal(nextRoll.diceInPlay, 6)
  assert.deepEqual(nextRoll.scoredMultiples, {})
})

test('Final Chase gives every other player exactly one last turn', () => {
  const firstTurn = selectRecommended(roll([1, 1, 1, 2, 3, 4], {
    winningScore: 1_000,
    openingScore: 0,
    firstRollBust: false,
  }))
  const trigger = bankScore(firstTurn)
  assert.equal(trigger.phase, 'pass')
  assert.equal(trigger.endgame?.remainingTurns, 1)

  const finalTurn = acknowledgePass(trigger)
  const finalBust = rollDice(finalTurn, Math.random, [2, 2, 3, 3, 4, 6])
  assert.equal(finalBust.phase, 'finished')
  assert.deepEqual(finalBust.winnerIds, ['player-1'])
})

test('Final Chase wraps from a middle-seat trigger and preserves turn order', () => {
  const gameSettings = settings({
    winningScore: 1_000,
    openingScore: 0,
    firstRollBust: false,
  })
  const players = [
    { name: 'Alice', kind: 'human' as const },
    { name: 'Bob', kind: 'human' as const },
    { name: 'Carol', kind: 'human' as const },
  ]

  const bobTurn = acknowledgePass(rollDice(
    createGame(players, gameSettings),
    Math.random,
    [2, 2, 3, 3, 4, 6],
  ))
  const trigger = bankScore(selectRecommended(rollDice(
    bobTurn,
    Math.random,
    [1, 1, 1, 2, 3, 4],
  )))

  assert.equal(trigger.currentPlayerIndex, 1)
  assert.equal(trigger.nextPlayerIndex, 2)
  assert.deepEqual(trigger.endgame, { triggerPlayerId: 'player-2', remainingTurns: 2 })

  const carolTurn = acknowledgePass(trigger)
  const afterCarol = rollDice(carolTurn, Math.random, [2, 2, 3, 3, 4, 6])
  assert.equal(afterCarol.phase, 'pass')
  assert.equal(afterCarol.currentPlayerIndex, 2)
  assert.equal(afterCarol.nextPlayerIndex, 0)
  assert.equal(afterCarol.endgame?.remainingTurns, 1)

  const aliceTurn = acknowledgePass(afterCarol)
  const finished = rollDice(aliceTurn, Math.random, [2, 2, 3, 3, 4, 6])
  assert.equal(finished.phase, 'finished')
  assert.equal(finished.currentPlayerIndex, 0)
  assert.equal(finished.endgame?.remainingTurns, 0)
  assert.deepEqual(finished.winnerIds, ['player-2'])
})

test('when ties are disabled, the first player to attain the final high score wins', () => {
  const gameSettings = {
    winningScore: 1_000,
    openingScore: 0,
    allowTies: false,
  }
  const triggerRoll = selectRecommended(roll([1, 1, 1, 2, 3, 4], gameSettings))
  const chase = acknowledgePass(bankScore(triggerRoll))
  const tieRoll = selectRecommended(rollDice(chase, Math.random, [1, 1, 1, 2, 3, 4]))
  const finished = bankScore(tieRoll)

  assert.equal(finished.phase, 'finished')
  assert.equal(finished.players[0]!.score, 1_000)
  assert.equal(finished.players[1]!.score, 1_000)
  assert.deepEqual(finished.winnerIds, ['player-1'])
})

test('Stealing passes a banked partial turn only to an eligible next player', () => {
  const partial = selectRecommended(roll([1, 2, 3, 4, 6, 2], {
    openingScore: 0,
    stealing: true,
  }))
  const offered = bankScore(partial)
  assert.equal(offered.continuation?.inheritedScore, 100)
  assert.equal(offered.continuation?.diceInPlay, 5)

  const choice = acknowledgePass(offered)
  assert.equal(choice.phase, 'steal')
  const accepted = chooseSteal(choice, true)
  assert.equal(accepted.turnScore, 100)
  assert.equal(accepted.diceInPlay, 5)
})

test('Stealing cannot put an unopened player on the board', () => {
  const partial = selectRecommended(roll([1, 1, 1, 2, 3, 4], {
    stealing: true,
  }))
  const offered = bankScore(partial)

  assert.equal(offered.players[0]!.score, 1_000)
  assert.equal(offered.continuation?.inheritedScore, 1_000)

  const freshTurn = acknowledgePass(offered)
  assert.equal(freshTurn.currentPlayerIndex, 1)
  assert.equal(freshTurn.players[1]!.score, 0)
  assert.equal(freshTurn.phase, 'ready')
  assert.equal(freshTurn.continuation, null)
  assert.equal(freshTurn.turnScore, 0)
  assert.equal(freshTurn.diceInPlay, 6)
})

test('declining a steal clears the offer and starts a fresh six-die turn', () => {
  const partial = selectRecommended(roll([1, 2, 3, 4, 6, 2], {
    openingScore: 0,
    stealing: true,
  }))
  const choice = acknowledgePass(bankScore(partial))
  const declined = chooseSteal(choice, false)

  assert.equal(declined.phase, 'ready')
  assert.equal(declined.continuation, null)
  assert.equal(declined.turnScore, 0)
  assert.equal(declined.diceInPlay, 6)
  assert.deepEqual(declined.scoredMultiples, {})
})

test('an accepted multiple continuation can extend and chain to the next player', () => {
  const sourceRoll = selectRecommended(roll([3, 3, 3, 2, 4, 6], {
    openingScore: 0,
    stealing: true,
  }))
  const firstOffer = bankScore(sourceRoll)
  const accepted = chooseSteal(acknowledgePass(firstOffer), true)

  assert.deepEqual(accepted.scoredMultiples, { 3: 3 })

  const extensionRoll = rollDice(accepted, Math.random, [3, 3, 2])
  const secondOffer = bankScore(selectRecommended(extensionRoll))

  assert.equal(secondOffer.players[1]!.score, 1_200)
  assert.equal(secondOffer.continuation?.sourcePlayerId, 'player-2')
  assert.equal(secondOffer.continuation?.inheritedScore, 1_200)
  assert.equal(secondOffer.continuation?.diceInPlay, 1)
  assert.deepEqual(secondOffer.continuation?.scoredMultiples, { 3: 5 })

  const chainedChoice = acknowledgePass(secondOffer)
  assert.equal(chainedChoice.currentPlayerIndex, 0)
  assert.equal(chainedChoice.phase, 'steal')
  assert.equal(chainedChoice.continuation?.sourcePlayerId, 'player-2')
})

test('a bust during a stolen turn loses the inherited score without first-roll mercy', () => {
  const partial = selectRecommended(roll([1, 2, 3, 4, 6, 2], {
    openingScore: 0,
    stealing: true,
  }))
  const accepted = chooseSteal(acknowledgePass(bankScore(partial)), true)
  const busted = rollDice(accepted, Math.random, [2, 2, 3, 4, 6])

  assert.equal(busted.phase, 'pass')
  assert.equal(busted.turnScore, 0)
  assert.equal(busted.continuation, null)
  assert.match(busted.message, /zilched and lost/i)
})

test('hot dice end a stolen continuation without creating another offer', () => {
  const sourceRoll = selectRecommended(roll([3, 3, 3, 2, 4, 6], {
    openingScore: 0,
    stealing: true,
  }))
  const accepted = chooseSteal(acknowledgePass(bankScore(sourceRoll)), true)
  const hotDiceRoll = selectRecommended(rollDice(accepted, Math.random, [3, 3, 3]))
  const banked = bankScore(hotDiceRoll)

  assert.equal(banked.players[1]!.score, 2_400)
  assert.equal(banked.continuation, null)
  assert.equal(banked.phase, 'pass')
})
