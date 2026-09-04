<script setup lang="ts">
import { scoringRules } from '~/game/scoring'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')

watch(() => props.open, (open) => {
  if (!dialog.value)
    return
  if (open && !dialog.value.open)
    dialog.value.showModal()
  else if (!open && dialog.value.open)
    dialog.value.close()
})

onMounted(() => {
  if (props.open)
    dialog.value?.showModal()
})
</script>

<template>
  <dialog ref="dialog" class="rules-dialog" aria-labelledby="rules-title" @close="emit('close')">
    <div class="dialog-header">
      <div>
        <p class="eyebrow">
          Rules of the table
        </p>
        <h2 id="rules-title">
          How to play Zilch
        </h2>
      </div>
      <button type="button" aria-label="Close rules" @click="dialog?.close()">
        ×
      </button>
    </div>

    <div class="rules-copy">
      <section>
        <h3>Take a turn</h3>
        <ol>
          <li>Roll all six dice, then choose at least one scoring die or combination.</li>
          <li>Bank the turn's points, or roll the remaining dice and risk losing them all.</li>
          <li>If every die scores, you have hot dice: all six return and your turn continues.</li>
          <li>A roll with no score is a Zilch. Your unbanked turn score is lost.</li>
        </ol>
      </section>

      <section>
        <h3>Scoring</h3>
        <dl class="score-list">
          <template v-for="rule in scoringRules" :key="rule.combination">
            <dt>{{ rule.combination }}</dt>
            <dd>{{ rule.score }}</dd>
          </template>
        </dl>
      </section>

      <section>
        <h3>Get on the board</h3>
        <p>
          Before banking smaller turns, a player must reach the table's opening score in one turn.
          The standard opening is 1,000 points. After that, any positive scoring turn may be banked.
        </p>
      </section>

      <section>
        <h3>Win the table</h3>
        <p>
          The standard target is 5,000. With Final Chase on, reaching it gives every other player one
          last turn. The highest score wins, and tied leaders share the result when ties are enabled.
        </p>
      </section>

      <section>
        <h3>Computer play</h3>
        <p>
          Easy uses a simple banking target. Medium responds to the scores and finish line. Hard uses the
          strongest tested policies from the companion Zilch simulator, including a separate policy when
          Stealing is on. These are tested strategies, not perfect play.
        </p>
        <NuxtLink class="tips-link" to="/tips" @click="dialog?.close()">
          Read the strategy guide
        </NuxtLink>
      </section>
    </div>
  </dialog>
</template>

<style scoped>
.rules-dialog {
  width: min(720px, calc(100% - 28px));
  max-height: min(820px, calc(100dvh - 28px));
  padding: 0;
  overflow: hidden;
  color: var(--ink);
  background: var(--paper-strong);
  border: 1px solid var(--line);
  border-radius: 24px;
  box-shadow: 0 28px 100px rgb(0 0 0 / 36%);
}

.rules-dialog::backdrop {
  background: rgb(7 26 20 / 68%);
  backdrop-filter: blur(6px);
}

.dialog-header {
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px clamp(20px, 4vw, 34px);
  background: rgb(255 250 240 / 93%);
  border-bottom: 1px solid var(--line);
  backdrop-filter: blur(14px);
}

.dialog-header h2 {
  margin: 4px 0 0;
  font-family: 'DM Serif Display', serif;
  font-size: clamp(1.8rem, 4vw, 2.5rem);
  font-weight: 400;
}

.dialog-header button {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  color: var(--ink);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 50%;
  cursor: pointer;
  place-items: center;
  font-size: 1.6rem;
  line-height: 1;
}

.rules-copy {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 32px;
  max-height: calc(100dvh - 150px);
  padding: 8px clamp(20px, 4vw, 34px) 30px;
  overflow-y: auto;
}

.rules-copy section {
  padding: 22px 0;
  border-bottom: 1px solid var(--line);
}

.rules-copy section:nth-child(1),
.rules-copy section:nth-child(2) {
  grid-row: span 2;
}

.rules-copy h3 {
  margin: 0 0 10px;
  font-family: 'DM Serif Display', serif;
  font-size: 1.25rem;
  font-weight: 400;
}

.rules-copy p,
.rules-copy ol {
  margin: 0;
  color: var(--muted-ink);
  font-size: 0.82rem;
  line-height: 1.65;
}

.tips-link {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  margin-top: 9px;
  color: var(--ink);
  font-size: 0.75rem;
  font-weight: 800;
}

.rules-copy ol {
  padding-left: 20px;
}

.rules-copy li + li {
  margin-top: 8px;
}

.score-list {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0;
  margin: 0;
}

.score-list dt,
.score-list dd {
  margin: 0;
  padding: 8px 0;
  border-bottom: 1px dotted var(--line);
  font-size: 0.78rem;
}

.score-list dd {
  padding-left: 14px;
  color: var(--ink);
  font-weight: 850;
  text-align: right;
}

@media (max-width: 620px) {
  .rules-copy {
    display: block;
  }
}
</style>
