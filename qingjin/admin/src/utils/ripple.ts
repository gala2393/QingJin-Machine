import type { App, Directive } from 'vue'

export interface RippleOptions {
  color?: string
}

const COLORED_BUTTONS = ['primary', 'info', 'warning', 'danger', 'success'].map((t) => `el-button--${t}`)
const BASE_MS = 600

function spawnRipple(el: HTMLElement, e: MouseEvent, color?: string) {
  const rect = el.getBoundingClientRect()
  const diameter = Math.max(el.clientWidth, el.clientHeight)
  const radius = diameter / 2
  // Larger targets get a slower wave so the spread speed feels constant.
  const duration = BASE_MS + diameter * 0.5

  const isColored = COLORED_BUTTONS.some((c) => el.classList.contains(c)) && !el.classList.contains('is-plain')
  const ripple = document.createElement('span')
  ripple.className = 'qj-ripple'
  Object.assign(ripple.style, {
    width: `${diameter}px`,
    height: `${diameter}px`,
    left: `${e.clientX - rect.left - radius}px`,
    top: `${e.clientY - rect.top - radius}px`,
    backgroundColor: color ?? (isColored ? 'rgba(255, 255, 255, 0.25)' : 'var(--el-color-primary-light-7)'),
    transition: `transform ${duration}ms cubic-bezier(0.3, 0, 0.2, 1), opacity ${duration}ms cubic-bezier(0.3, 0, 0.5, 1)`,
  })
  el.appendChild(ripple)
  requestAnimationFrame(() => {
    ripple.style.transform = 'scale(2)'
    ripple.style.opacity = '0'
  })
  window.setTimeout(() => ripple.remove(), duration + 500)
}

export const vRipple: Directive<HTMLElement, RippleOptions | undefined> = {
  mounted(el, binding) {
    el.classList.add('qj-ripple-host')
    el.addEventListener('mousedown', (e) => spawnRipple(el, e, binding.value?.color))
  },
}

/** Ripple on every Element Plus button without annotating each one with v-ripple. */
function installButtonRipple() {
  document.addEventListener(
    'mousedown',
    (e) => {
      if (e.button !== 0) return
      const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('.el-button')
      if (!btn || btn.classList.contains('qj-ripple-host')) return
      if (btn.classList.contains('is-disabled') || btn.classList.contains('is-loading')) return
      if (btn.classList.contains('is-link') || btn.classList.contains('is-text')) return
      spawnRipple(btn, e)
    },
    true,
  )
}

declare module 'vue' {
  interface GlobalDirectives {
    vRipple: typeof vRipple
  }
}

export function setupRipple(app: App) {
  app.directive('ripple', vRipple)
  installButtonRipple()
}
