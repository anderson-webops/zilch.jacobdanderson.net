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
      content: 'Simulator-tested Zilch banking guidance and score-aware tips for endgame play, Three Pairs, and Stealing.',
    },
    { property: 'og:title', content: 'Strategy tips · Zilch' },
    {
      property: 'og:description',
      content: 'Simulator-tested Zilch banking guidance and score-aware tips for standard and Stealing games.',
    },
    { property: 'og:url', content: 'https://zilch.jacobdanderson.net/tips/' },
    { name: 'twitter:title', content: 'Strategy tips · Zilch' },
    {
      name: 'twitter:description',
      content: 'Simulator-tested Zilch banking guidance and score-aware tips for standard and Stealing games.',
    },
  ],
})

const standardThresholds = [
  { dice: 1, trained: 200, practical: 200, risk: 'Very high' },
  { dice: 2, trained: 1021, practical: 1050, risk: 'High' },
  { dice: 3, trained: 1128, practical: 1150, risk: 'High' },
  { dice: 4, trained: 1506, practical: 1550, risk: 'Moderate' },
  { dice: 5, trained: 2130, practical: 2150, risk: 'Lower' },
  { dice: 6, trained: 2130, practical: 2150, risk: 'Lowest' },
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
        <div>
          <p class="eyebrow">
            The smart roll
          </p>
          <h1 id="tips-title">
            Let the dice left set your risk.
          </h1>
          <p>
            The strongest tested standard-game policy takes small wins when only one die remains,
            but asks much more from a safer roll of four, five, or six dice.
          </p>
        </div>
        <aside class="hero-rule" aria-label="Most important strategy tip">
          <span>Remember this</span>
          <strong>Fewer dice left?<br>Bank sooner.</strong>
          <p>Hot dice reset the risk: all six dice return, so the target rises again.</p>
        </aside>
      </section>

      <section class="threshold-card" aria-labelledby="threshold-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">
              Standard game
            </p>
            <h2 id="threshold-title">
              Practical starting targets
            </h2>
          </div>
          <p>
            Start with the target for the dice you would roll next, then adjust for the score and finish line.
          </p>
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
                <th scope="col">
                  Next-roll risk
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
                <td>{{ row.risk }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="table-note">
          The trained cutoffs are {{ standardThresholds.map(row => row.trained.toLocaleString()).join(', ') }}.
          Zilch scores move in 50-point steps, so the table rounds each cutoff up to the next reachable score.
        </p>
      </section>

      <div class="strategy-grid">
        <section aria-labelledby="opening-title">
          <span class="tip-number">01</span>
          <p class="eyebrow">
            Opening
          </p>
          <h2 id="opening-title">
            The opening minimum changes the first turn.
          </h2>
          <p>
            Before you are on the board, a banking target below the opening score is not available.
            Keep rolling until the whole turn can be banked. Once open, return to the dice-left guide.
          </p>
        </section>

        <section aria-labelledby="finish-title">
          <span class="tip-number">02</span>
          <p class="eyebrow">
            Finish line
          </p>
          <h2 id="finish-title">
            Compare the lead before crossing the target.
          </h2>
          <p>
            With Final Chase off, bank a winning total immediately. With Final Chase on, a narrow lead
            may need a buffer if several safe dice remain. Protect a strong lead sooner when the next roll is risky.
          </p>
        </section>

        <section aria-labelledby="short-title">
          <span class="tip-number">03</span>
          <p class="eyebrow">
            Stop short?
          </p>
          <h2 id="short-title">
            Sitting at 4,950 is a special-case play.
          </h2>
          <p>
            Stopping just below 5,000 makes the next scoring roll easy to bank, but it also gives opponents
            another chance before you trigger Final Chase. Consider it only when rivals are far behind.
          </p>
        </section>
      </div>

      <section class="variants" aria-labelledby="variants-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">
              House rules
            </p>
            <h2 id="variants-title">
              What changes by variant
            </h2>
          </div>
        </div>
        <div class="variant-grid">
          <article>
            <span class="variant-mark">Sets</span>
            <h3>Three Pairs, also called Sets</h3>
            <p>
              The standard policy remained the best tested choice when Three Pairs was removed. It scored
              58.0% match points against the baseline across 500,000 games. A separately trained Sets-off
              candidate did worse. Use the same starting table; Three Pairs simply adds another 1,000-point
              score that returns all six dice.
            </p>
          </article>
          <article>
            <span class="variant-mark">Steal</span>
            <h3>Stealing</h3>
            <p>
              Stealing changes the decision enough that the standard policy lost its clear edge. A newly trained
              policy reached 52.1% match points against the baseline across 500,000 holdout games, with an average
              score margin of +63.4 points at seed 2026091102. With Three Pairs off too, it scored 51.7% at seed
              2026091104. This is the best tested stealing policy, though its smaller edge deserves more caution.
            </p>
            <dl class="mini-thresholds">
              <div v-for="row in stealingThresholds" :key="row.dice">
                <dt>{{ row.dice }} {{ row.dice === 1 ? 'die' : 'dice' }}</dt>
                <dd>
                  Bank {{ row.bank.toLocaleString() }}<template v-if="row.accept !== null">
                    ; steal {{ row.accept.toLocaleString() }}+
                  </template>
                </dd>
              </div>
            </dl>
            <p class="variant-note">
              Practical bank targets are rounded up from trained cutoffs 313, 313, 1,106, 1,360, 1,360, and 1,376.
            </p>
          </article>
        </div>
      </section>

      <section class="evidence-card" aria-labelledby="evidence-title">
        <div>
          <p class="eyebrow">
            Why these numbers
          </p>
          <h2 id="evidence-title">
            Tested, not guessed
          </h2>
        </div>
        <p>
          The tracked Computers vs Zilch champion played 500,000 standard two-player games, arranged as 250,000
          mirrored seat-swapped pairs, against the built-in baseline using seed 2026091101. It earned 58.6% match
          points with an average score margin of +266.0 points. Mirroring reduces first-player bias.
        </p>
        <p class="evidence-caution">
          A rough uncertainty band is about ±0.2 percentage points when the 250,000 mirrored pairs are treated as
          the effective sample. The simulations did not test games with more than two players, and the finish-line
          buffer and 4,950 ideas above are score-aware heuristics, not measured simulator results. These runs identify
          the strongest tested policy in this simulator, not mathematically perfect play.
        </p>
      </section>

      <div class="tips-cta">
        <div>
          <p class="eyebrow">
            Try the guide
          </p>
          <h2>Choose a difficulty and roll.</h2>
        </div>
        <NuxtLink to="/">
          Start a game
        </NuxtLink>
      </div>
    </main>

    <footer class="site-footer">
      <span>Strategy from Jacob Anderson's Zilch simulations</span>
      <span aria-hidden="true">•</span>
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
  padding-block: clamp(42px, 7vw, 84px);
}

.tips-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(250px, 0.72fr);
  gap: clamp(30px, 6vw, 72px);
  align-items: center;
}

.tips-hero h1 {
  max-width: 780px;
  margin: 12px 0 18px;
  font-family: 'DM Serif Display', Georgia, serif;
  font-size: clamp(3rem, 7vw, 6.5rem);
  font-weight: 400;
  letter-spacing: -0.045em;
  line-height: 0.94;
}

.tips-hero > div > p:last-child {
  max-width: 670px;
  margin: 0;
  color: var(--muted-ink);
  font-size: clamp(0.98rem, 1.7vw, 1.14rem);
  line-height: 1.7;
}

.hero-rule {
  position: relative;
  padding: 26px;
  overflow: hidden;
  color: #f8f3e7;
  background: var(--felt);
  border: 7px solid #6b3f22;
  border-radius: 30px;
  box-shadow: 0 24px 55px rgb(25 44 36 / 20%);
}

.hero-rule::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgb(255 255 255 / 7%) 0.7px, transparent 0.7px);
  background-size: 6px 6px;
  content: '';
  opacity: 0.4;
}

.hero-rule > * {
  position: relative;
  z-index: 1;
}

.hero-rule > span {
  color: var(--coral-on-dark);
  font-size: 0.68rem;
  font-weight: 850;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.hero-rule strong {
  display: block;
  margin-top: 12px;
  font-family: 'DM Serif Display', serif;
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 400;
  line-height: 1.02;
}

.hero-rule p {
  margin: 24px 0 0;
  color: rgb(248 243 231 / 72%);
  font-size: 0.78rem;
  line-height: 1.6;
}

.threshold-card,
.variants,
.evidence-card,
.tips-cta,
.strategy-grid section {
  background: rgb(255 250 240 / 78%);
  border: 1px solid var(--line);
  border-radius: 22px;
  box-shadow: 0 18px 48px rgb(45 51 35 / 7%);
  backdrop-filter: blur(14px);
}

.threshold-card {
  margin-top: clamp(52px, 8vw, 96px);
  padding: clamp(22px, 4vw, 38px);
}

.section-heading {
  display: flex;
  gap: 28px;
  align-items: flex-end;
  justify-content: space-between;
}

.section-heading h2,
.strategy-grid h2,
.variants h2,
.evidence-card h2,
.tips-cta h2 {
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

tbody td:nth-child(2) {
  color: var(--gold-dark);
  font-family: 'DM Mono', ui-monospace, monospace;
  font-weight: 850;
}

tbody td:last-child {
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

.strategy-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 16px;
}

.strategy-grid section {
  position: relative;
  min-width: 0;
  padding: 26px;
  overflow: hidden;
}

.tip-number {
  position: absolute;
  top: 12px;
  right: 18px;
  color: rgb(169 66 47 / 11%);
  font-family: 'DM Serif Display', serif;
  font-size: 4.5rem;
  line-height: 1;
}

.strategy-grid h2 {
  position: relative;
  font-size: 1.55rem;
}

.strategy-grid section > p:last-child,
.variant-grid p,
.evidence-card > p {
  position: relative;
  margin: 15px 0 0;
  color: var(--muted-ink);
  font-size: 0.78rem;
  line-height: 1.65;
}

.mini-thresholds {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px 12px;
  margin: 18px 0 0;
}

.mini-thresholds div {
  padding-top: 7px;
  border-top: 1px solid var(--line);
}

.mini-thresholds dt,
.mini-thresholds dd {
  margin: 0;
  font-size: 0.67rem;
}

.mini-thresholds dt {
  color: var(--muted-ink);
}

.mini-thresholds dd {
  margin-top: 2px;
  color: var(--gold-dark);
  font-weight: 800;
}

.variant-grid .variant-note {
  padding-top: 10px;
  border-top: 1px solid var(--line);
  font-size: 0.66rem;
}

.variants {
  margin-top: 16px;
  padding: clamp(22px, 4vw, 38px);
}

.variant-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 24px;
}

.variant-grid article {
  padding: 22px;
  background: rgb(255 255 255 / 40%);
  border: 1px solid var(--line);
  border-radius: 16px;
}

.variant-mark {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  padding: 6px 9px;
  color: white;
  background: var(--coral);
  border-radius: 999px;
  font-size: 0.64rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.variant-grid h3 {
  margin: 16px 0 0;
  font-family: 'DM Serif Display', serif;
  font-size: 1.35rem;
  font-weight: 400;
}

.evidence-card {
  display: grid;
  grid-template-columns: minmax(200px, 0.55fr) minmax(0, 1fr);
  gap: 18px 42px;
  margin-top: 16px;
  padding: clamp(22px, 4vw, 38px);
}

.evidence-card > p {
  margin: 0;
}

.evidence-card .evidence-caution {
  grid-column: 2;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  font-size: 0.7rem;
}

.tips-cta {
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  padding: 26px clamp(22px, 4vw, 38px);
}

.tips-cta a {
  display: inline-flex;
  min-height: 50px;
  flex: 0 0 auto;
  align-items: center;
  padding: 13px 17px;
  color: white;
  background: var(--ink);
  border-radius: 11px;
  font-weight: 850;
  text-decoration: none;
}

.site-footer {
  display: flex;
  gap: 9px;
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

@media (max-width: 820px) {
  .tips-hero,
  .evidence-card {
    grid-template-columns: 1fr;
  }

  .hero-rule {
    max-width: 520px;
  }

  .strategy-grid {
    grid-template-columns: 1fr;
  }

  .evidence-card .evidence-caution {
    grid-column: 1;
  }
}

@media (max-width: 620px) {
  .tips-page {
    padding-inline: 14px;
  }

  .tips-main {
    padding-block: 38px;
  }

  .tips-hero h1 {
    font-size: clamp(2.7rem, 14vw, 4rem);
  }

  .section-heading,
  .tips-cta {
    align-items: stretch;
    flex-direction: column;
  }

  .variant-grid {
    grid-template-columns: 1fr;
  }

  th,
  td {
    padding-inline: 8px;
  }

  .tips-cta a {
    justify-content: space-between;
  }

  .site-footer {
    flex-wrap: wrap;
  }
}
</style>
