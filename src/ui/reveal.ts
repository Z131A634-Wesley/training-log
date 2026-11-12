import type { Directive } from 'vue'

/**
 * 区块进入视口时淡入一次。只在允许动效时启用，
 * 关闭动效（prefers-reduced-motion）时元素保持原样。
 */
export const reveal: Directive<HTMLElement> = {
  mounted(element) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    element.classList.add('reveal')
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        element.classList.add('reveal-in')
        observer.disconnect()
      }
    }, { threshold: 0.15 })

    observer.observe(element)
  },
  unmounted(element) {
    element.classList.remove('reveal', 'reveal-in')
  },
}
