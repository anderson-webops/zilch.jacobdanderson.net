# Keeping one scoring single instead of two

## Finding

Keeping one and rerolling five is a useful strategy, not a long-shot attempt
at a triple. In the tested opening-roll situations, it improved the acting
player's match-point rate by about 1.3 percentage points over taking both and
rerolling four. That is a conditional decision advantage, not a newly measured
whole-game improvement to Hard.

With Stealing off, the current v1.3.0 Hard implementation already keeps one
when it decides to roll these hands again, keeping the 1 from a mixed 1/5 hand. It collects both
when it decides to bank. The human **Select best score** button and Easy/Medium
choose all available scoring dice instead. That button maximizes the current
score; it is not the same as Hard's strategic recommendation. These checks
establish source behavior, not which release or control produced a previously
observed live game.

No production code, difficulty, tips page, or release version was changed by
this investigation.

## Why the extra die helps

Exact enumeration of every ordered next roll, with no saved multiple:

| Next-roll outcome | Keep both: roll 4 | Keep one: roll 5 |
| --- | ---: | ---: |
| Bust | 15.7407% | 7.7160% |
| At least three of any one face | 9.7222% | 21.2963% |
| At least three 1s | 1.6204% | 3.5494% |
| At least three 5s | 1.6204% | 3.5494% |
| Mean maximum new score, including zero on bust | 143.52 | 225.79 |
| All rolled dice score, returning hot dice | 4.0123% | 3.0350% |

The extra die more than doubles the chance of a new triple and approximately
halves the immediate bust risk. It gives up 50 or 100 available scoring points, but
adds about 82.27 expected new points on the next roll and better protects the
points already at risk. Not every benefit improves: the hot-dice probability
is slightly lower with five dice.

A kept single does **not** combine with later rolls to become a triple. A
triple must be rolled together; only an already scored multiple can be
extended. Four and five of a kind are included in the "at least three" rows.

For the restricted model "roll once, then bank every successful outcome,"
the expected-point gain from keeping one is:

- Two 1s: `6.03781 + 0.0802469 × T`.
- Two 5s: `44.15509 + 0.0802469 × T`.
- One 1 and one 5, keeping the 1: `48.16744 + 0.0802469 × T`.
- One 1 and one 5, keeping the 5: `2.02546 + 0.0802469 × T`.

Here `T` is the turn score before selecting these singles. This diagnostic
assumes every successful outcome can be banked, so it does not handle opening
requirements, final turns, or future decisions. The match simulations below
do handle those rules.

## Fresh opening-roll confirmations

Both players start with zero banked points, the acting player has no earlier
points at risk, and the fixed roll contains the listed singles plus 2,2,3,4.
Both branches must roll again. After that first forced decision, both players
follow unchanged v1.3.0 Hard. All other settings are the two-player defaults,
including Three Pairs and Final Chase, with Stealing off.

Each row uses 100,000 independent paired comparisons, or 200,000 completed
games. A win earns 1 match point, a tie 0.5, and a loss 0.

| Initial singles / kept die | Keep both, roll 4 | Keep one, roll 5 | Difference, percentage points | Paired 95% interval |
| --- | ---: | ---: | ---: | ---: |
| 1 + 1 / keep a 1 | 48.97% | 50.26% | +1.29 | +0.87 to +1.71 |
| 5 + 5 / keep a 5 | 48.88% | 50.17% | +1.29 | +0.87 to +1.71 |
| 1 + 5 / keep the 1 | 48.96% | 50.33% | +1.37 | +0.95 to +1.79 |
| 1 + 5 / keep the 5 | 48.86% | 50.04% | +1.18 | +0.76 to +1.59 |

All four effects also remain positive under the predeclared, more conservative
3.3-standard-error sign screen. Separate rows use different master seeds, so
their keep-both estimates need not be identical. They do not directly establish
that keeping the 1 wins more often than keeping the 5 in the mixed opening
hand. Keeping the 1 retains 50 more points with the same five-dice next-roll
distribution, and is the current Hard choice; its exact point expectation is
higher, but its match-point superiority over keeping the 5 was not isolated
in a directly paired comparison.

## Banking and game position still matter

The following are fresh confirmations, not selected exploratory winners.
Positive differences favor keeping one; negative differences favor taking both.

| Situation | Comparison | Two 1s | Two 5s | 1 + 5, keep 1 |
| --- | --- | ---: | ---: | ---: |
| Both banked 1,000; 950 at risk | Both-roll vs one-roll | +0.13 pp, unresolved | +1.43 pp | +0.98 pp |
| Both banked 1,000; 2,800 at risk | Both-bank vs one-roll | -1.45 pp | -0.89 pp | -0.91 pp |
| Both can open at exactly 1,000; one cannot | Both-bank vs one-roll | -1.45 pp | +0.01 pp, unresolved | -0.13 pp, unresolved |
| Last Final Chase turn; both-bank wins outright at 5,550 vs 5,500 | Both-bank vs one-roll | -14.27 pp | -7.73 pp | -7.82 pp |

The mixed hand's keep-5 alternative at risk 950 was also unresolved
(+0.15 pp; 95% interval -0.26 to +0.56). At risk 2,800, it lost 1.34 pp
against banking both. All other directional claims in this table also pass
the conservative sign screen; unresolved does not mean exactly equal.

Thus the evidence does not support "always discard the second scoring die."
In particular, do not give up an available outright win to try for more points.
At an opening boundary, the exact one-roll point model is insufficient because
banking is not yet available after keeping only one.

### Banking one can be a different endgame choice

The additional stop-short comparisons force **both branches to bank**. Taking
both reaches exactly 5,000 and triggers Final Chase; taking one leaves 4,900
for the 11 hand or 4,950 for the 55 and 15 hands. The acting player has 4,500
already banked; prior turn points are respectively 300, 400, and 350.

| Opponent's banked score | 11: bank one minus bank both | 55: bank one minus bank both | 15 keeping 1: bank one minus bank both |
| --- | ---: | ---: | ---: |
| 1,000 | -2.35 pp | -1.77 pp | -1.94 pp |
| 4,500 | +13.56 pp | +15.89 pp | +15.95 pp |

These results distinguish postponing Final Chase from rerolling an extra die.
They do not establish the best action among all banking and rolling options,
or authorize an endgame policy change. All six differences pass the sign
screen. The full pointwise intervals and branch rates are in `summary.json`.

## Scope, evidence, and reproducibility

The design was frozen before observing simulated outcomes: 298 exploratory
comparisons at 10,000 branch pairs each and 24 predeclared confirmations at
100,000 pairs each. That is **5,380,000 independent branch pairs and 10,760,000
completed games**. The grid varies accrued turn points, opened status, leads,
deficits, opening boundaries, and final turns. Eight illegal banking branches
are explicitly omitted. No newly trained or replacement whole-game policy
was tested.

The four trash dice can vary. Existing trash triples or quadruples are excluded;
two other pairs with 11/55 form Three Pairs and are excluded; 2,3,4,6 with 15
forms a straight and is excluded. Exact enumeration finds 168 eligible ordered
trash tuples for 11 and 55, and 180 for 15. All are equivalent after the forced
selection/reroll because old trash faces are discarded. Tests check this using
the actual engine, not just an assumed state reduction.

The acting seat is the same in both branches. Each independent pair shares a
future seed, though five- and four-die rolls can consume the stream differently.
These are not seat-swapped pairs. Standard errors use the observed variance
of pair differences. Reported 95% intervals are pointwise normal approximations,
not simultaneous guarantees. The 3.3-SE screen is also approximate and provides
a conservative normal-tail union bound across the 24 confirmations. Distinct
master seeds do not prove literally non-overlapping pseudorandom streams.

Native continuation source: `89028a3c7d9963a6924f2565d90319b0a451f60a`.
Frozen executable SHA-256:
`33c6d95eb68ce8c50c3d19b99bcc3c795ad792b68057f1e61e6bf481379f85d3`.
Every result includes the exact command, rules, policies, compiler/build
provenance, source hashes, outcome totals, and paired moments. Web game-source
hashes are fixed in `plan.json`; the production source remains unchanged.

Reproduce using Node 24.18.1 and the recorded native revision/build:

```sh
node scripts/research/enumerate-singleton-selection.mjs
node scripts/research/run-singleton-checkpoints.mjs plan
node scripts/research/run-singleton-checkpoints.mjs explore NATIVE_SOURCE NATIVE_EXECUTABLE
node scripts/research/run-singleton-checkpoints.mjs confirm NATIVE_SOURCE NATIVE_EXECUTABLE
node scripts/research/run-singleton-checkpoints.mjs verify NATIVE_SOURCE NATIVE_EXECUTABLE
node scripts/research/verify-singleton-checkpoints.mjs NATIVE_SOURCE NATIVE_EXECUTABLE
```

Existing evidence is checked, never overwritten. For saved runs, use the same
recorded executable path and bytes, or independently replay the recorded
commands from an equivalent build and compare numerical payloads. Do not
rebuild a frozen binary in place during a study.

The machine-readable records are [plan.json](plan.json),
[exact-enumeration.json](exact-enumeration.json), [summary.json](summary.json),
[validation.json](validation.json), and individual immutable files in
[results/](results/).

## Validation outcome: ready to share with the stated scope

- Exact scorer checks: 260,496 next-roll selection subsets, all 46,656 ordered
  six-die rolls inspected for eligibility, and 31,320 eligible selection/engine
  transitions. Closed-form counts and the production risk calculator agree.
  Regenerating the exact artifact produces identical bytes.
- Independent result audit: all 322 comparisons pass 44,436 arithmetic and
  treatment checks, including native/web legality, rules, all continuation
  policy coefficients, seeds, and frozen source/executable hashes.
- Production parity: 2,860 native/web decisions across all 44 eligible roll
  multisets and 65 game contexts, with zero disagreements. Twelve additional
  probes distinguish Hard from Easy, Medium, and the human selection helper.
- Four primary confirmations were independently rerun at their saved seeds,
  reproducing the complete native payload exactly. Those 800,000 replay games
  are not counted as new observations in the 10,760,000-game research total.
- Repository checks passed: root `npm ci` with zero audit vulnerabilities;
  canonical lint, type checks, game/API tests, and production build; native
  binding, direct/Netlify deployment-output, and Netlify runtime checks.
  All seven native CTest groups passed. The optional guarded Oxlint preflight
  refused a tool-version mismatch and is not counted as a pass; canonical
  ESLint completed successfully.

The remaining limits are substantive, not missing validation: no Stealing or
multiplayer generalization, no isolated keep-1 versus keep-5 match comparison,
no whole-policy improvement estimate, and no proof of optimal play.
