<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { isLocalDate, localDate } from '../domain/dates'
import { defaultWeight, exerciseNames, type Exercise, type Session } from '../domain/training'
import { initialFormDate } from '../ui/form-date'

const props = defineProps<{
  sessions: readonly Session[]
  editing: Session | null
  disabled: boolean
  initialDate?: string
}>()

const emit = defineEmits<{
  save: [date: string, exercises: Exercise[]]
  cancel: []
}>()

interface DraftExercise {
  id: number
  name: string
  weight: string
  sets: string
  note: string
  inheritsWeight: boolean
}

let nextId = 0

function makeRow(exercise?: Exercise): DraftExercise {
  return {
    id: ++nextId,
    name: exercise?.name ?? '',
    weight: exercise ? String(exercise.weightKg) : '',
    sets: String(exercise?.sets ?? 3),
    note: exercise?.note ?? '',
    inheritsWeight: false,
  }
}

const today = ref(localDate())
const start = initialFormDate(props.editing?.date, props.initialDate, today.value)
const date = ref(start.date)
const rows = ref(props.editing ? props.editing.exercises.map(makeRow) : [makeRow()])
const error = ref('')
const form = ref<HTMLFormElement>()
const history = computed(() => props.sessions.filter((session) => session.id !== props.editing?.id))
const names = computed(() => exerciseNames(props.sessions).sort((left, right) => left.localeCompare(right, 'zh-CN')))
const openPicker = ref<number | null>(null)
// 编辑或补记时日期是明确的，不允许被「回到今天」覆盖。
let preserveDate = start.pinned

function refreshDefaultDate() {
  today.value = localDate()
  if (!props.editing && !preserveDate) date.value = today.value
}

function refreshWhenVisible() {
  if (!document.hidden) refreshDefaultDate()
}

onMounted(() => {
  window.addEventListener('focus', refreshDefaultDate)
  document.addEventListener('visibilitychange', refreshWhenVisible)
})

onUnmounted(() => {
  window.removeEventListener('focus', refreshDefaultDate)
  document.removeEventListener('visibilitychange', refreshWhenVisible)
})

function startDraft() {
  refreshDefaultDate()
  preserveDate = true
}

function focusField(id: string) {
  void nextTick(() => {
    form.value?.querySelector<HTMLElement>(`#${id}`)?.focus()
  })
}

function addRow() {
  startDraft()
  const row = makeRow()
  rows.value.push(row)
  focusField(`exercise-name-${row.id}`)
}

function removeRow(index: number) {
  if (rows.value.length === 1) return
  const removed = rows.value[index]!
  if (openPicker.value === removed.id) openPicker.value = null
  rows.value.splice(index, 1)
  focusField(`exercise-name-${rows.value[Math.min(index, rows.value.length - 1)]!.id}`)
}

function updateInheritedWeight(row: DraftExercise) {
  const weight = isLocalDate(date.value)
    ? defaultWeight(history.value, row.name, date.value)
    : undefined
  row.weight = weight === undefined ? '' : String(weight)
}

function chooseName(row: DraftExercise, name: string) {
  startDraft()
  const keepWeight = Boolean(props.editing && row.name.trim() === name && row.weight !== '')
  row.name = name
  openPicker.value = null
  if (!keepWeight) {
    row.inheritsWeight = true
    updateInheritedWeight(row)
  }
  focusField(`exercise-weight-${row.id}`)
}

function changeName(row: DraftExercise, event: Event) {
  startDraft()
  const name = (event.target as HTMLInputElement).value
  if (row.inheritsWeight && name.trim() !== row.name.trim()) {
    row.inheritsWeight = false
    row.weight = ''
  }
  row.name = name
}

/** 手动输入了历史动作名、但没填重量时，失焦也带出上次的起始重量。 */
function fillInheritedOnBlur(row: DraftExercise) {
  if (row.weight.trim() !== '' || !row.name.trim()) return
  row.inheritsWeight = true
  updateInheritedWeight(row)
}

function changeDate(event: Event) {
  preserveDate = true
  date.value = (event.target as HTMLInputElement).value
  for (const row of rows.value) {
    if (row.inheritsWeight) updateInheritedWeight(row)
  }
}

function changeNote(row: DraftExercise, event: Event) {
  row.note = (event.target as HTMLInputElement).value
}

function changeWeight(row: DraftExercise, event: Event) {
  startDraft()
  row.inheritsWeight = false
  row.weight = (event.target as HTMLInputElement).value
}

function changeSets(row: DraftExercise, event: Event) {
  startDraft()
  row.sets = (event.target as HTMLInputElement).value
}

function stepSets(row: DraftExercise, delta: number) {
  startDraft()
  const current = Number(row.sets)
  row.sets = String(Math.max(1, (Number.isInteger(current) && current > 0 ? current : 3) + delta))
}

function fail(message: string, field: string) {
  error.value = message
  focusField(field)
}

function submit() {
  if (props.disabled) return
  // 只刷新「今天」这个基准，绝不改动用户已经选好的日期。
  today.value = localDate()
  error.value = ''
  if (!isLocalDate(date.value) || date.value > today.value) {
    return fail('请选择今天或更早的训练日期。', 'training-date')
  }
  const exercises: Exercise[] = []
  for (const [index, row] of rows.value.entries()) {
    const name = row.name.trim()
    const weightKg = Number(row.weight)
    const sets = Number(row.sets)
    const note = row.note.trim()
    if (!name) return fail(`请填写动作 ${index + 1} 的名称。`, `exercise-name-${row.id}`)
    if (row.weight.trim() === '' || !Number.isFinite(weightKg) || weightKg < 0) {
      return fail(`请填写动作 ${index + 1} 的起始重量，最低为 0 kg。`, `exercise-weight-${row.id}`)
    }
    if (!Number.isInteger(sets) || sets < 1) {
      return fail(`动作 ${index + 1} 的组数必须是正整数。`, `exercise-sets-${row.id}`)
    }
    exercises.push({ name, weightKg, sets, ...(note ? { note } : {}) })
  }
  emit('save', date.value, exercises)
}
</script>

<template>
  <form ref="form" class="training-form" novalidate @focusin="refreshDefaultDate" @submit.prevent="submit">
    <label class="field date-field">
      <span>训练日期</span>
      <input id="training-date" type="date" :value="date" :max="today" required @input="changeDate" />
    </label>

    <div class="exercise-list">
      <fieldset v-for="(row, index) in rows" :key="row.id" class="exercise-card">
        <legend class="visually-hidden">动作 {{ index + 1 }}</legend>
        <div class="exercise-head">
          <span class="micro">{{ String(index + 1).padStart(2, '0') }}</span>
          <span>训练动作</span>
          <button v-if="rows.length > 1" type="button" class="link remove"
            :aria-label="`移除动作 ${index + 1}`" @click="removeRow(index)">移除</button>
        </div>

        <div class="exercise-grid">
          <div class="field exercise-name">
            <label :for="`exercise-name-${row.id}`">动作名称</label>
            <div class="name-row">
              <input :id="`exercise-name-${row.id}`" type="text" :value="row.name" placeholder="例如：坐姿划船"
                autocomplete="off" required @input="changeName(row, $event)"
                @change="fillInheritedOnBlur(row)" />
              <button v-if="names.length" class="button button--secondary history-picker" type="button"
                :aria-expanded="openPicker === row.id" :aria-controls="`exercise-picker-${row.id}`"
                @click="openPicker = openPicker === row.id ? null : row.id">
                历史
              </button>
            </div>
            <ul v-if="names.length" v-show="openPicker === row.id" :id="`exercise-picker-${row.id}`"
              class="history-options">
              <li v-for="name in names" :key="name">
                <button type="button" @click="chooseName(row, name)">{{ name }}</button>
              </li>
            </ul>
          </div>

          <div class="field">
            <label :for="`exercise-weight-${row.id}`">起始重量 <small>kg</small></label>
            <input :id="`exercise-weight-${row.id}`" type="number" :value="row.weight" inputmode="decimal"
              min="0" step="any" placeholder="自重填 0" required @input="changeWeight(row, $event)" />
          </div>

          <div class="field">
            <label :for="`exercise-sets-${row.id}`">组数</label>
            <span class="stepper">
              <button type="button" :aria-label="`减少动作 ${index + 1} 的组数`" :disabled="row.sets === '1'"
                @click="stepSets(row, -1)">−</button>
              <input :id="`exercise-sets-${row.id}`" type="number" :value="row.sets" inputmode="numeric"
                min="1" step="1" required @input="changeSets(row, $event)" />
              <button type="button" :aria-label="`增加动作 ${index + 1} 的组数`" @click="stepSets(row, 1)">+</button>
            </span>
          </div>

          <div class="field note-field">
            <label :for="`exercise-note-${row.id}`">备注 <small>选填</small></label>
            <input :id="`exercise-note-${row.id}`" type="text" :value="row.note"
              placeholder="例如：最后一组 35 kg × 12 次" @input="changeNote(row, $event)" />
          </div>
        </div>
      </fieldset>
    </div>

    <button type="button" class="add-exercise" @click="addRow">+ 添加动作</button>

    <p v-if="error" class="form-error" role="alert">{{ error }}</p>

    <div class="form-actions">
      <button v-if="editing" type="button" class="button button--secondary" @click="emit('cancel')">取消</button>
      <button type="submit" class="button button--primary" :disabled="disabled">保存训练</button>
    </div>

    <div class="save-bar">
      <button v-if="editing" type="button" class="button button--secondary" @click="emit('cancel')">取消</button>
      <button type="submit" class="button button--primary" :disabled="disabled">保存训练</button>
    </div>
  </form>
</template>

<style scoped>
.training-form { display: grid; gap: var(--space-5); }

.field { display: grid; gap: var(--space-2); }
.field > label, .field > span {
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-2);
}
.field small { font-weight: 400; color: var(--ink-3); }
.field input {
  width: 100%;
  height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--ink);
  font-size: 15px;
  transition: border-color 120ms var(--ease), box-shadow 120ms var(--ease);
}
.field input::placeholder { color: #9a9d93; }
.field input:focus {
  outline: none;
  border-color: var(--today);
  box-shadow: 0 0 0 3px rgb(180 83 42 / 0.16);
}

.date-field { max-width: 200px; }

.exercise-list { display: grid; gap: var(--space-4); }
.exercise-card {
  display: grid;
  gap: var(--space-4);
  min-inline-size: 0;
  margin: 0;
  padding: var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
}
.exercise-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-2);
}
.exercise-head .remove { margin-left: auto; }

.exercise-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: var(--space-4); }
.note-field { grid-column: 1 / -1; }

.name-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-2); }
.history-picker { height: 44px; }

.history-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  max-block-size: 160px;
  overflow: auto;
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
}
.history-options button {
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--ink-2);
  font-size: 13px;
  overflow-wrap: anywhere;
  transition: background-color 120ms var(--ease), color 120ms var(--ease);
}
.history-options button:hover { background: var(--surface-sunk); color: var(--ink); }

.stepper {
  display: flex;
  height: 44px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color 120ms var(--ease), box-shadow 120ms var(--ease);
}
.stepper:focus-within { border-color: var(--today); box-shadow: 0 0 0 3px rgb(180 83 42 / 0.16); }
.stepper button {
  width: 36px;
  border: 0;
  background: var(--surface);
  color: var(--ink-2);
  font-size: 15px;
  transition: background-color 120ms var(--ease);
}
.stepper button:hover:not(:disabled) { background: var(--surface-sunk); }
.stepper button:disabled { opacity: 0.4; cursor: not-allowed; }
.stepper input {
  min-width: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: 0;
  text-align: center;
  appearance: textfield;
  font-size: 15px;
  background: var(--surface);
}
.stepper input:focus { outline: none; box-shadow: none; }
.stepper input::-webkit-inner-spin-button { appearance: none; }

.add-exercise {
  width: 100%;
  height: 44px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 500;
  transition: background-color 120ms var(--ease), color 120ms var(--ease);
}
.add-exercise:hover { background: var(--surface-sunk); color: var(--ink); }

.form-error { margin: 0; font-size: 13px; color: var(--danger); }
.form-actions { display: flex; justify-content: flex-end; gap: var(--space-2); }
.save-bar { display: none; }

@media (max-width: 720px) {
  .exercise-grid { grid-template-columns: 1fr 1fr; }
  .exercise-name, .note-field { grid-column: 1 / -1; }
  .date-field { max-width: none; }
  .form-actions { display: none; }

  .save-bar {
    display: flex;
    gap: var(--space-2);
    position: sticky;
    bottom: 0;
    z-index: 2;
    margin: var(--space-5) calc(var(--space-5) * -1) calc(var(--space-5) * -1);
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--line);
    background: var(--paper);
  }
  .save-bar .button--primary { flex: 1; }
}
</style>
