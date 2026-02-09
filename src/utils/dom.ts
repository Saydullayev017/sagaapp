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

export function showNotification(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
    const notification = createElement('div', 'notification')
    notification.textContent = message
    notification.classList.add(type)
    
    document.body.appendChild(notification)
    
    setTimeout(() => {
        notification.classList.add('fade-out')
        setTimeout(() => notification.remove(), 300)
    }, 3000)
}