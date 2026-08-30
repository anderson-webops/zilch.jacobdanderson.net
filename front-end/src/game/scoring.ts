import type { Die, DieValue, MultipleChains, SelectionResult } from './types.ts'

const DIE_VALUES: DieValue[] = [1, 2, 3, 4, 5, 6]

function countDice(dice: Die[]) {
  const counts: MultipleChains = {}
  for (const die of dice)
    counts[die.value] = (counts[die.value] ?? 0) + 1
  return counts
}

function multipleScore(count: number, value: DieValue) {
  const base = value === 1 ? 1_000 : value * 100
  return base * (2 ** (count - 3))
}

function isStraight(dice: Die[]) {
  if (dice.length !== 6)
    return false
  const values = new Set(dice.map(die => die.value))
  return DIE_VALUES.every(value => values.has(value))
}

function isThreePairs(dice: Die[]) {
  if (dice.length !== 6)
    return false
  return Object.values(countDice(dice)).filter(Boolean).length === 3
    && Object.values(countDice(dice)).every(count => count === 2)
}

function faceName(value: DieValue, count: number) {
  const names: Record<DieValue, string> = {
    1: 'one',
    2: 'two',
    3: 'three',
    4: 'four',
    5: 'five',
    6: 'six',
  }
  return count === 1 ? names[value] : `${names[value]}s`
}

export function scoreSelection(
  dice: Die[],
  selectedDieIds: readonly number[],
  scoredMultiples: MultipleChains = {},
): SelectionResult {
  const selected = dice.filter(die => selectedDieIds.includes(die.id))
  if (selected.length === 0) {
    return {
      valid: false,
      score: 0,
      label: 'No dice selected',
      selectedCount: 0,
      multipleUpdates: {},
      reason: 'Choose at least one scoring die.',
    }
  }

  if (isStraight(selected)) {
    return {
      valid: true,
      score: 1_000,
      label: 'Straight',
      selectedCount: 6,
      multipleUpdates: {},
      reason: '',
    }
  }

  if (isThreePairs(selected)) {
    return {
      valid: true,
      score: 1_000,
      label: 'Three pairs',
      selectedCount: 6,
      multipleUpdates: {},
      reason: '',
    }
  }

  const counts = countDice(selected)
  const availableCounts = countDice(dice)
  const multipleUpdates: MultipleChains = {}
  const labels: string[] = []
  let score = 0

  for (const value of DIE_VALUES) {
    const count = counts[value] ?? 0
    if (count === 0)
      continue

    const priorCount = scoredMultiples[value] ?? 0
    const availableCount = availableCounts[value] ?? 0
    if (count !== availableCount && (priorCount >= 3 || availableCount >= 3)) {
      return {
        valid: false,
        score: 0,
        label: 'Incomplete multiple',
        selectedCount: selected.length,
        multipleUpdates: {},
        reason: priorCount >= 3
          ? `Select all ${availableCount} matching ${faceName(value, availableCount)} to extend the existing multiple.`
          : `Select all ${availableCount} ${faceName(value, availableCount)} to score that multiple.`,
      }
    }

    if (priorCount >= 3) {
      const nextCount = priorCount + count
      score += multipleScore(nextCount, value) - multipleScore(priorCount, value)
      multipleUpdates[value] = nextCount
      labels.push(`${count} more ${faceName(value, count)}`)
      continue
    }

    if (count >= 3) {
      score += multipleScore(count, value)
      multipleUpdates[value] = count
      labels.push(`${count} ${faceName(value, count)}`)
      continue
    }

    if (value === 1 || value === 5) {
      score += count * (value === 1 ? 100 : 50)
      labels.push(`${count} ${faceName(value, count)}`)
      continue
    }

    return {
      valid: false,
      score: 0,
      label: 'Incomplete score',
      selectedCount: selected.length,
      multipleUpdates: {},
      reason: `Select at least three ${faceName(value, 2)}, or leave them on the table.`,
    }
  }

  return {
    valid: score > 0,
    score,
    label: labels.join(' + '),
    selectedCount: selected.length,
    multipleUpdates,
    reason: score > 0 ? '' : 'Those dice do not make a scoring combination.',
  }
}

export function selectableDieIds(dice: Die[], scoredMultiples: MultipleChains = {}) {
  if (isStraight(dice) || isThreePairs(dice))
    return dice.map(die => die.id)

  const counts = countDice(dice)
  return dice
    .filter((die) => {
      const priorCount = scoredMultiples[die.value] ?? 0
      return die.value === 1
        || die.value === 5
        || (counts[die.value] ?? 0) >= 3
        || priorCount >= 3
    })
    .map(die => die.id)
}

export function recommendedDieIds(dice: Die[], scoredMultiples: MultipleChains = {}) {
  return selectableDieIds(dice, scoredMultiples)
}

export function hasScoringOption(dice: Die[], scoredMultiples: MultipleChains = {}) {
  return selectableDieIds(dice, scoredMultiples).length > 0
}

export const scoringRules = [
  { combination: 'Single 1', score: '100' },
  { combination: 'Single 5', score: '50' },
  { combination: 'Three 1s', score: '1,000' },
  { combination: 'Three 2s–6s', score: 'Face × 100' },
  { combination: 'Each extra matching die', score: 'Doubles the multiple' },
  { combination: '1–2–3–4–5–6 straight', score: '1,000' },
  { combination: 'Three pairs', score: '1,000' },
] as const
