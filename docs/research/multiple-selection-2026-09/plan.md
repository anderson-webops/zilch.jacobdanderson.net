# Multiple preservation: pre-experiment plan

## Question and baseline

For a six-dice roll such as `6,6,6,5,2,3`, compare keeping the triple and
rerolling three dice with keeping the triple plus the single and rerolling two.
Also compare banking all available points when legal. Test the user's three
axes explicitly: points already at risk, position in the match, and the face
and size of the multiple. Do not assume leaving every single is always best.

The baseline is released Hard v1.2.0, web commit
`3485562a897c5f449d2e00bfea10c93d1388eac8`, and headless C++ commit
`52597513f7f3485e11dd5d0383d4c95f7150bd58`. Use its 5,000 six-dice cutoff,
named Hard endgame behavior, and collect-before-bank feature on both sides.
The older research harness defaults collection off, so each invocation must
explicitly enable it for both players.

Source inspection finds that standard Hard already leaves an unrelated 1 or 5
when continuing without hot dice. It collects extra guaranteed points when it
banks. Its ordinary banking threshold depends on dice count, scores, and target
but not on the saved multiple. Taking a single can also change bank eligibility
or whether the player can win, which must be tested rather than assumed away.

## Outcomes and experimental design

The primary outcome is completed-match points: win = 1, tie = 0.5, loss = 0.
Immediate score expectation and bust probability are explanatory diagnostics,
not substitutes for winning more games. Run the actual scorer and turn loop.

1. Enumerate next-roll outcomes through the real website scorer, keeping the
   saved multiple intact until hot dice reset it. Record bust probability,
   maximum immediately collectable score, and the current bot's action.
2. Add reusable fixed-roll, explicit-selection checkpoint comparisons to the
   native research harness. Both branches share the same pre-selection state
   and independent paired future seeds. Validate selection legality, opening
   restrictions, multiple extensions, hot dice, and active Final Chase.
3. Run a checkpoint panel with triple faces 1 through 6, unrelated 5s and 1s,
   low through high points at risk, and early, leading, trailing, close-finish,
   and final-turn positions. Include four- and five-of-a-kind, multiple-plus-
   both-singles, and exact opening/tie/win boundaries as secondary panels.
   At-risk inputs mean points BEFORE the fixed roll's selection is collected.
4. Use those results to select a small, explicit candidate family. Candidate
   changes may account for the saved multiple in banking or compare legal
   selection/action alternatives. Preserve ordinary rules and make each new
   feature independently switchable for ablation. Do not change released Hard
   just to agree with the initial example.
5. Compare candidates against fixed current Hard and serious alternatives in
   mirrored full games. Freeze a candidate before inspecting new holdouts.
   Require at least 250,000 fresh mirrored pairs against current Hard for a
   promotion decision, plus Medium and relevant rule/target checks. A losing
   candidate is retained as evidence, not relabeled as a successful refinement.
6. If a candidate is supported, integrate it into the web and companion games,
   add deterministic regression/parity checks for all three requested axes,
   and update concise strategy guidance only where supported. If not, retain
   the new checkpoints and explain the evidence without forcing a bot change.

## Panel coverage

Primary multiple sizes are three equal dice. An unrelated singleton is 5,
except for a triple of 5s where it is 1; a secondary panel swaps the singleton
where legal. Other faces on the initial roll must be non-scoring, unrelated,
and cannot accidentally form a second multiple or a whole-roll combination.

Pre-selection points include 0, 350, 400, 950, 1,500, and 2,800, together with
face-specific exact opening and finish boundaries. Banked-score contexts
include 0/0, 1,000/1,000, 3,500/1,000, 1,000/3,500, 4,500/4,500, and active
final-turn chases against 5,500. Reject impossible or unbankable bank branches
explicitly; do not silently substitute a roll or exclude them from reporting.

The primary rules are two players, target 5,000, opening 1,000, mercy, Final
Chase, ties, singles, multiples/extensions, straight, and Three Pairs enabled;
Stealing disabled. Stealing and Sets-off checks are separate configurations.
No claim about all custom rules or three-to-six-player strength follows from
the two-player default panel.

## Seeds, provenance, and uncertainty

Reserve master-seed namespaces 3,100,000,000 onward for checkpoint exploration,
3,200,000,000 onward for candidate tuning, 3,300,000,000 onward for fresh
checkpoint confirmation, and 3,400,000,000 onward for frozen full-game holdouts.
Each saved run records the exact master seed, complete policies and rules,
branch state, source revision/hashes, executable/compiler identity, raw outcome
counts, and pair-level first/second moments. These are separate pseudorandom
streams, not a claim that generated integer seeds cannot overlap.

Report sampling uncertainty from independent paired observations, not from
incorrectly treating both correlated games as independent. Exploratory panels
are multiple comparisons. Confirm important claimed differences using fresh
seeds and identify uncertain cells, rather than presenting every positive
estimate as a discovered rule. Preserve all runs and the candidate freeze
record. Do not tune on a holdout and continue calling it a holdout.

## Initial exploratory candidates

Before inspecting full-game candidate results, test safe winning-score
collection alone, then weights {0.25, 0.5, 0.75, 1, 1.25} for both a raise-only
and symmetric blend of the old dice-count threshold toward the saved-chain
one-roll crossover. Subtract currently unclaimed guaranteed points when
comparing a greedy retained selection against Bank-all. Apply the existing
score-position adjustments afterward, and retain the endgame layer.

Also test joint legal selection/action search at weights
{0, 0.25, 0.5, 0.75, 1, 1.25}. Its calibrated rolling value is
`projected + bustProbability * (adjustedThreshold - projected)`. Compare it
against each legal Bank choice, apply the existing finish guidance separately
to each choice, and protect a guaranteed outright win. For joint search the
chain threshold uses the unpenalized `expectedNewScore / bustProbability`,
because the competing Bank action already includes the unused points.
Hot dice clear the chain and use the released six-dice calibration.

These are explicitly experimental winning-policy heuristics, not exact
match-winning values. The first grids use 50,000 mirrored pairs per candidate
against current Hard with master seed 3,200,000,000, shared for paired candidate
exploration. Further refinements require a documented tuning extension.

## Tuning extension: isolate joint planning to multiple-bearing rolls

The first complete joint grid lost against released Hard: all candidates
earned between 41.448% and 46.129% match points in their 100,000-game tuning
runs. Greedy chain-aware candidates earned up to 50.7365% in the same-sized
comparisons. Favorable individual checkpoints do not justify replacing the
ordinary selection strategy across every roll.

Before the next grid, define a separate `jointChainsOnly` switch. With joint
planning enabled, this switch uses joint planning only if the current roll has
a legal multiple/extension option or the current dice set already contains a
saved multiple. Keep the selected planner for the whole selection sequence,
including a hot-dice reset. Otherwise retain the existing greedy selection
flow, with only the other explicitly enabled research features applied. This
isolates the user's multiple-preservation question without changing what the
existing full-joint experiment means.

Test the same raise/blend weights {0, 0.25, 0.5, 0.75, 1, 1.25}, with 50,000
mirrored pairs and tuning seed 3,200,000,000. Compare the best resulting
candidate with greedy blend weights 0.5, 0.75, and 1, and with the safe-finish
control. Any additional head-to-head selection uses new tuning seed
3,200,000,001, not a reserved confirmation or holdout seed. Choose the final
candidate and record its complete feature settings before the fresh holdouts.
