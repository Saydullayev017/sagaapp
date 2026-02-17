import { EditorView } from '@codemirror/view'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'

import {
  createCodeMirrorEditor,
  getEditorContent,
  setEditorContent,
  getCursorPosition,
} from '../editor/codemirror'
import { parseMarkdown } from '../editor/markdown-parser'
import { debounce, escapeHtml, showNotify } from '../utils/dom'

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
interface OpenTab {
  path: string
  name: string
  content: string
  modified: boolean
}

interface UIState {
  currentFolder: string | null
  currentFile: string | null
  openTabs: OpenTab[]
  activeTabIndex: number
  expandedFolders: Set<string>
  sidebarWidth: number
  editorWidth: number
  outlineWidth: number
  outlineVisible: boolean

  line: number
  column: number
  fileTree: FileTreeState
  activeTerminal: number
  terminalCount: number
  terminalIds: number[]
  terminals: { [key: string]: { terminal: Terminal; fitAddon: FitAddon } }
  terminalHeight: number
  gitChanges: {
    staged: string[]
    unstaged: string[]
  }
}

const state: UIState = {
  currentFolder: null,
  currentFile: null,
  openTabs: [],
  activeTabIndex: -1,
  expandedFolders: new Set(),
  sidebarWidth: 280,
  editorWidth: 50,
  outlineWidth: 220,
  outlineVisible: false,

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

  activeTerminal: 1,
  terminalCount: 1,
  terminalIds: [1],
  terminals: {},
  terminalHeight: 0,
  gitChanges: {
    staged: [],
    unstaged: [],
  },
}

// CodeMirror editor instance
let cmEditor: EditorView | null = null

// Storage keys
const STORAGE_KEY = 'japp-state'

export function initializeUI(): void {
  const app = document.getElementById('app')
  if (!app) return

  app.innerHTML = `
    <div class="main-layout">
      <!-- Left Panel: Sidebar -->
      <aside class="sidebar" id="sidebar" style="width: ${state.sidebarWidth}px">
        <div class="sidebar-header">
          <div class="sidebar-title">
            <h3>Explorer</h3>
            <span class="file-count" id="file-count"></span>
          </div>
        </div>
        <div class="breadcrumb" id="breadcrumb"></div>
        <div class="sidebar-actions-bar">
          <button class="sidebar-action-btn" id="btn-new-file" title="New File">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="12" y1="18" x2="12" y2="12"></line>
              <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
          </button>
          <button class="sidebar-action-btn" id="btn-new-folder" title="New Folder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              <line x1="12" y1="11" x2="12" y2="17"></line>
              <line x1="9" y1="14" x2="15" y2="14"></line>
            </svg>
          </button>
          <button class="sidebar-action-btn" id="btn-open-folder" title="Open Folder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
          <button class="sidebar-action-btn" id="btn-delete" title="Delete Selected">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
          <button class="sidebar-action-btn" id="btn-rename" title="Rename Selected">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="sidebar-action-btn" id="btn-settings" title="Settings" style="margin-left: auto;">
            ⚙
          </button>
        </div>
        <div class="file-tree-search">
          <input type="text" id="tree-search" placeholder="Search files..." />
        </div>
        <div class="file-tree" id="file-tree">
          <div class="sidebar-welcome">
            <div class="welcome-icon">📝</div>
            <h3>Welcome to SagaApp</h3>
            <p>A modern Markdown editor</p>
            <div class="usage-guide">
              <h4>Quick Start:</h4>
              <ul>
                <li><strong>Open Folder:</strong> Click the folder icon in the toolbar</li>
                <li><strong>New File:</strong> Click the + button</li>
                <li><strong>Preview:</strong> Toggle preview mode in toolbar</li>
              </ul>
              <h4>Keyboard Shortcuts:</h4>
              <ul>
                <li><kbd>Ctrl/Cmd + B</kbd> - Toggle sidebar</li>
                <li><kbd>Ctrl/Cmd + S</kbd> - Save file</li>
                <li><kbd>Ctrl/Cmd + P</kbd> - Toggle preview</li>
                <li><kbd>Ctrl/Cmd + F</kbd> - Search files</li>
              </ul>
            </div>
          </div>
        </div>
      </aside>
      
      <!-- Resize Handle for Sidebar -->
      <div class="resize-handle resize-handle-sidebar" id="resize-sidebar"></div>
      
      <!-- Center Panel: Editor -->
      <main class="editor-container">
        <div class="editor-toolbar">
          <div class="toolbar-left">
            <button class="toolbar-btn" id="btn-toggle-sidebar" title="Toggle Sidebar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="9" y1="3" x2="9" y2="21"></line>
              </svg>
            </button>
            <button class="toolbar-btn" id="btn-toggle-terminal" title="Toggle Terminal">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <polyline points="4 17 10 11 4 5"></polyline>
                <line x1="12" y1="19" x2="20" y2="19"></line>
              </svg>
            </button>
            <button class="toolbar-btn" id="btn-toggle-outline" title="Toggle Outline">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="15" y2="12"></line>
                <line x1="3" y1="18" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="toolbar-center"></div>
          <div class="toolbar-right">
            <div class="view-mode-toggle">
              <button class="toolbar-btn view-mode-btn active" data-mode="edit" title="Edit Mode">E</button>
              <button class="toolbar-btn view-mode-btn" data-mode="preview" title="Preview Mode">P</button>
            </div>
          </div>
        </div>
        
        <div class="editor-content-wrapper" id="editor-content-wrapper">
          <div class="editor-pane" id="editor-pane">
            <!-- Tab Bar -->
            <div class="tab-bar" id="tab-bar">
              <div class="tabs-container" id="tabs-container"></div>
            </div>
            <div class="codemirror-container" id="codemirror-editor"></div>
            <!-- Welcome Screen -->
            <div class="welcome-screen" id="welcome-screen">
              <div class="welcome-logo">📝</div>
              <h2>Welcome to Saga</h2>
              <p>Open a folder and select a file to start editing</p>
              <div class="welcome-shortcuts">
                <div class="shortcut">
                  <span class="key">Ctrl</span> + <span class="key">O</span>
                  <span class="desc">Open Folder</span>
                </div>
                <div class="shortcut">
                  <span class="key">Ctrl</span> + <span class="key">N</span>
                  <span class="desc">New File</span>
                </div>
                <div class="shortcut">
                  <span class="key">Ctrl</span> + <span class="key">P</span>
                  <span class="desc">Quick Open</span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="preview-pane hidden" id="preview-pane">
            <div class="preview-content" id="preview-content"></div>
          </div>
          </div>

        <!-- Bottom Panel: Terminal -->
        <div class="terminal-resize-handle" id="terminal-resize"></div>
        <div class="bottom-panel" id="bottom-panel">
          <div class="terminal-header">
            <div class="terminal-tabs">
              <button class="terminal-tab active" data-terminal="1" id="terminal-tab-1">
                <span>Terminal 1</span>
                <span class="terminal-tab-close" data-close="1">×</span>
              </button>
              <button class="terminal-tab-add" id="terminal-add" title="New Terminal">+</button>
            </div>
            <div class="terminal-actions">
              <button class="terminal-action-btn" id="btn-gitlens" title="Graph">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <circle cx="12" cy="12" r="3"></circle>
                  <line x1="12" y1="3" x2="12" y2="9"></line>
                  <line x1="12" y1="15" x2="12" y2="21"></line>
                  <line x1="3" y1="12" x2="9" y2="12"></line>
                  <line x1="15" y1="12" x2="21" y2="12"></line>
                </svg>
              </button>
            </div>
          </div>
          <div class="terminal-panels">
            <div class="terminal-panel active" data-terminal="1">
              <div class="terminal-container" id="terminal-container-1"></div>
            </div>
          </div>
        </div>
      </main>
      
      <!-- Resize Handle for Outline -->
      <div class="resize-handle resize-handle-outline" id="resize-outline"></div>
      
      <!-- Right Panel: Outline -->
      <aside class="outline-panel" id="outline-panel">
        <div class="outline-tabs">
          <button class="outline-tab active" data-view="outline">Outline</button>
          <button class="outline-tab" data-view="git">Git</button>
          <button class="outline-tab" data-view="branches">Branches</button>
          <button class="outline-tab" data-view="graph">Graph</button>
        </div>
        
        <!-- Outline View -->
        <div class="outline-view active" id="outline-view">
          <div class="outline-header">
            <h3>Outline</h3>
          </div>
          <div class="outline-content" id="outline-content">
            <div class="outline-empty">Open a file to see outline</div>
          </div>
        </div>
        
        <!-- Git View -->
        <div class="outline-view" id="git-view">
          <div class="section-header">
            <h3>Git</h3>
            <span class="git-current-branch" id="git-current-branch">-</span>
          </div>
          <div class="git-panel-actions">
            <button class="git-btn" id="git-btn-clone">Clone</button>
            <button class="git-btn" id="git-btn-commit">Commit</button>
            <button class="git-btn" id="git-btn-push">Push</button>
            <button class="git-btn" id="git-btn-pull">Pull</button>
            <button class="git-btn" id="git-btn-new-branch">New Branch</button>
          </div>
        </div>
        
        <!-- Branches View -->
        <div class="outline-view" id="branches-view">
          <div class="section-header">
            <h3>Branches</h3>
          </div>
          <div class="branches-content" id="branches-content">
            <div class="section-empty">Open a folder to see branches</div>
          </div>
        </div>
        
        <!-- Graph View -->
        <div class="outline-view" id="graph-view">
          <div class="section-header">
            <h3>Graph</h3>
          </div>
          <div class="graph-content" id="git-graph-content">
            <div class="section-empty">Open a folder to see commit graph</div>
          </div>
        </div>
      </aside>
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
    
    <!-- Modal Dialog -->
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title" id="modal-title">Create New</h3>
          <button class="modal-close" id="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <input type="text" class="modal-input" id="modal-input" placeholder="Enter name..." />
          <div class="modal-error" id="modal-error"></div>
        </div>
        <div class="modal-footer">
          <button class="modal-btn modal-btn-secondary" id="modal-cancel">Cancel</button>
          <button class="modal-btn modal-btn-primary" id="modal-confirm">Create</button>
        </div>
      </div>
    </div>
    
    <!-- Settings Modal -->
    <div class="modal-overlay" id="settings-overlay">
      <div class="settings-dialog settings-with-sidebar">
        <div class="settings-sidebar">
          <div class="settings-nav">
            <button class="settings-nav-item active" data-section="appearance">
              <span>Appearance</span>
            </button>
            <button class="settings-nav-item" data-section="terminal">
              <span>Dev Mode</span>
            </button>
            <button class="settings-nav-item" data-section="languages">
              <span>Code Execution</span>
            </button>
            <button class="settings-nav-item" data-section="about">
              <span>About</span>
            </button>
          </div>
        </div>
        <div class="settings-main">
          <div class="settings-header">
            <h3>Settings</h3>
            <button class="settings-close" id="settings-close">&times;</button>
          </div>
          <div class="settings-body">
            <!-- Appearance Section -->
            <div class="settings-section" id="settings-section-appearance">
              <h4>Appearance</h4>
              <label class="settings-option">
                <span>Theme</span>
                <select id="setting-theme">
                  <option value="glass" selected>Dark Glass</option>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </label>
            </div>
            <!-- Terminal Section -->
            <div class="settings-section hidden" id="settings-section-terminal">
              <h4>Dev Mode</h4>
              <label class="settings-option">
                <span>Enable Terminal</span>
                <input type="checkbox" id="setting-terminal-enabled" checked />
              </label>
              <p class="settings-info">When enabled, the Terminal button will be visible in the toolbar and you can use the integrated terminal.</p>
            </div>
            <!-- Languages Section -->
            <div class="settings-section hidden" id="settings-section-languages">
              <h4>Code Execution</h4>
              <p class="settings-info">Check installed languages and install missing ones</p>
              <div class="languages-list" id="languages-list">
                <div class="languages-loading">Loading languages...</div>
              </div>
            </div>
            <!-- About Section -->
            <div class="settings-section hidden" id="settings-section-about">
              <h4>About</h4>
              <div class="about-content">
                <div class="about-logo">📝</div>
                <h3>SagaApp</h3>
                <p class="about-version">Version 1.0.0</p>
                <p class="about-desc">Modern Markdown Editor</p>
                <p class="about-tech">Built with Electron + CodeMirror</p>
              </div>
            </div>
          </div>
          <div class="settings-footer">
            <button class="modal-btn modal-btn-primary" id="settings-save">Save</button>
          </div>
        </div>
      </div>
    </div>
  `

  // Загружаем тему
  loadTheme()

  // Обновляем видимость кнопки терминала
  const terminalEnabled = localStorage.getItem('saga-terminal-enabled') !== 'false'
  updateTerminalButtonVisibility(terminalEnabled)

  // Показываем приветственный экран если нет открытых файлов
  updateWelcomeScreen()

  // Добавляем обработчики событий
  setupEventListeners()
  setupResizeHandles()
  setupCodeMirrorEditor()
  setupDragDrop()
  setupPasteHandler()
  setupBottomPanel()
  setupTerminal()
  setupModal()
  setupSettingsModal()
  setupOutline()
  initOutlinePanel()

  // Восстанавливаем состояние или открываем дефолтную папку
  setTimeout(async () => {
    const savedState = localStorage.getItem(STORAGE_KEY)
    if (savedState) {
      await restoreState()
    }
    // No default folder - show welcome screen
  }, 100)
}

function setupEventListeners(): void {
  // Terminal resize
  setupTerminalResize()

  // Sidebar action buttons
  document.getElementById('btn-new-file')?.addEventListener('click', () => showCreateModal('file'))
  document
    .getElementById('btn-new-folder')
    ?.addEventListener('click', () => showCreateModal('folder'))
  document.getElementById('btn-open-folder')?.addEventListener('click', openFolderDialog)
  document.getElementById('btn-delete')?.addEventListener('click', deleteSelectedItem)
  document.getElementById('btn-rename')?.addEventListener('click', renameSelectedItem)

  // Terminal toggle button
  document.getElementById('btn-toggle-sidebar')?.addEventListener('click', toggleSidebar)
  document.getElementById('btn-toggle-terminal')?.addEventListener('click', toggleTerminal)
  document.getElementById('btn-toggle-outline')?.addEventListener('click', toggleOutline)

  // GitLens button in terminal
  document.getElementById('btn-gitlens')?.addEventListener('click', () => {
    if (state.currentFolder) {
      const outlinePanel = document.getElementById('outline-panel')
      if (outlinePanel) {
        state.outlineVisible = true
        outlinePanel.style.display = 'flex'
        document.getElementById('resize-outline')?.removeAttribute('style')

        // Switch to Graph tab
        document.querySelectorAll('.outline-tab').forEach(t => t.classList.remove('active'))
        document.querySelector('.outline-tab[data-view="graph"]')?.classList.add('active')
        document.querySelectorAll('.outline-view').forEach(v => v.classList.remove('active'))
        document.getElementById('graph-view')?.classList.add('active')

        // Load graph info
        if (state.currentFolder) {
          loadGitGraph()
        }
      }
    } else {
      showNotify('Open a folder first to use Git', 'info')
    }
  })

  // Git panel buttons
  document.getElementById('git-btn-clone')?.addEventListener('click', cloneRepository)
  document.getElementById('git-btn-new-branch')?.addEventListener('click', createNewBranch)
  document.getElementById('git-btn-commit')?.addEventListener('click', showCommitModal)
  document.getElementById('git-btn-push')?.addEventListener('click', gitPush)
  document.getElementById('git-btn-pull')?.addEventListener('click', gitPull)

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

    // Ctrl+Tab: Next tab
    if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      if (state.openTabs.length > 1) {
        const nextIndex = (state.activeTabIndex + 1) % state.openTabs.length
        switchToTab(nextIndex)
      }
    }

    // Ctrl+Shift+Tab: Previous tab
    if (e.ctrlKey && e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      if (state.openTabs.length > 1) {
        const prevIndex =
          state.activeTabIndex - 1 < 0 ? state.openTabs.length - 1 : state.activeTabIndex - 1
        switchToTab(prevIndex)
      }
    }

    // Ctrl+W: Close current tab
    if (isMod && e.key === 'w') {
      e.preventDefault()
      if (state.activeTabIndex >= 0) {
        closeTab(state.activeTabIndex)
      }
    }

    // Ctrl+Tab: Next terminal
    if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey && state.terminalIds.length > 1) {
      e.preventDefault()
      const currentIndex = state.terminalIds.indexOf(state.activeTerminal)
      const nextIndex = (currentIndex + 1) % state.terminalIds.length
      switchTerminal(state.terminalIds[nextIndex])
    }

    // Ctrl+Shift+Tab: Previous terminal
    if (e.ctrlKey && e.key === 'Tab' && e.shiftKey && state.terminalIds.length > 1) {
      e.preventDefault()
      const currentIndex = state.terminalIds.indexOf(state.activeTerminal)
      const prevIndex = (currentIndex - 1 + state.terminalIds.length) % state.terminalIds.length
      switchTerminal(state.terminalIds[prevIndex])
    }
  })

  // Drag and Drop functionality
  const editorContentWrapper = document.getElementById('editor-content-wrapper')

  if (editorContentWrapper) {
    editorContentWrapper.addEventListener('dragover', e => {
      e.preventDefault()
      e.stopPropagation()
      editorContentWrapper.classList.add('drag-over')
    })

    editorContentWrapper.addEventListener('dragleave', e => {
      e.preventDefault()
      e.stopPropagation()
      editorContentWrapper.classList.remove('drag-over')
    })

    editorContentWrapper.addEventListener('drop', async e => {
      e.preventDefault()
      e.stopPropagation()
      editorContentWrapper.classList.remove('drag-over')

      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const filePath = (file as any).path

        if (!filePath) continue

        // Check if it's a directory
        if (file.type === '' && !file.name.includes('.')) {
          // Likely a directory - open as folder
          state.currentFolder = filePath
          await loadFileTree(filePath)
          updateGitStatus(filePath)
          saveState()
          showNotify(`Opened folder: ${file.name}`, 'success')
        } else if (
          file.name.endsWith('.md') ||
          file.name.endsWith('.markdown') ||
          file.name.endsWith('.txt')
        ) {
          // Open as file
          await openFileInEditor(filePath)
        } else {
          // Try to open anyway
          await openFileInEditor(filePath)
        }
      }
    })
  }

  // Also support dropping on sidebar to open folder
  const sidebar = document.getElementById('sidebar')

  if (sidebar) {
    sidebar.addEventListener('dragover', e => {
      e.preventDefault()
      sidebar.classList.add('drag-over-sidebar')
    })

    sidebar.addEventListener('dragleave', e => {
      e.preventDefault()
      sidebar.classList.remove('drag-over-sidebar')
    })

    sidebar.addEventListener('drop', async e => {
      e.preventDefault()
      sidebar.classList.remove('drag-over-sidebar')

      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return

      const file = files[0]
      const filePath = (file as any).path

      if (!filePath) return

      // Check if it's a directory
      if (file.type === '' && !file.name.includes('.')) {
        state.currentFolder = filePath
        await loadFileTree(filePath)
        updateGitStatus(filePath)
        saveState()
        showNotify(`Opened folder: ${file.name}`, 'success')
      }
    })
  }

  // Git buttons
  document.getElementById('git-commit')?.addEventListener('click', gitCommit)
  document.getElementById('git-push')?.addEventListener('click', gitPush)
  document.getElementById('git-pull')?.addEventListener('click', gitPull)
}

// Search functionality
// Git functions
async function gitCommit(): Promise<void> {
  if (!state.currentFolder) {
    showNotify('No folder opened', 'error')
    return
  }

  const message = prompt('Enter commit message:')
  if (!message) return

  const result = await window.electronAPI?.gitCommit(state.currentFolder, message)
  if (result?.success) {
    showNotify('Commit successful', 'success')
    updateGitStatus(state.currentFolder)
  } else {
    showNotify(result?.error || 'Commit failed', 'error')
  }
}

async function gitPush(): Promise<void> {
  if (!state.currentFolder) {
    showNotify('No folder opened', 'error')
    return
  }

  try {
    let result = await window.electronAPI?.gitPush(state.currentFolder)

    if (!result?.success && result?.error?.includes('no upstream branch')) {
      const branchResult = await window.electronAPI?.gitBranch(state.currentFolder)
      if (branchResult?.success && branchResult.branch) {
        result = await window.electronAPI?.executeCommand(
          state.currentFolder,
          `git push -u origin ${branchResult.branch}`
        )
      }
    }

    if (result?.success) {
      showNotify('Push successful!', 'success')
    } else {
      showNotify(result?.error || 'Push failed', 'error')
    }
  } catch (error) {
    showNotify('Push failed', 'error')
  }
}

async function gitPull(): Promise<void> {
  if (!state.currentFolder) {
    showNotify('No folder opened', 'error')
    return
  }

  const result = await window.electronAPI?.gitPull(state.currentFolder)
  if (result?.success) {
    showNotify('Pull successful!', 'success')
    updateGitStatus(state.currentFolder)

    // Refresh current file if one is open
    if (state.currentFile && cmEditor) {
      const fileResult = await window.electronAPI?.readFile(state.currentFile)
      if (fileResult?.success && fileResult.content !== undefined) {
        setEditorContent(cmEditor, fileResult.content)
        showNotify('File updated: ' + state.currentFile.split('/').pop(), 'info')
      }
    }
  } else {
    showNotify(result?.error || 'Pull failed', 'error')
  }
}

async function _switchBranch(): Promise<void> {
  if (!state.currentFolder) {
    showNotify('No folder opened', 'error')
    return
  }
  try {
    const result = await window.electronAPI?.gitBranchList(state.currentFolder)
    if (!result?.success || !result.branches || result.branches.length === 0) {
      showNotify('No branches found', 'error')
      return
    }
    const branchName = await showModal('Switch Branch', 'Enter branch name', 'branch')
    if (!branchName) return
    const checkoutResult = await window.electronAPI?.gitCheckout(state.currentFolder, branchName)
    if (checkoutResult?.success) {
      showNotify(`Switched to branch "${branchName}"`, 'success')
      updateGitStatus(state.currentFolder)
    } else {
      showNotify(checkoutResult?.error || 'Failed to switch branch', 'error')
    }
  } catch (error) {
    showNotify('Error switching branch', 'error')
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

  // Outline panel resize
  const outlineHandle = document.getElementById('resize-outline')
  const outlinePanel = document.getElementById('outline-panel')

  if (outlineHandle && outlinePanel) {
    let isResizing = false
    let startX = 0
    let startWidth = 0

    outlineHandle.addEventListener('mousedown', e => {
      isResizing = true
      startX = e.clientX
      startWidth = outlinePanel.offsetWidth
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    })

    document.addEventListener('mousemove', e => {
      if (!isResizing) return
      // Calculate max width (half of window)
      const maxWidth = window.innerWidth / 2
      const width = Math.max(150, Math.min(maxWidth, startWidth - (e.clientX - startX)))
      outlinePanel.style.width = `${width}px`
      state.outlineWidth = width
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

// Tab Management Functions
function renderTabs(): void {
  const container = document.getElementById('tabs-container')
  if (!container) return

  container.innerHTML = state.openTabs
    .map(
      (tab, index) => `
    <div class="tab ${index === state.activeTabIndex ? 'active' : ''}" data-index="${index}">
      <span class="tab-name">${escapeHtml(tab.name)}</span>
      ${tab.modified ? '<span class="tab-modified">●</span>' : ''}
      <button class="tab-close" data-index="${index}">&times;</button>
    </div>
  `
    )
    .join('')

  container.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', e => {
      const target = e.target as HTMLElement
      if (target.classList.contains('tab-close')) {
        const index = parseInt(target.dataset.index || '0')
        closeTab(index)
      } else {
        const index = parseInt((tab as HTMLElement).dataset.index || '0')
        switchToTab(index)
      }
    })
  })
}

function updateWelcomeScreen(): void {
  const welcome = document.getElementById('welcome-screen')
  const editor = document.getElementById('codemirror-editor')
  if (welcome && editor) {
    const hasOpenTabs = state.openTabs.length > 0
    welcome.classList.toggle('hidden', hasOpenTabs)
    editor.style.display = hasOpenTabs ? 'block' : 'none'
  }
}

function openInNewTab(filePath: string, content: string): void {
  // Check if already open
  const existingIndex = state.openTabs.findIndex(t => t.path === filePath)
  if (existingIndex >= 0) {
    switchToTab(existingIndex)
    return
  }

  const fileName = filePath.split(/[\\/]/).pop() || 'Untitled'
  state.openTabs.push({
    path: filePath,
    name: fileName,
    content: content,
    modified: false,
  })
  state.activeTabIndex = state.openTabs.length - 1

  renderTabs()
  loadContentInEditor(content)
  state.currentFile = filePath
  updateWelcomeScreen()
}

function switchToTab(index: number): void {
  if (index < 0 || index >= state.openTabs.length) return

  // Save current content before switching
  if (state.activeTabIndex >= 0 && cmEditor) {
    state.openTabs[state.activeTabIndex].content = getEditorContent(cmEditor)
  }

  state.activeTabIndex = index
  const tab = state.openTabs[index]

  loadContentInEditor(tab.content)
  state.currentFile = tab.path
  renderTabs()
  updateOutline()
  updateWelcomeScreen()
}

async function closeTab(index: number): Promise<void> {
  const tab = state.openTabs[index]
  if (!tab) return

  // Save content before closing
  if (tab.path === state.currentFile && cmEditor) {
    tab.content = getEditorContent(cmEditor)
  }

  // Check if modified and ask to save
  if (tab.modified) {
    const save = confirm(`Save changes to ${tab.name}?`)
    if (save) {
      await window.electronAPI?.writeFile(tab.path, tab.content)
    }
  }

  state.openTabs.splice(index, 1)

  if (state.openTabs.length === 0) {
    state.activeTabIndex = -1
    state.currentFile = null
    if (cmEditor) {
      setEditorContent(cmEditor, '')
    }
  } else if (index === state.activeTabIndex) {
    const newIndex = Math.min(index, state.openTabs.length - 1)
    switchToTab(newIndex)
  } else if (index < state.activeTabIndex) {
    state.activeTabIndex--
  }

  renderTabs()
  updateWelcomeScreen()
}

function loadContentInEditor(content: string): void {
  if (!cmEditor) return
  setEditorContent(cmEditor, content)
}

function setupCodeMirrorEditor(): void {
  const container = document.getElementById('codemirror-editor')
  if (!container) return

  cmEditor = createCodeMirrorEditor(
    container,
    '',
    debounce(() => {
      updateCursorPosition()
      // Auto-save disabled - user saves manually with Ctrl+S
      updateOutline()
      // Update current tab content
      if (state.activeTabIndex >= 0 && state.openTabs[state.activeTabIndex]) {
        const content = getEditorContent(cmEditor!)
        state.openTabs[state.activeTabIndex].content = content
        state.openTabs[state.activeTabIndex].modified = true
        renderTabs()
      }
      // Live preview update (only if preview is visible)
      const previewPane = document.getElementById('preview-pane')
      if (previewPane && !previewPane.classList.contains('hidden')) {
        updatePreview()
      }
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

  // Add event listeners for run code buttons
  setupCodeExecution()
}

function setupCodeExecution(): void {
  const previewContent = document.getElementById('preview-content')
  if (!previewContent) return

  const runButtons = previewContent.querySelectorAll('.run-code-btn')

  runButtons.forEach(btn => {
    btn.addEventListener('click', async e => {
      const button = e.target as HTMLButtonElement
      const codeId = button.dataset.codeId
      const language = button.dataset.language

      if (!codeId || !language) return

      const codeBlock = document.querySelector(`[data-code-id="${codeId}"]`)
      const codeElement = codeBlock?.querySelector('code')
      const outputElement = codeBlock?.querySelector('.code-output') as HTMLElement | null

      if (!codeElement || !outputElement) return

      const code = codeElement.textContent || ''

      // Show loading state
      button.disabled = true
      button.textContent = 'Running...'
      outputElement.style.display = 'block'
      outputElement.textContent = 'Executing...'
      outputElement.className = 'code-output'

      try {
        const result = await window.electronAPI?.executeCode(language, code)

        if (result?.success) {
          outputElement.textContent = result.output || '(no output)'
          outputElement.className = 'code-output success'
        } else {
          outputElement.textContent = result?.error || 'Execution failed'
          outputElement.className = 'code-output error'
        }
      } catch (error: any) {
        outputElement.textContent = error.message || 'Execution failed'
        outputElement.className = 'code-output error'
      }

      button.disabled = false
      button.textContent = '▶ Run'
    })
  })
}

function toggleSidebar(): void {
  const mainLayout = document.querySelector('.main-layout')
  if (!mainLayout) return

  mainLayout.classList.toggle('sidebar-collapsed')
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

// Generate unique folder ID from path hash
function getFolderId(path: string): number {
  let hash = 0
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

// Store all known folder paths for quick lookup
const allFolderPaths = new Set<string>()

async function loadFileTree(folderPath: string, preserveExpanded: boolean = false): Promise<void> {
  if (!window.electronAPI?.readDirectory) return

  // Clear expanded paths and folder paths only for new root folder
  if (!preserveExpanded) {
    state.fileTree.expandedPaths.clear()
    allFolderPaths.clear()
  }

  const result = await window.electronAPI.readDirectory(folderPath)
  if (result.success && result.entries) {
    state.fileTree.rootPath = folderPath
    state.fileTree.nodes = result.entries.map((entry: any) => {
      // Track all folder paths
      if (entry.type === 'directory') {
        allFolderPaths.add(entry.path)
      }
      return {
        name: entry.name,
        path: entry.path,
        type: entry.type,
        extension: entry.extension,
        size: entry.size,
      }
    })

    // Clear expanded paths for new tree
    state.fileTree.expandedPaths.clear()

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

  // Show welcome message when no folder is open
  if (!state.fileTree.rootPath) {
    return // Keep the welcome HTML from initial template
  }

  const filtered = filterNodes(state.fileTree.nodes)

  if (filtered.length === 0) {
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

function renderTreeNodes(nodes: TreeNode[], _depth: number): string {
  const sorted = [...nodes].sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name)
    return a.type === 'directory' ? -1 : 1
  })

  let html = ''

  for (const node of sorted) {
    const isExpanded = state.fileTree.expandedPaths.has(node.path)
    const isSelected = state.fileTree.selectedPath === node.path

    if (node.type === 'directory') {
      // Use path hash as unique folder ID
      const folderId = getFolderId(node.path)

      html += `
        <div class="tree-item tree-folder">
          <div class="tree-item-content ${isSelected ? 'active' : ''}" 
               data-folder-id="${folderId}" 
               data-path="${escapeHtml(node.path)}"
               data-type="directory">
            <span class="tree-line"></span>
            <span class="tree-toggle">${isExpanded ? '▼' : '▶'}</span>
            <span class="tree-icon">${isExpanded ? '📂' : '📁'}</span>
            <span class="tree-label">${escapeHtml(node.name)}</span>
          </div>
          <div class="tree-children" 
               id="folder-children-${folderId}"
               style="display: ${isExpanded ? 'block' : 'none'}">
          </div>
        </div>
      `
    } else {
      html += `
        <div class="tree-item tree-file">
          <div class="tree-item-content ${isSelected ? 'active' : ''}" 
               data-path="${escapeHtml(node.path)}"
               data-type="file">
            <span class="tree-line"></span>
            <span class="tree-toggle" style="visibility: hidden">▶</span>
            <span class="tree-icon">📄</span>
            <span class="tree-label">${escapeHtml(node.name)}</span>
          </div>
        </div>
      `
    }
  }

  return html
}

function setupFileTreeListeners(): void {
  const fileTree = document.getElementById('file-tree')
  if (!fileTree) return

  // Use event delegation - attach one listener to the container
  fileTree.onclick = async e => {
    const target = e.target as HTMLElement
    const itemContent = target.closest('.tree-item-content') as HTMLElement
    if (!itemContent) return

    const folderId = itemContent.dataset.folderId
    const folderPath = itemContent.dataset.path
    const type = itemContent.dataset.type

    // Update selection
    document.querySelectorAll('.tree-item-content').forEach(el => {
      el.classList.remove('active')
    })
    itemContent.classList.add('active')

    if (type === 'directory' && folderId && folderPath) {
      e.stopPropagation()
      state.fileTree.selectedPath = folderPath
      await toggleFolder(parseInt(folderId), folderPath)
    } else if (type === 'file' && folderPath) {
      state.fileTree.selectedPath = folderPath
      await openFileInEditor(folderPath)
    }
  }

  // Search input
  const searchInput = document.getElementById('tree-search') as HTMLInputElement
  if (searchInput) {
    searchInput.oninput = () => {
      state.fileTree.filterText = searchInput.value
      renderFileTreeUI()
    }
  }
}

async function toggleFolder(folderId: number, folderPath: string): Promise<void> {
  const isExpanded = state.fileTree.expandedPaths.has(folderPath)
  const childrenContainer = document.getElementById(`folder-children-${folderId}`)

  // Find the toggle and icon elements
  const folderItem = childrenContainer?.parentElement
  const toggleIcon = folderItem?.querySelector('.tree-toggle')
  const folderIcon = folderItem?.querySelector('.tree-icon')

  if (isExpanded) {
    // Collapse
    state.fileTree.expandedPaths.delete(folderPath)
    if (childrenContainer) childrenContainer.style.display = 'none'
    if (toggleIcon) toggleIcon.textContent = '▶'
    if (folderIcon) folderIcon.textContent = '📁'
  } else {
    // Expand
    state.fileTree.expandedPaths.add(folderPath)
    if (childrenContainer) {
      // Load children if not already loaded
      if (!childrenContainer.innerHTML.trim()) {
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
    const nodes: TreeNode[] = result.entries.map((entry: any) => {
      // Track all folder paths for quick lookup
      if (entry.type === 'directory') {
        allFolderPaths.add(entry.path)
      }
      return {
        name: entry.name,
        path: entry.path,
        type: entry.type,
        extension: entry.extension,
        size: entry.size,
      }
    })

    // Render children at depth 1
    container.innerHTML = renderTreeNodes(nodes, 1)
    setupFileTreeListeners()
  }
}

async function openFileInEditor(filePath: string): Promise<void> {
  if (!window.electronAPI?.readFile) return

  const result = await window.electronAPI.readFile(filePath)
  if (result.success && result.content !== undefined) {
    // Open in new tab instead of replacing
    openInNewTab(filePath, result.content)

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

async function saveCurrentFile(): Promise<void> {
  // Save current tab content first
  if (state.activeTabIndex >= 0 && cmEditor) {
    state.openTabs[state.activeTabIndex].content = getEditorContent(cmEditor)
  }

  if (!state.currentFile || !window.electronAPI?.writeFile) {
    // Save as new file
    saveAsNewFile()
    return
  }

  if (!cmEditor) return

  const content = getEditorContent(cmEditor)
  const result = await window.electronAPI.writeFile(state.currentFile, content)
  if (result.success) {
    // Mark tab as not modified
    if (state.activeTabIndex >= 0) {
      state.openTabs[state.activeTabIndex].modified = false
      renderTabs()
    }
    showNotify('File saved successfully', 'success')
    updateGitStatus(state.currentFolder || '')
  } else {
    showNotify('Error saving file', 'error')
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
      showNotify('File saved successfully', 'success')
    }
  }
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
  showNotify('Markdown formatted', 'success')
}

function setupBottomPanel(): void {
  document.querySelectorAll('.terminal-tab').forEach(tab => {
    tab.addEventListener('click', e => {
      const target = e.target as HTMLElement
      if (target.classList.contains('terminal-tab-close')) {
        e.stopPropagation()
        const closeBtn = target
        const id = parseInt(closeBtn.dataset.close || '0')
        if (id) closeTerminal(id)
        return
      }
      const currentTarget = e.currentTarget as HTMLElement
      const terminalId = currentTarget.dataset.terminal
      if (terminalId) {
        switchTerminal(parseInt(terminalId))
      }
    })
  })

  document.getElementById('terminal-add')?.addEventListener('click', addTerminal)
}

function switchTerminal(id: number): void {
  state.activeTerminal = id

  document.querySelectorAll('.terminal-tab').forEach(tab => {
    tab.classList.toggle('active', (tab as HTMLElement).dataset.terminal === String(id))
  })

  document.querySelectorAll('.terminal-panel').forEach(panel => {
    panel.classList.toggle('active', (panel as HTMLElement).dataset.terminal === String(id))
  })

  const term = state.terminals[String(id)]
  if (term) {
    setTimeout(() => {
      term.fitAddon.fit()
      window.electronAPI?.terminalResize(String(id), term.terminal.cols, term.terminal.rows)
    }, 10)
  }
}

function addTerminal(): void {
  state.terminalCount++
  const id = state.terminalCount
  state.terminalIds.push(id)

  const tabsContainer = document.querySelector('.terminal-tabs')
  const addBtn = document.getElementById('terminal-add')
  const newTab = document.createElement('button')
  newTab.className = 'terminal-tab active'
  newTab.dataset.terminal = String(id)
  newTab.innerHTML = `<span>Terminal ${id}</span><span class="terminal-tab-close" data-close="${id}">×</span>`
  newTab.addEventListener('click', e => {
    const target = e.target as HTMLElement
    if (target.classList.contains('terminal-tab-close')) {
      e.stopPropagation()
      closeTerminal(parseInt(target.dataset.close || '0'))
    } else {
      switchTerminal(id)
    }
  })
  tabsContainer?.insertBefore(newTab, addBtn)

  const panelsContainer = document.querySelector('.terminal-panels')
  const newPanel = document.createElement('div')
  newPanel.className = 'terminal-panel active'
  newPanel.dataset.terminal = String(id)
  newPanel.innerHTML = `
    <div class="terminal-container" id="terminal-container-${id}"></div>
  `
  panelsContainer?.appendChild(newPanel)

  document.querySelectorAll('.terminal-panel').forEach(panel => {
    if (panel !== newPanel) {
      panel.classList.remove('active')
    }
  })

  createTerminal(id)
  state.activeTerminal = id
}

function closeTerminal(id: number): void {
  const index = state.terminalIds.indexOf(id)
  if (index === -1) return

  window.electronAPI?.terminalKill(String(id))

  const tab = document.querySelector(`.terminal-tab[data-terminal="${id}"]`)
  const panel = document.querySelector(`.terminal-panel[data-terminal="${id}"]`)
  tab?.remove()
  panel?.remove()

  delete state.terminals[String(id)]
  state.terminalIds.splice(index, 1)

  if (state.activeTerminal === id) {
    if (state.terminalIds.length > 0) {
      const newActiveId = state.terminalIds[Math.min(index, state.terminalIds.length - 1)]
      switchTerminal(newActiveId)
    } else {
      state.activeTerminal = 0
      document.querySelectorAll('.terminal-panel').forEach(p => p.classList.remove('active'))
    }
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
    showNotify('Open a folder first', 'error')
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
        showNotify('Image saved', 'success')
        loadFileTree(state.currentFolder!)
      } else {
        showNotify('Failed to save image', 'error')
      }
    }
    reader.readAsDataURL(file)
  } catch (e) {
    console.error('Image drop error:', e)
    showNotify('Failed to process image', 'error')
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

function isCodeLike(text: string): boolean {
  if (!text) return false

  const lines = text.split('\n')
  if (lines.length > 1) return true

  const codePatterns = [
    /[{}\[\]();]/,
    /^(import|export|const|let|var|function|class|def|public|private|return|if|else|for|while)\s/m,
    /[=<>!]+/,
    /^\s{2,}/m,
    /\(\s*\)/,
    /=>\s*{/,
  ]

  return codePatterns.some(pattern => pattern.test(text))
}

function detectLanguage(code: string): string {
  const firstLine = code.trim().split('\n')[0] || ''

  if (/^(import|export|const|let|var|function|class|=>|async|await)\s/.test(firstLine)) {
    return 'javascript'
  }
  if (/^(def|class|import|from|if __name__|print\()/.test(firstLine)) {
    return 'python'
  }
  if (/^(function|var|let|const|public|private|class|interface)\s/.test(firstLine)) {
    return 'java'
  }
  if (/^(<\?php|function|class|public|private)\s/.test(firstLine)) {
    return 'php'
  }
  if (/^(sub|my|use|package|print)\s/.test(firstLine)) {
    return 'perl'
  }
  if (
    /^#!.*(bash|sh|zsh)/.test(firstLine) ||
    /^(echo|cd|ls|git|npm|node|cat|grep)\s/.test(firstLine)
  ) {
    return 'bash'
  }
  if (/^(package|import|public|class)\s/.test(firstLine)) {
    return 'java'
  }

  return ''
}

function setupPasteHandler(): void {
  document.addEventListener('paste', async e => {
    const items = e.clipboardData?.items
    if (!items) return

    let pastedText = ''
    let isTextPaste = false

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          await handleImageDrop(file)
        }
        break
      }
      if (item.type === 'text/plain') {
        e.preventDefault()
        isTextPaste = true
        pastedText = e.clipboardData?.getData('text/plain') || ''
        break
      }
    }

    if (isTextPaste && pastedText && isCodeLike(pastedText)) {
      const lang = detectLanguage(pastedText)
      const fence = lang
        ? '```' + lang + '\n' + pastedText + '\n```'
        : '```\n' + pastedText + '\n```'

      if (cmEditor) {
        const pos = cmEditor.state.selection.main.head
        cmEditor.dispatch({
          changes: { from: pos, insert: fence + '\n' },
          selection: { anchor: pos + 4 + lang.length + 1 },
        })
        cmEditor.focus()
      }
    }
  })
}

async function updateGitStatus(folderPath: string): Promise<void> {
  const statusGit = document.getElementById('status-git')
  const gitCurrentBranch = document.getElementById('git-current-branch')
  if (!statusGit || !folderPath) return

  try {
    const [branchResult, statusResult] = await Promise.all([
      window.electronAPI?.gitBranch(folderPath),
      window.electronAPI?.gitStatus(folderPath),
    ])

    const branch = branchResult?.success && branchResult.branch ? branchResult.branch : 'No repo'
    const files = statusResult?.success && statusResult.isRepo ? statusResult.files || [] : []
    const changedCount = files.length

    statusGit.innerHTML = `
      <span class="git-branch">${branch}</span>
      <span class="git-changes">${changedCount} changes</span>
    `

    // Update git panel branch display
    if (gitCurrentBranch) {
      gitCurrentBranch.textContent = branch
    }

    await refreshGitChanges()
  } catch {
    statusGit.innerHTML = `
      <span class="git-branch">Not a git repo</span>
      <span class="git-changes"></span>
    `
    if (gitCurrentBranch) {
      gitCurrentBranch.textContent = '-'
    }
  }
}

function showAboutAlert(): void {
  const alertBox = document.createElement('div')
  alertBox.className = 'about-alert'
  alertBox.innerHTML = `
    <div class="about-alert-content">
      <h3>SagaApp</h3>
      <p>Version 1.0.0</p>
      <p>Modern Markdown Editor</p>
      <p class="about-info">Built with Electron + CodeMirror</p>
    </div>
  `
  document.body.appendChild(alertBox)

  setTimeout(() => {
    alertBox.classList.add('show')
  }, 10)

  setTimeout(() => {
    alertBox.classList.remove('show')
    setTimeout(() => {
      alertBox.remove()
    }, 300)
  }, 4000)
}

function loadTheme(): void {
  const savedTheme = localStorage.getItem('japp-theme')
  if (savedTheme && ['dark', 'light', 'glass'].includes(savedTheme)) {
    document.documentElement.setAttribute('data-theme', savedTheme)
  }
}

function setupTerminal(): void {
  createTerminal(1)

  window.electronAPI?.onTerminalData((id, data) => {
    const term = state.terminals[id]
    if (term) {
      term.terminal.write(data)
    }
  })

  window.electronAPI?.onTerminalExit((id, exitCode) => {
    const term = state.terminals[id]
    if (term) {
      term.terminal.write(`\r\n\x1b[33mProcess exited with code ${exitCode}\x1b[0m\r\n`)
    }
  })

  window.addEventListener('resize', () => {
    Object.values(state.terminals).forEach(({ fitAddon }) => {
      fitAddon.fit()
    })
  })
}

async function createTerminal(id: number): Promise<void> {
  const container = document.getElementById(`terminal-container-${id}`)
  if (!container) {
    console.error('[Terminal] Container not found!')
    return
  }
  if (state.terminals[String(id)]) {
    return
  }

  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', monospace",
    theme: {
      background: '#1a1a2e',
      foreground: '#e6e6e6',
      cursor: '#6c63ff',
      selectionBackground: 'rgba(108, 99, 255, 0.3)',
    },
    scrollback: 10000,
    allowProposedApi: true,
  })

  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)

  terminal.open(container)
  fitAddon.fit()

  state.terminals[String(id)] = { terminal, fitAddon }

  terminal.onData(data => {
    window.electronAPI?.terminalInput(String(id), data)
  })

  const cwd = state.currentFolder || '/Users/javlonbeksaydullaev'
  console.log('[Terminal] Creating PTY with cwd:', cwd)
  try {
    const result = await window.electronAPI?.terminalCreate(String(id), cwd)
    console.log('[Terminal] PTY created:', result)
  } catch (err) {
    console.error('[Terminal] Error creating PTY:', err)
  }

  setTimeout(() => {
    fitAddon.fit()
  }, 100)
}

function setupTerminalResize(): void {
  const resizeHandle = document.getElementById('terminal-resize')
  const bottomPanel = document.getElementById('bottom-panel')

  if (!resizeHandle || !bottomPanel) return

  let isResizing = false
  let startY = 0
  let startHeight = 0

  resizeHandle.addEventListener('mousedown', e => {
    isResizing = true
    startY = e.clientY
    startHeight = bottomPanel.offsetHeight
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
    resizeHandle.classList.add('resizing')
  })

  document.addEventListener('mousemove', e => {
    if (!isResizing) return

    const delta = startY - e.clientY
    const newHeight = Math.max(100, Math.min(window.innerHeight * 0.8, startHeight + delta))

    bottomPanel.style.height = `${newHeight}px`
    state.terminalHeight = newHeight

    const activeTerm = state.terminals[String(state.activeTerminal)]
    if (activeTerm) {
      activeTerm.fitAddon.fit()
      const cols = activeTerm.terminal.cols
      const rows = activeTerm.terminal.rows
      window.electronAPI?.terminalResize(String(state.activeTerminal), cols, rows)
    }
  })

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      resizeHandle.classList.remove('resizing')
      localStorage.setItem('japp-terminal-height', String(state.terminalHeight))
    }
  })

  const savedHeight = localStorage.getItem('japp-terminal-height')
  if (savedHeight) {
    const height = parseInt(savedHeight)
    if (height > 0) {
      bottomPanel.style.height = `${height}px`
      state.terminalHeight = height
    }
  }
}

// Modal Dialog Functions
let modalCallback: ((value: string | null) => void) | null = null

function setupModal(): void {
  const overlay = document.getElementById('modal-overlay')
  const closeBtn = document.getElementById('modal-close')
  const cancelBtn = document.getElementById('modal-cancel')
  const confirmBtn = document.getElementById('modal-confirm')
  const input = document.getElementById('modal-input') as HTMLInputElement

  const closeModal = () => {
    if (overlay) overlay.classList.remove('active')
    if (input) input.value = ''
    if (modalCallback) modalCallback(null)
    modalCallback = null
  }

  closeBtn?.addEventListener('click', closeModal)
  cancelBtn?.addEventListener('click', closeModal)

  confirmBtn?.addEventListener('click', () => {
    if (input && modalCallback) {
      const value = input.value.trim()
      if (value) {
        modalCallback(value)
        closeModal()
      } else {
        showModalError('Please enter a name')
      }
    }
  })

  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      confirmBtn?.click()
    } else if (e.key === 'Escape') {
      closeModal()
    }
  })

  overlay?.addEventListener('click', e => {
    if (e.target === overlay) closeModal()
  })
}

// Settings Modal
function setupSettingsModal(): void {
  const settingsBtn = document.getElementById('btn-settings')
  const settingsOverlay = document.getElementById('settings-overlay')
  const settingsClose = document.getElementById('settings-close')
  const settingsSave = document.getElementById('settings-save')

  // Load current settings
  const fontSizeSelect = document.getElementById('setting-fontsize') as HTMLSelectElement
  const wordWrapCheck = document.getElementById('setting-wordwrap') as HTMLInputElement
  const themeSelect = document.getElementById('setting-theme') as HTMLSelectElement
  const terminalEnabledCheck = document.getElementById(
    'setting-terminal-enabled'
  ) as HTMLInputElement

  // Load saved settings
  const savedFontSize = localStorage.getItem('saga-font-size') || '14'
  const savedWordWrap = localStorage.getItem('saga-word-wrap') !== 'false'
  const savedTheme = localStorage.getItem('saga-theme') || 'glass'
  const savedTerminalEnabled = localStorage.getItem('saga-terminal-enabled') !== 'false'

  if (fontSizeSelect) fontSizeSelect.value = savedFontSize
  if (wordWrapCheck) wordWrapCheck.checked = savedWordWrap
  if (themeSelect) themeSelect.value = savedTheme
  if (terminalEnabledCheck) terminalEnabledCheck.checked = savedTerminalEnabled

  const openSettings = () => {
    settingsOverlay?.classList.add('active')
    // Show first section by default
    showSettingsSection('editor')
  }

  const closeSettings = () => {
    settingsOverlay?.classList.remove('active')
  }

  // Navigation between settings sections
  const showSettingsSection = (section: string) => {
    document.querySelectorAll('.settings-nav-item').forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.section === section)
    })
    document.querySelectorAll('.settings-section').forEach(sec => {
      sec.classList.toggle('hidden', sec.id !== `settings-section-${section}`)
    })
  }

  document.querySelectorAll('.settings-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = (btn as HTMLElement).dataset.section
      if (section) showSettingsSection(section)
    })
  })

  settingsBtn?.addEventListener('click', openSettings)
  settingsClose?.addEventListener('click', closeSettings)
  settingsOverlay?.addEventListener('click', e => {
    if (e.target === settingsOverlay) closeSettings()
  })

  settingsSave?.addEventListener('click', () => {
    const fontSize = (document.getElementById('setting-fontsize') as HTMLSelectElement)?.value
    const wordWrap = (document.getElementById('setting-wordwrap') as HTMLInputElement)?.checked
    const theme = (document.getElementById('setting-theme') as HTMLSelectElement)?.value
    const terminalEnabled = (
      document.getElementById('setting-terminal-enabled') as HTMLInputElement
    )?.checked

    // Save settings
    localStorage.setItem('saga-font-size', fontSize || '14')
    localStorage.setItem('saga-word-wrap', String(wordWrap !== false))
    localStorage.setItem('saga-theme', theme || 'glass')
    localStorage.setItem('saga-terminal-enabled', String(terminalEnabled))

    // Apply theme immediately
    document.documentElement.setAttribute('data-theme', theme || 'glass')

    // Update terminal button visibility
    updateTerminalButtonVisibility(terminalEnabled)

    closeSettings()
    showNotify('Settings saved!', 'success')
  })

  // About button - shows small alert
  document.getElementById('btn-about')?.addEventListener('click', () => {
    showAboutAlert()
  })

  // Load languages when settings opens
  openSettings()
  loadLanguages().catch(() => {})
  closeSettings()
}

interface LanguageInfo {
  id: string
  name: string
  installed: boolean
  version?: string
  icon: string
}

async function loadLanguages(): Promise<void> {
  const container = document.getElementById('languages-list')
  if (!container) return

  try {
    const result = await window.electronAPI?.checkLanguages()
    if (result?.success && result.languages) {
      renderLanguages(result.languages)
    } else {
      container.innerHTML = '<div class="languages-error">Failed to load languages</div>'
    }
  } catch {
    container.innerHTML = '<div class="languages-error">Failed to load languages</div>'
  }
}

function renderLanguages(languages: LanguageInfo[]): void {
  const container = document.getElementById('languages-list')
  if (!container) return

  container.innerHTML = languages
    .map(
      lang => `
    <div class="language-item ${lang.installed ? 'installed' : 'not-installed'}">
      <span class="language-icon">${lang.icon}</span>
      <div class="language-info">
        <span class="language-name">${lang.name}</span>
        <span class="language-version">${lang.installed ? lang.version || 'Installed' : 'Not installed'}</span>
      </div>
      ${
        lang.installed
          ? `<div class="language-actions">
               <button class="language-check-btn" data-lang="${lang.id}" title="Check & Fix">🔍</button>
               <button class="language-uninstall-btn" data-lang="${lang.id}">Uninstall</button>
             </div>`
          : `<button class="language-install-btn" data-lang="${lang.id}">Install</button>`
      }
    </div>
  `
    )
    .join('')

  container.querySelectorAll('.language-install-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      const target = e.target as HTMLButtonElement
      const langId = target.dataset.lang
      if (!langId) return

      target.disabled = true
      target.textContent = 'Installing...'

      const result = await window.electronAPI?.installLanguage(langId)
      if (result?.success) {
        showNotify(`${langId} installed successfully!`, 'success')
        await loadLanguages()
      } else {
        showNotify(result?.error || 'Installation failed', 'error')
        target.disabled = false
        target.textContent = 'Install'
      }
    })
  })

  container.querySelectorAll('.language-uninstall-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      const target = e.target as HTMLButtonElement
      const langId = target.dataset.lang
      if (!langId) return

      const confirmed = confirm(`Are you sure you want to uninstall ${langId}?`)
      if (!confirmed) return

      target.disabled = true
      target.textContent = 'Uninstalling...'

      const result = await window.electronAPI?.uninstallLanguage(langId)
      if (result?.success) {
        showNotify(`${langId} uninstalled successfully!`, 'success')
        await loadLanguages()
      } else {
        showNotify(result?.error || 'Uninstall failed', 'error')
        target.disabled = false
        target.textContent = 'Uninstall'
      }
    })
  })

  container.querySelectorAll('.language-check-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      const target = e.target as HTMLButtonElement
      const langId = target.dataset.lang
      if (!langId) return

      target.disabled = true
      target.textContent = '🔄'

      const result = await window.electronAPI?.checkLanguage(langId)
      if (result?.success) {
        if (result.fixed) {
          showNotify(`${langId} fixed! Now using: ${result.path}`, 'success')
        } else {
          showNotify(`${langId} is working! Path: ${result.path}`, 'success')
        }
      } else {
        showNotify(result?.error || `${langId} not found. Try installing.`, 'error')
      }
      await loadLanguages()
    })
  })
}

function showModal(
  title: string,
  placeholder: string,
  type: 'file' | 'folder' | 'commit' | 'branch' | 'text'
): Promise<string | null> {
  return new Promise(resolve => {
    const overlay = document.getElementById('modal-overlay')
    const titleEl = document.getElementById('modal-title')
    const input = document.getElementById('modal-input') as HTMLInputElement
    const confirmBtn = document.getElementById('modal-confirm')

    modalCallback = resolve

    if (titleEl) titleEl.textContent = title
    if (input) {
      input.placeholder = placeholder
      input.value = ''
    }
    if (confirmBtn) {
      if (type === 'commit') confirmBtn.textContent = 'Commit'
      else if (type === 'text') confirmBtn.textContent = 'OK'
      else confirmBtn.textContent = 'Create'
    }

    clearModalError()
    overlay?.classList.add('active')
    setTimeout(() => input?.focus(), 100)
  })
}

function showModalError(message: string): void {
  const errorEl = document.getElementById('modal-error')
  if (errorEl) {
    errorEl.textContent = message
    errorEl.classList.add('active')
  }
}

function clearModalError(): void {
  const errorEl = document.getElementById('modal-error')
  if (errorEl) {
    errorEl.textContent = ''
    errorEl.classList.remove('active')
  }
}

// Get parent folder path from any file or folder path
function getParentFolder(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash <= 0) return '/'
  return normalized.substring(0, lastSlash)
}

async function showCreateModal(type: 'file' | 'folder'): Promise<void> {
  if (!state.currentFolder) {
    showNotify('Please open a folder first', 'error')
    return
  }

  // Use selected folder if it's a directory, otherwise find parent folder
  let targetFolder = state.currentFolder
  if (state.fileTree.selectedPath) {
    // Check if selected path is a known directory (including nested)
    if (allFolderPaths.has(state.fileTree.selectedPath)) {
      // It's a directory - create inside it
      targetFolder = state.fileTree.selectedPath
    } else {
      // It's a file or unknown - get parent folder
      targetFolder = getParentFolder(state.fileTree.selectedPath)

      // Normalize and validate
      if (!targetFolder || targetFolder === state.currentFolder) {
        targetFolder = state.currentFolder
      }
    }
  }

  const folderName = targetFolder.split(/[/\\]/).pop() || targetFolder
  const title =
    type === 'file' ? `Create New File in "${folderName}"` : `Create New Folder in "${folderName}"`
  const placeholder = type === 'file' ? 'Enter file name (e.g., document.md)' : 'Enter folder name'
  const name = await showModal(title, placeholder, type)

  if (!name) return

  // Auto-add .md extension for files - always force .md
  let finalName = name
  if (type === 'file') {
    // Remove any existing extension and force .md
    const nameWithoutExt = name.replace(/\.[^.]+$/, '')
    finalName = nameWithoutExt + '.md'
  }

  try {
    let result
    if (type === 'file') {
      result = await window.electronAPI?.createFile(targetFolder, finalName)
    } else {
      result = await window.electronAPI?.createFolder(targetFolder, name)
    }

    if (result?.success) {
      // For files, get the full path and open in editor
      if (type === 'file' && result.path) {
        const createdFilePath = result.path
        showNotify(`File created successfully in "${folderName}"`, 'success')

        // Select and open the file
        state.fileTree.selectedPath = createdFilePath
        await loadFileTree(state.currentFolder, true)
        await openFileInEditor(createdFilePath)
      } else {
        showNotify(
          `${type === 'file' ? 'File' : 'Folder'} created successfully in "${folderName}"`,
          'success'
        )

        // Refresh the tree and expand the target folder if needed
        if (targetFolder !== state.currentFolder) {
          state.fileTree.expandedPaths.add(targetFolder)
        }
        await loadFileTree(state.currentFolder, true)
      }
    } else {
      showNotify(result?.error || `Failed to create ${type}`, 'error')
    }
  } catch (error) {
    showNotify(`Error creating ${type}`, 'error')
  }
}

async function openFolderDialog(): Promise<void> {
  const result = await window.electronAPI?.showOpenDialog({
    properties: ['openDirectory'],
  })

  if (!result?.canceled && result?.filePaths.length > 0) {
    const folderPath = result.filePaths[0]
    state.currentFolder = folderPath
    await loadFileTree(folderPath)
    updateGitStatus(folderPath)
    saveState()
  }
}

async function deleteSelectedItem(): Promise<void> {
  const selectedPath = state.fileTree.selectedPath
  if (!selectedPath) {
    showNotify('Please select a file or folder to delete', 'error')
    return
  }

  const itemName = selectedPath.split('/').pop() || selectedPath.split('\\').pop() || selectedPath
  const confirmed = confirm(`Are you sure you want to delete "${itemName}"?`)

  if (!confirmed) return

  try {
    const result = await window.electronAPI?.deleteItem(selectedPath)
    if (result?.success) {
      showNotify('Item deleted successfully', 'success')
      if (state.currentFolder) {
        await loadFileTree(state.currentFolder, true)
      }
      if (state.currentFile === selectedPath) {
        state.currentFile = null
        if (cmEditor) {
          setEditorContent(cmEditor, '')
        }
        const statusFile = document.getElementById('status-file')
        if (statusFile) statusFile.textContent = 'No file opened'
      }
    } else {
      showNotify(result?.error || 'Failed to delete item', 'error')
    }
  } catch (error) {
    showNotify('Error deleting item', 'error')
  }
}

async function renameSelectedItem(): Promise<void> {
  const selectedPath = state.fileTree.selectedPath
  if (!selectedPath) {
    showNotify('Please select a file or folder to rename', 'error')
    return
  }

  const itemName = selectedPath.split('/').pop() || selectedPath.split('\\').pop() || selectedPath
  const newName = await showModal('Rename Item', `Enter new name for "${itemName}"`, 'file')

  if (!newName || newName === itemName) return

  try {
    const result = await window.electronAPI?.renameItem(selectedPath, newName)
    if (result?.success && result.newPath) {
      showNotify('Item renamed successfully', 'success')

      // Update current file if it was renamed
      if (state.currentFile === selectedPath) {
        state.currentFile = result.newPath
        const statusFile = document.getElementById('status-file')
        if (statusFile) statusFile.textContent = newName
      }

      // Refresh the file tree
      if (state.currentFolder) {
        await loadFileTree(state.currentFolder, true)
      }
    } else {
      showNotify(result?.error || 'Failed to rename item', 'error')
    }
  } catch (error) {
    showNotify('Error renaming item', 'error')
  }
}

// Update terminal button visibility based on settings
function updateTerminalButtonVisibility(enabled: boolean): void {
  const btn = document.getElementById('btn-toggle-terminal')
  if (btn) {
    btn.style.display = enabled ? 'flex' : 'none'
  }
  // If terminal is disabled, collapse the bottom panel
  if (!enabled) {
    const mainLayout = document.querySelector('.main-layout')
    if (mainLayout) {
      mainLayout.classList.add('terminal-collapsed')
    }
  }
}

// Terminal Toggle
function toggleTerminal(): void {
  const mainLayout = document.querySelector('.main-layout')
  const btn = document.getElementById('btn-toggle-terminal')

  if (!mainLayout) return

  const isCollapsed = mainLayout.classList.contains('terminal-collapsed')

  if (isCollapsed) {
    mainLayout.classList.remove('terminal-collapsed')
    btn?.classList.add('active')
    // Fit terminal after showing
    setTimeout(() => {
      const activeTerm = state.terminals[String(state.activeTerminal)]
      if (activeTerm) {
        activeTerm.fitAddon.fit()
      }
    }, 350)
  } else {
    mainLayout.classList.add('terminal-collapsed')
    btn?.classList.remove('active')
  }
}

function toggleOutline(): void {
  const mainLayout = document.querySelector('.main-layout')
  const btn = document.getElementById('btn-toggle-outline')
  if (!mainLayout) return

  state.outlineVisible = !state.outlineVisible

  if (state.outlineVisible) {
    mainLayout.classList.remove('outline-collapsed')
    btn?.classList.add('active')
  } else {
    mainLayout.classList.add('outline-collapsed')
    btn?.classList.remove('active')
  }

  saveState()
}

// Initialize outline visibility
function initOutlinePanel(): void {
  const mainLayout = document.querySelector('.main-layout')
  const btn = document.getElementById('btn-toggle-outline')

  if (mainLayout) {
    if (state.outlineVisible) {
      mainLayout.classList.remove('outline-collapsed')
      btn?.classList.add('active')
    } else {
      mainLayout.classList.add('outline-collapsed')
      btn?.classList.remove('active')
    }
  }
}

// Outline Functions
function updateOutline(): void {
  const outlineContent = document.getElementById('outline-content')
  if (!outlineContent || !cmEditor) return

  const content = getEditorContent(cmEditor)
  const lines = content.split('\n')
  const headings: Array<{ level: number; text: string; line: number }> = []

  let inCodeBlock = false

  lines.forEach((line, index) => {
    // Track code blocks
    if (line.trim().startsWith('```') || line.trim().startsWith('~~~')) {
      inCodeBlock = !inCodeBlock
      return
    }

    // Skip lines inside code blocks
    if (inCodeBlock) return

    // Check for markdown headings
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: index,
      })
    }
  })

  if (headings.length === 0) {
    outlineContent.innerHTML = '<div class="outline-empty">No headings found</div>'
    return
  }

  const getHeadingIcon = (level: number): string => {
    const icons: Record<number, string> = { 1: 'H1', 2: 'H2', 3: 'H3', 4: 'H4', 5: 'H5', 6: 'H6' }
    return icons[level] || 'H'
  }

  // Build HTML
  outlineContent.innerHTML = headings
    .map(heading => {
      return `
        <div class="outline-item outline-level-${heading.level}" data-line="${heading.line}">
          <span class="outline-icon">${getHeadingIcon(heading.level)}</span>
          <span class="outline-text">${escapeHtml(heading.text)}</span>
        </div>
      `
    })
    .join('')

  // Add click handlers
  outlineContent.querySelectorAll('.outline-item').forEach(item => {
    item.addEventListener('click', () => {
      // Remove active from all
      outlineContent.querySelectorAll('.outline-item').forEach(el => el.classList.remove('active'))
      // Add active to clicked
      item.classList.add('active')

      const line = parseInt((item as HTMLElement).dataset.line || '0')
      if (cmEditor) {
        const pos = cmEditor.state.doc.line(line + 1).from
        cmEditor.dispatch({
          selection: { anchor: pos },
          scrollIntoView: true,
        })
        cmEditor.focus()
      }
    })
  })
}

function setupOutline(): void {
  // Outline tabs switching
  document.querySelectorAll('.outline-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const view = (tab as HTMLElement).dataset.view
      if (!view) return

      // Update tab active state
      document.querySelectorAll('.outline-tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')

      // Show corresponding view
      document.querySelectorAll('.outline-view').forEach(v => v.classList.remove('active'))
      document.getElementById(`${view}-view`)?.classList.add('active')

      // Load Graph when switching to graph view
      if (view === 'graph' && state.currentFolder) {
        loadGitGraph()
      }

      // Load Branches when switching to branches view
      if (view === 'branches' && state.currentFolder) {
        loadBranches()
      }
    })
  })
}

async function loadBranches(): Promise<void> {
  const content = document.getElementById('branches-content')
  if (!content || !state.currentFolder) {
    if (content)
      content.innerHTML = '<div class="section-empty">Open a folder to see branches</div>'
    return
  }

  content.innerHTML = '<div class="section-empty">Loading branches...</div>'

  try {
    const result = await window.electronAPI?.gitBranchList(state.currentFolder)
    const branchResult = await window.electronAPI?.gitBranch(state.currentFolder)
    const currentBranch = branchResult?.branch || ''

    if (result?.success && result.branches) {
      // Filter only local branches (remove remotes/origin/...)
      const localBranches = result.branches.filter(b => !b.startsWith('remotes/'))

      content.innerHTML = localBranches
        .map(
          branch => `
        <div class="branch-item ${branch === currentBranch ? 'active' : ''}" data-branch="${branch}">
          <span class="branch-icon">${branch === currentBranch ? '✓' : '○'}</span>
          <span class="branch-name">${branch}</span>
        </div>
      `
        )
        .join('')

      content.querySelectorAll('.branch-item').forEach(item => {
        item.addEventListener('click', async () => {
          const branchName = (item as HTMLElement).dataset.branch
          if (branchName && branchName !== currentBranch) {
            const checkoutResult = await window.electronAPI?.gitCheckout(
              state.currentFolder!,
              branchName
            )
            if (checkoutResult?.success) {
              showNotify(`Switched to branch "${branchName}"`, 'success')
              updateGitStatus(state.currentFolder!)
              loadBranches()

              // Reload current file if open
              if (state.currentFile) {
                const fileResult = await window.electronAPI?.readFile(state.currentFile)
                if (fileResult?.success && fileResult.content !== undefined && cmEditor) {
                  setEditorContent(cmEditor, fileResult.content)
                }
              }
            } else {
              showNotify(checkoutResult?.error || 'Failed to switch branch', 'error')
            }
          }
        })
      })
    } else {
      content.innerHTML = `<div class="section-empty">${result?.error || 'No branches found'}</div>`
    }
  } catch (error) {
    content.innerHTML = '<div class="section-empty">Failed to load branches</div>'
  }
}

async function loadGitGraph(): Promise<void> {
  const content = document.getElementById('git-graph-content')
  if (!content || !state.currentFolder) {
    if (content) content.innerHTML = '<div class="section-empty">Open a folder to see graph</div>'
    return
  }

  content.innerHTML = '<div class="section-empty">Loading graph...</div>'

  try {
    const result = await window.electronAPI?.gitGraph(state.currentFolder, 30)
    if (result?.success && result.graph && result.graph.length > 0) {
      content.innerHTML = `
        <div class="git-graph">
          ${result.graph
            .map(
              commit => `
            <div class="git-graph-commit" style="margin-left: ${commit.column * 20}px">
              <div class="git-graph-line"></div>
              <div class="git-graph-node ${commit.refs.length > 0 ? 'has-refs' : ''}"></div>
              <div class="git-graph-info">
                <div class="git-graph-row">
                  <span class="git-graph-hash">${commit.hash}</span>
                  ${commit.refs.map(ref => `<span class="git-graph-ref">${ref}</span>`).join('')}
                </div>
                <div class="git-graph-message">${escapeHtml(commit.message)}</div>
                <div class="git-graph-meta">${commit.author} - ${new Date(commit.date).toLocaleDateString()}</div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `

      // Add click handlers
      content.querySelectorAll('.git-graph-commit').forEach(item => {
        item.addEventListener('click', async () => {
          const hash = item.querySelector('.git-graph-hash')?.textContent
          if (hash) {
            await showCommitDetails(hash)
          }
        })
      })
    } else {
      content.innerHTML = `<div class="section-empty">${result?.error || 'No commits found'}</div>`
    }
  } catch (error) {
    content.innerHTML = '<div class="section-empty">Failed to load graph</div>'
  }
}

async function showCommitDetails(hash: string): Promise<void> {
  if (!state.currentFolder) return

  try {
    const result = await window.electronAPI?.gitShow(state.currentFolder, hash)
    if (result?.success && result.commit) {
      const commit = result.commit
      showNotify(
        `${commit.shortHash} - ${commit.author}: ${commit.message.substring(0, 50)}...`,
        'info'
      )
    }
  } catch (error) {
    showNotify('Failed to load commit details', 'error')
  }
}

// Git Workflow Functions

async function cloneRepository(): Promise<void> {
  const repoUrl = await showModal(
    'Clone Repository',
    'Enter repository URL (e.g., https://github.com/user/repo.git)',
    'text'
  )
  if (!repoUrl) return

  const targetDir = state.currentFolder || '.'

  showNotify('Cloning repository...', 'info')

  try {
    const result = await window.electronAPI?.executeCommand(targetDir, `git clone ${repoUrl}`)

    if (result?.success) {
      showNotify('Repository cloned successfully!', 'success')
      if (state.currentFolder) {
        loadFileTree(state.currentFolder)
      }
    } else {
      showNotify(result?.error || 'Failed to clone repository', 'error')
    }
  } catch (error) {
    showNotify('Error cloning repository', 'error')
  }
}

async function createNewBranch(): Promise<void> {
  if (!state.currentFolder) {
    showNotify('Please open a folder first', 'error')
    return
  }

  const branchName = await showModal('Create New Branch', 'Enter branch name', 'branch')
  if (!branchName) return

  try {
    const result = await window.electronAPI?.gitCreateBranch(state.currentFolder, branchName)
    if (result?.success) {
      showNotify(`Branch "${branchName}" created and checked out`, 'success')
      updateGitStatus(state.currentFolder)
    } else {
      showNotify(result?.error || 'Failed to create branch', 'error')
    }
  } catch (error) {
    showNotify('Error creating branch', 'error')
  }
}

async function showCommitModal(): Promise<void> {
  if (!state.currentFolder) {
    showNotify('Please open a folder first', 'error')
    return
  }

  const message = await showModal('Commit Changes', 'Enter commit message', 'commit')
  if (!message) return

  try {
    // First stage all changes
    const addResult = await window.electronAPI?.gitAdd(state.currentFolder, '.')
    if (!addResult?.success) {
      showNotify(addResult?.error || 'Failed to stage changes', 'error')
      return
    }

    // Then commit
    const result = await window.electronAPI?.gitCommit(state.currentFolder, message)
    if (result?.success) {
      showNotify('Changes committed successfully', 'success')
      updateGitStatus(state.currentFolder)
    } else {
      showNotify(result?.error || 'Failed to commit', 'error')
    }
  } catch (error) {
    showNotify('Error committing changes', 'error')
  }
}

async function _mergeToDevelop(): Promise<void> {
  if (!state.currentFolder) {
    showNotify('Please open a folder first', 'error')
    return
  }

  try {
    // Get current branch
    const branchResult = await window.electronAPI?.gitBranch(state.currentFolder)
    if (!branchResult?.success || !branchResult.branch) {
      showNotify('Failed to get current branch', 'error')
      return
    }

    const currentBranch = branchResult.branch

    if (currentBranch === 'develop') {
      showNotify('Already on develop branch', 'error')
      return
    }

    const confirmed = confirm(`Merge branch "${currentBranch}" into "develop"?`)
    if (!confirmed) return

    // Checkout develop
    const checkoutResult = await window.electronAPI?.gitCheckout(state.currentFolder, 'develop')
    if (!checkoutResult?.success) {
      // Try to create develop if it doesn't exist
      const createResult = await window.electronAPI?.gitCreateBranch(state.currentFolder, 'develop')
      if (!createResult?.success) {
        showNotify(checkoutResult?.error || 'Failed to checkout develop', 'error')
        return
      }
    }

    // Merge current branch
    const mergeResult = await window.electronAPI?.gitMerge(state.currentFolder, currentBranch)
    if (mergeResult?.success) {
      showNotify(`Successfully merged "${currentBranch}" into "develop"`, 'success')
      updateGitStatus(state.currentFolder)
    } else {
      showNotify(mergeResult?.error || 'Merge failed', 'error')
    }
  } catch (error) {
    showNotify('Error during merge', 'error')
  }
}

async function _gitFetch(): Promise<void> {
  if (!state.currentFolder) {
    showNotify('Please open a folder first', 'error')
    return
  }
  try {
    const result = await window.electronAPI?.executeCommand(state.currentFolder, 'git fetch --all')
    if (result?.success) {
      showNotify('Fetch completed successfully', 'success')
    } else {
      showNotify(result?.error || 'Fetch failed', 'error')
    }
  } catch (error) {
    showNotify('Error during fetch', 'error')
  }
}

async function _gitStash(): Promise<void> {
  if (!state.currentFolder) {
    showNotify('Please open a folder first', 'error')
    return
  }
  try {
    const result = await window.electronAPI?.executeCommand(state.currentFolder, 'git stash')
    if (result?.success) {
      showNotify('Changes stashed', 'success')
      updateGitStatus(state.currentFolder)
    } else {
      showNotify(result?.error || 'Stash failed', 'error')
    }
  } catch (error) {
    showNotify('Error during stash', 'error')
  }
}

async function _gitStashPop(): Promise<void> {
  if (!state.currentFolder) {
    showNotify('Please open a folder first', 'error')
    return
  }
  try {
    const result = await window.electronAPI?.executeCommand(state.currentFolder, 'git stash pop')
    if (result?.success) {
      showNotify('Stash applied', 'success')
      updateGitStatus(state.currentFolder)
    } else {
      showNotify(result?.error || 'Stash pop failed', 'error')
    }
  } catch (error) {
    showNotify('Error during stash pop', 'error')
  }
}

async function _gitDiscard(): Promise<void> {
  if (!state.currentFolder) {
    showNotify('Please open a folder first', 'error')
    return
  }
  if (!state.currentFile) {
    showNotify('No file selected', 'error')
    return
  }
  const confirmed = confirm('Discard changes to current file?')
  if (!confirmed) return
  try {
    const result = await window.electronAPI?.executeCommand(
      state.currentFolder,
      `git checkout -- "${state.currentFile}"`
    )
    if (result?.success) {
      showNotify('Changes discarded', 'success')
      // Reload current file
      const fileResult = await window.electronAPI?.readFile(state.currentFile)
      if (fileResult?.success && fileResult.content !== undefined && cmEditor) {
        setEditorContent(cmEditor, fileResult.content)
      }
    } else {
      showNotify(result?.error || 'Discard failed', 'error')
    }
  } catch (error) {
    showNotify('Error discarding changes', 'error')
  }
}
