# Multiple selection: results and selected strategy

## Outcome

The selected non-Stealing Hard refinement earned **51.4544% of match points
against Hard v1.2.0 over 500,000 fresh games**, with a mirrored-pair 95% interval
of **51.333756% to 51.575044%**. Wins count as one, ties as half, and losses as
zero. This is a modest head-to-head advantage, not a universal percentage
improvement against every opponent. The result covers the whole feature pack,
including guaranteed-win collection, not just leaving a five beside a triple.

The implementation compares scoring selections and bank/roll actions together
on multiple-bearing rolls. It uses the actual saved multiple's next-roll
scoring distribution, existing score-position and endgame rules, and the
possibility of collecting hot dice. It applies only to standard Hard. Easy,
Medium, and the separately calibrated Stealing policy retain their strategies.

## What the requested checkpoints established

Keeping only `666` from `666523` can be better than also taking the five.
With a saved triple sixes, rolling three dice busts on 24 of 216 outcomes
(11.111%); rolling two after also taking the five busts on 9 of 36 (25%).
An extension occurs on 42.130% versus 30.556% of the respective rolls.
These are exact next-roll probabilities, not eventual winning probabilities.

The three requested axes all matter. The fresh confirmations used 100,000
independent future-seed pairs per comparison, with unchanged Hard v1.2.0
continuation. Risk below means points at risk **before** selecting the fixed
roll. For example, at 950 risk, keeping `666` means rolling with 1,550 at risk.

| Example | Finding from the specified comparison |
| --- | --- |
| Three sixes, 950 risk, scores 1,000 / 1,000 | Keeping the triple and rolling beat collecting the five and banking by 2.816 percentage points. |
| Same roll, 2,800 risk | Banking beat preserving the triple by 1.017 points. |
| Same roll, 950 risk, ahead 3,500 / 1,000 | Banking a total of 5,100 beat rolling by 1.343 points. |
| Same roll, 950 risk, behind 1,000 / 3,500 | Rolling beat banking by 4.629 points. |
| Three ones, 950 risk, level at 1,000 | Banking beat preserving the triple by 1.414 points. Ones do not add a new scoring face as sixes do. |
| Saved triple sixes, 600 risk, new roll `615` | Collecting all three for hot dice beat keeping only the six by 4.085 points. |
| Five sixes plus a five, zero prior risk | Collecting all six beat preserving five sixes and rolling one by 14.944 points. |
| Last Final Chase turn, 4,900 / 5,500, ties off, `666523` | Collecting 650 and banking wins outright; preserving the triple lost 11.123% of these continuations. |

The full [confirmation report](confirmation-report.md) preserves all 12
comparisons, confidence intervals, opening and face-value cases, and the
distinction between roll-versus-roll and roll-versus-bank treatments. Do not
average deliberately selected checkpoint effects into an overall win rate.

## Study design and candidate selection

The study contains **23,930,000 distinct simulated games**, excluding exact
one-roll enumeration, deterministic checks, and reproducibility replays:

| Phase | Games | Purpose |
| --- | ---: | --- |
| 1,438 exploratory checkpoint comparisons | 14,380,000 | Vary risk, score position, faces 1 through 6, multiples of size 3 through 5, openings, finishes, and saved-chain/hot-dice choices. |
| 12 predeclared fresh checkpoint confirmations | 2,400,000 | Confirm effects in both directions with separate seeds. |
| 41 full-game candidate tuning runs | 4,900,000 | Compare greedy, unrestricted joint, and chain-scoped joint families and controls. |
| 13 frozen full-game holdouts | 2,250,000 | Test the selected feature pack without further tuning. |

The original exact web-scorer enumeration includes 37 next-roll distributions
and 2,700 incumbent decisions. Another 12 unbankable opening comparisons are
explicitly marked unavailable rather than silently changing their treatment.

Unrestricted joint planning performed poorly (41.448% to 46.129% in its tuning
grid) and was rejected. A chain-scoped weight-1 blend was selected after the
grid and fresh tuning comparisons against greedy weights 0.5, 0.75, and 1,
safe-finish-only, and chain-scoped weight 1.25. Those comparisons remain labeled
tuning. `frozen-candidate.json` fixes the selected configuration, sample sizes,
and seeds before the holdouts. No coefficient was retuned on holdout outcomes.

Exploration used seeds beginning 3,100,000,000; tuning 3,200,000,000 and
3,200,000,001; conditional confirmations 3,300,000,000 through 3,300,000,011;
and full-game holdouts 3,400,000,000 through 3,400,000,012. Full-game comparisons
use mirrored seat-swapped pairs; intervals use independent pair means rather
than treating the two games in each pair as independent observations.

## Frozen holdouts

All rows use the selected candidate as player policy A. Variants compare against
v1.2.0 Hard unless another opponent is named. Settings not named retain defaults.

| Opponent or variant | Games | Candidate match points | Paired 95% interval |
| --- | ---: | ---: | ---: |
| Current Hard v1.2.0 | 500,000 | 51.4544% | 51.3338% to 51.5750% |
| Greedy chain weight 0.75 | 300,000 | 50.6243% | 50.4844% to 50.7643% |
| Safe-finish-only | 300,000 | 51.1842% | 51.0282% to 51.3401% |
| Medium | 200,000 | 61.8535% | 61.6382% to 62.0688% |
| Three Pairs off | 200,000 | 51.4525% | 51.2610% to 51.6440% |
| Target 2,500 | 100,000 | 50.4835% | 50.2457% to 50.7213% |
| Target 10,000 | 100,000 | 51.5400% | 51.2489% to 51.8311% |
| Final Chase off | 100,000 | 51.6980% | 51.4338% to 51.9622% |
| Ties off | 100,000 | 51.4610% | 51.1889% to 51.7331% |
| First-roll mercy off | 100,000 | 51.3450% | 51.0761% to 51.6139% |
| Stealing identity control | 50,000 | 50.0000% | 50.0000% to 50.0000% |
| Opening zero | 100,000 | 51.3315% | 51.0540% to 51.6090% |
| Opening 3,000 | 100,000 | 50.6780% | 50.4201% to 50.9359% |

The primary score margin was +81.6988 points, with paired 95% interval
+74.138830 to +89.258770. Variant intervals are descriptive, not a joint
confidence guarantee. The primary comparison was designated before the runs.

## Exact selected decision rule

The base policy coefficients and banking cutoffs remain those of v1.2.0:
`200, 1021, 1128, 1506, 2130, 5000`. With no saved/current multiple, use the
existing greedy selection and collect-before-bank behavior, plus an independent
guard to collect an available outright win.

For a multiple-bearing roll, enumerate legal scoring paths through the real
scorer and compare Bank and Roll at every permissible endpoint. For projected
turn points `P`, next-roll bust probability `p`, and adjusted threshold `T`,
the Roll utility is `P + p * (T - P)`; Bank utility is `P`. A saved chain uses
`T = expected new score / p` before the existing score-position/closing
adjustments and clamp. This is a calibrated decision surrogate, not a Bellman
solution for match-winning probability. Uncollected singles are not subtracted
from the chain expectation because separate banking paths already include them.

Opening and endgame constraints are evaluated for each path. An outright win
takes priority, with the actual last Final Chase turn distinguished from merely
being in the final round. Hot dice clear the saved chain and restore six dice
without rescoring old dice. Utility ties within 1e-9 prefer Bank, then greater
turn points, then more dice to roll. Paced native/Java interfaces retain the
selected path until its actual roll or bank, and clear it at turn/roll boundaries.

## Verification and limitations

The independent checkpoint audit reproduced every exploratory payload and
performed 89,890 arithmetic/provenance/branch checks. The confirmation verifier
performed 720 checks. `duel-audit.json` independently recomputes all 54 duel
runs and verifies source hashes against their recorded Git revisions (1,728
numeric/source checks). A separate replay of the primary 500,000-game holdout
reproduced every result field exactly, including raw paired moments.

The frozen primary source is `76e345c603837841b6b871b71a4d9cd544a6e194`;
binary SHA-256 is
`404c47910f9d8fcea0b87da5d6e02e5b22733d598a6567695f1592d0dcbbaf91`.
Primary result SHA-256 is
`770c8ee4ef21ba70afeacc6664fb66c02404e3964dd2300a1b1fb6cd3c905ad0`.
Earlier exploratory and confirmation artifacts retain their original source
and executable identities. Their nominal current-roll count limitation is
documented in `audit.md`; next-roll mercy was correct. The later builder fixes
that metadata, with 192 seeded count-1/count-2 outcome/RNG/transcript checks.

Production-versus-frozen native checks cover 4,032 decision checkpoints and
2,048 full-match parity pairs. Frozen/new research executables produced
identical JSON across 48,000 game results in 12 configurations. Cross-language
probes compare selected faces, scoring, Bank/Roll, next dice, and bank legality
against the web engine across 201 contexts: 39,685 standard decisions and
39,685 Stealing decisions per companion implementation, with zero mismatches.
These are deterministic implementation checks, not additional win-rate evidence.

The final parity artifacts are `parity-headless.json`, `parity-visual.json`,
and `parity-java.json`, bound to clean companion commits `89028a3`, `9cd59ce`,
and `b3604ea`, respectively. Java evidence hashes the complete tested JAR,
not just its probe entry point. The native suite passed all seven groups,
Visual C++ all three groups, and Java all 195 tests and its clean build.
Visual C++ required correcting a three-matching-dice saved-multiple extension
and isolating look-ahead copies; these are real scorer/state fixes, not
policy-coefficient adjustments. Its actual paced action path is tested, but
no graphical-window interaction test was performed in this investigation.

`runtime-validation.json` checks all 37 frozen exact distributions against the
web runtime. On the recorded Apple M3/Node 24.18.1 run, the first hot-dice
decision took 3.395 ms, and 2,000 warm decisions had median 0.043 ms and 95th
percentile 0.105 ms. This is local runtime evidence, not an iPhone performance
guarantee. An independent ordered-outcome check also matched all 57,822 outcomes
across 42 legal dice/chain configurations.

Website validation passed 45 game tests, nine API tests, lint, type checks,
the production build, direct and Netlify deployment-output/runtime checks,
and production-only API installation. Browser accessibility and interaction
checks passed desktop light/dark and 320-pixel mobile layouts for the game and
Tips page. A new real-timer browser regression resumes an old all-scoring
selection, confirms Hard refreshes it to just the triple at 950 prior risk,
and observes its three-die reroll through the actual UI flow. The test initially
expected a numeric loss total in the existing generic bust message; that test
assertion was corrected to check the actual 600-point selection event and
three dice rolled. No production behavior was changed to accommodate it.

The selected policy is stronger overall, not necessarily best at every
checkpoint. For example, at 950 prior risk with three ones plus a five and
level scores, the new surrogate rolls, while the conditional comparison with
old-Hard continuation favored banking. Different continuation policies and a
simple surrogate can disagree. This exception is retained, not hidden or used
to retune a supposedly frozen candidate.

Results establish the strongest tested policy in these two-player experiments,
not mathematical optimality, all possible custom settings, or multiplayer
win rates. The compact Tips page remains a practical summary rather than a
claim that one fixed table describes all saved-multiple decisions.

Reproduce with the scripts in `scripts/research/`: `selection-checkpoints.mjs`,
`confirm-multiple-checkpoints.mjs`, `run-multiple-candidates.mjs`,
`run-multiple-holdouts.mjs`, `audit-multiple-duels.mjs`,
`check-decision-parity.mjs`, and `check-multiple-runtime.mjs`. Original outputs
are immutable; runners refuse accidental overwrites. Use each run's recorded
source revision, executable, settings, and command rather than rebuilding a
frozen binary from the later production checkout.
