import {
  EditorView,
  keymap as cmKeymap,
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
} from '@codemirror/view'
import { EditorState, StateField, StateEffect, RangeSetBuilder } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { indentOnInput, bracketMatching } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { autocompletion, completionKeymap } from '@codemirror/autocomplete'

// Type for the onChange callback
export type EditorChangeCallback = (content: string) => void

// Effect to toggle markdown hidden mode
const setMarkdownHidden = StateEffect.define<boolean>()

// State field to track hidden mode
const markdownHiddenField = StateField.define<boolean>({
  create() {
    return false
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setMarkdownHidden)) value = e.value
    }
    return value
  },
})

// Create decoration for hidden markdown
const hiddenDecoration = Decoration.mark({ class: 'cm-md-hidden' })

// Markdown patterns to hide
const markdownPatterns = [
  /^(#{1,6})\s+/gm,
  /(\*\*|__)(?=[^*])/g,
  /(?<!\*)\*(?!\*)/g,
  /(?<!_)_(?!_)/g,
  /`/g,
  /```[\s\S]*?```/g,
  /\[/g,
  /\]\([^)]+\)/g,
  /^>\s+/gm,
  /^[-*_]{3,}\s*$/gm,
  /^[\-\*\+]\s+/gm,
  /^\d+\.\s+/gm,
]

// Plugin to hide markdown syntax
const markdownHiderPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = this.hideMarkdown(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.hideMarkdown(update.view)
      }
    }

    hideMarkdown(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>()
      const doc = view.state.doc.toString()
      if (!doc) return builder.finish()

      const { from, to } = view.viewport
      const visibleText = doc.slice(from, to)

      for (const pattern of markdownPatterns) {
        let match
        const regex = new RegExp(pattern.source, pattern.flags)
        while ((match = regex.exec(visibleText)) !== null) {
          const start = from + match.index
          const end = start + match[0].length
          if (start < to && end > from) {
            builder.add(start, end, hiddenDecoration)
          }
        }
      }
      return builder.finish()
    }
  },
  {
    decorations: v => v.decorations,
  }
)

// Theme extension for hidden markdown
const markdownHiddenTheme = EditorView.theme({
  '.cm-md-hidden': {
    color: 'transparent !important',
    caretColor: 'var(--text-primary)',
  },
  '.cm-md-hidden::selection, .cm-content .cm-md-hidden::selection': {
    backgroundColor: 'rgba(108, 99, 255, 0.3) !important',
    color: 'transparent !important',
  },
})

/**
 * Toggle markdown hidden mode
 */
export function toggleMarkdownHidden(view: EditorView): void {
  const current = view.state.field(markdownHiddenField, false)
  view.dispatch({
    effects: setMarkdownHidden.of(!current),
  })
}

/**
 * Check if markdown hidden mode is active
 */
export function isMarkdownHidden(view: EditorView): boolean {
  return view.state.field(markdownHiddenField, false) ?? false
}

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
    '.cm-header-1, .cm-header-2, .cm-header-3, .cm-header-4, .cm-header-5, .cm-header-6': {
      color: 'var(--accent)',
      fontWeight: 'bold',
    },
    '.cm-header-1': { fontSize: '1.6em' },
    '.cm-header-2': { fontSize: '1.4em' },
    '.cm-header-3': { fontSize: '1.2em' },
    '.cm-formatting': {
      color: 'var(--accent)',
    },
    '.cm-formatting-strong': {
      color: '#ff7b72',
      fontWeight: 'bold',
    },
    '.cm-formatting-emphasis': {
      color: '#d2a8ff',
      fontStyle: 'italic',
    },
    '.cm-formatting-code': {
      color: '#79c0ff',
    },
    '.cm-formatting-link': {
      color: '#7ee787',
    },
    '.cm-formatting-quote': {
      color: 'var(--text-secondary)',
      fontStyle: 'italic',
    },
    '.cm-strikethrough': {
      textDecoration: 'line-through',
      color: 'var(--text-secondary)',
    },
    // Code fence markers styling
    '.cm-meta': {
      color: '#79c0ff',
      backgroundColor: 'rgba(121, 192, 255, 0.1)',
      borderRadius: '4px',
      padding: '2px 6px',
    },
    '.cm-fencedChar': {
      color: '#79c0ff',
      backgroundColor: 'rgba(121, 192, 255, 0.15)',
      borderRadius: '4px',
      padding: '2px 8px',
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
        cmKeymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...completionKeymap]),

        // Language support with syntax highlighting
        markdown({ base: markdownLanguage, codeLanguages: languages }),

        // Autocompletion - markdown snippets
        autocompletion({
          override: [
            context => {
              const word = context.matchBefore(/[#*`\[\]!>\-~r]/)
              if (!word) return null
              return {
                from: word.from,
                options: [
                  { label: '#', apply: '# ', detail: 'Heading 1' },
                  { label: '##', apply: '## ', detail: 'Heading 2' },
                  { label: '###', apply: '### ', detail: 'Heading 3' },
                  { label: '####', apply: '#### ', detail: 'Heading 4' },
                  { label: '#####', apply: '##### ', detail: 'Heading 5' },
                  { label: '######', apply: '###### ', detail: 'Heading 6' },
                  { label: '**bold**', apply: '****', detail: 'Bold text', insert: '****' },
                  { label: '*italic*', apply: '**', detail: 'Italic text', insert: '**' },
                  {
                    label: '***bold italic***',
                    apply: '*****',
                    detail: 'Bold + Italic',
                    insert: '*****',
                  },
                  { label: '`code`', apply: '``', detail: 'Inline code' },
                  { label: '```', apply: '```\n \n```', detail: 'Code block' },
                  // Supported languages with run only
                  {
                    label: '```python run',
                    apply: '```python run\n \n```',
                    detail: 'Python (runnable)',
                  },
                  {
                    label: '```javascript run',
                    apply: '```javascript run\n \n```',
                    detail: 'JavaScript (runnable)',
                  },
                  {
                    label: '```ruby run',
                    apply: '```ruby run\n \n```',
                    detail: 'Ruby (runnable)',
                  },
                  { label: '```php run', apply: '```php run\n \n```', detail: 'PHP (runnable)' },
                  {
                    label: '```perl run',
                    apply: '```perl run\n \n```',
                    detail: 'Perl (runnable)',
                  },
                ],
              }
            },
          ],
        }),

        // Search
        highlightSelectionMatches(),

        // Auto-indentation and bracket matching
        indentOnInput(),
        bracketMatching(),

        // Theme
        oneDark,
        customTheme,
        markdownHiddenTheme,
        markdownHiddenField,
        markdownHiderPlugin,

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
