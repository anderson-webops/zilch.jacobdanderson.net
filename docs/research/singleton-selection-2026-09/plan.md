# Two scoring singles: frozen comparison plan

## Question and scope

When six dice contain exactly two scoring singles and four non-scoring dice,
does keeping only one and rerolling five help more than keeping both and
rerolling four? Investigate 11, 55, and 15, including either choice in 15.
This study does not change the production bot. It measures conditional choices,
not a replacement policy's whole-game strength or mathematically optimal play.

Use two-player defaults: target 5,000; opening 1,000; singles, multiples,
straight, Three Pairs, First-Roll Mercy, Final Chase, and ties enabled;
Stealing disabled. Both players use unchanged production v1.3.0 Hard after
the forced initial selection and action. Explicitly enable every feature flag
and collect-before-bank; research CLI defaults are not production defaults.

## Exact probabilities

Enumerate all ordered four- and five-die rolls. Check bust probability, any
triple, triples of 1 and 5 specifically, maximum immediate score, and hot dice.
Independently compare all legal subsets with the production scoring and risk
functions. A kept single cannot combine with a later roll to form a triple.

Enumerate all four-trash tuples over 2,3,4,6. Exclude existing triples or
quadruples, Three Pairs for 11/55, and the straight for 15. Use 2,2,3,4 as the
representative eligible trash for each treatment: after a forced reroll only
the retained points, number of dice, and game context survive, not old trash
faces. No saved multiple is present.

## Simulated comparisons, fixed before observing results

`plan.json`, generated with `node scripts/research/run-singleton-checkpoints.mjs
plan`, is the complete immutable case manifest, including web-source hashes,
incumbent decisions, legal branches, omissions, independent seeds, and counts.

Exploration uses 10,000 independent branch pairs per comparison:

- Each of four treatments at preselection risk 0, 350, 950, 1,500, 2,800,
  and 4,000, in six positions: unopened 0/0; level 1,000/1,000; ahead
  3,500/1,000; behind 1,000/3,500; close finish 4,500/4,500; final turn
  4,900/5,500 with Final Chase active.
- Compare both-roll against one-roll. Separately compare both-bank against
  one-roll whenever banking both is legal. Illegal bank branches are recorded
  as omissions, not simulated.
- Add exact opening boundaries where both can open at 1,000 but one cannot;
  exact winning-bank boundaries where both end at 5,550 versus a 5,500 leader;
  and stop-short boundaries where both-bank triggers Final Chase at 5,000
  while one-bank stays below target, against opponents at 1,000 or 4,500.
  Also compare both-bank against one-roll at these stop-short boundaries.

All 24 confirmations are predeclared, not selected from exploratory winners.
Each uses 100,000 fresh independent branch pairs:

1. Four primary treatments, unopened 0/0, zero preselection risk: roll/roll.
2. Four treatments, level 1,000/1,000, risk 950: roll/roll.
3. Four treatments, level 1,000/1,000, risk 2,800: bank/roll.
4. Three opening boundaries (11, 55, 15 keeping 1): bank/roll.
5. Three winning-bank boundaries (same treatments): bank/roll.
6. Six stop-short boundaries (same treatments, two opponent scores): bank/bank.

Exploration seeds start at 3,500,000,000; confirmation seeds at 3,600,000,000,
incrementing once per comparison in each phase. Distinct master seeds do not
prove literally disjoint pseudorandom streams. Each pair shares its future
seed between branches but uses the same acting seat, not swapped seats. The
different number of dice can consume different numbers of RNG draws.

Six fresh dice with nonzero prior risk require a completed hot-dice cycle
(or the 50-point mercy exception); all chosen nonzero risks are attainable
and at least 300. Banked totals are zero or at least the opening minimum.
The fixed roll already happened: the next forced roll cannot receive mercy.

## Metrics and validation

Primary: acting player's match points, win=1, tie=0.5, loss=0. Report paired
right-minus-left differences in percentage points. Secondary: final score
margin. Do not confuse conditional advantage, point expectation, and overall
bot improvement. Banking is a separate alternative, not a free follow-up when
the opening requirement is unmet. At a stop-short boundary, taking more points
can trigger Final Chase, so bank-one must be compared separately.

Recompute outcome totals, pair means, sample variances, standard errors, and
95% normal intervals. These intervals are pointwise, not simultaneous. For the
24 confirmations, also use a conservative approximate sign screen of mean
plus/minus 3.3 standard errors (normal-tail union bound below 0.05).
Retain all null and unfavorable comparisons. Independently replay the four
primary confirmation runs and check native/web selection and action parity.

Preserve the frozen native source revision and executable checksum in every
raw result. Do not rebuild the executable during this study. Validate all
recorded source hashes and unchanged treatments when resuming existing runs.
Run repository-native validation before committing and pushing the research.
No release version or production behavior change is implied by this study.
