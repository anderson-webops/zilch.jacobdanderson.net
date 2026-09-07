import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const study = resolve(root, 'docs/research/multiple-selection-2026-09')
const [sourceRoot, executable] = process.argv.slice(2)
assert(sourceRoot && executable, 'Provide the frozen phase-one source and its unchanged executable.')
const sha256 = data => createHash('sha256').update(data).digest('hex')
const planBytes = await readFile(resolve(study, 'confirmation-plan.json'))
const plan = JSON.parse(planBytes)
const normal95Quantile = 1.959963984540054
const panelBytes = await readFile(resolve(study, 'checkpoint-exploration.jsonl'))
const panel = panelBytes.toString().trim().split('\n').map(line => JSON.parse(line))
const header = panel[0]
assert.equal(sha256(panelBytes), plan.exploration_sha256)
assert.equal(header.provenance.executableHash, plan.executable_sha256)
assert.equal(header.provenance.simulatorRevision, plan.simulator_revision)
assert.equal(plan.comparisons.length, plan.total_comparisons)
assert.equal(new Set(plan.comparisons.map(item => item.run_id)).size, plan.total_comparisons)
assert.equal(new Set(plan.comparisons.map(item => item.checkpoint_id)).size, plan.total_comparisons)
assert.equal(plan.total_new_games, 2 * plan.total_comparisons * plan.pairs_per_comparison)
const git = (...args) => execFileSync('git', args, { cwd: sourceRoot, encoding: 'utf8' }).trim()
assert.equal(git('rev-parse', 'HEAD'), plan.simulator_revision)
assert.equal(git('status', '--porcelain', '-uno'), '', 'Use a clean frozen source worktree.')
for (const [file, expected] of Object.entries(header.provenance.sourceHashes))
  assert.equal(sha256(await readFile(resolve(sourceRoot, file))), expected, `Source hash: ${file}`)
assert.equal(sha256(await readFile(executable)), plan.executable_sha256)

let checks = 0
function near(actual, expected, label) {
  assert(Number.isFinite(actual), `${label}: finite number required`)
  assert(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${label}: ${actual} != ${expected}`)
  checks += 1
}

function verifyOutcomes(outcomes, pairs, label) {
  for (const key of ['games', 'wins', 'ties', 'losses', 'points_for', 'points_against']) {
    assert(Number.isSafeInteger(outcomes[key]) && outcomes[key] >= 0, `${label}.${key}`)
    checks += 1
  }
  assert.equal(outcomes.games, pairs)
  assert.equal(outcomes.wins + outcomes.ties + outcomes.losses, pairs)
  near(outcomes.match_point_rate, (outcomes.wins + outcomes.ties / 2) / pairs, `${label}.rate`)
  near(outcomes.average_score, outcomes.points_for / pairs, `${label}.score`)
  near(outcomes.average_opponent_score, outcomes.points_against / pairs, `${label}.opponent`)
  near(outcomes.average_score_margin, (outcomes.points_for - outcomes.points_against) / pairs, `${label}.margin`)
  checks += 2
}

function verifyMoments(moment, pairs, expectedSum, label) {
  assert.equal(moment.independent_pairs, pairs)
  near(moment.sum, expectedSum, `${label}.sum from marginal totals`)
  assert(Number.isFinite(moment.sum_squares) && moment.sum_squares >= 0)
  const mean = moment.sum / pairs
  const variance = (moment.sum_squares - moment.sum ** 2 / pairs) / (pairs - 1)
  assert(variance >= -1e-10, `${label}: negative sample variance`)
  const standardError = Math.sqrt(Math.max(0, variance) / pairs)
  near(moment.mean, mean, `${label}.mean`)
  near(moment.standard_error, standardError, `${label}.SE`)
  near(moment.ci95[0], mean - normal95Quantile * standardError, `${label}.lower95`)
  near(moment.ci95[1], mean + normal95Quantile * standardError, `${label}.upper95`)
  checks += 3
  return { mean, standard_error: standardError, ci95: [mean - normal95Quantile * standardError, mean + normal95Quantile * standardError] }
}

const summaries = []
for (const [index, item] of plan.comparisons.entries()) {
  assert.equal(item.seed, plan.seed_base + index)
  const matches = panel.filter(row => row.checkpoint?.id === item.checkpoint_id)
  assert.equal(matches.length, 1, `Unique exploratory checkpoint: ${item.checkpoint_id}`)
  const row = matches[0]
  const args = row.command.slice(1)
  for (const [flag, value] of [['--pairs', plan.pairs_per_comparison], ['--seed', item.seed]]) {
    assert(args.includes(flag), `Missing original argument ${flag}`)
    args[args.indexOf(flag) + 1] = String(value)
  }
  const resultPath = resolve(study, 'results', `${item.run_id}.json`)
  if (!existsSync(resultPath)) {
    process.stdout.write(`Starting ${item.run_id}: ${item.checkpoint_id}\n`)
    execFileSync(process.execPath, [
      resolve(root, 'scripts/research/run-experiment.mjs'),
      '--study',
      'multiple-selection-2026-09',
      sourceRoot,
      executable,
      item.run_id,
      ...args,
    ], { cwd: root, stdio: 'inherit' })
  }
  const bytes = await readFile(resultPath)
  const result = JSON.parse(bytes)
  assert.equal(result.run_id, item.run_id)
  assert.equal(result.seed, item.seed)
  assert.equal(result.pairs, plan.pairs_per_comparison)
  assert.equal(result.total_games, 2 * plan.pairs_per_comparison)
  assert.equal(result.mode, 'selection')
  assert.equal(result.provenance.simulator_revision, plan.simulator_revision)
  assert.equal(result.provenance.simulator_tracked_status, '')
  assert.equal(result.provenance.executable_sha256, plan.executable_sha256)
  assert.deepEqual(result.provenance.source_sha256, header.provenance.sourceHashes)
  assert.deepEqual(result.provenance.command, [executable, ...args])
  for (const key of ['rules', 'policy_a', 'policy_b', 'selection_state', 'branches', 'incumbent_recommendation'])
    assert.deepEqual(result[key], row.result[key], `${item.run_id}.${key}: unchanged treatments`)
  verifyOutcomes(result.left, result.pairs, `${item.run_id}.left`)
  verifyOutcomes(result.right, result.pairs, `${item.run_id}.right`)
  const primary = verifyMoments(
    result.right_minus_left_match_points_paired,
    result.pairs,
    result.right.wins + result.right.ties / 2 - result.left.wins - result.left.ties / 2,
    `${item.run_id}.match points`,
  )
  assert(Number.isInteger(result.right_minus_left_match_points_paired.sum_squares * 4))
  assert(result.right_minus_left_match_points_paired.sum_squares <= result.pairs)
  const margin = verifyMoments(
    result.right_minus_left_score_margin_paired,
    result.pairs,
    (result.right.points_for - result.right.points_against) - (result.left.points_for - result.left.points_against),
    `${item.run_id}.score margin`,
  )
  const threeSE = [primary.mean - 3 * primary.standard_error, primary.mean + 3 * primary.standard_error]
  const sign = threeSE[0] > 0 ? 'right' : threeSE[1] < 0 ? 'left' : 'unresolved'
  summaries.push({
    run_id: item.run_id,
    checkpoint_id: item.checkpoint_id,
    seed: item.seed,
    result_sha256: sha256(bytes),
    pairs: result.pairs,
    risk_before_selection: row.checkpoint.risk,
    context: row.checkpoint.context,
    fixed_roll: row.checkpoint.values,
    saved_multiple_scores: row.checkpoint.savedMultiples,
    left: { selected: row.checkpoint.all, action: row.checkpoint.leftAction, score_gain: result.branches.left.score_gain, next_dice: result.branches.left.state.next_dice, match_point_rate: result.left.match_point_rate },
    right: { selected: row.checkpoint.keep, action: 'roll', score_gain: result.branches.right.score_gain, next_dice: result.branches.right.state.next_dice, match_point_rate: result.right.match_point_rate },
    difference: primary,
    score_margin_difference: margin,
    three_standard_error_interval: threeSE,
    three_standard_error_sign: sign,
  })
  checks += 20
  process.stdout.write(`${item.run_id}: ${(primary.mean * 100).toFixed(3)} percentage points; 3SE sign ${sign}\n`)
}

assert.equal(sha256(await readFile(executable)), plan.executable_sha256, 'Executable must remain unchanged throughout.')
const summary = {
  kind: 'independently-recomputed-checkpoint-confirmations',
  plan_sha256: sha256(planBytes),
  exploration_sha256: sha256(panelBytes),
  simulator_revision: plan.simulator_revision,
  executable_sha256: plan.executable_sha256,
  total_comparisons: summaries.length,
  total_independent_branch_pairs: summaries.reduce((sum, item) => sum + item.pairs, 0),
  total_new_games: summaries.reduce((sum, item) => sum + 2 * item.pairs, 0),
  arithmetic_and_result_checks: checks,
  risk_definition: plan.risk_definition,
  difference_definition: plan.difference_definition,
  inference: plan.inference,
  confirmations: summaries,
}
const output = resolve(study, 'confirmation-summary.json')
const serialized = `${JSON.stringify(summary, null, 2)}\n`
if (existsSync(output))
  assert.equal(await readFile(output, 'utf8'), serialized, 'Existing summary must reproduce exactly.')
else
  await writeFile(output, serialized, { flag: 'wx' })
process.stdout.write(`Verified ${summaries.length} confirmations and ${summary.total_new_games} fresh completed games.\n`)
