'use client'

import { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'

interface EmailBlock {
  type: 'message' | 'reply' | 'signature'
  author?: string
  date?: string
  body: string
}

function splitSignature(body: string): { body: string; signature: string } {
  const lines = body.split('\n')
  if (lines.length < 4) return { body, signature: '' }

  const signatureStart = lines.findIndex((line, index) => {
    if (index < 2) return false
    const trimmed = line.trim()
    if (!trimmed) return false
    const looksLikeTitle = trimmed.length <= 80
      && !/[.!?]$/.test(trimmed)
      && /\b(?:manager|director|coordinator|production|installation|operations|support|sales|phone|mobile|office)\b/i.test(trimmed)
    return /mailto:|@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\./i.test(trimmed)
      || looksLikeTitle
      || /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(trimmed)
      || /\b(?:atlanta|baltimore|boston|charlotte|chicago|cincinnati|cleveland|columbus|dallas|denver|detroit|houston)\b/i.test(trimmed)
  })

  if (signatureStart === -1) return { body, signature: '' }
  return {
    body: lines.slice(0, signatureStart).join('\n').trim(),
    signature: lines.slice(signatureStart).join('\n').trim(),
  }
}

/**
 * Parse raw email/ticket content into structured blocks:
 * - Primary message (the actual content)
 * - Quoted replies (forwarded/replied email chain)
 * - Signatures (contact info, disclaimers)
 */
function parseEmailContent(raw: string): EmailBlock[] {
  if (!raw) return []

  // Strip "Email from name (email@domain.com):" prefix added by import script
  let cleaned = raw.replace(/^Email from\s+[^:]+:\s*/i, '')

  const blocks: EmailBlock[] = []
  const lines = cleaned.split('\n')

  let currentBody: string[] = []
  let inReplyChain = false
  let currentReplyAuthor = ''
  let currentReplyDate = ''

  const replyStartPatterns = [
    /^_{3,}$/,                                          // ________________________________
    /^-{3,}$/,                                          // ---
    /^From:\s+(.+?)(?:\s*<[^>]+>)?\s*$/i,               // From: Name <email>
    /^On\s+.+?\s+wrote:\s*$/i,                          // On Mon, Jan 1, 2026, Name wrote:
    /^On\s+\w+\s+\d+,\s+\d{4},?\s+at\s+/i,             // On Mar 26, 2026, at 8:49 PM
  ]

  const signaturePatterns = [
    /^Get Outlook for iOS/i,
    /^Sent from my/i,
    /^Sent from Mail for/i,
    /^_{10,}$/,
  ]

  const emailHeaderPattern = /^(From|To|Sent|Subject|Date|CC|Cc|Bcc):\s/i
  const emailSigPattern = /^(?:M|P|F|T|C):\s*[\(+]?\d[\d\s\-\(\)\.]+$/  // Phone numbers in signatures
  const urlOnlyLine = /^\s*https?:\/\/\S+\s*$/
  const imageRef = /^\[image\d*\.\w+\]$/i
  const salesforceUrl = /salesforce\.com/i
  const threadId = /^thread::/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Skip empty image references
    if (imageRef.test(trimmed)) continue

    // Skip salesforce URLs and thread IDs
    if (salesforceUrl.test(trimmed) || threadId.test(trimmed)) continue

    // Skip bare URLs on their own line
    if (urlOnlyLine.test(trimmed)) continue

    // Check for signature start
    if (signaturePatterns.some(p => p.test(trimmed))) {
      // Save current body
      if (currentBody.length > 0) {
        const bodyText = currentBody.join('\n').trim()
        if (bodyText) {
          blocks.push({
            type: inReplyChain ? 'reply' : 'message',
            author: inReplyChain ? currentReplyAuthor : undefined,
            date: inReplyChain ? currentReplyDate : undefined,
            body: bodyText,
          })
        }
        currentBody = []
      }
      // Skip the signature lines
      continue
    }

    // Check for reply chain start
    const isReplyStart = replyStartPatterns.some(p => p.test(trimmed))
    if (isReplyStart && i > 2) {
      // Save current body as message
      const bodyText = currentBody.join('\n').trim()
      if (bodyText) {
        blocks.push({
          type: inReplyChain ? 'reply' : 'message',
          author: inReplyChain ? currentReplyAuthor : undefined,
          date: inReplyChain ? currentReplyDate : undefined,
          body: bodyText,
        })
      }
      currentBody = []
      inReplyChain = true

      // Try to extract author from "From:" or "On ... wrote:" patterns
      if (/^From:\s+(.+)/i.test(trimmed)) {
        const match = trimmed.match(/^From:\s+(.+?)(?:\s*<[^>]+>)?\s*$/i)
        currentReplyAuthor = match?.[1] || ''
      } else if (/^On\s+.+wrote/i.test(trimmed)) {
        const match = trimmed.match(/^On\s+(.+?),?\s+(.+?)\s+wrote/i)
        currentReplyDate = match?.[1] || ''
        currentReplyAuthor = match?.[2] || ''
      }

      // Skip separator lines
      continue
    }

    // Skip email headers in reply chains
    if (inReplyChain && emailHeaderPattern.test(trimmed)) {
      // Extract date from Sent: header
      if (/^Sent:\s+(.+)/i.test(trimmed)) {
        const match = trimmed.match(/^Sent:\s+(.+)/i)
        currentReplyDate = match?.[1] || currentReplyDate
      }
      if (/^From:\s+(.+)/i.test(trimmed)) {
        const match = trimmed.match(/^From:\s+(.+?)(?:\s*<[^>]+>)?\s*$/i)
        currentReplyAuthor = match?.[1] || currentReplyAuthor
      }
      continue
    }

    // Skip email-style signature lines (phone numbers, titles in reply chains)
    if (inReplyChain && emailSigPattern.test(trimmed)) continue

    // Collect body content
    currentBody.push(line)
  }

  // Flush remaining
  const remaining = currentBody.join('\n').trim()
  if (remaining) {
    blocks.push({
      type: inReplyChain ? 'reply' : 'message',
      author: inReplyChain ? currentReplyAuthor : undefined,
      date: inReplyChain ? currentReplyDate : undefined,
      body: remaining,
    })
  }

  // If no blocks parsed, return the whole thing as a message
  if (blocks.length === 0) {
    return [{ type: 'message', body: raw.trim() }]
  }

  const normalized: EmailBlock[] = []
  blocks.forEach((block) => {
    if (block.type !== 'message') {
      normalized.push(block)
      return
    }
    const split = splitSignature(block.body)
    if (split.body) normalized.push({ ...block, body: split.body })
    if (split.signature) normalized.push({ type: 'signature', body: split.signature })
  })
  return normalized.length > 0 ? normalized : blocks
}

/** Clean inline junk from a text block */
function cleanInlineText(text: string): string {
  return text
    .replace(/mailto:/gi, '')
    .replace(/<https?:\/\/aka\.ms\/[^>]+>/g, '')    // <https://aka.ms/xxx>
    .replace(/https?:\/\/aka\.ms\/\S+/g, '')         // bare aka.ms links
    .replace(/<https?:\/\/[^>]*salesforce[^>]*>/g, '') // salesforce URLs
    .replace(/\[https?:\/\/[^\]]*salesforce[^\]]*\]/g, '') // [salesforce URLs]
    .replace(/\u200B/g, '')                           // zero-width spaces
    .replace(/\uFEFF/g, '')                           // BOM
    .replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\1/g, '$1')
    .replace(/\s{3,}/g, '  ')                         // excessive spaces
    .replace(/\n{4,}/g, '\n\n\n')                     // excessive newlines
    .trim()
}

/** The main content renderer */
export function TicketContent({ content, variant = 'description' }: {
  content: string
  variant?: 'description' | 'comment' | 'email'
}) {
  const blocks = useMemo(() => parseEmailContent(content), [content])
  const [showReplies, setShowReplies] = useState(false)

  const primaryBlocks = blocks.filter(b => b.type === 'message')
  const replyBlocks = blocks.filter(b => b.type === 'reply')
  const signatureBlocks = blocks.filter(b => b.type === 'signature')

  return (
    <div className="space-y-3">
      {/* Primary message content */}
      {primaryBlocks.map((block, i) => (
        <div key={i} className="prose-ticket">
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="text-[14px] text-zinc-800 leading-[1.75] mb-3 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold text-zinc-900">{children}</strong>,
              em: ({ children }) => <em className="italic text-zinc-600">{children}</em>,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer"
                  className="break-words text-[#0A52EF] hover:text-[#0840C0] underline decoration-blue-200 hover:decoration-blue-400 transition-colors">
                  {children}
                </a>
              ),
              ul: ({ children }) => <ul className="list-disc list-outside ml-4 mb-3 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-outside ml-4 mb-3 space-y-1">{children}</ol>,
              li: ({ children }) => <li className="text-[13.5px] text-zinc-700 leading-[1.6]">{children}</li>,
              h1: ({ children }) => <h1 className="text-base font-semibold text-zinc-900 mb-2">{children}</h1>,
              h2: ({ children }) => <h2 className="text-sm font-semibold text-zinc-900 mb-2">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-medium text-zinc-800 mb-1">{children}</h3>,
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-zinc-200 pl-3 my-2 text-zinc-500 italic">
                  {children}
                </blockquote>
              ),
              code: ({ children, className }) => {
                const isBlock = className?.includes('language-')
                if (isBlock) {
                  return <pre className="bg-zinc-50 border border-zinc-100 rounded-lg p-3 text-xs font-mono text-zinc-700 overflow-x-auto my-2"><code>{children}</code></pre>
                }
                return <code className="bg-zinc-100 text-zinc-700 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
              },
              pre: ({ children }) => <>{children}</>,
            }}
          >
            {cleanInlineText(block.body)}
          </ReactMarkdown>
        </div>
      ))}

      {signatureBlocks.length > 0 && (
        <details className="group rounded-md border border-zinc-200 bg-zinc-50/70 px-3 py-2">
          <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400 group-open:text-zinc-500">
            Signature
          </summary>
          <div className="mt-2 whitespace-pre-line text-xs leading-relaxed text-zinc-500">
            {signatureBlocks.map((block) => cleanInlineText(block.body)).join('\n\n')}
          </div>
        </details>
      )}

      {/* Reply chain toggle */}
      {replyBlocks.length > 0 && (
        <div>
          <button onClick={() => setShowReplies(!showReplies)}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 transition-colors py-1">
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 transition-transform ${showReplies ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {showReplies ? 'Hide' : 'Show'} {replyBlocks.length} previous {replyBlocks.length === 1 ? 'reply' : 'replies'}
          </button>

          {showReplies && (
            <div className="mt-2 space-y-2">
              {replyBlocks.map((block, i) => (
                <div key={i} className="border-l-2 border-zinc-100 pl-4 py-2">
                  {(block.author || block.date) && (
                    <p className="text-[11px] text-zinc-400 mb-1.5">
                      {block.author && <span className="font-medium text-zinc-500">{block.author}</span>}
                      {block.author && block.date && <span> &middot; </span>}
                      {block.date && <span>{block.date}</span>}
                    </p>
                  )}
                  <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-line">
                    {cleanInlineText(block.body)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Pre-process @[Full Name] mentions into a markdown form ReactMarkdown can
// render with a custom emphasis style — turning them into chips visually.
function renderMentions(content: string): string {
  return content.replace(/@\[([^\]]+)\]/g, (_m, name) => `**@${name}**`)
}

/** Simpler renderer for comments (no email parsing needed) */
export function CommentContent({ content }: { content: string }) {
  return (
    <div className="prose-ticket">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="text-[13px] text-zinc-700 leading-[1.7] mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => {
            const text = Array.isArray(children) ? children.join('') : String(children ?? '')
            if (text.startsWith('@')) {
              return <span className="inline-flex items-center px-1.5 py-px rounded text-[12px] font-medium bg-blue-50 text-blue-700 border border-blue-100">{text}</span>
            }
            return <strong className="font-semibold text-zinc-900">{children}</strong>
          },
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200">{children}</a>
          ),
          ul: ({ children }) => <ul className="list-disc list-outside ml-4 mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-outside ml-4 mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="text-[13px] text-zinc-700">{children}</li>,
          code: ({ children, className }) => {
            if (className?.includes('language-')) {
              return <pre className="bg-zinc-50 border border-zinc-100 rounded-lg p-3 text-xs font-mono overflow-x-auto my-2"><code>{children}</code></pre>
            }
            return <code className="bg-zinc-100 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
          },
          pre: ({ children }) => <>{children}</>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-zinc-200 pl-3 my-2 text-zinc-500 italic">{children}</blockquote>,
        }}
      >
        {renderMentions(content)}
      </ReactMarkdown>
    </div>
  )
}
