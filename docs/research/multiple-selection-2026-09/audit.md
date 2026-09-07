# Independent checkpoint audit

## Assessment: share with caveats

The exploratory panel answers the requested question about retaining a multiple
instead of also collecting an unrelated single. Its comparisons vary points at
risk **before the fixed roll's selection**, banked-score position, and multiple
face/size. It is evidence about conditional decisions, not a whole-policy win
rate or proof of optimal play.

All 1,438 comparisons in `checkpoint-exploration.jsonl` passed independent
arithmetic, provenance, and branch-state checks. The recorded frozen executable
then reproduced every result payload exactly: all 14,380,000 original games,
including raw outcome counts and paired score/match-point moments. This replay
verifies reproducibility; it does not add independent statistical evidence.
The audit performed 89,890 counted checks, without modifying the input artifact.

## Verified coverage and methods

| Panel group | Comparisons |
| --- | ---: |
| Primary triples | 492 |
| Secondary sizes and singleton values | 432 |
| Exact opening boundaries | 18 |
| Exact finish boundaries | 88 |
| Multiple plus both scoring singles | 216 |
| Saved extension versus hot dice | 192 |
| Total | 1,438 |

The panel explicitly reports another 12 unavailable opening-bank comparisons.
They were not silently changed into roll actions. Each completed comparison
contains 5,000 independent paired future seeds, with both treatments continuing
against the same released Hard policy. Retained chains fit the removed dice and
never exceed the pre-selection points at risk.

The audit checked both branch selections against the actual website scorer,
including scores, remaining dice, bank eligibility, and chain reset on hot dice.
It checked Final Chase state, absence of next-roll mercy, fixed continuation
policies, command/seed correspondence, unique IDs, and header/footer totals.
Outcome rates and score averages were recomputed from integer totals. Paired
means, sample variances, standard errors, and intervals were recomputed from
the recorded pair-level sums and sums of squares, which the full replay also
reproduced. Source hashes were checked against the frozen Git revision rather
than the subsequently edited working tree.

## Provenance

- Frozen simulator revision: `16abc626802fba0650ac241ee033af72493d51dc`.
- Executable SHA-256: `dc5026fd69e32750aa58ea89e97626d14f0e6395e0992397a11f7736bd0fae6d`.
- Exploratory JSONL SHA-256: `56fc35635815182dab2adab980a3250b1d1dd59182a470537e3f1ef4d498a7cb`.
- Reproducible panel definition: `scripts/research/selection-checkpoints.mjs`.
- Complete parameters, source hashes, compiler identity, commands, and raw
  result moments remain in the original JSONL header and comparison rows.

## Required caveats

The exploratory 95% intervals are normal approximations without adjustment for
1,438 comparisons. Positive cells alone must not be treated as discoveries.
The selected fresh confirmations in `confirmation-plan.json` include opposite
directions and uncertain cases; they are fixed before observing those new runs.
Before any confirmation was run, the plan's copied exploration SHA-256 was
corrected to remove one extra character. The 12 checkpoint IDs, seeds, sample
sizes, and inference rules were unchanged; the corrected hash matches the
original artifact and the provenance recorded above.
Results use two-player default rules without Stealing, with explicitly labeled
ties-off finish-boundary variants. Do not average this
deliberately uneven checkpoint panel into a general win-rate claim.

The frozen checkpoint builder records a nominal roll count of one even for
states with earlier points or saved chains. This is a metadata limitation:
the fixed roll is registered, so the next roll is correctly ineligible for
first-roll mercy. Later-roll outcomes and the reproduced comparisons are not
affected. No chart or rendered-dashboard review is applicable to these data
artifacts.

Candidate promotion remains separate: it requires frozen full-game holdouts,
implementation validation, and the source-release workflow.

## Fresh confirmations completed

All 12 predeclared checkpoint confirmations completed with 100,000 independent
branch pairs each, for 2,400,000 fresh completed games. An additional 720 counted
per-result checks independently recomputed raw outcome rates and paired moments
and verified unchanged treatment definitions, source provenance, seeds, and
sample sizes. Every comparison's mean plus/minus three standard errors excluded
zero in its reported direction; both favorable and unfavorable multiple-
preservation effects remain in the record.

`confirmation-report.md` provides the complete readable results and caveats.
`confirmation-summary.json` contains full-precision independent recomputations
and hashes for all 12 immutable raw outputs. The reproducible runner is
`scripts/research/confirm-multiple-checkpoints.mjs`. These fresh results establish
the requested conditional dependencies, not a general policy promotion.
