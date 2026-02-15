import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as pty from 'node-pty'

const execAsync = promisify(exec)

// Path validation for security - prevents access to sensitive system directories
const validatePath = (filePath: string): boolean => {
  const dangerousPatterns = [
    /\.\./, // Parent directory traversal
    /^\/(etc|usr|bin|sbin|var|sys|proc)\//, // System directories
    /^[A-Za-z]:\\(Windows|Program Files|System32)/, // Windows system paths
  ]
  return !dangerousPatterns.some(pattern => pattern.test(filePath))
}

// Get BrowserWindow from IPC event sender
const getSenderWindow = (
  event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent
): BrowserWindow | null => {
  return BrowserWindow.fromWebContents(event.sender)
}

// Map to store active PTY (terminal) sessions
const ptySessions = new Map<string, pty.IPty>()

// Get default shell based on platform
const getShell = (): string => {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

/**
 * Register all IPC handlers for main process communication
 */
export const registerIpcHandlers = () => {
  // Window control handlers
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

  // File system handlers
  ipcMain.handle('read-file', async (_event, filePath: string) => {
    try {
      if (!validatePath(filePath)) {
        return { success: false, error: 'Invalid file path' }
      }

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
      if (!validatePath(filePath)) {
        return { success: false, error: 'Invalid file path' }
      }

      if (content.length > 10 * 1024 * 1024) {
        return { success: false, error: 'File too large (max 10MB)' }
      }

      await fs.writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('read-directory', async (_event, dirPath: string) => {
    try {
      if (!validatePath(dirPath)) {
        return { success: false, error: 'Invalid directory path' }
      }

      const stats = await fs.stat(dirPath).catch(() => null)
      if (!stats || !stats.isDirectory()) {
        return { success: false, error: 'Directory not found' }
      }

      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      // Filter out hidden files and folders (starting with .)
      const visibleEntries = entries.filter(entry => !entry.name.startsWith('.'))
      const result = visibleEntries.map(entry => ({
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

  // Dialog handlers
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

  // App info handlers
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

  // Get system paths handler
  ipcMain.handle('get-path', async (_event, name: string) => {
    try {
      const userPath = app.getPath(name as any)
      return { success: true, path: userPath }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Check if running in development mode
  ipcMain.handle('is-dev', () => {
    return process.env.NODE_ENV === 'development'
  })

  // Git handlers
  ipcMain.handle('git-status', async (_event, cwd: string) => {
    try {
      const { stdout } = await execAsync('git status --porcelain', { cwd })
      const files = stdout.trim().split('\n').filter(Boolean)
      const status = {
        isRepo: true,
        files: files.map(line => ({
          status: line.substring(0, 2).trim(),
          path: line.substring(3).trim(),
        })),
      }
      return { success: true, ...status }
    } catch (error: any) {
      return { success: false, isRepo: false, error: error.message }
    }
  })

  ipcMain.handle('git-diff', async (_event, cwd: string, filePath?: string) => {
    try {
      const cmd = filePath ? `git diff "${filePath}"` : 'git diff'
      const { stdout } = await execAsync(cmd, { cwd })
      return { success: true, diff: stdout }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git-commit', async (_event, cwd: string, message: string) => {
    try {
      await execAsync('git add -A', { cwd })
      const { stdout } = await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd })
      return { success: true, output: stdout }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git-branch', async (_event, cwd: string) => {
    try {
      const { stdout } = await execAsync('git branch --show-current', { cwd })
      return { success: true, branch: stdout.trim() }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git-push', async (_event, cwd: string) => {
    try {
      const { stdout, stderr } = await execAsync('git push', { cwd })
      return { success: true, output: stdout || stderr }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git-pull', async (_event, cwd: string) => {
    try {
      const { stdout, stderr } = await execAsync('git pull', { cwd })
      return { success: true, output: stdout || stderr }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git-add', async (_event, cwd: string, files: string) => {
    try {
      const { stdout, stderr } = await execAsync(`git add ${files}`, { cwd })
      return { success: true, output: stdout || stderr }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git-reset', async (_event, cwd: string, files: string) => {
    try {
      const { stdout, stderr } = await execAsync(`git reset HEAD ${files}`, { cwd })
      return { success: true, output: stdout || stderr }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Git branch operations
  ipcMain.handle('git-create-branch', async (_event, cwd: string, branchName: string) => {
    try {
      const { stdout, stderr } = await execAsync(
        `git checkout -b "${branchName.replace(/"/g, '\\"')}"`,
        { cwd }
      )
      return { success: true, output: stdout || stderr }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git-checkout', async (_event, cwd: string, branchName: string) => {
    try {
      const { stdout, stderr } = await execAsync(
        `git checkout "${branchName.replace(/"/g, '\\"')}"`,
        { cwd }
      )
      return { success: true, output: stdout || stderr }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git-merge', async (_event, cwd: string, branchName: string) => {
    try {
      const { stdout, stderr } = await execAsync(`git merge "${branchName.replace(/"/g, '\\"')}"`, {
        cwd,
      })
      return { success: true, output: stdout || stderr }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git-branch-list', async (_event, cwd: string) => {
    try {
      const { stdout } = await execAsync('git branch -a', { cwd })
      const branches = stdout
        .trim()
        .split('\n')
        .map(b => b.trim().replace(/^\*\s*/, ''))
      return { success: true, branches }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // File/Folder creation handlers
  ipcMain.handle('create-file', async (_event, dirPath: string, fileName: string) => {
    try {
      const filePath = path.join(dirPath, fileName)
      await fs.writeFile(filePath, '', 'utf-8')
      return { success: true, path: filePath }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('create-folder', async (_event, dirPath: string, folderName: string) => {
    try {
      const folderPath = path.join(dirPath, folderName)
      await fs.mkdir(folderPath, { recursive: true })
      return { success: true, path: folderPath }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('delete-item', async (_event, itemPath: string) => {
    try {
      const stats = await fs.stat(itemPath)
      if (stats.isDirectory()) {
        await fs.rm(itemPath, { recursive: true })
      } else {
        await fs.unlink(itemPath)
      }
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('rename-item', async (_event, itemPath: string, newName: string) => {
    try {
      const parentDir = path.dirname(itemPath)
      const newPath = path.join(parentDir, newName)
      await fs.rename(itemPath, newPath)
      return { success: true, newPath }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Execute custom shell command
  ipcMain.handle('execute-command', async (_event, cwd: string, command: string) => {
    try {
      const { exec } = require('child_process')
      return new Promise(resolve => {
        exec(command, { cwd }, (error: any, stdout: string, stderr: string) => {
          if (error) {
            resolve({ success: false, error: error.message, output: stderr || stdout })
          } else {
            resolve({ success: true, output: stdout || stderr })
          }
        })
      })
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Terminal PTY handlers - for embedded terminal
  ipcMain.handle('terminal-create', async (event, id: string, cwd?: string) => {
    try {
      const shell = getShell()
      const workingDir = cwd || process.env.HOME || '/'

      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: workingDir,
        env: process.env as { [key: string]: string },
      })

      ptySessions.set(id, ptyProcess)

      // Send terminal output to renderer
      ptyProcess.onData(data => {
        const window = BrowserWindow.fromWebContents(event.sender)
        if (window && !window.isDestroyed()) {
          window.webContents.send('terminal-data', id, data)
        }
      })

      // Handle terminal exit
      ptyProcess.onExit(({ exitCode }) => {
        ptySessions.delete(id)
        const window = BrowserWindow.fromWebContents(event.sender)
        if (window && !window.isDestroyed()) {
          window.webContents.send('terminal-exit', id, exitCode)
        }
      })

      return { success: true, pid: ptyProcess.pid }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Handle terminal input from renderer
  ipcMain.on('terminal-input', (_event, id: string, data: string) => {
    const ptyProcess = ptySessions.get(id)
    if (ptyProcess) {
      ptyProcess.write(data)
    }
  })

  // Handle terminal resize
  ipcMain.on('terminal-resize', (_event, id: string, cols: number, rows: number) => {
    const ptyProcess = ptySessions.get(id)
    if (ptyProcess) {
      ptyProcess.resize(cols, rows)
    }
  })

  // Kill terminal session
  ipcMain.handle('terminal-kill', async (_event, id: string) => {
    try {
      const ptyProcess = ptySessions.get(id)
      if (ptyProcess) {
        ptyProcess.kill()
        ptySessions.delete(id)
      }
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}

/**
 * Register window event handlers to communicate with renderer
 */
export const registerWindowEvents = (window: BrowserWindow) => {
  // Window state events
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

  // Window size/position events
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
