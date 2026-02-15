/// <reference lib="dom" />

// Import UI initialization and styles
import { initializeUI } from './ui/components'
import './styles.css'
import 'xterm/css/xterm.css'

// Hide macOS window traffic lights (close, minimize, maximize buttons)
const style = document.createElement('style')
style.textContent = `
  .traffic-lights,
  .window-traffic-lights,
  [class*="traffic"],
  .osx-dock,
  .osx-controls {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
  }
  
  body.electron-platform-darwin .traffic-light-container,
  body.electron-platform-darwin .window-controls {
    display: none !important;
  }
`
document.head.appendChild(style)

// Initialize application after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Check if running in Electron environment
  if (!window.electronAPI) {
    document.body.innerHTML = `
      <div style="padding: 20px; color: #ff6b6b;">
        <h1>Error: Not running in Electron</h1>
        <p>This application must run in Electron environment.</p>
      </div>
    `
    return
  }

  // Initialize UI
  initializeUI()
})
