<script setup lang="ts">
import type { GameState } from '~/game/types'

const props = defineProps<{
  state: GameState
  selectableIds: number[]
  selectionScore: number
  selectionValid: boolean
  selectionLabel: string
  selectionReason: string
  canBank: boolean
  projectedScore: number
  diceAfterSelection: number
}>()

const emit = defineEmits<{
  roll: []
  toggle: [dieId: number]
  recommend: []
  continue: []
  bank: []
  pass: []
  steal: [accept: boolean]
  newGame: []
  rules: []
}>()

const currentPlayer = computed(() => props.state.players[props.state.currentPlayerIndex]!)
const nextPlayer = computed(() => props.state.nextPlayerIndex === null ? null : props.state.players[props.state.nextPlayerIndex])
const isSecondPerson = (name: string) => name.trim().toLocaleLowerCase() === 'you'
const winnerNames = computed(() => props.state.players
  .filter(player => props.state.winnerIds.includes(player.id))
  .map(player => player.name)
  .join(' and '))
const winnerTitle = computed(() => {
  if (props.state.winnerIds.length > 1)
    return `${winnerNames.value} tie`
  return isSecondPerson(winnerNames.value)
    ? 'You win'
    : `${winnerNames.value} wins`
})
const highScore = computed(() => Math.max(...props.state.players.map(player => player.score)))
const openingNeeded = computed(() => {
  if (currentPlayer.value.score >= props.state.settings.openingScore)
    return 0
  return Math.max(0, props.state.settings.openingScore - props.projectedScore)
})
const rollButtonLabel = computed(() => {
  if (props.state.rollNumber === 0 && props.state.turnScore === 0)
    return 'Roll all six dice'
  return `Roll ${props.state.diceInPlay} ${props.state.diceInPlay === 1 ? 'die' : 'dice'}`
})
const hasRolledDice = computed(() => props.state.dice.length > 0
  && ['ready', 'selecting', 'bust'].includes(props.state.phase))
const isBustResult = computed(() => props.state.phase === 'bust'
  || (props.state.phase === 'ready' && props.state.dice.length > 0 && props.state.rollNumber > 0))
const bustEndsGame = computed(() => props.state.phase === 'bust'
  && props.state.endgame !== null
  && currentPlayer.value.id !== props.state.endgame.triggerPlayerId
  && props.state.endgame.remainingTurns <= 1)
const continuationTurnOwner = computed(() => {
  const name = props.state.continuation?.sourcePlayerName ?? ''
  return isSecondPerson(name) ? 'your' : `${name}'s`
})
const nextTurnTitle = computed(() => {
  if (!nextPlayer.value)
    return 'The next turn is ready'
  return isSecondPerson(nextPlayer.value.name)
    ? 'You are up next'
    : `${nextPlayer.value.name} is up next`
})
const nextTurnAction = computed(() => {
  if (bustEndsGame.value)
    return 'Show final result'
  if (!nextPlayer.value)
    return 'Continue'
  if (nextPlayer.value.kind === 'computer')
    return `Watch ${nextPlayer.value.name} play`
  return isSecondPerson(nextPlayer.value.name)
    ? 'Start your turn'
    : `Continue to ${nextPlayer.value.name}`
})
const progress = (score: number) => Math.min(100, (score / props.state.settings.winningScore) * 100)
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
const playLayout = useTemplateRef<HTMLElement>('playLayout')

function trapDialogFocus(event: KeyboardEvent) {
  const dialog = event.currentTarget as HTMLElement
  const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')]
  const first = focusable[0]
  const last = focusable.at(-1)
  if (!first || !last)
    return
  if (document.activeElement === dialog) {
    event.preventDefault()
    const target = event.shiftKey ? last : first
    target.focus()
    return
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  }
  else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

async function focusCurrentPhase() {
  if (!import.meta.client)
    return

  await nextTick()
  const root = playLayout.value
  if (!root)
    return

  const activeElement = document.activeElement
  if (activeElement && activeElement !== document.body && !root.contains(activeElement))
    return

  let target: HTMLElement | null = null
  if (props.state.phase === 'selecting' && currentPlayer.value.kind === 'human')
    target = root.querySelector<HTMLButtonElement>('.dice-grid .die:not(:disabled)')
  else if (props.state.phase === 'ready' && currentPlayer.value.kind === 'human')
    target = root.querySelector<HTMLButtonElement>('.roll-button:not(:disabled)')
  else if (props.state.phase === 'bust')
    target = root.querySelector<HTMLButtonElement>('.bust-action')
  else if (props.state.phase === 'pass' || props.state.phase === 'finished')
    target = root.querySelector<HTMLElement>('.phase-dialog')
  else if (props.state.phase === 'steal' && currentPlayer.value.kind === 'human')
    target = root.querySelector<HTMLElement>('.phase-dialog')

  target?.focus()
}

watch(
  () => `${props.state.phase}:${props.state.currentPlayerIndex}:${props.state.rollNumber}`,
  focusCurrentPhase,
  { flush: 'post' },
)

onMounted(focusCurrentPhase)
</script>

<template>
  <div ref="playLayout" class="play-layout">
    <aside class="scoreboard" aria-label="Scoreboard">
      <div class="scoreboard-heading">
        <div>
          <span class="eyebrow">Table score</span>
          <h2>First to {{ state.settings.winningScore.toLocaleString() }}</h2>
        </div>
        <span v-if="state.endgame" class="chase-badge">Final chase</span>
      </div>

      <ol tabindex="0" aria-label="Player scores">
        <li
          v-for="(tablePlayer, index) in state.players"
          :key="tablePlayer.id"
          :class="{ active: index === state.currentPlayerIndex && state.phase !== 'finished' }"
        >
          <span class="score-token" :class="`token-${index % 6}`">{{ initials(tablePlayer.name) }}</span>
          <span class="score-copy">
            <strong>{{ tablePlayer.name }}</strong>
            <small>
              {{ tablePlayer.kind === 'computer'
                ? `${titleCase(tablePlayer.difficulty ?? 'medium')} computer`
                : index === state.currentPlayerIndex ? 'Current turn' : 'Player' }}
            </small>
          </span>
          <span class="score-total">{{ tablePlayer.score.toLocaleString() }}</span>
          <span class="score-progress" aria-hidden="true">
            <span :style="{ width: `${progress(tablePlayer.score)}%` }" />
          </span>
        </li>
      </ol>

      <div class="table-rules">
        <span>Open at <strong>{{ state.settings.openingScore.toLocaleString() }}</strong></span>
        <span>{{ state.settings.finalChase ? 'Final chase on' : 'Sudden finish' }}</span>
        <span v-if="state.settings.stealing">Stealing on</span>
      </div>
    </aside>

    <main class="felt-table" aria-labelledby="turn-title">
      <div class="table-topline">
        <div>
          <p class="turn-kicker">
            {{ currentPlayer.kind === 'computer' ? 'Computer turn' : 'Your turn' }}
          </p>
          <h1 id="turn-title">
            {{ currentPlayer.name }}
          </h1>
        </div>
        <div class="turn-score" aria-live="polite">
          <span>At risk</span>
          <strong>{{ state.turnScore.toLocaleString() }}</strong>
        </div>
      </div>

      <div
        class="status-banner"
        :class="{
          special: state.message.includes('Hot dice') || state.endgame,
          bust: isBustResult,
        }"
        role="status"
        aria-live="polite"
      >
        <span class="status-dot" aria-hidden="true" />
        <span>{{ state.message }}</span>
      </div>

      <section class="dice-zone" aria-label="Dice table">
        <div
          v-if="hasRolledDice"
          :key="`rolled-${state.rollNumber}`"
          class="dice-grid"
          :class="{ 'bust-dice': isBustResult }"
          aria-hidden="false"
        >
          <DieFace
            v-for="die in state.dice"
            :key="die.id"
            :die="die"
            :selected="state.selectedDieIds.includes(die.id)"
            :selectable="selectableIds.includes(die.id)"
            :interactive="state.phase === 'selecting' && currentPlayer.kind === 'human'"
            :show-availability="state.phase === 'selecting'"
            @toggle="emit('toggle', $event)"
          />
        </div>
        <div v-else key="waiting-dice" class="waiting-dice" aria-hidden="true">
          <span v-for="index in 6" :key="index" :class="{ hidden: index > state.diceInPlay }" />
        </div>
      </section>

      <section v-if="state.phase === 'ready'" class="action-panel ready-actions">
        <div>
          <span class="action-label">{{ state.turnScore ? 'Keep the turn alive' : 'Start the turn' }}</span>
          <strong>{{ state.turnScore ? `${state.turnScore.toLocaleString()} points are riding` : 'Ready to roll?' }}</strong>
        </div>
        <button class="roll-button" type="button" :disabled="currentPlayer.kind === 'computer'" @click="emit('roll')">
          {{ currentPlayer.kind === 'computer' ? 'Computer is thinking…' : rollButtonLabel }}
        </button>
      </section>

      <section v-else-if="state.phase === 'selecting'" class="action-panel selection-actions">
        <div class="selection-summary">
          <span class="action-label">Selected score</span>
          <strong v-if="selectionValid">+{{ selectionScore.toLocaleString() }}</strong>
          <strong v-else>Choose scoring dice</strong>
          <small v-if="selectionValid">{{ selectionLabel }}</small>
          <small v-else>{{ selectionReason }}</small>
          <button
            v-if="currentPlayer.kind === 'human'"
            class="select-all"
            type="button"
            @click="emit('recommend')"
          >
            Select best score
          </button>
        </div>
        <div class="decision-buttons">
          <button
            class="secondary-action"
            type="button"
            :disabled="!selectionValid || currentPlayer.kind === 'computer'"
            @click="emit('continue')"
          >
            Risk it
            <span>Roll {{ diceAfterSelection }} {{ diceAfterSelection === 1 ? 'die' : 'dice' }}</span>
          </button>
          <button
            class="bank-action"
            type="button"
            :disabled="!canBank || currentPlayer.kind === 'computer'"
            @click="emit('bank')"
          >
            Bank {{ projectedScore.toLocaleString() }}
            <span v-if="openingNeeded">Need {{ openingNeeded.toLocaleString() }} more to open</span>
            <span v-else>Keep it safe</span>
          </button>
        </div>
      </section>

      <section v-else-if="state.phase === 'bust'" class="action-panel bust-actions" aria-labelledby="bust-title">
        <div>
          <span class="action-label">Bust</span>
          <strong id="bust-title">Zilch. Nothing scores.</strong>
          <small>The roll stays on the table so you can see what happened. Any points at risk are lost.</small>
        </div>
        <button class="bust-action" type="button" @click="emit('pass')">
          {{ nextTurnAction }}
        </button>
      </section>

      <div v-if="state.phase === 'pass'" class="table-overlay">
        <div
          class="overlay-card phase-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pass-title"
          aria-describedby="pass-description"
          tabindex="-1"
          @keydown.tab="trapDialogFocus"
        >
          <span class="overlay-mark" aria-hidden="true">↗</span>
          <p class="eyebrow">
            Turn complete
          </p>
          <h2 id="pass-title">
            {{ nextTurnTitle }}
          </h2>
          <p id="pass-description">
            {{ state.message }}
          </p>
          <button type="button" @click="emit('pass')">
            {{ nextTurnAction }}
          </button>
        </div>
      </div>

      <div v-else-if="state.phase === 'steal' && state.continuation" class="table-overlay">
        <div
          class="overlay-card phase-dialog steal-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="steal-title"
          aria-describedby="steal-description"
          tabindex="-1"
          @keydown.tab="trapDialogFocus"
        >
          <span class="overlay-mark" aria-hidden="true">⚡</span>
          <p class="eyebrow">
            Steal the turn?
          </p>
          <h2 id="steal-title">
            {{ state.continuation.inheritedScore.toLocaleString() }} points are waiting
          </h2>
          <p id="steal-description">
            Continue {{ continuationTurnOwner }} turn with
            {{ state.continuation.diceInPlay }} {{ state.continuation.diceInPlay === 1 ? 'die' : 'dice' }}.
            Their bank is safe; these points become yours to risk.
          </p>
          <div>
            <button class="fresh-button" type="button" :disabled="currentPlayer.kind === 'computer'" @click="emit('steal', false)">
              Fresh roll
            </button>
            <button type="button" :disabled="currentPlayer.kind === 'computer'" @click="emit('steal', true)">
              Steal &amp; roll
            </button>
          </div>
        </div>
      </div>

      <div v-else-if="state.phase === 'finished'" class="table-overlay winner-overlay">
        <div
          class="overlay-card phase-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="winner-title"
          aria-describedby="winner-description"
          tabindex="-1"
          @keydown.tab="trapDialogFocus"
        >
          <span class="winner-dice" aria-hidden="true">⚄ ⚀</span>
          <p class="eyebrow">
            Game over
          </p>
          <h2 id="winner-title">
            {{ winnerTitle }}
          </h2>
          <p id="winner-description">
            Final high score: {{ highScore.toLocaleString() }} points.
          </p>
          <button type="button" @click="emit('newGame')">
            Start a new table
          </button>
        </div>
      </div>
    </main>

    <aside class="turn-log" aria-label="Game activity">
      <div class="log-heading">
        <div>
          <span class="eyebrow">Table talk</span>
          <h2>Game activity</h2>
        </div>
        <button type="button" @click="emit('rules')">
          Rules
        </button>
      </div>
      <ol>
        <li v-for="event in state.events" :key="event.id" :class="event.tone">
          <span aria-hidden="true" />
          <p>{{ event.text }}</p>
        </li>
      </ol>
      <button class="new-game-link" type="button" @click="emit('newGame')">
        Leave this game
      </button>
    </aside>
  </div>
</template>

<style scoped>
.play-layout {
  display: grid;
  grid-template-columns: minmax(210px, 0.72fr) minmax(500px, 2fr) minmax(210px, 0.78fr);
  gap: clamp(14px, 2vw, 26px);
  width: min(1480px, 100%);
  min-height: calc(100dvh - 132px);
  align-items: stretch;
  margin: 22px auto 0;
}

.scoreboard,
.turn-log {
  padding: 20px;
  background: rgb(255 250 240 / 72%);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 15px 40px rgb(45 51 35 / 7%);
  backdrop-filter: blur(14px);
}

.scoreboard-heading,
.log-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.scoreboard-heading h2,
.log-heading h2 {
  margin: 4px 0 0;
  font-family: 'DM Serif Display', serif;
  font-size: 1.25rem;
  font-weight: 400;
}

.chase-badge {
  padding: 5px 7px;
  color: #842a1e;
  background: rgb(217 94 66 / 13%);
  border: 1px solid rgb(217 94 66 / 26%);
  border-radius: 999px;
  font-size: 0.58rem;
  font-weight: 850;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.scoreboard ol,
.turn-log ol {
  padding: 0;
  margin: 18px 0 0;
  list-style: none;
}

.scoreboard ol:focus-visible {
  outline: 3px solid var(--focus-on-light);
  outline-offset: 3px;
}

.scoreboard li {
  position: relative;
  display: grid;
  grid-template-columns: 38px 1fr auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 8px;
  padding: 11px 10px 14px;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 13px;
}

.scoreboard li.active {
  background: rgb(255 255 255 / 57%);
  border-color: var(--line);
}

.score-token {
  display: grid;
  width: 36px;
  height: 36px;
  color: white;
  background: var(--coral);
  border-radius: 11px;
  place-items: center;
  font-size: 0.67rem;
  font-weight: 850;
}

.token-1 {
  background: #2f7665;
}
.token-2 {
  background: #8f6eb0;
}
.token-3 {
  background: #c9862e;
}
.token-4 {
  background: #4975a5;
}
.token-5 {
  background: #8b6652;
}

.score-copy strong,
.score-copy small {
  display: block;
}

.score-copy {
  min-width: 0;
}

.score-copy strong {
  overflow: hidden;
  font-size: 0.78rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.score-copy small {
  margin-top: 2px;
  color: var(--muted-ink);
  font-size: 0.6rem;
}

.score-total {
  font-family: 'DM Mono', ui-monospace, monospace;
  font-size: 0.82rem;
  font-weight: 800;
}

.score-progress {
  position: absolute;
  right: 10px;
  bottom: 7px;
  left: 58px;
  height: 3px;
  overflow: hidden;
  background: rgb(23 54 46 / 9%);
  border-radius: 999px;
}

.score-progress span {
  display: block;
  height: 100%;
  background: var(--gold-dark);
  border-radius: inherit;
}

.table-rules {
  display: grid;
  gap: 7px;
  margin-top: auto;
  padding-top: 16px;
  color: var(--muted-ink);
  border-top: 1px solid var(--line);
  font-size: 0.65rem;
}

.felt-table {
  position: relative;
  display: flex;
  min-height: 660px;
  flex-direction: column;
  padding: clamp(22px, 3vw, 36px);
  overflow: hidden;
  color: #f8f3e7;
  background: radial-gradient(circle at 50% 15%, rgb(255 255 255 / 8%), transparent 42%), var(--felt);
  border: 9px solid #6b3f22;
  border-radius: 38px;
  box-shadow:
    inset 0 0 0 2px rgb(255 255 255 / 10%),
    0 28px 70px rgb(25 44 36 / 24%);
}

.felt-table::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgb(255 255 255 / 7%) 0.7px, transparent 0.7px);
  background-size: 6px 6px;
  content: '';
  opacity: 0.36;
}

.table-topline,
.status-banner,
.dice-zone,
.action-panel {
  position: relative;
  z-index: 1;
}

.table-topline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.table-topline > div:first-child {
  min-width: 0;
}

.table-topline h1 {
  width: 100%;
  max-width: 410px;
  margin: 3px 0 0;
  overflow: hidden;
  font-family: 'DM Serif Display', serif;
  font-size: clamp(2rem, 4vw, 3.3rem);
  font-weight: 400;
  letter-spacing: -0.025em;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.turn-score {
  display: grid;
  flex: 0 0 auto;
  text-align: right;
}

.turn-score span {
  color: rgb(248 243 231 / 62%);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.turn-score strong {
  margin-top: 2px;
  color: var(--gold);
  font-family: 'DM Serif Display', serif;
  font-size: clamp(1.8rem, 4vw, 2.8rem);
  font-weight: 400;
}

.status-banner {
  display: flex;
  gap: 9px;
  align-items: center;
  margin-top: 18px;
  padding: 10px 12px;
  color: rgb(248 243 231 / 75%);
  background: rgb(5 28 21 / 45%);
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 11px;
  font-size: 0.72rem;
}

.status-banner.special {
  color: #fff4d8;
  background: rgb(169 104 22 / 27%);
  border-color: rgb(231 173 74 / 35%);
}

.status-banner.bust {
  color: #fff3ee;
  background: rgb(169 66 47 / 35%);
  border-color: rgb(255 154 130 / 50%);
  font-weight: 750;
}

.status-banner.bust .status-dot {
  background: var(--coral-on-dark);
  box-shadow: 0 0 0 4px rgb(255 154 130 / 16%);
}

.status-banner > span:last-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  background: var(--gold);
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgb(231 173 74 / 12%);
}

.dice-zone {
  display: grid;
  flex: 1;
  min-height: 300px;
  place-items: center;
}

.dice-grid {
  display: grid;
  grid-template-columns: repeat(3, auto);
  gap: clamp(16px, 2.3vw, 25px);
  justify-content: center;
}

.dice-grid > :nth-child(2),
.dice-grid > :nth-child(5) {
  animation-delay: 45ms;
}

.dice-grid > :nth-child(3),
.dice-grid > :nth-child(6) {
  animation-delay: 90ms;
}

.bust-dice {
  padding: 12px;
  border: 1px solid rgb(255 154 130 / 24%);
  border-radius: 24px;
  box-shadow: 0 0 46px rgb(169 66 47 / 18%);
}

.waiting-dice {
  display: grid;
  grid-template-columns: repeat(3, 72px);
  gap: 17px;
  opacity: 0.28;
  transform: rotate(-3deg);
}

.waiting-dice span {
  aspect-ratio: 1;
  background: rgb(255 253 246 / 22%);
  border: 2px dashed rgb(255 255 255 / 24%);
  border-radius: 18px;
}

.waiting-dice span.hidden {
  opacity: 0.12;
}

.action-panel {
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
  min-height: 106px;
  padding: 15px;
  background: rgb(5 28 21 / 62%);
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 16px;
  backdrop-filter: blur(10px);
}

.action-panel strong,
.action-panel small,
.action-label {
  display: block;
}

.action-label {
  color: var(--gold);
  font-size: 0.6rem;
  font-weight: 850;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.action-panel strong {
  margin-top: 4px;
  font-family: 'DM Serif Display', serif;
  font-size: 1.3rem;
  font-weight: 400;
}

.action-panel small {
  max-width: 260px;
  margin-top: 3px;
  color: rgb(248 243 231 / 62%);
  font-size: 0.64rem;
  line-height: 1.4;
}

.roll-button,
.bust-action,
.overlay-card > button,
.steal-card > div button {
  padding: 14px 18px;
  color: var(--ink);
  background: var(--gold);
  border: 0;
  border-radius: 11px;
  cursor: pointer;
  font-weight: 850;
}

.bust-actions {
  border-color: rgb(255 154 130 / 34%);
  box-shadow: inset 4px 0 0 var(--coral-on-dark);
}

.bust-actions .action-label {
  color: var(--coral-on-dark);
}

.bust-actions .bust-action {
  min-width: min(230px, 44%);
  min-height: 54px;
}

.roll-button:disabled,
.selection-actions button:disabled,
.steal-card button:disabled {
  cursor: wait;
  opacity: 0.5;
}

.selection-summary {
  min-width: 170px;
}

.select-all {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  margin-top: 8px;
  padding: 8px 10px;
  color: #f8f3e7;
  background: transparent;
  border: 1px solid rgb(248 243 231 / 50%);
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 750;
}

.felt-table button:focus-visible {
  outline-color: var(--focus-on-dark);
}

.felt-table .overlay-card button:focus-visible {
  outline-color: var(--focus-on-light);
}

.decision-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  min-width: min(350px, 56%);
}

.decision-buttons button {
  display: grid;
  min-height: 60px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 850;
  place-items: center;
}

.decision-buttons button span {
  display: block;
  margin-top: 2px;
  font-size: 0.55rem;
  font-weight: 650;
}

.secondary-action {
  color: #f8f3e7;
  background: transparent;
  border: 1px solid rgb(255 255 255 / 22%);
}

.bank-action {
  color: var(--ink);
  background: var(--gold);
  border: 1px solid var(--gold);
}

.table-overlay {
  position: absolute;
  z-index: 5;
  inset: 0;
  display: grid;
  padding: 22px;
  overflow-y: auto;
  background: rgb(5 28 21 / 76%);
  overscroll-behavior: contain;
  place-items: center;
  backdrop-filter: blur(8px);
}

.overlay-card {
  width: min(440px, 100%);
  padding: clamp(24px, 5vw, 38px);
  color: var(--ink);
  background: var(--paper-strong);
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 22px;
  box-shadow: 0 25px 65px rgb(0 0 0 / 34%);
  text-align: center;
}

.overlay-card h2,
.overlay-card p,
.overlay-card button {
  overflow-wrap: anywhere;
}

.phase-dialog:focus {
  outline: 3px solid var(--focus-on-dark);
  outline-offset: 4px;
}

.overlay-mark {
  display: grid;
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  color: white;
  background: var(--coral);
  border-radius: 14px;
  place-items: center;
  font-size: 1.3rem;
  font-weight: 900;
  transform: rotate(-6deg);
}

.overlay-card h2 {
  margin: 8px 0 9px;
  font-family: 'DM Serif Display', serif;
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1;
}

.overlay-card p:not(.eyebrow) {
  margin: 0 0 20px;
  color: var(--muted-ink);
  font-size: 0.78rem;
  line-height: 1.6;
}

.steal-card > div {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

.steal-card .fresh-button {
  color: var(--ink);
  background: transparent;
  border: 1px solid var(--line);
}

.winner-dice {
  display: block;
  margin-bottom: 15px;
  color: var(--coral);
  font-size: 2rem;
  letter-spacing: 0.2em;
}

.turn-log {
  display: flex;
  flex-direction: column;
}

.log-heading button {
  min-width: 44px;
  min-height: 44px;
  padding: 7px 0 2px;
  color: var(--ink);
  background: transparent;
  border: 0;
  border-bottom: 1px solid currentColor;
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 800;
}

.turn-log li {
  display: grid;
  grid-template-columns: 8px 1fr;
  gap: 9px;
  padding: 10px 0;
  color: var(--muted-ink);
  border-bottom: 1px solid var(--line);
  font-size: 0.68rem;
  line-height: 1.45;
}

.turn-log li > span {
  width: 6px;
  height: 6px;
  margin-top: 4px;
  background: #80938c;
  border-radius: 50%;
}

.turn-log li.good > span {
  background: #2f7665;
}
.turn-log li.risk > span {
  background: var(--coral);
}
.turn-log li.special > span {
  background: var(--gold-dark);
}

.turn-log p {
  margin: 0;
  overflow-wrap: anywhere;
}

.new-game-link {
  min-height: 44px;
  margin-top: auto;
  padding: 14px 0 0;
  color: var(--muted-ink);
  background: transparent;
  border: 0;
  border-top: 1px solid var(--line);
  cursor: pointer;
  font-size: 0.65rem;
  font-weight: 750;
  text-align: left;
}

@media (max-width: 1120px) {
  .play-layout {
    grid-template-columns: 220px 1fr;
  }

  .turn-log {
    grid-column: 1 / -1;
    min-height: auto;
  }

  .turn-log ol {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0 18px;
  }

  .new-game-link {
    margin-top: 12px;
  }
}

@media (max-width: 760px) {
  .play-layout {
    display: flex;
    min-height: auto;
    flex-direction: column;
  }

  .scoreboard {
    order: 1;
  }

  .scoreboard ol {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .scoreboard li {
    min-width: 180px;
  }

  .table-rules {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .felt-table {
    order: 2;
    min-height: 620px;
    border-width: 7px;
    border-radius: 30px;
  }

  .turn-log {
    order: 3;
  }
}

@media (max-width: 540px) {
  .felt-table {
    min-height: 590px;
    padding: 18px 14px;
  }

  .dice-zone {
    min-height: 270px;
  }

  .dice-grid {
    gap: 15px 11px;
  }

  .waiting-dice {
    grid-template-columns: repeat(3, 64px);
    gap: 15px 11px;
    transform: none;
  }

  .action-panel {
    align-items: stretch;
    flex-direction: column;
  }

  .ready-actions {
    text-align: center;
  }

  .bust-actions .bust-action {
    width: 100%;
    min-width: 0;
  }

  .decision-buttons {
    width: 100%;
    min-width: 0;
  }

  .selection-summary {
    text-align: center;
  }

  .turn-log ol {
    display: block;
  }
}
</style>
