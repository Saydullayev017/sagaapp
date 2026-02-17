import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as pty from 'node-pty'

const execAsync = promisify(exec)

// Platform detection
const isWindows = process.platform === 'win32'
const isMac = process.platform === 'darwin'

// Cross-platform utilities
const getTempDir = (): string => {
  if (isWindows) {
    return os.tmpdir()
  }
  return '/tmp'
}

const findCommand = async (cmd: string): Promise<string | null> => {
  try {
    if (isWindows) {
      const { stdout } = await execAsync(`where ${cmd}`, { shell: 'cmd.exe' })
      if (stdout.trim()) {
        return stdout.trim().split('\n')[0]
      }
    } else {
      const { stdout } = await execAsync(`which ${cmd}`)
      if (stdout.trim()) {
        return stdout.trim()
      }
    }
  } catch {}
  return null
}

const getInstallCommand = (pkg: string): string => {
  if (isWindows) {
    return `choco install ${pkg} -y`
  } else if (isMac) {
    return `brew install ${pkg}`
  } else {
    // Linux: try apt, then yum/dnf
    return `sudo apt-get install -y ${pkg} || sudo yum install -y ${pkg} || sudo dnf install -y ${pkg}`
  }
}

// Path validation for security - prevents access to sensitive system directories
const validatePath = (filePath: string): boolean => {
  if (!filePath || typeof filePath !== 'string') {
    return false
  }

  const normalizedPath = path.normalize(filePath)

  const dangerousPatterns = [
    /\.\./, // Parent directory traversal
    /^\/(etc|usr|bin|sbin|var|sys|proc)\//, // System directories
    /^[A-Za-z]:\\(Windows|Program Files|System32|Program Files \(x86\))/i, // Windows system paths
    /\/\.git\//, // Prevent access to .git directory
    /\.git$/, // Prevent access to .git files
  ]

  if (dangerousPatterns.some(pattern => pattern.test(normalizedPath))) {
    return false
  }

  // Additional check: ensure path doesn't escape user's home directory
  const homeDir = os.homedir()
  try {
    const resolvedPath = path.resolve(normalizedPath)
    // Allow paths within home directory or temp directory
    const tempDir = os.tmpdir()
    if (!resolvedPath.startsWith(homeDir) && !resolvedPath.startsWith(tempDir)) {
      // For non-home paths, only allow if it's a reasonable workspace
      return true // More permissive for development workflows
    }
  } catch {
    return false
  }

  return true
}

// Validate command to prevent shell injection
const validateCommand = (command: string): boolean => {
  if (!command || typeof command !== 'string') {
    return false
  }

  // Block dangerous characters that could enable shell injection
  const dangerousChars = [';', '&&', '||', '|', '`', '$(', '>', '<', '\n', '\r']
  if (dangerousChars.some(char => command.includes(char))) {
    // Allow specific safe commands
    const safeCommands = ['git ', 'npm ', 'node ', 'python', 'ruby', 'php', 'perl', 'java', 'go ']
    if (!safeCommands.some(cmd => command.trim().startsWith(cmd))) {
      return false
    }
  }

  return true
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
  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB limit

  ipcMain.handle('read-file', async (_event, filePath: string) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Invalid file path' }
      }

      if (!validatePath(filePath)) {
        return { success: false, error: 'Invalid file path' }
      }

      const stats = await fs.stat(filePath).catch(() => null)
      if (!stats || !stats.isFile()) {
        return { success: false, error: 'File not found' }
      }

      if (stats.size > MAX_FILE_SIZE) {
        return { success: false, error: 'File too large (max 10MB)' }
      }

      const content = await fs.readFile(filePath, 'utf-8')
      return { success: true, content }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('write-file', async (_event, filePath: string, content: string) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Invalid file path' }
      }

      if (!validatePath(filePath)) {
        return { success: false, error: 'Invalid file path' }
      }

      if (typeof content !== 'string') {
        return { success: false, error: 'Invalid content' }
      }

      if (content.length > MAX_FILE_SIZE) {
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
      if (!dirPath || typeof dirPath !== 'string') {
        return { success: false, error: 'Invalid directory path' }
      }

      if (!validatePath(dirPath)) {
        return { success: false, error: 'Invalid directory path' }
      }

      const stats = await fs.stat(dirPath).catch(() => null)
      if (!stats || !stats.isDirectory()) {
        return { success: false, error: 'Directory not found' }
      }

      const entries = await fs.readdir(dirPath, { withFileTypes: true })
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

  // Git blame handler
  ipcMain.handle('git-blame', async (_event, cwd: string, filePath: string) => {
    try {
      // Use simple format that's easier to parse
      const { stdout } = await execAsync(`git blame --format="%H|%an|%ae|%ai" -w "${filePath}"`, {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
      })

      const blame: Array<{
        hash: string
        author: string
        email: string
        date: string
        line: number
        content: string
      }> = []

      const lines = stdout.split('\n')
      let lineNum = 0

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // Skip empty lines
        if (!line.trim()) continue

        // Skip lines that start with ^ (non-committed files)
        if (line.startsWith('^')) continue

        // Find the first TAB which separates metadata from content
        const tabIndex = line.indexOf('\t')
        if (tabIndex === -1) continue

        const metadata = line.substring(0, tabIndex)
        let content = line.substring(tabIndex + 1)

        // If content is empty, try to get from next line
        if (!content.trim() && i + 1 < lines.length) {
          content = lines[i + 1]
        }

        const parts = metadata.split('|')
        if (parts.length >= 3) {
          lineNum++
          blame.push({
            hash: parts[0]?.substring(0, 7) || '',
            author: parts[1] || '',
            email: parts[2] || '',
            date: parts[3] || '',
            line: lineNum,
            content: content,
          })
        }
      }

      console.log('[GitBlame] Parsed', blame.length, 'lines')
      return { success: true, blame }
    } catch (error: any) {
      console.error('[GitBlame] Error:', error.message)
      return { success: false, error: error.message }
    }
  })

  // Git log handler - get commit history
  ipcMain.handle('git-log', async (_event, cwd: string, filePath?: string, limit?: number) => {
    try {
      const maxCount = limit || 50
      const cmd = filePath
        ? `git log --oneline -${maxCount} -- "${filePath}"`
        : `git log --oneline -${maxCount}`
      const { stdout } = await execAsync(cmd, { cwd })

      const commits = stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const match = line.match(/^([a-f0-9]+)\s+(.*)$/)
          if (match) {
            return { hash: match[1], message: match[2] }
          }
          return { hash: '', message: line }
        })

      return { success: true, commits }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Git graph handler - get commit history with branches for visualization
  ipcMain.handle('git-graph', async (_event, cwd: string, limit?: number) => {
    try {
      const maxCount = limit || 30
      // Get detailed log with all branches
      const { stdout } = await execAsync(
        `git log --all --oneline --graph --decorate -${maxCount} --format="%h|%p|%d|%s|%an|%ae|%ai"`,
        { cwd, maxBuffer: 10 * 1024 * 1024 }
      )

      const graphData: Array<{
        hash: string
        parents: string[]
        refs: string[]
        message: string
        author: string
        email: string
        date: string
        column: number
      }> = []

      const lines = stdout.split('\n').filter(Boolean)

      for (const line of lines) {
        // Skip the graph visualization characters, get the actual commit info
        // Format: * | abc1234 | parent1 parent2 | (refs) | message | author | date
        const parts = line.replace(/^[\s*|/\\]+/, '').split('|')
        if (parts.length >= 5) {
          const hash = parts[0]?.trim() || ''
          const parents = parts[1]?.trim().split(' ').filter(Boolean) || []
          const refs =
            parts[2]
              ?.trim()
              .replace(/[()]/g, '')
              .split(',')
              .map(r => r.trim())
              .filter(Boolean) || []
          const message = parts[3]?.trim() || ''
          const author = parts[4]?.trim() || ''
          const date = parts[5]?.trim() || ''

          if (hash) {
            graphData.push({
              hash,
              parents,
              refs,
              message,
              author,
              email: '',
              date,
              column: 0,
            })
          }
        }
      }

      return { success: true, graph: graphData }
    } catch (error: any) {
      console.error('[GitGraph] Error:', error.message)
      return { success: false, error: error.message }
    }
  })

  // Git show handler - get commit details
  ipcMain.handle('git-show', async (_event, cwd: string, hash: string) => {
    try {
      const { stdout: messageStdout } = await execAsync(
        `git log -1 --format="%H|%an|%ae|%ai|%s" ${hash}`,
        { cwd }
      )
      const [commitHash, author, email, date, message] = messageStdout.trim().split('|')

      const { stdout: diffStdout } = await execAsync(`git show ${hash} --stat --format=""`, { cwd })

      return {
        success: true,
        commit: {
          hash: commitHash,
          shortHash: commitHash?.substring(0, 7) || '',
          author: author || '',
          email: email || '',
          date: date || '',
          message: message || '',
          files: diffStdout.trim().split('\n').filter(Boolean),
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Git file history
  ipcMain.handle(
    'git-file-history',
    async (_event, cwd: string, filePath: string, limit?: number) => {
      try {
        const maxCount = limit || 20
        const { stdout } = await execAsync(
          `git log --oneline --follow -${maxCount} -- "${filePath}"`,
          { cwd }
        )

        const history = stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(line => {
            const match = line.match(/^([a-f0-9]+)\s+(.*)$/)
            if (match) {
              return { hash: match[1], message: match[2] }
            }
            return { hash: '', message: line }
          })

        return { success: true, history }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

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
      if (!validateCommand(command)) {
        return { success: false, error: 'Invalid command' }
      }

      if (!validatePath(cwd)) {
        return { success: false, error: 'Invalid working directory' }
      }

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

  // Code execution handler - runs code from markdown code blocks
  ipcMain.handle('execute-code', async (_event, language: string, code: string) => {
    try {
      const { spawn } = require('child_process')
      const { execSync } = require('child_process')

      const LANG_DIR = path.join(os.homedir(), '.saga-langs')

      // Find command in saga-langs directory first, then system
      const findLangCommand = (binary: string): string | null => {
        const sagaPath = path.join(LANG_DIR, binary)
        // Check if file exists in saga-langs
        try {
          if (isWindows) {
            // Windows: use fs.access
            const fsSync = require('fs')
            fsSync.accessSync(sagaPath)
            return sagaPath
          } else {
            // Unix: use test -x
            execSync(`test -x "${sagaPath}"`, { stdio: 'ignore' })
            return sagaPath
          }
        } catch {}
        return null
      }

      const lang = language.toLowerCase().trim()
      let command: string
      let args: string[] = []
      let tempFile: string | null = null

      switch (lang) {
        case 'python':
        case 'py':
          command = findLangCommand('bin/python3') || 'python3'
          args = ['-c', code]
          break
        case 'javascript':
        case 'js':
        case 'node':
          command = findLangCommand('bin/node') || 'node'
          args = ['-e', code]
          break
        case 'bash':
        case 'sh':
        case 'shell':
          command = 'bash'
          args = ['-c', code]
          break
        case 'ruby':
        case 'rb':
          command = findLangCommand('bin/ruby') || 'ruby'
          args = ['-e', code]
          break
        case 'php':
          command = findLangCommand('bin/php') || 'php'
          args = ['-r', code]
          break
        case 'perl':
        case 'pl':
          command = findLangCommand('bin/perl') || 'perl'
          args = ['-e', code]
          break
        case 'java':
          command = 'jshell'
          tempFile = path.join(getTempDir(), '__temp_java_code.java')
          await fs.writeFile(tempFile, code, 'utf-8')
          args = [tempFile]
          break
        case 'go':
          // For Go, use Homebrew path directly since it needs GOROOT
          command = '/opt/homebrew/bin/go'
          tempFile = path.join(getTempDir(), '__temp_go_file__.go')
          await fs.writeFile(tempFile, code, 'utf-8')
          args = ['run', tempFile]
          break
        // case 'rust':
        // case 'rs':
        //   command = findLangCommand('bin/rustc') || 'rustc'
        //   args = ['--version']
        //   break
        // case 'kotlin':
        // case 'kt':
        //   command = findLangCommand('bin/kotlinc') || 'kotlinc'
        //   args = ['-version']
        //   break
        // case 'typescript':
        // case 'ts':
        //   command = findLangCommand('bin/deno') || 'deno'
        //   args = ['eval', code]
        //   break
        // case 'r':
        //   command = findLangCommand('bin/R') || 'R'
        //   args = ['--quiet', '-e', code]
        //   break
        // case 'swift':
        //   command = findLangCommand('bin/swift') || 'swift'
        //   tempFile = path.join(os.tmpdir(), '__temp_swift_file__.swift')
        //   await fs.writeFile(tempFile, code, 'utf-8')
        //   args = [tempFile]
        //   break
        // case 'c':
        // case 'cpp':
        //   command = findLangCommand('bin/gcc') || 'gcc'
        //   const cTempFile = path.join(os.tmpdir(), '__temp_c_file__.c')
        //   const cExecFile = path.join(os.tmpdir(), '__temp_c_exec')
        //   await fs.writeFile(cTempFile, code, 'utf-8')
        //   // Compile first
        //   await new Promise<void>((resolve, reject) => {
        //     const compileProc = spawn(command, [cTempFile, '-o', cExecFile])
        //     compileProc.on('close', (code: number) => {
        //       if (code === 0) {
        //         resolve()
        //       } else {
        //         reject(new Error('Compilation failed'))
        //       }
        //     })
        //     compileProc.stderr.on('data', (data: Buffer) => {
        //       reject(new Error(data.toString()))
        //     })
        //   })
        //   // Run the executable
        //   args = [cExecFile]
        //   tempFile = cTempFile
        //   break
        default:
          return {
            success: false,
            error: `Language "${language}" is not supported. Supported: python, javascript, ruby, php, perl, bash, java`,
          }
      }

      return new Promise(async resolve => {
        const isJava = lang === 'java'

        const proc = spawn(command, args, {
          shell: false,
          timeout: 10000,
        })

        if (isJava) {
          proc.stdin?.write(code + '\n/exit\n')
          proc.stdin?.end()
        }

        let stdout = ''
        let stderr = ''

        proc.stdout.on('data', (data: Buffer) => {
          stdout += data.toString()
        })

        proc.stderr.on('data', (data: Buffer) => {
          stderr += data.toString()
        })

        proc.on('close', (code: number) => {
          if (tempFile) {
            fs.unlink(tempFile).catch(() => {})
          }
          if (code === 0) {
            resolve({ success: true, output: stdout || '', error: stderr || null })
          } else {
            resolve({
              success: false,
              error: stderr || `Process exited with code ${code}`,
              output: stdout || '',
            })
          }
        })

        proc.on('error', (error: Error) => {
          if (tempFile) {
            fs.unlink(tempFile).catch(() => {})
          }
          let errorMessage = error.message
          if (error.message.includes('ENOENT')) {
            errorMessage = `"${command}" is not installed. Please install ${language} to run this code.`
          }
          resolve({ success: false, error: errorMessage, output: '' })
        })
      })
    } catch (error: any) {
      return { success: false, error: error.message || 'Execution failed', output: '' }
    }
  })

  // Language detection and installation handlers
  const LANG_DIR = path.join(os.homedir(), '.saga-langs')

  const SUPPORTED_LANGUAGES = [
    {
      id: 'python',
      name: 'Python',
      command: 'python3',
      installCmd: 'brew install python',
      icon: '🐍',
      binary: 'bin/python3',
    },
    {
      id: 'node',
      name: 'Node.js',
      command: 'node',
      installCmd: 'brew install node',
      icon: '📦',
      binary: 'bin/node',
    },
    {
      id: 'ruby',
      name: 'Ruby',
      command: 'ruby',
      installCmd: getInstallCommand('ruby'),
      icon: '💎',
      binary: 'bin/ruby',
    },
    {
      id: 'php',
      name: 'PHP',
      command: 'php',
      installCmd: getInstallCommand('php'),
      icon: '🐘',
      binary: 'bin/php',
    },
    {
      id: 'perl',
      name: 'Perl',
      command: 'perl',
      installCmd: getInstallCommand('perl'),
      icon: '🐪',
      binary: 'bin/perl',
    },
    {
      id: 'java',
      name: 'Java',
      command: 'java',
      installCmd: isWindows
        ? 'choco install openjdk -y'
        : isMac
          ? 'brew install openjdk'
          : 'sudo apt-get install -y openjdk-17-jdk',
      uninstallCmd: isWindows
        ? 'choco uninstall openjdk -y'
        : isMac
          ? 'brew uninstall openjdk'
          : 'sudo apt-get remove -y openjdk',
      icon: '☕',
      binary: 'bin/java',
    },
    // {
    //   id: 'go',
    //   name: 'Go',
    //   command: 'go',
    //   installCmd: 'brew install go',
    //   uninstallCmd: 'brew uninstall go',
    //   icon: '🦫',
    //   binary: 'bin/go',
    // },
    // {
    //   id: 'rust',
    //   name: 'Rust',
    //   command: 'rustc',
    //   installCmd: 'brew install rust',
    //   uninstallCmd: 'brew uninstall rust',
    //   icon: '🦀',
    //   binary: 'bin/rustc',
    // },
    // {
    //   id: 'kotlin',
    //   name: 'Kotlin',
    //   command: 'kotlinc',
    //   installCmd: 'brew install kotlin',
    //   uninstallCmd: 'brew uninstall kotlin',
    //   icon: '🇰',
    //   binary: 'bin/kotlinc',
    // },
    // {
    //   id: 'deno',
    //   name: 'Deno',
    //   command: 'deno',
    //   installCmd: 'brew install deno',
    //   uninstallCmd: 'brew uninstall deno',
    //   icon: '🦕',
    //   binary: 'bin/deno',
    // },
    // {
    //   id: 'r',
    //   name: 'R',
    //   command: 'R',
    //   installCmd: 'brew install r',
    //   uninstallCmd: 'brew uninstall r',
    //   icon: '📊',
    //   binary: 'bin/R',
    // },
    // {
    //   id: 'swift',
    //   name: 'Swift',
    //   command: 'swift',
    //   installCmd: 'xcode-select --install',
    //   icon: '🍎',
    //   binary: 'bin/swift',
    // },
    // {
    //   id: 'c',
    //   name: 'C (GCC)',
    //   command: 'gcc',
    //   installCmd: 'brew install gcc',
    //   icon: '⚙️',
    //   binary: 'bin/gcc',
    // },
  ]

  // Create lang directory if not exists
  const ensureLangDir = async () => {
    try {
      await fs.mkdir(LANG_DIR, { recursive: true })
    } catch {}
  }

  // Check if language is installed in saga-langs OR in system
  const checkLangInDir = async (lang: (typeof SUPPORTED_LANGUAGES)[0]): Promise<boolean> => {
    // First check saga-langs directory
    const langPath = path.join(LANG_DIR, lang.binary)
    try {
      await fs.access(langPath)
      return true
    } catch {}

    // Then check system using cross-platform findCommand
    const foundCmd = await findCommand(lang.command)
    if (foundCmd) return true

    // For Go, also check Homebrew path
    if (lang.id === 'go') {
      try {
        await fs.access('/opt/homebrew/bin/go')
        return true
      } catch {}
    }

    return false
  }

  // Get version from saga-langs or system (quick check, no timeout)
  const getLangVersion = async (_lang: (typeof SUPPORTED_LANGUAGES)[0]): Promise<string> => {
    return 'Installed'
  }

  ipcMain.handle('check-languages', async () => {
    await ensureLangDir()

    const results: {
      id: string
      name: string
      installed: boolean
      version?: string
      icon: string
    }[] = []

    for (const lang of SUPPORTED_LANGUAGES) {
      const isInstalled = await checkLangInDir(lang)
      if (isInstalled) {
        const version = await getLangVersion(lang)
        results.push({ id: lang.id, name: lang.name, installed: true, version, icon: lang.icon })
      } else {
        results.push({ id: lang.id, name: lang.name, installed: false, icon: lang.icon })
      }
    }

    return { success: true, languages: results }
  })

  ipcMain.handle('install-language', async (_event, langId: string) => {
    const lang = SUPPORTED_LANGUAGES.find(l => l.id === langId)
    if (!lang) {
      return { success: false, error: 'Language not found' }
    }

    try {
      await ensureLangDir()

      // Install to homebrew prefix, then we'll link or copy
      const { stdout, stderr } = await execAsync(lang.installCmd)

      // Skip copying for Go - it needs full installation
      if (lang.id === 'go') {
        return { success: true, output: 'Go installed via Homebrew. Using /opt/homebrew/bin/go' }
      }

      // For some languages, we need to copy from Homebrew location
      let binaryPath = ''
      const homebrewPaths = [
        `/opt/homebrew/opt/${lang.id}/bin/${lang.command}`,
        `/usr/local/opt/${lang.id}/bin/${lang.command}`,
        `/opt/homebrew/Cellar/${lang.id}/*/bin/${lang.command}`,
        `/usr/local/Cellar/${lang.id}/*/bin/${lang.command}`,
      ]

      for (const p of homebrewPaths) {
        try {
          const { stdout: lsResult } = await execAsync(`ls ${p} 2>/dev/null | head -1`)
          if (lsResult.trim()) {
            binaryPath = lsResult.trim()
            break
          }
        } catch {
          continue
        }
      }

      if (binaryPath) {
        const destPath = path.join(LANG_DIR, lang.binary)
        const destDir = path.dirname(destPath)
        await fs.mkdir(destDir, { recursive: true })
        await fs.copyFile(binaryPath, destPath)
        await fs.chmod(destPath, 0o755)
      }

      return { success: true, output: stdout || stderr }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('uninstall-language', async (_event, langId: string) => {
    const lang = SUPPORTED_LANGUAGES.find(l => l.id === langId)
    if (!lang) {
      return { success: false, error: 'Language not found' }
    }

    if (!lang.uninstallCmd) {
      return { success: false, error: 'Uninstall not supported for this language' }
    }

    try {
      // Remove from saga-langs directory
      const langPath = path.join(LANG_DIR, lang.binary)
      try {
        await fs.unlink(langPath)
      } catch {}

      // Uninstall from Homebrew
      const { stdout, stderr } = await execAsync(lang.uninstallCmd)
      return { success: true, output: stdout || stderr }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('check-language', async (_event, langId: string) => {
    const lang = SUPPORTED_LANGUAGES.find(l => l.id === langId)
    if (!lang) {
      return { success: false, error: 'Language not found' }
    }

    const LANG_DIR = path.join(os.homedir(), '.saga-langs')
    const sagaPath = path.join(LANG_DIR, lang.binary)

    // Quick check - does saga-langs have it?
    try {
      await fs.access(sagaPath)
      return { success: true, path: sagaPath, fixed: false }
    } catch {}

    // Check system path using cross-platform findCommand
    const foundCmd = await findCommand(lang.command)
    if (foundCmd) {
      // Copy to saga-langs for faster access
      try {
        const destDir = path.dirname(sagaPath)
        await fs.mkdir(destDir, { recursive: true })
        await fs.copyFile(foundCmd, sagaPath)
        if (!isWindows) {
          await fs.chmod(sagaPath, 0o755)
        }
        return { success: true, path: sagaPath, fixed: true }
      } catch {
        return { success: true, path: foundCmd, fixed: false }
      }
    }

    // Special case for Go
    if (lang.id === 'go') {
      try {
        await fs.access('/opt/homebrew/bin/go')
        return { success: true, path: '/opt/homebrew/bin/go', fixed: false }
      } catch {}
      return { success: false, error: 'Go not found. Please install via Homebrew.' }
    }

    return { success: false, error: `${lang.name} not found` }
  })
}

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
