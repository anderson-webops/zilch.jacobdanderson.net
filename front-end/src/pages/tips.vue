<script setup lang="ts">
definePageMeta({
  layout: 'home',
})

useHead({
  title: 'Strategy tips · Zilch',
  link: [
    { rel: 'canonical', href: 'https://zilch.jacobdanderson.net/tips/' },
  ],
  meta: [
    {
      name: 'description',
      content: 'A compact reference for simulator-tested Zilch banking targets in standard and Stealing games.',
    },
    { property: 'og:title', content: 'Strategy tips · Zilch' },
    {
      property: 'og:description',
      content: 'A compact reference for simulator-tested Zilch banking targets in standard and Stealing games.',
    },
    { property: 'og:url', content: 'https://zilch.jacobdanderson.net/tips/' },
    { name: 'twitter:title', content: 'Strategy tips · Zilch' },
    {
      name: 'twitter:description',
      content: 'A compact reference for simulator-tested Zilch banking targets in standard and Stealing games.',
    },
  ],
})

const standardThresholds = [
  { dice: 1, practical: 200 },
  { dice: 2, practical: 1050 },
  { dice: 3, practical: 1150 },
  { dice: 4, practical: 1550 },
  { dice: 5, practical: 2150 },
  { dice: 6, practical: 5000 },
]

const stealingThresholds = [
  { dice: 1, bank: 350, accept: 550 },
  { dice: 2, bank: 350, accept: 450 },
  { dice: 3, bank: 1150, accept: 350 },
  { dice: 4, bank: 1400, accept: 250 },
  { dice: 5, bank: 1400, accept: 150 },
  { dice: 6, bank: 1400, accept: null },
]
</script>

<template>
  <div class="tips-page">
    <header class="site-header">
      <NuxtLink class="wordmark" to="/" aria-label="Zilch home">
        <span class="wordmark-mark" aria-hidden="true">6</span>
        <span>Zilch</span>
      </NuxtLink>
      <nav aria-label="Tips navigation">
        <NuxtLink class="play-link" to="/">
          Play now
        </NuxtLink>
      </nav>
    </header>

    <main class="tips-main">
      <section class="tips-hero" aria-labelledby="tips-title">
        <h1 id="tips-title">
          Best Tested Strategy
        </h1>
      </section>

      <section class="threshold-card" aria-labelledby="threshold-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">
              Standard game
            </p>
            <h2 id="threshold-title">
              Bank near these totals
            </h2>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <caption class="visually-hidden">
              Recommended turn score for banking by number of dice remaining
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  Dice left
                </th>
                <th scope="col">
                  Bank near
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in standardThresholds" :key="row.dice">
                <th scope="row">
                  <span class="die-count">{{ row.dice }}</span>
                  {{ row.dice === 1 ? 'die' : 'dice' }}
                </th>
                <td>
                  {{ row.practical.toLocaleString() }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="table-note">
          Use the dice you would roll next and the total points at risk. When banking, take every scoring die.
        </p>
      </section>

      <section class="variants" aria-labelledby="variants-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">
              Stealing game
            </p>
            <h2 id="variants-title">
              Use the stealing policy
            </h2>
          </div>
          <p>Stealing changes both when to bank and when a carried score is worth taking.</p>
        </div>
        <div class="table-wrap">
          <table>
            <caption class="visually-hidden">
              Stealing-game bank and carried-score acceptance targets by number of dice remaining
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  Dice left
                </th>
                <th scope="col">
                  Bank near
                </th>
                <th scope="col">
                  Take steal at
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in stealingThresholds" :key="row.dice">
                <th scope="row">
                  {{ row.dice }} {{ row.dice === 1 ? 'die' : 'dice' }}
                </th>
                <td>{{ row.bank.toLocaleString() }}</td>
                <td>{{ row.accept === null ? 'No offer' : row.accept.toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="variant-note">
          Three Pairs does not change the recommendation; use the same policy with it on or off.
        </p>
      </section>

      <p class="research-note">
        Best policy found in two-player simulation; not mathematically proven optimal.
      </p>
    </main>

    <footer class="site-footer">
      <span>Simulation-tested Zilch strategy</span>
      <NuxtLink to="/">
        Back to the table
      </NuxtLink>
    </footer>
  </div>
</template>

<style scoped>
.tips-page {
  min-height: 100vh;
  min-height: 100svh;
  padding: 22px clamp(18px, 4vw, 64px) 26px;
  overflow-x: clip;
  background:
    radial-gradient(circle at 12% 8%, rgb(231 173 74 / 16%), transparent 28rem),
    linear-gradient(135deg, #f8f3e7 0%, #eee4d1 100%);
}

.site-header,
.site-footer,
.tips-main {
  width: min(1160px, 100%);
  margin-inline: auto;
}

.play-link {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  padding: 10px 2px;
  color: var(--ink);
  border-bottom: 1px solid currentcolor;
  font-size: 0.82rem;
  font-weight: 800;
  text-decoration: none;
}

.tips-main {
  width: min(760px, 100%);
  padding-block: clamp(38px, 6vw, 68px);
}

.tips-hero h1 {
  margin: 0;
  font-family: 'DM Serif Display', Georgia, serif;
  font-size: clamp(1.65rem, 5vw, 3.25rem);
  font-weight: 400;
  letter-spacing: -0.025em;
  line-height: 1.12;
}

.threshold-card,
.variants {
  background: rgb(255 250 240 / 78%);
  border: 1px solid var(--line);
  border-radius: 22px;
  box-shadow: 0 18px 48px rgb(45 51 35 / 7%);
  backdrop-filter: blur(14px);
}

.threshold-card {
  margin-top: 24px;
  padding: clamp(22px, 4vw, 38px);
}

.section-heading {
  display: flex;
  gap: 28px;
  align-items: flex-end;
  justify-content: space-between;
}

.section-heading h2,
.variants h2 {
  margin: 7px 0 0;
  font-family: 'DM Serif Display', serif;
  font-size: clamp(1.7rem, 3.5vw, 2.6rem);
  font-weight: 400;
  letter-spacing: -0.025em;
  line-height: 1.05;
}

.section-heading > p {
  max-width: 420px;
  margin: 0;
  color: var(--muted-ink);
  font-size: 0.8rem;
  line-height: 1.55;
}

.table-wrap {
  margin-top: 26px;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 14px 12px;
  border-bottom: 1px solid var(--line);
  text-align: left;
}

thead th {
  color: var(--muted-ink);
  font-size: 0.66rem;
  font-weight: 850;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

tbody th {
  font-size: 0.78rem;
}

tbody td:nth-child(n + 2) {
  color: var(--gold-dark);
  font-family: 'DM Mono', ui-monospace, monospace;
  font-weight: 850;
}

.variants tbody td:last-child {
  color: var(--muted-ink);
  font-size: 0.76rem;
}

.die-count {
  display: inline-grid;
  width: 30px;
  height: 30px;
  margin-right: 8px;
  color: white;
  background: var(--ink);
  border-radius: 8px;
  place-items: center;
  font-family: 'DM Mono', ui-monospace, monospace;
  font-size: 0.7rem;
}

.table-note {
  margin: 16px 0 0;
  color: var(--muted-ink);
  font-size: 0.7rem;
  line-height: 1.55;
}

.variants {
  margin-top: 16px;
  padding: clamp(22px, 4vw, 38px);
}

.variants .table-wrap {
  margin-top: 20px;
}

.variant-note {
  margin-top: 16px;
  margin-bottom: 0;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  color: var(--muted-ink);
  font-size: 0.72rem;
  line-height: 1.55;
}

.research-note {
  margin: 18px 0 0;
  color: var(--muted-ink);
  font-size: 0.7rem;
  line-height: 1.55;
}

.site-footer {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  color: var(--muted-ink);
  font-size: 0.72rem;
}

.site-footer a {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  color: inherit;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 620px) {
  .tips-page {
    padding-inline: 14px;
  }

  .tips-main {
    padding-block: 28px 34px;
  }

  .threshold-card {
    margin-top: 22px;
  }

  .section-heading {
    align-items: stretch;
    flex-direction: column;
  }

  th,
  td {
    padding-inline: 8px;
  }

  .site-footer {
    flex-wrap: wrap;
  }
}
</style>
