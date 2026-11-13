import { isLocalDate } from '../domain/dates'
import type { Exercise, Session, Template, TemplateExercise } from '../domain/training'

export const STORAGE_KEY = 'training-log:sessions'
/** 合并前那一版用的键和字段名（weight），只用于一次性导入。 */
export const LEGACY_STORAGE_KEY = 'training-log:v1'
/** 记录「旧数据已经检查过」，避免删掉的记录下次加载又冒出来。 */
export const LEGACY_IMPORTED_KEY = 'training-log:v1:imported'
const SCHEMA_VERSION = 2

export interface Document {
  schemaVersion: 2
  sessions: Session[]
  templates: Template[]
}

export function emptyDocument(): Document {
  return { schemaVersion: SCHEMA_VERSION, sessions: [], templates: [] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
    && isLocalDate(value.slice(0, 10))
    && Number.isFinite(Date.parse(value))
}

function isExercise(value: unknown): value is Exercise {
  return isRecord(value)
    && typeof value.name === 'string' && value.name.trim() !== ''
    && typeof value.weightKg === 'number' && Number.isFinite(value.weightKg) && value.weightKg >= 0
    && typeof value.sets === 'number' && Number.isInteger(value.sets) && value.sets > 0
    && (value.note === undefined || typeof value.note === 'string')
}

function isSession(value: unknown): value is Session {
  if (!isRecord(value)
    || typeof value.id !== 'string' || value.id.trim() === ''
    || !isLocalDate(value.date)
    || !isTimestamp(value.createdAt)
    || !Array.isArray(value.exercises) || value.exercises.length === 0) {
    return false
  }

  for (const exercise of value.exercises) {
    if (!isExercise(exercise)) return false
  }
  return true
}

function isTemplateExercise(value: unknown): value is TemplateExercise {
  return isRecord(value)
    && typeof value.name === 'string' && value.name.trim() !== ''
    && typeof value.sets === 'number' && Number.isInteger(value.sets) && value.sets > 0
}

function isTemplate(value: unknown): value is Template {
  if (!isRecord(value)
    || typeof value.id !== 'string' || value.id.trim() === ''
    || typeof value.name !== 'string' || value.name.trim() === ''
    || !Array.isArray(value.exercises) || value.exercises.length === 0) {
    return false
  }

  return value.exercises.every(isTemplateExercise)
}

function validateSessions(value: unknown): Session[] {
  if (!Array.isArray(value)) throw new Error('训练记录应为列表。')

  const sessions: Session[] = []
  const ids = new Set<string>()
  for (const [index, session] of value.entries()) {
    if (!isSession(session)) throw new Error(`第 ${index + 1} 条训练记录的字段无效。`)
    if (ids.has(session.id)) throw new Error(`第 ${index + 1} 条训练记录的 ID 重复。`)

    ids.add(session.id)
    sessions.push(session)
  }
  return sessions
}

function validateTemplates(value: unknown): Template[] {
  if (!Array.isArray(value)) throw new Error('训练日应为列表。')

  const templates: Template[] = []
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const [index, template] of value.entries()) {
    if (!isTemplate(template)) throw new Error(`第 ${index + 1} 个训练日的字段无效。`)
    if (ids.has(template.id)) throw new Error(`第 ${index + 1} 个训练日的 ID 重复。`)

    const name = template.name.trim()
    if (names.has(name)) throw new Error(`训练日「${name}」重复。`)

    ids.add(template.id)
    names.add(name)
    templates.push({ ...template, name })
  }
  return templates
}

export function loadDocument(storage: Pick<Storage, 'getItem'>): Document {
  const text = storage.getItem(STORAGE_KEY)
  return text === null ? emptyDocument() : parseBackup(text)
}

export function saveDocument(storage: Pick<Storage, 'setItem'>, document: Document): void {
  storage.setItem(STORAGE_KEY, encodeBackup(document))
}

export function parseBackup(text: string): Document {
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    throw new Error('备份内容不是有效的 JSON。')
  }

  if (!isRecord(document)) throw new Error('无法识别此备份的版本。')

  // 版本 1 只有 sessions，导入后补空模板列表。
  const version = document.schemaVersion
  if (version !== 1 && version !== SCHEMA_VERSION) {
    throw new Error('无法识别此备份的版本。')
  }

  const sessions = validateSessions(document.sessions)
  const templates = version === 1 ? [] : validateTemplates(document.templates)
  return { schemaVersion: SCHEMA_VERSION, sessions, templates }
}

function encodeBackup(document: Document, indent?: number): string {
  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    sessions: validateSessions(document.sessions),
    templates: validateTemplates(document.templates),
  }, null, indent)
}

export function exportBackup(document: Document): string {
  return encodeBackup(document, 2)
}

/**
 * 把早期文档（动作上的 weight + 多余 id）转换成当前格式。
 * 转换结果仍要过一遍 parseBackup 的校验；不合格就返回 null，交由调用方忽略。
 */
export function migrateLegacyDocument(text: string): Session[] | null {
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    return null
  }

  if (!isRecord(document) || document.schemaVersion !== 1 || !Array.isArray(document.sessions)) {
    return null
  }

  const sessions = document.sessions.map((session) => {
    if (!isRecord(session) || !Array.isArray(session.exercises)) return session

    return {
      ...session,
      exercises: session.exercises.map((exercise) => {
        if (!isRecord(exercise) || 'weightKg' in exercise || typeof exercise.weight !== 'number') {
          return exercise
        }
        const note = typeof exercise.note === 'string' && exercise.note.trim() !== '' ? exercise.note : undefined
        return { name: exercise.name, weightKg: exercise.weight, sets: exercise.sets, ...(note ? { note } : {}) }
      }),
    }
  })

  try {
    return parseBackup(JSON.stringify({ schemaVersion: 1, sessions })).sessions
  } catch {
    return null
  }
}

/**
 * 一次性把旧键里的记录并进当前文档，按 id 去重。返回新增的条数。
 * 旧键本身保持原样；导入标记写入后不再重复执行。
 */
export function importLegacySessions(storage: Pick<Storage, 'getItem' | 'setItem'>): number {
  if (storage.getItem(LEGACY_IMPORTED_KEY) !== null) return 0

  const raw = storage.getItem(LEGACY_STORAGE_KEY)
  if (raw === null) return 0

  const migrated = migrateLegacyDocument(raw)
  if (!migrated?.length) return 0

  const current = loadDocument(storage)
  const known = new Set(current.sessions.map((session) => session.id))
  const merged = [...current.sessions, ...migrated.filter((session) => !known.has(session.id))]

  if (merged.length > current.sessions.length) {
    saveDocument(storage, { ...current, sessions: merged })
  }
  storage.setItem(LEGACY_IMPORTED_KEY, '1')
  return merged.length - current.sessions.length
}
