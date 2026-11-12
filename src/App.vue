<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { dailyTotals, latestWeight, localDate, type Document as WorkoutDocument, type Session } from './domain'
import { load, save, parseBackup, serializeBackup } from './storage'

type DraftExercise = { id: string; name: string; weight: number | null; sets: number; note: string; existing: boolean; weightEdited: boolean }
const emptyDocument = (): WorkoutDocument => ({ schemaVersion: 1, sessions: [] })
const data = ref<WorkoutDocument>(emptyDocument())
const storageProblem = ref('')
const notice = ref('')
const formError = ref('')
const editingId = ref<string | null>(null)
const formOpen = ref(false)
const date = ref(localDate(new Date()))
const today = ref(localDate(new Date()))
const draft = ref<DraftExercise[]>([])
const selectedDate = ref(today.value)
const heatmap = ref<HTMLElement | null>(null)
const dayDetail = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const pendingBackup = ref<WorkoutDocument | null>(null)
const backupName = ref('')
const id = () => crypto.randomUUID()
const newExercise = (): DraftExercise => ({ id: id(), name: '', weight: null, sets: 3, note: '', existing: false, weightEdited: false })
try { data.value = load() } catch { storageProblem.value = '无法读取本地记录。原数据仍被保留，请导入有效备份恢复。' }

const sortedSessions = computed(() => [...data.value.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)))
const exerciseNames = computed(() => [...new Set(data.value.sessions.flatMap(s => s.exercises.map(e => e.name)))].sort((a, b) => a.localeCompare(b, 'zh-CN')))
const totals = computed(() => dailyTotals(data.value.sessions))
const selectedSessions = computed(() => sortedSessions.value.filter(s => s.date === selectedDate.value))
const totalSets = computed(() => Object.values(totals.value).reduce((sum, n) => sum + n, 0))
function selectDay(day: string) {
  selectedDate.value = day
  nextTick(() => dayDetail.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
}
const recentDays = computed(() => Object.keys(totals.value).filter(d => (totals.value[d] ?? 0) > 0).length)
const heatWeeks = computed(() => {
  const [year, month, dayOfMonth] = today.value.split('-').map(Number)
  const now = new Date(year!, month! - 1, dayOfMonth!)
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) - 51 * 7)
  return Array.from({ length: 52 }, (_, week) => Array.from({ length: 7 }, (_, day) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + week * 7 + day)
    const key = localDate(d)
    return { key, future: key > today.value, count: totals.value[key] ?? 0, day: d.getDate(), month: d.getMonth() + 1 }
  }))
})
const level = (n: number) => n === 0 ? 0 : n <= 5 ? 1 : n <= 10 ? 2 : n <= 15 ? 3 : 4
function daySummary(key: string, count: number): string {
  const sessions = sortedSessions.value.filter(session => session.date === key)
  const details = sessions.flatMap(session => session.exercises.map(exercise =>
    `${exercise.name} ${exercise.weight} kg × ${exercise.sets} 组${exercise.note ? '（' + exercise.note + '）' : ''}`))
  return `${key} · ${count} 组${details.length ? '\n' + details.join('\n') : ' · 未记录训练'}`
}
const formatDate = (value: string) => {
  const [y, m, d] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(y!, m! - 1, d!))
}
function startNew(day = today.value) {
  editingId.value = null; date.value = day; draft.value = [newExercise()]
  formError.value = ''; formOpen.value = true
}
function editSession(session: Session) {
  editingId.value = session.id; date.value = session.date
  draft.value = session.exercises.map(e => ({ ...e, existing: true, weightEdited: false }))
  formError.value = ''; formOpen.value = true
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
function fillWeight(item: DraftExercise) {
  if (item.existing) return
  item.weightEdited = false
  if (!item.name.trim()) { item.weight = null; return }
  const weight = latestWeight(data.value.sessions, item.name.trim(), date.value)
  item.weight = weight ?? null
}
watch(date, () => {
  for (const item of draft.value) {
    if (!item.existing && !item.weightEdited && item.name.trim()) {
      item.weight = latestWeight(data.value.sessions, item.name.trim(), date.value) ?? null
    }
  }
}, { flush: 'sync' })
function commit(next: WorkoutDocument): boolean {
  try { save(next); data.value = next; storageProblem.value = ''; return true }
  catch { notice.value = '保存失败，请检查浏览器存储空间或权限后重试。'; return false }
}
function saveSession() {
  formError.value = ''
  if (storageProblem.value) { formError.value = '请先导入备份恢复本地数据，避免覆盖原记录。'; return }
  if (!date.value || date.value > today.value) { formError.value = '请选择今天或之前的日期。'; return }
  if (!draft.value.length || draft.value.some(e => !e.name.trim() || e.weight === null || !Number.isFinite(Number(e.weight)) || Number(e.weight) < 0 || !Number.isInteger(Number(e.sets)) || Number(e.sets) < 1)) {
    formError.value = '请填写每个动作的名称、非负重量和至少 1 组。'; return
  }
  const old = data.value.sessions.find(s => s.id === editingId.value)
  const session: Session = {
    id: old?.id ?? id(), date: date.value, createdAt: old?.createdAt ?? new Date().toISOString(),
    exercises: draft.value.map(e => ({ id: e.id, name: e.name.trim(), weight: Number(e.weight), sets: Number(e.sets), note: e.note.trim() }))
  }
  const sessions = old ? data.value.sessions.map(s => s.id === old.id ? session : s) : [...data.value.sessions, session]
  if (commit({ schemaVersion: 1, sessions })) {
    formOpen.value = false; selectedDate.value = session.date; notice.value = '训练记录已保存。'
  } else formError.value = '保存失败，填写的内容仍在这里，请重试。'
}
function removeSession(session: Session) {
  if (!window.confirm('确定删除这次训练记录吗？此操作无法撤销。')) return
  if (commit({ schemaVersion: 1, sessions: data.value.sessions.filter(s => s.id !== session.id) })) notice.value = '训练记录已删除。'
}
function exportBackup() {
  try {
    const url = URL.createObjectURL(new Blob([serializeBackup(data.value)], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `训练日志-${today.value}.json`; anchor.click()
    URL.revokeObjectURL(url)
  } catch { notice.value = '导出失败，请重试。' }
}
async function chooseBackup(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try { pendingBackup.value = parseBackup(await file.text()); backupName.value = file.name; notice.value = '' }
  catch { pendingBackup.value = null; notice.value = '备份文件无效或版本不受支持，原记录未更改。' }
  input.value = ''
}
function importBackup() {
  if (!pendingBackup.value) return
  if (commit(pendingBackup.value)) { pendingBackup.value = null; notice.value = '备份已恢复。' }
}
const refreshToday = () => { today.value = localDate(new Date()) }
let refreshTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  refreshTimer = setInterval(refreshToday, 60_000)
  document.addEventListener('visibilitychange', refreshToday)
  nextTick(() => { if (heatmap.value) heatmap.value.scrollLeft = heatmap.value.scrollWidth })
})
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  document.removeEventListener('visibilitychange', refreshToday)
})
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="训练日志首页"><span class="brand-mark">↗</span><span>TRAINING <b>LOG</b></span></a>
      <span class="topbar-note">为每一次坚持，留个记录。</span>
      <button class="button button-dark top-add" @click="startNew()">＋ <span>记录训练</span></button>
    </header>
    <main class="container">
      <div v-if="notice" class="notice" role="status">{{ notice }} <button aria-label="关闭提示" @click="notice = ''">×</button></div>
      <div v-if="storageProblem" class="alert" role="alert">{{ storageProblem }}</div>
      <section class="hero">
        <div><p class="eyebrow"><span class="status-dot"></span> YOUR TRAINING JOURNAL</p><h1>每一次训练，<br><em>都算数。</em></h1><p class="hero-copy">记录当下的努力，<br class="mobile-only">看见慢慢积累的改变。</p><button class="button button-dark hero-button" @click="startNew()">记录一次训练 <span>↗</span></button></div>
        <div class="hero-aside"><span>CONSISTENCY<br>OVER INTENSITY</span><strong>01<span>/</span>52</strong><small>KEEP SHOWING UP</small></div>
      </section>

      <section v-if="formOpen" class="panel editor" aria-labelledby="editor-title">
        <div class="section-heading"><div><p class="eyebrow">YOUR SESSION</p><h2 id="editor-title">{{ editingId ? '编辑训练' : '记录训练' }}</h2></div><button class="icon-button" aria-label="关闭表单" @click="formOpen = false">×</button></div>
        <form @submit.prevent="saveSession">
          <label class="field date-field"><span>训练日期</span><input v-model="date" type="date" :max="today" required></label>
          <div class="exercise-list">
            <article v-for="(item, index) in draft" :key="item.id" class="exercise-card">
              <div class="exercise-head"><span class="exercise-number">{{ String(index + 1).padStart(2, '0') }}</span><span>训练动作</span><button type="button" class="text-button remove" @click="draft.splice(index, 1)">移除</button></div>
              <div class="exercise-grid">
                <label class="field exercise-name"><span>动作名称</span><input v-model="item.name" list="exercise-names" placeholder="例如：杠铃卧推" required @change="fillWeight(item)"></label>
                <label class="field"><span>起始重量 <small>kg</small></span><input v-model.number="item.weight" type="number" min="0" step="any" placeholder="0" required @input="item.weightEdited = true"></label>
                <label class="field"><span>组数</span><span class="stepper"><button type="button" aria-label="减少组数" @click="item.sets = Math.max(1, Number(item.sets) - 1)">−</button><input v-model.number="item.sets" type="number" min="1" step="1" aria-label="组数" required><button type="button" aria-label="增加组数" @click="item.sets = Number(item.sets || 0) + 1">＋</button></span></label>
                <label class="field note-field"><span>备注 <small>选填</small></span><input v-model="item.note" placeholder="例如：最后一组 35 kg × 12 次"></label>
              </div>
            </article>
          </div>
          <datalist id="exercise-names"><option v-for="name in exerciseNames" :key="name" :value="name" /></datalist>
          <button type="button" class="add-exercise" @click="draft.push(newExercise())">＋ 添加动作</button>
          <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
          <div class="form-actions"><button type="button" class="button button-quiet" @click="formOpen = false">取消</button><button type="submit" class="button button-dark">保存训练 <span>↗</span></button></div>
        </form>
      </section>

      <section class="panel activity">
        <div class="section-heading activity-heading"><div><p class="eyebrow">THE BIG PICTURE</p><h2>训练足迹<span class="heading-dot">.</span></h2><p class="section-copy">每个小方块，都是你为自己留下的印记。</p></div><span class="period-badge">最近 52 周 <span>↗</span></span></div>
        <div class="heatmap-wrap"><div class="weekdays"><span>一</span><span>三</span><span>五</span><span>日</span></div><div ref="heatmap" class="heatmap-scroll"><div class="heatmap-months"><span v-for="(week, i) in heatWeeks" :key="i">{{ week.find(d => d.day === 1) ? week.find(d => d.day === 1)?.month + '月' : i === 0 ? week[0]?.month + '月' : '' }}</span></div><div class="heatmap-grid"><div v-for="(week, i) in heatWeeks" :key="i" class="heat-week"><button v-for="day in week" :key="day.key" type="button" class="heat-cell" :class="['level-' + level(day.count), { future: day.future, selected: day.key === selectedDate }]" :disabled="day.future" :title="daySummary(day.key, day.count)" :aria-label="daySummary(day.key, day.count)" @focus="selectedDate = day.key" @click="selectDay(day.key)" /></div></div></div></div>
        <div class="heat-footer"><span>点击方块查看当天训练</span><div class="legend"><span>较少</span><i v-for="n in 5" :key="n" :class="'level-' + (n - 1)"></i><span>较多</span></div></div>
        <div class="stats"><div><strong>{{ recentDays }}</strong><span>累计训练天数</span></div><div><strong>{{ data.sessions.length }}</strong><span>累计训练次数</span></div><div><strong>{{ totalSets }}</strong><span>累计完成组数</span></div></div>
      </section>

      <section class="history-section">
        <div class="section-heading"><div><p class="eyebrow">YOUR PROGRESS</p><h2>训练记录<span class="heading-dot">.</span></h2><p class="section-copy">回头看看，你已经走了多远。</p></div><button class="button button-outline" @click="startNew()">＋ 新增记录</button></div>
        <div class="history-layout">
          <div class="history-main">
            <div v-if="!sortedSessions.length" class="empty-state"><span class="empty-icon">↗</span><h3>从第一组开始</h3><p>还没有训练记录。记录下今天的训练，<br>让你的第一块足迹亮起来。</p><button class="button button-outline" @click="startNew()">＋ 记录训练</button></div>
            <template v-else><article v-for="session in sortedSessions" :key="session.id" class="history-card"><div class="history-date"><span class="history-indicator"></span><strong>{{ formatDate(session.date) }}</strong><span class="session-badge">{{ session.exercises.reduce((sum, e) => sum + e.sets, 0) }} 组</span><div class="history-actions"><button @click="editSession(session)">编辑</button><button @click="removeSession(session)">删除</button></div></div><div v-for="exercise in session.exercises" :key="exercise.id" class="history-exercise"><div><strong>{{ exercise.name }}</strong><p v-if="exercise.note">{{ exercise.note }}</p></div><span>{{ exercise.weight }} <small>kg</small> <i>×</i> {{ exercise.sets }} <small>组</small></span></div></article></template>
          </div>
          <aside class="side-column"><div ref="dayDetail" class="side-card day-card"><p class="eyebrow">SELECTED DAY</p><h3>{{ formatDate(selectedDate) }}</h3><template v-if="selectedSessions.length"><p class="day-total">当天共 {{ totals[selectedDate] }} 组 · {{ selectedSessions.length }} 次训练</p><div v-for="session in selectedSessions" :key="session.id" class="day-session"><p v-for="exercise in session.exercises" :key="exercise.id"><strong>{{ exercise.name }}</strong> {{ exercise.weight }} kg × {{ exercise.sets }} 组 <small v-if="exercise.note">{{ exercise.note }}</small></p></div></template><p v-else class="muted">这一天还没有训练记录。</p><button v-if="selectedDate <= today" class="text-link" @click="startNew(selectedDate)">为这一天添加记录 ↗</button></div>
            <div class="side-card backup-card"><div class="backup-icon">↓</div><p class="eyebrow">YOUR DATA, YOURS</p><h3>好好保存每一步</h3><p class="muted">数据保存在当前浏览器。定期导出备份，换设备也能找回记录。</p><div class="backup-actions"><button @click="exportBackup" :disabled="!!storageProblem">导出备份 ↗</button><button @click="fileInput?.click()">导入备份 ↗</button><input ref="fileInput" class="visually-hidden" type="file" accept=".json,application/json" @change="chooseBackup"></div></div></aside>
        </div>
      </section>
    </main>
    <footer class="footer"><span>TRAINING LOG <b>↗</b></span><span>为自己，一直练下去。</span></footer>
    <div v-if="pendingBackup" class="modal-backdrop" @click.self="pendingBackup = null"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><p class="eyebrow">RESTORE BACKUP</p><h2 id="import-title">恢复训练记录？</h2><p>备份「{{ backupName }}」包含 <strong>{{ pendingBackup.sessions.length }}</strong> 次训练。导入将替换当前浏览器中的全部记录，建议先导出备份。</p><div class="form-actions"><button class="button button-quiet" @click="pendingBackup = null">取消</button><button class="button button-dark" @click="importBackup">确认导入</button></div></div></div>
  </div>
</template>
