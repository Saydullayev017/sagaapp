/**
 * DOM utility functions
 */

/**
 * Gets element by ID with type safety
 */
export function $<K extends keyof HTMLElementTagNameMap>(
  selector: K
): HTMLElementTagNameMap[K] | null
export function $<E extends Element>(selector: string): E | null
export function $<E extends Element>(selector: string): E | null {
  return document.querySelector(selector)
}

/**
 * Gets all elements matching selector
 */
export function $$<E extends Element>(selector: string): E[] {
  return Array.from(document.querySelectorAll(selector))
}

/**
 * Creates an HTML element with optional className and textContent
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  textContent?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName)
  if (className) element.className = className
  if (textContent) element.textContent = textContent
  return element
}

/**
 * Creates an SVG element
 */
export function createSvg(iconPath: string, className?: string): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  if (className) svg.classList.add(className)

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', iconPath)
  svg.appendChild(path)

  return svg
}

/**
 * Debounce function - delays execution until after wait milliseconds
 * @param func - Function to debounce
 * @param wait - Milliseconds to wait before execution
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * Throttle function - limits execution rate
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Gets file extension
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  return lastDot > 0 ? filename.slice(lastDot + 1).toLowerCase() : ''
}

/**
 * Gets filename from path
 */
export function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath
}

/**
 * Shows a notification message on screen
 * @param message - Message to display
 * @param type - Type of notification (info, success, error)
 */
export function showNotification(
  message: string,
  type: 'info' | 'success' | 'error' = 'info'
): void {
  const notification = createElement('div', `notification notification-${type}`)
  notification.textContent = message

  document.body.appendChild(notification)

  requestAnimationFrame(() => {
    notification.classList.add('show')
  })

  setTimeout(() => {
    notification.classList.remove('show')
    setTimeout(() => notification.remove(), 300)
  }, 3000)
}

export const showNotify = showNotification

/**
 * Safe event handler wrapper
 */
export function safeHandler(fn: () => void | Promise<void>): () => void {
  return () => {
    try {
      const result = fn()
      if (result instanceof Promise) {
        result.catch(console.error)
      }
    } catch (error) {
      console.error(error)
    }
  }
}
