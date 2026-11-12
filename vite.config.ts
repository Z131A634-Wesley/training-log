import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    watch: {
      // .worktrees 是并行的开发副本，不参与本工作区的热更新。
      ignored: ['**/.worktrees/**', '**/dist/**'],
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
