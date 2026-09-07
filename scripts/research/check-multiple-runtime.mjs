import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { cpus, platform } from 'node:os'
import process from 'node:process'
import { createGame, selectComputerRecommended, shouldComputerBank } from '../../front-end/src/game/engine.ts'
import { nextRollRisk } from '../../front-end/src/game/roll-risk.ts'

const [output] = process.argv.slice(2)
assert(output, 'Provide a new evidence output path.')
const evidencePath = 'docs/research/multiple-selection-2026-09/exact-enumeration.json'
const evidenceBytes = await readFile(evidencePath)
const evidence = JSON.parse(evidenceBytes)
const state = createGame([{ name: 'Computer', kind: 'computer', difficulty: 'hard' }, { name: 'Opponent', kind: 'human' }])
state.players.forEach(player => player.score = 1000)
Object.assign(state, { phase: 'selecting', turnScore: 0, rollNumber: 1, diceInPlay: 6 })
state.dice = [6, 6, 6, 6, 6, 5].map((value, id) => ({ value, id }))
const coldStart = performance.now()
const selected = selectComputerRecommended(state)
assert.equal(selected.selectedDieIds.length, 6)
assert.equal(shouldComputerBank(selected), false)
const coldDecisionMs = performance.now() - coldStart

for (const moment of evidence.cachedMoments) {
  const actual = nextRollRisk(moment.diceLeft, moment.chains)
  assert.deepEqual(actual, {
    outcomes: moment.outcomes,
    busts: moment.busts,
    scoreSum: moment.maximumScoreSum,
    bustProbability: moment.probabilityBust,
  })
}
const samples = []
for (let index = 0; index < 2000; index++) {
  state.dice = (index % 2 ? [6, 6, 6, 5, 2, 3] : [6, 6, 6, 6, 6, 5]).map((value, id) => ({ value, id }))
  state.turnScore = [0, 950, 1500, 2800][index % 4]
  const start = performance.now()
  shouldComputerBank(selectComputerRecommended(state))
  samples.push(performance.now() - start)
}
samples.sort((a, b) => a - b)
const hashes = {}
for (const path of ['front-end/src/game/engine.ts', 'front-end/src/game/scoring.ts', 'front-end/src/game/roll-risk.ts', 'scripts/research/check-multiple-runtime.mjs'])
  hashes[path] = createHash('sha256').update(await readFile(path)).digest('hex')
const result = {
  kind: 'multiple-strategy-runtime-validation',
  exact_distributions_checked: evidence.cachedMoments.length,
  frozen_distribution_sha256: createHash('sha256').update(evidenceBytes).digest('hex'),
  source_sha256: hashes,
  runtime: { node: process.version, platform: platform(), cpu: cpus()[0]?.model },
  timing_ms: { cold_hot_dice_decision: coldDecisionMs, warm_samples: samples.length, median: samples[1000], p95: samples[1900], max: samples.at(-1) },
  limitation: 'Local Node timing, not an iPhone or browser performance guarantee. Real scorer results are cached; at most 462 unordered outcomes populate a six-dice risk entry.',
}
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' })
process.stdout.write(`${JSON.stringify(result)}\n`)
