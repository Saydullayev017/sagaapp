/**
 * DOM utility functions
 */

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
 * Shows a notification message on screen
 * @param message - Message to display
 * @param type - Type of notification (info, success, error)
 */
export function showNotification(
  message: string,
  type: 'info' | 'success' | 'error' = 'info'
): void {
  const notification = createElement('div', 'notification')
  notification.textContent = message
  notification.classList.add(type)

  document.body.appendChild(notification)

  setTimeout(() => {
    notification.classList.add('fade-out')
    setTimeout(() => notification.remove(), 300)
  }, 3000)
}
