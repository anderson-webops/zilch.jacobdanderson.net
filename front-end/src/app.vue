<script setup lang="ts">
import { appName } from '~/constants'

useHead({
  title: appName,
  htmlAttrs: {
    lang: 'en',
  },
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<style>
@font-face {
  font-family: 'DM Sans';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('/assets/fonts/dmsans-56778fc7.woff2') format('woff2');
}

@font-face {
  font-family: 'DM Serif Display';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/assets/fonts/dmserifdisplay-b6206db2.woff2') format('woff2');
}

@font-face {
  font-family: 'DM Mono';
  font-style: normal;
  font-weight: 300 500;
  font-display: swap;
  src: url('/assets/fonts/dmmono-cd6ed524.woff2') format('woff2');
}

:root {
  --ink: #17362e;
  --muted-ink: #60746d;
  --paper: #f6f0e2;
  --paper-strong: #fffaf0;
  --felt: #0d3026;
  --felt-light: #17483a;
  --gold: #e7ad4a;
  --gold-dark: #a96816;
  --coral: #a9422f;
  --coral-on-dark: #ff9a82;
  --focus-on-light: #74450e;
  --focus-on-dark: #f2c567;
  --line: rgb(23 54 46 / 16%);
  color-scheme: light;
  font-family: 'DM Sans', system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

html,
body,
#__nuxt {
  min-height: 100%;
  margin: 0;
  padding: 0;
}

html {
  color: var(--ink);
  background: var(--paper);
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

body {
  color: inherit;
  background: inherit;
  font-family: inherit;
}

button,
input,
select {
  font: inherit;
}

button,
a {
  -webkit-tap-highlight-color: transparent;
}

button:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible,
summary:focus-visible {
  outline: 3px solid var(--focus-on-light);
  outline-offset: 3px;
}

.site-shell,
.game-page {
  min-height: 100vh;
  min-height: 100svh;
}

.game-page {
  display: flex;
  flex-direction: column;
  padding: 22px clamp(18px, 4vw, 64px) 18px;
  overflow-x: clip;
  background:
    radial-gradient(circle at 12% 8%, rgb(231 173 74 / 16%), transparent 28rem),
    linear-gradient(135deg, #f8f3e7 0%, #eee4d1 100%);
}

.site-header,
.site-footer,
.game-frame {
  width: min(1220px, 100%);
  margin-inline: auto;
}

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.wordmark {
  display: inline-flex;
  gap: 11px;
  min-height: 44px;
  align-items: center;
  color: var(--ink);
  font-family: 'DM Serif Display', serif;
  font-size: 1.8rem;
  text-decoration: none;
}

.wordmark-mark {
  display: grid;
  width: 34px;
  height: 34px;
  color: var(--paper-strong);
  background: var(--coral);
  border-radius: 9px;
  place-items: center;
  font-family: 'DM Sans', sans-serif;
  font-size: 0.85rem;
  font-weight: 800;
  transform: rotate(-7deg);
}

.quiet-button {
  min-height: 44px;
  padding: 10px 2px;
  color: var(--ink);
  background: transparent;
  border: 0;
  border-bottom: 1px solid currentColor;
  cursor: pointer;
  font-size: 0.86rem;
  font-weight: 750;
}

.game-frame {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 0.95fr) minmax(380px, 1.05fr);
  gap: clamp(34px, 6vw, 84px);
  align-items: start;
  min-width: 0;
  padding-block: clamp(34px, 7vh, 84px);
}

.welcome-card,
.table-preview {
  min-width: 0;
}

.eyebrow,
.step-label,
.turn-kicker {
  margin: 0;
  color: var(--coral);
  font-size: 0.72rem;
  font-weight: 850;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.table-preview .turn-kicker,
.felt-table .turn-kicker {
  color: var(--coral-on-dark);
}

.welcome-card h1 {
  max-width: 700px;
  margin: 12px 0 18px;
  color: var(--ink);
  font-family: 'DM Serif Display', Georgia, serif;
  font-size: clamp(3.1rem, 6vw, 6.5rem);
  font-weight: 400;
  letter-spacing: -0.045em;
  line-height: 0.92;
}

.welcome-card h1 em {
  color: var(--gold-dark);
  font-style: italic;
}

.intro-copy {
  max-width: 570px;
  margin: 0;
  color: var(--muted-ink);
  font-size: clamp(0.98rem, 1.5vw, 1.1rem);
  line-height: 1.7;
}

.setup-preview {
  max-width: 560px;
  margin-top: 36px;
  padding: 22px;
  background: rgb(255 250 240 / 78%);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 20px 55px rgb(45 51 35 / 8%);
  backdrop-filter: blur(16px);
}

.setup-heading,
.player-preview-row {
  display: flex;
  align-items: center;
}

.setup-heading {
  justify-content: space-between;
  margin-bottom: 14px;
}

.setup-heading h2 {
  margin: 4px 0 0;
  font-family: 'DM Serif Display', serif;
  font-size: 1.45rem;
  font-weight: 400;
}

.player-count,
.player-kind {
  color: var(--muted-ink);
  font-size: 0.78rem;
  font-weight: 700;
}

.player-preview-row {
  gap: 12px;
  padding: 11px 2px;
  border-top: 1px solid var(--line);
  font-weight: 700;
}

.player-kind {
  margin-left: auto;
}

.player-token {
  display: grid;
  width: 34px;
  height: 34px;
  color: white;
  border-radius: 50%;
  place-items: center;
  font-size: 0.78rem;
}

.player-token-one {
  background: var(--coral);
}

.player-token-two {
  background: #2f7665;
}

.primary-button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  padding: 15px 18px;
  color: white;
  background: var(--ink);
  border: 0;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 800;
}

.table-preview {
  position: relative;
  /* Anchor the preview independently of expanding setup controls. */
  margin-top: 13rem;
  min-height: 570px;
  padding: 28px;
  overflow: hidden;
  color: #f8f3e7;
  background: radial-gradient(circle at 50% 18%, rgb(255 255 255 / 8%), transparent 40%), var(--felt);
  border: 8px solid #6b3f22;
  border-radius: 42px;
  box-shadow:
    inset 0 0 0 2px rgb(255 255 255 / 10%),
    0 30px 70px rgb(25 44 36 / 22%);
}

.table-preview::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgb(255 255 255 / 7%) 0.7px, transparent 0.7px);
  background-size: 6px 6px;
  content: '';
  opacity: 0.4;
}

.table-status,
.turn-preview,
.dice-preview {
  position: relative;
  z-index: 1;
}

.table-status {
  display: flex;
  justify-content: space-between;
  color: rgb(248 243 231 / 72%);
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dice-preview {
  display: grid;
  grid-template-columns: repeat(3, 78px);
  gap: 18px;
  justify-content: center;
  margin-top: 112px;
  transform: rotate(-3deg);
}

.preview-die {
  display: grid;
  aspect-ratio: 1;
  color: var(--ink);
  background: #fffdf6;
  border: 1px solid rgb(23 54 46 / 15%);
  border-radius: 18px;
  box-shadow:
    0 11px 0 #d9cdb7,
    0 20px 24px rgb(0 0 0 / 20%);
  place-items: center;
  font-family: 'DM Serif Display', serif;
  font-size: 2.1rem;
}

.preview-die:nth-child(2),
.preview-die:nth-child(5) {
  transform: translateY(11px) rotate(5deg);
}

.turn-preview {
  position: absolute;
  right: 28px;
  bottom: 28px;
  left: 28px;
  display: grid;
  gap: 4px;
  padding: 18px 20px;
  background: rgb(5 28 21 / 62%);
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 16px;
  backdrop-filter: blur(10px);
}

.turn-preview strong {
  font-family: 'DM Serif Display', serif;
  font-size: 1.55rem;
  font-weight: 400;
}

.turn-preview > span:last-child {
  color: rgb(248 243 231 / 68%);
  font-size: 0.8rem;
}

.site-footer {
  display: flex;
  gap: 9px;
  color: var(--muted-ink);
  font-size: 0.72rem;
}

@media (max-width: 900px) {
  .game-frame {
    grid-template-columns: minmax(0, 1fr);
  }

  .welcome-card h1 {
    font-size: clamp(3.4rem, 12vw, 5.8rem);
  }

  .table-preview {
    margin-top: 0;
    min-height: 520px;
  }
}

@media (max-width: 520px) {
  .game-page {
    padding-inline: 14px;
  }

  .game-frame {
    padding-top: 38px;
  }

  .welcome-card h1 {
    font-size: clamp(2.55rem, 13vw, 3.25rem);
  }

  .setup-preview {
    padding: 17px;
  }

  .table-preview {
    min-height: 460px;
    padding: 20px;
    border-width: 6px;
    border-radius: 30px;
  }

  .dice-preview {
    grid-template-columns: repeat(3, 62px);
    gap: 14px;
    margin-top: 95px;
  }

  .turn-preview {
    right: 20px;
    bottom: 20px;
    left: 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
