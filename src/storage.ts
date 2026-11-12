import type { Document, Exercise, Session } from './domain'

export const STORAGE_KEY = 'training-log:v1'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function validExercise(value: unknown): value is Exercise {
  return isObject(value) && typeof value.id === 'string' && value.id.trim().length > 0 &&
    typeof value.name === 'string' && value.name.trim().length > 0 &&
    typeof value.weight === 'number' && Number.isFinite(value.weight) && value.weight >= 0 &&
    typeof value.sets === 'number' && Number.isSafeInteger(value.sets) && value.sets > 0 &&
    typeof value.note === 'string'
}

function validSession(value: unknown): value is Session {
  if (!isObject(value) || typeof value.id !== 'string' || !value.id.trim() || !validDate(value.date) ||
      typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) ||
      !Array.isArray(value.exercises) || value.exercises.length === 0 || !value.exercises.every(validExercise)) return false
  return new Set(value.exercises.map(item => item.id)).size === value.exercises.length
}

export function parseBackup(text: string): Document {
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('无法读取备份：JSON 格式无效。') }
  if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.sessions) || !value.sessions.every(validSession) ||
      new Set(value.sessions.map(item => item.id)).size !== value.sessions.length) {
    throw new Error('数据格式无效或版本不受支持，原有记录未更改。')
  }
  return value as Document
}

export function serializeBackup(doc: Document): string {
  const text = JSON.stringify(doc, null, 2)
  parseBackup(text)
  return text
}

export function load(): Document {
  const text = localStorage.getItem(STORAGE_KEY)
  return text === null ? { schemaVersion: 1, sessions: [] } : parseBackup(text)
}

export function save(doc: Document): void {
  localStorage.setItem(STORAGE_KEY, serializeBackup(doc))
}
