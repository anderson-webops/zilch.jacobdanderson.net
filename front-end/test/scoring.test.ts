/* eslint-disable test/no-import-node-test */
import type { Die, DieValue } from '../src/game/types.ts'
import assert from 'node:assert/strict'

import test from 'node:test'
import { recommendedDieIds, scoreSelection, scoringRules } from '../src/game/scoring.ts'

function dice(values: DieValue[]): Die[] {
  return values.map((value, index) => ({ id: index + 1, value }))
}

test('scores non-overlapping single ones and fives together', () => {
  const roll = dice([1, 5, 2, 3, 4, 6])
  const result = scoreSelection(roll, [1, 2])

  assert.equal(result.valid, true)
  assert.equal(result.score, 150)
})

test('scores multiples with every extra die doubling the base', () => {
  const fourThrees = dice([3, 3, 3, 3])
  const sixOnes = dice([1, 1, 1, 1, 1, 1])

  assert.equal(scoreSelection(fourThrees, [1, 2, 3, 4]).score, 600)
  assert.equal(scoreSelection(sixOnes, [1, 2, 3, 4, 5, 6]).score, 8_000)
})

test('requires every matching die when the current roll contains a multiple', () => {
  const tripleOnes = dice([1, 1, 1, 2, 3, 4])
  const fourThrees = dice([3, 3, 3, 3, 2, 4])

  const singleFromTriple = scoreSelection(tripleOnes, [1])
  const threeFromFour = scoreSelection(fourThrees, [1, 2, 3])

  assert.equal(singleFromTriple.valid, false)
  assert.match(singleFromTriple.reason, /select all 3 ones/i)
  assert.equal(threeFromFour.valid, false)
  assert.match(threeFromFour.reason, /select all 4 threes/i)
  assert.equal(scoreSelection(tripleOnes, [1, 2, 3]).score, 1_000)
  assert.equal(scoreSelection(fourThrees, [1, 2, 3, 4]).score, 600)
})

test('scores a full straight and three distinct pairs', () => {
  const straight = dice([1, 2, 3, 4, 5, 6])
  const pairs = dice([1, 1, 3, 3, 6, 6])

  assert.deepEqual(scoreSelection(straight, straight.map(die => die.id)), {
    valid: true,
    score: 1_000,
    label: 'Straight',
    selectedCount: 6,
    multipleUpdates: {},
    reason: '',
  })
  assert.equal(scoreSelection(pairs, pairs.map(die => die.id)).label, 'Three pairs')
  assert.equal(scoreSelection(pairs, pairs.map(die => die.id)).score, 500)
  assert.equal(scoringRules.find(rule => rule.combination === 'Three pairs')?.score, '500')
})

test('three distinct pairs occur exactly 2.5 times as often as a straight', () => {
  let pairs = 0
  let straights = 0
  for (let encoded = 0; encoded < 6 ** 6; encoded++) {
    let remaining = encoded
    const roll = dice(Array.from({ length: 6 }, () => {
      const value = (remaining % 6 + 1) as DieValue
      remaining = Math.floor(remaining / 6)
      return value
    }))
    const result = scoreSelection(roll, roll.map(die => die.id))
    if (result.label === 'Three pairs') {
      pairs++
      assert.equal(result.score, 500)
    }
    if (result.label === 'Straight') {
      straights++
      assert.equal(result.score, 1_000)
    }
  }
  assert.equal(pairs, 1_800)
  assert.equal(straights, 720)
  assert.equal(pairs / straights, 2.5)
})

test('four matching dice plus a pair and six matching dice are not three pairs', () => {
  const fourAndTwo = dice([6, 6, 6, 6, 5, 5])
  const sixMatching = dice([6, 6, 6, 6, 6, 6])
  const first = scoreSelection(fourAndTwo, fourAndTwo.map(die => die.id))
  const second = scoreSelection(sixMatching, sixMatching.map(die => die.id))
  assert.notEqual(first.label, 'Three pairs')
  assert.equal(first.score, 1_300)
  assert.notEqual(second.label, 'Three pairs')
  assert.equal(second.score, 4_800)
})

test('rejects an incomplete non-scoring group', () => {
  const roll = dice([2, 2, 4, 5])
  const result = scoreSelection(roll, [1, 2])

  assert.equal(result.valid, false)
  assert.match(result.reason, /at least three twos/i)
})

test('extends a multiple scored on an earlier roll by its incremental value', () => {
  const roll = dice([3, 1, 5])
  const extension = scoreSelection(roll, [1], { 3: 3 })

  assert.equal(extension.score, 300)
  assert.deepEqual(extension.multipleUpdates, { 3: 4 })
})

test('requires every matching extension die from the current roll', () => {
  const roll = dice([3, 3, 2])
  const partialExtension = scoreSelection(roll, [1], { 3: 3 })
  const fullExtension = scoreSelection(roll, [1, 2], { 3: 3 })

  assert.equal(partialExtension.valid, false)
  assert.match(partialExtension.reason, /select all 2 matching threes/i)
  assert.equal(fullExtension.score, 900)
  assert.deepEqual(fullExtension.multipleUpdates, { 3: 5 })
})

test('recommends all dice for whole-roll combinations', () => {
  const roll = dice([2, 2, 4, 4, 6, 6])
  assert.deepEqual(recommendedDieIds(roll), [1, 2, 3, 4, 5, 6])
})
