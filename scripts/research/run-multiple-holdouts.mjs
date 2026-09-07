import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const [sourceRoot, executable] = process.argv.slice(2)
assert(sourceRoot && executable, 'Provide the frozen source and executable.')
const study = resolve('docs/research/multiple-selection-2026-09')
const frozen = JSON.parse(await readFile(resolve(study, 'frozen-candidate.json'), 'utf8'))
const sha256 = data => createHash('sha256').update(data).digest('hex')
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim(), frozen.simulator_revision)
assert.equal(sha256(await readFile(executable)), frozen.executable_sha256)
assert.deepEqual(frozen.features, { collect_before_bank: true, safe_finish_collection: true, chain_risk_weight: 1, chain_mode: 'blend', joint_selection: true, joint_chains_only: true })

for (const [index, run] of frozen.holdouts.entries()) {
  const flags = new Map([
    ['--mode', 'duel'],
    ['--pairs', String(run.pairs)],
    ['--threads', '4'],
    ['--seed', String(frozen.primary_seed + index)],
    ['--collect-a', 'true'],
    ['--collect-b', 'true'],
    ['--safe-finish-a', 'true'],
    ['--chain-risk-a', '1'],
    ['--chain-mode-a', 'blend'],
    ['--joint-selection-a', 'true'],
    ['--joint-chains-only-a', 'true'],
  ])
  assert.equal(run.extra_flags.length % 2, 0)
  for (let offset = 0; offset < run.extra_flags.length; offset += 2)
    flags.set(run.extra_flags[offset], run.extra_flags[offset + 1])
  const args = [...flags].flat()
  const path = resolve(study, 'results', `${run.id}.json`)
  if (!existsSync(path)) {
    execFileSync(process.execPath, ['scripts/research/run-experiment.mjs', '--study', 'multiple-selection-2026-09', sourceRoot, executable, run.id, ...args], { stdio: 'inherit' })
  }
  const result = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(result.run_id, run.id)
  assert.equal(result.pairs, run.pairs)
  assert.equal(result.seed, frozen.primary_seed + index)
  assert.equal(result.provenance.simulator_revision, frozen.simulator_revision)
  assert.equal(result.provenance.executable_sha256, frozen.executable_sha256)
  assert.deepEqual(result.provenance.command, [executable, ...args])
}
