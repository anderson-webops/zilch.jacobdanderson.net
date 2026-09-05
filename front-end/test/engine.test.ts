/* eslint-disable test/no-import-node-test */
import type { DieValue, GameSettings } from '../src/game/types.ts'
import assert from 'node:assert/strict'

import test from 'node:test'
import {
  acknowledgeBust,
  acknowledgePass,
  bankScore,
  canBank,
  chooseSteal,
  createGame,
  defaultComputerDifficulty,
  defaultSettings,
  recommendedComputerDieIds,
  restoreGame,
  rollAgain,
  rollDice,
  selectComputerRecommended,
  selectRecommended,
  shouldComputerBank,
  shouldComputerSteal,
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
  assert.equal(game.schemaVersion, 2)
  assert.ok(game.players.every(player => player.difficulty === null))
})

test('persists explicit computer difficulty and defaults omitted difficulty to medium', () => {
  const hardGame = createGame([
    { name: 'Computer', kind: 'computer', difficulty: 'hard' },
    { name: 'Alice', kind: 'human' },
  ])
  const defaultGame = createGame([
    { name: 'Computer', kind: 'computer' },
    { name: 'Alice', kind: 'human' },
  ])

  assert.equal(hardGame.players[0]!.difficulty, 'hard')
  assert.equal(hardGame.players[1]!.difficulty, null)
  assert.equal(defaultGame.players[0]!.difficulty, defaultComputerDifficulty)
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

  const legacy = JSON.parse(JSON.stringify(game)) as Record<string, unknown>
  legacy.schemaVersion = 1
  for (const player of legacy.players as Array<Record<string, unknown>>)
    delete player.difficulty
  const migrated = restoreGame(legacy)
  assert.equal(migrated?.schemaVersion, 2)
  assert.deepEqual(migrated?.players.map(player => player.difficulty), [null, null])

  const legacyComputer = JSON.parse(JSON.stringify(createGame([
    { name: 'Computer', kind: 'computer', difficulty: 'hard' },
    { name: 'Alice', kind: 'human' },
  ]))) as Record<string, unknown>
  legacyComputer.schemaVersion = 1
  for (const player of legacyComputer.players as Array<Record<string, unknown>>)
    delete player.difficulty
  assert.equal(restoreGame(legacyComputer)?.players[0]!.difficulty, defaultComputerDifficulty)

  const malformedStates = [
    { ...game, currentPlayerIndex: 9 },
    { ...game, phase: 'selecting', dice: [] },
    { ...game, selectedDieIds: [999] },
    { ...game, players: [{ ...game.players[0], kind: 'robot' }] },
    { ...game, players: [{ ...game.players[0], difficulty: 'impossible' }] },
    { ...game, settings: { ...game.settings, finalChase: 'yes' } },
  ]

  for (const malformed of malformedStates)
    assert.equal(restoreGame(malformed), null)
})

test('first-roll mercy awards 50 at-risk points once, then a later Zilch busts', () => {
  const firstZilch = roll([2, 2, 3, 3, 4, 6])
  assert.equal(firstZilch.phase, 'ready')
  assert.equal(firstZilch.turnScore, 50)
  assert.deepEqual(firstZilch.dice.map(die => die.value), [2, 2, 3, 3, 4, 6])

  const laterZilch = rollDice(firstZilch, Math.random, [2, 2, 3, 3, 4, 6])
  assert.equal(laterZilch.phase, 'bust')
  assert.equal(laterZilch.turnScore, 0)
  assert.deepEqual(laterZilch.dice.map(die => die.value), [2, 2, 3, 3, 4, 6])
  assert.equal(laterZilch.nextPlayerIndex, 1)
  assert.match(laterZilch.message, /^Bust!/)

  const nextTurn = acknowledgeBust(laterZilch)
  assert.equal(nextTurn.phase, 'ready')
  assert.equal(nextTurn.currentPlayerIndex, 1)
  assert.deepEqual(nextTurn.dice, [])
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
  assert.equal(finalBust.phase, 'bust')
  assert.equal(finalBust.endgame?.remainingTurns, 1)

  const finished = acknowledgeBust(finalBust)
  assert.equal(finished.phase, 'finished')
  assert.equal(finished.endgame?.remainingTurns, 0)
  assert.deepEqual(finished.winnerIds, ['player-1'])
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

  const bobTurn = acknowledgeBust(rollDice(
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
  const carolBust = rollDice(carolTurn, Math.random, [2, 2, 3, 3, 4, 6])
  assert.equal(carolBust.phase, 'bust')
  assert.equal(carolBust.currentPlayerIndex, 2)
  assert.equal(carolBust.nextPlayerIndex, 0)
  assert.equal(carolBust.endgame?.remainingTurns, 2)

  const aliceTurn = acknowledgeBust(carolBust)
  assert.equal(aliceTurn.endgame?.remainingTurns, 1)
  const aliceBust = rollDice(aliceTurn, Math.random, [2, 2, 3, 3, 4, 6])
  assert.equal(aliceBust.phase, 'bust')
  const finished = acknowledgeBust(aliceBust)
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

  assert.equal(busted.phase, 'bust')
  assert.equal(busted.turnScore, 0)
  assert.equal(busted.continuation, null)
  assert.deepEqual(busted.dice.map(die => die.value), [2, 2, 3, 4, 6])
  assert.match(busted.message, /bust/i)
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

test('hard computer selection ports the trained policy option utility', () => {
  const hard = rollDice(createGame([
    { name: 'Computer', kind: 'computer', difficulty: 'hard' },
    { name: 'Alice', kind: 'human' },
  ], settings({ openingScore: 0 })), Math.random, [1, 5, 2, 2, 3, 4])
  const medium = rollDice(createGame([
    { name: 'Computer', kind: 'computer', difficulty: 'medium' },
    { name: 'Alice', kind: 'human' },
  ], settings({ openingScore: 0 })), Math.random, [1, 5, 2, 2, 3, 4])

  const hardIds = recommendedComputerDieIds(hard)
  assert.deepEqual(hard.dice.filter(die => hardIds.includes(die.id)).map(die => die.value), [1])

  const mediumSelected = selectComputerRecommended(medium)
  assert.deepEqual(
    mediumSelected.dice
      .filter(die => mediumSelected.selectedDieIds.includes(die.id))
      .map(die => die.value),
    [1, 5],
  )
})

test('hard switches to the stealing-trained scoring policy when stealing is on', () => {
  function selectedValues(stealing: boolean) {
    const selected = selectComputerRecommended(rollDice(createGame([
      { name: 'Computer', kind: 'computer', difficulty: 'hard' },
      { name: 'Alice', kind: 'human' },
    ], settings({ openingScore: 0, stealing })), Math.random, [2, 2, 2, 1, 3, 4]))
    return selected.dice
      .filter(die => selected.selectedDieIds.includes(die.id))
      .map(die => die.value)
  }

  assert.deepEqual(selectedValues(false), [2, 2, 2])
  assert.deepEqual(selectedValues(true), [2, 2, 2, 1])
})

test('hard switches bank thresholds with the stealing-trained policy', () => {
  function bankDecision(stealing: boolean) {
    const game = createGame([
      { name: 'Computer', kind: 'computer', difficulty: 'hard' },
      { name: 'Alice', kind: 'human' },
    ], settings({ openingScore: 0, stealing }))
    game.diceInPlay = 4
    const rolled = rollDice(game, Math.random, [1, 5, 2, 3])
    rolled.selectedDieIds = rolled.dice
      .filter(die => die.value === 1 || die.value === 5)
      .map(die => die.id)
    rolled.turnScore = 650
    return shouldComputerBank(rolled)
  }

  assert.equal(bankDecision(false), false)
  assert.equal(bankDecision(true), true)
})

test('hard steal acceptance follows the stealing-trained utility cutoffs', () => {
  const game = createGame([
    { name: 'Computer', kind: 'computer', difficulty: 'hard' },
    { name: 'Alice', kind: 'human' },
  ], settings({ openingScore: 0, stealing: true }))
  const minimumByDice = new Map([
    [1, 550],
    [2, 450],
    [3, 350],
    [4, 250],
    [5, 150],
  ])

  for (const [diceInPlay, minimum] of minimumByDice) {
    game.continuation = {
      sourcePlayerId: 'player-2',
      sourcePlayerName: 'Alice',
      inheritedScore: minimum - 50,
      diceInPlay,
      scoredMultiples: {},
    }
    assert.equal(shouldComputerSteal(game), false)
    game.continuation.inheritedScore = minimum
    assert.equal(shouldComputerSteal(game), true)
  }
})

test('easy banks at a simple threshold while hard uses the trained dice threshold', () => {
  const easy = selectComputerRecommended(rollDice(createGame([
    { name: 'Computer', kind: 'computer', difficulty: 'easy' },
    { name: 'Alice', kind: 'human' },
  ], settings({ openingScore: 0 })), Math.random, [2, 2, 2, 3, 4, 6]))
  const hard = selectComputerRecommended(rollDice(createGame([
    { name: 'Computer', kind: 'computer', difficulty: 'hard' },
    { name: 'Alice', kind: 'human' },
  ], settings({ openingScore: 0 })), Math.random, [2, 2, 2, 3, 4, 6]))
  easy.turnScore = 400
  hard.turnScore = 400

  assert.equal(shouldComputerBank(easy), true)
  assert.equal(shouldComputerBank(hard), false)
})

function hardRoll(turnScore: number, values: DieValue[], overrides: Partial<GameSettings> = {}) {
  const game = createGame([
    { name: 'Computer', kind: 'computer', difficulty: 'hard' },
    { name: 'Alice', kind: 'human' },
  ], settings(overrides))
  game.turnScore = turnScore
  game.rollNumber = 1
  game.diceInPlay = values.length
  return selectComputerRecommended(rollDice(game, Math.random, values))
}

test('refined Hard rolls the reported 2800-point hot dice with both banked scores zero', () => {
  const game = hardRoll(1800, [2, 2, 3, 3, 4, 4])
  assert.ok(game.players.every(player => player.score === 0))
  assert.equal(game.endgame, null)
  assert.equal(game.selectedDieIds.length, 6)
  assert.equal(shouldComputerBank(game), false)
  const next = rollAgain(game, Math.random, [1, 2, 3, 4, 5, 6])
  assert.equal(next.turnScore, 2800)
  assert.equal(next.diceInPlay, 6)
})

test('Hard collects every guaranteed scoring die before banking a partial roll', () => {
  const game = hardRoll(2700, [1, 1, 5, 2, 3, 4])
  assert.deepEqual(game.selectedDieIds, game.dice.slice(0, 3).map(die => die.id))
  assert.equal(shouldComputerBank(game), true)
  assert.equal(bankScore(game).players[0]!.score, 2950)
})

test('bank collection preserves its commitment through hot dice and saved-game restoration', () => {
  const game = hardRoll(1300, [1, 1, 5])
  assert.equal(game.selectedDieIds.length, 3)
  assert.equal(shouldComputerBank(game), true)
  assert.equal(bankScore(game).players[0]!.score, 1550)
  const restored = restoreGame(JSON.parse(JSON.stringify(game)))
  assert.ok(restored)
  assert.equal(shouldComputerBank(restored), true)
  // The plan is derived from this roll, never retained on a shared controller.
  assert.equal(shouldComputerBank(hardRoll(0, [1, 1, 5], { openingScore: 0 })), false)
})

test('Hard collection does not alter Stealing selection or its six-dice cutoff', () => {
  const game = hardRoll(2700, [1, 1, 5, 2, 3, 4], { stealing: true })
  assert.equal(game.selectedDieIds.length, 2)
  assert.equal(shouldComputerBank(game), true)
  assert.equal(bankScore(game).players[0]!.score, 2900)
  assert.equal(shouldComputerBank(hardRoll(1800, [2, 2, 3, 3, 4, 4], { stealing: true })), true)
})

test('resuming refreshes legacy computer selections without changing human choices', () => {
  const legacy = hardRoll(2700, [1, 1, 5, 2, 3, 4])
  legacy.selectedDieIds = [legacy.dice[0]!.id]
  const restored = restoreGame(JSON.parse(JSON.stringify(legacy)))
  assert.ok(restored)
  const resumed = selectComputerRecommended(restored)
  assert.equal(shouldComputerBank(resumed), true)
  assert.equal(bankScore(resumed).players[0]!.score, 2950)

  const human = roll([1, 1, 5, 2, 3, 4])
  human.selectedDieIds = [human.dice[0]!.id]
  assert.deepEqual(selectComputerRecommended(human).selectedDieIds, human.selectedDieIds)
})

test('Hard still banks an immediate win while collecting extra safe points', () => {
  const game = hardRoll(4800, [1, 1, 5, 2, 3, 4], { finalChase: false })
  assert.equal(game.selectedDieIds.length, 3)
  assert.equal(shouldComputerBank(game), true)
  assert.equal(bankScore(game).phase, 'finished')
  assert.equal(bankScore(game).players[0]!.score, 5050)
})

test('Hard preserves fractional threshold adjustments rather than prematurely banking', () => {
  const game = hardRoll(1250, [2, 2, 2, 3, 4, 6])
  game.players[1]!.score = 1100
  assert.equal(shouldComputerBank(game), false)
  game.turnScore += 50
  assert.equal(shouldComputerBank(game), true)
})

test('medium stages below the target when safe and builds a buffer against a close opponent', () => {
  function mediumDecision(playerScore: number, opponentScore: number, turnScore = 0) {
    const game = createGame([
      { name: 'Computer', kind: 'computer', difficulty: 'medium' },
      { name: 'Alice', kind: 'human' },
    ], settings({ openingScore: 0, winningScore: 5_000, finalChase: true }))
    game.players[0]!.score = playerScore
    game.players[1]!.score = opponentScore
    game.turnScore = turnScore
    return shouldComputerBank(selectComputerRecommended(rollDice(
      game,
      Math.random,
      [1, 2, 2, 3, 4, 6],
    )))
  }

  assert.equal(mediumDecision(4_800, 3_500), true)
  assert.equal(mediumDecision(4_800, 4_700), false)
  assert.equal(mediumDecision(4_900, 4_700), false)
  assert.equal(mediumDecision(4_900, 4_700, 1_000), true)
})

test('a computer in Final Chase keeps rolling until it can tie or beat the leader', () => {
  const game = createGame([
    { name: 'Computer', kind: 'computer', difficulty: 'hard' },
    { name: 'Alice', kind: 'human' },
  ], settings({ openingScore: 0, winningScore: 5_000, finalChase: true, allowTies: true }))
  game.players[0]!.score = 4_900
  game.players[1]!.score = 5_500
  game.turnScore = 500
  game.endgame = { triggerPlayerId: 'player-2', remainingTurns: 1 }
  const tied = selectComputerRecommended(rollDice(game, Math.random, [1, 2, 2, 3, 4, 6]))

  assert.equal(shouldComputerBank(tied), true)
  tied.settings.allowTies = false
  assert.equal(shouldComputerBank(tied), false)
  tied.turnScore += 50
  assert.equal(shouldComputerBank(tied), true)
})

test('messages remain grammatical when a player chooses the legacy name You', () => {
  const start = createGame([{ name: 'You', kind: 'human' }], settings({
    openingScore: 0,
    winningScore: 1_000,
    finalChase: false,
  }))
  assert.equal(start.message, 'You start. Roll all six dice.')

  const finished = bankScore(selectRecommended(rollDice(start, Math.random, [1, 1, 1, 2, 3, 4])))
  assert.equal(finished.message, 'You win with 1,000 points.')

  const passToYou = acknowledgeBust(rollDice(createGame([
    { name: 'Alice', kind: 'human' },
    { name: 'You', kind: 'human' },
  ], settings({ firstRollBust: false })), Math.random, [2, 2, 3, 3, 4, 6]))
  assert.equal(passToYou.message, 'Your turn. Roll all six dice.')

  const stealingGame = createGame([
    { name: 'Alice', kind: 'human' },
    { name: 'You', kind: 'human' },
  ], settings({ openingScore: 0, stealing: true }))
  stealingGame.players[1]!.score = 1_000
  const offer = acknowledgePass(bankScore(selectRecommended(rollDice(
    stealingGame,
    Math.random,
    [1, 2, 2, 3, 4, 6],
  ))))
  const declined = chooseSteal(offer, false)
  assert.equal(declined.message, 'You decline the steal and start fresh.')
})
