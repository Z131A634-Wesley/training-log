import { expect, it } from 'vitest'
import type { Session, Template } from '../domain/training'
import {
  exportBackup,
  importLegacySessions,
  loadDocument,
  migrateLegacyDocument,
  parseBackup,
  saveDocument,
  STORAGE_KEY,
  type Document,
} from './training-storage'

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

const pushDay: Template = {
  id: 't1',
  name: '胸 + 三头',
  exercises: [
    { name: '卧推', sets: 4 },
    { name: '绳索下压', sets: 3 },
  ],
}

const documentOf = (sessions: Session[], templates: Template[] = []): Document => ({
  schemaVersion: 2,
  sessions,
  templates,
})

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
  }
}

it('starts empty only when no stored document exists', () => {
  const storage = memoryStorage()
  expect(loadDocument(storage)).toEqual({ schemaVersion: 2, sessions: [], templates: [] })
  storage.setItem(STORAGE_KEY, '')
  expect(() => loadDocument(storage)).toThrow()
})

it('round trips an export into clean storage without reordering sessions or losing notes', () => {
  const original = documentOf([first, second], [pushDay])
  const backup = exportBackup(original)
  expect(JSON.parse(backup)).toEqual(original)

  const clean = memoryStorage()
  saveDocument(clean, parseBackup(backup))
  expect(loadDocument(clean)).toEqual(original)
})

it('accepts a version 1 document and gives it an empty template list', () => {
  const version1 = JSON.stringify({ schemaVersion: 1, sessions: [first] })
  expect(parseBackup(version1)).toEqual(documentOf([first]))
})

it.each([
  ['missing sessions', '{}'],
  ['unsupported version', '{"schemaVersion":3,"sessions":[],"templates":[]}'],
  ['malformed JSON', '{"schemaVersion":'],
  ['duplicate ID', JSON.stringify({ schemaVersion: 2, sessions: [first, first], templates: [] })],
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
  const text = JSON.stringify({ schemaVersion: 2, sessions: [first, { ...second, ...invalidFields }], templates: [] })
  expect(() => parseBackup(text)).toThrow()
})

it.each([
  ['a blank name', { name: '  ' }],
  ['no exercises', { exercises: [] }],
  ['a blank exercise name', { exercises: [{ name: ' ', sets: 3 }] }],
  ['zero sets', { exercises: [{ name: '卧推', sets: 0 }] }],
  ['fractional sets', { exercises: [{ name: '卧推', sets: 2.5 }] }],
])('rejects a training day with %s', (_label, patch) => {
  const text = JSON.stringify({ schemaVersion: 2, sessions: [first], templates: [{ ...pushDay, ...patch }] })
  expect(() => parseBackup(text)).toThrow()
})

it('rejects two training days with the same name', () => {
  const text = JSON.stringify({ schemaVersion: 2, sessions: [], templates: [pushDay, { ...pushDay, id: 't2' }] })
  expect(() => parseBackup(text)).toThrow()
})

it('does not replace existing storage when validating a write fails', () => {
  const storage = memoryStorage()
  saveDocument(storage, documentOf([first]))
  const invalid = { ...second, exercises: [{ name: '俯卧撑', weightKg: Infinity, sets: 3 }] }
  expect(() => saveDocument(storage, documentOf([first, invalid]))).toThrow()
  expect(loadDocument(storage)).toEqual(documentOf([first]))
})

it('reports a storage write failure to the caller', () => {
  const error = new Error('quota exceeded')
  const storage = { setItem() { throw error } }
  expect(() => saveDocument(storage, documentOf([first]))).toThrow(error)
})

it('imports the earlier weight-based document and drops the exercise ids', () => {
  const legacy = JSON.stringify({
    schemaVersion: 1,
    sessions: [{
      id: 'old',
      date: '2026-11-12',
      createdAt: '2026-11-12T11:12:00.000Z',
      exercises: [
        { id: 'e1', name: '坐姿划船', weight: 40, sets: 4, note: '末组 35 kg × 12 次' },
        { id: 'e2', name: '深蹲', weight: 0, sets: 3, note: '' },
      ],
    }],
  })

  expect(migrateLegacyDocument(legacy)).toEqual([{
    id: 'old',
    date: '2026-11-12',
    createdAt: '2026-11-12T11:12:00.000Z',
    exercises: [
      { name: '坐姿划船', weightKg: 40, sets: 4, note: '末组 35 kg × 12 次' },
      { name: '深蹲', weightKg: 0, sets: 3 },
    ],
  }])
})

it('refuses to import a document that does not validate', () => {
  expect(migrateLegacyDocument('not json')).toBeNull()
  expect(migrateLegacyDocument('{"schemaVersion":2,"sessions":[]}')).toBeNull()
  expect(migrateLegacyDocument('{"schemaVersion":1,"sessions":[{"id":"x"}]}')).toBeNull()
  expect(migrateLegacyDocument(JSON.stringify({
    schemaVersion: 1,
    sessions: [{ id: 'x', date: '2026-02-29', createdAt: '2026-11-12T00:00:00.000Z', exercises: [] }],
  }))).toBeNull()
})

const legacyDocument = (sessions: unknown[]) => JSON.stringify({ schemaVersion: 1, sessions })

it('imports the earlier document once and keeps it in place', () => {
  const storage = memoryStorage()
  storage.setItem('training-log:v1', legacyDocument([{
    id: 'old-1',
    date: '2026-11-12',
    createdAt: '2026-11-12T11:12:00.000Z',
    exercises: [{ id: 'e1', name: '坐姿划船', weight: 40, sets: 4 }],
  }]))

  expect(importLegacySessions(storage)).toBe(1)
  expect(loadDocument(storage).sessions).toEqual([{
    id: 'old-1',
    date: '2026-11-12',
    createdAt: '2026-11-12T11:12:00.000Z',
    exercises: [{ name: '坐姿划船', weightKg: 40, sets: 4 }],
  }])
  expect(storage.getItem('training-log:v1')).not.toBeNull()
  expect(importLegacySessions(storage)).toBe(0)
})

it('merges the earlier document into existing records without duplicating ids', () => {
  const storage = memoryStorage()
  saveDocument(storage, documentOf([first], [pushDay]))
  storage.setItem('training-log:v1', legacyDocument([
    { id: first.id, date: first.date, createdAt: first.createdAt, exercises: [{ name: '俯卧撑', weight: 0, sets: 3 }] },
    { id: 'old-2', date: '2026-10-01', createdAt: '2026-10-01T10:00:00.000Z', exercises: [{ name: '深蹲', weight: 55, sets: 5 }] },
  ]))

  expect(importLegacySessions(storage)).toBe(1)
  const stored = loadDocument(storage)
  expect(stored.sessions).toHaveLength(2)
  expect(stored.sessions[0]).toEqual(first)
  expect(stored.sessions[1]?.id).toBe('old-2')
  expect(stored.templates).toEqual([pushDay])
})

it('does nothing when there is no earlier document', () => {
  expect(importLegacySessions(memoryStorage())).toBe(0)
})
