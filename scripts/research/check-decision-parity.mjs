import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { canBank, createGame, selectComputerRecommended, shouldComputerBank } from '../../front-end/src/game/engine.ts'
import { hasScoringOption, scoreSelection } from '../../front-end/src/game/scoring.ts'

const [probe, output, simulatorRoot, commandJson] = process.argv.slice(2)
assert(probe && simulatorRoot, 'Provide the probe artifact, evidence output path, and companion source directory.')
// An optional command array supports the companion Java/visual probes, which
// choose the named Hard policy from each input's actual settings.
const command = commandJson ? JSON.parse(commandJson) : null
assert(!command || (Array.isArray(command) && command.length > 0 && command.every(value => typeof value === 'string')))
const contexts = [
  ...[0, 600, 950, 1000, 1300, 1800, 2700, 2800, 3500, 4500].map(turn => ({ turn })),
  { turn: 1250, opponent: 1100 },
  { turn: 0, own: 4800, opponent: 3500 },
  { turn: 0, own: 4800, opponent: 4700 },
  { turn: 0, own: 4900, opponent: 4700 },
  { turn: 1000, own: 4900, opponent: 4700 },
  { turn: 500, own: 4900, opponent: 5500, chase: true },
  { turn: 500, own: 4900, opponent: 5500, chase: true, ties: false },
  { turn: 600, own: 4500, opponent: 5200, chase: true },
  { turn: 4800, finalChase: false },
  { turn: 5000, target: 10000 },
  { turn: 0, opening: 0 },
  { turn: 600, own: 1000, opponent: 1000, chains: { 2: 3 }, maxDice: 3 },
  { turn: 1000, own: 1000, opponent: 1000, chains: { 1: 3 }, maxDice: 3 },
  { turn: 1200, chains: { 6: 4 }, maxDice: 2 },
  ...[0, 350, 950, 1500, 2800].flatMap(turn => [
    { turn, own: 1000, opponent: 1000 },
    { turn, own: 3500, opponent: 1000 },
    { turn, own: 1000, opponent: 3500 },
  ]),
]
for (let face = 1; face <= 6; face++) {
  for (const count of [3, 4, 5]) {
    const base = (face === 1 ? 1000 : face * 100) * 2 ** (count - 3)
    for (const extra of [0, 1000, 2500]) {
      for (const [own, opponent] of [[1000, 1000], [3500, 1000], [1000, 3500]])
        contexts.push({ turn: base + extra, own, opponent, chains: { [face]: count }, maxDice: 6 - count })
    }
  }
}
function combinations(count, minimum = 1, prefix = []) {
  if (count === 0)
    return [prefix]
  return Array.from({ length: 7 - minimum }, (_, index) => minimum + index)
    .flatMap(value => combinations(count - 1, value, [...prefix, value]))
}

const totals = []
for (const stealing of [false, true]) {
  const cases = []
  for (const context of contexts) {
    for (let count = 1; count <= (context.maxDice ?? 6); count++) {
      for (const values of combinations(count)) {
        const state = createGame([
          { name: 'Computer', kind: 'computer', difficulty: 'hard' },
          { name: 'Opponent', kind: 'human' },
        ])
        Object.assign(state.settings, {
          stealing,
          winningScore: context.target ?? 5000,
          openingScore: context.opening ?? 1000,
          finalChase: context.finalChase ?? true,
          allowTies: context.ties ?? true,
        })
        state.phase = 'selecting'
        state.turnScore = context.turn
        state.players[0].score = context.own ?? 0
        state.players[1].score = context.opponent ?? 0
        state.rollNumber = 2
        state.diceInPlay = count
        state.dice = values.map((value, id) => ({ value, id }))
        state.scoredMultiples = context.chains ?? {}
        if (context.chase)
          state.endgame = { triggerPlayerId: state.players[1].id, remainingTurns: 1 }
        const chainScores = Array.from({ length: 6 }, (_, index) => {
          const face = index + 1
          const chain = state.scoredMultiples[face]
          return chain ? (face === 1 ? 1000 : face * 100) * 2 ** (chain - 3) : 0
        })
        const line = [
          context.turn,
          state.players[0].score,
          state.players[1].score,
          state.settings.winningScore,
          state.settings.openingScore,
          Number(stealing),
          Number(state.settings.finalChase),
          Number(!!context.chase),
          Number(state.settings.allowTies),
          1,
          values.join(','),
          chainScores.join(','),
        ].join(' ')
        const selected = selectComputerRecommended(state)
        const scoring = scoreSelection(selected.dice, selected.selectedDieIds, selected.scoredMultiples)
        const counts = [0, 0, 0, 0, 0, 0]
        for (const die of selected.dice) {
          if (selected.selectedDieIds.includes(die.id))
            counts[die.value - 1]++
        }
        const bust = !hasScoringOption(state.dice, state.scoredMultiples)
        cases.push({ line, expected: {
          selected_counts: counts,
          action: bust ? 'Bust' : shouldComputerBank(selected) ? 'Bank' : 'Roll',
          score_gain: scoring.score,
          projected_turn_score: state.turnScore + scoring.score,
          next_dice: values.length - selected.selectedDieIds.length || 6,
          can_bank: canBank(selected),
        } })
      }
    }
  }
  const policy = stealing ? 'stealing-hard.cfg' : 'standard-hard.cfg'
  const stdout = execFileSync(command?.[0] ?? probe, command?.slice(1) ?? ['--policy', `docs/strategy-policies/${policy}`, '--collect', String(!stealing)], {
    input: `${cases.map(row => row.line).join('\n')}\n`,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const actual = stdout.trim().split('\n').map(line => JSON.parse(line))
  assert.equal(actual.length, cases.length)
  for (let index = 0; index < cases.length; index++) {
    const { line: _line, ...decision } = actual[index]
    assert.deepEqual(decision, cases[index].expected, `Decision mismatch: ${cases[index].line}`)
  }
  totals.push({ stealing, cases: cases.length, mismatches: 0 })
}
const sha256 = data => createHash('sha256').update(data).digest('hex')
const hashes = {}
for (const path of ['front-end/src/game/engine.ts', 'front-end/src/game/scoring.ts', 'front-end/src/game/roll-risk.ts', 'scripts/research/check-decision-parity.mjs'])
  hashes[path] = sha256(await readFile(path))
const simulatorHashes = {}
const sourcePaths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: simulatorRoot, encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(path => /\.(?:cpp|h|java)$/.test(path) || path === 'CMakeLists.txt' || path === 'build.gradle')
for (const path of sourcePaths)
  simulatorHashes[path] = sha256(await readFile(resolve(simulatorRoot, path)))
// A Java probe class does not contain the implementation it calls. Record the
// whole compiled classpath so evidence identifies the actual tested program.
const classHashes = {}
if (probe.endsWith('.class')) {
  const classpathIndex = command?.indexOf('-cp') ?? -1
  assert(classpathIndex >= 0 && command[classpathIndex + 1], 'Java parity requires an explicit class directory.')
  const classRoot = command[classpathIndex + 1]
  const classPaths = (await readdir(classRoot, { recursive: true })).filter(path => path.endsWith('.class')).sort()
  for (const path of classPaths)
    classHashes[path] = sha256(await readFile(resolve(classRoot, path)))
  assert(Object.keys(classHashes).length > 1)
}
const result = {
  contexts: contexts.length,
  totals,
  source_sha256: hashes,
  simulator_source_sha256: simulatorHashes,
  simulator_revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: simulatorRoot, encoding: 'utf8' }).trim(),
  simulator_tracked_status: execFileSync('git', ['status', '--porcelain', '-uno'], { cwd: simulatorRoot, encoding: 'utf8' }).trim(),
  probe_sha256: sha256(await readFile(probe)),
  compiled_class_sha256: classHashes,
  command_override: command,
  coverage: 'Every unordered 1–6-die roll in base score/endgame contexts, plus all chain faces/sizes with feasible remaining dice across risk and lead/trail positions. Includes legacy counterfactual decision states; not a win-rate sample.',
}
if (output)
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' })
process.stdout.write(`${JSON.stringify(result)}\n`)
