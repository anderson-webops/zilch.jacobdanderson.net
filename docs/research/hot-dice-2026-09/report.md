# Hard hot-dice refinement

## Finding

The reported stop at 2,800 with six hot dice exposed a real policy weakness.
The current bot did not compare the immediate roll's expected value: its
ordinary six-dice cutoff was 2,130, with no applicable endgame adjustment.

An exhaustive check of all 46,656 rolls found a 2.3148% bust probability and
3,118.87 expected points from rolling once and then banking the maximum score,
versus 2,800 from banking immediately. An independent check enumerated all 63
nonempty selections on every roll and agreed. These point expectations alone
do not establish the best match-winning decision, so the investigation then
continued both choices through complete games.

## Missed areas

- The old policy loader/trainer silently capped banking thresholds at 3,000.
  Candidates with substantially higher six-dice cutoffs could not survive it.
- Original raw-policy training did not exercise the later named Hard endgame
  layer. Its fitness mixed match points with score margin, and its historical
  champion comparison used fitness measured against changing opponents. Those
  design choices do not prove an error in every selected coefficient, but they
  are insufficient to validate each individual Hard decision.
- Dice selection optimized rolling utility before making a separate banking
  decision. Hard could therefore bank while leaving guaranteed points unclaimed.
  At 2,700 before a six-dice roll, 30,030 of 46,656 outcomes exhibited this,
  averaging 98.45 unclaimed points among affected rolls.
- The C++ threshold adjustments truncated fractional products unlike the web
  game. Research first aligned the simulator with the real web calculation.

## Method and frozen candidate

The [plan](plan.md) and [freeze record](frozen-candidate.md) separate exploratory
selection from new holdouts. All recorded runs used clean simulator revision
`5e27d7cc44f2b9e7cee87729803c2d48700517ef`, its actual rules/turn loop, and the
named Hard endgame layer. Each JSON in [results](results) includes complete
policies, rules, master seed, source/binary hashes, compiler, commands, raw
wins/ties/losses, score sums, and pair-level moments.

The selected non-Stealing candidate changes only:

1. Six-dice base cutoff: 2,130 to 5,000. Other cutoffs and coefficients stay fixed.
2. When the existing rolling-selection plan decides to bank, collect every
   remaining legal scoring option and retain that bank commitment through hot
   dice. Do not roll again just because the extra collection returns six dice.

The 12-way six-dice/collection ablation was followed by a 14-way four/five-dice
grid and comparisons with serious alternatives. Raising four/five thresholds
did not produce a better tested candidate. All exploratory results, including
the less successful ones, are retained.

The 42 runs contain 4,930,000 simulated games: 2,280,000 tuning games,
2,100,000 frozen-candidate holdout games, and 550,000 exact-state branches.
These totals exclude repeated validation runs and exact combinatorial checks.

## Fresh-game results

Match points count a win as 1, a tie as 0.5, and a loss as 0. Intervals use the
actual sample variance of independent mirrored-pair means, not an assumption
that both games within a pair are independent.

| Frozen candidate opponent / rules | Games | Match points | Paired 95% interval |
| --- | ---: | ---: | --- |
| Incumbent Hard, defaults | 500,000 | 51.5992% | 51.5289% to 51.6695% |
| Collector-only Hard, defaults | 500,000 | 50.1997% | 50.1646% to 50.2348% |
| Medium, defaults | 200,000 | 60.7068% | 60.4890% to 60.9245% |
| Raw baseline, defaults | 200,000 | 62.8208% | 62.6094% to 63.0321% |
| Incumbent, Three Pairs off | 200,000 | 51.5573% | 51.4513% to 51.6632% |
| Incumbent, 10,000 target | 100,000 | 51.8895% | 51.7032% to 52.0758% |
| Incumbent, 2,500 target | 100,000 | 51.5175% | 51.3828% to 51.6522% |
| Incumbent, Final Chase off | 100,000 | 51.2310% | 51.1180% to 51.3440% |
| Incumbent, first-roll mercy off | 100,000 | 51.6520% | 51.4952% to 51.8088% |
| Incumbent, ties off | 100,000 | 51.2060% | 51.0449% to 51.3671% |

For the exact reported state, with both banked scores zero, 2,800 at risk,
six hot dice, no active Final Chase, and unchanged incumbent policies afterward:

- Bank branch: 78.9538% match points.
- Roll branch: 81.4588% match points.
- Roll-minus-bank: **+2.505 percentage points**, paired 95% interval +2.295 to
  +2.715, over 250,000 independent branch pairs (500,000 completed matches).

This conditional-state advantage is different from the whole-game head-to-head
rate. Neither should be described as a 2.5% improvement in every game.

## Validation and limits

An independent audit reconciled every saved run's counts, rates, score totals,
paired moments, standard errors, and confidence intervals. It checked that
tuning and holdout master seeds differ and reran the entire primary 500,000-game
holdout, reproducing its result payload exactly. Independent master seeds
produce separate pseudorandom streams, not literal non-overlapping seed ranges.

After integration, a native decision probe compared the real website and
simulator across 39,152 decisions: every unordered one-through-six-dice roll
within 24 score/endgame/chain contexts, under standard and Stealing rules.
Selections, bank/roll choices, scores, remaining dice, and opening eligibility
matched. The [parity checker](../../../../scripts/research/check-decision-parity.mjs)
and its evidence record make this check reproducible without a second scorer.

The change is supported for the tested two-player non-Stealing configurations.
Stealing has different incentives and retains its existing policy and collector
behavior. The tests do not establish optimality, every custom target, all
disabled-scoring-rule combinations, or three-to-six-player match strength.
The new research harness supports fixed-opponent comparisons; it does not turn
the legacy evolutionary trainer's historical fitness into comparable evidence.

## Reproduction

Build `Computers_vs_Zilch` revision `5e27d7c` in Release mode outside the Dropbox
checkout. Run the exact executable arguments saved in each result JSON.
`scripts/research/run-experiment.mjs` records source and toolchain provenance
and refuses to replace existing evidence. Its arguments are the simulator
source directory, executable path, unique run ID, then research arguments.
The immutable candidate is [six-5000.cfg](candidates/six-5000.cfg), and the old
standard policy remains archived in `docs/strategy-policies`.
