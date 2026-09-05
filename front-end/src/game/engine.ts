import type {
  ComputerDifficulty,
  DieValue,
  GameEvent,
  GameSettings,
  GameState,
  MultipleChains,
  PlayerDraft,
  SelectionResult,
} from './types.ts'
import {
  hasScoringOption,
  recommendedDieIds,
  scoreSelection,
  selectableDieIds,
} from './scoring.ts'

export const defaultSettings: GameSettings = {
  winningScore: 5_000,
  openingScore: 1_000,
  firstRollBust: true,
  finalChase: true,
  allowTies: true,
  stealing: false,
}

export const defaultComputerDifficulty: ComputerDifficulty = 'medium'

export interface ComputerPolicy {
  readonly name: string
  readonly bankThresholdByDice: Readonly<Record<number, number>>
  readonly scoreWeight: number
  readonly remainingDiceWeight: number
  readonly hotDiceWeight: number
  readonly multipleWeight: number
  readonly leadFactor: number
  readonly trailFactor: number
  readonly closingFactor: number
  readonly rollBias: number
}

const easyComputerPolicy: ComputerPolicy = {
  name: 'Easy',
  bankThresholdByDice: { 1: 600, 2: 600, 3: 600, 4: 600, 5: 600, 6: 600 },
  scoreWeight: 1,
  remainingDiceWeight: 0,
  hotDiceWeight: 0,
  multipleWeight: 0,
  leadFactor: 0,
  trailFactor: 0,
  closingFactor: 0,
  rollBias: 0,
}

const mediumComputerPolicy: ComputerPolicy = {
  name: 'Medium',
  bankThresholdByDice: { 1: 350, 2: 500, 3: 700, 4: 850, 5: 1_000, 6: 1_150 },
  scoreWeight: 1,
  remainingDiceWeight: 55,
  hotDiceWeight: 240,
  multipleWeight: 95,
  leadFactor: 0.08,
  trailFactor: 0.1,
  closingFactor: 0.25,
  rollBias: 15,
}

/**
 * The trained policy with a separately holdout-tested six-dice refinement.
 * See docs/research/hot-dice-2026-09 for the frozen candidate and full evidence.
 */
export const simulationDerivedHardPolicy: ComputerPolicy = {
  name: 'Hard',
  bankThresholdByDice: { 1: 200, 2: 1_021, 3: 1_128, 4: 1_506, 5: 2_130, 6: 5_000 },
  scoreWeight: 1.0045,
  remainingDiceWeight: 36.0805,
  hotDiceWeight: 354.561,
  multipleWeight: 91.9329,
  leadFactor: 0,
  trailFactor: 0.293194,
  closingFactor: 0.193316,
  rollBias: 136.066,
}

/**
 * The strongest holdout-tested policy trained with stealing enabled. Stealing
 * materially changes the value of preserving dice, so Hard uses this complete
 * policy whenever that house rule is active.
 */
export const simulationDerivedHardStealingPolicy: ComputerPolicy = {
  name: 'Hard with stealing',
  bankThresholdByDice: { 1: 313, 2: 313, 3: 1_106, 4: 1_360, 5: 1_360, 6: 1_376 },
  scoreWeight: 0.88553,
  remainingDiceWeight: 91.2663,
  hotDiceWeight: 229.628,
  multipleWeight: 94.2546,
  leadFactor: 0,
  trailFactor: 0.187935,
  closingFactor: 0.20764,
  rollBias: -26.2974,
}

export const computerPolicies: Readonly<Record<ComputerDifficulty, ComputerPolicy>> = {
  easy: easyComputerPolicy,
  medium: mediumComputerPolicy,
  hard: simulationDerivedHardPolicy,
}

function computerPolicy(state: GameState, difficulty: ComputerDifficulty) {
  return difficulty === 'hard' && state.settings.stealing
    ? simulationDerivedHardStealingPolicy
    : computerPolicies[difficulty]
}

export const defaultPlayers: PlayerDraft[] = [
  { name: 'Player 1', kind: 'human' },
  { name: 'Computer', kind: 'computer', difficulty: defaultComputerDifficulty },
]

function clone(state: GameState) {
  return structuredClone(state)
}

function currentPlayer(state: GameState) {
  return state.players[state.currentPlayerIndex]!
}

function isSecondPersonName(name: string) {
  return name.trim().toLocaleLowerCase() === 'you'
}

function withPresentVerb(name: string, secondPersonVerb: string, thirdPersonVerb: string) {
  return `${name} ${isSecondPersonName(name) ? secondPersonVerb : thirdPersonVerb}`
}

function possessiveName(name: string) {
  return isSecondPersonName(name) ? 'your' : `${name}'s`
}

function turnOwner(name: string) {
  return isSecondPersonName(name) ? 'Your' : `${name}'s`
}

function addEvent(state: GameState, text: string, tone: GameEvent['tone'] = 'neutral') {
  state.eventSequence += 1
  state.events.unshift({ id: state.eventSequence, text, tone })
  state.events = state.events.slice(0, 8)
  state.message = text
}

function validateSettings(settings: GameSettings) {
  if (!Number.isSafeInteger(settings.winningScore) || settings.winningScore < 1_000 || settings.winningScore > 1_000_000)
    throw new RangeError('Winning score must be between 1,000 and 1,000,000.')
  if (!Number.isSafeInteger(settings.openingScore) || settings.openingScore < 0 || settings.openingScore > settings.winningScore)
    throw new RangeError('Opening score must be between zero and the winning score.')
  if (
    typeof settings.firstRollBust !== 'boolean'
    || typeof settings.finalChase !== 'boolean'
    || typeof settings.allowTies !== 'boolean'
    || typeof settings.stealing !== 'boolean'
  ) {
    throw new TypeError('House-rule settings must be booleans.')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isComputerDifficulty(value: unknown): value is ComputerDifficulty {
  return value === 'easy' || value === 'medium' || value === 'hard'
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function isGameSettings(value: unknown): value is GameSettings {
  if (!isRecord(value))
    return false
  try {
    validateSettings(value as unknown as GameSettings)
    return true
  }
  catch {
    return false
  }
}

function isPlayer(value: unknown): value is GameState['players'][number] {
  if (!isRecord(value))
    return false
  return typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.name === 'string'
    && value.name.trim().length > 0
    && value.name.length <= 30
    && (value.kind === 'human' || value.kind === 'computer')
    && (value.kind === 'human'
      ? value.difficulty === null
      : isComputerDifficulty(value.difficulty))
    && isNonNegativeInteger(value.score)
    && isNonNegativeInteger(value.scoreReachedAt)
}

function isDie(value: unknown): value is GameState['dice'][number] {
  if (!isRecord(value))
    return false
  return isNonNegativeInteger(value.id)
    && Number.isInteger(value.value)
    && Number(value.value) >= 1
    && Number(value.value) <= 6
}

function isMultipleChains(value: unknown): value is GameState['scoredMultiples'] {
  if (!isRecord(value))
    return false
  return Object.entries(value).every(([face, count]) => /^[1-6]$/.test(face)
    && Number.isSafeInteger(count)
    && Number(count) >= 3
    && Number(count) <= 6)
}

function isGameEvent(value: unknown): value is GameState['events'][number] {
  if (!isRecord(value))
    return false
  return isNonNegativeInteger(value.id)
    && typeof value.text === 'string'
    && (value.tone === 'neutral' || value.tone === 'good' || value.tone === 'risk' || value.tone === 'special')
}

function isContinuation(value: unknown): value is NonNullable<GameState['continuation']> {
  if (!isRecord(value))
    return false
  return typeof value.sourcePlayerId === 'string'
    && typeof value.sourcePlayerName === 'string'
    && value.sourcePlayerName.length > 0
    && isNonNegativeInteger(value.inheritedScore)
    && Number.isSafeInteger(value.diceInPlay)
    && Number(value.diceInPlay) >= 1
    && Number(value.diceInPlay) <= 5
    && isMultipleChains(value.scoredMultiples)
}

function isEndgame(value: unknown): value is NonNullable<GameState['endgame']> {
  if (!isRecord(value))
    return false
  return typeof value.triggerPlayerId === 'string'
    && isNonNegativeInteger(value.remainingTurns)
}

function isGamePhase(value: unknown): value is GameState['phase'] {
  return value === 'ready'
    || value === 'selecting'
    || value === 'bust'
    || value === 'pass'
    || value === 'steal'
    || value === 'finished'
}

function isRestorableGameState(value: unknown): value is GameState {
  if (!isRecord(value)
    || value.schemaVersion !== 2
    || !isGameSettings(value.settings)
    || !Array.isArray(value.players)
    || value.players.length < 1
    || value.players.length > 6
    || !value.players.every(isPlayer)
    || !value.players.some(player => player.kind === 'human')
    || !isGamePhase(value.phase)
    || !Array.isArray(value.dice)
    || value.dice.length > 6
    || !value.dice.every(isDie)
    || !Array.isArray(value.selectedDieIds)
    || !value.selectedDieIds.every(isNonNegativeInteger)
    || !Number.isSafeInteger(value.diceInPlay)
    || Number(value.diceInPlay) < 1
    || Number(value.diceInPlay) > 6
    || !isNonNegativeInteger(value.turnScore)
    || !isMultipleChains(value.scoredMultiples)
    || !isNonNegativeInteger(value.rollNumber)
    || !isNonNegativeInteger(value.bankSequence)
    || !isNonNegativeInteger(value.eventSequence)
    || typeof value.message !== 'string'
    || !Array.isArray(value.events)
    || !value.events.every(isGameEvent)
    || (value.continuation !== null && !isContinuation(value.continuation))
    || (value.endgame !== null && !isEndgame(value.endgame))
    || !Array.isArray(value.winnerIds)
    || !value.winnerIds.every(winnerId => typeof winnerId === 'string')) {
    return false
  }

  const playerIds = value.players.map(player => player.id)
  const dieIds = value.dice.map(die => die.id)
  const eventIds = value.events.map(event => event.id)
  const currentPlayerIndex = Number(value.currentPlayerIndex)
  const nextPlayerIndex = value.nextPlayerIndex === null ? null : Number(value.nextPlayerIndex)
  return Number.isSafeInteger(value.currentPlayerIndex)
    && currentPlayerIndex >= 0
    && currentPlayerIndex < value.players.length
    && (value.nextPlayerIndex === null
      || (Number.isSafeInteger(value.nextPlayerIndex) && nextPlayerIndex! >= 0 && nextPlayerIndex! < value.players.length))
    && (value.phase === 'pass' || value.phase === 'bust' ? nextPlayerIndex !== null : nextPlayerIndex === null)
    && (value.phase !== 'selecting' || value.dice.length > 0)
    && (value.phase !== 'bust' || value.dice.length > 0)
    && (value.phase !== 'steal' || value.continuation !== null)
    && new Set(playerIds).size === playerIds.length
    && new Set(dieIds).size === dieIds.length
    && new Set(eventIds).size === eventIds.length
    && new Set(value.selectedDieIds).size === value.selectedDieIds.length
    && value.selectedDieIds.every(dieId => dieIds.includes(dieId))
    && value.winnerIds.every(winnerId => playerIds.includes(winnerId))
    && new Set(value.winnerIds).size === value.winnerIds.length
    && (value.continuation === null || playerIds.includes(value.continuation.sourcePlayerId))
    && (value.endgame === null || playerIds.includes(value.endgame.triggerPlayerId))
    && (value.phase !== 'finished' || value.winnerIds.length > 0)
}

export function createGame(playerDrafts: PlayerDraft[], settings: GameSettings = defaultSettings): GameState {
  validateSettings(settings)
  if (playerDrafts.length < 1 || playerDrafts.length > 6)
    throw new RangeError('Zilch supports between one and six players.')
  if (!playerDrafts.some(player => player.kind === 'human'))
    throw new RangeError('At least one human player is required.')
  if (playerDrafts.some(player => player.kind === 'computer'
    && player.difficulty !== undefined
    && !isComputerDifficulty(player.difficulty))) {
    throw new RangeError('Computer difficulty must be easy, medium, or hard.')
  }

  const normalizedNames = playerDrafts.map((player, index) => player.name.trim().slice(0, 30) || `Player ${index + 1}`)
  if (new Set(normalizedNames.map(name => name.toLocaleLowerCase())).size !== normalizedNames.length)
    throw new RangeError('Player names must be unique.')

  const players = playerDrafts.map((player, index) => ({
    id: `player-${index + 1}`,
    name: normalizedNames[index]!,
    kind: player.kind,
    difficulty: player.kind === 'computer'
      ? player.difficulty ?? defaultComputerDifficulty
      : null,
    score: 0,
    scoreReachedAt: 0,
  }))

  return {
    schemaVersion: 2,
    settings: { ...settings },
    players,
    currentPlayerIndex: 0,
    nextPlayerIndex: null,
    phase: 'ready',
    dice: [],
    diceInPlay: 6,
    selectedDieIds: [],
    turnScore: 0,
    scoredMultiples: {},
    rollNumber: 0,
    bankSequence: 0,
    eventSequence: 1,
    message: `${withPresentVerb(players[0]!.name, 'start', 'starts')}. Roll all six dice.`,
    events: [{
      id: 1,
      text: `${withPresentVerb(players[0]!.name, 'start', 'starts')}. Roll all six dice.`,
      tone: 'neutral',
    }],
    continuation: null,
    endgame: null,
    winnerIds: [],
  }
}

function randomDie(random: () => number): DieValue {
  return (Math.floor(random() * 6) + 1) as DieValue
}

function buildRoll(state: GameState, random: () => number, forcedValues?: DieValue[]) {
  if (forcedValues && forcedValues.length !== state.diceInPlay)
    throw new RangeError(`Expected ${state.diceInPlay} forced dice values.`)

  const values = forcedValues ?? Array.from({ length: state.diceInPlay }, () => randomDie(random))
  state.rollNumber += 1
  state.dice = values.map((value, index) => ({
    id: state.rollNumber * 10 + index,
    value,
  }))
  state.selectedDieIds = []
}

export function rollDice(state: GameState, random: () => number = Math.random, forcedValues?: DieValue[]) {
  if (state.phase !== 'ready')
    throw new Error('Dice can only be rolled when the turn is ready.')

  const next = clone(state)
  const player = currentPlayer(next)
  const isFirstRoll = next.turnScore === 0
    && next.diceInPlay === 6
    && Object.keys(next.scoredMultiples).length === 0

  buildRoll(next, random, forcedValues)
  if (hasScoringOption(next.dice, next.scoredMultiples)) {
    next.phase = 'selecting'
    addEvent(next, `${player.name} rolled. Choose scoring dice.`, 'neutral')
    return next
  }

  if (isFirstRoll && next.settings.firstRollBust) {
    next.turnScore = 50
    next.diceInPlay = 6
    addEvent(next, 'First-roll Zilch: this roll is a bust, but mercy puts 50 points at risk for one fresh roll.', 'special')
    return next
  }

  next.turnScore = 0
  next.scoredMultiples = {}
  next.continuation = null
  next.nextPlayerIndex = (next.currentPlayerIndex + 1) % next.players.length
  next.phase = 'bust'
  addEvent(next, `Bust! ${player.name} rolled no scoring dice and lost the turn's points.`, 'risk')
  return next
}

export function toggleDie(state: GameState, dieId: number) {
  if (state.phase !== 'selecting' || currentPlayer(state).kind !== 'human')
    return state
  if (!selectableDieIds(state.dice, state.scoredMultiples).includes(dieId))
    return state

  const next = clone(state)
  const selected = new Set(next.selectedDieIds)
  if (selected.has(dieId))
    selected.delete(dieId)
  else
    selected.add(dieId)
  next.selectedDieIds = [...selected]
  return next
}

export function selectRecommended(state: GameState) {
  if (state.phase !== 'selecting')
    return state
  const next = clone(state)
  next.selectedDieIds = recommendedDieIds(next.dice, next.scoredMultiples)
  return next
}

export function selectionResult(state: GameState): SelectionResult {
  return scoreSelection(state.dice, state.selectedDieIds, state.scoredMultiples)
}

function applySelection(state: GameState) {
  const result = selectionResult(state)
  if (!result.valid)
    throw new Error(result.reason || 'Choose a valid scoring combination.')

  state.turnScore += result.score
  state.scoredMultiples = {
    ...state.scoredMultiples,
    ...result.multipleUpdates,
  }

  const remainingDice = state.dice.length - result.selectedCount
  state.dice = []
  state.selectedDieIds = []
  if (remainingDice === 0) {
    state.diceInPlay = 6
    state.scoredMultiples = {}
    addEvent(state, `Hot dice! ${result.label} scored ${result.score.toLocaleString()} and all six dice return.`, 'special')
  }
  else {
    state.diceInPlay = remainingDice
    const diceMessage = remainingDice === 1 ? '1 die remains' : `${remainingDice} dice remain`
    addEvent(state, `${result.label} scored ${result.score.toLocaleString()}. ${diceMessage}.`, 'good')
  }

  state.phase = 'ready'
  return result
}

export function rollAgain(
  state: GameState,
  random: () => number = Math.random,
  forcedValues?: DieValue[],
) {
  if (state.phase !== 'selecting')
    throw new Error('Select scoring dice before rolling again.')
  const next = clone(state)
  applySelection(next)
  return rollDice(next, random, forcedValues)
}

export function projectedTurnScore(state: GameState) {
  const result = selectionResult(state)
  return state.turnScore + (result.valid ? result.score : 0)
}

export function canBank(state: GameState) {
  if (state.phase !== 'selecting')
    return false
  const result = selectionResult(state)
  if (!result.valid)
    return false
  const player = currentPlayer(state)
  const projected = state.turnScore + result.score
  return player.score >= state.settings.openingScore || projected >= state.settings.openingScore
}

function resolveWinners(state: GameState) {
  const highScore = Math.max(...state.players.map(player => player.score))
  const tied = state.players.filter(player => player.score === highScore)
  if (state.settings.allowTies)
    return tied.map(player => player.id)
  return [tied.toSorted((a, b) => a.scoreReachedAt - b.scoreReachedAt)[0]!.id]
}

function finishGame(state: GameState) {
  state.phase = 'finished'
  state.nextPlayerIndex = null
  state.winnerIds = resolveWinners(state)
  const winners = state.players.filter(player => state.winnerIds.includes(player.id))
  const highScore = winners[0]?.score ?? 0
  const names = winners.map(player => player.name).join(' and ')
  addEvent(
    state,
    winners.length > 1
      ? `${names} tie at ${highScore.toLocaleString()} points.`
      : `${withPresentVerb(names, 'win', 'wins')} with ${highScore.toLocaleString()} points.`,
    'special',
  )
  return state
}

function completeTurn(state: GameState, banked: boolean) {
  const player = currentPlayer(state)

  if (banked && !state.endgame && player.score >= state.settings.winningScore) {
    if (!state.settings.finalChase || state.players.length === 1)
      return finishGame(state)

    state.endgame = {
      triggerPlayerId: player.id,
      remainingTurns: state.players.length - 1,
    }
    addEvent(state, `${player.name} reached ${state.settings.winningScore.toLocaleString()}. Final chase begins.`, 'special')
  }
  else if (state.endgame && player.id !== state.endgame.triggerPlayerId) {
    state.endgame.remainingTurns -= 1
    if (state.endgame.remainingTurns <= 0)
      return finishGame(state)
  }

  state.nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length
  state.phase = 'pass'
  return state
}

export function bankScore(state: GameState) {
  if (!canBank(state))
    throw new Error('The current score cannot be banked yet.')

  const next = clone(state)
  const player = currentPlayer(next)
  const result = applySelection(next)
  const bankedScore = next.turnScore
  const remainingDice = next.diceInPlay
  const savedMultiples = { ...next.scoredMultiples }

  next.bankSequence += 1
  player.score += bankedScore
  player.scoreReachedAt = next.bankSequence

  if (next.settings.stealing && remainingDice > 0 && remainingDice < 6 && bankedScore > 0) {
    next.continuation = {
      sourcePlayerId: player.id,
      sourcePlayerName: player.name,
      inheritedScore: bankedScore,
      diceInPlay: remainingDice,
      scoredMultiples: savedMultiples,
    }
  }
  else {
    next.continuation = null
  }

  next.turnScore = 0
  next.dice = []
  next.selectedDieIds = []
  next.diceInPlay = 6
  next.scoredMultiples = {}
  addEvent(next, `${player.name} banked ${bankedScore.toLocaleString()} after scoring ${result.score.toLocaleString()} on the roll.`, 'good')
  return completeTurn(next, true)
}

export function acknowledgePass(state: GameState) {
  if (state.phase !== 'pass' || state.nextPlayerIndex === null)
    return state

  const nextPlayerIndex = state.nextPlayerIndex
  const next = clone(state)
  next.currentPlayerIndex = nextPlayerIndex
  next.nextPlayerIndex = null
  next.dice = []
  next.selectedDieIds = []
  next.turnScore = 0
  next.diceInPlay = 6
  next.scoredMultiples = {}

  const player = currentPlayer(next)
  const canSteal = next.settings.stealing
    && next.continuation !== null
    && next.continuation.sourcePlayerId !== player.id
    && player.score >= next.settings.openingScore

  if (canSteal) {
    next.phase = 'steal'
    addEvent(next, `${player.name} may continue ${possessiveName(next.continuation!.sourcePlayerName)} banked turn.`, 'risk')
  }
  else {
    next.continuation = null
    next.phase = 'ready'
    addEvent(next, `${turnOwner(player.name)} turn. Roll all six dice.`, 'neutral')
  }
  return next
}

export function acknowledgeBust(state: GameState) {
  if (state.phase !== 'bust')
    return state

  const next = clone(state)
  next.nextPlayerIndex = null
  next.dice = []
  next.selectedDieIds = []
  const completed = completeTurn(next, false)
  return completed.phase === 'pass' ? acknowledgePass(completed) : completed
}

export function chooseSteal(state: GameState, accept: boolean) {
  if (state.phase !== 'steal' || !state.continuation)
    return state

  const next = clone(state)
  const player = currentPlayer(next)
  const continuation = next.continuation
  if (!continuation)
    return state
  if (accept) {
    next.turnScore = continuation.inheritedScore
    next.diceInPlay = continuation.diceInPlay
    next.scoredMultiples = { ...continuation.scoredMultiples }
    addEvent(next, `${withPresentVerb(player.name, 'put', 'puts')} ${next.turnScore.toLocaleString()} inherited points at risk.`, 'risk')
  }
  else {
    next.turnScore = 0
    next.diceInPlay = 6
    next.scoredMultiples = {}
    const freshVerb = isSecondPersonName(player.name) ? 'start' : 'starts'
    addEvent(next, `${withPresentVerb(player.name, 'decline', 'declines')} the steal and ${freshVerb} fresh.`, 'neutral')
  }
  next.continuation = null
  next.phase = 'ready'
  return next
}

interface ComputerScoringOption {
  dieIds: number[]
  score: number
  nextDiceCount: number
  resetsToFullSet: boolean
  isMultiple: boolean
  extendsMultiple: boolean
}

function scoringOptions(dice: GameState['dice'], scoredMultiples: MultipleChains) {
  const options: ComputerScoringOption[] = []
  const allDieIds = dice.map(die => die.id)
  const allDiceResult = scoreSelection(dice, allDieIds, scoredMultiples)
  if (allDiceResult.valid && (allDiceResult.label === 'Straight' || allDiceResult.label === 'Three pairs')) {
    options.push({
      dieIds: allDieIds,
      score: allDiceResult.score,
      nextDiceCount: 6,
      resetsToFullSet: true,
      isMultiple: false,
      extendsMultiple: false,
    })
  }

  for (let value = 1 as DieValue; value <= 6; value = (value + 1) as DieValue) {
    const matchingDice = dice.filter(die => die.value === value)
    if (matchingDice.length === 0)
      continue

    const priorMultiple = scoredMultiples[value] ?? 0
    const dieIds = priorMultiple >= 3 || matchingDice.length >= 3
      ? matchingDice.map(die => die.id)
      : value === 1 || value === 5
        ? [matchingDice[0]!.id]
        : []
    if (dieIds.length === 0)
      continue

    const result = scoreSelection(dice, dieIds, scoredMultiples)
    if (!result.valid)
      continue

    const resetsToFullSet = dieIds.length === dice.length
    options.push({
      dieIds,
      score: result.score,
      nextDiceCount: resetsToFullSet ? 6 : dice.length - dieIds.length,
      resetsToFullSet,
      isMultiple: Object.keys(result.multipleUpdates).length > 0,
      extendsMultiple: Object.keys(result.multipleUpdates)
        .some(face => (scoredMultiples[Number(face) as DieValue] ?? 0) >= 3),
    })
  }
  return options
}

function optionUtility(option: ComputerScoringOption, policy: ComputerPolicy) {
  let utility = policy.scoreWeight * option.score
    + policy.remainingDiceWeight * option.nextDiceCount
  if (option.resetsToFullSet)
    utility += policy.hotDiceWeight
  if (option.isMultiple)
    utility += policy.multipleWeight
  if (option.extendsMultiple)
    utility += policy.multipleWeight * 0.5
  return utility
}

function bestScoringOption(options: ComputerScoringOption[], policy: ComputerPolicy) {
  return options.reduce((best, option) => (
    optionUtility(option, policy) > optionUtility(best, policy) ? option : best
  ))
}

function rollingComputerDieIds(state: GameState) {
  const player = currentPlayer(state)
  if (state.phase !== 'selecting' || player.kind !== 'computer')
    return []
  if (player.difficulty !== 'hard')
    return recommendedDieIds(state.dice, state.scoredMultiples)

  const policy = computerPolicy(state, 'hard')
  let dice = [...state.dice]
  let scoredMultiples = { ...state.scoredMultiples }
  const selectedDieIds: number[] = []

  while (dice.length > 0) {
    const options = scoringOptions(dice, scoredMultiples)
    if (options.length === 0)
      break

    const choice = bestScoringOption(options, policy)
    selectedDieIds.push(...choice.dieIds)
    const result = scoreSelection(dice, choice.dieIds, scoredMultiples)
    scoredMultiples = { ...scoredMultiples, ...result.multipleUpdates }
    dice = dice.filter(die => !choice.dieIds.includes(die.id))

    if (dice.length === 0)
      break
    const remainingOptions = scoringOptions(dice, scoredMultiples)
    if (remainingOptions.length === 0)
      break
    const bestContinuation = bestScoringOption(remainingOptions, policy)
    const rollUtility = policy.rollBias + policy.remainingDiceWeight * dice.length
    if (optionUtility(bestContinuation, policy) < rollUtility)
      break
  }

  return selectedDieIds
}

function computerTurnDecision(state: GameState) {
  const dieIds = rollingComputerDieIds(state)
  const bank = shouldBankSelectedDice({ ...state, selectedDieIds: dieIds })
  const collectBeforeBank = currentPlayer(state).difficulty === 'hard' && !state.settings.stealing
  return {
    dieIds: bank && collectBeforeBank ? recommendedDieIds(state.dice, state.scoredMultiples) : dieIds,
    bank,
  }
}

export function recommendedComputerDieIds(state: GameState) {
  if (state.phase !== 'selecting' || currentPlayer(state).kind !== 'computer')
    return []
  return computerTurnDecision(state).dieIds
}

export function selectComputerRecommended(state: GameState) {
  if (state.phase !== 'selecting' || currentPlayer(state).kind !== 'computer')
    return state
  const next = clone(state)
  next.selectedDieIds = recommendedComputerDieIds(next)
  return next
}

function maxOpponentScore(state: GameState) {
  const player = currentPlayer(state)
  return Math.max(0, ...state.players
    .filter(candidate => candidate.id !== player.id)
    .map(candidate => candidate.score))
}

function endgameBankDecision(
  state: GameState,
  difficulty: ComputerDifficulty,
  projected: number,
  remainingDice: number,
): boolean | null {
  const player = currentPlayer(state)
  const projectedTotal = player.score + projected
  const opponentScore = maxOpponentScore(state)
  const winningScore = state.settings.winningScore

  if (state.endgame) {
    const canTie = state.settings.allowTies && projectedTotal >= opponentScore
    return canTie || projectedTotal > opponentScore
  }

  if (projectedTotal >= winningScore) {
    if (!state.settings.finalChase || state.players.length === 1 || difficulty === 'easy')
      return true

    const opponentDistance = Math.max(0, winningScore - opponentScore)
    const desiredBuffer = opponentDistance <= 500
      ? 1_000
      : opponentDistance <= 1_000
        ? 500
        : 0
    if (desiredBuffer === 0 || projectedTotal >= winningScore + desiredBuffer)
      return true

    const minimumDiceToPress = difficulty === 'hard' ? 3 : 4
    return remainingDice < minimumDiceToPress
  }

  if (!state.settings.finalChase || difficulty === 'easy')
    return null

  const distanceToTarget = winningScore - projectedTotal
  if (distanceToTarget <= 150) {
    if (projectedTotal - opponentScore >= 500)
      return true
    if (remainingDice >= 3)
      return false
  }

  return null
}

function policyBankThreshold(state: GameState, policy: ComputerPolicy, projected: number, remainingDice: number) {
  const player = currentPlayer(state)
  let threshold = policy.bankThresholdByDice[remainingDice] ?? 700
  const lead = player.score - maxOpponentScore(state)

  if (lead > 0)
    threshold -= lead * policy.leadFactor
  else
    threshold += -lead * policy.trailFactor

  const distanceToWin = state.settings.winningScore - (player.score + projected)
  const closingWindow = Math.max(0, 1_500 - Math.max(distanceToWin, 0))
  threshold -= closingWindow * policy.closingFactor
  return Math.min(state.settings.winningScore, Math.max(200, threshold))
}

function shouldBankSelectedDice(state: GameState) {
  if (!canBank(state))
    return false

  const player = currentPlayer(state)
  const difficulty = player.kind === 'computer' && player.difficulty
    ? player.difficulty
    : defaultComputerDifficulty
  const result = selectionResult(state)
  const projected = state.turnScore + result.score
  const remainingDice = state.dice.length - result.selectedCount || 6
  const endgameDecision = endgameBankDecision(state, difficulty, projected, remainingDice)
  if (endgameDecision !== null)
    return endgameDecision

  return projected >= policyBankThreshold(state, computerPolicy(state, difficulty), projected, remainingDice)
}

export function shouldComputerBank(state: GameState) {
  if (state.phase === 'selecting' && currentPlayer(state).kind === 'computer') {
    const decision = computerTurnDecision(state)
    if (decision.dieIds.length === state.selectedDieIds.length
      && decision.dieIds.every(id => state.selectedDieIds.includes(id))) {
      // Keep the original bank commitment when collecting extra safe points
      // returns hot dice. Recompute from this roll, without persistent latches.
      return decision.bank
    }
  }
  return shouldBankSelectedDice(state)
}

export function shouldComputerSteal(state: GameState) {
  if (!state.continuation)
    return false

  const player = currentPlayer(state)
  const difficulty = player.kind === 'computer' && player.difficulty
    ? player.difficulty
    : defaultComputerDifficulty
  const continuation = state.continuation
  if (difficulty === 'easy')
    return continuation.inheritedScore >= 600
  if (difficulty === 'medium') {
    const threshold = mediumComputerPolicy.bankThresholdByDice[continuation.diceInPlay] ?? 700
    return continuation.inheritedScore >= threshold * 0.7
  }

  const policy = computerPolicy(state, 'hard')
  const continuationUtility = policy.scoreWeight * continuation.inheritedScore
    + policy.remainingDiceWeight * continuation.diceInPlay
    + policy.rollBias
  const freshRollUtility = policy.remainingDiceWeight * 6
  return continuationUtility >= freshRollUtility
}

export function currentSelection(state: GameState) {
  return selectionResult(state)
}

export function scoringDieIds(state: GameState) {
  return selectableDieIds(state.dice, state.scoredMultiples)
}

export function activePlayer(state: GameState) {
  return currentPlayer(state)
}

export function nextPlayer(state: GameState) {
  return state.nextPlayerIndex === null ? null : state.players[state.nextPlayerIndex] ?? null
}

export function projectedDiceRemaining(state: GameState) {
  const result = selectionResult(state)
  if (!result.valid)
    return state.diceInPlay
  return state.dice.length - result.selectedCount || 6
}

function migrateLegacyGameState(value: unknown): unknown {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.players))
    return value

  const migrated = structuredClone(value)
  if (!isRecord(migrated) || !Array.isArray(migrated.players))
    return value

  migrated.schemaVersion = 2
  migrated.players = migrated.players.map((player) => {
    if (!isRecord(player))
      return player
    return {
      ...player,
      difficulty: player.kind === 'computer' ? defaultComputerDifficulty : null,
    }
  })
  return migrated
}

export function restoreGame(value: unknown): GameState | null {
  try {
    const migrated = migrateLegacyGameState(value)
    return isRestorableGameState(migrated) ? structuredClone(migrated) : null
  }
  catch {
    return null
  }
}
