import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { canBank, createGame } from '../../front-end/src/game/engine.ts'
import { scoreSelection } from '../../front-end/src/game/scoring.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const contexts = [
  { name: 'unopened', own: 0, opponent: 0 },
  { name: 'level', own: 1000, opponent: 1000 },
  { name: 'ahead', own: 3500, opponent: 1000 },
  { name: 'behind', own: 1000, opponent: 3500 },
  { name: 'close-finish', own: 4500, opponent: 4500 },
  { name: 'final-trailing', own: 3500, opponent: 5500, chase: true },
  { name: 'final-close', own: 4900, opponent: 5500, chase: true },
]
const cases = []
const omitted = []

function selectedIds(values, selectedValues) {
  const remaining = [...selectedValues]
  const ids = []
  for (const [id, value] of values.entries()) {
    const index = remaining.indexOf(value)
    if (index >= 0) {
      ids.push(id)
      remaining.splice(index, 1)
    }
  }
  assert.equal(remaining.length, 0)
  return ids
}

function addComparison({ id, values, keep, all, risk, context, chains = {}, group }) {
  const game = createGame([
    { name: 'A', kind: 'computer', difficulty: 'hard' },
    // The UI factory requires a human. This state only validates bank legality;
    // the native checkpoint explicitly uses Hard for both continuation players.
    { name: 'B', kind: 'human' },
  ])
  Object.assign(game, {
    phase: 'selecting',
    turnScore: risk,
    diceInPlay: values.length,
    dice: values.map((value, index) => ({ id: index, value })),
    scoredMultiples: chains,
    selectedDieIds: selectedIds(values, all),
  })
  game.players[0].score = context.own
  game.players[1].score = context.opponent
  const leftScore = scoreSelection(game.dice, game.selectedDieIds, chains)
  const rightScore = scoreSelection(game.dice, selectedIds(values, keep), chains)
  assert(leftScore.valid && rightScore.valid)
  const savedMultiples = Array.from({ length: 6 }, (_, index) => {
    const held = chains[index + 1] ?? 0
    return held ? (index === 0 ? 1000 : (index + 1) * 100) * 2 ** (held - 3) : 0
  })
  const spec = {
    group,
    values,
    keep,
    all,
    risk,
    context,
    savedMultiples,
    selectedScoreLeft: leftScore.score,
    selectedScoreRight: rightScore.score,
  }
  cases.push({ id: `${id}-roll-v-roll`, ...spec, leftAction: 'roll' })
  if (canBank(game))
    cases.push({ id: `${id}-bank-v-roll`, ...spec, leftAction: 'bank' })
  else
    omitted.push({ id: `${id}-bank-v-roll`, reason: 'Banking all selected points does not meet the opening minimum.', ...spec })
}

for (let face = 1; face <= 6; face++) {
  for (const count of [3, 4, 5]) {
    for (const singleton of [1, 5].filter(value => value !== face)) {
      const primary = count === 3 && singleton === (face === 5 ? 1 : 5)
      const keep = Array.from({ length: count }).fill(face)
      const all = [...keep, singleton]
      const values = [...all, ...[2, 3, 4, 6].filter(value => value !== face).slice(0, 6 - all.length)]
      const risks = primary ? [0, 350, 400, 950, 1500, 2800] : [0, 950, 2800]
      const positions = primary ? contexts : [contexts[1], contexts[3], contexts[4]]
      for (const risk of risks) {
        for (const context of positions) {
          addComparison({
            id: `face-${face}-count-${count}-single-${singleton}-risk-${risk}-${context.name}`,
            values,
            keep,
            all,
            risk,
            context,
            group: primary ? 'primary-triples' : 'secondary-size-singleton',
          })
        }
      }

      if (count !== 3)
        continue
      const multipleScore = scoreSelection(values.map((value, id) => ({ id, value })), [0, 1, 2]).score
      const extraScore = singleton === 1 ? 100 : 50
      const openingRisk = 1000 - multipleScore - extraScore
      if (openingRisk >= 0) {
        addComparison({
          id: `opening-boundary-face-${face}-single-${singleton}`,
          values,
          keep,
          all,
          risk: openingRisk,
          context: contexts[0],
          group: 'exact-opening-boundary',
        })
      }
      // Keep-only would tie; taking the unrelated single would win outright.
      // Choose existing at-risk points so the actor remains below the target.
      const risk = Math.max(0, 600 - multipleScore)
      const own = 5500 - risk - multipleScore
      for (const ties of [true, false]) {
        const context = { name: `strict-finish-ties-${ties}`, own, opponent: 5500, chase: true, ties }
        addComparison({ id: `finish-face-${face}-single-${singleton}-ties-${ties}`, values, keep, all, risk, context, group: 'exact-finish-boundary' })
      }
    }
  }
}

// More than one unrelated scoring single can make partial collection matter.
for (const face of [2, 3, 4, 6]) {
  const triple = [face, face, face]
  const values = [...triple, 1, 5, [2, 3, 4, 6].find(value => value !== face)]
  for (const risk of [0, 950, 2800]) {
    for (const context of [contexts[1], contexts[3], contexts[4]]) {
      for (const extras of [[], [1], [5]]) {
        addComparison({
          id: `both-singles-face-${face}-keep-${extras.join('') || 'triple'}-risk-${risk}-${context.name}`,
          values,
          keep: [...triple, ...extras],
          all: [...triple, 1, 5],
          risk,
          context,
          group: 'both-singles',
        })
      }
    }
  }
  const risk = Math.max(0, 500 - face * 100)
  for (const ties of [true, false]) {
    const context = { name: `both-singles-final-ties-${ties}`, own: 5500 - risk - face * 100 - 100, opponent: 5500, chase: true, ties }
    for (const extras of [[], [1], [5]]) {
      addComparison({
        id: `both-singles-final-face-${face}-keep-${extras.join('') || 'triple'}-ties-${ties}`,
        values,
        keep: [...triple, ...extras],
        all: [...triple, 1, 5],
        risk,
        context,
        group: 'exact-finish-boundary',
      })
    }
  }
}

// A later roll can trade a stronger saved multiple for a fresh six-dice roll.
for (const face of [2, 3, 4, 6]) {
  for (const held of [3, 4]) {
    const values = held === 3 ? [face, 1, 5] : [face, 5]
    const heldScore = face * 100 * 2 ** (held - 3)
    for (const extraRisk of [0, 400, 1400, 2400]) {
      for (const context of [contexts[1], contexts[3], contexts[4]]) {
        addComparison({
          id: `extension-face-${face}-held-${held}-risk-${heldScore + extraRisk}-${context.name}`,
          values,
          keep: [face],
          all: values,
          risk: heldScore + extraRisk,
          context,
          chains: { [face]: held },
          group: 'saved-extension-versus-hot-dice',
        })
      }
    }
  }
}

assert.equal(new Set(cases.map(item => item.id)).size, cases.length)
const counts = Object.fromEntries([...new Set(cases.map(item => item.group))].map(group => [group, cases.filter(item => item.group === group).length]))
if (process.argv[2] === '--list') {
  await new Promise(resolveOutput => process.stdout.write(`${JSON.stringify({ comparisons: cases.length, counts, omitted, cases }, null, 2)}\n`, resolveOutput))
  process.exit(0)
}

const [simulatorRoot, executable, outputPath, pairInput = '5000', seedInput = '3100000000'] = process.argv.slice(2)
assert(simulatorRoot && executable && outputPath, 'Provide simulator source, executable, new output JSONL, optional pairs and seed base; or --list.')
const pairs = Number(pairInput)
const seedBase = Number(seedInput)
assert(Number.isSafeInteger(pairs) && pairs > 0)
assert(Number.isSafeInteger(seedBase) && seedBase >= 0)
const git = (...args) => execFileSync('git', args, { cwd: simulatorRoot, encoding: 'utf8' }).trim()
assert.equal(git('status', '--porcelain', '-uno'), '', 'Freeze and commit the simulator before recording checkpoint evidence.')
const sha256 = data => createHash('sha256').update(data).digest('hex')
const sourceHashes = {}
for (const path of git('ls-files', '*.cpp', '*.h', 'CMakeLists.txt').split('\n').filter(Boolean))
  sourceHashes[path] = sha256(await readFile(resolve(simulatorRoot, path)))
const cmakeCache = await readFile(resolve(dirname(executable), 'CMakeCache.txt'), 'utf8')
const compiler = cmakeCache.match(/^CMAKE_CXX_COMPILER:FILEPATH=(.+)$/m)?.[1]
assert(compiler)
const executableHash = sha256(await readFile(executable))
const output = resolve(outputPath)
await writeFile(output, `${JSON.stringify({
  kind: 'selection-checkpoint-panel',
  stage: 'exploratory',
  pairsPerComparison: pairs,
  seedBase,
  plannedComparisons: cases.length,
  counts,
  omitted,
  provenance: {
    simulatorRevision: git('rev-parse', 'HEAD'),
    sourceHashes,
    executableHash,
    compiler: execFileSync(compiler, ['--version'], { encoding: 'utf8' }).trim(),
    cmakeBuildType: cmakeCache.match(/^CMAKE_BUILD_TYPE:STRING=(.*)$/m)?.[1],
    runnerHash: sha256(await readFile(fileURLToPath(import.meta.url))),
    startedAt: new Date().toISOString(),
  },
})}\n`, { flag: 'wx' })

const started = performance.now()
for (const [index, checkpoint] of cases.entries()) {
  const { context } = checkpoint
  const args = [
    '--mode',
    'selection',
    '--pairs',
    String(pairs),
    '--threads',
    '4',
    '--seed',
    String(seedBase + index),
    '--collect-a',
    'true',
    '--collect-b',
    'true',
    '--roll',
    checkpoint.values.join(','),
    '--at-risk',
    String(checkpoint.risk),
    '--banked-a',
    String(context.own),
    '--banked-b',
    String(context.opponent),
    '--select-left',
    checkpoint.all.join(','),
    '--action-left',
    checkpoint.leftAction,
    '--select-right',
    checkpoint.keep.join(','),
    '--action-right',
    'roll',
    '--active-final-chase',
    String(context.chase ?? false),
    '--ties',
    String(context.ties ?? true),
    '--saved-multiples',
    checkpoint.savedMultiples.join(','),
  ]
  const result = JSON.parse(execFileSync(executable, args, { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 }))
  await appendFile(output, `${JSON.stringify({ checkpoint, command: [executable, ...args], result })}\n`)
  if ((index + 1) % 50 === 0)
    process.stdout.write(`${index + 1}/${cases.length} checkpoint comparisons recorded\n`)
}
assert.equal(sha256(await readFile(executable)), executableHash, 'Research executable changed during this panel.')
await appendFile(output, `${JSON.stringify({ kind: 'complete', comparisons: cases.length, totalGames: cases.length * pairs * 2, elapsedSeconds: (performance.now() - started) / 1000 })}\n`)
process.stdout.write(`Completed ${cases.length} comparisons (${cases.length * pairs * 2} games): ${output}\n`)
