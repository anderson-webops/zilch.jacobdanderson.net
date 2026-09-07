import type { GameState } from './types.ts'

// Match the original game's two-second tumble and half-second settled hold.
export const ROLL_ANIMATION_MS = 2500
export const ROLL_PREFERENCE_KEY = 'zilch-rolling-animation-v1'

export function readRollingPreference(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return storage?.getItem(ROLL_PREFERENCE_KEY) === 'true'
  }
  catch {
    return false
  }
}

export function writeRollingPreference(storage: Pick<Storage, 'setItem'> | null, enabled: boolean): void {
  try {
    storage?.setItem(ROLL_PREFERENCE_KEY, String(enabled))
  }
  catch {
    // The preference still works for this session when storage is unavailable.
  }
}

/** Delays presentation only. The engine has already generated and saved one result. */
export function createRollPresentation(callbacks: {
  rolling: (result: GameState | null) => void
  reveal: (result: GameState) => void
}) {
  let pending: GameState | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function cancel() {
    if (timer !== null)
      clearTimeout(timer)
    timer = null
    pending = null
    callbacks.rolling(null)
  }

  function finish() {
    const result = pending
    cancel()
    if (result)
      callbacks.reveal(result)
  }

  function present(result: GameState, animate: boolean) {
    if (pending)
      return false
    if (!animate) {
      callbacks.reveal(result)
      return true
    }
    pending = result
    callbacks.rolling(result)
    timer = setTimeout(finish, ROLL_ANIMATION_MS)
    return true
  }

  return { present, finish, cancel }
}
