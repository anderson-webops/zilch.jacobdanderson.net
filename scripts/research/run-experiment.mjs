import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const [simulatorRoot, executable, runId, ...args] = process.argv.slice(2)
assert(simulatorRoot && executable && runId, 'Provide simulator source root, executable, run ID, and research arguments.')
assert(/^[a-z0-9-]+$/.test(runId), 'Run ID must be a simple lowercase filename.')
assert(!args.includes('--output'), 'This wrapper owns the output file and protects earlier evidence.')
const output = resolve(root, 'docs/research/hot-dice-2026-09/results', `${runId}.json`)
assert(!existsSync(output), `Refusing to replace existing evidence: ${output}`)
const sha256 = data => createHash('sha256').update(data).digest('hex')
const git = (...parameters) => execFileSync('git', parameters, { cwd: simulatorRoot, encoding: 'utf8' }).trim()
const sources = {}
for (const path of ['computer.cpp', 'computer.h', 'zilch.cpp', 'zilch.h', 'research/strategy_lab.cpp'])
  sources[path] = sha256(await readFile(resolve(simulatorRoot, path)))
const cmakeCache = await readFile(resolve(dirname(executable), 'CMakeCache.txt'), 'utf8')
const compiler = cmakeCache.match(/^CMAKE_CXX_COMPILER:FILEPATH=(.+)$/m)?.[1]
assert(compiler, 'The executable must have its CMake build cache beside it for compiler provenance.')
const provenance = {
  simulator_revision: git('rev-parse', 'HEAD'),
  simulator_tracked_status: git('status', '--porcelain', '-uno'),
  source_sha256: sources,
  executable_sha256: sha256(await readFile(executable)),
  compiler: execFileSync(compiler, ['--version'], { encoding: 'utf8' }).trim(),
  cmake_build_type: cmakeCache.match(/^CMAKE_BUILD_TYPE:STRING=(.*)$/m)?.[1],
  platform: `${process.platform}-${process.arch}`,
  command: [executable, ...args],
  started_at: new Date().toISOString(),
}
const started = performance.now()
const result = JSON.parse(execFileSync(executable, args, { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 }))
provenance.elapsed_seconds = (performance.now() - started) / 1000
provenance.finished_at = new Date().toISOString()
await mkdir(dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify({ run_id: runId, provenance, ...result }, null, 2)}\n`, { flag: 'wx' })
const primary = result.mode === 'state' ? result.roll_minus_bank_match_points_paired : result.a_match_point_rate_paired
process.stdout.write(`${JSON.stringify({ run_id: runId, elapsed_seconds: provenance.elapsed_seconds, primary })}\n`)
