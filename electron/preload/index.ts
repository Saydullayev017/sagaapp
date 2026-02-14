import { contextBridge, ipcRenderer } from 'electron'

// Типы для API
export interface ElectronAPI {
  // Window controls
  minimizeWindow: () => void
  toggleMaximize: () => void
  closeWindow: () => void

  // File system
  readFile: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>
  writeFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>
  readDirectory: (path: string) => Promise<{
    success: boolean
    entries?: Array<{ name: string; path: string; type: 'file' | 'directory'; extension: string }>
    error?: string
  }>

  // Dialogs
  showOpenDialog: (
    options: Electron.OpenDialogOptions
  ) => Promise<{ canceled: boolean; filePaths: string[] }>
  showSaveDialog: (
    options: Electron.SaveDialogOptions
  ) => Promise<{ canceled: boolean; filePath?: string }>

  // App info
  getAppVersion: () => Promise<string>

  // Window events
  onWindowMinimize: (callback: () => void) => void
  onWindowMaximize: (callback: (isMaximized: boolean) => void) => void
  onWindowClose: (callback: () => void) => void
  onWindowFocus: (callback: () => void) => void
  onWindowBlur: (callback: () => void) => void
  onWindowResize: (callback: (width: number, height: number) => void) => void
  onWindowMove: (callback: (x: number, y: number) => void) => void

  // Events management
  onWindowEvent: (callback: (event: string, data?: any) => void) => void
  removeAllListeners: (channel: string) => void

  // Git
  gitStatus: (cwd: string) => Promise<{
    success: boolean
    isRepo?: boolean
    files?: Array<{ status: string; path: string }>
    error?: string
  }>
  gitDiff: (
    cwd: string,
    filePath?: string
  ) => Promise<{ success: boolean; diff?: string; error?: string }>
  gitCommit: (
    cwd: string,
    message: string
  ) => Promise<{ success: boolean; output?: string; error?: string }>
  gitBranch: (cwd: string) => Promise<{ success: boolean; branch?: string; error?: string }>
  gitPush: (cwd: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitPull: (cwd: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitAdd: (
    cwd: string,
    files: string
  ) => Promise<{ success: boolean; output?: string; error?: string }>
  gitReset: (
    cwd: string,
    files: string
  ) => Promise<{ success: boolean; output?: string; error?: string }>
  executeCommand: (
    cwd: string,
    command: string
  ) => Promise<{ success: boolean; output?: string; error?: string }>

  // File/Folder operations
  createFile: (
    dirPath: string,
    fileName: string
  ) => Promise<{ success: boolean; path?: string; error?: string }>
  createFolder: (
    dirPath: string,
    folderName: string
  ) => Promise<{ success: boolean; path?: string; error?: string }>
  deleteItem: (itemPath: string) => Promise<{ success: boolean; error?: string }>

  // Terminal
  terminalCreate: (
    id: string,
    cwd?: string
  ) => Promise<{ success: boolean; pid?: number; error?: string }>
  terminalInput: (id: string, data: string) => void
  terminalResize: (id: string, cols: number, rows: number) => void
  terminalKill: (id: string) => Promise<{ success: boolean; error?: string }>
  onTerminalData: (callback: (id: string, data: string) => void) => void
  onTerminalExit: (callback: (id: string, exitCode: number) => void) => void
}

// Безопасный API через contextBridge
const electronAPI: ElectronAPI = {
  // Window controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  toggleMaximize: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // File system
  readFile: (path: string) => ipcRenderer.invoke('read-file', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('write-file', path, content),
  readDirectory: (path: string) => ipcRenderer.invoke('read-directory', path),

  // Dialogs
  showOpenDialog: (options: Electron.OpenDialogOptions) =>
    ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options: Electron.SaveDialogOptions) =>
    ipcRenderer.invoke('show-save-dialog', options),

  // Utils
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Window events
  onWindowMinimize: (callback: () => void) => {
    ipcRenderer.on('window-minimized', () => callback())
  },

  onWindowMaximize: (callback: (isMaximized: boolean) => void) => {
    ipcRenderer.on('window-maximized', (_, isMaximized) => callback(isMaximized))
  },

  onWindowClose: (callback: () => void) => {
    ipcRenderer.on('window-closed', () => callback())
  },

  onWindowFocus: (callback: () => void) => {
    ipcRenderer.on('window-focused', () => callback())
  },

  onWindowBlur: (callback: () => void) => {
    ipcRenderer.on('window-blurred', () => callback())
  },

  onWindowResize: (callback: (width: number, height: number) => void) => {
    ipcRenderer.on('window-resized', (_, width, height) => callback(width, height))
  },

  onWindowMove: (callback: (x: number, y: number) => void) => {
    ipcRenderer.on('window-moved', (_, x, y) => callback(x, y))
  },

  // Events handling
  onWindowEvent: (callback: (event: string, data?: any) => void) => {
    ipcRenderer.on('window-event', (_, event, data) => callback(event, data))
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },

  // Git
  gitStatus: (cwd: string) => ipcRenderer.invoke('git-status', cwd),
  gitDiff: (cwd: string, filePath?: string) => ipcRenderer.invoke('git-diff', cwd, filePath),
  gitCommit: (cwd: string, message: string) => ipcRenderer.invoke('git-commit', cwd, message),
  gitBranch: (cwd: string) => ipcRenderer.invoke('git-branch', cwd),
  gitPush: (cwd: string) => ipcRenderer.invoke('git-push', cwd),
  gitPull: (cwd: string) => ipcRenderer.invoke('git-pull', cwd),
  gitAdd: (cwd: string, files: string) => ipcRenderer.invoke('git-add', cwd, files),
  gitReset: (cwd: string, files: string) => ipcRenderer.invoke('git-reset', cwd, files),

  // File/Folder operations
  createFile: (dirPath: string, fileName: string) =>
    ipcRenderer.invoke('create-file', dirPath, fileName),
  createFolder: (dirPath: string, folderName: string) =>
    ipcRenderer.invoke('create-folder', dirPath, folderName),
  deleteItem: (itemPath: string) => ipcRenderer.invoke('delete-item', itemPath),
  executeCommand: (cwd: string, command: string) =>
    ipcRenderer.invoke('execute-command', cwd, command),

  // Terminal
  terminalCreate: (id: string, cwd?: string) => ipcRenderer.invoke('terminal-create', id, cwd),
  terminalInput: (id: string, data: string) => ipcRenderer.send('terminal-input', id, data),
  terminalResize: (id: string, cols: number, rows: number) =>
    ipcRenderer.send('terminal-resize', id, cols, rows),
  terminalKill: (id: string) => ipcRenderer.invoke('terminal-kill', id),
  onTerminalData: (callback: (id: string, data: string) => void) => {
    ipcRenderer.on('terminal-data', (_, id, data) => callback(id, data))
  },
  onTerminalExit: (callback: (id: string, exitCode: number) => void) => {
    ipcRenderer.on('terminal-exit', (_, id, exitCode) => callback(id, exitCode))
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Глобальные типы для TypeScript
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
