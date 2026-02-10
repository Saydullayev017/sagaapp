// State management
interface UIState {
  currentFolder: string | null
  currentFile: string | null
  expandedFolders: Set<string>
  sidebarWidth: number
  editorWidth: number
  isPreviewVisible: boolean
  line: number
  column: number
}

const state: UIState = {
  currentFolder: null,
  currentFile: null,
  expandedFolders: new Set(),
  sidebarWidth: 280,
  editorWidth: 50,
  isPreviewVisible: false,
  line: 1,
  column: 1,
}

export function initializeUI(): void {
  const app = document.getElementById('app')
  if (!app) return

  app.innerHTML = `
    <div class="window-controls">
      <button class="window-control minimize" data-action="minimize">−</button>
      <button class="window-control maximize" data-action="maximize">□</button>
      <button class="window-control close" data-action="close">×</button>
    </div>
    
    <div class="main-layout">
      <!-- Left Panel: Sidebar -->
      <aside class="sidebar" id="sidebar" style="width: ${state.sidebarWidth}px">
        <div class="sidebar-header">
          <h3>Explorer</h3>
          <div class="sidebar-actions">
            <button class="icon-button" id="open-folder-btn" title="Open Folder">📁</button>
            <button class="icon-button" id="refresh-files" title="Refresh">⟳</button>
          </div>
        </div>
        <div class="file-tree" id="file-tree">
          <div class="empty-state">
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
            <button class="toolbar-btn" id="preview-toggle">👁️ Preview</button>
          </div>
        </div>
        
        <div class="split-container" id="split-container">
          <div class="editor-pane" id="editor-pane" style="width: ${state.editorWidth}%">
            <textarea class="markdown-editor" id="editor" placeholder="# Start writing markdown here...&#10;&#10;Press Enter on a markdown line to see preview"></textarea>
          </div>
          
          <!-- Resize Handle for Editor/Preview -->
          <div class="resize-handle resize-handle-split" id="resize-split"></div>
          
          <div class="preview-pane ${state.isPreviewVisible ? '' : 'hidden'}" id="preview">
            <div class="preview-content" id="preview-content">
              <div class="preview-placeholder">Preview will appear here when you press Enter on markdown lines</div>
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
  setupEditorListeners()
}

function setupEventListeners(): void {
  // Обработчики оконных кнопок
  document.querySelectorAll('.window-control').forEach(button => {
    button.addEventListener('click', e => {
      const action = (e.target as HTMLElement).dataset.action
      handleWindowControl(action)
    })
  })

  // Кнопка сохранения
  document.getElementById('save-btn')?.addEventListener('click', () => {
    console.log('Save clicked')
    saveCurrentFile()
  })

  // Переключение превью
  document.getElementById('preview-toggle')?.addEventListener('click', () => {
    const preview = document.getElementById('preview')
    if (preview) {
      preview.classList.toggle('hidden')
      state.isPreviewVisible = !preview.classList.contains('hidden')
      updatePreview()
    }
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
}

function setupResizeHandles(): void {
  const sidebarHandle = document.getElementById('resize-sidebar')
  const splitHandle = document.getElementById('resize-split')
  const sidebar = document.getElementById('sidebar')
  const editorPane = document.getElementById('editor-pane')
  const container = document.getElementById('split-container')

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

  // Split pane resize
  if (splitHandle && editorPane && container) {
    let isResizing = false
    let startX = 0
    let startWidth = 0

    splitHandle.addEventListener('mousedown', e => {
      if (!state.isPreviewVisible) return
      isResizing = true
      startX = e.clientX
      startWidth = editorPane.offsetWidth
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    })

    document.addEventListener('mousemove', e => {
      if (!isResizing || !container) return
      const containerWidth = container.offsetWidth
      const newWidth = Math.max(
        200,
        Math.min(containerWidth - 200, startWidth + e.clientX - startX)
      )
      const percentage = (newWidth / containerWidth) * 100
      editorPane.style.width = `${percentage}%`
      state.editorWidth = percentage
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

function setupEditorListeners(): void {
  const editor = document.getElementById('editor') as HTMLTextAreaElement
  if (!editor) return

  // Track cursor position
  editor.addEventListener('keyup', updateCursorPosition)
  editor.addEventListener('click', updateCursorPosition)

  // Auto-preview on Enter
  editor.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      // Show preview when pressing Enter
      const preview = document.getElementById('preview')
      if (preview && preview.classList.contains('hidden')) {
        preview.classList.remove('hidden')
        state.isPreviewVisible = true
      }
      // Update preview after a short delay to get new content
      setTimeout(updatePreview, 50)
    }
  })

  // Update preview on input
  editor.addEventListener('input', debounce(updatePreview, 300))
}

function updateCursorPosition(): void {
  const editor = document.getElementById('editor') as HTMLTextAreaElement
  if (!editor) return

  const cursorPosition = editor.selectionStart
  const textBeforeCursor = editor.value.substring(0, cursorPosition)
  const lines = textBeforeCursor.split('\n')

  state.line = lines.length
  state.column = lines[lines.length - 1].length + 1

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
  if (result.success) {
    const fileTree = document.getElementById('file-tree')
    if (fileTree) {
      fileTree.innerHTML = renderFileTree(result.entries, folderPath)
      setupFileTreeListeners()
    }
  }
}

function renderFileTree(entries: any[], _basePath: string): string {
  const filtered = entries.filter(entry => {
    if (entry.type === 'directory') return true
    return entry.name.endsWith('.md') || entry.name.endsWith('.markdown')
  })

  filtered.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name)
    return a.type === 'directory' ? -1 : 1
  })

  return filtered
    .map(entry => {
      const isExpanded = state.expandedFolders.has(entry.path)
      if (entry.type === 'directory') {
        return `
        <div class="tree-item tree-folder">
          <div class="tree-item-content" data-path="${entry.path}" data-type="directory">
            <span class="tree-icon">${isExpanded ? '📂' : '📁'}</span>
            <span class="tree-label">${entry.name}</span>
          </div>
          <div class="tree-children" id="folder-${encodePath(entry.path)}" style="display: ${isExpanded ? 'block' : 'none'}"></div>
        </div>
      `
      } else {
        return `
        <div class="tree-item tree-file">
          <div class="tree-item-content" data-path="${entry.path}" data-type="file">
            <span class="tree-icon">📝</span>
            <span class="tree-label">${entry.name}</span>
          </div>
        </div>
      `
      }
    })
    .join('')
}

function encodePath(path: string): string {
  return btoa(path).replace(/[^a-zA-Z0-9]/g, '')
}

function setupFileTreeListeners(): void {
  document.querySelectorAll('.tree-item-content').forEach(item => {
    item.addEventListener('click', async e => {
      const target = e.currentTarget as HTMLElement
      const path = target.dataset.path
      const type = target.dataset.type

      if (!path) return

      if (type === 'directory') {
        toggleFolder(path)
      } else {
        openFileInEditor(path)
      }
    })
  })
}

async function toggleFolder(folderPath: string): Promise<void> {
  const isExpanded = state.expandedFolders.has(folderPath)
  const childrenContainer = document.getElementById(`folder-${encodePath(folderPath)}`)
  const icon = document.querySelector(`[data-path="${folderPath}"] .tree-icon`)

  if (isExpanded) {
    state.expandedFolders.delete(folderPath)
    if (childrenContainer) childrenContainer.style.display = 'none'
    if (icon) icon.textContent = '📁'
  } else {
    state.expandedFolders.add(folderPath)
    if (childrenContainer) {
      if (!childrenContainer.innerHTML) {
        await loadFolderContents(folderPath, childrenContainer)
      }
      childrenContainer.style.display = 'block'
    }
    if (icon) icon.textContent = '📂'
  }
}

async function loadFolderContents(folderPath: string, container: HTMLElement): Promise<void> {
  if (!window.electronAPI?.readDirectory) return

  const result = await window.electronAPI.readDirectory(folderPath)
  if (result.success) {
    container.innerHTML = renderFileTree(result.entries, folderPath)
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
  if (result.success) {
    const editor = document.getElementById('editor') as HTMLTextAreaElement
    if (editor) {
      editor.value = result.content
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

      // Update preview
      updatePreview()
    }
  }
}

async function saveCurrentFile(): Promise<void> {
  if (!state.currentFile || !window.electronAPI?.writeFile) {
    // Save as new file
    saveAsNewFile()
    return
  }

  const editor = document.getElementById('editor') as HTMLTextAreaElement
  if (!editor) return

  const result = await window.electronAPI.writeFile(state.currentFile, editor.value)
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
    const editor = document.getElementById('editor') as HTMLTextAreaElement
    if (!editor) return

    const writeResult = await window.electronAPI.writeFile(result.filePath, editor.value)
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

function updatePreview(): void {
  const editor = document.getElementById('editor') as HTMLTextAreaElement
  const previewContent = document.getElementById('preview-content')
  if (!editor || !previewContent) return

  const content = editor.value
  // Simple markdown to HTML conversion (basic)
  const html = simpleMarkdownToHtml(content)
  previewContent.innerHTML = html
}

function simpleMarkdownToHtml(markdown: string): string {
  let html = markdown
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold and Italic
    .replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    // Code
    .replace(/`([^`]+)`/gim, '<code>$1</code>')
    // Code blocks
    .replace(/```([^`]*?)```/gims, '<pre><code>$1</code></pre>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank">$1</a>')
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/gim, '<img src="$2" alt="$1" />')
    // Blockquotes
    .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
    // Lists
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    // Line breaks
    .replace(/\n/gim, '<br>')

  return html
}

function formatMarkdown(): void {
  const editor = document.getElementById('editor') as HTMLTextAreaElement
  if (!editor) return

  let content = editor.value
  // Add spaces after headers
  content = content.replace(/^(#{1,6})([^ #])/gim, '$1 $2')
  // Ensure blank line before headers
  content = content.replace(/([^\n])\n(#{1,6})/gim, '$1\n\n$2')

  editor.value = content
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

function handleWindowControl(action: string | undefined): void {
  if (!action || !window.electronAPI) return

  switch (action) {
    case 'minimize':
      window.electronAPI.minimizeWindow?.()
      break
    case 'maximize':
      window.electronAPI.toggleMaximize?.()
      break
    case 'close':
      window.electronAPI.closeWindow?.()
      break
  }
}
