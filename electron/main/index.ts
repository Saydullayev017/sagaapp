import { app, BrowserWindow } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc-handlers'

// Импорт для типов Vite (путь относительно файла)
import '../vite-env.d.ts'

// Регистрация обработчиков IPC
registerIpcHandlers()

if (require('electron-squirrel-startup')) {
  app.quit()
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    frame: false, // Кастомный фрейм
    transparent: true, // Прозрачность для стеклянного эффекта
    titleBarStyle: 'hidden', // Скрыть стандартную панель заголовка
    titleBarOverlay: {
      color: '#1a1a2e',
      symbolColor: '#e6e6e6',
      height: 40,
    },
  })

  // Загружаем приложение
  const loadApp = () => {
    if (process.env.NODE_ENV === 'development') {
      mainWindow.loadURL('http://localhost:5173')
    } else {
      mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }
  }

  loadApp()

  // DevTools в режиме разработки
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  // УБЕРИТЕ эти строки - обработчики уже в registerIpcHandlers
  // ipcMain.on('window-minimize', () => mainWindow.minimize())
  // ipcMain.on('window-maximize', () => {
  //     if (mainWindow.isMaximized()) {
  //         mainWindow.unmaximize()
  //     } else {
  //         mainWindow.maximize()
  //     }
  // })
  // ipcMain.on('window-close', () => mainWindow.close())
}

app.on('ready', createWindow)

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
