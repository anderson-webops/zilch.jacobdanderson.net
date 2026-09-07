import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { canBank, createGame, selectComputerRecommended, selectRecommended, shouldComputerBank } from '../../front-end/src/game/engine.ts'
import { scoreSelection } from '../../front-end/src/game/scoring.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const study = resolve(root, 'docs/research/singleton-selection-2026-09')
const [sourceRoot, executable, mode = 'verify'] = process.argv.slice(2)
assert(sourceRoot && executable, 'Provide the frozen native source directory and research executable.')
assert(['plan', 'verify'].includes(mode), 'Optional last argument is plan or verify.')
const probe = resolve(dirname(executable), 'zilch_decision_probe')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const planBytes = await readFile(resolve(study, 'plan.json'))
const plan = JSON.parse(planBytes)
assert.equal(plan.study, 'singleton-selection-2026-09')
assert.equal(plan.simulator_revision, '89028a3c7d9963a6924f2565d90319b0a451f60a')
assert.equal(plan.executable_sha256, '33c6d95eb68ce8c50c3d19b99bcc3c795ad792b68057f1e61e6bf481379f85d3')
const git = (...args) => execFileSync('git', args, { cwd: sourceRoot, encoding: 'utf8' }).trim()
assert.equal(git('rev-parse', 'HEAD'), plan.simulator_revision)
assert.equal(git('status', '--porcelain', '-uno'), '')
assert.equal(sha256(await readFile(executable)), plan.executable_sha256)
const probeHash = sha256(await readFile(probe))
const nativeHashes = {}
for (const file of git('ls-files', '*.cpp', '*.h', 'CMakeLists.txt').split('\n').filter(Boolean))
  nativeHashes[file] = sha256(await readFile(resolve(sourceRoot, file)))
for (const [file, expected] of Object.entries(plan.web_game_source_sha256))
  assert.equal(sha256(await readFile(resolve(root, file))), expected, `Frozen web source: ${file}`)

let checks = 0
function near(actual, expected, label) {
  assert(Number.isFinite(actual) && Number.isFinite(expected), `${label}: finite values required`)
  assert(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${label}: ${actual} != ${expected}`)
  checks++
}

function argumentsMap(args) {
  assert.equal(args.length % 2, 0)
  const result = new Map()
  for (let index = 0; index < args.length; index += 2) {
    assert(args[index].startsWith('--'))
    assert(!result.has(args[index]), `Duplicate argument: ${args[index]}`)
    result.set(args[index], args[index + 1])
  }
  return result
}

const expectedCommon = {
  '--mode': 'selection',
  '--threads': '4',
  '--target': '5000',
  '--opening-score': '1000',
  '--sets': 'on',
  '--stealing': 'off',
  '--final-chase': 'on',
  '--first-roll-mercy': 'on',
  '--ties': 'on',
  '--saved-multiples': '0,0,0,0,0,0',
}
for (const side of ['a', 'b']) {
  Object.assign(expectedCommon, {
    [`--difficulty-${side}`]: 'hard',
    [`--collect-${side}`]: 'true',
    [`--chain-risk-${side}`]: '1',
    [`--chain-mode-${side}`]: 'blend',
    [`--safe-finish-${side}`]: 'true',
    [`--joint-selection-${side}`]: 'true',
    [`--joint-chains-only-${side}`]: 'true',
  })
}
assert.deepEqual(Object.fromEntries(argumentsMap(plan.common_arguments)), expectedCommon)
assert.equal(plan.comparisons.length, 322)
assert.equal(plan.omitted.length, 8)
assert.equal(new Set(plan.comparisons.map(item => item.id)).size, 322)
assert.equal(new Set(plan.comparisons.map(item => item.seed)).size, 322)
const allIds = new Set(plan.comparisons.map(item => item.id))
for (const omission of plan.omitted) {
  assert(!allIds.has(omission.id))
  assert.match(omission.id, /^explore-panel-(?:11|55|15-keep[15])-unopened-risk(?:0|350)-bank-roll$/)
  assert.equal(omission.reason, 'Bank branch cannot meet the opening minimum.')
}
assert.equal(new Set(plan.omitted.map(item => item.id)).size, 8)
for (const [phase, size, pairs, seedBase] of [['explore', 298, 10000, 3500000000], ['confirm', 24, 100000, 3600000000]]) {
  const rows = plan.comparisons.filter(item => item.phase === phase)
  assert.equal(rows.length, size)
  for (const [index, item] of rows.entries()) {
    assert.equal(item.seed, seedBase + index)
    assert.equal(item.pairs, pairs)
  }
}

const treatments = {
  '11': { both: [1, 1], one: [1] },
  '55': { both: [5, 5], one: [5] },
  '15-keep1': { both: [1, 5], one: [1] },
  '15-keep5': { both: [1, 5], one: [5] },
}

function selectedIds(dice, values) {
  const available = [...values]
  const result = []
  for (const die of dice) {
    const index = available.indexOf(die.value)
    if (index >= 0) {
      result.push(die.id)
      available.splice(index, 1)
    }
  }
  assert.equal(available.length, 0, 'Selection must be present in the fixed roll.')
  return result
}

function makeWebState(risk, own, opponent, chase, values, ties = true) {
  const game = createGame([{ name: 'A', kind: 'computer', difficulty: 'hard' }, { name: 'B', kind: 'human' }])
  Object.assign(game, {
    phase: 'selecting',
    turnScore: risk,
    diceInPlay: 6,
    rollNumber: risk ? 2 : 1,
    dice: values.map((value, id) => ({ value, id })),
    scoredMultiples: {},
  })
  game.players[0].score = own
  game.players[1].score = opponent
  game.settings.allowTies = ties
  if (chase)
    game.endgame = { triggerPlayerId: game.players[1].id, remainingTurns: 1 }
  return game
}

function webDecision(state) {
  const selected = selectComputerRecommended(state)
  const result = scoreSelection(selected.dice, selected.selectedDieIds)
  const counts = Array.from({ length: 6 }).fill(0)
  for (const die of selected.dice) {
    if (selected.selectedDieIds.includes(die.id))
      counts[die.value - 1]++
  }
  return {
    selected_counts: counts,
    action: shouldComputerBank(selected) ? 'Bank' : 'Roll',
    score_gain: result.score,
    projected_turn_score: state.turnScore + result.score,
    next_dice: state.dice.length - result.selectedCount || 6,
    can_bank: canBank(selected),
  }
}

const contexts = new Map()
const currentBehavior = {
  rolling_checkpoints_keep_one: 0,
  banking_checkpoints_collect_both: 0,
  rolling_selected_face_counts: { 1: 0, 5: 0 },
}
for (const item of plan.comparisons) {
  const treatment = treatments[item.treatment]
  assert(treatment)
  assert.deepEqual(item.roll, [...treatment.both, 2, 2, 3, 4])
  assert(item.risk === 0 || (item.risk >= 300 && item.risk % 50 === 0), 'Six fresh dice require reachable prior points.')
  for (const score of [item.position.own, item.position.opponent])
    assert(score === 0 || (Number.isSafeInteger(score) && score >= 1000 && score % 50 === 0))
  assert(item.position.own < 5000)
  assert(item.position.chase ? item.position.opponent >= 5000 : item.position.opponent < 5000)
  const game = makeWebState(item.risk, item.position.own, item.position.opponent, !!item.position.chase, item.roll)
  for (const [side, values] of [['left', treatment.both], ['right', treatment.one]]) {
    assert.deepEqual(item[side].selected, values)
    game.selectedDieIds = selectedIds(game.dice, values)
    const score = scoreSelection(game.dice, game.selectedDieIds)
    assert(score.valid)
    assert.deepEqual(score.multipleUpdates, {})
    assert.equal(item[side].score_gain, values.reduce((sum, face) => sum + (face === 1 ? 100 : 50), 0))
    assert.equal(score.score, item[side].score_gain)
    assert.equal(item[side].next_dice, 6 - values.length)
    assert.equal(item[side].can_bank, canBank(game))
    assert(['bank', 'roll'].includes(item[side].action))
    if (item[side].action === 'bank')
      assert(canBank(game), `${item.id}: forced banking must be legal`)
  }
  const decision = webDecision(game)
  const selected = decision.selected_counts.flatMap((count, index) => Array.from({ length: count }).fill(index + 1))
  assert.deepEqual(item.web_recommendation, { selected_dice: selected, action: decision.action.toLowerCase() })
  if (decision.action === 'Roll') {
    assert.equal(selected.length, 1, `${item.id}: released Hard already keeps one when rolling`)
    assert.equal(selected[0], item.treatment === '55' ? 5 : 1)
    currentBehavior.rolling_checkpoints_keep_one++
    currentBehavior.rolling_selected_face_counts[selected[0]]++
  }
  else {
    assert.deepEqual(selected, treatment.both)
    currentBehavior.banking_checkpoints_collect_both++
  }
  const context = { risk: item.risk, own: item.position.own, opponent: item.position.opponent, chase: !!item.position.chase, ties: true }
  contexts.set(JSON.stringify(context), context)
  checks += 20
}

// These literals independently reproduce the protocol's four primary seeds.
const primaries = plan.comparisons.filter(item => item.phase === 'confirm' && item.group === 'primary')
assert.deepEqual(primaries.map(item => [item.treatment, item.seed]), [
  ['11', 3600000000],
  ['55', 3600000003],
  ['15-keep1', 3600000006],
  ['15-keep5', 3600000009],
])
for (const item of primaries) {
  assert.equal(item.risk, 0)
  assert.equal(item.position.own, 0)
  assert.equal(item.position.opponent, 0)
  assert.equal(item.left.action, 'roll')
  assert.equal(item.right.action, 'roll')
}

// Enumerate every eligible trash multiset using all 63 nonempty selections.
// Any legal selection touching a trash die excludes that six-die roll.
const trashFaces = [2, 3, 4, 6]
const eligible = []
const eligibleCounts = {}
for (const pair of [[1, 1], [5, 5], [1, 5]]) {
  const label = pair.join('')
  const validMultisets = new Set()
  let ordered = 0
  for (const a of trashFaces) {
    for (const b of trashFaces) {
      for (const c of trashFaces) {
        for (const d of trashFaces) {
          const values = [...pair, a, b, c, d]
          const dice = values.map((value, id) => ({ value, id }))
          let trashScores = false
          for (let mask = 1; mask < 64; mask++) {
            const ids = dice.filter(die => (mask >> die.id) & 1).map(die => die.id)
            if (ids.some(id => id >= 2) && scoreSelection(dice, ids).valid)
              trashScores = true
          }
          if (trashScores)
            continue
          ordered++
          const sorted = [a, b, c, d].sort((left, right) => left - right)
          const key = sorted.join(',')
          if (!validMultisets.has(key)) {
            validMultisets.add(key)
            eligible.push([...pair, ...sorted])
          }
          for (const ids of [[0], [1], [0, 1]]) {
            const selected = scoreSelection(dice, ids)
            assert(selected.valid)
            assert.deepEqual(selected.multipleUpdates, {})
          }
        }
      }
    }
  }
  eligibleCounts[label] = { ordered, multisets: validMultisets.size }
}
assert.deepEqual(eligibleCounts, { 11: { ordered: 168, multisets: 13 }, 55: { ordered: 168, multisets: 13 }, 15: { ordered: 180, multisets: 18 } })
assert.equal(eligible.length, 44)

const selectionHelpers = []
for (const both of [[1, 1], [5, 5], [1, 5]]) {
  for (const caller of ['hard', 'medium', 'easy', 'human-select-best-score']) {
    const game = makeWebState(0, 0, 0, false, [...both, 2, 2, 3, 4])
    let selected
    if (caller === 'human-select-best-score') {
      game.players[0].kind = 'human'
      delete game.players[0].difficulty
      selected = selectRecommended(game)
    }
    else {
      game.players[0].difficulty = caller
      selected = selectComputerRecommended(game)
    }
    const selectedDice = selected.dice.filter(die => selected.selectedDieIds.includes(die.id)).map(die => die.value).sort((left, right) => left - right)
    assert.deepEqual(selectedDice, caller === 'hard' ? [both[0] === 5 ? 5 : 1] : both)
    selectionHelpers.push({ roll: game.dice.map(die => die.value), risk: 0, banked_scores: [0, 0], caller, selected_dice: selectedDice })
  }
}

// Include all plan contexts and extra exact tie/mercy boundaries.
for (const own of [4800, 4850, 4900, 4950]) {
  for (const opponent of [5000, 5050]) {
    for (const ties of [true, false]) {
      const context = { risk: 0, own, opponent, chase: true, ties }
      contexts.set(JSON.stringify(context), context)
    }
  }
}
for (const [own, opponent] of [[0, 0], [1000, 1000]]) {
  const context = { risk: 50, own, opponent, chase: false, ties: true }
  contexts.set(JSON.stringify(context), context)
}
const parityCases = []
for (const context of contexts.values()) {
  for (const values of eligible) {
    const state = makeWebState(context.risk, context.own, context.opponent, context.chase, values, context.ties)
    parityCases.push({
      line: [context.risk, context.own, context.opponent, 5000, 1000, 0, 1, Number(context.chase), Number(context.ties), 1, values.join(','), '0,0,0,0,0,0'].join(' '),
      expected: webDecision(state),
    })
  }
}
const probeArguments = ['--policy', resolve(root, 'docs/strategy-policies/standard-hard.cfg'), '--collect', 'true', '--features', 'released']
const nativeDecisions = execFileSync(probe, probeArguments, {
  input: `${parityCases.map(item => item.line).join('\n')}\n`,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
}).trim().split('\n').map(line => JSON.parse(line))
assert.equal(nativeDecisions.length, parityCases.length)
for (const [index, decision] of nativeDecisions.entries()) {
  const { line, ...actual } = decision
  assert.equal(line, index + 1)
  assert.deepEqual(actual, parityCases[index].expected, `Native/web production mismatch: ${parityCases[index].line}`)
}
process.stdout.write(`Plan validated: ${plan.comparisons.length} comparisons; ${parityCases.length} native/web decisions agree.\n`)
if (mode === 'plan')
  process.exit(0)

function verifyOutcomes(outcome, pairs, label) {
  for (const key of ['games', 'wins', 'ties', 'losses', 'points_for', 'points_against'])
    assert(Number.isSafeInteger(outcome[key]) && outcome[key] >= 0, `${label}.${key}`)
  assert.equal(outcome.games, pairs)
  assert.equal(outcome.wins + outcome.ties + outcome.losses, pairs)
  assert.equal(outcome.points_for % 50, 0)
  assert.equal(outcome.points_against % 50, 0)
  near(outcome.match_point_rate, (outcome.wins + outcome.ties / 2) / pairs, `${label}.rate`)
  near(outcome.average_score, outcome.points_for / pairs, `${label}.score`)
  near(outcome.average_opponent_score, outcome.points_against / pairs, `${label}.opponent`)
  near(outcome.average_score_margin, (outcome.points_for - outcome.points_against) / pairs, `${label}.margin`)
  checks += 10
}

function verifyMoments(moment, pairs, sum, label, bounded) {
  assert.equal(moment.independent_pairs, pairs)
  near(moment.sum, sum, `${label}.sum from marginal outcomes`)
  assert(Number.isFinite(moment.sum_squares) && moment.sum_squares >= 0)
  if (bounded) {
    assert(Number.isInteger(moment.sum_squares * 4), `${label}: half-point differences have quarter-integer squares`)
    assert(moment.sum_squares <= pairs)
  }
  const variance = (moment.sum_squares - sum ** 2 / pairs) / (pairs - 1)
  assert(variance >= -1e-10, `${label}: negative sample variance`)
  const mean = sum / pairs
  const error = Math.sqrt(Math.max(0, variance) / pairs)
  const interval = [mean - 1.959963984540054 * error, mean + 1.959963984540054 * error]
  near(moment.mean, mean, `${label}.mean`)
  near(moment.standard_error, error, `${label}.standard_error`)
  near(moment.ci95[0], interval[0], `${label}.ci95 lower`)
  near(moment.ci95[1], interval[1], `${label}.ci95 upper`)
  checks += 5
  return { mean, sample_variance: Math.max(0, variance), standard_error: error, ci95: interval }
}

const expectedRules = { target: 5000, opening_score: 1000, straight: true, multiples: true, singles: true, three_pairs: true, stealing: false, first_roll_mercy: true, final_chase: true, ties: true }
const expectedPolicy = {
  name: 'best',
  source: 'builtin',
  difficulty: 'Hard',
  collect_before_bank: true,
  chain_risk_weight: 1,
  chain_mode: 'blend',
  lower_chain_thresholds: true,
  safe_finish_collection: true,
  joint_selection: true,
  joint_chains_only: true,
  effective_joint_selection: true,
  joint_selection_scope: 'chain_rolls',
  effective_safe_finish_collection: true,
  safe_finish_collection_scope: 'all_rolls',
  bank_thresholds: [200, 1021, 1128, 1506, 2130, 5000],
  score_weight: 1.0045,
  remaining_dice_weight: 36.0805,
  hot_dice_weight: 354.561,
  multiple_weight: 91.9329,
  lead_factor: 0,
  trail_factor: 0.293194,
  closing_factor: 0.193316,
  roll_bias: 136.066,
}
const resultNames = (await readdir(resolve(study, 'results'))).filter(name => name.endsWith('.json')).sort()
assert.deepEqual(resultNames, plan.comparisons.map(item => `${item.id}.json`).sort(), 'Exactly the planned results must exist.')
const rows = []
const primaryPayloads = new Map()
for (const item of plan.comparisons) {
  const bytes = await readFile(resolve(study, 'results', `${item.id}.json`))
  const result = JSON.parse(bytes)
  assert.equal(result.run_id, item.id)
  assert.equal(result.schema_version, 2)
  assert.equal(result.mode, 'selection')
  assert.equal(result.pairs, item.pairs)
  assert.equal(result.total_games, item.pairs * 2)
  assert.equal(result.seed, item.seed)
  assert.equal(result.threads, 4)
  assert.equal(result.provenance.simulator_revision, plan.simulator_revision)
  assert.equal(result.provenance.simulator_tracked_status, '')
  assert.equal(result.provenance.executable_sha256, plan.executable_sha256)
  assert.deepEqual(result.provenance.source_sha256, nativeHashes)
  assert.equal(result.provenance.command[0], executable)
  const args = argumentsMap(result.provenance.command.slice(1))
  assert.deepEqual(Object.fromEntries(args), {
    ...expectedCommon,
    '--pairs': String(item.pairs),
    '--seed': String(item.seed),
    '--roll': item.roll.join(','),
    '--at-risk': String(item.risk),
    '--banked-a': String(item.position.own),
    '--banked-b': String(item.position.opponent),
    '--active-final-chase': String(!!item.position.chase),
    '--select-left': item.left.selected.join(','),
    '--action-left': item.left.action,
    '--select-right': item.right.selected.join(','),
    '--action-right': item.right.action,
  })
  assert.deepEqual(result.rules, expectedRules)
  assert.deepEqual(result.policy_a, expectedPolicy)
  assert.deepEqual(result.policy_b, expectedPolicy)
  assert.deepEqual(result.selection_state.roll, item.roll)
  assert.equal(result.selection_state.at_risk_before_selection, item.risk)
  for (const [state, selected] of [[result.selection_state.state, false], [result.branches.left.state, true], [result.branches.right.state, true]]) {
    assert.equal(state.banked_a, item.position.own)
    assert.equal(state.banked_b, item.position.opponent)
    assert.equal(state.seat, 0)
    assert.equal(state.turn_active, true)
    assert.equal(state.selected_option, selected)
    assert.equal(state.final_chase_active, !!item.position.chase)
    assert.equal(state.last_turn_of_match, !!item.position.chase)
    assert.equal(state.final_chase_leader_seat, item.position.chase ? 1 : null)
    assert.equal(state.roll_count_this_turn, item.risk ? 2 : 1)
    assert.equal(state.mercy_available_next_roll, false)
    assert.deepEqual(state.saved_multiple_scores, [0, 0, 0, 0, 0, 0])
  }
  assert.equal(result.selection_state.state.next_dice, 6)
  assert.equal(result.selection_state.state.at_risk, item.risk)
  assert.equal(result.selection_state.state.can_bank, false)
  assert.deepEqual(result.incumbent_recommendation.selected_dice, item.web_recommendation.selected_dice)
  assert.equal(result.incumbent_recommendation.action, item.web_recommendation.action)
  for (const side of ['left', 'right']) {
    const branch = result.branches[side]
    assert.deepEqual(branch.selected_dice, item[side].selected)
    assert.equal(branch.action, item[side].action)
    assert.equal(branch.score_gain, item[side].score_gain)
    assert.equal(branch.state.at_risk, item.risk + item[side].score_gain)
    assert.equal(branch.state.next_dice, item[side].next_dice)
    assert.equal(branch.state.can_bank, item[side].can_bank)
    const remaining = item.roll.reduce((counts, face) => {
      counts[face - 1]++
      return counts
    }, Array.from({ length: 6 }).fill(0))
    for (const face of item[side].selected)
      remaining[face - 1]--
    assert.deepEqual(branch.state.remaining_rolled_counts, remaining)
    assert.equal(branch.applied_options.length, item[side].selected.length)
    let gain = 0
    for (const option of branch.applied_options) {
      assert.equal(option.type, 'single')
      assert.equal(option.dice_used, 1)
      assert.equal(option.extends_multiple, false)
      assert.equal(option.hot_dice, false)
      gain += option.score_gain
    }
    assert.equal(gain, branch.score_gain)
    verifyOutcomes(result[side], item.pairs, `${item.id}.${side}`)
  }
  const matchPoints = verifyMoments(result.right_minus_left_match_points_paired, item.pairs, result.right.wins + result.right.ties / 2 - result.left.wins - result.left.ties / 2, `${item.id}.match points`, true)
  const margin = verifyMoments(result.right_minus_left_score_margin_paired, item.pairs, result.right.points_for - result.right.points_against - result.left.points_for + result.left.points_against, `${item.id}.margin`, false)
  const screen = [matchPoints.mean - 3.3 * matchPoints.standard_error, matchPoints.mean + 3.3 * matchPoints.standard_error]
  rows.push({
    id: item.id,
    result_sha256: sha256(bytes),
    phase: item.phase,
    group: item.group,
    treatment: item.treatment,
    seed: item.seed,
    pairs: item.pairs,
    left_match_point_rate: result.left.match_point_rate,
    right_match_point_rate: result.right.match_point_rate,
    match_point_difference: matchPoints,
    score_margin_difference: margin,
    confirmation_sign_screen_3_3_se: item.phase === 'confirm' ? screen : null,
    confirmation_sign: item.phase !== 'confirm' ? null : screen[0] > 0 ? 'right' : screen[1] < 0 ? 'left' : 'unresolved',
  })
  if (primaries.some(primary => primary.id === item.id))
    primaryPayloads.set(item.id, result)
  checks += 70
}
process.stdout.write(`Independently verified arithmetic, treatments, and provenance for all ${rows.length} results.\n`)

const replays = []
for (const item of primaries) {
  const saved = primaryPayloads.get(item.id)
  process.stdout.write(`Replaying ${item.id} at saved seed ${item.seed}.\n`)
  const stdout = execFileSync(executable, saved.provenance.command.slice(1), { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 })
  const replay = JSON.parse(stdout)
  const { provenance: _provenance, run_id: _runId, ...original } = saved
  assert.deepEqual(replay, original, `Exact independent replay: ${item.id}`)
  replays.push({ id: item.id, seed: item.seed, pairs: item.pairs, games: item.pairs * 2, exact_payload_match: true, replay_stdout_sha256: sha256(stdout) })
}
assert.equal(sha256(await readFile(executable)), plan.executable_sha256)
assert.equal(sha256(await readFile(probe)), probeHash)
assert.equal(sha256(await readFile(resolve(study, 'plan.json'))), sha256(planBytes))
assert.equal(git('rev-parse', 'HEAD'), plan.simulator_revision)
assert.equal(git('status', '--porcelain', '-uno'), '')
for (const [file, expected] of Object.entries(nativeHashes))
  assert.equal(sha256(await readFile(resolve(sourceRoot, file))), expected)

const validation = {
  kind: 'independent-singleton-checkpoint-arithmetic-source-branch-and-replay-audit',
  plan_sha256: sha256(planBytes),
  verifier_sha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  simulator_revision: plan.simulator_revision,
  executable_sha256: plan.executable_sha256,
  source_sha256: nativeHashes,
  web_game_source_sha256: plan.web_game_source_sha256,
  checked_comparisons: rows.length,
  independent_branch_pairs: rows.reduce((sum, item) => sum + item.pairs, 0),
  distinct_research_games: rows.reduce((sum, item) => sum + item.pairs * 2, 0),
  arithmetic_and_treatment_checks: checks,
  eligible_trash: eligibleCounts,
  current_v1_3_0_initial_recommendations: {
    ...currentBehavior,
    primary: primaries.map(item => ({ treatment: item.treatment, recommendation: item.web_recommendation })),
    scope: 'Counts refer to the 322 planned comparisons, which repeat some states across forced-action treatments and phases. Every released-Hard rolling recommendation keeps one single; banking collects both. These counts are not in-game frequencies.',
  },
  current_v1_3_0_selection_helpers: {
    probes: selectionHelpers,
    interpretation: 'For these representative unopened rolls, Hard keeps one single, while Easy, Medium, and the human Select best score helper collect both. This establishes current source behavior without inferring which control or version the user previously observed.',
  },
  native_web_production_parity: { contexts: contexts.size, eligible_roll_multisets: eligible.length, decisions: parityCases.length, mismatches: 0, probe_sha256: probeHash, command: [probe, ...probeArguments] },
  replay_games_not_new_evidence: replays.reduce((sum, item) => sum + item.games, 0),
  independent_primary_replays: replays,
  limitations: [
    'The moments audit reconstructs means and intervals from saved marginal totals and paired second moments; all four primary replays additionally verify the exact simulation output.',
    'Conditional forced actions with v1.3.0 Hard continuation do not establish the best whole-game policy or mathematically optimal decisions.',
    'Pointwise normal 95% intervals are not simultaneous; the 24-confirmation 3.3-SE screen is an approximate conservative sign screen.',
    'Reachable standard states avoid the native/web opening-formula difference for fabricated positive banked totals below the opening minimum.',
  ],
  results: rows,
}
const output = resolve(study, 'validation.json')
const serialized = `${JSON.stringify(validation, null, 2)}\n`
if (existsSync(output))
  assert.equal(await readFile(output, 'utf8'), serialized, 'Existing independent validation must reproduce exactly.')
else
  await writeFile(output, serialized, { flag: 'wx' })
process.stdout.write(`Independent validation complete: ${rows.length} comparisons, ${validation.distinct_research_games} research games, ${validation.replay_games_not_new_evidence} exact replay games.\n`)
