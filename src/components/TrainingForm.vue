<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { isLocalDate, localDate } from '../domain/dates'
import { defaultWeight, exerciseNames, type Exercise, type Session } from '../domain/training'

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
const date = ref(props.editing?.date ?? props.initialDate ?? today.value)
const rows = ref(props.editing ? props.editing.exercises.map(makeRow) : [makeRow()])
const error = ref('')
const form = ref<HTMLFormElement>()
const history = computed(() => props.sessions.filter((session) => session.id !== props.editing?.id))
const names = computed(() => exerciseNames(props.sessions).sort((left, right) => left.localeCompare(right, 'zh-CN')))
const openPicker = ref<number | null>(null)
let preserveDate = false

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
  refreshDefaultDate()
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
          <span class="exercise-number" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
          <span>训练动作</span>
          <button v-if="rows.length > 1" type="button" class="text-button remove"
            :aria-label="`移除动作 ${index + 1}`" @click="removeRow(index)">移除</button>
        </div>

        <div class="exercise-grid">
          <div class="field exercise-name">
            <label :for="`exercise-name-${row.id}`">动作名称</label>
            <div class="name-row">
              <input :id="`exercise-name-${row.id}`" type="text" :value="row.name" placeholder="例如：坐姿划船"
                autocomplete="off" required @input="changeName(row, $event)"
                @change="fillInheritedOnBlur(row)" />
              <button v-if="names.length" class="history-picker" type="button"
                :aria-expanded="openPicker === row.id" :aria-controls="`exercise-picker-${row.id}`"
                @click="openPicker = openPicker === row.id ? null : row.id">
                历史动作
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
              <button type="button" :aria-label="`增加动作 ${index + 1} 的组数`" @click="stepSets(row, 1)">＋</button>
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

    <button type="button" class="add-exercise" @click="addRow">＋ 添加动作</button>

    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <div class="form-actions">
      <button v-if="editing" type="button" class="button button-quiet" @click="emit('cancel')">取消</button>
      <button type="submit" class="button button-dark" :disabled="disabled">保存训练 <span>↗</span></button>
    </div>
  </form>
</template>

<style scoped>
.training-form { display: grid; gap: 0; }
.field { display: flex; flex-direction: column; gap: 8px; font-size: 11px; font-weight: 700; color: #687768; }
.field small { font-weight: 400; color: #a0aca0; }
.field input {
  width: 100%;
  height: 42px;
  padding: 0 11px;
  border: 1px solid #dfe6db;
  border-radius: 3px;
  background: #fff;
  color: #202820;
  font-size: 13px;
}
.field input::placeholder { color: #bdc6bb; }
.date-field { max-width: 220px; margin-bottom: 20px; }
.exercise-list { display: grid; gap: 12px; }
.exercise-card {
  display: grid;
  gap: 0;
  min-inline-size: 0;
  margin: 0;
  padding: 17px;
  background: #f8faf6;
  border: 1px solid #edf1e9;
}
.exercise-head { display: flex; align-items: center; gap: 9px; margin-bottom: 15px; font-size: 12px; font-weight: 700; }
.exercise-number { font-size: 10px; color: #9aae95; font-variant-numeric: tabular-nums; }
.exercise-head .remove { margin-left: auto; }
.exercise-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; }
.note-field { grid-column: 1 / -1; }
.name-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.history-picker {
  height: 42px;
  padding: 0 12px;
  border: 1px solid #cbd4c7;
  background: transparent;
  color: #456c48;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.history-picker:hover { background: #e9eee5; }
.history-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-block-size: 9rem;
  overflow: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}
.history-options button {
  padding: 6px 10px;
  border: 1px solid #cbd8c6;
  background: #fff;
  color: #35573a;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.history-options button:hover { background: #eef4ea; }
.stepper { display: flex; height: 42px; border: 1px solid #dfe6db; background: #fff; }
.stepper button { border: 0; background: #fff; color: #6b806b; width: 34px; font-size: 15px; }
.stepper button:disabled { opacity: .45; }
.stepper input {
  border: 0;
  text-align: center;
  padding: 0;
  min-width: 0;
  appearance: textfield;
  width: 100%;
}
.stepper input::-webkit-inner-spin-button { appearance: none; }
.add-exercise {
  width: 100%;
  margin-top: 12px;
  padding: 14px;
  border: 1px dashed #cbd8c6;
  background: transparent;
  color: #678b62;
  font-weight: 600;
  font-size: 12px;
}
.add-exercise:hover { background: #f4f7f1; }
.form-error { margin: 12px 0 0; color: #b45137; font-size: 12px; }
.form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }

@media (max-width: 700px) {
  .exercise-grid { grid-template-columns: 1fr 1fr; }
  .exercise-name, .note-field { grid-column: 1 / -1; }
  .date-field { max-width: none; }
}
</style>
