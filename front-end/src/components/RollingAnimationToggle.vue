<script setup lang="ts">
defineProps<{ enabled: boolean, reducedMotion: boolean }>()
const emit = defineEmits<{ change: [enabled: boolean] }>()
</script>

<template>
  <label class="animation-option">
    <input :checked="enabled" type="checkbox" @change="emit('change', ($event.target as HTMLInputElement).checked)">
    <span>
      Rolling animation
      <small v-if="enabled && reducedMotion">Paused by your device’s reduced-motion setting.</small>
    </span>
  </label>
</template>

<style scoped>
.animation-option {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 10px;
  padding-block: 12px;
  color: var(--ink);
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 750;
}

.animation-option input {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  accent-color: var(--ink);
  font-size: 16px;
}

.animation-option small {
  display: block;
  margin-top: 4px;
  color: var(--muted-ink);
  font-size: 0.7rem;
  font-weight: 400;
}
</style>
