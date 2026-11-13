export interface Exercise {
  name: string
  weightKg: number
  sets: number
  note?: string
}

export interface Session {
  id: string
  date: string
  createdAt: string
  exercises: Exercise[]
}

/** 训练日模板：一组固定的动作和组数，重量每次按历史带出。 */
export interface TemplateExercise {
  name: string
  sets: number
}

export interface Template {
  id: string
  name: string
  exercises: TemplateExercise[]
}

/** 最近一次训练：日期最新，同一天按保存时间最新。 */
export function latestSession(sessions: readonly Session[]): Session | undefined {
  let latest: Session | undefined
  for (const session of sessions) {
    const newer = !latest
      || session.date > latest.date
      || (session.date === latest.date && Date.parse(session.createdAt) >= Date.parse(latest.createdAt))
    if (newer) latest = session
  }
  return latest
}

/**
 * 起始重量：取训练日期当天或之前、最近一次已保存的起始重量。
 * 同一天有多次训练时按保存时间（createdAt）取最近的一次，
 * 这样即使记录被重新排序或导入，结果也不会变。备注不参与计算。
 */
export function defaultWeight(
  sessions: readonly Session[],
  name: string,
  date: string,
): number | undefined {
  const target = name.trim()
  if (!target) return undefined

  let latest: Session | undefined
  let weight: number | undefined

  for (const session of sessions) {
    if (session.date > date) continue

    const exercise = session.exercises.find((item) => item.name.trim() === target)
    if (!exercise) continue

    const isNewer = !latest
      || session.date > latest.date
      || (session.date === latest.date && Date.parse(session.createdAt) >= Date.parse(latest.createdAt))

    if (isNewer) {
      latest = session
      weight = exercise.weightKg
    }
  }

  return weight
}

/** 历史动作名，去掉首尾空格后去重。 */
export function exerciseNames(sessions: readonly Session[]): string[] {
  const names = new Set<string>()
  for (const session of sessions) {
    for (const exercise of session.exercises) names.add(exercise.name.trim())
  }
  return [...names]
}

/** 按本地日期汇总当天所有训练的组数。 */
export function dailySets(sessions: readonly Session[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const session of sessions) {
    const count = session.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)
    totals.set(session.date, (totals.get(session.date) ?? 0) + count)
  }
  return totals
}
