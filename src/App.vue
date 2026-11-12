<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import TrainingBackup from './components/TrainingBackup.vue'
import TrainingForm from './components/TrainingForm.vue'
import TrainingHeatmap from './components/TrainingHeatmap.vue'
import TrainingHistory from './components/TrainingHistory.vue'
import { formatDateLabel, heatmapWeeks, localDate } from './domain/dates'
import type { Exercise, Session } from './domain/training'
import { loadSessions, saveSessions, STORAGE_KEY } from './storage/training-storage'
import { reveal as vReveal } from './ui/reveal'

const sessions = ref<Session[]>([])
const storageError = ref('')
const writeError = ref('')
const status = ref('')
const writing = ref(false)
const editing = ref<Session | null>(null)
const formOpen = ref(false)
const formDate = ref(localDate())
const formKey = ref(0)
const formHeading = ref<HTMLHeadingElement>()
const editor = ref<HTMLElement>()
const selectedDate = ref(localDate())
let storageBaseline: string | null | undefined
let statusTimer: ReturnType<typeof setTimeout> | undefined

class StorageConflict extends Error {}

try {
  const storage = window.localStorage
  sessions.value = loadSessions({
    getItem(key) {
      storageBaseline = storage.getItem(key)
      return storageBaseline
    },
  })
} catch {
  storageError.value = '无法读取本机的训练记录。原数据已保留，请从备份恢复后再保存新训练。'
}

const selectedSessions = computed(() => sessions.value
  .filter((session) => session.date === selectedDate.value)
  .reverse())
const selectedSets = computed(() => selectedSessions.value
  .reduce((sum, session) => sum + session.exercises.reduce((total, exercise) => total + exercise.sets, 0), 0))

const weekCount = computed(() => {
  const monday = heatmapWeeks(localDate()).at(-1)![0]!
  return sessions.value.filter((session) => session.date >= monday).length
})
const totalSets = computed(() => sessions.value
  .reduce((sum, session) => sum + session.exercises.reduce((total, exercise) => total + exercise.sets, 0), 0))
const latestDate = computed(() => sessions.value.reduce((max, session) => (session.date > max ? session.date : max), ''))
const lastLabel = computed(() => (latestDate.value ? shortDate(latestDate.value) : '还没有记录'))
const todayLabel = new Intl.DateTimeFormat('zh-CN', {
  month: 'long', day: 'numeric', weekday: 'short',
}).format(new Date())

function shortDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' })
    .format(new Date(year!, month! - 1, day!))
}

watch(status, (value) => {
  if (statusTimer) clearTimeout(statusTimer)
  if (!value) return
  statusTimer = setTimeout(() => { status.value = '' }, 4000)
})
onUnmounted(() => { if (statusTimer) clearTimeout(statusTimer) })

async function persist(next: Session[]): Promise<boolean> {
  if (writing.value) return false
  writing.value = true
  writeError.value = ''
  try {
    if (storageBaseline === undefined) throw new Error('无法确定浏览器存储的原始内容。')
    const storage = window.localStorage
    const write = () => saveSessions({
      setItem(key, value) {
        // 另一个标签页已改过记录时拒绝覆盖，草稿留在表单里。
        if (storage.getItem(key) !== storageBaseline) throw new StorageConflict()
        storage.setItem(key, value)
        storageBaseline = value
      },
    }, next)
    if (navigator.locks) await navigator.locks.request(STORAGE_KEY, write)
    else write()
    sessions.value = next
    return true
  } catch (error) {
    writeError.value = error instanceof StorageConflict
      ? '其他页面已更改训练记录，本次更改未保存。请先记下尚未保存的内容，再刷新页面重试。'
      : '无法写入浏览器存储，本次更改未保存。请检查浏览器存储空间或权限后重试。'
    return false
  } finally {
    writing.value = false
  }
}

function focusForm() {
  void nextTick(() => {
    editor.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    formHeading.value?.focus({ preventScroll: true })
  })
}

function openForm(day = localDate()) {
  if (storageError.value || writing.value) return
  editing.value = null
  formDate.value = day
  formKey.value++
  formOpen.value = true
  writeError.value = ''
  status.value = ''
  focusForm()
}

function closeForm() {
  if (writing.value) return
  formOpen.value = false
  editing.value = null
  writeError.value = ''
  formKey.value++
}

function editTraining(session: Session) {
  if (storageError.value || writing.value) return
  editing.value = session
  formDate.value = session.date
  formKey.value++
  formOpen.value = true
  writeError.value = ''
  status.value = ''
  focusForm()
}

async function saveTraining(date: string, exercises: Exercise[]) {
  if (storageError.value || writing.value) return
  status.value = ''
  const original = editing.value
  if (original) {
    const next = sessions.value.map((session) =>
      session.id === original.id ? { ...session, date, exercises } : session)
    if (!await persist(next)) return
    status.value = '训练已更新。'
  } else {
    const session: Session = { id: crypto.randomUUID(), date, createdAt: new Date().toISOString(), exercises }
    if (!await persist([...sessions.value, session])) return
    status.value = '训练已保存。'
  }
  selectedDate.value = date
  formOpen.value = false
  editing.value = null
  formKey.value++
}

async function removeTraining(session: Session) {
  if (storageError.value || writing.value) return
  if (!window.confirm(`确定删除 ${formatDateLabel(session.date)} 的这次训练吗？此操作无法撤销。`)) return
  status.value = ''
  if (!await persist(sessions.value.filter((item) => item.id !== session.id))) return
  if (editing.value?.id === session.id) closeForm()
  status.value = '训练已删除。'
}

async function restoreTraining(next: Session[]): Promise<boolean> {
  if (!await persist(next)) return false
  storageError.value = ''
  selectedDate.value = next.at(-1)?.date ?? localDate()
  formOpen.value = false
  editing.value = null
  formKey.value++
  status.value = '备份已恢复。'
  return true
}
</script>

<template>
  <div class="page">
    <header class="nav">
      <div class="shell nav-inner">
        <a class="brand" href="#main">训练日志</a>
        <div class="nav-right">
          <span class="nav-date micro">{{ todayLabel }}</span>
          <button type="button" class="button button--primary"
            :disabled="Boolean(storageError) || writing" @click="openForm()">
            记录训练
          </button>
        </div>
      </div>
    </header>

    <main id="main" class="shell">
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <h1 id="hero-title" class="display">每一次训练，都算数。</h1>
          <p class="lead">记录动作、重量和组数，在热力图里看见积累。</p>
          <button type="button" class="button button--primary button--lg"
            :disabled="Boolean(storageError) || writing" @click="openForm()">
            记录一次训练
          </button>
        </div>
        <dl class="hero-stats">
          <div><dt>本周</dt><dd><b>{{ weekCount }}</b> 次</dd></div>
          <div><dt>累计</dt><dd><b>{{ totalSets }}</b> 组</dd></div>
          <div><dt>最近一次</dt><dd>{{ lastLabel }}</dd></div>
        </dl>
      </section>

      <div v-if="status" class="banner" role="status">
        <span>{{ status }}</span>
        <button type="button" aria-label="关闭提示" @click="status = ''">×</button>
      </div>
      <div v-if="storageError" class="banner banner--error" role="alert">{{ storageError }}</div>

      <Transition name="panel">
        <section v-if="formOpen" ref="editor" class="panel form-panel" aria-labelledby="editor-title">
          <div class="section-head">
            <h2 id="editor-title" ref="formHeading" tabindex="-1">{{ editing ? '编辑训练' : '记录训练' }}</h2>
            <button type="button" class="link" @click="closeForm">关闭</button>
          </div>
          <TrainingForm :key="formKey" :sessions="sessions" :editing="editing"
            :disabled="Boolean(storageError) || writing" :initial-date="formDate"
            @save="saveTraining" @cancel="closeForm" />
          <p v-if="writeError" class="banner banner--error" role="alert">{{ writeError }}</p>
        </section>
      </Transition>

      <TrainingHeatmap v-reveal :sessions="sessions" :selected="selectedDate"
        :unavailable="Boolean(storageError)" @select="selectedDate = $event" />

      <section v-reveal class="history" aria-labelledby="history-title">
        <div class="section-head">
          <h2 id="history-title">训练记录</h2>
          <span class="micro">共 {{ sessions.length }} 次</span>
        </div>

        <div class="history-layout">
          <TrainingHistory :sessions="sessions" :unavailable="Boolean(storageError)"
            @edit="editTraining" @remove="removeTraining" @create="openForm()" />

          <aside class="aside">
            <div class="day-card">
              <p class="micro">选中日期</p>
              <h3>{{ formatDateLabel(selectedDate) }}</h3>
              <p class="figure"><b>{{ selectedSets }}</b> 组 · {{ selectedSessions.length }} 次训练</p>
              <ul v-if="selectedSessions.length">
                <li v-for="session in selectedSessions" :key="session.id">
                  <span>{{ session.exercises.map((exercise) => exercise.name).join('、') }}</span>
                  <span>{{ session.exercises.reduce((sum, exercise) => sum + exercise.sets, 0) }} 组</span>
                </li>
              </ul>
              <p v-else class="small muted day-empty">这一天还没有训练。</p>
              <button type="button" class="link" :disabled="Boolean(storageError) || writing"
                @click="openForm(selectedDate)">
                为这一天补记
              </button>
            </div>
          </aside>
        </div>
      </section>

      <TrainingBackup v-reveal :sessions="sessions" :unavailable="Boolean(storageError)"
        :restore="restoreTraining" />
    </main>

    <footer class="footer">
      <div class="shell footer-inner">
        <span>训练日志 · 数据保存在这台设备</span>
        <span>{{ new Date().getFullYear() }}</span>
      </div>
    </footer>
  </div>
</template>
