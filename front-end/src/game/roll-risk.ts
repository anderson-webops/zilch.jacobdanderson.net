import type { DieValue, MultipleChains } from './types.ts'
import { recommendedDieIds, scoreSelection } from './scoring.ts'

interface RollRisk {
  readonly outcomes: number
  readonly busts: number
  readonly scoreSum: number
  readonly bustProbability: number
}

const factorial = [1, 1, 2, 6, 24, 120, 720] as const
const faces: DieValue[] = [1, 2, 3, 4, 5, 6]
const cache = new Map<string, RollRisk>()

/** Exact one-roll scoring diagnostics, not a claim of optimal match play. */
export function nextRollRisk(diceCount: number, chains: MultipleChains): RollRisk {
  if (!Number.isInteger(diceCount) || diceCount < 1 || diceCount > 6)
    throw new RangeError('A roll must contain one through six dice.')
  const key = `${diceCount}:${faces.map(face => chains[face] ?? 0).join(',')}`
  const cached = cache.get(key)
  if (cached)
    return cached

  let outcomes = 0
  let busts = 0
  let scoreSum = 0
  const values: DieValue[] = []
  const counts = [0, 0, 0, 0, 0, 0]
  // Enumerate unordered rolls, weighted by their number of permutations. At
  // most 462 scorer calls are needed on a cold six-dice cache, not 46,656.
  function visit(minimum: number) {
    if (values.length === diceCount) {
      const weight = factorial[diceCount]! / counts.reduce((product, count) => product * factorial[count]!, 1)
      const dice = values.map((value, id) => ({ value, id }))
      const score = scoreSelection(dice, recommendedDieIds(dice, chains), chains)
      outcomes += weight
      if (score.valid)
        scoreSum += weight * score.score
      else
        busts += weight
      return
    }
    for (let face = minimum; face <= 6; face++) {
      values.push(face as DieValue)
      counts[face - 1]!++
      visit(face)
      counts[face - 1]!--
      values.pop()
    }
  }
  visit(1)
  const result = Object.freeze({ outcomes, busts, scoreSum, bustProbability: busts / outcomes })
  cache.set(key, result)
  return result
}
