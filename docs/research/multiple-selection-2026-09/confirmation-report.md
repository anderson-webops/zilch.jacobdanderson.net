# Fresh multiple-selection checkpoint confirmations

## Assessment: share with caveats

The fresh runs confirm that points at risk, match position, and the particular
multiple can change the better decision. Preserving a multiple is not a
universal instruction to ignore other scoring dice. These are conditional
comparisons of two specified actions followed by released Hard play, not a
whole-policy improvement claim or proof that either action is globally optimal.

All 12 predeclared comparisons completed with 100,000 independent branch pairs
each: 1,200,000 pairs and 2,400,000 fresh completed games. They use seeds
3,300,000,000 through 3,300,000,011, separate from exploration and candidate
tuning. Both future branches continue with unchanged Hard v1.2.0, including
collect-before-bank and the 5,000 six-dice cutoff. No candidate was selected or
retuned from these confirmation results.

## Reading the results

Risk means points already at risk **before selecting from the displayed roll**.
Banked scores are the acting player's score, then the opponent's. Positive
differences favor the right action, which retains the stated multiple or subset
and rolls. Negative differences favor the left action. A difference is in
percentage points of eventual match points: win = 1, tie = 0.5, loss = 0.

For example, in comparison 02, there are 950 points already at risk. Banking
`6665` adds 650 and banks a 1,600-point turn. Keeping only `666` adds 600 and
rolls three dice with 1,550 at risk. It does not roll with only 950 at risk.

The usual paired 95% intervals below use the sample variance of independent
pair differences and the normal quantile 1.959963984540054. The separately
predeclared conservative sign screen requires the mean plus/minus **three
standard errors** to exclude zero. Every comparison passes that screen in its
reported direction. This is a normal-approximation multiplicity screen, not an
exact simultaneous confidence guarantee; the displayed 95% intervals themselves
are not multiplicity-adjusted. Full-precision values and the three-SE intervals
are retained in `confirmation-summary.json`.

## The three requested decision axes

Unrelated non-scoring dice are omitted from selection labels. Triples of sixes
use the fixed roll `6,6,6,5,2,3`; triple ones use `1,1,1,5,2,3`; triple twos use
`2,2,2,5,3,4`; triple fives use `5,5,5,1,2,3`.

| ID | Multiple | Risk before selection | Banked scores | Left action | Right action | Right minus left, pp (95% interval) |
| --- | --- | ---: | --- | --- | --- | ---: |
| 01 | Three sixes | 0 | 1,000 / 1,000 | Keep 6665, roll 2 | Keep 666, roll 3 | +2.755 (+2.339 to +3.171) |
| 02 | Three sixes | 950 | 1,000 / 1,000 | Keep 6665, bank | Keep 666, roll 3 | +2.816 (+2.424 to +3.208) |
| 03 | Three sixes | 2,800 | 1,000 / 1,000 | Keep 6665, bank | Keep 666, roll 3 | -1.017 (-1.286 to -0.747) |
| 04 | Three sixes | 950 | 3,500 / 1,000 | Keep 6665, bank | Keep 666, roll 3 | -1.343 (-1.517 to -1.168) |
| 05 | Three sixes | 950 | 1,000 / 3,500 | Keep 6665, bank | Keep 666, roll 3 | +4.629 (+4.227 to +5.030) |
| 06 | Three ones | 950 | 1,000 / 1,000 | Keep 1115, bank | Keep 111, roll 3 | -1.414 (-1.795 to -1.032) |
| 07 | Three twos | 950 | 1,000 / 1,000 | Keep 2225, roll 2 | Keep 222, roll 3 | +1.829 (+1.423 to +2.235) |
| 08 | Three fives | 2,800 | 1,000 / 1,000 | Keep 5551, bank | Keep 555, roll 3 | -9.280 (-9.589 to -8.971) |

At moderate risk, keeping only the three sixes and rolling beats banking when
level or behind, but banking wins more often when ahead. That leading case
banks a total of 5,100 and starts Final Chase; match position is not merely a
cosmetic score adjustment. At higher risk, even the level-score sixes comparison
favors banking. Triple ones at the same pre-selection risk also favor banking,
despite their larger extension award. The faces are not interchangeable: sixes
can provide an additional scoring face alongside ordinary ones and fives.

Comparison 07 confirms that leaving the five also helps the triple-twos
**roll-versus-roll** choice. It does not establish that rolling is better than
banking in that state, because banking is not one of its two treatments.

## Boundaries and hot dice

| ID | State | Left action | Right action | Right minus left, pp (95% interval) |
| --- | --- | --- | --- | ---: |
| 09 | Unopened 0 / 0; 350 risk; roll 666523 | Keep 6665 and bank the opening 1,000 | Keep 666 and roll 3 with 950 at risk | +3.481 (+3.066 to +3.896) |
| 10 | Level 1,000 / 1,000; saved triple sixes; 600 risk; roll 615 | Keep 615 and roll all 6 with 1,350 at risk | Keep only 6 and roll 2 with 1,200 at risk | -4.085 (-4.489 to -3.680) |
| 11 | Level 1,000 / 1,000; 0 risk; roll 666665 | Keep all 6 and roll 6 with 2,450 at risk | Keep five sixes and roll 1 with 2,400 at risk | -14.944 (-15.311 to -14.576) |
| 12 | Active last Final Chase turn; 4,900 / 5,500; ties off; 0 risk; roll 666523 | Keep 6665 and bank a winning total of 5,550 | Keep 666 and roll 3 with 600 at risk | -11.123 (-11.318 to -10.928) |

The opening comparison favors continuing in this specific state, even though
collecting the five permits immediate opening. It is not advice to disregard
the opening requirement. In the saved-chain and five-of-a-kind comparisons,
collecting the remaining scoring dice for hot dice is clearly better than
preserving the chain with fewer dice. In the strict finish case, the left branch
wins all 100,000 games by banking the already available outright win; the right
branch wins 88,877 and loses 11,123.

## Verification and reproducibility

The verifier performed 720 counted per-result checks, plus plan and frozen-source
checks. It independently recomputed both branches' outcome totals, match-point
rates, score averages, and margins; reconstructed paired means, sample variances,
standard errors, and 95% intervals from raw sums and sums of squares; and checked
that the complete policies, rules, selected dice, branch states, and incumbent
recommendations match the audited exploratory definitions. It also checked the
planned seeds and sample sizes and rechecked the executable after all runs.

The frozen source revision remains
`16abc626802fba0650ac241ee033af72493d51dc`, with executable SHA-256
`dc5026fd69e32750aa58ea89e97626d14f0e6395e0992397a11f7736bd0fae6d`.
The corrected, unchanged-selection plan has SHA-256
`6b7313eb98478afcc14edbd8252fc80d7155ffb75f3b3d9d1b330f71c7f4430b`.
Per-file result hashes, complete command lines, source hashes, raw counts and
moments, and start/finish times are retained with the outputs. The original
exploration and all completed confirmation outputs are immutable.

Run or re-verify the predeclared suite from the website repository root:

```sh
node scripts/research/confirm-multiple-checkpoints.mjs \
  /tmp/zilch-selection-frozen-source.gO5I8d \
  /tmp/zilch-selection-build.ZrSDxl/zilch_research
```

The runner calls `scripts/research/run-experiment.mjs --study
multiple-selection-2026-09`, refuses to overwrite saved evidence, verifies any
completed files before continuing, and reproduces `confirmation-summary.json`
exactly on a second invocation. Raw inputs are
`results/confirmation-checkpoint-01.json` through
`results/confirmation-checkpoint-12.json`. The selection rationale and inference
rule were declared in `confirmation-plan.json` before observing these runs.

## Remaining caveats and handoff

These conditional results assume unchanged Hard continuation in a two-player
5,000-point game, with opening 1,000, the standard scoring options, mercy, Final
Chase, and no Stealing. Ties are enabled except for the explicitly labeled strict
finish boundary. The frozen builder's nominal current-roll count is one even
where earlier points imply a later roll; the next roll is correctly ineligible
for first-roll mercy. This known metadata caveat is described in `audit.md`.

The 12 deliberately selected checkpoint effects must not be averaged into an
overall win-rate claim. No whole-game candidate promotion follows from these
tests alone. Frozen full-game holdouts and implementation/parity verification
remain separate requirements. No visual dashboard is part of this audit.
