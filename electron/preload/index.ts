import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    // Window controls
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    toggleMaximize: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),
    
    // File system
    readFile: (path: string) => ipcRenderer.invoke('read-file', path),
    writeFile: (path: string, content: string) => ipcRenderer.invoke('write-file', path, content),
    readDirectory: (path: string) => ipcRenderer.invoke('read-directory', path),
    
    // Dialogs
    showOpenDialog: (options: any) => ipcRenderer.invoke('show-open-dialog', options),
    showSaveDialog: (options: any) => ipcRenderer.invoke('show-save-dialog', options),
    
    // Utils
    getAppVersion: () => ipcRenderer.invoke('get-app-version')
})