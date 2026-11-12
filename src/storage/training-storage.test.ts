import { expect, it } from 'vitest'
import type { Session } from '../domain/training'
import { exportBackup, loadSessions, parseBackup, saveSessions, STORAGE_KEY } from './training-storage'

const first: Session = {
  id: 'a',
  date: '2026-11-12',
  createdAt: '2026-11-12T09:12:00.000Z',
  exercises: [
    { name: '俯卧撑', weightKg: 0, sets: 3 },
    { name: '划船', weightKg: 42.5, sets: 4, note: '末组 35 kg × 12 次' },
  ],
}
const second: Session = { ...first, id: 'b', date: '2026-10-30' }

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
  }
}

it('starts empty only when no stored document exists', () => {
  const storage = memoryStorage()
  expect(loadSessions(storage)).toEqual([])
  storage.setItem(STORAGE_KEY, '')
  expect(() => loadSessions(storage)).toThrow()
})

it('round trips an export into clean storage without reordering sessions or losing notes', () => {
  const original = [first, second]
  const backup = exportBackup(original)
  expect(JSON.parse(backup)).toEqual({ schemaVersion: 1, sessions: original })
  const clean = memoryStorage()
  saveSessions(clean, parseBackup(backup))
  expect(loadSessions(clean)).toEqual(original)
})

it.each([
  ['missing sessions', '{}'],
  ['unsupported version', '{"schemaVersion":2,"sessions":[]}'],
  ['malformed JSON', '{"schemaVersion":'],
  ['duplicate ID', JSON.stringify({ schemaVersion: 1, sessions: [first, first] })],
])('rejects a backup with %s', (_label, text) => {
  expect(() => parseBackup(text)).toThrow()
})

it.each([
  ['empty ID', { id: ' ' }],
  ['invalid calendar date', { date: '2026-02-29' }],
  ['unparseable timestamp', { createdAt: 'now' }],
  ['timestamp with nonexistent date', { createdAt: '2026-02-30T00:00:00.000Z' }],
  ['missing exercises', { exercises: [] }],
  ['blank name', { exercises: [{ name: ' ', weightKg: 0, sets: 3 }] }],
  ['negative weight', { exercises: [{ name: '俯卧撑', weightKg: -1, sets: 3 }] }],
  ['string weight', { exercises: [{ name: '俯卧撑', weightKg: '0', sets: 3 }] }],
  ['zero sets', { exercises: [{ name: '俯卧撑', weightKg: 0, sets: 0 }] }],
  ['fractional sets', { exercises: [{ name: '俯卧撑', weightKg: 0, sets: 2.5 }] }],
  ['non-string note', { exercises: [{ name: '俯卧撑', weightKg: 0, sets: 3, note: null }] }],
])('rejects the whole backup when a later session has %s', (_label, invalidFields) => {
  const text = JSON.stringify({ schemaVersion: 1, sessions: [first, { ...second, ...invalidFields }] })
  expect(() => parseBackup(text)).toThrow()
})

it('does not replace existing storage when validating a write fails', () => {
  const storage = memoryStorage()
  saveSessions(storage, [first])
  const invalid = { ...second, exercises: [{ name: '俯卧撑', weightKg: Infinity, sets: 3 }] }
  expect(() => saveSessions(storage, [first, invalid])).toThrow()
  expect(loadSessions(storage)).toEqual([first])
})

it('reports a storage write failure to the caller', () => {
  const error = new Error('quota exceeded')
  const storage = { setItem() { throw error } }
  expect(() => saveSessions(storage, [first])).toThrow(error)
})
