import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs/promises'
import path from 'path'

export const registerIpcHandlers = () => {
  // Window controls - обновленный метод
  ipcMain.on('window-minimize', event => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      window.minimize()
    }
  })

  ipcMain.on('window-maximize', event => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize()
      } else {
        window.maximize()
      }
    }
  })

  ipcMain.on('window-close', event => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      window.close()
    }
  })

  // File system handlers
  ipcMain.handle('read-file', async (_event, filePath: string) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return { success: true, content }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('write-file', async (_event, filePath: string, content: string) => {
    try {
      await fs.writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('read-directory', async (_event, dirPath: string) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      const result = entries.map(entry => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        type: entry.isDirectory() ? 'directory' : 'file',
        extension: path.extname(entry.name),
      }))
      return { success: true, entries: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Dialog handlers
  ipcMain.handle('show-open-dialog', async (_event, options) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(options)
    return { canceled, filePaths }
  })

  ipcMain.handle('show-save-dialog', async (_event, options) => {
    const { canceled, filePath } = await dialog.showSaveDialog(options)
    return { canceled, filePath }
  })

  // App info
  ipcMain.handle('get-app-version', () => {
    return process.env.npm_package_version || '1.0.0'
  })
}
