import path from 'path'

import { app, BrowserWindow } from 'electron'

import { registerIpcHandlers, registerWindowEvents } from './ipc-handlers'

// Import Vite types
import '../vite-env.d.ts'

// Register IPC handlers for main process
registerIpcHandlers()

// Handle Squirrel events for Windows installer
if (require('electron-squirrel-startup')) {
  app.quit()
}

/**
 * Creates the main application window
 */
const createWindow = (): BrowserWindow => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    frame: true,
    show: true,
  })

  win.show()
  win.focus()

  // Handle window load events
  win.webContents.once('did-finish-load', () => {
    console.log('Window finished loading')
    win.show()
    win.focus()
    win.moveTop()
  })

  // Ensure window is shown immediately
  win.once('ready-to-show', () => {
    win.show()
    win.focus()
    win.moveTop()
  })

  // Handle load failures
  win.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription)
  })

  // Handle render process errors
  win.webContents.on('render-process-gone', (_, details) => {
    console.error('Render process gone:', details)
  })

  // Handle console messages from renderer
  win.webContents.on('console-message', (_, level, message, _line, _sourceId) => {
    const levels = ['debug', 'info', 'warn', 'error']
    const levelName = levels[level] || 'unknown'
    console.log(`[Renderer ${levelName}]`, message)
  })

  // Security: prevent navigation to external URLs
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)

    // Allow only dev server and local files
    if (
      (process.env.NODE_ENV === 'development' &&
        parsedUrl.origin.startsWith('http://localhost:')) ||
      parsedUrl.protocol === 'file:'
    ) {
      return
    }

    event.preventDefault()
  })

  // Security: prevent opening new windows
  win.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' }
  })

  // Load URL based on environment
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    // In dev mode, use dev server URL - try multiple ports
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5174'
    win.loadURL(devUrl).catch(() => {
      // Try alternative ports if main port fails
      win.loadURL('http://localhost:5173').catch(() => {
        win.loadURL('http://localhost:5175')
      })
    })
  } else {
    // In production, load built file
    const filePath = path.join(__dirname, '../renderer/index.html')
    win.loadFile(filePath)
  }

  // Register window events
  registerWindowEvents(win)

  return win
}

// App is ready - create window
app.on('ready', () => {
  createWindow()
})

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Recreate window on macOS when dock icon is clicked
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
