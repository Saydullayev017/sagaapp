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

// Хранение ссылки на главное окно
let mainWindow: BrowserWindow | null = null

const createWindow = (): BrowserWindow => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      plugins: false,
    },
    frame: false, // Кастомный фрейм (безрамочное окно)
    transparent: false, // Прозрачность отключена (вызывала проблемы)
    titleBarStyle: 'hidden', // Скрыть стандартную панель заголовка
    titleBarOverlay: false,
    show: true, // Показывать окно сразу
  })

  // Обработчики событий загрузки
  win.webContents.once('did-finish-load', () => {
    console.log('Window finished loading')
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
    // Блокировать все всплывающие окна
    return { action: 'deny' }
  })

  // Загружаем приложение - пробуем все возможные порты
  const loadDevApp = async () => {
    const ports = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180]

    for (const port of ports) {
      try {
        await win.loadURL(`http://localhost:${port}`)
        console.log(`Loaded from http://localhost:${port}`)
        win.webContents.openDevTools({ mode: 'detach' })
        return
      } catch (e) {
        console.log(`Failed to load port ${port}`)
      }
    }

    // Если не удалось - пробуем production
    console.log('Loading production build...')
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  loadDevApp()

  // Регистрация событий окна
  registerWindowEvents(win)

  return win
}

app.on('ready', () => {
  mainWindow = createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow()
  }
})
