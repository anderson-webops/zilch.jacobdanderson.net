import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  createGame,
  recommendedComputerDieIds,
  shouldComputerBank,
} from '../../front-end/src/game/engine.ts'
import {
  hasScoringOption,
  recommendedDieIds,
  scoreSelection,
} from '../../front-end/src/game/scoring.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const state = createGame([
  { name: 'Computer', kind: 'computer', difficulty: 'hard' },
  { name: 'Opponent', kind: 'human' },
])
state.phase = 'selecting'
state.rollNumber = 2
const outcomes = 6 ** 6
let busts = 0
let availableScoreSum = 0
let hardScoreSum = 0
let hardBanksAfter2800 = 0
let banksLeavingPoints = 0
let pointsLeftBehindSum = 0

for (let outcome = 0; outcome < outcomes; outcome++) {
  let encoded = outcome
  state.dice = Array.from({ length: 6 }, (_, id) => {
    const value = encoded % 6 + 1
    encoded = Math.floor(encoded / 6)
    return { id, value }
  })
  if (!hasScoringOption(state.dice)) {
    busts++
    continue
  }
  const available = scoreSelection(state.dice, recommendedDieIds(state.dice))
  assert(available.valid)
  availableScoreSum += available.score

  state.turnScore = 2800
  state.selectedDieIds = recommendedComputerDieIds(state)
  const selected = scoreSelection(state.dice, state.selectedDieIds)
  assert(selected.valid)
  hardScoreSum += selected.score
  if (shouldComputerBank(state))
    hardBanksAfter2800++

  state.turnScore = 2700
  state.selectedDieIds = recommendedComputerDieIds(state)
  const bankSelection = scoreSelection(state.dice, state.selectedDieIds)
  if (shouldComputerBank(state) && bankSelection.score < available.score) {
    banksLeavingPoints++
    pointsLeftBehindSum += available.score - bankSelection.score
  }
}

const sourceHashes = {}
for (const path of ['front-end/src/game/engine.ts', 'front-end/src/game/scoring.ts']) {
  const source = await readFile(resolve(root, path))
  sourceHashes[path] = createHash('sha256').update(source).digest('hex')
}
const probabilityBust = busts / outcomes
const result = {
  kind: 'exact-six-dice-enumeration',
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceHashes,
  rules: state.settings,
  outcomes,
  busts,
  probabilityBust,
  atRisk: 2800,
  meanNewScoreIncludingBustZeros: availableScoreSum / outcomes,
  rollOnceThenBankMaximumExpectedPoints: (1 - probabilityBust) * 2800 + availableScoreSum / outcomes,
  hardBanksAfter2800,
  scoringOutcomes: outcomes - busts,
  // This is a one-roll expectation only if Hard banks every scoring outcome.
  rollOnceThenCurrentHardBankExpectedPoints: hardBanksAfter2800 === outcomes - busts
    ? (1 - probabilityBust) * 2800 + hardScoreSum / outcomes
    : null,
  bankCollectionAudit: {
    atRiskBeforeRoll: 2700,
    banksLeavingPoints,
    meanPointsLeftBehindWhenItHappens: banksLeavingPoints ? pointsLeftBehindSum / banksLeavingPoints : 0,
  },
}
const json = `${JSON.stringify(result, null, 2)}\n`
if (process.argv[2]) {
  const path = resolve(process.argv[2])
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, json, { flag: 'wx' })
}
process.stdout.write(json)
