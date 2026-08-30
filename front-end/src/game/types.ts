export type DieValue = 1 | 2 | 3 | 4 | 5 | 6

export type GamePhase = 'ready' | 'selecting' | 'pass' | 'steal' | 'finished'

export type PlayerKind = 'human' | 'computer'

export interface Die {
  id: number
  value: DieValue
}

export interface PlayerDraft {
  name: string
  kind: PlayerKind
}

export interface Player {
  id: string
  name: string
  kind: PlayerKind
  score: number
  scoreReachedAt: number
}

export interface GameSettings {
  winningScore: number
  openingScore: number
  firstRollBust: boolean
  finalChase: boolean
  allowTies: boolean
  stealing: boolean
}

export type MultipleChains = Partial<Record<DieValue, number>>

export interface TurnContinuation {
  sourcePlayerId: string
  sourcePlayerName: string
  inheritedScore: number
  diceInPlay: number
  scoredMultiples: MultipleChains
}

export interface EndgameState {
  triggerPlayerId: string
  remainingTurns: number
}

export interface GameEvent {
  id: number
  text: string
  tone: 'neutral' | 'good' | 'risk' | 'special'
}

export interface GameState {
  schemaVersion: 1
  settings: GameSettings
  players: Player[]
  currentPlayerIndex: number
  nextPlayerIndex: number | null
  phase: GamePhase
  dice: Die[]
  diceInPlay: number
  selectedDieIds: number[]
  turnScore: number
  scoredMultiples: MultipleChains
  rollNumber: number
  bankSequence: number
  eventSequence: number
  message: string
  events: GameEvent[]
  continuation: TurnContinuation | null
  endgame: EndgameState | null
  winnerIds: string[]
}

export interface SelectionResult {
  valid: boolean
  score: number
  label: string
  selectedCount: number
  multipleUpdates: MultipleChains
  reason: string
}
