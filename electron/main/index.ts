import { app, BrowserWindow } from 'electron'
import path from 'path'
import { registerIpcHandlers, registerWindowEvents } from './ipc-handlers'

// Импорт для типов Vite (путь относительно файла)
import '../vite-env.d.ts'

// Регистрация обработчиков IPC
registerIpcHandlers()

if (require('electron-squirrel-startup')) {
  app.quit()
}

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
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
    frame: false,
    titleBarStyle: 'hidden',
    show: true,
  })

  win.show()
  win.focus()

  // Обработчики событий загрузки
  win.webContents.once('did-finish-load', () => {
    console.log('Window finished loading')
    win.show()
    win.focus()
    win.moveTop()
  })

  // Show window immediately and ensure it's visible
  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })

  win.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription)
  })

  // Безопасность: предотвращение навигации
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)

    // Разрешить только dev server и локальные файлы
    if (
      (process.env.NODE_ENV === 'development' &&
        parsedUrl.origin.startsWith('http://localhost:')) ||
      parsedUrl.protocol === 'file:'
    ) {
      return
    }

    event.preventDefault()
  })

  // Безопасность: предотвращение новых окон
  win.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' }
  })

  // Загружаем production сборку
  const filePath = path.join(__dirname, '../renderer/index.html')
  console.log('Loading:', filePath)
  win.loadFile(filePath)

  // Регистрация событий окна
  registerWindowEvents(win)

  return win
}

app.on('ready', () => {
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
