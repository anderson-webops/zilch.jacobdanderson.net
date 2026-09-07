/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createGame } from '../src/game/engine.ts'
import { defaultSetupPreferences, readSetupPreferences, restoreSetupPreferences, SETUP_PREFERENCE_KEY, writeSetupPreferences } from '../src/game/setup-preferences.ts'

test('fresh or unreadable preferences keep the original defaults', () => {
  for (const raw of [null, '', 'null', '{', '[]', '{"schemaVersion":2}'])
    assert.deepEqual(readSetupPreferences({ getItem: () => raw }), defaultSetupPreferences())
  assert.deepEqual(readSetupPreferences({ getItem: () => {
    throw new Error('blocked')
  } }), defaultSetupPreferences())
  assert.deepEqual(readSetupPreferences(null), defaultSetupPreferences())
  assert.equal(defaultSetupPreferences().computerDifficulty, 'medium')
})

test('difficulty, players, custom scores, and every house rule round-trip independently of game progress', () => {
  const preferences = defaultSetupPreferences()
  preferences.computerDifficulty = 'hard'
  preferences.mode = 'local'
  preferences.playerCount = 6
  preferences.humanName = 'Jacob'
  preferences.computerName = 'Bot'
  preferences.localNames = ['A', 'B', 'C', 'D', 'E', 'F']
  preferences.settings = { winningScore: 12345, openingScore: 650, firstRollBust: false, finalChase: false, allowTies: false, stealing: true }
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) }
  writeSetupPreferences(storage, preferences)
  assert.deepEqual([...data.keys()], [SETUP_PREFERENCE_KEY])
  assert.deepEqual(readSetupPreferences(storage), preferences)
  writeSetupPreferences({ setItem: () => {
    throw new Error('full')
  } }, preferences)
})

test('malformed fields fall back without coercing strings to booleans or allowing invalid scores', () => {
  const restored = restoreSetupPreferences({
    schemaVersion: 1,
    mode: 'online',
    playerCount: 7,
    computerDifficulty: 'expert',
    humanName: {},
    computerName: ' ',
    localNames: ['Alice'],
    settings: { winningScore: 1_000_000, openingScore: -50, firstRollBust: 'false', finalChase: 0, allowTies: null, stealing: true },
  })
  assert.deepEqual(restored, { ...defaultSetupPreferences(), localNames: ['Alice', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6'], settings: { ...defaultSetupPreferences().settings, stealing: true } })
  for (const winningScore of [999, 100001, 1234.5, '5000', Infinity])
    assert.equal(restoreSetupPreferences({ schemaVersion: 1, settings: { winningScore } }).settings.winningScore, 5000)
  assert.equal(restoreSetupPreferences({ schemaVersion: 1, settings: { winningScore: 1000, openingScore: 1500 } }).settings.openingScore, 1000)
  assert.equal(restoreSetupPreferences({ schemaVersion: 1, settings: { winningScore: 100000, openingScore: 0 } }).settings.openingScore, 0)
})

test('an existing saved game seeds preferences on upgrade without overriding newer setup choices', () => {
  const savedGame = createGame([{ name: 'Jacob', kind: 'human' }, { name: 'Hard Bot', kind: 'computer', difficulty: 'hard' }], {
    ...defaultSetupPreferences().settings,
    winningScore: 7500,
    openingScore: 500,
    stealing: true,
  })
  const data = new Map([['zilch-browser-game-v1', JSON.stringify(savedGame)]])
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) }
  const migrated = readSetupPreferences(storage)
  assert.equal(migrated.computerDifficulty, 'hard')
  assert.equal(migrated.humanName, 'Jacob')
  assert.equal(migrated.computerName, 'Hard Bot')
  assert.deepEqual(migrated.settings, savedGame.settings)
  writeSetupPreferences(storage, migrated)
  data.delete('zilch-browser-game-v1')
  assert.deepEqual(readSetupPreferences(storage), migrated)
  data.set('zilch-browser-game-v1', JSON.stringify(savedGame))
  writeSetupPreferences(storage, { ...migrated, computerDifficulty: 'easy' })
  assert.equal(readSetupPreferences(storage).computerDifficulty, 'easy')
})
