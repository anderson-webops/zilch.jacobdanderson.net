<template>
  <main class="not-found">
    <span class="wordmark-mark" aria-hidden="true">0</span>
    <p class="eyebrow">
      Zilch
    </p>
    <h1>Nothing scored here.</h1>
    <p>The page you rolled for does not exist.</p>
    <NuxtLink class="home-link" to="/">
      Play Zilch
    </NuxtLink>
  </main>
</template>

<style scoped>
.not-found {
  display: grid;
  min-height: 100dvh;
  padding: 32px;
  place-content: center;
  justify-items: center;
  text-align: center;
}

.not-found h1 {
  margin: 10px 0 6px;
  font-family: 'DM Serif Display', serif;
  font-size: clamp(2.5rem, 8vw, 5rem);
  font-weight: 400;
}

.not-found > p:not(.eyebrow) {
  margin: 0;
  color: var(--muted-ink);
}

.home-link {
  display: inline-block;
  margin-top: 22px;
  padding: 11px 16px;
  color: white;
  background: var(--ink);
  border: 0;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 800;
  text-decoration: none;
}
</style>
