# Hard policy refinement: pre-experiment plan

## Question

Under the default two-player rules, should the computer bank 2,800 points with
six hot dice when both banked scores are zero? Does improving this decision,
or collecting guaranteed scoring dice before banking, improve whole-game play?

The primary outcome is match points: one for a win, one half for a tie, zero
for a loss. Average points are diagnostic, not the promotion objective.

## Baseline and audit

- Browser baseline: release `v1.1.1`, commit
  `fecdbbcdbeaafe031da3c4c4e45dd2d716c054eb`.
- Simulator before this investigation: commit
  `84079cef7d47ffef72924a46659e80bf428588af`.
- Standard incumbent parameters are retained in
  `../../strategy-policies/standard-hard.cfg` until a replacement is validated.
- Defaults: 5,000-point target, 1,000-point opening, First-Roll Mercy, Final
  Chase, ties, straight, three pairs, singles, and multiples/extensions on;
  Stealing off.
- The old loader/trainer capped every banking threshold at 3,000. Larger
  six-dice candidates could not be represented without silent alteration.
- Raw policy training omitted the named Hard finish rules, used a fitness
  mixture of match points and score margin, and compared historical fitness
  across changing generation opponents. These runs will instead evaluate
  actual Hard semantics against fixed opponents.
- C++ truncated threshold adjustments where the browser used floating point.
  Research must align that arithmetic before claiming browser-policy results.
- The current collector can leave guaranteed scoring dice behind when it
  decides to bank. This will be tested as an independent candidate behavior.

## Experiment sequence

1. Validate the harness against the existing rules engine, including resumed
   turns, hot dice, opening constraints, Final Chase, ties, and identical-policy
   mirrored matches. Do not introduce a second scoring implementation.
2. Compare Bank now versus Roll at least once from the reported exact state.
   Complete both branches using the same incumbent policies and paired future
   random seeds. Report the paired difference in eventual match points.
3. Run whole-game ablations for collecting remaining guaranteed points before
   banking, and for six-dice cutoffs 2,130, 2,500, 3,000, 3,500, 4,000, and
   5,000. Expand or refine the grid only on tuning seeds and label those runs.
4. Compare promising candidates against incumbent Hard, Medium, and other
   serious candidates, not just the old weak baseline. Keep the selection
   procedure and all tuning results, including losses.
5. Freeze the selected candidate before new holdout seeds. Use at least
   250,000 mirrored pairs for the primary incumbent comparison, and report
   confidence intervals from actual pair-level outcomes. A materially
   stronger opponent comparison is required before replacing Hard.
6. Check default-rule variants and alternate targets before broadening the
   recommendation. Stealing behavior remains unchanged unless separately
   supported. Preserve winning-bank and Final Chase regressions.
7. Update the game, companion implementations where the shared policy applies,
   and concise strategy guidance only after evidence supports the change.

## Evidence and uncertainty

Record source revision, configuration, complete policy inputs, effective seeds,
sample counts, wins/ties/losses, pair-level sampling uncertainty, and score
diagnostics in machine-readable results. Tuning and holdout seed ranges must
not overlap. Report conditional-state findings separately from whole-game
strength. Neither finite simulations nor this policy family prove optimality.

## Prespecified stages and seeds

The harness uses separate `mt19937_64` master seeds, with full 64-bit pair seeds
expanded into each dice generator. The same tuning master seed is deliberately
reused across candidates for common-random-number comparisons. Fresh holdout
master seeds are not used for candidate selection. These are pseudorandom
streams, not a claim of arithmetically disjoint integer seed ranges.

| Stage | Master seed | Independent pairs per comparison |
| --- | ---: | ---: |
| Exact-state pilot | 1100000000 | 25000 |
| Exact-state confirmation | 1200000000 | 250000 |
| Six-dice and collector ablations | 1300000000 | 20000 |
| Candidate refinements and opponent panel tuning | 1400000000 | 50000 |
| Frozen candidate versus incumbent holdout | 1500000000 | 250000 |
| Frozen candidate versus Medium | 1600000000 | 100000 |
| Frozen candidate versus raw baseline | 1700000000 | 100000 |
| Three Pairs off holdout | 1800000000 | 100000 |
| Alternate target and house-rule checks | 1900000000 onward | 50000 |

Do not change the selected candidate after inspecting its holdouts and keep
calling those runs holdouts. A failed candidate starts a new, documented tuning
stage and requires another untouched final test.

## Exploratory extension after the first sweep

The six-dice sweep favored the 5,000 cutoff with collection, but its gain over
collection alone was small. Before freezing a candidate, use the refinement
seed to check whether the same missed high-cutoff region matters for four or
five dice. Test the grid four-dice cutoff {1506, 2000, 2500, 3000} and five-dice
cutoff {2130, 3000, 4000, 5000}, retaining only nondecreasing sequences, with
six dice at 5000 and collection enabled. Compare with incumbent Hard at 50,000
pairs each. No holdout seeds have been inspected at this stage.
