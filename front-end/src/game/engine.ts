import type {
  DieValue,
  GameEvent,
  GameSettings,
  GameState,
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

export const defaultPlayers: PlayerDraft[] = [
  { name: 'You', kind: 'human' },
  { name: 'Computer', kind: 'computer' },
]

function clone(state: GameState) {
  return structuredClone(state)
}

function currentPlayer(state: GameState) {
  return state.players[state.currentPlayerIndex]!
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
    || value === 'pass'
    || value === 'steal'
    || value === 'finished'
}

function isRestorableGameState(value: unknown): value is GameState {
  if (!isRecord(value)
    || value.schemaVersion !== 1
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
    && (value.phase === 'pass' ? nextPlayerIndex !== null : nextPlayerIndex === null)
    && (value.phase !== 'selecting' || value.dice.length > 0)
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

  const normalizedNames = playerDrafts.map((player, index) => player.name.trim().slice(0, 30) || `Player ${index + 1}`)
  if (new Set(normalizedNames.map(name => name.toLocaleLowerCase())).size !== normalizedNames.length)
    throw new RangeError('Player names must be unique.')

  const players = playerDrafts.map((player, index) => ({
    id: `player-${index + 1}`,
    name: normalizedNames[index]!,
    kind: player.kind,
    score: 0,
    scoreReachedAt: 0,
  }))

  return {
    schemaVersion: 1,
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
    message: `${players[0]!.name} starts. Roll all six dice.`,
    events: [{ id: 1, text: `${players[0]!.name} starts. Roll all six dice.`, tone: 'neutral' }],
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
    next.dice = []
    next.diceInPlay = 6
    addEvent(next, 'First-roll Zilch: 50 points at risk and one fresh roll.', 'special')
    return next
  }

  next.turnScore = 0
  next.scoredMultiples = {}
  next.continuation = null
  next.dice = []
  addEvent(next, `${player.name} zilched and lost the turn's points.`, 'risk')
  return completeTurn(next, false)
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
    addEvent(state, `${result.label} scored ${result.score.toLocaleString()}. ${remainingDice} dice remain.`, 'good')
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
      : `${names} wins with ${highScore.toLocaleString()} points.`,
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
    addEvent(next, `${player.name} may continue ${next.continuation!.sourcePlayerName}'s banked turn.`, 'risk')
  }
  else {
    next.continuation = null
    next.phase = 'ready'
    addEvent(next, `${player.name}'s turn. Roll all six dice.`, 'neutral')
  }
  return next
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
    addEvent(next, `${player.name} puts ${next.turnScore.toLocaleString()} inherited points at risk.`, 'risk')
  }
  else {
    next.turnScore = 0
    next.diceInPlay = 6
    next.scoredMultiples = {}
    addEvent(next, `${player.name} declined the steal and starts fresh.`, 'neutral')
  }
  next.continuation = null
  next.phase = 'ready'
  return next
}

export function shouldComputerBank(state: GameState) {
  if (!canBank(state))
    return false
  const player = currentPlayer(state)
  const result = selectionResult(state)
  const projected = state.turnScore + result.score
  const remainingDice = state.dice.length - result.selectedCount || 6
  const projectedTotal = player.score + projected
  if (projectedTotal >= state.settings.winningScore)
    return true

  if (state.endgame) {
    const leader = Math.max(...state.players.map(candidate => candidate.score))
    if (projectedTotal > leader)
      return true
  }

  const thresholds: Record<number, number> = {
    1: 350,
    2: 500,
    3: 700,
    4: 850,
    5: 1_000,
    6: 1_150,
  }
  const leader = Math.max(...state.players.map(candidate => candidate.score))
  const adjustment = player.score >= leader ? -100 : 100
  return projected >= (thresholds[remainingDice] ?? 700) + adjustment
}

export function shouldComputerSteal(state: GameState) {
  if (!state.continuation)
    return false
  const thresholds: Record<number, number> = {
    1: 350,
    2: 500,
    3: 700,
    4: 850,
    5: 1_000,
  }
  return state.continuation.inheritedScore >= (thresholds[state.continuation.diceInPlay] ?? 700) * 0.7
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

export function restoreGame(value: unknown): GameState | null {
  try {
    return isRestorableGameState(value) ? structuredClone(value) : null
  }
  catch {
    return null
  }
}
