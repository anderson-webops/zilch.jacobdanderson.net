# Zilch strategy research

This note records the simulator evidence used by the browser game's Hard difficulty and public Tips page. It separates the strongest tested policy from claims of mathematically optimal play.

## Source and method

The experiments used the headless `Computers_vs_Zilch` C++ simulator at commit `17a4102b7f2688be010f47ce472a0707cf007e48`. Its `arena` mode pairs games with the same dice seed and swaps seat order, reducing first-player bias. The Visual C++ rules reference was commit `20440efa1a0251642c129e261893ecf3e845923a`; the Java rules reference was commit `7fa16bd3cb86b6572958739648237c507deea7af`.

The standard profile was a 5,000-point target, 1,000-point opening requirement, First-Roll Mercy, Final Chase, ties, singles, multiples, straights, and Three Pairs enabled. Stealing was disabled unless the experiment says otherwise. In these implementations, `Sets` is a compatibility name for `Three Pairs`.

The simulator and its tests passed before the experiments:

```bash
cmake --build build -j4
ctest --test-dir build --output-on-failure
```

## Standard-game policy

The tracked policy file is preserved at [`strategy-policies/standard-hard.cfg`](strategy-policies/standard-hard.cfg). It has SHA-256 `0c0020a049773aca3f66fc6915d6509a79bd4a2f55bfe7a3f0a7fddbedd5713b` and these parameters:

```text
bank_thresholds=200,1021,1128,1506,2130,2130
score_weight=1.0045
remaining_dice_weight=36.0805
hot_dice_weight=354.561
multiple_weight=91.9329
lead_factor=0
trail_factor=0.293194
closing_factor=0.193316
roll_bias=136.066
```

Thresholds are indexed by dice available for the next roll. Because scores move in 50-point increments, the practical bank points are 200, 1,050, 1,150, 1,550, 2,150, and 2,150 for one through six dice.

The final holdout used:

```bash
./build/zilch arena \
  --policy-a /path/to/zilch.jacobdanderson.net/docs/strategy-policies/standard-hard.cfg \
  --games 500000 \
  --threads 6 \
  --seed 2026091101
```

Across 500,000 games, arranged as 250,000 mirrored pairs, this policy earned 58.5621% match points against the built-in baseline, with 291,002 wins, 3,617 ties, and an average score margin of +266.0 points. Treating the mirrored pairs as the effective sample gives a rough uncertainty band of 58.37% to 58.76%; per-pair outcomes were not retained for a paired-variance estimate.

## Stealing policy

A separate Stealing-on training run used:

```bash
./build/zilch train \
  --generations 100 \
  --population 48 \
  --matches 4800 \
  --threads 4 \
  --seed 2026090416 \
  --output steal_baseline_c.cfg \
  --stealing on
```

This evaluated 480,000 training games. The selected policy is preserved at [`strategy-policies/stealing-hard.cfg`](strategy-policies/stealing-hard.cfg). It has SHA-256 `5ed0b4d2da825826f4389cbc7d57b5e46f7a900beae0a97a9bd442bddb6d48c4` and these parameters:

```text
bank_thresholds=313,313,1106,1360,1360,1376
score_weight=0.88553
remaining_dice_weight=91.2663
hot_dice_weight=229.628
multiple_weight=94.2546
lead_factor=0
trail_factor=0.187935
closing_factor=0.20764
roll_bias=-26.2974
```

Its practical bank points are 350, 350, 1,150, 1,400, 1,400, and 1,400 for one through six dice. Its utility equation implies approximate minimum carried scores of 550, 450, 350, 250, and 150 before accepting a steal with one through five dice.

The independent holdout used:

```bash
./build/zilch arena \
  --policy-a /path/to/zilch.jacobdanderson.net/docs/strategy-policies/stealing-hard.cfg \
  --games 500000 \
  --threads 6 \
  --seed 2026091102 \
  --stealing on
```

It earned 52.0527% match points against the built-in baseline, with 258,435 wins, 3,657 ties, an average score margin of +63.4, and a rough uncertainty band of 51.86% to 52.25% when mirrored pairs are treated as the effective sample. Additional 200,000 to 250,000-game comparisons placed it between 51.1% and 53.2% against four other trained candidates.

## Three Pairs, also called Sets

Disabling Three Pairs did not support a separate public strategy. The standard policy earned 57.9815% against the built-in baseline over 500,000 games with seed `2026091103`, with an average score margin of +247.9 and a rough uncertainty band of 57.79% to 58.18% when mirrored pairs are treated as the effective sample. A Three-Pairs-off candidate trained for that variant scored only 48.4% against the tracked standard champion over 150,000 games.

With Stealing enabled and Three Pairs disabled, the Stealing-specific policy still earned 51.7056% against the built-in baseline over 500,000 games with seed `2026091104`, with an average score margin of +48.1 and a rough uncertainty band of 51.51% to 51.90% when mirrored pairs are treated as the effective sample.

## Named difficulty validation

The full named Hard difficulty adds the browser game's finish-line buffer and stop-short heuristics to the trained policy. After that layer was ported to Computers vs Zilch at commit `29cafa07e305a181a2c18aca073f11f63a984bed`, it was evaluated separately from the raw policy files:

| Matchup | Rules | Games | Seed | Hard match points |
| --- | --- | ---: | ---: | ---: |
| Hard vs raw standard policy | Standard | 500,000 | `2026091202` | 52.5140% |
| Hard vs raw Stealing policy | Stealing on | 500,000 | `2026091205` | 53.2835% |

These comparisons isolate the finish heuristics from the underlying trained parameters. They do not make the original policy-versus-baseline holdout rates applicable to the complete named difficulty.

```bash
./build/zilch arena --bot-a hard --policy-b trained_policy.cfg \
  --games 500000 --threads 3 --seed 2026091202
./build/zilch arena --bot-a hard --policy-b trained_stealing_policy.cfg \
  --games 500000 --threads 6 --seed 2026091205 --stealing on
```

## Interpretation and limits

- Use the standard policy whether Three Pairs is on or off. When enabled, take Three Pairs as its 1,000-point hot-dice score.
- Use the separate Stealing policy when Stealing is enabled.
- The opening requirement overrides any lower bank threshold until a player is on the board.
- Hot dice, the current leader, distance to the finish, and Final Chase still affect an individual decision.
- The browser game's finish-line buffer and stop-short rules are explicit score-aware heuristics layered over the trained policy. They now have the separate arena evidence above, but the full Hard difficulty still does not inherit the policy-only holdout rate.
- Training and holdouts used two-player games. Games with three to six people, especially Final Chase, can change the incentives.
- These results identify the best policies tested inside a fixed parameterized strategy family. They are not proofs of global optimality and should not be generalized to every target, opening score, or disabled-rule combination.
