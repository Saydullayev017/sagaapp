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
}

// CodeMirror editor instance
let cmEditor: EditorView | null = null

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
          <div class="sidebar-actions">
            <button class="icon-button" id="open-folder-btn" title="Open Folder">📁</button>
            <button class="icon-button" id="refresh-files" title="Refresh">⟳</button>
            <button class="icon-button" id="collapse-all-btn" title="Collapse All">⏬</button>
          </div>
        </div>
        <div class="breadcrumb" id="breadcrumb"></div>
        <div class="file-tree-search">
          <input type="text" id="tree-search" placeholder="🔍 Search files..." />
        </div>
        <div class="file-tree" id="file-tree">
          <div class="empty-state">
            <div class="empty-icon">📂</div>
            <div class="empty-text">No folder opened</div>
            <button class="open-folder-btn" id="empty-open-folder">Open Folder</button>
          </div>
        </div>
      </aside>
      
      <!-- Resize Handle for Sidebar -->
      <div class="resize-handle resize-handle-sidebar" id="resize-sidebar"></div>
      
      <!-- Center Panel: Editor -->
      <main class="editor-container">
        <div class="editor-toolbar">
          <div class="toolbar-left">
            <button class="toolbar-btn" id="save-btn">💾 Save</button>
            <button class="toolbar-btn" id="format-btn">✨ Format</button>
            <button class="toolbar-btn" id="open-file-btn">📂 Open File</button>
          </div>
          <div class="toolbar-right">
            <div class="view-mode-toggle">
              <button class="toolbar-btn view-mode-btn active" data-mode="edit" title="Edit Mode">✏️ Edit</button>
              <button class="toolbar-btn view-mode-btn" data-mode="preview" title="Preview Mode">👁️ Preview</button>
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
}

function setupEventListeners(): void {
  // Кнопка сохранения
  document.getElementById('save-btn')?.addEventListener('click', () => {
    console.log('Save clicked')
    saveCurrentFile()
  })

  // Обновление файлов
  document.getElementById('refresh-files')?.addEventListener('click', () => {
    console.log('Refresh files clicked')
    if (state.currentFolder) {
      loadFileTree(state.currentFolder)
    }
  })

  // Открытие папки
  document.getElementById('open-folder-btn')?.addEventListener('click', openFolder)
  document.getElementById('empty-open-folder')?.addEventListener('click', openFolder)

  // Открытие файла
  document.getElementById('open-file-btn')?.addEventListener('click', openFile)

  // Форматирование
  document.getElementById('format-btn')?.addEventListener('click', () => {
    console.log('Format clicked')
    formatMarkdown()
  })

  // Переключение режимов отображения (Edit / Preview)
  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const target = e.currentTarget as HTMLElement
      const mode = target.dataset.mode

      if (mode) {
        toggleEditorMode(mode)

        // Обновляем активное состояние кнопок
        document.querySelectorAll('.view-mode-btn').forEach(b => {
          b.classList.remove('active')
        })
        target.classList.add('active')

        showNotification(`Switched to ${mode} mode`, 'info')
      }
    })
  })
}

// Переключение между режимами Edit и Preview
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

// Обновление preview
async function updatePreview(): Promise<void> {
  const previewContent = document.getElementById('preview-content')
  if (!cmEditor || !previewContent) return

  const content = getEditorContent(cmEditor)
  const html = await parseMarkdown(content)
  previewContent.innerHTML = html
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
      }
    })
  }
}

function setupCodeMirrorEditor(): void {
  const container = document.getElementById('codemirror-editor')
  if (!container) return

  // Create CodeMirror editor
  cmEditor = createCodeMirrorEditor(
    container,
    '',
    debounce(() => {
      updateCursorPosition()
    }, 300)
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

function debounce(func: Function, wait: number): (...args: any[]) => void {
  let timeout: ReturnType<typeof setTimeout>
  return (...args: any[]) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

async function openFolder(): Promise<void> {
  if (!window.electronAPI?.showOpenDialog) return

  const result = await window.electronAPI.showOpenDialog({
    properties: ['openDirectory'],
  })

  if (!result.canceled && result.filePaths.length > 0) {
    const folderPath = result.filePaths[0]
    state.currentFolder = folderPath
    loadFileTree(folderPath)
    updateGitStatus(folderPath)
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
    // Always show directories
    if (node.type === 'directory') return true
    // Filter markdown files
    if (!filter) {
      return node.name.endsWith('.md') || node.name.endsWith('.markdown')
    }
    return node.name.toLowerCase().includes(filter)
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
      const paddingLeft = 12 + depth * 12

      if (node.type === 'directory') {
        return `
          <div class="tree-item tree-folder" style="padding-left: ${paddingLeft}px">
            <div class="tree-item-content ${isSelected ? 'active' : ''}" 
                 data-path="${node.path}" 
                 data-type="directory"
                 style="padding-left: 0">
              <span class="tree-toggle">${isExpanded ? '▼' : '▶'}</span>
              <span class="tree-icon">${isExpanded ? '📂' : '📁'}</span>
              <span class="tree-label">${escapeHtml(node.name)}</span>
            </div>
            <div class="tree-children" 
                 id="folder-${encodePath(node.path)}" 
                 style="display: ${isExpanded ? 'block' : 'none'}">
            </div>
          </div>
        `
      } else {
        const icon = getFileIcon(node.name)
        return `
          <div class="tree-item tree-file" style="padding-left: ${paddingLeft}px">
            <div class="tree-item-content ${isSelected ? 'active' : ''}" 
                 data-path="${node.path}" 
                 data-type="file"
                 style="padding-left: 0">
              <span class="tree-toggle" style="visibility: hidden">▶</span>
              <span class="tree-icon">${icon}</span>
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

function getFileIcon(filename: string): string {
  if (filename.endsWith('.md') || filename.endsWith('.markdown')) return '📝'
  if (filename.endsWith('.json')) return '📋'
  if (filename.endsWith('.js') || filename.endsWith('.ts')) return '💻'
  if (filename.endsWith('.css') || filename.endsWith('.scss')) return '🎨'
  if (filename.endsWith('.html')) return '🌐'
  if (filename.endsWith('.txt')) return '📄'
  if (filename.endsWith('.yml') || filename.endsWith('.yaml')) return '⚙️'
  if (filename.endsWith('.gitignore')) return '🔒'
  return '📄'
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

  // Collapse all button
  document.getElementById('collapse-all-btn')?.addEventListener('click', () => {
    state.fileTree.expandedPaths.clear()
    renderFileTreeUI()
  })
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

async function updateGitStatus(_folderPath: string): Promise<void> {
  const statusGit = document.getElementById('status-git')
  if (!statusGit) return

  // Placeholder for git status - will be implemented in Block 7
  statusGit.innerHTML = `
    <span class="git-branch">$(git-branch)</span>
    <span class="git-changes">Git not integrated yet</span>
  `
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
