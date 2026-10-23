# Three pairs: 500 points

Three distinct pairs score 500 points. A 1–2–3–4–5–6 straight still scores
1,000. Both consume all six dice and return six dice for the next roll.
Four matching dice plus a pair, and six matching dice, use the multiple rules;
they are not three distinct pairs.

For six fair dice there are 6^6 = 46,656 equally likely ordered outcomes:

| Combination | Exact count | Probability |
| --- | ---: | ---: |
| Straight | 6! = 720 | 1.5432% |
| Three distinct pairs | C(6,3) × 6!/(2! × 2! × 2!) = 1,800 | 3.8580% |

Three pairs are exactly 2.5 times as frequent. This supports awarding fewer
points; 500 is the selected house rule, rather than a uniquely implied value.
`front-end/test/scoring.test.ts` enumerates every ordered outcome to verify
both the probabilities and the actual scoring implementation.

At the default 1,000-point opening minimum, a fresh three-pairs roll no longer
opens a player by itself. Two such rolls in the same turn do. Already-earned
points in saved games are retained; future selections use the current scorer.
The pattern frequency and bust probability are unchanged, but roll rewards
and strategic incentives change. Historical strategy evidence remains tied
to its former 1,000-point three-pairs rule.
