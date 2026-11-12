export type Exercise = { id: string; name: string; weight: number; sets: number; note: string }
export type Session = { id: string; date: string; createdAt: string; exercises: Exercise[] }
export type Document = { schemaVersion: 1; sessions: Session[] }

export function localDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function latestWeight(sessions: Session[], name: string, date: string): number | undefined {
  const target = name.trim().toLocaleLowerCase()
  if (!target) return undefined
  let latest: Session | undefined
  let result: number | undefined
  for (const session of sessions) {
    if (session.date > date) continue
    const exercise = session.exercises.find(item => item.name.trim().toLocaleLowerCase() === target)
    if (!exercise) continue
    if (!latest || session.date > latest.date || (session.date === latest.date && Date.parse(session.createdAt) >= Date.parse(latest.createdAt))) {
      latest = session
      result = exercise.weight
    }
  }
  return result
}

export function dailyTotals(sessions: Session[]): Record<string, number> {
  const totals: Record<string, number> = Object.create(null) as Record<string, number>
  for (const session of sessions) {
    totals[session.date] = (totals[session.date] ?? 0) + session.exercises.reduce((sum, item) => sum + item.sets, 0)
  }
  return totals
}
