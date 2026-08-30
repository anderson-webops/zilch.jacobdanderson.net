<script setup lang="ts">
import type { Die } from '~/game/types'

const props = defineProps<{
  die: Die
  selected: boolean
  selectable: boolean
  interactive: boolean
}>()

const emit = defineEmits<{
  toggle: [dieId: number]
}>()

const pipPositions: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
}

const label = computed(() => {
  let state = 'not a scoring die'
  if (props.selected)
    state = 'selected'
  else if (!props.interactive)
    state = 'computer is choosing'
  else if (props.selectable)
    state = 'available to score'
  return `Die showing ${props.die.value}, ${state}`
})
</script>

<template>
  <button
    class="die"
    :class="{ selected, muted: !selectable, locked: !interactive }"
    type="button"
    :aria-label="label"
    :aria-pressed="selected"
    :disabled="!interactive || !selectable"
    @click="emit('toggle', die.id)"
  >
    <span
      v-for="position in pipPositions[die.value]"
      :key="position"
      class="pip"
      :class="`pip-${position}`"
      aria-hidden="true"
    />
    <span class="die-value">{{ die.value }}</span>
  </button>
</template>

<style scoped>
.die {
  position: relative;
  display: grid;
  width: clamp(64px, 9vw, 92px);
  aspect-ratio: 1;
  padding: 12px;
  color: var(--ink);
  background: #fffdf6;
  border: 2px solid transparent;
  border-radius: clamp(15px, 2vw, 22px);
  box-shadow:
    0 8px 0 #d7c9ae,
    0 16px 22px rgb(0 0 0 / 22%);
  cursor: pointer;
  grid-template: repeat(3, 1fr) / repeat(3, 1fr);
  transform: translateY(0);
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    opacity 160ms ease,
    border-color 160ms ease;
}

.die:hover:not(:disabled) {
  transform: translateY(-4px);
}

.die.selected {
  border-color: var(--gold);
  box-shadow:
    0 3px 0 #a96816,
    0 10px 18px rgb(0 0 0 / 24%),
    0 0 0 4px rgb(231 173 74 / 25%);
  transform: translateY(5px);
}

.die.muted {
  cursor: not-allowed;
  opacity: 0.42;
}

.die.locked {
  cursor: default;
}

.die.locked:not(.muted) {
  opacity: 1;
}

.die:focus-visible {
  outline-color: var(--focus-on-dark);
}

.pip {
  width: clamp(8px, 1.25vw, 13px);
  height: clamp(8px, 1.25vw, 13px);
  align-self: center;
  justify-self: center;
  background: var(--ink);
  border-radius: 50%;
  box-shadow: inset 0 2px 2px rgb(0 0 0 / 22%);
}

.die.selected .pip {
  background: var(--coral);
}

.pip-1 {
  grid-area: 1 / 1;
}
.pip-3 {
  grid-area: 1 / 3;
}
.pip-4 {
  grid-area: 2 / 1;
}
.pip-5 {
  grid-area: 2 / 2;
}
.pip-6 {
  grid-area: 2 / 3;
}
.pip-7 {
  grid-area: 3 / 1;
}
.pip-9 {
  grid-area: 3 / 3;
}

.die-value {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes settle {
  0% {
    transform: translateY(-16px) rotate(-8deg);
    opacity: 0;
  }
  65% {
    transform: translateY(3px) rotate(2deg);
    opacity: 1;
  }
  100% {
    transform: translateY(0) rotate(0);
  }
}

.die {
  animation: settle 420ms cubic-bezier(0.2, 0.75, 0.25, 1) both;
}
</style>
