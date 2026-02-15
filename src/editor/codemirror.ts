import { EditorView, keymap as cmKeymap, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'

// Type for the onChange callback
export type EditorChangeCallback = (content: string) => void

// Custom theme extension for dark mode matching our app
const customTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      fontSize: '14px',
      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Fira Code', monospace",
    },
    '.cm-content': {
      caretColor: 'var(--accent)',
      padding: '20px',
      lineHeight: '1.6',
    },
    '.cm-line': {
      padding: '0 4px',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--accent)',
      borderLeftWidth: '2px',
    },
    '.cm-cursor-primary': {
      height: '1.2em !important',
      minHeight: '1.2em !important',
      maxHeight: '1.2em !important',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'rgba(108, 99, 255, 0.3)',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255, 255, 255, 0.03)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--bg-secondary)',
      border: 'none',
      borderRight: '1px solid var(--border-color)',
    },
    '.cm-lineNumbers': {
      color: 'var(--text-secondary)',
    },
    // Markdown syntax highlighting
    '.cm-heading': {
      color: 'var(--accent)',
      fontWeight: 'bold',
    },
    '.cm-strong': {
      fontWeight: 'bold',
      color: '#ff79c6',
    },
    '.cm-emphasis': {
      fontStyle: 'italic',
      color: '#ffb86c',
    },
    '.cm-link': {
      color: '#8be9fd',
      textDecoration: 'underline',
    },
    '.cm-url': {
      color: '#6272a4',
    },
    '.cm-code': {
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      padding: '2px 4px',
      borderRadius: '3px',
      fontFamily: "'SF Mono', Monaco, monospace",
    },
    '.cm-blockquote': {
      color: 'var(--text-secondary)',
      borderLeft: '3px solid var(--accent)',
      paddingLeft: '12px',
    },
    '.cm-list': {
      color: 'var(--text-primary)',
    },
    // Scrollbar styling
    '&.cm-editor ::-webkit-scrollbar': {
      width: '8px',
    },
    '&.cm-editor ::-webkit-scrollbar-track': {
      background: 'transparent',
    },
    '&.cm-editor ::-webkit-scrollbar-thumb': {
      background: 'rgba(255, 255, 255, 0.2)',
      borderRadius: '4px',
    },
    '&.cm-editor ::-webkit-scrollbar-thumb:hover': {
      background: 'rgba(255, 255, 255, 0.3)',
    },
  },
  { dark: true }
)

/**
 * Creates a CodeMirror editor instance
 * @param parent - HTML element to attach editor
 * @param initialContent - Initial content to display
 * @param onChange - Callback when content changes
 */
export function createCodeMirrorEditor(
  parent: HTMLElement,
  initialContent: string = '',
  onChange?: EditorChangeCallback
): EditorView {
  const updateListener = ViewPlugin.fromClass(
    class {
      update(update: ViewUpdate) {
        if (update.docChanged && onChange) {
          onChange(update.state.doc.toString())
        }
      }
    }
  )

  const view = new EditorView({
    state: EditorState.create({
      doc: initialContent || '\n',
      extensions: [
        // Basic setup
        history(),
        cmKeymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),

        // Language support
        markdown(),

        // Search
        highlightSelectionMatches(),

        // Theme
        oneDark,
        customTheme,

        // Update listener
        updateListener,

        // Line wrapping
        EditorView.lineWrapping,
      ],
    }),
    parent,
  })

  return view
}

/**
 * Gets the current content from the editor
 */
export function getEditorContent(view: EditorView): string {
  return view.state.doc.toString()
}

/**
 * Sets the content of the editor
 */
export function setEditorContent(view: EditorView, content: string): void {
  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: content,
    },
  })
}

/**
 * Gets the current cursor position
 */
export function getCursorPosition(view: EditorView): { line: number; column: number } {
  const pos = view.state.selection.main.head
  const line = view.state.doc.lineAt(pos)
  return {
    line: line.number,
    column: pos - line.from + 1,
  }
}

/**
 * Focuses the editor
 */
export function focusEditor(view: EditorView): void {
  view.focus()
}
