import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

// Валидация путей для безопасности
const validatePath = (filePath: string): boolean => {
  // Базовая проверка на опасные пути
  const dangerousPatterns = [
    /\.\./, // Родительские директории
    /^\/(etc|usr|bin|sbin|var|sys|proc)\//, // Системные директории
    /^[A-Za-z]:\\(Windows|Program Files|System32)/, // Windows системные пути
  ]

  return !dangerousPatterns.some(pattern => pattern.test(filePath))
}

// Безопасное получение окна
const getSenderWindow = (
  event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent
): BrowserWindow | null => {
  return BrowserWindow.fromWebContents(event.sender)
}

export const registerIpcHandlers = () => {
  // Window controls с улучшенной безопасностью
  ipcMain.on('window-minimize', event => {
    const window = getSenderWindow(event)
    if (window && !window.isDestroyed()) {
      window.minimize()
    }
  })

  ipcMain.on('window-maximize', event => {
    const window = getSenderWindow(event)
    if (window && !window.isDestroyed()) {
      if (window.isMaximized()) {
        window.unmaximize()
      } else {
        window.maximize()
      }
    }
  })

  ipcMain.on('window-close', event => {
    const window = getSenderWindow(event)
    if (window && !window.isDestroyed()) {
      window.close()
    }
  })

  // File system handlers с валидацией безопасности
  ipcMain.handle('read-file', async (_event, filePath: string) => {
    try {
      // Валидация пути
      if (!validatePath(filePath)) {
        return { success: false, error: 'Invalid file path' }
      }

      // Проверка существования файла
      const stats = await fs.stat(filePath).catch(() => null)
      if (!stats || !stats.isFile()) {
        return { success: false, error: 'File not found' }
      }

      const content = await fs.readFile(filePath, 'utf-8')
      return { success: true, content }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('write-file', async (_event, filePath: string, content: string) => {
    try {
      // Валидация пути
      if (!validatePath(filePath)) {
        return { success: false, error: 'Invalid file path' }
      }

      // Проверка размера контента
      if (content.length > 10 * 1024 * 1024) {
        // 10MB лимит
        return { success: false, error: 'File too large' }
      }

      await fs.writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('read-directory', async (_event, dirPath: string) => {
    try {
      // Валидация пути
      if (!validatePath(dirPath)) {
        return { success: false, error: 'Invalid directory path' }
      }

      // Проверка существования директории
      const stats = await fs.stat(dirPath).catch(() => null)
      if (!stats || !stats.isDirectory()) {
        return { success: false, error: 'Directory not found' }
      }

      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      const result = entries.map(entry => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        type: entry.isDirectory() ? 'directory' : 'file',
        extension: path.extname(entry.name),
        size: entry.isFile() ? (entry as any).size || 0 : undefined,
      }))
      return { success: true, entries: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Dialog handlers с улучшенной типизацией
  ipcMain.handle('show-open-dialog', async (event, options: Electron.OpenDialogOptions) => {
    const window = getSenderWindow(event)
    if (!window || window.isDestroyed()) {
      return { canceled: true, filePaths: [] }
    }

    try {
      const result = await dialog.showOpenDialog(window, options)
      return result
    } catch (error: any) {
      return { canceled: true, filePaths: [], error: error.message }
    }
  })

  ipcMain.handle('show-save-dialog', async (event, options: Electron.SaveDialogOptions) => {
    const window = getSenderWindow(event)
    if (!window || window.isDestroyed()) {
      return { canceled: true }
    }

    try {
      const result = await dialog.showSaveDialog(window, options)
      return result
    } catch (error: any) {
      return { canceled: true, error: error.message }
    }
  })

  // App info с большей информацией
  ipcMain.handle('get-app-version', () => {
    return app.getVersion() || process.env.npm_package_version || '1.0.0'
  })

  ipcMain.handle('get-app-info', () => {
    return {
      version: app.getVersion(),
      name: app.getName(),
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome,
    }
  })

  // Дополнительные полезные обработчики
  ipcMain.handle('get-path', async (_event, name: string) => {
    try {
      const userPath = app.getPath(name as any)
      return { success: true, path: userPath }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('is-dev', () => {
    return process.env.NODE_ENV === 'development'
  })
}

// Регистрация событий окна
export const registerWindowEvents = (window: BrowserWindow) => {
  // События изменения состояния окна
  window.on('minimize', () => {
    window.webContents.send('window-minimized')
  })

  window.on('maximize', () => {
    window.webContents.send('window-maximized', true)
  })

  window.on('unmaximize', () => {
    window.webContents.send('window-maximized', false)
  })

  window.on('focus', () => {
    window.webContents.send('window-focused')
  })

  window.on('blur', () => {
    window.webContents.send('window-blurred')
  })

  window.on('resize', () => {
    const [width, height] = window.getContentSize()
    window.webContents.send('window-resized', width, height)
  })

  window.on('move', () => {
    const [x, y] = window.getPosition()
    window.webContents.send('window-moved', x, y)
  })

  window.on('close', () => {
    window.webContents.send('window-closed')
  })
}
