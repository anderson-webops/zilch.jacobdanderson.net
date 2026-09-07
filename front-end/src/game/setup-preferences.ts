import type { ComputerDifficulty, GameSettings } from './types.ts'
import { defaultComputerDifficulty, defaultSettings, restoreGame } from './engine.ts'

export const SETUP_PREFERENCE_KEY = 'zilch-setup-preferences-v1'

export interface SetupPreferences {
  schemaVersion: 1
  mode: 'computer' | 'local'
  playerCount: number
  localNames: string[]
  humanName: string
  computerName: string
  computerDifficulty: ComputerDifficulty
  settings: GameSettings
}

export function defaultSetupPreferences(): SetupPreferences {
  return {
    schemaVersion: 1,
    mode: 'computer',
    playerCount: 2,
    localNames: Array.from({ length: 6 }, (_, index) => `Player ${index + 1}`),
    humanName: 'Player 1',
    computerName: 'Computer',
    computerDifficulty: defaultComputerDifficulty,
    settings: { ...defaultSettings },
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function integer(value: unknown, minimum: number, maximum: number, fallback: number) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value
    : fallback
}

function name(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 30) : fallback
}

export function restoreSetupPreferences(value: unknown): SetupPreferences {
  const defaults = defaultSetupPreferences()
  const input = record(value)
  if (input.schemaVersion !== 1)
    return defaults
  const settings = record(input.settings)
  const winningScore = integer(settings.winningScore, 1000, 100_000, defaults.settings.winningScore)
  const boolean = (key: keyof GameSettings) => typeof settings[key] === 'boolean'
    ? settings[key] as boolean
    : defaults.settings[key] as boolean
  return {
    schemaVersion: 1,
    mode: input.mode === 'local' ? 'local' : 'computer',
    playerCount: integer(input.playerCount, 1, 6, defaults.playerCount),
    localNames: defaults.localNames.map((fallback, index) => name(Array.isArray(input.localNames) ? input.localNames[index] : null, fallback)),
    humanName: name(input.humanName, defaults.humanName),
    computerName: name(input.computerName, defaults.computerName),
    computerDifficulty: input.computerDifficulty === 'easy' || input.computerDifficulty === 'hard'
      ? input.computerDifficulty
      : defaults.computerDifficulty,
    settings: {
      winningScore,
      openingScore: integer(settings.openingScore, 0, winningScore, defaults.settings.openingScore),
      firstRollBust: boolean('firstRollBust'),
      finalChase: boolean('finalChase'),
      allowTies: boolean('allowTies'),
      stealing: boolean('stealing'),
    },
  }
}

export function readSetupPreferences(storage: Pick<Storage, 'getItem'> | null): SetupPreferences {
  try {
    const raw = storage?.getItem(SETUP_PREFERENCE_KEY)
    if (raw !== null && raw !== undefined)
      return restoreSetupPreferences(raw ? JSON.parse(raw) : null)
    // On upgrade, recover the previous setup from a valid existing saved game.
    const savedGame = storage?.getItem('zilch-browser-game-v1')
    const game = savedGame ? restoreGame(JSON.parse(savedGame)) : null
    if (!game)
      return defaultSetupPreferences()
    const defaults = defaultSetupPreferences()
    const computer = game.players.find(player => player.kind === 'computer')
    return restoreSetupPreferences({
      ...defaults,
      mode: computer ? 'computer' : 'local',
      playerCount: computer ? defaults.playerCount : game.players.length,
      computerDifficulty: computer?.difficulty ?? defaults.computerDifficulty,
      computerName: computer?.name ?? defaults.computerName,
      humanName: game.players.find(player => player.kind === 'human')?.name ?? defaults.humanName,
      localNames: computer ? defaults.localNames : game.players.map(player => player.name),
      settings: game.settings,
    })
  }
  catch {
    return defaultSetupPreferences()
  }
}

export function writeSetupPreferences(storage: Pick<Storage, 'setItem'> | null, preferences: SetupPreferences): void {
  try {
    storage?.setItem(SETUP_PREFERENCE_KEY, JSON.stringify(restoreSetupPreferences(preferences)))
  }
  catch {
    // Game setup remains usable even when this browser cannot remember it.
  }
}
