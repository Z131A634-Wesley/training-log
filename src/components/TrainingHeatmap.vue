<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { heatmapWeeks, localDate } from '../domain/dates'
import { dailySets, type Session } from '../domain/training'

const props = defineProps<{
  sessions: readonly Session[]
  selected: string
  unavailable: boolean
}>()

const emit = defineEmits<{
  select: [date: string]
}>()

const today = ref(localDate())
const weeks = computed(() => heatmapWeeks(today.value))
const totals = computed(() => dailySets(props.sessions))
const weekdays = ['一', '', '三', '', '五', '', '日']
const scrollArea = ref<HTMLElement>()
const activeDate = ref(today.value)
const hoveredDate = ref('')
const focusedDate = ref('')
const summaryDate = computed(() => hoveredDate.value || focusedDate.value || props.selected)

// 月份标签落在含「1 号」的那一列，第一列补一个，避免开头空着。
const months = computed(() => weeks.value.map((week, index) => {
  const firstDay = week.find((date) => date.slice(8) === '01')
  if (firstDay) return `${Number(firstDay.slice(5, 7))}月`
  return index === 0 ? `${Number(week[0]!.slice(5, 7))}月` : ''
}))

function refreshToday() {
  if (!document.hidden) today.value = localDate()
}

onMounted(() => {
  window.addEventListener('focus', refreshToday)
  document.addEventListener('visibilitychange', refreshToday)
})
onUnmounted(() => {
  window.removeEventListener('focus', refreshToday)
  document.removeEventListener('visibilitychange', refreshToday)
})

watch(today, () => {
  const oldest = weeks.value[0]?.[0] ?? today.value
  if (activeDate.value < oldest || activeDate.value > today.value) activeDate.value = today.value
})

// 手机先看到最近几周：打开时滚到最右。
watch([scrollArea, today], ([area]) => {
  if (area) area.scrollLeft = area.scrollWidth - area.clientWidth
}, { flush: 'post' })

function sets(date: string): number {
  return totals.value.get(date) ?? 0
}

function level(count: number): number {
  if (count === 0) return 0
  if (count <= 5) return 1
  if (count <= 10) return 2
  if (count <= 15) return 3
  return 4
}

function moveFocus(event: KeyboardEvent, week: number, day: number) {
  switch (event.key) {
    case 'ArrowLeft': week--; break
    case 'ArrowRight': week++; break
    case 'ArrowUp': day--; break
    case 'ArrowDown': day++; break
    default: return
  }

  event.preventDefault()
  const date = weeks.value[week]?.[day]
  if (!date || date > today.value) return
  scrollArea.value?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)?.focus()
}
</script>

<template>
  <section class="panel activity" aria-labelledby="activity-title">
    <div class="section-head">
      <h2 id="activity-title">训练足迹</h2>
      <span class="micro">最近 52 周</span>
    </div>

    <p v-if="unavailable" class="small muted">本机记录暂时无法读取，无法显示热力图。</p>
    <template v-else>
      <p id="heatmap-guide" class="visually-hidden">
        最近 52 周，每个方块代表一天。用方向键移动，按回车或点击查看当天训练。
      </p>
      <div class="heatmap-wrap">
        <div class="weekdays" aria-hidden="true">
          <span v-for="(weekday, index) in weekdays" :key="index" :style="{ gridRow: index + 2 }">{{ weekday }}</span>
        </div>
        <div ref="scrollArea" class="heatmap-scroll" role="group" aria-label="每天的训练组数"
          aria-describedby="heatmap-guide">
          <div class="heatmap-months" aria-hidden="true">
            <span v-for="(label, index) in months" :key="index">{{ label }}</span>
          </div>
          <div class="heatmap-grid" @pointerleave="hoveredDate = ''">
            <div v-for="(week, column) in weeks" :key="week[0]" class="heat-week">
              <template v-for="(date, row) in week" :key="date">
                <span v-if="date > today" class="heat-cell future" aria-hidden="true"></span>
                <button v-else type="button" class="heat-cell"
                  :class="[`level-${level(sets(date))}`, { selected: selected === date, today: date === today }]"
                  :data-date="date"
                  :tabindex="activeDate === date ? 0 : -1"
                  :aria-label="`${date}：${sets(date)} 组`"
                  :aria-pressed="selected === date"
                  :title="`${date} · ${sets(date)} 组`"
                  @pointerenter="hoveredDate = date"
                  @pointerleave="hoveredDate = ''"
                  @focus="activeDate = date; focusedDate = date; hoveredDate = ''"
                  @blur="focusedDate = ''"
                  @keydown="moveFocus($event, column, row)"
                  @click="activeDate = date; emit('select', date)" />
              </template>
            </div>
          </div>
        </div>
      </div>

      <div class="heat-foot">
        <span class="micro">{{ summaryDate ? `${summaryDate} · ${sets(summaryDate)} 组` : '点击方块查看当天训练' }}</span>
        <div class="legend">
          <span class="micro">少</span>
          <i v-for="n in 5" :key="n" :class="`level-${n - 1}`"></i>
          <span class="micro">多</span>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.activity { --cell: 14px; --gap: 4px; }
.activity .section-head h2 { font-size: 24px; letter-spacing: -0.02em; }

.heatmap-wrap { display: flex; gap: var(--space-2); margin-top: var(--space-5); }
.weekdays {
  display: grid;
  grid-template-rows: 16px repeat(7, var(--cell));
  gap: var(--gap);
  flex: 0 0 auto;
  align-items: center;
  width: 14px;
  font-size: 10px;
  color: var(--ink-3);
}
.heatmap-scroll {
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: var(--space-1);
  scrollbar-width: thin;
}
.heatmap-months,
.heatmap-grid {
  display: grid;
  grid-template-columns: repeat(52, var(--cell));
  gap: var(--gap);
  width: max-content;
  margin-inline: auto;
}
.heatmap-months {
  height: 16px;
  font-size: 10px;
  color: var(--ink-3);
  white-space: nowrap;
}
.heat-week { display: grid; grid-template-rows: repeat(7, var(--cell)); gap: var(--gap); }
.heat-cell {
  width: var(--cell);
  height: var(--cell);
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--level-0);
}
button.heat-cell { cursor: pointer; transition: box-shadow 120ms var(--ease); }
button.heat-cell:hover { box-shadow: inset 0 0 0 1px var(--ink-3); }
.heat-cell.today { box-shadow: inset 0 0 0 1px var(--today); }
.heat-cell.selected { box-shadow: inset 0 0 0 2px var(--today); }
.heat-cell.future { visibility: hidden; }
button.heat-cell:focus-visible { outline: 2px solid var(--today); outline-offset: 1px; }

.level-0 { background: var(--level-0); }
.level-1 { background: var(--level-1); }
.level-2 { background: var(--level-2); }
.level-3 { background: var(--level-3); }
.level-4 { background: var(--level-4); }

.heat-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-4);
}
.legend { display: flex; align-items: center; gap: 3px; }
.legend span:first-child { margin-right: var(--space-1); }
.legend span:last-child { margin-left: var(--space-1); }
.legend i {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-sm);
}

@media (pointer: coarse) {
  .activity { --cell: 16px; --gap: 4px; }
  .weekdays, .heatmap-months { font-size: 11px; }
}
</style>
