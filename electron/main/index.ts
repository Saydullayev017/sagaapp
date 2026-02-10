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
  const window = new BrowserWindow({
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
    frame: false, // Кастомный фрейм
    transparent: true, // Прозрачность для стеклянного эффекта
    titleBarStyle: 'hidden', // Скрыть стандартную панель заголовка
    titleBarOverlay: {
      color: '#1a1a2e',
      symbolColor: '#e6e6e6',
      height: 40,
    },
    show: false, // Не показывать окно сразу
  })

  // Обработчики событий загрузки
  window.webContents.once('did-finish-load', () => {
    window.show() // Показать окно после загрузки
  })

  window.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription)
  })

  // Безопасность: предотвращение навигации
  window.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)

    // Разрешить только dev server и локальные файлы
    if (
      (process.env.NODE_ENV === 'development' && parsedUrl.origin === 'http://localhost:5173') ||
      parsedUrl.protocol === 'file:'
    ) {
      return
    }

    event.preventDefault()
  })

  // Безопасность: предотвращение новых окон
  window.webContents.setWindowOpenHandler(() => {
    // Блокировать все всплывающие окна
    return { action: 'deny' }
  })

  // Загружаем приложение
  const loadApp = () => {
    if (process.env.NODE_ENV === 'development') {
      window.loadURL('http://localhost:5173')
    } else {
      window.loadFile(path.join(__dirname, '../renderer/index.html'))
    }
  }

  loadApp()

  // DevTools в режиме разработки
  if (process.env.NODE_ENV === 'development') {
    window.webContents.openDevTools({ mode: 'detach' })
  }

  // Регистрация событий окна
  registerWindowEvents(window)

  return window
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

// Обработка событий перед выходом
app.on('before-quit', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Здесь можно добавить логику сохранения данных
    console.log('Приложение закрывается')
  }
})

// Предотвращение множественных экземпляров (для production)
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Кто-то пытается запустить второй экземпляр
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    }
  })
}
