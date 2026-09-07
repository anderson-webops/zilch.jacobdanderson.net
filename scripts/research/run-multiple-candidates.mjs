import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const [source, executable, phase = 'greedy', pairs = '50000', seed = '3200000000'] = process.argv.slice(2)
assert(source && executable, 'Provide frozen simulator source and executable, optional greedy/joint phase, pairs and tuning seed.')
assert(['greedy', 'joint'].includes(phase))
assert(/^\d+$/.test(pairs) && Number(pairs) > 0)
assert(/^\d+$/.test(seed))

const candidates = phase === 'greedy' ? [{ name: 'safe-finish-only', weight: 0, mode: 'raise' }] : []
for (const mode of ['raise', 'blend']) {
  for (const weight of phase === 'greedy' ? [0.25, 0.5, 0.75, 1, 1.25] : [0, 0.25, 0.5, 0.75, 1, 1.25]) {
    if (weight === 0 && mode === 'blend')
      continue
    candidates.push({ name: `${phase}-${mode}-${String(weight).replace('.', '-')}`, mode, weight })
  }
}

for (const candidate of candidates) {
  const flags = [
    '--mode',
    'duel',
    '--pairs',
    pairs,
    '--threads',
    '4',
    '--seed',
    seed,
    '--collect-a',
    'true',
    '--collect-b',
    'true',
    '--safe-finish-a',
    'true',
    '--chain-risk-a',
    String(candidate.weight),
    '--chain-mode-a',
    candidate.mode,
  ]
  if (phase === 'joint')
    flags.push('--joint-selection-a', 'true')
  execFileSync(process.execPath, [
    'scripts/research/run-experiment.mjs',
    '--study',
    'multiple-selection-2026-09',
    source,
    executable,
    `tune-${candidate.name}`,
    ...flags,
  ], { cwd: root, stdio: 'inherit' })
}
