import { expect, it } from 'vitest'
import { formatDateLabel, heatmapWeeks, isLocalDate, localDate } from './dates'

it('formats local calendar dates on either side of New Year midnight', () => {
  expect(localDate(new Date(2025, 11, 31, 23, 59))).toBe('2025-12-31')
  expect(localDate(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01')
})

it('accepts only real YYYY-MM-DD calendar dates', () => {
  expect(isLocalDate('2024-02-29')).toBe(true)
  expect(isLocalDate('0099-01-01')).toBe(true)
  for (const date of ['2026-02-29', '2026-04-31', '2026-00-01', '2026-01-00', '2026-1-02', '0000-01-01', null]) {
    expect(isLocalDate(date)).toBe(false)
  }
})

it('ends 52 Monday-first calendar weeks in the week containing today', () => {
  const weeks = heatmapWeeks('2026-01-01')
  expect(weeks).toHaveLength(52)
  expect(weeks.every((week) => week.length === 7)).toBe(true)
  expect(weeks[0]?.[0]).toBe('2025-01-06')
  expect(weeks.at(-1)).toEqual([
    '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01',
    '2026-01-02', '2026-01-03', '2026-01-04',
  ])
})

it('keeps consecutive calendar days through the autumn DST change', () => {
  const weeks = heatmapWeeks('2026-11-02')
  expect(weeks.at(-2)).toEqual([
    '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29',
    '2026-10-30', '2026-10-31', '2026-11-01',
  ])
  expect(weeks.at(-1)?.[0]).toBe('2026-11-02')
})

it('labels a stored date with the local calendar day', () => {
  expect(formatDateLabel('2026-11-12')).toContain('2026年11月12日')
})
