import { autocompletion, completionKeymap, Completion } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
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

// Code block detection and highlighting
const codeBlockStartPattern = /^```(\w*)/

// Helper: Check if line is a code fence start
function _isCodeBlockStart(lineText: string): boolean {
  return codeBlockStartPattern.test(lineText.trim())
}

// Helper: get language from fence start
function getCodeBlockLanguage(lineText: string): string {
  const match = lineText.trim().match(/^```(\w*)/)
  return match ? match[1] : ''
}

// Helper: Find current code block language
function findCurrentCodeBlockLanguage(doc: any, pos: number): string {
  const totalLines = doc.lines
  let currentLanguage = ''

  for (let i = 1; i <= totalLines; i++) {
    const line = doc.line(i)
    if (line.from > pos) break

    const trimmed = line.text.trim()
    if (trimmed.startsWith('```') && !trimmed.endsWith('```')) {
      const lang = getCodeBlockLanguage(trimmed)
      if (lang) {
        currentLanguage = lang
      }
    }
    if (trimmed === '```') {
      currentLanguage = ''
    }
  }

  return currentLanguage
}

// Code completions for different languages (plain text without placeholders)
const javascriptCompletions = [
  {
    label: 'function',
    apply: 'function name() {\n\n}',
    detail: 'Function declaration',
    type: 'keyword',
  },
  { label: 'const', apply: 'const name = ', detail: 'Constant declaration', type: 'keyword' },
  { label: 'let', apply: 'let name = ', detail: 'Variable declaration', type: 'keyword' },
  { label: 'if', apply: 'if (condition) {\n\n}', detail: 'If statement', type: 'keyword' },
  {
    label: 'for',
    apply: 'for (let i = 0; i < length; i++) {\n\n}',
    detail: 'For loop',
    type: 'keyword',
  },
  { label: 'while', apply: 'while (condition) {\n\n}', detail: 'While loop', type: 'keyword' },
  {
    label: 'class',
    apply: 'class ClassName {\n  constructor() {\n  \n  }\n}',
    detail: 'Class declaration',
    type: 'keyword',
  },
  { label: 'arrow', apply: '() => {\n\n}', detail: 'Arrow function', type: 'function' },
  { label: 'console.log', apply: 'console.log()', detail: 'Log to console', type: 'function' },
  { label: 'return', apply: 'return ', detail: 'Return statement', type: 'keyword' },
  {
    label: 'async',
    apply: 'async function name() {\n\n}',
    detail: 'Async function',
    type: 'keyword',
  },
  {
    label: 'try',
    apply: 'try {\n\n} catch (error) {\nconsole.error(error)\n}',
    detail: 'Try-catch block',
    type: 'keyword',
  },
  {
    label: 'import',
    apply: "import module from 'module'",
    detail: 'Import statement',
    type: 'keyword',
  },
  { label: 'export', apply: 'export default ', detail: 'Export statement', type: 'keyword' },
  {
    label: 'switch',
    apply: 'switch (value) {\n  case :\n    break;\n  default:\n}',
    detail: 'Switch statement',
    type: 'keyword',
  },
  { label: 'do', apply: 'do {\n\n} while (condition)', detail: 'Do-while loop', type: 'keyword' },
  { label: 'throw', apply: 'throw new Error()', detail: 'Throw error', type: 'keyword' },
  { label: 'map', apply: '.map(item => )', detail: 'Array map', type: 'function' },
  { label: 'filter', apply: '.filter(item => )', detail: 'Array filter', type: 'function' },
  {
    label: 'reduce',
    apply: '.reduce((acc, item) => , )',
    detail: 'Array reduce',
    type: 'function',
  },
]

const pythonCompletions = [
  {
    label: 'def',
    apply: 'def function_name():\n    ',
    detail: 'Function definition',
    type: 'keyword',
  },
  {
    label: 'class',
    apply: 'class ClassName:\n    def __init__(self):\n        ',
    detail: 'Class definition',
    type: 'keyword',
  },
  { label: 'if', apply: 'if condition:\n    ', detail: 'If statement', type: 'keyword' },
  { label: 'for', apply: 'for item in iterable:\n    ', detail: 'For loop', type: 'keyword' },
  { label: 'while', apply: 'while condition:\n    ', detail: 'While loop', type: 'keyword' },
  {
    label: 'try',
    apply: 'try:\n    \nexcept Exception as e:\n    print(e)',
    detail: 'Try-except block',
    type: 'keyword',
  },
  { label: 'print', apply: 'print()', detail: 'Print to console', type: 'function' },
  { label: 'return', apply: 'return ', detail: 'Return statement', type: 'keyword' },
  { label: 'import', apply: 'import ', detail: 'Import module', type: 'keyword' },
  { label: 'from', apply: 'from module import ', detail: 'Import from module', type: 'keyword' },
  {
    label: 'async',
    apply: 'async def function_name():\n    ',
    detail: 'Async function',
    type: 'keyword',
  },
  { label: 'with', apply: 'with  as alias:\n    ', detail: 'Context manager', type: 'keyword' },
  { label: 'lambda', apply: 'lambda x: ', detail: 'Lambda function', type: 'keyword' },
  { label: 'list', apply: '[x for x in ]', detail: 'List comprehension', type: 'keyword' },
  { label: 'dict', apply: '{k: v for k, v in }', detail: 'Dict comprehension', type: 'keyword' },
  { label: 'raise', apply: 'raise Exception()', detail: 'Raise exception', type: 'keyword' },
  { label: 'yield', apply: 'yield ', detail: 'Yield generator', type: 'keyword' },
  {
    label: 'class',
    apply: 'class ClassName(Parent):\n    def __init__(self):\n        super().__init__()',
    detail: 'Class with inheritance',
    type: 'keyword',
  },
  {
    label: 'match',
    apply: 'match value:\n    case :\n        pass',
    detail: 'Match statement',
    type: 'keyword',
  },
  {
    label: 'decorator',
    apply: '@staticmethod\ndef func():\n    pass',
    detail: 'Static method',
    type: 'keyword',
  },
]

const javascriptCompletionsBasic = javascriptCompletions.map(c => ({
  label: c.label,
  apply: c.apply,
  detail: c.detail,
  type: c.type,
}))

const pythonCompletionsBasic = pythonCompletions.map(c => ({
  label: c.label,
  apply: c.apply,
  detail: c.detail,
  type: c.type,
}))

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
const _inlinePatterns = [
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

      for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i)
        const ranges = getLineMarkdownRanges(line.text)

        for (const range of ranges) {
          const _from = line.from + range.from
          const _to = line.from + range.to
          builder.add(_from, _to, Decoration.mark({ class: 'cm-md-hidden' }))
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
  // Blockquote styling
  '.cm-quote': {
    color: 'var(--text-primary)',
    fontStyle: 'italic',
    background: 'rgba(108, 99, 255, 0.08)',
    borderLeft: '3px solid var(--accent)',
    padding: '8px 16px',
    borderRadius: '0 8px 8px 0',
    margin: '8px 0',
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

// Code block highlighter - clean IDE style (no colors, just dark container)
const _codeBlockDecoration = Decoration.line({
  attributes: {
    style: 'background: #1e1e1e; margin: 0; padding: 0 16px 0 52px; border: none;',
  },
})

const codeBlockStartDecoration = Decoration.line({
  attributes: {
    class: 'cm-code-block-line',
    style: 'background: #1e1e1e; margin: 0; padding: 8px 16px 8px 52px; border: none;',
  },
})

const codeBlockEndDecoration = Decoration.line({
  attributes: {
    class: 'cm-code-block-line',
    style: 'background: #1e1e1e; margin: 0; padding: 8px 16px 16px 52px; border: none;',
  },
})

const codeBlockMiddleDecoration = Decoration.line({
  attributes: {
    class: 'cm-code-block-line',
    style: 'background: #1e1e1e; margin: 0; padding: 0 16px 0 52px; border: none;',
  },
})

// Single line code block
const _codeBlockSingleDecoration = Decoration.line({
  attributes: {
    style: 'background: #1e1e1e; margin: 0; padding: 8px 16px 8px 52px; border: none;',
  },
})

// ViewPlugin for code block highlighting
const codeBlockHighlighterPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view)
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>()
      const doc = view.state.doc

      let inCodeBlock = false

      for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i)
        const lineText = line.text
        const trimmed = lineText.trim()

        // Check if line starts with fence
        if (trimmed.startsWith('```')) {
          if (!inCodeBlock) {
            // Start of code block
            inCodeBlock = true
            builder.add(line.from, line.from, codeBlockStartDecoration)
          } else {
            // End of code block
            inCodeBlock = false
            builder.add(line.from, line.from, codeBlockEndDecoration)
          }
        } else if (inCodeBlock) {
          // Inside code block
          builder.add(line.from, line.from, codeBlockMiddleDecoration)
        }
      }

      return builder.finish()
    }
  },
  {
    decorations: v => v.decorations,
  }
)

// Export the code block highlighter
const codeBlockHighlighter = codeBlockHighlighterPlugin

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
    },
    '.cm-lineNumbers': {
      color: 'var(--text-secondary)',
    },
    // Markdown Headers - with background and icon
    '.cm-header-1, .cm-header-2, .cm-header-3, .cm-header-4, .cm-header-5, .cm-header-6': {
      color: '#ff7b72',
      fontWeight: '700',
      borderRadius: '4px',
      padding: '2px 8px',
      margin: '4px 0',
      display: 'inline-block',
    },
    '.cm-header-1': {
      fontSize: '1.8em',
      background: 'linear-gradient(135deg, rgba(255,123,114,0.15) 0%, rgba(255,123,114,0.05) 100%)',
      borderLeft: '4px solid #ff7b72',
      padding: '6px 12px',
      color: '#ff7b72',
    },
    '.cm-header-2': {
      fontSize: '1.5em',
      background: 'linear-gradient(135deg, rgba(255,169,77,0.15) 0%, rgba(255,169,77,0.05) 100%)',
      borderLeft: '3px solid #ffa94d',
      padding: '5px 10px',
      color: '#ffa94d',
    },
    '.cm-header-3': {
      fontSize: '1.3em',
      background: 'linear-gradient(135deg, rgba(255,213,86,0.15) 0%, rgba(255,213,86,0.05) 100%)',
      borderLeft: '3px solid #ffd556',
      padding: '4px 10px',
      color: '#ffd556',
    },
    '.cm-header-4, .cm-header-5, .cm-header-6': {
      background: 'linear-gradient(135deg, rgba(108,99,255,0.1) 0%, rgba(108,99,255,0.05) 100%)',
      borderLeft: '2px solid var(--accent)',
    },
    // Formatting
    '.cm-formatting': {
      color: '#79c0ff',
      fontWeight: '600',
    },
    // Bold - strong text
    '.cm-formatting-strong': {
      color: '#ffa94d',
      fontWeight: '900',
      background: 'rgba(255,169,77,0.15)',
      borderRadius: '3px',
      padding: '1px 4px',
      textShadow: '0 0 8px rgba(255,169,77,0.3)',
    },
    // Italic - emphasis
    '.cm-formatting-emphasis': {
      color: '#d2a8ff',
      fontStyle: 'italic',
      background: 'rgba(210,168,255,0.12)',
      borderRadius: '3px',
      padding: '1px 4px',
      textShadow: '0 0 8px rgba(210,168,255,0.3)',
    },
    // Inline code
    '.cm-formatting-code': {
      color: '#7ee787',
      background: 'rgba(126,231,135,0.15)',
      borderRadius: '4px',
      padding: '2px 6px',
      fontFamily: "'SF Mono', Monaco, monospace",
      fontSize: '0.9em',
      border: '1px solid rgba(126,231,135,0.3)',
    },
    // Links
    '.cm-formatting-link': {
      color: '#79c0ff',
      textDecoration: 'underline',
      textDecorationStyle: 'dashed',
      textUnderlineOffset: '3px',
    },
    '.cm-url': {
      color: '#58a6ff',
      background: 'rgba(88,166,255,0.1)',
      borderRadius: '3px',
      padding: '1px 4px',
    },
    // Quote
    '.cm-formatting-quote': {
      color: '#8b949e',
      fontStyle: 'italic',
      background: 'rgba(139,148,158,0.1)',
      borderLeft: '3px solid #8b949e',
      padding: '2px 8px',
      borderRadius: '0 4px 4px 0',
    },
    // Strikethrough
    '.cm-strikethrough': {
      textDecoration: 'line-through',
      lineThroughStyle: 'solid',
      color: '#8b949e',
      opacity: '0.8',
    },
    // Code fence markers (```)
    '.cm-meta': {
      color: '#ff7b72',
      backgroundColor: 'rgba(255,123,114,0.15)',
      borderRadius: '4px',
      padding: '3px 8px',
      fontWeight: '600',
      fontSize: '0.85em',
      border: '1px solid rgba(255,123,114,0.3)',
    },
    '.cm-fencedChar': {
      color: '#d2a8ff',
      backgroundColor: 'rgba(210,168,255,0.15)',
      borderRadius: '4px',
      padding: '3px 10px',
      fontWeight: '600',
      fontSize: '0.85em',
      border: '1px solid rgba(210,168,255,0.3)',
    },
    // Code blocks styling
    '.cm-codeblock': {
      background: 'rgba(30, 30, 50, 0.6)',
      borderRadius: '8px',
      border: '1px solid rgba(108, 99, 255, 0.2)',
      margin: '8px 0',
      padding: '0',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
    },
    '.cm-codeblock-open': {
      borderBottom: 'none',
      borderBottomLeftRadius: '0',
      borderBottomRightRadius: '0',
    },
    '.cm-codeblock-close': {
      borderTop: 'none',
      borderTopLeftRadius: '0',
      borderTopRightRadius: '0',
    },
    // Code block header (language label)
    '.cm-codeblock-header': {
      background: 'linear-gradient(135deg, rgba(108,99,255,0.2) 0%, rgba(108,99,255,0.1) 100%)',
      borderBottom: '1px solid rgba(108, 99, 255, 0.2)',
      padding: '8px 16px',
      fontSize: '12px',
      fontWeight: '600',
      color: '#79c0ff',
      fontFamily: "'SF Mono', Monaco, monospace",
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      borderRadius: '8px 8px 0 0',
    },
    // Code content inside block
    '.cm-codeblock-content': {
      padding: '16px',
      background: 'rgba(20, 20, 35, 0.8)',
      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Fira Code', monospace",
      fontSize: '13px',
      lineHeight: '1.6',
    },
    // Indented code lines
    '.cm-indented': {
      paddingLeft: '24px',
      borderLeft: '2px solid rgba(108, 99, 255, 0.15)',
      marginLeft: '8px',
    },
    // List markers
    '.cm-list': {
      color: '#79c0ff',
      fontWeight: 'bold',
    },
    // Horizontal rule
    '.cm-hr': {
      color: '#8b949e',
    },
    // Comment in code
    '.cm-comment': {
      color: '#8b949e',
      fontStyle: 'italic',
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
        cmKeymap.of([
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...completionKeymap,
        ]),

        // Language support with syntax highlighting
        markdown({ base: markdownLanguage, codeLanguages: languages }),

        // Autocompletion - markdown snippets
        autocompletion({
          activateOnTyping: true,
          defaultKeymap: true,
          closeOnBlur: false,
          override: [
            // Code block completion
            context => {
              const doc = context.state.doc
              const pos = context.pos
              const currentLanguage = findCurrentCodeBlockLanguage(doc, pos)

              if (
                currentLanguage === 'javascript' ||
                currentLanguage === 'js' ||
                currentLanguage === 'typescript' ||
                currentLanguage === 'ts'
              ) {
                const word = context.matchBefore(/\w+/)
                if (!word) return null

                const filtered = javascriptCompletionsBasic.filter(c =>
                  c.label.toLowerCase().startsWith(word.text.toLowerCase())
                )

                if (filtered.length === 0) return null

                return {
                  from: word.from,
                  to: word.to,
                  options: filtered.map(c => ({
                    label: c.label,
                    apply: c.apply,
                    detail: c.detail,
                    type: c.type,
                  })),
                }
              }

              if (currentLanguage === 'python' || currentLanguage === 'py') {
                const word = context.matchBefore(/\w+/)
                if (!word) return null

                const filtered = pythonCompletionsBasic.filter(c =>
                  c.label.toLowerCase().startsWith(word.text.toLowerCase())
                )

                if (filtered.length === 0) return null

                return {
                  from: word.from,
                  to: word.to,
                  options: filtered.map(c => ({
                    label: c.label,
                    apply: c.apply,
                    detail: c.detail,
                    type: c.type,
                  })),
                }
              }

              return null
            },
            // Markdown snippets completion
            context => {
              const line = context.state.doc.lineAt(context.pos)
              const lineStart = line.from
              const textBefore = context.state.doc.sliceString(lineStart, context.pos)
              const word = context.matchBefore(/[#*`\[\]!>\-~r]/)

              const options: Completion[] = [
                { label: '#', apply: '# ', detail: 'Heading 1' },
                { label: '##', apply: '## ', detail: 'Heading 2' },
                { label: '###', apply: '### ', detail: 'Heading 3' },
                { label: '####', apply: '#### ', detail: 'Heading 4' },
                { label: '#####', apply: '##### ', detail: 'Heading 5' },
                { label: '######', apply: '###### ', detail: 'Heading 6' },
                {
                  label: '**bold**',
                  apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
                    view.dispatch({
                      changes: { from, to, insert: '****' },
                      selection: { anchor: from + 2 },
                    })
                  },
                  detail: 'Bold text',
                },
                {
                  label: '*italic*',
                  apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
                    view.dispatch({
                      changes: { from, to, insert: '**' },
                      selection: { anchor: from + 1 },
                    })
                  },
                  detail: 'Italic text',
                },
                {
                  label: '***bold italic***',
                  apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
                    view.dispatch({
                      changes: { from, to, insert: '*****' },
                      selection: { anchor: from + 2 },
                    })
                  },
                  detail: 'Bold + Italic',
                },
                {
                  label: '`code`',
                  apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
                    view.dispatch({
                      changes: { from, to, insert: '``' },
                      selection: { anchor: from + 1 },
                    })
                  },
                  detail: 'Inline code',
                },
                {
                  label: '```',
                  apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
                    view.dispatch({
                      changes: { from, to, insert: '```\n\n```' },
                      selection: { anchor: from + 4 },
                    })
                  },
                  detail: 'Code block',
                },
                {
                  label: '```python run',
                  apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
                    view.dispatch({
                      changes: { from, to, insert: '```python run\n\n```' },
                      selection: { anchor: from + 15 },
                    })
                  },
                  detail: 'Python (runnable)',
                },
                {
                  label: '```javascript run',
                  apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
                    view.dispatch({
                      changes: { from, to, insert: '```javascript run\n\n```' },
                      selection: { anchor: from + 20 },
                    })
                  },
                  detail: 'JavaScript (runnable)',
                },
                {
                  label: '```ruby run',
                  apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
                    view.dispatch({
                      changes: { from, to, insert: '```ruby run\n\n```' },
                      selection: { anchor: from + 14 },
                    })
                  },
                  detail: 'Ruby (runnable)',
                },
                {
                  label: '```php run',
                  apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
                    view.dispatch({
                      changes: { from, to, insert: '```php run\n\n```' },
                      selection: { anchor: from + 12 },
                    })
                  },
                  detail: 'PHP (runnable)',
                },
                {
                  label: '```perl run',
                  apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
                    view.dispatch({
                      changes: { from, to, insert: '```perl run\n\n```' },
                      selection: { anchor: from + 14 },
                    })
                  },
                  detail: 'Perl (runnable)',
                },
                {
                  label: '```bash run',
                  apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
                    view.dispatch({
                      changes: { from, to, insert: '```bash run\n\n```' },
                      selection: { anchor: from + 14 },
                    })
                  },
                  detail: 'Bash (runnable)',
                },
                {
                  label: '```java run',
                  apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
                    view.dispatch({
                      changes: { from, to, insert: '```java run\n\n```' },
                      selection: { anchor: from + 14 },
                    })
                  },
                  detail: 'Java (runnable)',
                },
              ]

              if (!word && textBefore === '') {
                return {
                  from: context.pos,
                  to: context.pos,
                  options,
                }
              }

              if (!word) return null
              return {
                from: word.from,
                to: word.to,
                options,
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
        codeBlockHighlighter,
        // headerOutlinePlugin,

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
 * @param view - EditorView instance
 * @param content - New content to set
 */
export function setEditorContent(view: EditorView, content: string): void {
  // Save current cursor position before replacing content
  const cursorPos = view.state.selection.main.head
  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: content,
    },
    // Restore cursor position, clamped to content length
    selection: { anchor: Math.min(cursorPos, content.length) },
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
