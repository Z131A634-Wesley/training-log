export function localDate(date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isLocalDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) {
    return false
  }

  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** 最近 52 个自然周，每周从周一开始，最后一列是包含 `today` 的那一周。 */
export function heatmapWeeks(today: string): string[][] {
  // 'today' already represents the user's local day. UTC is only used for
  // calendar arithmetic on that label so DST cannot shift or repeat a cell.
  const day = new Date(`${today}T00:00:00Z`)
  const daysSinceMonday = (day.getUTCDay() + 6) % 7
  day.setUTCDate(day.getUTCDate() - daysSinceMonday - 51 * 7)

  return Array.from({ length: 52 }, () => Array.from({ length: 7 }, () => {
    const date = day.toISOString().slice(0, 10)
    day.setUTCDate(day.getUTCDate() + 1)
    return date
  }))
}

/** 「2026年11月12日周四」，用本地日历日构造，避免 UTC 偏移。 */
export function formatDateLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(year!, month! - 1, day!))
}
