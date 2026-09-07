<script setup lang="ts">
import type { Die, DieValue } from '~/game/types'
import { pipPositions } from '~/utils/diceFaces'

defineProps<{ dice: Die[], rollNumber: number }>()

const faces: DieValue[] = [1, 2, 3, 4, 5, 6]
const orientations: Record<DieValue, [number, number]> = {
  1: [0, 0],
  2: [-90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [90, 0],
  6: [0, 180],
}

function rotation(die: Die, rollNumber: number, index: number) {
  const [x, y] = orientations[die.value]
  // Decorative phases never consume the engine's random-number stream.
  const phase = (rollNumber * 47 + index * 73) % 360
  return {
    '--from-x': `${720 + phase}deg`,
    '--from-y': `${-720 - phase}deg`,
    '--from-z': `${180 + index * 35}deg`,
    '--to-x': `${x}deg`,
    '--to-y': `${y}deg`,
  }
}
</script>

<template>
  <div class="rolling-dice" aria-hidden="true">
    <div v-for="(die, index) in dice" :key="die.id" class="die-space">
      <div class="cube" :style="rotation(die, rollNumber, index)">
        <span v-for="face in faces" :key="face" class="face" :class="`face-${face}`">
          <span v-for="position in 9" :key="position" class="pip" :class="{ filled: pipPositions[face].includes(position) }" />
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rolling-dice {
  --size: clamp(64px, 9vw, 92px);
  display: grid;
  grid-template-columns: repeat(3, var(--size));
  gap: clamp(16px, 2.3vw, 25px);
  padding-block: 18px;
}

.die-space {
  width: var(--size);
  height: var(--size);
  perspective: 650px;
}

.cube {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transform: translateZ(calc(var(--size) / -2)) rotateX(var(--to-x)) rotateY(var(--to-y));
  animation: tumble 2s cubic-bezier(0.15, 0.65, 0.25, 1) both;
}

.face {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template: repeat(3, 1fr) / repeat(3, 1fr);
  padding: 12px;
  background: #fffdf6;
  border: 2px solid #d7c9ae;
  border-radius: 14%;
  backface-visibility: hidden;
}

.face-1 {
  transform: translateZ(calc(var(--size) / 2));
}
.face-2 {
  transform: rotateX(90deg) translateZ(calc(var(--size) / 2));
}
.face-3 {
  transform: rotateY(90deg) translateZ(calc(var(--size) / 2));
}
.face-4 {
  transform: rotateY(-90deg) translateZ(calc(var(--size) / 2));
}
.face-5 {
  transform: rotateX(-90deg) translateZ(calc(var(--size) / 2));
}
.face-6 {
  transform: rotateY(180deg) translateZ(calc(var(--size) / 2));
}

.pip {
  width: clamp(8px, 1.25vw, 13px);
  height: clamp(8px, 1.25vw, 13px);
  align-self: center;
  justify-self: center;
  border-radius: 50%;
}

.pip.filled {
  background: var(--ink);
}

@keyframes tumble {
  from {
    transform: translateZ(calc(var(--size) / -2)) rotateX(var(--from-x)) rotateY(var(--from-y)) rotateZ(var(--from-z));
  }
  to {
    transform: translateZ(calc(var(--size) / -2)) rotateX(var(--to-x)) rotateY(var(--to-y)) rotateZ(0deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cube {
    animation: none;
  }
}
</style>
