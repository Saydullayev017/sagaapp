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
            <aside class="sidebar" id="sidebar">
                <div class="sidebar-header">
                    <h3>Files</h3>
                    <button class="icon-button" id="refresh-files">⟳</button>
                </div>
                <div class="file-tree" id="file-tree">
                    <div class="empty-state">No folder opened</div>
                </div>
            </aside>
            
            <main class="editor-container">
                <div class="editor-toolbar">
                    <div class="toolbar-left">
                        <button class="toolbar-btn" id="save-btn">💾 Save</button>
                        <button class="toolbar-btn" id="format-btn">✨ Format</button>
                    </div>
                    <div class="toolbar-right">
                        <button class="toolbar-btn" id="preview-toggle">👁️ Preview</button>
                    </div>
                </div>
                
                <div class="split-container">
                    <div class="editor-pane">
                        <textarea class="markdown-editor" id="editor" placeholder="# Start writing markdown here..."></textarea>
                    </div>
                    <div class="preview-pane" id="preview">
                        <div class="preview-content"></div>
                    </div>
                </div>
            </main>
            
            <footer class="status-bar">
                <span class="status-item" id="status-line">Line: 1, Col: 1</span>
                <span class="status-item" id="status-file">No file opened</span>
                <span class="status-item" id="status-git">Git: Not initialized</span>
            </footer>
        </div>
    `

  // Добавляем обработчики событий
  setupEventListeners()
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
    // Здесь будет логика сохранения
  })

  // Переключение превью
  document.getElementById('preview-toggle')?.addEventListener('click', () => {
    const preview = document.getElementById('preview')
    if (preview) {
      preview.classList.toggle('hidden')
    }
  })

  // Обновление файлов
  document.getElementById('refresh-files')?.addEventListener('click', () => {
    console.log('Refresh files clicked')
    // Здесь будет логика обновления файлового дерева
  })
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
