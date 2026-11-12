<script setup lang="ts">
import { ref } from 'vue'
import { localDate } from '../domain/dates'
import type { Session } from '../domain/training'
import { exportBackup, parseBackup } from '../storage/training-storage'

const props = defineProps<{
  sessions: readonly Session[]
  unavailable: boolean
  restore: (sessions: Session[]) => Promise<boolean> | boolean
}>()

const dialog = ref<HTMLDialogElement>()
const fileInput = ref<HTMLInputElement>()
const pending = ref<Session[] | null>(null)
const error = ref('')
const restoring = ref(false)
const restoreError = ref('')
let lastSelection = 0

function downloadBackup() {
  error.value = ''
  try {
    const blob = new Blob([exportBackup(props.sessions)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `training-log-backup-${localDate()}.json`
    link.click()
    // 立刻 revoke 会让部分浏览器的下载失效，等一下再释放。
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    error.value = '无法导出备份，请稍后重试。'
  }
}

async function chooseBackup(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const selection = ++lastSelection
  error.value = ''
  try {
    const sessions = parseBackup(await file.text())
    if (selection !== lastSelection) return
    pending.value = sessions
    restoreError.value = ''
    dialog.value?.showModal()
  } catch (cause) {
    if (selection !== lastSelection) return
    error.value = cause instanceof Error ? cause.message : '无法读取这份备份。'
  }
}

async function confirmRestore() {
  if (!pending.value || restoring.value) return
  restoring.value = true
  restoreError.value = ''
  try {
    if (await props.restore(pending.value)) {
      dialog.value?.close()
    } else {
      restoreError.value = '未能恢复备份，原记录未被替换。请查看页面上的存储提示。'
    }
  } catch {
    restoreError.value = '未能恢复备份，原记录未被替换。'
  } finally {
    restoring.value = false
  }
}
</script>

<template>
  <div class="side-card backup-card">
    <div class="backup-icon" aria-hidden="true">↓</div>
    <p class="eyebrow">YOUR DATA, YOURS</p>
    <h3>好好保存每一步</h3>
    <p class="muted">数据保存在当前浏览器。定期导出备份，换设备或清除数据前也能找回记录。</p>
    <div class="backup-actions">
      <button type="button" :disabled="unavailable" @click="downloadBackup">导出备份 ↗</button>
      <button type="button" :disabled="unavailable" @click="fileInput?.click()">导入备份 ↗</button>
    </div>
    <input ref="fileInput" class="visually-hidden" type="file" accept=".json,application/json"
      aria-label="选择 JSON 备份文件" @change="chooseBackup" />
    <p v-if="error" class="alert" role="alert">{{ error }} 原记录未被替换。</p>

    <dialog ref="dialog" aria-labelledby="restore-title" aria-describedby="restore-description"
      @cancel="restoring && $event.preventDefault()" @close="pending = null">
      <h3 id="restore-title">恢复训练记录？</h3>
      <p id="restore-description">
        这份备份包含 <strong>{{ pending?.length ?? 0 }}</strong> 次训练。确认后将替换当前浏览器中的全部训练记录，并结束当前编辑。
      </p>
      <p v-if="restoreError" class="alert" role="alert">{{ restoreError }}</p>
      <footer>
        <button type="button" class="button button-quiet" autofocus :disabled="restoring" @click="dialog?.close()">取消</button>
        <button type="button" class="button button-dark" :disabled="restoring" @click="confirmRestore">确认替换</button>
      </footer>
    </dialog>
  </div>
</template>

<style scoped>
.backup-card { background: #edf3e9; border-color: #e2eadc; }
.backup-icon { font-size: 18px; color: #62815d; margin-bottom: 18px; }
.backup-actions { display: flex; gap: 17px; margin-top: 18px; }
.backup-actions button {
  padding: 0;
  border: 0;
  background: none;
  color: #456c48;
  font-size: 11px;
  font-weight: 700;
}
.backup-actions button:hover:not(:disabled) { text-decoration: underline; }
.backup-card .alert { margin-top: 14px; }
dialog {
  width: min(100% - 32px, 430px);
  padding: 28px;
  border: 0;
  border-radius: 5px;
  background: #fff;
  color: #202820;
}
dialog::backdrop { background: #1d2c20aa; }
dialog h3 { margin: 0 0 12px; font-size: 20px; letter-spacing: -.02em; }
dialog p { font-size: 13px; line-height: 1.8; color: #738073; margin: 0; }
dialog footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
</style>
