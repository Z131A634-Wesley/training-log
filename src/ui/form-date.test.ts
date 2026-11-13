import { expect, it } from 'vitest'
import { initialFormDate } from './form-date'

it('starts on today when nothing was chosen', () => {
  expect(initialFormDate(undefined, undefined, '2026-11-13')).toEqual({
    date: '2026-11-13',
    pinned: false,
  })
})

it('does not pin today, so the form can roll over midnight', () => {
  expect(initialFormDate(undefined, '2026-11-13', '2026-11-13')).toEqual({
    date: '2026-11-13',
    pinned: false,
  })
})

it('pins a backfilled date so filling fields cannot move it to today', () => {
  expect(initialFormDate(undefined, '2026-11-10', '2026-11-13')).toEqual({
    date: '2026-11-10',
    pinned: true,
  })
})

it('pins the date of the session being edited', () => {
  expect(initialFormDate('2026-10-30', '2026-11-13', '2026-11-13')).toEqual({
    date: '2026-10-30',
    pinned: true,
  })
})
