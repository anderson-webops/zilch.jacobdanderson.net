import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const [sourceRoot, output] = process.argv.slice(2)
assert(sourceRoot, 'Provide the simulator repository containing all recorded revisions.')
const results = resolve('docs/research/multiple-selection-2026-09/results')
const sha256 = data => createHash('sha256').update(data).digest('hex')
const sourceHashes = new Map()
let checks = 0
function near(actual, expected) {
  assert(Number.isFinite(actual) && Number.isFinite(expected))
  assert(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`)
  checks++
}
function moments(value, pairs, sum) {
  assert.equal(value.independent_pairs, pairs)
  near(value.sum, sum)
  const variance = (value.sum_squares - sum ** 2 / pairs) / (pairs - 1)
  assert(variance >= -1e-10)
  const error = Math.sqrt(Math.max(0, variance) / pairs)
  near(value.mean, sum / pairs)
  near(value.standard_error, error)
  near(value.ci95[0], sum / pairs - 1.959963984540054 * error)
  near(value.ci95[1], sum / pairs + 1.959963984540054 * error)
}
const rows = []
for (const name of (await readdir(results)).filter(name => name.endsWith('.json')).sort()) {
  const bytes = await readFile(resolve(results, name))
  const data = JSON.parse(bytes)
  if (data.mode !== 'duel')
    continue
  const { pairs, total_games: games, provenance, a, b } = data
  assert.equal(name, `${data.run_id}.json`)
  assert.equal(games, pairs * 2)
  assert.equal(provenance.simulator_tracked_status, '')
  const flag = key => provenance.command[provenance.command.indexOf(key) + 1]
  assert.equal(Number(flag('--pairs')), pairs)
  assert.equal(Number(flag('--seed')), data.seed)
  assert.equal(flag('--mode'), 'duel')
  for (const [path, hash] of Object.entries(provenance.source_sha256)) {
    const ref = `${provenance.simulator_revision}:${path}`
    if (!sourceHashes.has(ref))
      sourceHashes.set(ref, sha256(execFileSync('git', ['show', ref], { cwd: sourceRoot })))
    assert.equal(hash, sourceHashes.get(ref), `${name}: ${ref}`)
    checks++
  }
  for (const side of [a, b]) {
    for (const key of ['games', 'wins', 'ties', 'losses', 'points_for', 'points_against'])
      assert(Number.isSafeInteger(side[key]) && side[key] >= 0)
    assert.equal(side.games, games)
    assert.equal(side.wins + side.ties + side.losses, games)
    near(side.match_point_rate, (side.wins + side.ties / 2) / games)
    near(side.average_score, side.points_for / games)
    near(side.average_opponent_score, side.points_against / games)
    near(side.average_score_margin, (side.points_for - side.points_against) / games)
  }
  assert.equal(a.wins, b.losses)
  assert.equal(a.losses, b.wins)
  assert.equal(a.ties, b.ties)
  assert.equal(a.points_for, b.points_against)
  assert.equal(a.points_against, b.points_for)
  moments(data.a_match_point_rate_paired, pairs, (a.wins + a.ties / 2) / 2)
  moments(data.a_score_margin_paired, pairs, (a.points_for - a.points_against) / 2)
  rows.push({ run_id: data.run_id, sha256: sha256(bytes), games, seed: data.seed, policy_a: data.policy_a, policy_b: data.policy_b, rules: data.rules, primary: data.a_match_point_rate_paired })
}
assert(rows.length > 0)
const summary = { kind: 'independent-duel-arithmetic-and-source-audit', checked_runs: rows.length, games: rows.reduce((sum, row) => sum + row.games, 0), numeric_and_source_checks: checks, rows }
if (output)
  await writeFile(output, `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' })
process.stdout.write(`${JSON.stringify({ ...summary, rows: rows.map(row => ({ run_id: row.run_id, rate: row.primary.mean, ci95: row.primary.ci95 })) })}\n`)
