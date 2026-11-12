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

// 日期倒序；同一天按保存顺序倒序，最近保存的排前面。
const history = computed(() => props.sessions
  .map((session, index) => ({ session, index }))
  .sort((left, right) => right.session.date.localeCompare(left.session.date) || right.index - left.index)
  .map(({ session }) => session))

function totalSets(session: Session): number {
  return session.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)
}
</script>

<template>
  <div class="history-main">
    <p v-if="unavailable" class="muted">本机记录暂时无法读取，请先恢复备份。</p>

    <div v-else-if="!history.length" class="empty-state">
      <span class="empty-icon" aria-hidden="true">↗</span>
      <h3>从第一组开始</h3>
      <p>还没有训练记录。记录下今天的训练，<br />让你的第一块足迹亮起来。</p>
      <button type="button" class="button button-outline" @click="emit('create')">＋ 记录训练</button>
    </div>

    <template v-else>
    <article v-for="session in history" :key="session.id" class="history-card">
      <div class="history-date">
        <span class="history-indicator" aria-hidden="true"></span>
        <strong><time :datetime="session.date">{{ formatDateLabel(session.date) }}</time></strong>
        <span class="session-badge">{{ totalSets(session) }} 组</span>
        <div class="history-actions">
          <button type="button" @click="emit('edit', session)">编辑</button>
          <button type="button" @click="emit('remove', session)">删除</button>
        </div>
      </div>
      <div v-for="(exercise, index) in session.exercises" :key="index" class="history-exercise">
        <div>
          <strong>{{ exercise.name }}</strong>
          <p v-if="exercise.note">{{ exercise.note }}</p>
        </div>
        <span>
          {{ exercise.weightKg }} <small>kg</small> <i>×</i> {{ exercise.sets }} <small>组</small>
        </span>
      </div>
    </article>
    </template>
  </div>
</template>

<style scoped>
.history-main { display: grid; gap: 12px; align-content: start; }
.history-card { background: #fff; border: 1px solid #e5eae1; border-radius: 5px; padding: 20px 22px; }
.history-date {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px;
  padding-bottom: 15px;
  border-bottom: 1px solid #eef1eb;
  font-size: 13px;
}
.history-indicator { width: 7px; height: 7px; border-radius: 50%; background: #83aa79; }
.session-badge { background: #edf4e9; color: #6a9064; padding: 4px 8px; font-size: 10px; }
.history-actions { margin-left: auto; display: flex; gap: 10px; }
.history-actions button { border: 0; background: transparent; color: #849281; font-size: 11px; padding: 0; }
.history-actions button:hover { color: #263d2c; }
.history-exercise {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding-top: 16px;
  font-size: 13px;
}
.history-exercise strong { font-weight: 600; }
.history-exercise span { white-space: nowrap; font-weight: 600; }
.history-exercise small { color: #9ba799; font-size: 10px; font-weight: 400; }
.history-exercise i { font-style: normal; color: #b4bdb1; margin: 0 3px; }
.history-exercise p { margin: 6px 0 0; color: #9ba799; font-size: 11px; }
.empty-state {
  text-align: center;
  padding: 48px 20px 51px;
  background: #fff;
  border: 1px solid #e5eae1;
  border-radius: 5px;
}
.empty-icon {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  margin: 0 auto 15px;
  background: #edf3e9;
  color: #71936c;
  font-size: 23px;
}
.empty-state h3 { font-size: 16px; margin: 0; }
.empty-state p { font-size: 12px; line-height: 1.9; color: #9aa598; margin: 12px 0 18px; }
</style>
