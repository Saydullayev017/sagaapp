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
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Глобальные типы для TypeScript
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
