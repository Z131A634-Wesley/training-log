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
const activeDays = computed(() => totals.value.size)
const totalSets = computed(() => [...totals.value.values()].reduce((sum, count) => sum + count, 0))
const weekdays = ['一', '', '三', '', '五', '', '日']
const scrollArea = ref<HTMLElement>()
const activeDate = ref(today.value)
const hoveredDate = ref('')
const focusedDate = ref('')
const summaryDate = computed(() => hoveredDate.value || focusedDate.value || props.selected)

// 每个月份标签落在含「1 号」的那一列上，第一列也补一个，避免开头空着。
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
    <div class="section-heading">
      <div>
        <p class="eyebrow">THE BIG PICTURE</p>
        <h2 id="activity-title">训练足迹<span class="heading-dot">.</span></h2>
        <p class="section-copy">每个小方块，都是你为自己留下的印记。</p>
      </div>
      <span class="period-badge">最近 52 周 <span aria-hidden="true">↗</span></span>
    </div>

    <p v-if="unavailable" class="muted">本机记录暂时无法读取，无法显示热力图。</p>
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
                  :class="[`level-${level(sets(date))}`, { selected: selected === date }]"
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

      <div class="heat-footer">
        <span>{{ summaryDate ? `${summaryDate} · ${sets(summaryDate)} 组` : '点击方块查看当天训练' }}</span>
        <div class="legend">
          <span>较少</span>
          <i v-for="n in 5" :key="n" :class="`level-${n - 1}`"></i>
          <span>较多</span>
        </div>
      </div>

      <div class="stats">
        <div><strong>{{ activeDays }}</strong><span>累计训练天数</span></div>
        <div><strong>{{ sessions.length }}</strong><span>累计训练次数</span></div>
        <div><strong>{{ totalSets }}</strong><span>累计完成组数</span></div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.activity { --cell: 14px; --gap: 4px; }
.heatmap-wrap { display: flex; gap: 10px; margin-top: 30px; }
.weekdays {
  display: grid;
  grid-template-rows: 20px repeat(7, var(--cell));
  gap: var(--gap);
  flex: 0 0 13px;
  align-items: center;
  color: #a4aea2;
  font-size: 9px;
}
.heatmap-scroll { flex: 1 1 auto; min-width: 0; overflow-x: auto; padding-bottom: 5px; scrollbar-width: thin; }
.heatmap-months,
.heatmap-grid { display: grid; grid-template-columns: repeat(52, var(--cell)); gap: var(--gap); min-width: max-content; }
.heatmap-months { height: 20px; color: #a3aea1; font-size: 9px; white-space: nowrap; }
.heat-week { display: grid; grid-template-rows: repeat(7, var(--cell)); gap: var(--gap); }
.heat-cell {
  width: var(--cell);
  height: var(--cell);
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: #edf1e9;
}
button.heat-cell { cursor: pointer; }
button.heat-cell:hover { box-shadow: inset 0 0 0 1px #354e39; }
.heat-cell.selected { outline: 2px solid #354e39; outline-offset: 1px; }
.heat-cell.future { visibility: hidden; }
.level-0 { background: #edf1e9; }
.level-1 { background: #d0e2c8; }
.level-2 { background: #a5c99b; }
.level-3 { background: #73a66c; }
.level-4 { background: #426f47; }
.heat-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  margin: 15px 0 22px;
  color: #a0ab9e;
  font-size: 10px;
}
.legend { display: flex; align-items: center; gap: 4px; }
.legend span:first-child { margin-right: 5px; }
.legend span:last-child { margin-left: 5px; }
.legend i { width: 11px; height: 11px; border-radius: 2px; }
.stats { border-top: 1px solid #eef1ec; padding-top: 24px; display: grid; grid-template-columns: repeat(3, 1fr); }
.stats div { display: flex; align-items: baseline; gap: 10px; padding-left: 26px; border-left: 1px solid #edf0ea; }
.stats div:first-child { padding-left: 0; border: 0; }
.stats strong { font-size: 26px; font-weight: 600; }
.stats span { color: #98a397; font-size: 11px; }

@media (max-width: 700px) {
  .heatmap-wrap { margin-top: 25px; }
  .stats div { display: block; padding-left: 14px; }
  .stats strong, .stats span { display: block; }
  .stats strong { font-size: 23px; }
  .stats span { margin-top: 5px; font-size: 10px; }
}
</style>
