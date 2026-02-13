import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Configure marked options
marked.use({
  gfm: true,
  breaks: true,
})

// Configure DOMPurify
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
    'input', // For checkboxes
  ],
  ALLOWED_ATTR: [
    'href',
    'title',
    'target',
    'rel',
    'src',
    'alt',
    'title',
    'class',
    'data-local-path',
    'align',
    'type',
    'checked',
    'disabled', // For checkboxes
  ],
  ALLOW_DATA_ATTR: true,
  SANITIZE_DOM: true,
}

// Convert markdown to HTML
export async function parseMarkdown(content: string): Promise<string> {
  try {
    // Parse markdown to HTML
    const rawHtml = await marked.parse(content)

    // Sanitize HTML
    const cleanHtml = DOMPurify.sanitize(rawHtml, purifyConfig)

    return cleanHtml as string
  } catch (error) {
    console.error('Error parsing markdown:', error)
    return `<p class="error">Error parsing markdown: ${escapeHtml(String(error))}</p>`
  }
}

// Escape HTML helper
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Process local images
export function processLocalImages(html: string, _basePath: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Process all images
  const images = doc.querySelectorAll('img')
  images.forEach(img => {
    const src = img.getAttribute('src')
    if (
      src &&
      (src.startsWith('./') ||
        src.startsWith('../') ||
        (!src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('file:')))
    ) {
      // Mark as local image
      img.setAttribute('data-local-path', src)
      img.classList.add('local-image')
    }
  })

  return doc.body.innerHTML
}

// Convert local image paths to file:// protocol
export function resolveLocalImagePath(src: string, basePath: string): string {
  if (src.startsWith('./') || src.startsWith('../')) {
    // Resolve relative path
    return `file://${basePath}/${src}`
  }
  if (!src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('file:')) {
    // Assume it's a local file
    return `file://${basePath}/${src}`
  }
  return src
}

// Get table of contents from markdown
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

// Check if content has markdown syntax
export function hasMarkdownSyntax(content: string): boolean {
  const markdownPatterns = [
    /^#{1,6}\s/m, // Headers
    /\*\*|__/, // Bold
    /\*|_/, // Italic
    /`{1,3}/, // Code
    /\[.+\]\(.+\)/, // Links
    /!\[.+\]\(.+\)/, // Images
    /^\s*[-*+]\s/m, // Lists
    /^\s*\d+\.\s/m, // Numbered lists
    /^\s*>\s/m, // Blockquotes
    /^```/m, // Code blocks
    /^---+$/m, // Horizontal rules
    /^\|.+\|$/m, // Tables
  ]

  return markdownPatterns.some(pattern => pattern.test(content))
}
