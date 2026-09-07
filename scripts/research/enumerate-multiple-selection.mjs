import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { canBank, createGame, selectComputerRecommended, shouldComputerBank } from '../../front-end/src/game/engine.ts'
import { recommendedDieIds, scoreSelection } from '../../front-end/src/game/scoring.ts'

// Enumerate the real browser scorer, not a second implementation of the rules.
// This is exploratory one-roll point expectation, not a match-winning policy.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const factorial = [1, 1, 2, 6, 24, 120, 720]
const toDice = values => values.map((value, id) => ({ value, id }))
const momentsCache = new Map()

function combinations(count, minimum = 1, prefix = []) {
  if (count === 0)
    return [prefix]
  return Array.from({ length: 7 - minimum }, (_, index) => minimum + index)
    .flatMap(value => combinations(count - 1, value, [...prefix, value]))
}

function permutationCount(values) {
  const counts = Array.from({ length: 6 }).fill(0)
  for (const face of values)
    counts[face - 1]++
  return factorial[values.length] / counts.reduce((product, count) => product * factorial[count], 1)
}

function nextRollMoments(diceLeft, chains) {
  const key = JSON.stringify([diceLeft, chains])
  if (momentsCache.has(key))
    return momentsCache.get(key)
  const started = performance.now()
  let outcomes = 0
  let busts = 0
  let maximumScoreSum = 0
  let maximumScoreSquaredSum = 0
  let chainExtensionOutcomes = 0
  const scoreWeights = new Map()
  const unordered = combinations(diceLeft)
  for (const values of unordered) {
    const weight = permutationCount(values)
    outcomes += weight
    const dice = toDice(values)
    let maximum = 0
    // At most 63 subsets. Check that the convenient collector really is the
    // maximum score in every outcome used for the expectation calculation.
    for (let mask = 1; mask < 2 ** diceLeft; mask++) {
      const ids = dice.filter(die => mask & (1 << die.id)).map(die => die.id)
      const result = scoreSelection(dice, ids, chains)
      if (result.valid)
        maximum = Math.max(maximum, result.score)
    }
    const collected = scoreSelection(dice, recommendedDieIds(dice, chains), chains)
    assert.equal(collected.valid ? collected.score : 0, maximum)
    if (maximum === 0)
      busts += weight
    if (Object.keys(collected.multipleUpdates).some(face => (chains[face] ?? 0) >= 3))
      chainExtensionOutcomes += weight
    maximumScoreSum += maximum * weight
    maximumScoreSquaredSum += maximum ** 2 * weight
    scoreWeights.set(maximum, (scoreWeights.get(maximum) ?? 0) + weight)
  }
  assert.equal(outcomes, 6 ** diceLeft)
  const result = {
    diceLeft,
    chains,
    unorderedOutcomes: unordered.length,
    outcomes,
    busts,
    maximumScoreSum,
    maximumScoreSquaredSum,
    chainExtensionOutcomes,
    probabilityBust: busts / outcomes,
    probabilityExtendChain: chainExtensionOutcomes / outcomes,
    meanNewScoreIncludingBustZeros: maximumScoreSum / outcomes,
    breakEvenAtRiskIgnoringUncollectedScores: busts ? maximumScoreSum / busts : null,
    scoreWeights: Object.fromEntries([...scoreWeights.entries()].sort((a, b) => a[0] - b[0])),
    coldEnumerationMs: performance.now() - started,
  }
  momentsCache.set(key, result)
  return result
}

function continuation(dice, ids) {
  const selected = scoreSelection(dice, ids)
  assert(selected.valid)
  const diceLeft = dice.length - selected.selectedCount || 6
  const chains = diceLeft === 6 ? {} : selected.multipleUpdates
  const moments = nextRollMoments(diceLeft, chains)
  return {
    selectedValues: dice.filter(die => ids.includes(die.id)).map(die => die.value),
    selectedScore: selected.score,
    diceLeft,
    chains,
    probabilityBust: moments.probabilityBust,
    probabilityExtendChain: moments.probabilityExtendChain,
    meanNewScoreIncludingBustZeros: moments.meanNewScoreIncludingBustZeros,
  }
}

const contexts = [
  { name: 'unopened-start', own: 0, opponent: 0 },
  { name: 'opened-level', own: 1000, opponent: 1000 },
  { name: 'ahead', own: 3000, opponent: 1000 },
  { name: 'behind', own: 1000, opponent: 3500 },
  { name: 'near-target-leading', own: 4300, opponent: 3000 },
  { name: 'near-target-close-rival', own: 4300, opponent: 4700 },
  { name: 'final-chase-trailing', own: 4000, opponent: 5500, chase: true },
  { name: 'final-chase-ties-off', own: 4000, opponent: 5500, chase: true, ties: false },
  { name: 'final-chase-extra-single-wins', own: 4900, opponent: 5500, chase: true, ties: false },
]
const turnScores = [0, 200, 350, 500, 950, 1000, 1500, 2000, 3000, 4500]
const scenarios = []
for (let face = 1; face <= 6; face++) {
  for (const count of [3, 4, 5]) {
    for (const singleton of [1, 5].filter(value => value !== face)) {
      const fillers = [2, 3, 4, 6].filter(value => value !== face).slice(0, 5 - count)
      const values = [...Array.from({ length: count }).fill(face), singleton, ...fillers]
      assert.equal(values.length, 6)
      const dice = toDice(values)
      const retain = continuation(dice, dice.slice(0, count).map(die => die.id))
      const collect = continuation(dice, dice.slice(0, count + 1).map(die => die.id))
      const oneRollExpectations = turnScores.map((turnScore) => {
        const retainThenBank = (turnScore + retain.selectedScore) * (1 - retain.probabilityBust)
          + retain.meanNewScoreIncludingBustZeros
        const collectThenBank = (turnScore + collect.selectedScore) * (1 - collect.probabilityBust)
          + collect.meanNewScoreIncludingBustZeros
        return {
          turnScoreBeforeSelection: turnScore,
          bankAllNow: turnScore + collect.selectedScore,
          retainThenBank,
          collectThenBank,
          retainMinusCollect: retainThenBank - collectThenBank,
        }
      })
      const hardDecisions = contexts.flatMap(context => turnScores.map((turnScore) => {
        const state = createGame([
          { name: 'Computer', kind: 'computer', difficulty: 'hard' },
          { name: 'Opponent', kind: 'human' },
        ])
        Object.assign(state, { phase: 'selecting', dice, rollNumber: 2, turnScore })
        state.players[0].score = context.own
        state.players[1].score = context.opponent
        state.settings.allowTies = context.ties ?? true
        if (context.chase)
          state.endgame = { triggerPlayerId: state.players[1].id, remainingTurns: 1 }
        const chosen = selectComputerRecommended(state)
        const all = { ...state, selectedDieIds: recommendedDieIds(dice) }
        const allScore = scoreSelection(dice, all.selectedDieIds).score
        return {
          context: context.name,
          turnScoreBeforeSelection: turnScore,
          selectedValues: chosen.dice.filter(die => chosen.selectedDieIds.includes(die.id)).map(die => die.value),
          bank: shouldComputerBank(chosen),
          chosenCanBank: canBank(chosen),
          allScoringCanBank: canBank(all),
          allScoringBankGains: allScore,
          allScoringWinsActiveFinalChase: !!context.chase && canBank(all)
            && (context.ties === false ? context.own + turnScore + allScore > context.opponent : context.own + turnScore + allScore >= context.opponent),
        }
      }))
      scenarios.push({ face, count, singleton, values, retain, collect, oneRollExpectations, hardDecisions })
    }
  }
}

// Include every physically possible remaining-dice count for a retained chain,
// including chains accompanied by previously saved unrelated singles.
for (let face = 1; face <= 6; face++) {
  for (const count of [3, 4, 5]) {
    for (let diceLeft = 1; diceLeft <= 6 - count; diceLeft++)
      nextRollMoments(diceLeft, { [face]: count })
  }
}

const sourceHashes = {}
for (const path of [
  'front-end/src/game/engine.ts',
  'front-end/src/game/scoring.ts',
  'scripts/research/enumerate-multiple-selection.mjs',
]) {
  sourceHashes[path] = createHash('sha256').update(await readFile(resolve(root, path))).digest('hex')
}
const result = {
  kind: 'exact-multiple-singleton-selection-enumeration',
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceHashes,
  assumptions: [
    'All outcomes of fair independent dice are enumerated, using permutation weights.',
    'Only browser default scoring is modeled; Stealing is disabled.',
    'Counts are newly selected from a six-dice roll; hot dice clear the old chain.',
    'One-roll expectation banks the largest legal scoring selection after one further roll.',
    'This point expectation ignores opening minimum and game termination; it is not a win-probability estimate.',
    'Current Hard decisions, unlike the exploratory point expectation, obey opening and endgame rules.',
  ],
  contexts,
  scenarios,
  cachedMoments: [...momentsCache.values()],
}
const output = `${JSON.stringify(result, null, 2)}\n`
if (process.argv[2])
  await writeFile(resolve(process.argv[2]), output, { flag: 'wx' })
process.stdout.write(output)
