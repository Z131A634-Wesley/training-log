import { afterEach, describe, expect, it, vi } from 'vitest'
import { dailyTotals, latestWeight, localDate, type Session } from './domain'
import { load, parseBackup, save, serializeBackup, STORAGE_KEY } from './storage'

const session = (id: string, date: string, createdAt: string, weight: number, sets = 3): Session => ({
  id, date, createdAt, exercises: [{ id: `exercise-${id}`, name: '划船', weight, sets, note: '末组 35 kg × 12 次' }],
})

describe('训练记录', () => {
  const records = [session('a', '2026-01-01', '2026-01-01T10:00:00.000Z', 40, 4), session('b', '2026-01-01', '2026-01-01T11:00:00.000Z', 42.5, 3), session('c', '2026-02-01', '2026-02-01T10:00:00.000Z', 50)]
  it('按训练日期与保存顺序继承起始重量，并忽略未来记录和备注', () => {
    expect(latestWeight(records, '划船', '2026-01-01')).toBe(42.5)
    expect(latestWeight(records, '划船', '2025-12-31')).toBeUndefined()
    expect(latestWeight(records, '不存在', '2026-02-01')).toBeUndefined()
  })
  it('按本地日期合计一天的多次训练', () => {
    expect(dailyTotals(records)['2026-01-01']).toBe(7)
    expect(localDate(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01')
  })
  it('同日不同 UTC 时区的时间戳按实际时间排序', () => {
    const items = [session('a', '2026-01-01', '2026-01-01T09:00:00+08:00', 40), session('b', '2026-01-01', '2026-01-01T02:00:00Z', 45)]
    expect(latestWeight(items, '划船', '2026-01-01')).toBe(45)
  })
  it('备份往返并拒绝损坏、未知版本或无效动作', () => {
    const document = { schemaVersion: 1 as const, sessions: records }
    expect(parseBackup(serializeBackup(document))).toEqual(document)
    expect(() => parseBackup('{')).toThrow()
    expect(() => parseBackup(JSON.stringify({ ...document, schemaVersion: 2 }))).toThrow()
    expect(() => parseBackup(JSON.stringify({ schemaVersion: 1, sessions: [session('x', '2026-01-01', 'bad', -1)] }))).toThrow()
  })
})

describe('浏览器存储', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('损坏的数据不能被加载过程覆盖', () => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem: () => '{', setItem })
    expect(() => load()).toThrow()
    expect(setItem).not.toHaveBeenCalled()
  })
  it('写入失败向调用方报告，并保留原值', () => {
    let stored = '旧数据'
    vi.stubGlobal('localStorage', { getItem: () => stored, setItem: () => { throw new Error('quota') } })
    expect(() => save({ schemaVersion: 1, sessions: [] })).toThrow('quota')
    expect(stored).toBe('旧数据')
    expect(STORAGE_KEY).toBe('training-log:v1')
  })
})
