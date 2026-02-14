/// <reference lib="dom" />

import { initializeUI } from './ui/components'
import './styles.css'
import 'xterm/css/xterm.css'

// Инициализация приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
  // Проверяем наличие API Electron
  if (!window.electronAPI) {
    document.body.innerHTML = `
      <div style="padding: 20px; color: #ff6b6b;">
        <h1>Error: Not running in Electron</h1>
        <p>This application must run in Electron environment.</p>
      </div>
    `
    return
  }

  // Инициализируем UI
  initializeUI()
})
