import { EditorView } from '@codemirror/view'
import {
  createCodeMirrorEditor,
  getEditorContent,
  setEditorContent,
  getCursorPosition,
} from '../editor/codemirror'
import { parseMarkdown } from '../editor/markdown-parser'

// Types for file tree
interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  extension: string
  size?: number
  children?: TreeNode[]
  isExpanded?: boolean
}

interface FileTreeState {
  rootPath: string | null
  nodes: TreeNode[]
  expandedPaths: Set<string>
  selectedPath: string | null
  filterText: string
  fileCount: number
  folderCount: number
}

// State management
interface UIState {
  currentFolder: string | null
  currentFile: string | null
  expandedFolders: Set<string>
  sidebarWidth: number
  editorWidth: number

  line: number
  column: number
  fileTree: FileTreeState
  gitChanges: {
    staged: string[]
    unstaged: string[]
  }
  activeBottomPanel: 'git' | 'terminal' | null
}

const state: UIState = {
  currentFolder: null,
  currentFile: null,
  expandedFolders: new Set(),
  sidebarWidth: 280,
  editorWidth: 50,

  line: 1,
  column: 1,
  fileTree: {
    rootPath: null,
    nodes: [],
    expandedPaths: new Set(),
    selectedPath: null,
    filterText: '',
    fileCount: 0,
    folderCount: 0,
  },

  gitChanges: {
    staged: [],
    unstaged: [],
  },

  activeBottomPanel: null,
}

// CodeMirror editor instance
let cmEditor: EditorView | null = null

// Auto-save timeout
let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null
const AUTO_SAVE_DELAY = 2000

// Storage keys
const STORAGE_KEY = 'japp-state'

export function initializeUI(): void {
  const app = document.getElementById('app')
  if (!app) return

  app.innerHTML = `
    <div class="titlebar-drag-area"></div>
    
    <div class="main-layout">
      <!-- Left Panel: Sidebar -->
      <aside class="sidebar" id="sidebar" style="width: ${state.sidebarWidth}px">
        <div class="sidebar-header">
          <div class="sidebar-title">
            <h3>Explorer</h3>
            <span class="file-count" id="file-count"></span>
          </div>
        </div>
      </aside>
      
      <!-- Resize Handle for Sidebar -->
      <div class="resize-handle resize-handle-sidebar" id="resize-sidebar"></div>
      
      <!-- Center Panel: Editor -->
      <main class="editor-container">
        <div class="editor-toolbar">
          <div class="toolbar-left">
            <button class="toolbar-btn" id="format-btn">Format</button>
            <button class="toolbar-btn" id="open-file-btn">Open</button>
            <button class="toolbar-btn" id="new-file-btn" title="New File">New File</button>
            <button class="toolbar-btn" id="new-folder-btn" title="New Folder">New Folder</button>
          </div>
          <div class="toolbar-center">
            <button class="toolbar-btn git-btn" id="git-commit" title="Commit">Commit</button>
            <button class="toolbar-btn git-btn" id="git-push" title="Push">Push</button>
            <button class="toolbar-btn git-btn" id="git-pull" title="Pull">Pull</button>
          </div>
          <div class="toolbar-right">
            <div class="view-mode-toggle">
              <button class="toolbar-btn view-mode-btn active" data-mode="edit" title="Edit Mode">Edit</button>
              <button class="toolbar-btn view-mode-btn" data-mode="preview" title="Preview Mode">Preview</button>
            </div>
          </div>
        </div>
        
        <div class="editor-content-wrapper" id="editor-content-wrapper">
          <div class="editor-pane" id="editor-pane">
            <div class="codemirror-container" id="codemirror-editor"></div>
          </div>
          
          <div class="preview-pane hidden" id="preview-pane">
            <div class="preview-content" id="preview-content"></div>
          </div>
        </div>

        <!-- Bottom Panel: Git / Terminal -->
        <div class="bottom-panel" id="bottom-panel">
          <div class="bottom-panel-tabs">
            <button class="panel-tab active" data-panel="git">Git</button>
            <button class="panel-tab" data-panel="terminal">Terminal</button>
          </div>
          <div class="bottom-panel-content">
            <div class="git-panel" id="git-panel">
              <div class="git-changes">
                <div class="git-changes-header">
                  <span class="git-changes-title">Changes</span>
                  <div class="git-actions">
                    <button class="git-action-btn" id="git-stage-all" title="Stage All">+</button>
                    <button class="git-action-btn" id="git-unstage-all" title="Unstage All">-</button>
                  </div>
                </div>
                <div class="git-files-list" id="git-files-list"></div>
              </div>
              <div class="git-commit-area">
                <textarea class="git-commit-message" id="git-commit-message" placeholder="Commit message..."></textarea>
                <button class="git-commit-btn" id="git-commit-btn">Commit</button>
              </div>
            </div>
            <div class="terminal-panel hidden" id="terminal-panel">
              <div class="terminal-output" id="terminal-output"></div>
              <div class="terminal-input-wrapper">
                <span class="terminal-prompt">$</span>
                <input type="text" class="terminal-input" id="terminal-input" placeholder="Enter command..." />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
    
    <!-- Bottom Panel: Git Status Bar -->
    <footer class="status-bar">
      <div class="status-left">
        <span class="status-item" id="status-line">Ln ${state.line}, Col ${state.column}</span>
        <span class="status-item" id="status-encoding">UTF-8</span>
      </div>
      <div class="status-center">
        <span class="status-item" id="status-file">No file opened</span>
      </div>
      <div class="status-right">
        <span class="status-item git-status" id="status-git">
          <span class="git-branch">$(git-branch)</span>
          <span class="git-changes">0 changes</span>
        </span>
        <span class="status-item" id="status-cursor"></span>
      </div>
    </footer>
  `

  // Добавляем обработчики событий
  setupEventListeners()
  setupResizeHandles()
  setupCodeMirrorEditor()
  setupDragDrop()
  setupPasteHandler()
  setupBottomPanel()

  // Восстанавливаем состояние или открываем дефолтную папку
  setTimeout(async () => {
    const savedState = localStorage.getItem(STORAGE_KEY)
    if (savedState) {
      await restoreState()
    } else {
      const defaultPath = '/Volumes/DEV/Japp'
      state.currentFolder = defaultPath
      await loadFileTree(defaultPath)
      updateGitStatus(defaultPath)
      saveState()
    }
  }, 100)
}

function setupEventListeners(): void {
  // Открытие файла
  document.getElementById('open-file-btn')?.addEventListener('click', openFile)

  // Новый файл/папка
  document.getElementById('new-file-btn')?.addEventListener('click', createNewFile)
  document.getElementById('new-folder-btn')?.addEventListener('click', createNewFolder)

  // Форматирование
  document.getElementById('format-btn')?.addEventListener('click', () => {
    console.log('Format clicked')
    formatMarkdown()
  })

  // View mode toggle (Edit/Preview)
  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const target = e.currentTarget as HTMLElement
      const mode = target.dataset.mode
      if (mode) {
        toggleEditorMode(mode)
        document.querySelectorAll('.view-mode-btn').forEach(b => b.classList.remove('active'))
        target.classList.add('active')
      }
    })
  })

  // Keyboard shortcuts - use window for better capture
  window.addEventListener('keydown', e => {
    const isMod = e.ctrlKey || e.metaKey

    // Ctrl/Cmd+B: Toggle sidebar (file tree)
    if (isMod && e.key === 'b') {
      e.preventDefault()
      toggleSidebar()
    }

    // Ctrl/Cmd+F: Focus on file search in sidebar
    if (isMod && e.key === 'f') {
      e.preventDefault()
      const sidebar = document.getElementById('sidebar')
      if (sidebar && !sidebar.classList.contains('hidden')) {
        const searchInput = document.getElementById('tree-search') as HTMLInputElement
        searchInput?.focus()
      } else {
        toggleSidebar()
        setTimeout(() => {
          const searchInput = document.getElementById('tree-search') as HTMLInputElement
          searchInput?.focus()
        }, 100)
      }
    }

    // Ctrl/Cmd+P: Toggle preview
    if (isMod && e.key === 'p') {
      e.preventDefault()
      togglePreview()
    }

    // Ctrl/Cmd+S: Save
    if (isMod && e.key === 's') {
      e.preventDefault()
      saveCurrentFile()
    }
  })

  // Git buttons
  document.getElementById('git-commit')?.addEventListener('click', gitCommit)
  document.getElementById('git-push')?.addEventListener('click', gitPush)
  document.getElementById('git-pull')?.addEventListener('click', gitPull)
}

// Search functionality
// Git functions
async function gitCommit(): Promise<void> {
  if (!state.currentFolder) {
    showNotification('No folder opened', 'error')
    return
  }

  const message = prompt('Enter commit message:')
  if (!message) return

  const result = await window.electronAPI?.gitCommit(state.currentFolder, message)
  if (result?.success) {
    showNotification('Commit successful', 'success')
    updateGitStatus(state.currentFolder)
  } else {
    showNotification(result?.error || 'Commit failed', 'error')
  }
}

async function gitPush(): Promise<void> {
  if (!state.currentFolder) {
    showNotification('No folder opened', 'error')
    return
  }

  const result = await window.electronAPI?.gitPush(state.currentFolder)
  if (result?.success) {
    showNotification('Push successful', 'success')
  } else {
    showNotification(result?.error || 'Push failed', 'error')
  }
}

async function gitPull(): Promise<void> {
  if (!state.currentFolder) {
    showNotification('No folder opened', 'error')
    return
  }

  const result = await window.electronAPI?.gitPull(state.currentFolder)
  if (result?.success) {
    showNotification('Pull successful', 'success')
    updateGitStatus(state.currentFolder)
  } else {
    showNotification(result?.error || 'Pull failed', 'error')
  }
}

function setupResizeHandles(): void {
  const sidebarHandle = document.getElementById('resize-sidebar')
  const sidebar = document.getElementById('sidebar')

  // Sidebar resize
  if (sidebarHandle && sidebar) {
    let isResizing = false
    let startX = 0
    let startWidth = 0

    sidebarHandle.addEventListener('mousedown', e => {
      isResizing = true
      startX = e.clientX
      startWidth = sidebar.offsetWidth
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    })

    document.addEventListener('mousemove', e => {
      if (!isResizing) return
      const width = Math.max(200, Math.min(500, startWidth + e.clientX - startX))
      sidebar.style.width = `${width}px`
      state.sidebarWidth = width
    })

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        saveState()
      }
    })
  }
}

function setupCodeMirrorEditor(): void {
  const container = document.getElementById('codemirror-editor')
  if (!container) return

  cmEditor = createCodeMirrorEditor(
    container,
    '',
    debounce(() => {
      updateCursorPosition()
      scheduleAutoSave()
    }, 500)
  )
}

function updateCursorPosition(): void {
  if (!cmEditor) return

  const pos = getCursorPosition(cmEditor)
  state.line = pos.line
  state.column = pos.column

  const statusLine = document.getElementById('status-line')
  if (statusLine) {
    statusLine.textContent = `Ln ${state.line}, Col ${state.column}`
  }
}

function toggleEditorMode(mode: string): void {
  const editorPane = document.getElementById('editor-pane')
  const previewPane = document.getElementById('preview-pane')
  if (!editorPane || !previewPane) return

  if (mode === 'edit') {
    editorPane.classList.remove('hidden')
    previewPane.classList.add('hidden')
  } else if (mode === 'preview') {
    editorPane.classList.add('hidden')
    previewPane.classList.remove('hidden')
    updatePreview()
  }
}

async function updatePreview(): Promise<void> {
  const previewContent = document.getElementById('preview-content')
  if (!cmEditor || !previewContent) return

  const content = getEditorContent(cmEditor)
  const html = await parseMarkdown(content)
  previewContent.innerHTML = html
}

function toggleSidebar(): void {
  const sidebar = document.getElementById('sidebar')
  if (!sidebar) return

  if (sidebar.classList.contains('hidden')) {
    sidebar.classList.remove('hidden')
  } else {
    sidebar.classList.add('hidden')
  }
}

function togglePreview(): void {
  const previewPane = document.getElementById('preview-pane')
  const editorPane = document.getElementById('editor-pane')
  const previewBtn = document.querySelector('.view-mode-btn[data-mode="preview"]')
  const editBtn = document.querySelector('.view-mode-btn[data-mode="edit"]')

  if (!previewPane || !editorPane) return

  if (previewPane.classList.contains('hidden')) {
    // Switch to preview
    editorPane.classList.add('hidden')
    previewPane.classList.remove('hidden')
    updatePreview()
    previewBtn?.classList.add('active')
    editBtn?.classList.remove('active')
  } else {
    // Switch to edit
    previewPane.classList.add('hidden')
    editorPane.classList.remove('hidden')
    previewBtn?.classList.remove('active')
    editBtn?.classList.add('active')
  }
}

function debounce(func: Function, wait: number): (...args: any[]) => void {
  let timeout: ReturnType<typeof setTimeout>
  return (...args: any[]) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

async function loadFileTree(folderPath: string): Promise<void> {
  if (!window.electronAPI?.readDirectory) return

  const result = await window.electronAPI.readDirectory(folderPath)
  if (result.success && result.entries) {
    state.fileTree.rootPath = folderPath
    state.fileTree.nodes = result.entries.map((entry: any) => ({
      name: entry.name,
      path: entry.path,
      type: entry.type,
      extension: entry.extension,
      size: entry.size,
      children: undefined,
      isExpanded: false,
    }))

    updateBreadcrumb(folderPath)
    updateFileCount()
    renderFileTreeUI()
    saveState()
  }
}

function updateBreadcrumb(folderPath: string): void {
  const breadcrumb = document.getElementById('breadcrumb')
  if (!breadcrumb) return

  const parts = folderPath.split(/[/\\]/).filter(Boolean)
  const folderName = parts.pop() || folderPath
  breadcrumb.innerHTML = `<span class="breadcrumb-item">${folderName}</span>`
}

function updateFileCount(): void {
  const fileCountEl = document.getElementById('file-count')
  if (!fileCountEl) return

  const files = state.fileTree.nodes.filter(n => n.type === 'file').length
  const folders = state.fileTree.nodes.filter(n => n.type === 'directory').length
  state.fileTree.fileCount = files
  state.fileTree.folderCount = folders

  fileCountEl.textContent = `${files} files, ${folders} folders`
}

function renderFileTreeUI(): void {
  const fileTree = document.getElementById('file-tree')
  if (!fileTree) return

  const filtered = filterNodes(state.fileTree.nodes)

  if (filtered.length === 0 && state.fileTree.rootPath) {
    fileTree.innerHTML = `
      <div class="empty-state">
        <div class="empty-text">No markdown files found</div>
      </div>
    `
    return
  }

  fileTree.innerHTML = renderTreeNodes(filtered, 0)
  setupFileTreeListeners()
}

function filterNodes(nodes: TreeNode[]): TreeNode[] {
  const filter = state.fileTree.filterText.toLowerCase()

  return nodes.filter(node => {
    // If there's a filter, search by name
    if (filter) {
      return node.name.toLowerCase().includes(filter)
    }
    // Show all files and directories
    return true
  })
}

function renderTreeNodes(nodes: TreeNode[], depth: number): string {
  const sorted = [...nodes].sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name)
    return a.type === 'directory' ? -1 : 1
  })

  return sorted
    .map(node => {
      const isExpanded = state.fileTree.expandedPaths.has(node.path)
      const isSelected = state.fileTree.selectedPath === node.path
      const paddingLeft = 12 + depth * 16

      if (node.type === 'directory') {
        return `
          <div class="tree-item tree-folder" style="padding-left: ${paddingLeft}px">
            <div class="tree-item-content ${isSelected ? 'active' : ''}" 
                 data-path="${node.path}" 
                 data-type="directory"
                 style="padding-left: 0">
              <span class="tree-line"></span>
              <span class="tree-toggle">${isExpanded ? '-' : '+'}</span>
              <span class="tree-icon">${isExpanded ? '[+]' : '[·]'}</span>
              <span class="tree-label">${escapeHtml(node.name)}</span>
            </div>
            <div class="tree-children" 
                 id="folder-${encodePath(node.path)}" 
                 style="display: ${isExpanded ? 'block' : 'none'}">
            </div>
          </div>
        `
      } else {
        return `
          <div class="tree-item tree-file" style="padding-left: ${paddingLeft}px">
            <div class="tree-item-content ${isSelected ? 'active' : ''}" 
                 data-path="${node.path}" 
                 data-type="file"
                 style="padding-left: 0">
              <span class="tree-line"></span>
              <span class="tree-toggle" style="visibility: hidden">+</span>
              <span class="tree-icon">·</span>
              <span class="tree-label">${escapeHtml(node.name)}</span>
            </div>
          </div>
        `
      }
    })
    .join('')
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function encodePath(path: string): string {
  return btoa(path).replace(/[^a-zA-Z0-9]/g, '')
}

function setupFileTreeListeners(): void {
  // Tree item clicks
  document.querySelectorAll('.tree-item-content').forEach(item => {
    item.addEventListener('click', async e => {
      const target = e.currentTarget as HTMLElement
      const path = target.dataset.path
      const type = target.dataset.type

      if (!path) return

      // Update selection
      document.querySelectorAll('.tree-item-content').forEach(el => {
        el.classList.remove('active')
      })
      target.classList.add('active')
      state.fileTree.selectedPath = path

      if (type === 'directory') {
        e.stopPropagation()
        toggleFolder(path)
      } else {
        openFileInEditor(path)
      }
    })
  })

  // Search input
  const searchInput = document.getElementById('tree-search') as HTMLInputElement
  if (searchInput) {
    searchInput.addEventListener(
      'input',
      debounce(() => {
        state.fileTree.filterText = searchInput.value
        renderFileTreeUI()
      }, 150)
    )
  }
}

async function toggleFolder(folderPath: string): Promise<void> {
  const isExpanded = state.fileTree.expandedPaths.has(folderPath)
  const childrenContainer = document.getElementById(`folder-${encodePath(folderPath)}`)
  const toggleIcon = document.querySelector(`[data-path="${folderPath}"] .tree-toggle`)
  const folderIcon = document.querySelector(`[data-path="${folderPath}"] .tree-icon`)

  if (isExpanded) {
    state.fileTree.expandedPaths.delete(folderPath)
    if (childrenContainer) childrenContainer.style.display = 'none'
    if (toggleIcon) toggleIcon.textContent = '▶'
    if (folderIcon) folderIcon.textContent = '📁'
  } else {
    state.fileTree.expandedPaths.add(folderPath)
    if (childrenContainer) {
      if (!childrenContainer.innerHTML) {
        await loadFolderContents(folderPath, childrenContainer)
      }
      childrenContainer.style.display = 'block'
    }
    if (toggleIcon) toggleIcon.textContent = '▼'
    if (folderIcon) folderIcon.textContent = '📂'
  }
}

async function loadFolderContents(folderPath: string, container: HTMLElement): Promise<void> {
  if (!window.electronAPI?.readDirectory) return

  const result = await window.electronAPI.readDirectory(folderPath)
  if (result.success && result.entries) {
    const nodes: TreeNode[] = result.entries.map((entry: any) => ({
      name: entry.name,
      path: entry.path,
      type: entry.type,
      extension: entry.extension,
      size: entry.size,
    }))
    container.innerHTML = renderTreeNodes(nodes, 1)
    setupFileTreeListeners()
  }
}

async function createNewFile(): Promise<void> {
  if (!state.currentFolder) {
    showNotification('No folder opened', 'error')
    return
  }

  const fileName = prompt('Enter file name:', 'untitled.md')
  if (!fileName) return

  console.log('Creating file:', state.currentFolder, fileName)
  const result = await window.electronAPI?.createFile(state.currentFolder, fileName)
  console.log('Create file result:', result)
  if (result?.success) {
    showNotification('File created', 'success')
    loadFileTree(state.currentFolder)
  } else {
    showNotification(result?.error || 'Failed to create file', 'error')
  }
}

async function createNewFolder(): Promise<void> {
  if (!state.currentFolder) {
    showNotification('No folder opened', 'error')
    return
  }

  const folderName = prompt('Enter folder name:', 'new-folder')
  if (!folderName) return

  console.log('Creating folder:', state.currentFolder, folderName)
  const result = await window.electronAPI?.createFolder(state.currentFolder, folderName)
  console.log('Create folder result:', result)
  if (result?.success) {
    showNotification('Folder created', 'success')
    loadFileTree(state.currentFolder)
  } else {
    showNotification(result?.error || 'Failed to create folder', 'error')
  }
}

async function openFile(): Promise<void> {
  if (!window.electronAPI?.showOpenDialog) return

  const result = await window.electronAPI.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
  })

  if (!result.canceled && result.filePaths.length > 0) {
    await openFileInEditor(result.filePaths[0])
  }
}

async function openFileInEditor(filePath: string): Promise<void> {
  if (!window.electronAPI?.readFile) return

  const result = await window.electronAPI.readFile(filePath)
  if (result.success && result.content !== undefined) {
    if (cmEditor) {
      setEditorContent(cmEditor, result.content)
      state.currentFile = filePath

      // Update status
      const statusFile = document.getElementById('status-file')
      if (statusFile) {
        const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath
        statusFile.textContent = fileName
      }

      // Update active file in tree
      document.querySelectorAll('.tree-item-content').forEach(item => {
        item.classList.remove('active')
      })
      const activeItem = document.querySelector(`[data-path="${filePath}"]`)
      if (activeItem) {
        activeItem.classList.add('active')
      }

      saveState()
    }
  }
}

async function saveCurrentFile(): Promise<void> {
  if (!state.currentFile || !window.electronAPI?.writeFile) {
    // Save as new file
    saveAsNewFile()
    return
  }

  if (!cmEditor) return

  const content = getEditorContent(cmEditor)
  const result = await window.electronAPI.writeFile(state.currentFile, content)
  if (result.success) {
    showNotification('File saved successfully', 'success')
    updateGitStatus(state.currentFolder || '')
  } else {
    showNotification('Error saving file', 'error')
  }
}

async function saveAsNewFile(): Promise<void> {
  if (!window.electronAPI?.showSaveDialog || !window.electronAPI?.writeFile) return

  const result = await window.electronAPI.showSaveDialog({
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })

  if (!result.canceled && result.filePath) {
    if (!cmEditor) return

    const content = getEditorContent(cmEditor)
    const writeResult = await window.electronAPI.writeFile(result.filePath, content)
    if (writeResult.success) {
      state.currentFile = result.filePath
      const statusFile = document.getElementById('status-file')
      if (statusFile) {
        const fileName =
          result.filePath.split('/').pop() || result.filePath.split('\\').pop() || result.filePath
        statusFile.textContent = fileName
      }
      showNotification('File saved successfully', 'success')
    }
  }
}

function scheduleAutoSave(): void {
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout)
  }
  autoSaveTimeout = setTimeout(() => {
    if (state.currentFile && cmEditor) {
      saveCurrentFile()
    }
  }, AUTO_SAVE_DELAY)
}

function saveState(): void {
  try {
    const stateToSave = {
      currentFolder: state.currentFolder,
      currentFile: state.currentFile,
      sidebarWidth: state.sidebarWidth,
      editorWidth: state.editorWidth,
      expandedPaths: Array.from(state.fileTree.expandedPaths),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave))
  } catch (e) {
    console.error('Failed to save state:', e)
  }
}

function loadState(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return

    const stateToLoad = JSON.parse(saved)
    if (stateToLoad.currentFolder) {
      state.currentFolder = stateToLoad.currentFolder
    }
    if (stateToLoad.currentFile) {
      state.currentFile = stateToLoad.currentFile
    }
    if (stateToLoad.sidebarWidth) {
      state.sidebarWidth = stateToLoad.sidebarWidth
    }
    if (stateToLoad.editorWidth) {
      state.editorWidth = stateToLoad.editorWidth
    }
    if (stateToLoad.expandedPaths) {
      state.fileTree.expandedPaths = new Set(stateToLoad.expandedPaths)
    }
  } catch (e) {
    console.error('Failed to load state:', e)
  }
}

async function restoreState(): Promise<void> {
  loadState()

  if (state.currentFolder) {
    await loadFileTree(state.currentFolder)
    updateGitStatus(state.currentFolder)
  }

  if (state.currentFile) {
    await openFileInEditor(state.currentFile)
  }

  const sidebar = document.getElementById('sidebar')
  if (sidebar && state.sidebarWidth) {
    sidebar.style.width = `${state.sidebarWidth}px`
  }
}

function formatMarkdown(): void {
  if (!cmEditor) return

  let content = getEditorContent(cmEditor)
  // Add spaces after headers
  content = content.replace(/^(#{1,6})([^ #])/gim, '$1 $2')
  // Ensure blank line before headers
  content = content.replace(/([^\n])\n(#{1,6})/gim, '$1\n\n$2')

  setEditorContent(cmEditor, content)
  showNotification('Markdown formatted', 'success')
}

function setupBottomPanel(): void {
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', e => {
      const target = e.currentTarget as HTMLElement
      const panel = target.dataset.panel as 'git' | 'terminal'
      switchBottomPanel(panel)
    })
  })

  document.getElementById('git-stage-all')?.addEventListener('click', stageAllFiles)
  document.getElementById('git-unstage-all')?.addEventListener('click', unstageAllFiles)
  document.getElementById('git-commit-btn')?.addEventListener('click', commitChanges)

  const commitInput = document.getElementById('git-commit-message') as HTMLTextAreaElement
  commitInput?.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      commitChanges()
    }
  })
}

function switchBottomPanel(panel: 'git' | 'terminal'): void {
  state.activeBottomPanel = panel

  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.classList.toggle('active', (tab as HTMLElement).dataset.panel === panel)
  })

  const gitPanel = document.getElementById('git-panel')
  const terminalPanel = document.getElementById('terminal-panel')

  if (panel === 'git') {
    gitPanel?.classList.remove('hidden')
    terminalPanel?.classList.add('hidden')
  } else {
    gitPanel?.classList.add('hidden')
    terminalPanel?.classList.remove('hidden')
  }
}

async function refreshGitChanges(): Promise<void> {
  if (!state.currentFolder) return

  try {
    const statusResult = await window.electronAPI?.gitStatus(state.currentFolder)
    if (statusResult?.success && statusResult.files) {
      const staged: string[] = []
      const unstaged: string[] = []

      statusResult.files.forEach((file: any) => {
        if (file.staged) {
          staged.push(file.path)
        } else {
          unstaged.push(file.path)
        }
      })

      state.gitChanges.staged = staged
      state.gitChanges.unstaged = unstaged

      renderGitFilesList()
    }
  } catch (e) {
    console.error('Failed to refresh git changes:', e)
  }
}

function renderGitFilesList(): void {
  const container = document.getElementById('git-files-list')
  if (!container) return

  const allFiles = [
    ...state.gitChanges.unstaged.map(f => ({ path: f, staged: false })),
    ...state.gitChanges.staged.map(f => ({ path: f, staged: true })),
  ]

  if (allFiles.length === 0) {
    container.innerHTML = '<div class="git-empty">No changes</div>'
    return
  }

  container.innerHTML = allFiles
    .map(
      file => `
      <div class="git-file-item ${file.staged ? 'staged' : 'unstaged'}">
        <span class="git-file-status">${file.staged ? 'S' : 'U'}</span>
        <span class="git-file-path">${file.path}</span>
        <button class="git-file-action" data-path="${file.path}" data-action="${file.staged ? 'unstage' : 'stage'}">
          ${file.staged ? '-' : '+'}
        </button>
      </div>
    `
    )
    .join('')

  container.querySelectorAll('.git-file-action').forEach(btn => {
    btn.addEventListener('click', async e => {
      const target = e.currentTarget as HTMLElement
      const path = target.dataset.path || ''
      const action = target.dataset.action || ''
      if (action === 'stage') {
        await stageFile(path)
      } else {
        await unstageFile(path)
      }
    })
  })
}

async function stageFile(filePath: string): Promise<void> {
  if (!state.currentFolder) return
  await window.electronAPI?.gitAdd(state.currentFolder, filePath)
  await refreshGitChanges()
  updateGitStatus(state.currentFolder)
}

async function unstageFile(filePath: string): Promise<void> {
  if (!state.currentFolder) return
  await window.electronAPI?.gitReset(state.currentFolder, filePath)
  await refreshGitChanges()
  updateGitStatus(state.currentFolder)
}

async function stageAllFiles(): Promise<void> {
  if (!state.currentFolder) return
  await window.electronAPI?.gitAdd(state.currentFolder, '.')
  await refreshGitChanges()
  updateGitStatus(state.currentFolder)
}

async function unstageAllFiles(): Promise<void> {
  if (!state.currentFolder) return
  await window.electronAPI?.gitReset(state.currentFolder, '.')
  await refreshGitChanges()
  updateGitStatus(state.currentFolder)
}

async function commitChanges(): Promise<void> {
  const commitInput = document.getElementById('git-commit-message') as HTMLTextAreaElement
  const message = commitInput?.value.trim()

  if (!message) {
    showNotification('Enter commit message', 'error')
    return
  }

  if (!state.currentFolder) return

  const result = await window.electronAPI?.gitCommit(state.currentFolder, message)
  if (result?.success) {
    showNotification('Committed successfully', 'success')
    commitInput.value = ''
    await refreshGitChanges()
    updateGitStatus(state.currentFolder)
  } else {
    showNotification(result?.error || 'Commit failed', 'error')
  }
}

function setupDragDrop(): void {
  const editorPane = document.getElementById('editor-pane')
  if (!editorPane) return

  editorPane.addEventListener('dragover', e => {
    e.preventDefault()
    e.stopPropagation()
    editorPane.classList.add('drag-over')
  })

  editorPane.addEventListener('dragleave', e => {
    e.preventDefault()
    e.stopPropagation()
    editorPane.classList.remove('drag-over')
  })

  editorPane.addEventListener('drop', async e => {
    e.preventDefault()
    e.stopPropagation()
    editorPane.classList.remove('drag-over')

    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        await handleImageDrop(file)
      }
    }
  })
}

async function handleImageDrop(file: File): Promise<void> {
  if (!state.currentFolder || !cmEditor) {
    showNotification('Open a folder first', 'error')
    return
  }

  try {
    const assetsPath = `${state.currentFolder}/assets`

    // Ensure assets folder exists
    await window.electronAPI?.createFolder(assetsPath, '').catch(() => {})

    // Generate unique filename
    const timestamp = Date.now()
    const ext = file.name.split('.').pop() || 'png'
    const fileName = `${timestamp}-${file.name.replace(/\.[^/.]+$/, '')}.${ext}`
    const fullPath = `${assetsPath}/${fileName}`

    // Read file as base64
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]

      // Write file
      const result = await window.electronAPI?.writeFile(fullPath, atob(base64))
      if (result?.success) {
        const markdown = `![${file.name}](./assets/${fileName})\n`
        insertTextAtCursor(markdown)
        showNotification('Image saved', 'success')
        loadFileTree(state.currentFolder!)
      } else {
        showNotification('Failed to save image', 'error')
      }
    }
    reader.readAsDataURL(file)
  } catch (e) {
    console.error('Image drop error:', e)
    showNotification('Failed to process image', 'error')
  }
}

function insertTextAtCursor(text: string): void {
  if (!cmEditor) return

  const pos = cmEditor.state.selection.main.head
  cmEditor.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
  })
  cmEditor.focus()
}

function setupPasteHandler(): void {
  document.addEventListener('paste', async e => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          await handleImageDrop(file)
        }
        break
      }
    }
  })
}

async function updateGitStatus(folderPath: string): Promise<void> {
  const statusGit = document.getElementById('status-git')
  if (!statusGit || !folderPath) return

  try {
    const [branchResult, statusResult] = await Promise.all([
      window.electronAPI?.gitBranch(folderPath),
      window.electronAPI?.gitStatus(folderPath),
    ])

    const branch = branchResult?.success ? branchResult.branch : 'No repo'
    const files = statusResult?.success && statusResult.isRepo ? statusResult.files || [] : []
    const changedCount = files.length

    statusGit.innerHTML = `
      <span class="git-branch">${branch}</span>
      <span class="git-changes">${changedCount} changes</span>
    `
  } catch {
    statusGit.innerHTML = `
      <span class="git-branch">Not a git repo</span>
      <span class="git-changes"></span>
    `
  }
}

function showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const notification = document.createElement('div')
  notification.className = `notification notification-${type}`
  notification.textContent = message
  document.body.appendChild(notification)

  setTimeout(() => {
    notification.classList.add('show')
  }, 10)

  setTimeout(() => {
    notification.classList.remove('show')
    setTimeout(() => {
      notification.remove()
    }, 300)
  }, 3000)
}
