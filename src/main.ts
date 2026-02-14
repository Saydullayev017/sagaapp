/// <reference lib="dom" />

import { initializeUI } from './ui/components'
import './styles.css'

// Инициализация приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
  console.log('Japp Markdown Editor starting...')

  // Проверяем наличие API Electron
  if (!window.electronAPI) {
    console.error('Electron API not available!')
    document.body.innerHTML = `
            <div style="padding: 20px; color: #ff6b6b;">
                <h1>Error: Not running in Electron</h1>
                <p>This application must run in Electron environment.</p>
            </div>
        `
    return
  }

  try {
    // Инициализируем UI
    initializeUI()
    console.log('Application initialized successfully')
  } catch (e) {
    console.error('Error initializing UI:', e)
    document.body.innerHTML = `
            <div style="padding: 20px; color: #ff6b6b;">
                <h1>Error initializing application</h1>
                <pre>${e}</pre>
            </div>
        `
  }
})
