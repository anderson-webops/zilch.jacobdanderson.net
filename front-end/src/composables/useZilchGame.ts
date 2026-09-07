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
import { createRollPresentation, readRollingPreference, writeRollingPreference } from '~/game/roll-presentation'

const STORAGE_KEY = 'zilch-browser-game-v1'

export function useZilchGame() {
  const state = useState<GameState | null>('zilch-active-game', () => null)
  const savedState = shallowRef<GameState | null>(null)
  const storageAvailable = shallowRef(true)
  const automationTimer = shallowRef<ReturnType<typeof setTimeout> | null>(null)
  const rollingResult = shallowRef<GameState | null>(null)
  const rollingAnimationEnabled = ref(false)
  const reducedMotion = ref(false)
  let motionQuery: MediaQueryList | null = null
  const isRolling = computed(() => rollingResult.value !== null)
  const presentation = createRollPresentation({
    rolling: result => rollingResult.value = result ? markRaw(result) : null,
    reveal: setState,
  })

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
    presentation.cancel()
    setState(createGame(players, settings))
  }

  function resumeGame() {
    presentation.cancel()
    if (savedState.value)
      state.value = markRaw(selectComputerRecommended(structuredClone(savedState.value)))
  }

  function leaveGame() {
    presentation.cancel()
    if (automationTimer.value)
      clearTimeout(automationTimer.value)
    automationTimer.value = null
    state.value = null
    persist(null)
  }

  function roll(forcedValues?: DieValue[]) {
    if (state.value && !isRolling.value)
      presentRoll(rollDice(state.value, Math.random, forcedValues))
  }

  function presentRoll(next: GameState) {
    if (automationTimer.value)
      clearTimeout(automationTimer.value)
    automationTimer.value = null
    // Save the actual roll before displaying it, including if the page closes mid-tumble.
    persist(next)
    presentation.present(next, rollingAnimationEnabled.value && !reducedMotion.value)
  }

  function setRollingAnimation(enabled: boolean) {
    rollingAnimationEnabled.value = enabled
    writeRollingPreference(browserStorage(), enabled)
    if (!enabled)
      presentation.finish()
  }

  function updateReducedMotion() {
    reducedMotion.value = motionQuery?.matches ?? false
    if (reducedMotion.value)
      presentation.finish()
  }

  function toggle(dieId: number) {
    if (state.value && !isRolling.value && activePlayer(state.value).kind === 'human')
      setState(toggleDie(state.value, dieId))
  }

  function recommend() {
    if (!state.value || isRolling.value)
      return
    setState(activePlayer(state.value).kind === 'computer'
      ? selectComputerRecommended(state.value)
      : selectRecommended(state.value))
  }

  function continueRolling(forcedValues?: DieValue[]) {
    if (state.value && !isRolling.value)
      presentRoll(rollAgain(state.value, Math.random, forcedValues))
  }

  function bank() {
    if (state.value && !isRolling.value)
      setState(bankScore(state.value))
  }

  function pass() {
    if (!state.value || isRolling.value)
      return
    setState(state.value.phase === 'bust'
      ? acknowledgeBust(state.value)
      : acknowledgePass(state.value))
  }

  function steal(accept: boolean) {
    if (state.value && !isRolling.value)
      setState(chooseSteal(state.value, accept))
  }

  function scheduleComputerTurn(next: GameState | null) {
    if (automationTimer.value)
      clearTimeout(automationTimer.value)
    automationTimer.value = null
    if (!next || !import.meta.client || isRolling.value)
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
    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    updateReducedMotion()
    motionQuery.addEventListener('change', updateReducedMotion)
    const storage = browserStorage()
    rollingAnimationEnabled.value = readRollingPreference(storage)
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

  watch([state, isRolling], ([next]) => scheduleComputerTurn(next), { flush: 'post' })

  onBeforeUnmount(() => {
    // Navigating to Tips must not discard a roll that has already happened.
    presentation.finish()
    motionQuery?.removeEventListener('change', updateReducedMotion)
    if (automationTimer.value)
      clearTimeout(automationTimer.value)
  })

  return {
    state: shallowReadonly(state),
    rollingResult: shallowReadonly(rollingResult),
    rollingAnimationEnabled: shallowReadonly(rollingAnimationEnabled),
    reducedMotion: shallowReadonly(reducedMotion),
    setRollingAnimation,
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
