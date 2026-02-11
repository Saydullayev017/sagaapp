import {
  EditorView,
  keymap,
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  placeholder,
} from '@codemirror/view'
import { EditorState, StateEffect, StateField } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { syntaxTree } from '@codemirror/language'

// Type for the onChange callback
export type EditorChangeCallback = (content: string) => void

// State field for hidden syntax ranges
const hiddenRangesState = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(decorations, tr) {
    // Map decorations through changes
    decorations = decorations.map(tr.changes)

    // Check if we need to update hidden ranges
    for (const effect of tr.effects) {
      if (effect.is(toggleHideEffect)) {
        const { from, to, hide } = effect.value
        if (hide) {
          const mark = Decoration.mark({
            class: 'cm-hidden-markdown',
            inclusive: false,
          })
          decorations = decorations.update({
            add: [mark.range(from, to)],
          })
        } else {
          decorations = decorations.update({
            filter: (f, t) => !(f === from && t === to),
          })
        }
      } else if (effect.is(clearHiddenEffect)) {
        decorations = Decoration.none
      }
    }

    return decorations
  },
  provide: f => EditorView.decorations.from(f),
})

// Effects for showing/hiding markdown
const toggleHideEffect = StateEffect.define<{
  from: number
  to: number
  hide: boolean
}>()

const clearHiddenEffect = StateEffect.define<void>()

// Plugin to handle Enter key and hide markdown syntax
class MarkdownHidingPlugin {
  private hideCompletedMarkdownSyntax(view: EditorView) {
    const tree = syntaxTree(view.state)
    const hiddenRanges: { from: number; to: number }[] = []

    // Walk through syntax tree to find markdown markers
    tree.iterate({
      enter: node => {
        const type = node.type
        const from = node.from
        const to = node.to

        // Hide heading markers (###)
        if (type.name === 'HeaderMark') {
          hiddenRanges.push({ from, to })
        }

        // Hide emphasis markers (** or *)
        if (type.name === 'EmphasisMark') {
          hiddenRanges.push({ from, to })
        }

        // Hide code block markers (```)
        if (type.name === 'CodeMark') {
          hiddenRanges.push({ from, to })
        }

        // Hide link brackets and parens
        if (type.name === 'LinkMark' || type.name === 'URLMark') {
          hiddenRanges.push({ from, to })
        }

        // Hide list markers (-, *, +)
        if (type.name === 'ListMark') {
          hiddenRanges.push({ from, to })
        }

        // Hide quote markers (>)
        if (type.name === 'QuoteMark') {
          hiddenRanges.push({ from, to })
        }
      },
    })

    // Apply hidden ranges
    if (hiddenRanges.length > 0) {
      view.dispatch({
        effects: hiddenRanges.map(range => toggleHideEffect.of({ ...range, hide: true })),
      })
    }
  }
}

const markdownHidingPlugin = ViewPlugin.fromClass(
  class {
    private hidingPlugin: MarkdownHidingPlugin

    constructor() {
      this.hidingPlugin = new MarkdownHidingPlugin()
    }

    update(update: ViewUpdate) {
      // Check for Enter key presses
      if (update.transactions.some(tr => tr.isUserEvent('input.type'))) {
        // Process after a short delay to allow syntax tree to update
        setTimeout(() => {
          this.hidingPlugin['hideCompletedMarkdownSyntax'](update.view)
        }, 50)
      }
    }
  }
)

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
    // Hidden markdown styling
    '.cm-hidden-markdown': {
      opacity: '0.3',
      color: 'var(--text-secondary)',
      fontSize: '0.85em',
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

// Key handler for Enter key to trigger hiding
const enterKeyHandler = keymap.of([
  {
    key: 'Enter',
    run: view => {
      // Insert newline
      view.dispatch({
        changes: { from: view.state.selection.main.from, insert: '\n' },
      })

      // Trigger hiding after a short delay
      setTimeout(() => {
        const plugin = view.plugin(markdownHidingPlugin)
        if (plugin) {
          // Force update to trigger hiding
          view.dispatch({})
        }
      }, 50)

      return true
    },
  },
])

// Store reference to the plugin instance
let currentHidingPlugin: MarkdownHidingPlugin | null = null

// Export function to create editor
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

  currentHidingPlugin = new MarkdownHidingPlugin()

  const view = new EditorView({
    state: EditorState.create({
      doc: initialContent,
      extensions: [
        // Basic setup
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        enterKeyHandler,

        // Language support
        markdown(),

        // Hiding plugin
        hiddenRangesState,
        markdownHidingPlugin,

        // Theme
        oneDark,
        customTheme,

        // Update listener
        updateListener,

        // Line wrapping
        EditorView.lineWrapping,

        // Placeholder
        placeholder('# Start writing markdown here...\n\nPress Enter to hide markdown syntax'),
      ],
    }),
    parent,
  })

  return view
}

// Export function to get editor content
export function getEditorContent(view: EditorView): string {
  return view.state.doc.toString()
}

// Export function to set editor content
export function setEditorContent(view: EditorView, content: string): void {
  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: content,
    },
  })
}

// Export function to clear hidden markdown (show all syntax)
export function clearHiddenMarkdown(view: EditorView): void {
  view.dispatch({
    effects: clearHiddenEffect.of(),
  })
}

// Export function to hide all markdown syntax
export function hideAllMarkdownSyntax(view: EditorView): void {
  if (currentHidingPlugin) {
    currentHidingPlugin['hideCompletedMarkdownSyntax'](view)
  }
}

// Export function to get cursor position
export function getCursorPosition(view: EditorView): { line: number; column: number } {
  const pos = view.state.selection.main.head
  const line = view.state.doc.lineAt(pos)
  return {
    line: line.number,
    column: pos - line.from + 1,
  }
}

// Export function to focus editor
export function focusEditor(view: EditorView): void {
  view.focus()
}
