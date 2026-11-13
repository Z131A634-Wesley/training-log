<script setup lang="ts">
import { ref } from 'vue'
import { localDate } from '../domain/dates'
import { exportBackup, parseBackup, type Document } from '../storage/training-storage'

const props = defineProps<{
  document: Document
  unavailable: boolean
  restore: (document: Document) => Promise<boolean> | boolean
}>()

const dialog = ref<HTMLDialogElement>()
const fileInput = ref<HTMLInputElement>()
const pending = ref<Document | null>(null)
const error = ref('')
const restoring = ref(false)
const restoreError = ref('')
let lastSelection = 0

function downloadBackup() {
  error.value = ''
  try {
    const blob = new Blob([exportBackup(props.document)], { type: 'application/json' })
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
    const document = parseBackup(await file.text())
    if (selection !== lastSelection) return
    pending.value = document
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
  <section class="backup" aria-labelledby="backup-title">
    <div>
      <h2 id="backup-title">备份</h2>
      <p>数据只存在这台设备的浏览器里。换设备或清理数据之前，先导出一份 JSON。</p>
    </div>

    <div class="backup-actions">
      <button type="button" class="button button--secondary" :disabled="unavailable" @click="downloadBackup">
        导出 JSON
      </button>
      <button type="button" class="button button--secondary" :disabled="unavailable" @click="fileInput?.click()">
        导入 JSON
      </button>
    </div>

    <input ref="fileInput" class="visually-hidden" type="file" accept=".json,application/json"
      aria-label="选择 JSON 备份文件" @change="chooseBackup" />

    <p v-if="error" class="backup-error" role="alert">{{ error }} 原记录未被替换。</p>

    <dialog ref="dialog" aria-labelledby="restore-title" aria-describedby="restore-description"
      @cancel="restoring && $event.preventDefault()" @close="pending = null">
      <h3 id="restore-title">恢复训练记录？</h3>
      <p id="restore-description">
        这份备份包含 <strong>{{ pending?.sessions.length ?? 0 }}</strong> 次训练、
        <strong>{{ pending?.templates.length ?? 0 }}</strong> 个训练日。确认后将替换当前浏览器中的全部记录，并结束当前编辑。
      </p>
      <p v-if="restoreError" class="banner banner--error" role="alert">{{ restoreError }}</p>
      <footer>
        <button type="button" class="button button--secondary" autofocus :disabled="restoring"
          @click="dialog?.close()">取消</button>
        <button type="button" class="button button--primary" :disabled="restoring" @click="confirmRestore">
          确认替换
        </button>
      </footer>
    </dialog>
  </section>
</template>

<style scoped>
.backup h2 { font-size: 20px; line-height: 1.4; font-weight: 600; letter-spacing: -0.01em; }
.backup p { max-width: 46ch; margin-top: var(--space-2); font-size: 13px; line-height: 1.6; color: var(--ink-2); }
.backup .backup-actions { margin: 0; justify-content: flex-end; }
.backup-error { grid-column: 1 / -1; color: var(--danger); }

dialog {
  width: min(100% - 40px, 420px);
  padding: var(--space-6);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 24px 48px -24px rgb(25 27 24 / 0.28);
}
dialog::backdrop { background: rgb(25 27 24 / 0.4); }
dialog h3 { margin: 0 0 var(--space-3); font-size: 20px; line-height: 1.4; font-weight: 600; letter-spacing: -0.01em; }
dialog p { margin: 0; font-size: 13px; line-height: 1.7; color: var(--ink-2); }
dialog .banner { margin-top: var(--space-4); }
dialog footer { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-5); }

@media (max-width: 720px) {
  .backup .backup-actions { justify-content: flex-start; }
}
</style>
