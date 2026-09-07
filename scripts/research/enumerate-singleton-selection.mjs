import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createGame, rollAgain } from '../../front-end/src/game/engine.ts'
import { nextRollRisk } from '../../front-end/src/game/roll-risk.ts'
import { recommendedDieIds, scoreSelection, scoringRules } from '../../front-end/src/game/scoring.ts'

// Recompute deterministically; an existing artifact must match byte for byte.
// Every roll is enumerated. No random draws or simulated matches are used.
assert.equal(process.version, 'v24.18.1', 'Use the repository Node 24.18.1 runtime.')
assert(process.argv.length <= 3, 'Usage: node scripts/research/enumerate-singleton-selection.mjs [output.json]')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outputPath = resolve(process.argv[2] ?? resolve(root, 'docs/research/singleton-selection-2026-09/exact-enumeration.json'))
const sourcePaths = [
  'front-end/src/game/engine.ts',
  'front-end/src/game/scoring.ts',
  'front-end/src/game/roll-risk.ts',
  'front-end/src/game/types.ts',
  'scripts/research/enumerate-singleton-selection.mjs',
]
async function hashSources() {
  return Object.fromEntries(await Promise.all(sourcePaths.map(async path => [
    path,
    createHash('sha256').update(await readFile(resolve(root, path))).digest('hex'),
  ])))
}
const sourceHashes = await hashSources()
const faces = [1, 2, 3, 4, 5, 6]
const trashFaces = [2, 3, 4, 6]
const toDice = values => values.map((value, id) => ({ value, id }))
const baseState = createGame([{ name: 'Enumerator', kind: 'human' }])
function noRandomDraw() {
  throw new Error('Exact enumeration must not request random dice.')
}

function* orderedRolls(length, allowed = faces, prefix = []) {
  if (length === 0) {
    yield prefix
    return
  }
  for (const face of allowed)
    yield* orderedRolls(length - 1, allowed, [...prefix, face])
}

function countsOf(values) {
  const counts = Array.from({ length: 6 }).fill(0)
  for (const face of values)
    counts[face - 1]++
  return counts
}

function choose(n, k) {
  let result = 1
  for (let index = 1; index <= k; index++)
    result = result * (n + 1 - index) / index
  return result
}

function fraction(numerator, denominator) {
  assert(Number.isSafeInteger(numerator) && Number.isSafeInteger(denominator) && denominator > 0)
  let a = Math.abs(numerator)
  let b = denominator
  while (b !== 0)
    [a, b] = [b, a % b]
  return {
    numerator,
    denominator,
    reducedNumerator: numerator / a,
    reducedDenominator: denominator / a,
    decimal: numerator / denominator,
  }
}

function enumerateNextRoll(diceCount) {
  const outcomes = 6 ** diceCount
  let busts = 0
  let anyTriple = 0
  let tripleOnes = 0
  let tripleFives = 0
  let hotDice = 0
  let maximumScoreSum = 0
  let subsetChecks = 0
  const scoreWeights = new Map()
  for (const values of orderedRolls(diceCount)) {
    const dice = toDice(values)
    let maximum = 0
    for (let mask = 1; mask < 2 ** diceCount; mask++) {
      const ids = dice.filter(die => mask & (1 << die.id)).map(die => die.id)
      const result = scoreSelection(dice, ids, {})
      if (result.valid)
        maximum = Math.max(maximum, result.score)
      subsetChecks++
    }
    const collected = scoreSelection(dice, recommendedDieIds(dice, {}), {})
    assert.equal(collected.valid ? collected.score : 0, maximum)
    if (maximum === 0)
      busts++
    if (collected.valid && collected.selectedCount === diceCount)
      hotDice++
    const counts = countsOf(values)
    if (counts.some(count => count >= 3))
      anyTriple++
    if (counts[0] >= 3)
      tripleOnes++
    if (counts[4] >= 3)
      tripleFives++
    maximumScoreSum += maximum
    scoreWeights.set(maximum, (scoreWeights.get(maximum) ?? 0) + 1)
  }

  let specifiedTripleFormula = 0
  let trashMultipleFormula = 0
  let multipleScoreFormula = 0
  for (let count = 3; count <= diceCount; count++) {
    specifiedTripleFormula += choose(diceCount, count) * 5 ** (diceCount - count)
    trashMultipleFormula += choose(diceCount, count) * 3 ** (diceCount - count)
    multipleScoreFormula += choose(diceCount, count) * 5 ** (diceCount - count) * 2 ** (count - 3)
  }
  const bustFormula = 4 ** diceCount - 4 * trashMultipleFormula
  const scoreFormula = 150 * (diceCount * 5 ** (diceCount - 1) + 2 * choose(diceCount, 2) * 5 ** (diceCount - 2))
    + 3000 * multipleScoreFormula
  assert.equal(busts, bustFormula)
  assert.equal(tripleOnes, specifiedTripleFormula)
  assert.equal(tripleFives, specifiedTripleFormula)
  assert.equal(anyTriple, 6 * specifiedTripleFormula)
  assert.equal(maximumScoreSum, scoreFormula)
  const productionRisk = nextRollRisk(diceCount, {})
  assert.deepEqual(productionRisk, { outcomes, busts, scoreSum: maximumScoreSum, bustProbability: busts / outcomes })
  const expected = diceCount === 4 ? [204, 126, 21, 52, 186000] : [600, 1656, 276, 236, 1755750]
  assert.deepEqual([busts, anyTriple, tripleOnes, hotDice, maximumScoreSum], expected)
  return {
    diceCount,
    chains: {},
    outcomes,
    busts,
    anyTriple,
    tripleOnes,
    tripleFives,
    hotDice,
    maximumScoreSum,
    probabilityBust: fraction(busts, outcomes),
    probabilityAnyTriple: fraction(anyTriple, outcomes),
    probabilityTripleOnes: fraction(tripleOnes, outcomes),
    probabilityTripleFives: fraction(tripleFives, outcomes),
    probabilityHotDice: fraction(hotDice, outcomes),
    meanMaximumNewScoreIncludingBustZeros: fraction(maximumScoreSum, outcomes),
    scoreWeights: [...scoreWeights].sort((a, b) => a[0] - b[0]).map(([score, count]) => ({ score, outcomes: count })),
    verification: { subsetChecks, recommendationDisagreements: 0, closedFormCountsMatch: true, productionRisk },
  }
}

function continuation(dice, ids) {
  const selected = scoreSelection(dice, ids, {})
  assert(selected.valid)
  assert.deepEqual(selected.multipleUpdates, {})
  const diceLeft = dice.length - selected.selectedCount
  const forcedValues = [1, 2, 3, 4, 6].slice(0, diceLeft)
  const next = rollAgain({
    ...baseState,
    phase: 'selecting',
    dice,
    selectedDieIds: ids,
    rollNumber: 1,
  }, noRandomDraw, forcedValues)
  assert.equal(next.turnScore, selected.score)
  assert.equal(next.diceInPlay, diceLeft)
  assert.deepEqual(next.scoredMultiples, {})
  assert.equal(next.phase, 'selecting')
  assert.deepEqual(next.dice.map(die => die.value), forcedValues)
  return {
    selectedValues: dice.filter(die => ids.includes(die.id)).map(die => die.value).sort(),
    selectedScore: selected.score,
    diceLeft,
    chains: next.scoredMultiples,
  }
}

function actions(dice) {
  const singles = dice.filter(die => die.value === 1 || die.value === 5)
  const result = { keepBoth: singles.map(die => die.id) }
  for (const die of singles)
    result[`keep${die.value}`] ??= [die.id]
  return result
}

const moments = [enumerateNextRoll(4), enumerateNextRoll(5)]
const cases = []
for (const singles of [[1, 1], [5, 5], [1, 5]]) {
  const pair = singles.join('')
  const representativeValues = [...singles, 2, 2, 3, 4]
  const representativeDice = toDice(representativeValues)
  const continuations = Object.fromEntries(Object.entries(actions(representativeDice))
    .map(([name, ids]) => [name, continuation(representativeDice, ids)]))
  const eligibleOrderedTrashPatterns = []
  const excludedOrderedTrashPatterns = { trashMultiple: 0, threePairs: 0, straight: 0 }
  let equivalentSelectionChecks = 0
  for (const trash of orderedRolls(4, trashFaces)) {
    const counts = countsOf(trash)
    const dice = toDice([...singles, ...trash])
    let exclusion = null
    if (counts.some(count => count >= 3))
      exclusion = 'trashMultiple'
    else if (singles[0] === singles[1] && counts.filter(count => count === 2).length === 2)
      exclusion = 'threePairs'
    else if (singles[0] !== singles[1] && counts.filter(count => count === 1).length === 4)
      exclusion = 'straight'
    const sourceEligible = recommendedDieIds(dice, {}).length === 2
    assert.equal(sourceEligible, exclusion === null)
    if (exclusion !== null) {
      excludedOrderedTrashPatterns[exclusion]++
      continue
    }
    eligibleOrderedTrashPatterns.push(trash)
    for (const ids of [[0], [1], [0, 1]]) {
      const name = ids.length === 2 ? 'keepBoth' : `keep${dice[ids[0]].value}`
      assert.deepEqual(continuation(dice, ids), continuations[name])
      equivalentSelectionChecks++
    }
  }
  assert.equal(eligibleOrderedTrashPatterns.length, pair === '15' ? 180 : 168)
  assert.equal(eligibleOrderedTrashPatterns.length + Object.values(excludedOrderedTrashPatterns).reduce((sum, count) => sum + count, 0), 4 ** 4)
  cases.push({
    pair,
    singles,
    representativeValues,
    continuations,
    totalOrderedTrashPatterns: 4 ** 4,
    eligibleOrderedTrashPatternCount: eligibleOrderedTrashPatterns.length,
    eligibleOrderedTrashPatterns,
    excludedOrderedTrashPatterns,
    representativeEquivalence: { equivalentSelectionChecks, disagreements: 0 },
    eligibleOrderedSixDiceRolls: 0,
  })
}

let sixDiceSelectionChecks = 0
for (const values of orderedRolls(6)) {
  const dice = toDice(values)
  const singles = dice.filter(die => die.value === 1 || die.value === 5)
  if (singles.length !== 2 || recommendedDieIds(dice, {}).length !== 2)
    continue
  const entry = cases.find(item => item.pair === singles.map(die => die.value).sort().join(''))
  entry.eligibleOrderedSixDiceRolls++
  for (const ids of [[singles[0].id], [singles[1].id], singles.map(die => die.id)]) {
    const name = ids.length === 2 ? 'keepBoth' : `keep${dice[ids[0]].value}`
    assert.deepEqual(continuation(dice, ids), entry.continuations[name])
    sixDiceSelectionChecks++
  }
}
assert.deepEqual(cases.map(entry => entry.eligibleOrderedSixDiceRolls), [2520, 2520, 5400])
assert.equal(sixDiceSelectionChecks, 31320)

const denominator = 6 ** 5
const [four, five] = moments
const fourSurvivorsScaled = 6 * (four.outcomes - four.busts)
const fiveSurvivors = five.outcomes - five.busts
const oneRollComparisons = cases.flatMap(entry => Object.entries(entry.continuations)
  .filter(([name]) => name !== 'keepBoth')
  .map(([action, selected]) => {
    const keepBothConstant = fourSurvivorsScaled * entry.continuations.keepBoth.selectedScore + 6 * four.maximumScoreSum
    const keepOneConstant = fiveSurvivors * selected.selectedScore + five.maximumScoreSum
    return {
      pair: entry.pair,
      action,
      selectedScore: selected.selectedScore,
      forgoneScore: entry.continuations.keepBoth.selectedScore - selected.selectedScore,
      expectedKeepBoth: { priorTurnScoreCoefficient: fraction(fourSurvivorsScaled, denominator), constantPoints: fraction(keepBothConstant, denominator) },
      expectedKeepOne: { priorTurnScoreCoefficient: fraction(fiveSurvivors, denominator), constantPoints: fraction(keepOneConstant, denominator) },
      keepOneMinusKeepBoth: { priorTurnScoreCoefficient: fraction(fiveSurvivors - fourSurvivorsScaled, denominator), constantPoints: fraction(keepOneConstant - keepBothConstant, denominator) },
    }
  }))
assert.deepEqual(oneRollComparisons.map(entry => entry.keepOneMinusKeepBoth.constantPoints.numerator), [46950, 343350, 374550, 15750])

const singleCarryoverExamples = []
for (const face of [1, 5]) {
  for (const keptCount of [1, 2]) {
    const dice = toDice([face, face, 2, 2, 3, 4])
    const ids = Array.from({ length: keptCount }, (_, index) => index)
    const rolledCount = 3 - keptCount
    const forcedValues = [...Array.from({ length: rolledCount }).fill(face), 2, 3, 4]
    const next = rollAgain({ ...baseState, phase: 'selecting', dice, selectedDieIds: ids, rollNumber: 1 }, noRandomDraw, forcedValues)
    const newScore = scoreSelection(next.dice, recommendedDieIds(next.dice, next.scoredMultiples), next.scoredMultiples)
    assert.deepEqual(next.scoredMultiples, {})
    assert.deepEqual(newScore.multipleUpdates, {})
    assert.equal(next.turnScore + newScore.score, face === 1 ? 300 : 150)
    singleCarryoverExamples.push({ face, keptCount, nextRollMatchingDice: rolledCount, savedScore: next.turnScore, newScore: newScore.score, combinedScore: next.turnScore + newScore.score, multipleUpdates: newScore.multipleUpdates })
  }
}

assert.deepEqual(await hashSources(), sourceHashes, 'Source changed during enumeration; rerun before recording evidence.')
const result = {
  kind: 'exact-two-singleton-selection-enumeration',
  schemaVersion: 1,
  runtime: process.version,
  sourceHashes,
  scoringRules,
  assumptions: [
    'All ordered outcomes of fair independent six-sided dice are enumerated, with empty existing multiple chains.',
    'The current six-dice roll contains exactly two scoring singles (11, 55, or 15) and four genuinely non-scoring dice.',
    'Trash multiples, Three Pairs, and a six-die straight are excluded using both explicit classification and the actual scorer.',
    'Triple means at least three matching dice newly rolled together; four and five of a kind are included.',
    'Saved singles cannot combine with later rolls to form a multiple; only an already scored multiple can be extended.',
    'Maximum new score includes zero on busts; hot dice means all currently rolled dice form a legal scoring selection.',
    'One-roll-then-bank expectation retains accrued points and the maximum new score on success, and gives zero on bust.',
    'T in each affine expectation is the unbanked turn score before choosing these singles, not the player banked score.',
    'The one-roll model assumes banking is permitted on every successful outcome; it ignores opening minimums, future decisions, game termination, and Stealing.',
    'These exact point expectations are not estimates of full-turn value or match-winning probability and do not select a production policy.',
    'Forced rolls check deterministic engine transitions only; no random samples or simulated matches are used.',
    'The artifact omits timestamps and current Git HEAD so identical source bytes reproduce identical output after unrelated commits.',
  ],
  closedFormDefinitions: {
    domain: 'n is 4 or 5; all sums run from k=3 through n.',
    specifiedTripleCount: 'sum(C(n,k) * 5^(n-k))',
    anyTripleCount: '6 * specifiedTripleCount; two distinct triples cannot coexist with at most five dice.',
    bustCount: '4^n - 4 * sum(C(n,k) * 3^(n-k))',
    maximumNewScoreSum: '150 * (n * 5^(n-1) + 2 * C(n,2) * 5^(n-2)) + 3000 * sum(C(n,k) * 5^(n-k) * 2^(k-3))',
    expectation: '(1 - probabilityBust) * (T + selectedScore) + meanMaximumNewScoreIncludingBustZeros',
  },
  nextRolls: moments,
  eligibility: {
    trashFaces,
    sixDiceOutcomesChecked: 6 ** 6,
    sixDiceSelectionChecks,
    representativeEquivalenceDisagreements: 0,
    transitionProbeNextRoll: 'The first four or five values of [1,2,3,4,6], with T=0 and no previous multiple.',
    cases,
  },
  oneRollComparisons,
  singleCarryoverExamples,
}
const output = `${JSON.stringify(result, null, 2)}\n`
await mkdir(dirname(outputPath), { recursive: true })
let disposition = 'created'
try {
  await writeFile(outputPath, output, { flag: 'wx' })
}
catch (error) {
  if (error.code !== 'EEXIST')
    throw error
  assert.equal(await readFile(outputPath, 'utf8'), output, 'Existing research artifact differs; it was not overwritten.')
  disposition = 'verified identical'
}
process.stdout.write(`${disposition}: ${outputPath}\n`)
process.stdout.write(`Checked ${moments.reduce((sum, moment) => sum + moment.verification.subsetChecks, 0)} next-roll subsets and ${sixDiceSelectionChecks} eligible six-dice selections.\n`)
