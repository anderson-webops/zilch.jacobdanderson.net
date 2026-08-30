<script setup lang="ts">
definePageMeta({
  layout: 'home',
})

const {
  state,
  storageAvailable,
  hasSavedGame,
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
} = useZilchGame()

const rulesOpen = ref(false)
const newGameDialog = useTemplateRef<HTMLDialogElement>('newGameDialog')

function requestNewGame() {
  if (!state.value || state.value.phase === 'finished') {
    leaveGame()
    return
  }
  newGameDialog.value?.showModal()
}

function confirmNewGame() {
  newGameDialog.value?.close()
  leaveGame()
}
</script>

<template>
  <div class="game-page" :class="{ playing: state }">
    <header class="site-header">
      <button class="wordmark" type="button" aria-label="Zilch home" @click="requestNewGame">
        <span class="wordmark-mark" aria-hidden="true">6</span>
        <span>Zilch</span>
      </button>
      <nav aria-label="Game controls">
        <button v-if="state" class="header-link" type="button" @click="requestNewGame">
          New game
        </button>
        <button class="quiet-button" type="button" @click="rulesOpen = true">
          How to play
        </button>
      </nav>
    </header>

    <template v-if="!state">
      <main class="game-frame">
        <section class="welcome-card" aria-labelledby="welcome-title">
          <p class="eyebrow">
            Six dice. One nerve.
          </p>
          <h1 id="welcome-title">
            Press your luck.<br><em>Bank before you bust.</em>
          </h1>
          <p class="intro-copy">
            A faithful browser edition of the classic dice game. Play the computer or gather up to six
            people around one screen.
          </p>

          <GameSetup
            :has-saved-game="hasSavedGame"
            :storage-available="storageAvailable"
            @start="startGame"
            @resume="resumeGame"
          />
        </section>

        <aside class="table-preview" aria-label="Zilch game table preview">
          <div class="table-status">
            <span>First to 5,000</span>
            <span>Opening score 1,000</span>
          </div>
          <div class="dice-preview" aria-hidden="true">
            <span v-for="value in [1, 5, 3, 6, 2, 4]" :key="value" class="preview-die">
              {{ value }}
            </span>
          </div>
          <div class="turn-preview">
            <span class="turn-kicker">Your turn</span>
            <strong>Ready to roll?</strong>
            <span>Choose scoring dice, then bank or risk another roll.</span>
          </div>
        </aside>
      </main>
    </template>

    <GameTable
      v-else
      :state="state"
      :selectable-ids="selectableIds"
      :selection-score="selection?.score ?? 0"
      :selection-valid="selection?.valid ?? false"
      :selection-label="selection?.label ?? ''"
      :selection-reason="selection?.reason ?? ''"
      :can-bank="selectionCanBank"
      :projected-score="projectedScore"
      :dice-after-selection="diceAfterSelection"
      @roll="roll"
      @toggle="toggle"
      @recommend="recommend"
      @continue="continueRolling"
      @bank="bank"
      @pass="pass"
      @steal="steal"
      @new-game="requestNewGame"
      @rules="rulesOpen = true"
    />

    <footer class="site-footer">
      <span>Built from Jacob Anderson's Zilch games</span>
      <span aria-hidden="true">•</span>
      <span :role="state ? 'status' : undefined" :aria-live="state ? 'polite' : undefined">
        {{ storageAvailable ? 'Saved only on this device' : 'This session is not being saved' }}
      </span>
    </footer>

    <RulesDialog :open="rulesOpen" @close="rulesOpen = false" />

    <dialog ref="newGameDialog" class="confirm-dialog" aria-labelledby="new-game-title">
      <p class="eyebrow">
        Leave this table?
      </p>
      <h2 id="new-game-title">
        Start a new game
      </h2>
      <p>The current saved game will be replaced.</p>
      <div>
        <button type="button" @click="newGameDialog?.close()">
          Keep playing
        </button>
        <button class="confirm-leave" type="button" @click="confirmNewGame">
          Start over
        </button>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.site-header nav {
  display: flex;
  gap: 18px;
  align-items: center;
}

.wordmark {
  padding: 0;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.header-link {
  padding: 10px 0;
  color: var(--muted-ink);
  background: transparent;
  border: 0;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 750;
}

.game-page.playing {
  padding-inline: clamp(12px, 2.3vw, 34px);
}

.game-page.playing .site-header,
.game-page.playing .site-footer {
  width: min(1480px, 100%);
}

.confirm-dialog {
  width: min(400px, calc(100% - 28px));
  padding: 28px;
  color: var(--ink);
  background: var(--paper-strong);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 24px 80px rgb(0 0 0 / 35%);
}

.confirm-dialog::backdrop {
  background: rgb(7 26 20 / 68%);
  backdrop-filter: blur(5px);
}

.confirm-dialog h2 {
  margin: 7px 0 8px;
  font-family: 'DM Serif Display', serif;
  font-size: 2rem;
  font-weight: 400;
}

.confirm-dialog > p:not(.eyebrow) {
  margin: 0;
  color: var(--muted-ink);
  font-size: 0.8rem;
}

.confirm-dialog > div {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  margin-top: 22px;
}

.confirm-dialog button {
  padding: 11px 13px;
  color: var(--ink);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
  font-weight: 800;
}

.confirm-dialog .confirm-leave {
  color: white;
  background: var(--coral);
  border-color: var(--coral);
}

@media (max-width: 520px) {
  .site-header nav {
    gap: 10px;
  }

  .header-link {
    display: none;
  }
}
</style>
