import { marked, Renderer } from 'marked'
import DOMPurify from 'dompurify'

// Configure marked options for GitHub Flavored Markdown
marked.use({
  gfm: true,
  breaks: true,
})

// Custom renderer for code blocks with run support
const renderer = new Renderer()

renderer.code = function ({ text, lang }: { text: string; lang?: string; escaped?: boolean }) {
  const language = lang || ''
  const isRunnable = language.includes('run')

  // Extract actual language (remove 'run' keyword)
  const actualLang = language.replace(/\brun\b/gi, '').trim() || 'text'

  const escapedCode = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

  const id = `code-${Math.random().toString(36).substr(2, 9)}`

  let html = `<div class="code-block" data-code-id="${id}">`

  if (isRunnable) {
    html += `<div class="code-block-header">
      <span class="code-lang">${actualLang}</span>
      <button class="run-code-btn" data-code-id="${id}" data-language="${actualLang}">▶ Run</button>
    </div>`
  }

  html += `<pre><code class="language-${actualLang}">${escapedCode}</code></pre>`
  html += `<div class="code-output" id="output-${id}" style="display: none;"></div>`
  html += `</div>`

  return html
}

marked.use({ renderer })

// Configure DOMPurify for safe HTML rendering
const purifyConfig = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'hr',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'strong',
    'b',
    'em',
    'i',
    'del',
    's',
    'strike',
    'a',
    'img',
    'ul',
    'ol',
    'li',
    'blockquote',
    'code',
    'pre',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'div',
    'span',
    'input',
    'button',
  ],
  ALLOWED_ATTR: [
    'href',
    'title',
    'target',
    'rel',
    'src',
    'alt',
    'class',
    'data-local-path',
    'align',
    'type',
    'checked',
    'disabled',
    'data-code-id',
    'data-language',
  ],
  ALLOW_DATA_ATTR: true,
  SANITIZE_DOM: true,
}

/**
 * Converts markdown content to sanitized HTML
 */
export async function parseMarkdown(content: string): Promise<string> {
  try {
    const rawHtml = await marked.parse(content)
    const cleanHtml = DOMPurify.sanitize(rawHtml, purifyConfig)
    return cleanHtml as string
  } catch (error) {
    console.error('Error parsing markdown:', error)
    return `<p class="error">Error parsing markdown: ${escapeHtml(String(error))}</p>`
  }
}

/**
 * Escapes HTML special characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Processes local images in HTML - marks them for path resolution
 */
export function processLocalImages(html: string, _basePath: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const images = doc.querySelectorAll('img')
  images.forEach(img => {
    const src = img.getAttribute('src')
    if (
      src &&
      (src.startsWith('./') ||
        src.startsWith('../') ||
        (!src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('file:')))
    ) {
      img.setAttribute('data-local-path', src)
      img.classList.add('local-image')
    }
  })

  return doc.body.innerHTML
}

/**
 * Resolves local image paths to file:// protocol
 */
export function resolveLocalImagePath(src: string, basePath: string): string {
  if (src.startsWith('./') || src.startsWith('../')) {
    return `file://${basePath}/${src}`
  }
  if (!src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('file:')) {
    return `file://${basePath}/${src}`
  }
  return src
}

/**
 * Extracts table of contents from markdown content
 */
export function getTableOfContents(
  content: string
): Array<{ level: number; text: string; id: string }> {
  const headings: Array<{ level: number; text: string; id: string }> = []
  const tokens = marked.lexer(content)

  tokens.forEach((token: any) => {
    if (token.type === 'heading') {
      const id = token.text.toLowerCase().replace(/[^\w]+/g, '-')
      headings.push({
        level: token.depth,
        text: token.text,
        id: id,
      })
    }
  })

  return headings
}

/**
 * Checks if content contains markdown syntax
 */
export function hasMarkdownSyntax(content: string): boolean {
  const markdownPatterns = [
    /^#{1,6}\s/m,
    /\*\*|__/,
    /\*|_/,
    /`{1,3}/,
    /\[.+\]\(.+\)/,
    /!\[.+\]\(.+\)/,
    /^\s*[-*+]\s/m,
    /^\s*\d+\.\s/m,
    /^\s*>\s/m,
    /^```/m,
    /^---+$/m,
    /^\|.+\|$/m,
  ]

  return markdownPatterns.some(pattern => pattern.test(content))
}
