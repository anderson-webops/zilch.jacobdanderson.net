import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { canBank, createGame, recommendedComputerDieIds, shouldComputerBank } from '../../front-end/src/game/engine.ts'
import { scoreSelection } from '../../front-end/src/game/scoring.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const studyName = 'singleton-selection-2026-09'
const study = resolve(root, 'docs/research', studyName)
const [mode, sourceRoot, executable] = process.argv.slice(2)
assert(['plan', 'explore', 'confirm', 'verify'].includes(mode), 'Use plan, explore, confirm, or verify, then frozen source root and executable.')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const simulatorRevision = '89028a3c7d9963a6924f2565d90319b0a451f60a'
const executableHash = '33c6d95eb68ce8c50c3d19b99bcc3c795ad792b68057f1e61e6bf481379f85d3'
const treatments = [
  { name: '11', both: [1, 1], one: [1] },
  { name: '55', both: [5, 5], one: [5] },
  { name: '15-keep1', both: [1, 5], one: [1] },
  { name: '15-keep5', both: [1, 5], one: [5] },
]
const positions = [
  { name: 'unopened', own: 0, opponent: 0 },
  { name: 'level', own: 1000, opponent: 1000 },
  { name: 'ahead', own: 3500, opponent: 1000 },
  { name: 'behind', own: 1000, opponent: 3500 },
  { name: 'close-finish', own: 4500, opponent: 4500 },
  { name: 'final-close', own: 4900, opponent: 5500, chase: true },
]
const comparisons = []
const omitted = []
function ids(values, selected) {
  const remaining = [...selected]
  return values.flatMap((value, id) => {
    const index = remaining.indexOf(value)
    if (index < 0)
      return []
    remaining.splice(index, 1)
    return [id]
  })
}

function add(phase, group, treatment, risk, position, leftAction, rightAction = 'roll') {
  const roll = [...treatment.both, 2, 2, 3, 4]
  const id = `${phase}-${group}-${treatment.name}-${position.name}-risk${risk}-${leftAction}-${rightAction}`
  const game = createGame([{ name: 'A', kind: 'computer', difficulty: 'hard' }, { name: 'B', kind: 'human' }])
  Object.assign(game, {
    phase: 'selecting',
    turnScore: risk,
    diceInPlay: 6,
    rollNumber: risk ? 2 : 1,
    dice: roll.map((value, id) => ({ value, id })),
    scoredMultiples: {},
  })
  game.players[0].score = position.own
  game.players[1].score = position.opponent
  if (position.chase)
    game.endgame = { triggerPlayerId: game.players[1].id, remainingTurns: 1 }
  const selection = (selected) => {
    game.selectedDieIds = ids(roll, selected)
    const score = scoreSelection(game.dice, game.selectedDieIds)
    assert(score.valid)
    assert.deepEqual(score.multipleUpdates, {})
    return { selected, score_gain: score.score, next_dice: 6 - selected.length, can_bank: canBank(game) }
  }
  const left = { ...selection(treatment.both), action: leftAction }
  const right = { ...selection(treatment.one), action: rightAction }
  if ((leftAction === 'bank' && !left.can_bank) || (rightAction === 'bank' && !right.can_bank)) {
    omitted.push({ id, reason: 'Bank branch cannot meet the opening minimum.' })
    return
  }
  game.selectedDieIds = recommendedComputerDieIds(game)
  const webRecommendation = {
    selected_dice: game.dice.filter(die => game.selectedDieIds.includes(die.id)).map(die => die.value).sort(),
    action: shouldComputerBank(game) ? 'bank' : 'roll',
  }
  comparisons.push({ id, phase, group, treatment: treatment.name, roll, risk, position, left, right, web_recommendation: webRecommendation })
}

for (const treatment of treatments) {
  for (const risk of [0, 350, 950, 1500, 2800, 4000]) {
    for (const position of positions) {
      add('explore', 'panel', treatment, risk, position, 'roll')
      add('explore', 'panel', treatment, risk, position, 'bank')
    }
  }
  add('confirm', 'primary', treatment, 0, positions[0], 'roll')
  add('confirm', 'midturn', treatment, 950, positions[1], 'roll')
  add('confirm', 'highrisk', treatment, 2800, positions[1], 'bank')
}
for (const treatment of treatments.slice(0, 3)) {
  const bothScore = treatment.both.reduce((sum, face) => sum + (face === 1 ? 100 : 50), 0)
  for (const phase of ['explore', 'confirm']) {
    add(phase, 'opening-boundary', treatment, 1000 - bothScore, positions[0], 'bank')
    add(phase, 'winning-bank', treatment, 650 - bothScore, positions[5], 'bank')
    for (const opponent of [1000, 4500]) {
      const position = { name: `stopshort-opponent${opponent}`, own: 4500, opponent }
      add(phase, 'stopshort', treatment, 500 - bothScore, position, 'bank', 'bank')
      if (phase === 'explore')
        add(phase, 'stopshort', treatment, 500 - bothScore, position, 'bank')
    }
  }
}
for (const phase of ['explore', 'confirm']) {
  for (const [index, item] of comparisons.filter(item => item.phase === phase).entries()) {
    item.seed = (phase === 'explore' ? 3500000000 : 3600000000) + index
    item.pairs = phase === 'explore' ? 10000 : 100000
  }
}
assert.equal(new Set(comparisons.map(item => item.id)).size, comparisons.length)
assert.equal(new Set(comparisons.map(item => item.seed)).size, comparisons.length)
const sourceHashes = {}
for (const file of ['engine.ts', 'scoring.ts', 'roll-risk.ts', 'types.ts'])
  sourceHashes[`front-end/src/game/${file}`] = sha256(await readFile(resolve(root, 'front-end/src/game', file)))
const commonArgs = [
  '--mode',
  'selection',
  '--threads',
  '4',
  '--target',
  '5000',
  '--opening-score',
  '1000',
  '--sets',
  'on',
  '--stealing',
  'off',
  '--final-chase',
  'on',
  '--first-roll-mercy',
  'on',
  '--ties',
  'on',
  '--saved-multiples',
  '0,0,0,0,0,0',
  ...['a', 'b'].flatMap(seat => [
    `--difficulty-${seat}`,
    'hard',
    `--collect-${seat}`,
    'true',
    `--chain-risk-${seat}`,
    '1',
    `--chain-mode-${seat}`,
    'blend',
    `--safe-finish-${seat}`,
    'true',
    `--joint-selection-${seat}`,
    'true',
    `--joint-chains-only-${seat}`,
    'true',
  ]),
]
const plan = {
  schema_version: 1,
  study: studyName,
  simulator_revision: simulatorRevision,
  executable_sha256: executableHash,
  web_game_source_sha256: sourceHashes,
  common_arguments: commonArgs,
  primary_metric: 'Acting player match points: win=1, tie=0.5, loss=0; paired right minus left.',
  pairing: 'Same acting seat and future master seed within each pair; different dice counts can consume streams differently. Independent pairs, not seat-swapped games.',
  inference: 'Exploration is descriptive; all 24 confirmations are fixed before exploration. Pointwise normal 95% intervals are not simultaneous. Also report mean plus/minus 3.3 SE as an approximate family-wide sign screen (24 comparisons).',
  scope: 'Forced initial selection/action, then unchanged v1.3.0 Hard for both players; defaults, two players, no Stealing. Not a whole-policy tournament or proof of optimal play.',
  comparisons,
  omitted,
}
await mkdir(study, { recursive: true })
const planPath = resolve(study, 'plan.json')
const serializedPlan = `${JSON.stringify(plan, null, 2)}\n`
if (existsSync(planPath)) {
  assert.equal(await readFile(planPath, 'utf8'), serializedPlan, 'The frozen study design or web source changed.')
}
else {
  assert.equal(mode, 'plan', 'Freeze plan.json before running simulations.')
  await writeFile(planPath, serializedPlan, { flag: 'wx' })
}
if (mode === 'plan') {
  process.stdout.write(`${JSON.stringify({ comparisons: comparisons.length, exploratory: comparisons.filter(item => item.phase === 'explore').length, confirmations: comparisons.filter(item => item.phase === 'confirm').length, omitted: omitted.length })}\n`)
  process.exit(0)
}
assert(sourceRoot && executable)
const git = (...args) => execFileSync('git', args, { cwd: sourceRoot, encoding: 'utf8' }).trim()
assert.equal(git('rev-parse', 'HEAD'), simulatorRevision)
assert.equal(git('status', '--porcelain', '-uno'), '')
assert.equal(sha256(await readFile(executable)), executableHash)
const summaries = []
const normal95 = 1.959963984540054
function near(actual, expected) {
  assert(Number.isFinite(actual))
  assert(Math.abs(actual - expected) < 1e-10 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`)
}
for (const item of comparisons.filter(item => mode === 'verify' || item.phase === mode)) {
  const args = [
    ...commonArgs,
    '--pairs',
    String(item.pairs),
    '--seed',
    String(item.seed),
    '--roll',
    item.roll.join(','),
    '--at-risk',
    String(item.risk),
    '--banked-a',
    String(item.position.own),
    '--banked-b',
    String(item.position.opponent),
    '--active-final-chase',
    String(Boolean(item.position.chase)),
    '--select-left',
    item.left.selected.join(','),
    '--action-left',
    item.left.action,
    '--select-right',
    item.right.selected.join(','),
    '--action-right',
    item.right.action,
  ]
  const path = resolve(study, 'results', `${item.id}.json`)
  if (!existsSync(path)) {
    assert.notEqual(mode, 'verify', `Missing result: ${item.id}`)
    execFileSync(process.execPath, [resolve(root, 'scripts/research/run-experiment.mjs'), '--study', studyName, sourceRoot, executable, item.id, ...args], { cwd: root, stdio: 'pipe' })
  }
  const bytes = await readFile(path)
  const result = JSON.parse(bytes)
  assert.equal(result.run_id, item.id)
  assert.equal(result.mode, 'selection')
  assert.equal(result.seed, item.seed)
  assert.equal(result.pairs, item.pairs)
  assert.equal(result.total_games, 2 * item.pairs)
  assert.equal(result.provenance.simulator_revision, simulatorRevision)
  assert.equal(result.provenance.executable_sha256, executableHash)
  assert.deepEqual(result.provenance.command, [executable, ...args])
  assert.deepEqual(result.policy_a, result.policy_b)
  for (const flag of ['collect_before_bank', 'safe_finish_collection', 'joint_selection', 'joint_chains_only', 'effective_joint_selection'])
    assert.equal(result.policy_a[flag], true, flag)
  assert.equal(result.policy_a.difficulty, 'Hard')
  assert.equal(result.policy_a.chain_risk_weight, 1)
  assert.equal(result.policy_a.chain_mode, 'blend')
  assert.deepEqual(result.policy_a.bank_thresholds, [200, 1021, 1128, 1506, 2130, 5000])
  assert.deepEqual(result.selection_state.roll, item.roll)
  assert.equal(result.selection_state.at_risk_before_selection, item.risk)
  assert.deepEqual(result.incumbent_recommendation.selected_dice, item.web_recommendation.selected_dice)
  assert.equal(result.incumbent_recommendation.action, item.web_recommendation.action, `Web/native decision mismatch: ${item.id}`)
  for (const side of ['left', 'right']) {
    const branch = result.branches[side]
    assert.deepEqual(branch.selected_dice, item[side].selected)
    assert.equal(branch.score_gain, item[side].score_gain)
    assert.equal(branch.action, item[side].action)
    assert.equal(branch.state.next_dice, item[side].next_dice)
    assert.equal(branch.state.at_risk, item.risk + item[side].score_gain)
    assert.equal(branch.state.can_bank, item[side].can_bank)
    assert.equal(branch.state.mercy_available_next_roll, false)
    assert.deepEqual(branch.state.saved_multiple_scores, [0, 0, 0, 0, 0, 0])
    const outcomes = result[side]
    assert.equal(outcomes.games, item.pairs)
    assert.equal(outcomes.wins + outcomes.ties + outcomes.losses, item.pairs)
    near(outcomes.match_point_rate, (outcomes.wins + outcomes.ties / 2) / item.pairs)
    near(outcomes.average_score, outcomes.points_for / item.pairs)
    near(outcomes.average_opponent_score, outcomes.points_against / item.pairs)
    near(outcomes.average_score_margin, (outcomes.points_for - outcomes.points_against) / item.pairs)
  }
  for (const [key, expectedSum] of [
    ['right_minus_left_match_points_paired', result.right.wins + result.right.ties / 2 - result.left.wins - result.left.ties / 2],
    ['right_minus_left_score_margin_paired', result.right.points_for - result.right.points_against - result.left.points_for + result.left.points_against],
  ]) {
    const moment = result[key]
    assert.equal(moment.independent_pairs, item.pairs)
    near(moment.sum, expectedSum)
    const mean = moment.sum / item.pairs
    const se = Math.sqrt(Math.max(0, (moment.sum_squares - moment.sum ** 2 / item.pairs) / (item.pairs - 1)) / item.pairs)
    near(moment.mean, mean)
    near(moment.standard_error, se)
    near(moment.ci95[0], mean - normal95 * se)
    near(moment.ci95[1], mean + normal95 * se)
  }
  const primary = result.right_minus_left_match_points_paired
  summaries.push({
    id: item.id,
    result_sha256: sha256(bytes),
    phase: item.phase,
    group: item.group,
    treatment: item.treatment,
    risk: item.risk,
    position: item.position,
    left_action: item.left.action,
    right_action: item.right.action,
    left_match_points: result.left.match_point_rate,
    right_match_points: result.right.match_point_rate,
    difference: primary.mean,
    ci95: primary.ci95,
    sign_screen_3_3_se: [primary.mean - 3.3 * primary.standard_error, primary.mean + 3.3 * primary.standard_error],
    score_margin_difference: result.right_minus_left_score_margin_paired.mean,
    incumbent: item.web_recommendation,
  })
  if (summaries.length % 20 === 0 || item.phase === 'confirm')
    process.stdout.write(`${summaries.length}: ${item.id}: ${(100 * primary.mean).toFixed(3)} percentage points\n`)
}
assert.equal(sha256(await readFile(executable)), executableHash)
if (mode === 'verify') {
  const summary = {
    plan_sha256: sha256(serializedPlan),
    comparisons: summaries.length,
    independent_branch_pairs: comparisons.reduce((sum, item) => sum + item.pairs, 0),
    completed_games: comparisons.reduce((sum, item) => sum + 2 * item.pairs, 0),
    results: summaries,
  }
  const output = resolve(study, 'summary.json')
  const serialized = `${JSON.stringify(summary, null, 2)}\n`
  if (existsSync(output))
    assert.equal(await readFile(output, 'utf8'), serialized, 'Summary must reproduce exactly.')
  else
    await writeFile(output, serialized, { flag: 'wx' })
}
process.stdout.write(`Verified ${summaries.length} ${mode} comparisons.\n`)
