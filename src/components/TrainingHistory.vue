<script setup lang="ts">
import { computed } from 'vue'
import { formatDateLabel } from '../domain/dates'
import type { Session } from '../domain/training'

const props = defineProps<{
  sessions: readonly Session[]
  unavailable: boolean
}>()

const emit = defineEmits<{
  edit: [session: Session]
  remove: [session: Session]
  create: []
}>()

function setCount(session: Session): number {
  return session.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)
}

function formatTime(createdAt: string): string {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(createdAt))
}

// 按日期分组，日期倒序；同一天内按保存时间倒序。
const groups = computed(() => {
  const byDate = new Map<string, Session[]>()
  for (const session of props.sessions) {
    const list = byDate.get(session.date)
    if (list) list.push(session)
    else byDate.set(session.date, [session])
  }

  return [...byDate.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([date, list]) => ({
      date,
      sessions: [...list].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      sets: list.reduce((sum, session) => sum + setCount(session), 0),
    }))
})
</script>

<template>
  <div class="log">
    <p v-if="unavailable" class="small muted">本机记录暂时无法读取，请先恢复备份。</p>

    <div v-else-if="!groups.length" class="empty">
      <p class="small">还没有训练记录。记下第一组，热力图上就会亮起一格。</p>
      <button type="button" class="link" @click="emit('create')">记录第一次训练</button>
    </div>

    <template v-else>
      <article v-for="group in groups" :key="group.date" class="day">
        <header class="day-head">
          <h3>
            <time :datetime="group.date">{{ formatDateLabel(group.date) }}</time>
          </h3>
          <span class="badge">{{ group.sets }} 组</span>
        </header>

        <div v-for="session in group.sessions" :key="session.id" class="session">
          <div class="session-meta">
            <span class="micro">{{ formatTime(session.createdAt) }}</span>
            <div class="session-actions">
              <button type="button" class="link" @click="emit('edit', session)">编辑</button>
              <button type="button" class="link" @click="emit('remove', session)">删除</button>
            </div>
          </div>

          <ul class="rows">
            <li v-for="(exercise, index) in session.exercises" :key="index" class="row">
              <div class="row-text">
                <span class="row-name">{{ exercise.name }}</span>
                <span v-if="exercise.note" class="row-note">{{ exercise.note }}</span>
              </div>
              <span class="row-figure">{{ exercise.weightKg }} kg × {{ exercise.sets }} 组</span>
            </li>
          </ul>
        </div>
      </article>
    </template>
  </div>
</template>

<style scoped>
.log { display: grid; gap: var(--space-5); }

.day { padding-top: var(--space-4); border-top: 1px solid var(--line); }
.day-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.day-head h3 { font-size: 20px; line-height: 1.4; font-weight: 600; letter-spacing: -0.01em; }
.day-head time { font-variant-numeric: tabular-nums; }

.session + .session {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px dashed var(--line);
}
.session-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}
.session-actions { display: flex; gap: var(--space-3); }

.rows { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);
}
.row-name { font-size: 15px; font-weight: 500; }
.row-note { display: block; margin-top: 2px; font-size: 13px; color: var(--ink-3); }
.row-figure { font-size: 13px; color: var(--ink-2); white-space: nowrap; }

.empty { display: grid; gap: var(--space-3); justify-items: start; padding-block: var(--space-6); }

@media (max-width: 720px) {
  .day-head h3 { font-size: 17px; }
  .row { gap: var(--space-3); }
}
</style>
