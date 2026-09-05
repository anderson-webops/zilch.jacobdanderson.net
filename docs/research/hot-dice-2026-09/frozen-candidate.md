# Candidate frozen before holdouts

Selected from tuning only: `candidates/six-5000.cfg`, with actual named Hard
endgame behavior and collect-before-bank enabled. The full coefficients remain
the incumbent's except the six-dice base cutoff rises from 2,130 to 5,000.
Stealing remains on its existing policy and does not enable the collector.

The collector preserves the incumbent's roll-selection plan until it chooses
to bank, then collects all remaining legal scoring options and commits to
banking even if that collection produces hot dice. It never takes an extra roll
merely to collect those points.

The initial 12-way ablation and 14-way four/five-dice extension are retained.
Raising four/five cutoffs did not improve on retaining 1,506 and 2,130. In the
50,000-pair tuning panel, the selected candidate earned 51.5015% against the
incumbent, 50.2045% against collector-only, 50.0260% against the 3,500 six-dice
collector, and 60.6230% against Medium. The narrow six-dice comparisons are
exploratory and need untouched tests; the primary promotion gate is improved
match points against actual incumbent Hard, not maximum average score.

Holdouts now scheduled, without further tuning: the prespecified incumbent,
Medium, raw-baseline, Three-Pairs-off, and alternate-rule/target panels. Add a
250,000-pair independent collector-only ablation at master seed 2000000000 to
verify the six-dice change itself. The exact-state confirmation is separate
from whole-game candidate selection and used the unchanged incumbent on both
branches.

This is a targeted refinement of an existing parameterized policy, not an
exhaustive retraining of every coefficient or proof of optimality.
