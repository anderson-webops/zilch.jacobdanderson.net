import type { DieValue, GameSettings, GameState, PlayerDraft } from '~/game/types'
import {
  acknowledgeBust,
  acknowledgePass,
  activePlayer,
  bankScore,
  canBank,
  chooseSteal,
  createGame,
  currentSelection,
  nextPlayer,
  projectedDiceRemaining,
  projectedTurnScore,
  restoreGame,
  rollAgain,
  rollDice,
  scoringDieIds,
  selectComputerRecommended,
  selectRecommended,
  shouldComputerBank,
  shouldComputerSteal,
  toggleDie,
} from '~/game/engine'

const STORAGE_KEY = 'zilch-browser-game-v1'

export function useZilchGame() {
  const state = useState<GameState | null>('zilch-active-game', () => null)
  const savedState = shallowRef<GameState | null>(null)
  const storageAvailable = shallowRef(true)
  const automationTimer = shallowRef<ReturnType<typeof setTimeout> | null>(null)

  const hasSavedGame = computed(() => savedState.value !== null)
  const player = computed(() => state.value ? activePlayer(state.value) : null)
  const upcomingPlayer = computed(() => state.value ? nextPlayer(state.value) : null)
  const selection = computed(() => state.value ? currentSelection(state.value) : null)
  const selectionCanBank = computed(() => state.value ? canBank(state.value) : false)
  const projectedScore = computed(() => state.value ? projectedTurnScore(state.value) : 0)
  const diceAfterSelection = computed(() => state.value ? projectedDiceRemaining(state.value) : 6)
  const selectableIds = computed(() => state.value ? scoringDieIds(state.value) : [])

  function browserStorage() {
    if (!import.meta.client)
      return null
    try {
      return window.localStorage
    }
    catch {
      storageAvailable.value = false
      return null
    }
  }

  function persist(next: GameState | null) {
    const storage = browserStorage()
    if (!storage) {
      savedState.value = null
      return
    }

    try {
      if (next) {
        storage.setItem(STORAGE_KEY, JSON.stringify(next))
        savedState.value = structuredClone(next)
      }
      else {
        storage.removeItem(STORAGE_KEY)
        savedState.value = null
      }
      storageAvailable.value = true
    }
    catch {
      storageAvailable.value = false
      savedState.value = null
    }
  }

  function setState(next: GameState) {
    state.value = markRaw(next)
    persist(next)
  }

  function startGame(players: PlayerDraft[], settings: GameSettings) {
    setState(createGame(players, settings))
  }

  function resumeGame() {
    if (savedState.value)
      state.value = markRaw(structuredClone(savedState.value))
  }

  function leaveGame() {
    if (automationTimer.value)
      clearTimeout(automationTimer.value)
    automationTimer.value = null
    state.value = null
    persist(null)
  }

  function roll(forcedValues?: DieValue[]) {
    if (state.value)
      setState(rollDice(state.value, Math.random, forcedValues))
  }

  function toggle(dieId: number) {
    if (state.value && activePlayer(state.value).kind === 'human')
      setState(toggleDie(state.value, dieId))
  }

  function recommend() {
    if (!state.value)
      return
    setState(activePlayer(state.value).kind === 'computer'
      ? selectComputerRecommended(state.value)
      : selectRecommended(state.value))
  }

  function continueRolling(forcedValues?: DieValue[]) {
    if (state.value)
      setState(rollAgain(state.value, Math.random, forcedValues))
  }

  function bank() {
    if (state.value)
      setState(bankScore(state.value))
  }

  function pass() {
    if (!state.value)
      return
    setState(state.value.phase === 'bust'
      ? acknowledgeBust(state.value)
      : acknowledgePass(state.value))
  }

  function steal(accept: boolean) {
    if (state.value)
      setState(chooseSteal(state.value, accept))
  }

  function scheduleComputerTurn(next: GameState | null) {
    if (automationTimer.value)
      clearTimeout(automationTimer.value)
    automationTimer.value = null
    if (!next || !import.meta.client)
      return

    const current = activePlayer(next)
    const delay = 620

    if (next.phase === 'pass')
      return

    if (current.kind !== 'computer')
      return

    if (next.phase === 'bust') {
      automationTimer.value = setTimeout(pass, delay * 2)
      return
    }

    if (next.phase === 'ready') {
      automationTimer.value = setTimeout(roll, delay)
      return
    }

    if (next.phase === 'steal') {
      automationTimer.value = setTimeout(() => steal(shouldComputerSteal(next)), delay)
      return
    }

    if (next.phase === 'selecting') {
      if (next.selectedDieIds.length === 0) {
        automationTimer.value = setTimeout(recommend, delay)
      }
      else if (shouldComputerBank(next)) {
        automationTimer.value = setTimeout(bank, delay)
      }
      else {
        automationTimer.value = setTimeout(continueRolling, delay)
      }
    }
  }

  onMounted(() => {
    const storage = browserStorage()
    if (!storage) {
      scheduleComputerTurn(state.value)
      return
    }

    try {
      const raw = storage.getItem(STORAGE_KEY)
      savedState.value = raw ? restoreGame(JSON.parse(raw)) : null
      storageAvailable.value = true
      if (!savedState.value && raw) {
        try {
          storage.removeItem(STORAGE_KEY)
        }
        catch {
          storageAvailable.value = false
        }
      }
    }
    catch {
      storageAvailable.value = false
      savedState.value = null
    }
    scheduleComputerTurn(state.value)
  })

  watch(state, scheduleComputerTurn, { flush: 'post' })

  onBeforeUnmount(() => {
    if (automationTimer.value)
      clearTimeout(automationTimer.value)
  })

  return {
    state: shallowReadonly(state),
    storageAvailable: shallowReadonly(storageAvailable),
    hasSavedGame,
    player,
    upcomingPlayer,
    selection,
    selectionCanBank,
    projectedScore,
    diceAfterSelection,
    selectableIds,
    startGame,
    resumeGame,
    leaveGame,
    roll,
    toggle,
    recommend,
    continueRolling,
    bank,
    pass,
    steal,
  }
}
