<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import TrainingBackup from './components/TrainingBackup.vue'
import TrainingForm from './components/TrainingForm.vue'
import TrainingHeatmap from './components/TrainingHeatmap.vue'
import TrainingHistory from './components/TrainingHistory.vue'
import { formatDateLabel, localDate } from './domain/dates'
import type { Exercise, Session } from './domain/training'
import { loadSessions, saveSessions, STORAGE_KEY } from './storage/training-storage'

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
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="训练日志首页">
        <span class="brand-mark" aria-hidden="true">↗</span>
        <span>TRAINING <b>LOG</b></span>
      </a>
      <span class="topbar-note">为每一次坚持，留个记录。</span>
      <button type="button" class="button button-dark top-add" :disabled="Boolean(storageError) || writing"
        @click="openForm()">
        ＋ <span>记录训练</span>
      </button>
    </header>

    <main class="container">
      <div v-if="status" class="notice" role="status">
        {{ status }}
        <button type="button" aria-label="关闭提示" @click="status = ''">×</button>
      </div>
      <div v-if="storageError" class="alert" role="alert">{{ storageError }}</div>

      <section class="hero" aria-labelledby="hero-title">
        <div>
          <p class="eyebrow"><span class="status-dot" aria-hidden="true"></span> YOUR TRAINING JOURNAL</p>
          <h1 id="hero-title">每一次训练，<br /><em>都算数。</em></h1>
          <p class="hero-copy">记录当下的努力，<br class="mobile-only" />看见慢慢积累的改变。</p>
          <button type="button" class="button button-dark hero-button" :disabled="Boolean(storageError) || writing"
            @click="openForm()">
            记录一次训练 <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div class="hero-aside" aria-hidden="true">
          <span>CONSISTENCY<br />OVER INTENSITY</span>
          <strong>01<span>/</span>52</strong>
          <small>KEEP SHOWING UP</small>
        </div>
      </section>

      <section v-if="formOpen" ref="editor" class="panel editor" aria-labelledby="editor-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">YOUR SESSION</p>
            <h2 id="editor-title" ref="formHeading" tabindex="-1">{{ editing ? '编辑训练' : '记录训练' }}</h2>
          </div>
          <button type="button" class="icon-button" aria-label="关闭表单" @click="closeForm">×</button>
        </div>
        <TrainingForm :key="formKey" :sessions="sessions" :editing="editing"
          :disabled="Boolean(storageError) || writing" :initial-date="formDate"
          @save="saveTraining" @cancel="closeForm" />
        <p v-if="writeError" class="alert" role="alert">{{ writeError }}</p>
      </section>

      <TrainingHeatmap :sessions="sessions" :selected="selectedDate" :unavailable="Boolean(storageError)"
        @select="selectedDate = $event" />

      <section class="history-section" aria-labelledby="history-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">YOUR PROGRESS</p>
            <h2 id="history-title">训练记录<span class="heading-dot">.</span></h2>
            <p class="section-copy">回头看看，你已经走了多远。</p>
          </div>
          <button type="button" class="button button-outline" :disabled="Boolean(storageError) || writing"
            @click="openForm()">
            ＋ 新增记录
          </button>
        </div>

        <div class="history-layout">
          <TrainingHistory :sessions="sessions" :unavailable="Boolean(storageError)"
            @edit="editTraining" @remove="removeTraining" @create="openForm()" />

          <aside class="side-column">
            <div class="side-card day-card">
              <p class="eyebrow">SELECTED DAY</p>
              <h3>{{ formatDateLabel(selectedDate) }}</h3>
              <template v-if="selectedSessions.length">
                <p class="day-total">当天共 {{ selectedSets }} 组 · {{ selectedSessions.length }} 次训练</p>
                <div v-for="session in selectedSessions" :key="session.id" class="day-session">
                  <p v-for="(exercise, index) in session.exercises" :key="index">
                    <strong>{{ exercise.name }}</strong>
                    {{ exercise.weightKg }} kg × {{ exercise.sets }} 组
                    <small v-if="exercise.note">{{ exercise.note }}</small>
                  </p>
                </div>
              </template>
              <p v-else class="muted">这一天还没有训练记录。</p>
              <button type="button" class="text-link" :disabled="Boolean(storageError) || writing"
                @click="openForm(selectedDate)">
                为这一天添加记录 ↗
              </button>
            </div>

            <TrainingBackup :sessions="sessions" :unavailable="Boolean(storageError)" :restore="restoreTraining" />
          </aside>
        </div>
      </section>
    </main>

    <footer class="footer">
      <span>TRAINING LOG <b aria-hidden="true">↗</b></span>
      <span>为自己，一直练下去。</span>
    </footer>
  </div>
</template>
