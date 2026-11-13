import { describe, expect, it } from 'vitest'
import { dailySets, defaultWeight, exerciseNames, latestSession, type Session } from './training'

function row(id: string, date: string, createdAt: string, ...exercises: Session['exercises']): Session {
  return { id, date, createdAt, exercises }
}

const first = row('1', '2026-11-12', '2026-11-12T01:00:00.000Z', {
  name: '划船', weightKg: 40, sets: 4, note: '末组 35 kg × 12 次',
})
const later = row('2', '2026-11-12', '2026-11-12T09:00:00.000Z', { name: ' 划船 ', weightKg: 42.5, sets: 3 })
const backfill = row('3', '2026-11-09', '2026-11-12T12:00:00.000Z', { name: '划船', weightKg: 25, sets: 2 })

describe('defaultWeight', () => {
  it('inherits the starting weight and ignores the note', () => {
    expect(defaultWeight([first], '划船', '2026-11-13')).toBe(40)
  })

  it('prefers the latest training date over the latest save time', () => {
    // backfill 保存得最晚，但训练日期更早，不应该被选中
    expect(defaultWeight([first, later, backfill], '划船', '2026-11-12')).toBe(42.5)
  })

  it('breaks same-day ties by save time whatever the array order is', () => {
    expect(defaultWeight([first, later], '划船', '2026-11-12')).toBe(42.5)
    expect(defaultWeight([later, first], '划船', '2026-11-12')).toBe(42.5)
  })

  it('ignores records after the date being logged', () => {
    expect(defaultWeight([first, later, backfill], ' 划船 ', '2026-11-10')).toBe(25)
    expect(defaultWeight([first, later], '划船', '2026-11-10')).toBeUndefined()
  })

  it('keeps zero as a valid bodyweight starting weight', () => {
    const pushups = row('4', '2026-11-12', '2026-11-12T09:00:00.000Z', { name: '俯卧撑', weightKg: 0, sets: 3 })
    expect(defaultWeight([pushups], '俯卧撑', '2026-11-12')).toBe(0)
  })
})

it('offers unique exercise names after trimming spaces', () => {  const pushups = row('4', '2026-11-13', '2026-11-13T09:00:00.000Z', { name: '俯卧撑', weightKg: 0, sets: 3 })
  expect(exerciseNames([first, later, pushups])).toEqual(['划船', '俯卧撑'])
})

it('sums all exercises across same-day sessions and recomputes when a session is removed', () => {
  const yearEnd = row('4', '2025-12-31', '2025-12-31T09:00:00.000Z', { name: '深蹲', weightKg: 60, sets: 6 })
  const newYear = row(
    '5', '2026-01-01', '2026-01-01T09:00:00.000Z',
    { name: '深蹲', weightKg: 60, sets: 3 },
    { name: '俯卧撑', weightKg: 0, sets: 2 },
  )
  expect(dailySets([first, later, yearEnd, newYear])).toEqual(new Map([
    ['2026-11-12', 7], ['2025-12-31', 6], ['2026-01-01', 5],
  ]))
  expect(dailySets([later, yearEnd, newYear]).get('2026-11-12')).toBe(3)
})

it('picks the most recent session by date, then by save time', () => {
  expect(latestSession([])).toBeUndefined()

  const olderDate = row('o', '2026-11-01', '2026-11-05T10:00:00.000Z', { name: '深蹲', weightKg: 50, sets: 3 })
  const newerDate = row('n', '2026-11-10', '2026-11-10T10:00:00.000Z', { name: '深蹲', weightKg: 55, sets: 3 })
  const sameDayLater = row('s', '2026-11-10', '2026-11-10T20:00:00.000Z', { name: '深蹲', weightKg: 60, sets: 3 })

  expect(latestSession([olderDate, newerDate])?.id).toBe('n')
  expect(latestSession([sameDayLater, newerDate, olderDate])?.id).toBe('s')
})
