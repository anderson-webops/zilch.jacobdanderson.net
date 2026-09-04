<script setup lang="ts">
import type { ComputerDifficulty, GameSettings, PlayerDraft } from '~/game/types'
import { defaultSettings } from '~/game/engine'

defineProps<{
  hasSavedGame: boolean
  storageAvailable: boolean
}>()

const emit = defineEmits<{
  start: [players: PlayerDraft[], settings: GameSettings]
  resume: []
}>()

const mode = ref<'computer' | 'local'>('computer')
const playerCount = ref(2)
const localNames = ref(['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6'])
const humanName = ref('Player 1')
const computerName = ref('Computer')
const computerDifficulty = ref<ComputerDifficulty>('medium')
const winningScore = ref(defaultSettings.winningScore)
const openingScore = ref(defaultSettings.openingScore)
const firstRollBust = ref(defaultSettings.firstRollBust)
const finalChase = ref(defaultSettings.finalChase)
const allowTies = ref(defaultSettings.allowTies)
const stealing = ref(defaultSettings.stealing)
const error = ref('')
const submitted = ref(false)
const setupForm = useTemplateRef<HTMLFormElement>('setupForm')

const difficultyHelp: Record<ComputerDifficulty, string> = {
  easy: 'Banks at a simple, forgiving target while still recognizing a chance to win.',
  medium: 'Adjusts its risk to the score, the leader, and the finish line.',
  hard: 'Uses the strongest risk thresholds found by the Zilch simulations.',
}

watch(winningScore, (value) => {
  if (openingScore.value > value)
    openingScore.value = value
})

const players = computed<PlayerDraft[]>(() => {
  if (mode.value === 'computer') {
    return [
      { name: humanName.value, kind: 'human' },
      { name: computerName.value, kind: 'computer', difficulty: computerDifficulty.value },
    ]
  }
  return localNames.value.slice(0, playerCount.value).map(name => ({ name, kind: 'human' as const }))
})

function clearError() {
  error.value = ''
  submitted.value = false
}

function isNameInvalid(index: number) {
  if (!submitted.value)
    return false
  const names = players.value.map(player => player.name.trim().toLocaleLowerCase())
  const name = names[index] ?? ''
  return !name || names.filter(candidate => candidate === name).length > 1
}

async function reportError(message: string) {
  error.value = message
  await nextTick()
  setupForm.value?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()
}

function adjustPlayerCount(change: number) {
  playerCount.value = Math.min(6, Math.max(1, playerCount.value + change))
  clearError()
}

async function submit() {
  submitted.value = true
  error.value = ''
  const names = players.value.map(player => player.name.trim())
  if (names.some(name => !name)) {
    await reportError('Give every player a name.')
    return
  }
  if (new Set(names.map(name => name.toLocaleLowerCase())).size !== names.length) {
    await reportError('Player names need to be different.')
    return
  }

  emit('start', players.value, {
    winningScore: winningScore.value,
    openingScore: openingScore.value,
    firstRollBust: firstRollBust.value,
    finalChase: finalChase.value,
    allowTies: allowTies.value,
    stealing: stealing.value,
  })
}
</script>

<template>
  <form
    ref="setupForm"
    class="setup-card"
    aria-labelledby="setup-title"
    @submit.prevent="submit"
    @input="clearError"
    @change="clearError"
  >
    <div class="setup-heading">
      <div>
        <p class="step-label">
          New table
        </p>
        <h2 id="setup-title">
          Choose your players
        </h2>
      </div>
      <button v-if="hasSavedGame" class="resume-button" type="button" @click="emit('resume')">
        Resume saved game
      </button>
    </div>

    <fieldset class="mode-picker">
      <legend>Game mode</legend>
      <label :class="{ active: mode === 'computer' }">
        <input v-model="mode" type="radio" value="computer">
        <span class="mode-icon" aria-hidden="true">♟</span>
        <span>
          <strong>Solo game</strong>
          <small>Play against the computer</small>
        </span>
      </label>
      <label :class="{ active: mode === 'local' }">
        <input v-model="mode" type="radio" value="local">
        <span class="mode-icon" aria-hidden="true">●●</span>
        <span>
          <strong>Pass &amp; play</strong>
          <small>Share this device</small>
        </span>
      </label>
    </fieldset>

    <div v-if="mode === 'computer'" class="players-list">
      <label class="player-row">
        <span class="player-token player-token-one">P1</span>
        <span class="field-copy">Your name</span>
        <input
          v-model="humanName"
          maxlength="30"
          autocomplete="name"
          aria-label="Your player name"
          :aria-invalid="isNameInvalid(0)"
          :aria-describedby="isNameInvalid(0) ? 'setup-error' : undefined"
        >
        <span class="player-kind">Human</span>
      </label>
      <label class="player-row">
        <span class="player-token player-token-two">C</span>
        <span class="field-copy">Opponent</span>
        <input
          v-model="computerName"
          maxlength="30"
          autocomplete="off"
          aria-label="Computer player name"
          :aria-invalid="isNameInvalid(1)"
          :aria-describedby="isNameInvalid(1) ? 'setup-error' : undefined"
        >
        <span class="player-kind">{{ computerDifficulty }} computer</span>
      </label>
      <label class="difficulty-setting">
        <span>
          <strong>Computer difficulty</strong>
          <small id="difficulty-help" aria-live="polite">{{ difficultyHelp[computerDifficulty] }}</small>
        </span>
        <select v-model="computerDifficulty" aria-label="Computer difficulty" aria-describedby="difficulty-help">
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </label>
    </div>

    <div v-else class="local-setup">
      <div class="count-control">
        <span>Players</span>
        <div>
          <button type="button" aria-label="Remove a player" :disabled="playerCount <= 1" @click="adjustPlayerCount(-1)">
            −
          </button>
          <strong>{{ playerCount }}</strong>
          <button type="button" aria-label="Add a player" :disabled="playerCount >= 6" @click="adjustPlayerCount(1)">
            +
          </button>
        </div>
      </div>
      <div class="name-grid">
        <label v-for="index in playerCount" :key="index">
          <span>Player {{ index }}</span>
          <input
            v-model="localNames[index - 1]"
            maxlength="30"
            autocomplete="off"
            :aria-invalid="isNameInvalid(index - 1)"
            :aria-describedby="isNameInvalid(index - 1) ? 'setup-error' : undefined"
          >
        </label>
      </div>
    </div>

    <div class="score-settings">
      <label>
        <span>First to</span>
        <select v-model="winningScore">
          <option :value="2500">2,500</option>
          <option :value="5000">5,000</option>
          <option :value="7500">7,500</option>
          <option :value="10000">10,000</option>
        </select>
      </label>
      <label>
        <span>Get on the board at</span>
        <select v-model="openingScore">
          <option :value="0">No minimum</option>
          <option v-if="winningScore >= 500" :value="500">500</option>
          <option v-if="winningScore >= 1000" :value="1000">1,000</option>
          <option v-if="winningScore >= 1500" :value="1500">1,500</option>
        </select>
      </label>
    </div>

    <details class="house-rules">
      <summary>House rules <span>4 options</span></summary>
      <div class="rules-options">
        <label>
          <input v-model="firstRollBust" type="checkbox">
          <span><strong>First-roll mercy</strong><small>Take 50 points at risk and reroll after an opening Zilch.</small></span>
        </label>
        <label>
          <input v-model="finalChase" type="checkbox">
          <span><strong>Final chase</strong><small>Everyone else gets one last turn when the target is reached.</small></span>
        </label>
        <label>
          <input v-model="allowTies" type="checkbox">
          <span><strong>Allow ties</strong><small>Players level at the final high score share the win.</small></span>
        </label>
        <label>
          <input v-model="stealing" type="checkbox">
          <span><strong>Stealing</strong><small>Opened players may continue a banked partial turn at their own risk.</small></span>
        </label>
      </div>
    </details>

    <p v-if="error" id="setup-error" class="form-error" role="alert">
      {{ error }}
    </p>

    <button class="primary-button" type="submit">
      Start the game
      <span aria-hidden="true">→</span>
    </button>
    <p class="save-note" :class="{ warning: !storageAvailable }" role="status" aria-live="polite">
      {{ storageAvailable
        ? 'Your game saves on this device. No account needed.'
        : 'Saving is unavailable in this browser session. Keep this page open to continue playing.' }}
    </p>
  </form>
</template>

<style scoped>
.setup-card {
  width: 100%;
  min-width: 0;
  max-width: 620px;
  margin-top: 32px;
  padding: clamp(18px, 3vw, 26px);
  background: rgb(255 250 240 / 82%);
  border: 1px solid var(--line);
  border-radius: 22px;
  box-shadow: 0 20px 55px rgb(45 51 35 / 9%);
  backdrop-filter: blur(16px);
}

.setup-heading,
.player-row,
.count-control,
.score-settings,
.house-rules summary {
  display: flex;
  align-items: center;
}

.setup-heading {
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.setup-heading h2 {
  margin: 4px 0 0;
  font-family: 'DM Serif Display', serif;
  font-size: clamp(1.45rem, 3vw, 1.8rem);
  font-weight: 400;
}

.resume-button {
  min-height: 44px;
  padding: 9px 11px;
  color: var(--ink);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 800;
}

fieldset {
  min-width: 0;
  padding: 0;
  border: 0;
}

.mode-picker legend {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.mode-picker {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 13px;
}

.mode-picker label {
  display: flex;
  gap: 11px;
  align-items: center;
  padding: 13px;
  background: rgb(255 255 255 / 44%);
  border: 1px solid var(--line);
  border-radius: 13px;
  cursor: pointer;
}

.mode-picker label > span:last-child,
.setup-heading > div {
  min-width: 0;
}

.mode-picker label.active {
  background: rgb(231 173 74 / 10%);
  border-color: var(--gold-dark);
  box-shadow: 0 0 0 1px var(--gold-dark);
}

.mode-picker label:has(input:focus-visible) {
  outline: 3px solid var(--focus-on-light);
  outline-offset: 3px;
}

.mode-picker input {
  position: absolute;
  opacity: 0;
}

.mode-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  color: white;
  background: var(--ink);
  border-radius: 10px;
  place-items: center;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: -0.18em;
}

.mode-picker strong,
.mode-picker small {
  display: block;
}

.mode-picker strong {
  font-size: 0.86rem;
}

.mode-picker small {
  margin-top: 2px;
  color: var(--muted-ink);
  font-size: 0.7rem;
}

.players-list,
.local-setup,
.score-settings,
.house-rules {
  border-top: 1px solid var(--line);
}

.player-row {
  gap: 10px;
  min-width: 0;
  padding: 10px 0;
}

.field-copy {
  width: 74px;
  color: var(--muted-ink);
  font-size: 0.72rem;
  font-weight: 700;
}

.player-row input,
.name-grid input,
.score-settings select,
.difficulty-setting select {
  min-width: 0;
  color: var(--ink);
  background: rgb(255 255 255 / 62%);
  border: 1px solid var(--line);
  border-radius: 9px;
}

.player-row input[aria-invalid='true'],
.name-grid input[aria-invalid='true'] {
  background: #fff4f1;
  border-color: var(--coral);
  box-shadow: 0 0 0 2px rgb(169 66 47 / 14%);
}

.player-row input {
  flex: 1;
  padding: 9px 10px;
}

.player-kind {
  width: 104px;
  color: var(--muted-ink);
  font-size: 0.66rem;
  font-weight: 750;
  text-align: right;
  text-transform: capitalize;
}

.difficulty-setting {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(112px, 0.38fr);
  gap: 14px;
  align-items: center;
  padding: 12px 0 14px;
  border-top: 1px solid var(--line);
}

.difficulty-setting strong,
.difficulty-setting small {
  display: block;
}

.difficulty-setting strong {
  font-size: 0.78rem;
}

.difficulty-setting small {
  margin-top: 3px;
  color: var(--muted-ink);
  font-size: 0.66rem;
  line-height: 1.4;
}

.difficulty-setting select {
  width: 100%;
  min-height: 44px;
  padding: 9px 10px;
}

.count-control {
  justify-content: space-between;
  padding: 12px 0;
  font-size: 0.78rem;
  font-weight: 750;
}

.count-control div {
  display: flex;
  gap: 8px;
  align-items: center;
}

.count-control button {
  display: grid;
  width: 44px;
  height: 44px;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 8px;
  cursor: pointer;
  place-items: center;
}

.count-control button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.name-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding-bottom: 12px;
}

.name-grid label,
.score-settings label {
  display: grid;
  gap: 5px;
}

.name-grid span,
.score-settings span {
  color: var(--muted-ink);
  font-size: 0.66rem;
  font-weight: 750;
}

.name-grid input,
.score-settings select {
  width: 100%;
  padding: 9px 10px;
}

.score-settings {
  gap: 12px;
  padding: 13px 0;
}

.score-settings label {
  flex: 1;
}

.house-rules {
  padding: 13px 0 4px;
}

.house-rules summary {
  justify-content: space-between;
  min-height: 44px;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 800;
  list-style: none;
}

.house-rules summary::-webkit-details-marker {
  display: none;
}

.house-rules summary span {
  color: var(--muted-ink);
  font-size: 0.68rem;
}

.rules-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  padding-top: 12px;
}

.rules-options label {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  padding: 10px;
  background: rgb(255 255 255 / 45%);
  border: 1px solid var(--line);
  border-radius: 10px;
}

.rules-options input {
  width: 16px;
  height: 16px;
  margin: 2px 0 0;
  accent-color: var(--ink);
}

.rules-options strong,
.rules-options small {
  display: block;
}

.rules-options strong {
  font-size: 0.75rem;
}

.rules-options small {
  margin-top: 2px;
  color: var(--muted-ink);
  font-size: 0.64rem;
  line-height: 1.35;
}

.primary-button {
  margin-top: 16px;
}

.form-error {
  margin: 12px 0 0;
  color: #a33224;
  font-size: 0.76rem;
  font-weight: 750;
}

.save-note {
  margin: 8px 0 0;
  color: var(--muted-ink);
  font-size: 0.65rem;
  text-align: center;
}

.save-note.warning {
  color: var(--coral);
  font-weight: 750;
}

@media (max-width: 560px) {
  .mode-picker,
  .name-grid,
  .rules-options {
    grid-template-columns: 1fr;
  }

  .score-settings {
    align-items: stretch;
    flex-direction: column;
  }

  .field-copy {
    display: none;
  }

  .player-kind {
    width: auto;
  }

  .player-row input,
  .name-grid input,
  .score-settings select,
  .difficulty-setting select {
    font-size: 1rem;
  }

  .difficulty-setting {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
