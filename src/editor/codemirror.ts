import { autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { indentOnInput, bracketMatching } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { EditorState, StateField, StateEffect, RangeSetBuilder } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import {
  EditorView,
  keymap as cmKeymap,
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  highlightActiveLine,
  highlightActiveLineGutter,
} from '@codemirror/view'

// Type for the onChange callback
export type EditorChangeCallback = (content: string) => void

// Effect to toggle auto-hide enabled
const setAutoHideEnabled = StateEffect.define<boolean>()

// State field for auto-hide enabled
const autoHideEnabledField = StateField.define<boolean>({
  create() {
    return true
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setAutoHideEnabled)) {
        value = e.value
      }
    }
    return value
  },
})

// Markdown patterns to detect and hide (at line start)
const lineStartPatterns = [
  /^(#{1,6})\s+/,
  /^(\*\*\*|___)\s+/,
  /^(\*\*|__)\s+/,
  /^(\*|_)\s+/,
  /^`{3,}\S*/,
  /^```\s*$/,
  /^>\s+/,
  /^[-*_]{3,}\s*$/,
  /^[\-\*\+]\s+/,
  /^\d+\.\s+/,
]

// Inline markdown patterns to hide
const inlinePatterns = [
  /(\*\*\*)(\s*)(?=\S)/g, // ***bold italic***
  /(___)(\s*)(?=\S)/g, // ___bold italic___
  /(\*\*)(\s*)(?=\S)/g, // **bold**
  /(__)(\s*)(?=\S)/g, // __bold__
  /(\*)(\s*)(?=\S)/g, // *italic*
  /(_)(\s*)(?=\S)/g, // _italic_
  /(`)(\s*)(?=\S)/g, // `inline code`
  /(~~)(\s*)(?=\S)/g, // ~~strikethrough~~
]

// Helper: get line info for markdown
function getLineMarkdownRanges(lineText: string): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = []

  // Check line start patterns
  for (const pattern of lineStartPatterns) {
    const match = pattern.exec(lineText)
    if (match && match.index === 0 && match[0].length > 0) {
      ranges.push({
        from: match.index,
        to: match.index + match[0].length,
      })
      break
    }
  }

  return ranges
}

// ViewPlugin for markdown auto-hide
const markdownAutoHidePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view)
    }

    update(update: ViewUpdate) {
      const autoHideEnabled = update.state.field(autoHideEnabledField) ?? true

      if (!autoHideEnabled) {
        this.decorations = Decoration.none
        return
      }

      if (update.docChanged) {
        this.decorations = this.buildDecorations(update.view)
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>()
      const doc = view.state.doc
      let count = 0

      for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i)
        const ranges = getLineMarkdownRanges(line.text)

        for (const range of ranges) {
          const _from = line.from + range.from
          const _to = line.from + range.to
          builder.add(_from, _to, Decoration.mark({ class: 'cm-md-hidden' }))
          count++
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
    color: 'rgba(108, 99, 255, 0.35) !important',
    backgroundColor: 'transparent !important',
    textShadow: 'none !important',
    fontStyle: 'normal !important',
    fontWeight: 'normal !important',
    textDecoration: 'none !important',
  },
  '.cm-md-hidden > span': {
    color: 'rgba(108, 99, 255, 0.35) !important',
  },
  '.cm-md-hidden .cm-formatting': {
    color: 'rgba(108, 99, 255, 0.35) !important',
    opacity: '0.35 !important',
  },
})

/**
 * Toggle markdown auto-hide mode
 */
export function toggleMarkdownHidden(view: EditorView): void {
  const current = view.state.field(autoHideEnabledField, false) ?? true
  view.dispatch({
    effects: setAutoHideEnabled.of(!current),
  })
}

/**
 * Check if markdown auto-hide mode is active
 */
export function isMarkdownHidden(view: EditorView): boolean {
  return view.state.field(autoHideEnabledField, false) ?? true
}

/**
 * Clear all hidden markdown ranges (rebuilds decorations)
 */
export function clearHiddenMarkdown(view: EditorView): void {
  // The plugin will rebuild decorations on next update
  view.dispatch({
    changes: { from: 0, to: 0, insert: '' },
  })
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
      backgroundColor: 'rgba(108, 99, 255, 0.08)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(108, 99, 255, 0.1)',
      color: 'var(--accent)',
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
          defaultKeymap: true,
          override: [
            context => {
              const word = context.matchBefore(/[#*`\[\]!>\-~r]/)
              if (!word) return null
              const options = [
                { label: '#', apply: '# ', detail: 'Heading 1' },
                { label: '##', apply: '## ', detail: 'Heading 2' },
                { label: '###', apply: '### ', detail: 'Heading 3' },
                { label: '####', apply: '#### ', detail: 'Heading 4' },
                { label: '#####', apply: '##### ', detail: 'Heading 5' },
                { label: '######', apply: '###### ', detail: 'Heading 6' },
                { label: '**bold**', apply: '****', detail: 'Bold text' },
                { label: '*italic*', apply: '**', detail: 'Italic text' },
                { label: '`code`', apply: '``', detail: 'Inline code' },
                { label: '```', insert: '```\n\n```', detail: 'Code block' },
                { label: '```python run', insert: '```python run\n\n```', detail: 'Python' },
                {
                  label: '```javascript run',
                  insert: '```javascript run\n\n```',
                  detail: 'JavaScript',
                },
                { label: '```ruby run', insert: '```ruby run\n\n```', detail: 'Ruby' },
                { label: '```php run', insert: '```php run\n\n```', detail: 'PHP' },
                { label: '```perl run', insert: '```perl run\n\n```', detail: 'Perl' },
                { label: '```bash run', insert: '```bash run\n\n```', detail: 'Bash' },
                { label: '```java run', insert: '```java run\n\n```', detail: 'Java' },
              ]
              return {
                from: word.from,
                to: word.to,
                options,
                validFor: /^[#*`\[\]!>\-~r]*$/,
              }
            },
          ],
        }),

        // Search
        highlightSelectionMatches(),

        // Active line highlight
        highlightActiveLine(),
        highlightActiveLineGutter(),

        // Auto-indentation and bracket matching
        indentOnInput(),
        bracketMatching(),

        // Theme
        oneDark,
        customTheme,
        markdownHiddenTheme,
        autoHideEnabledField,
        markdownAutoHidePlugin,

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
