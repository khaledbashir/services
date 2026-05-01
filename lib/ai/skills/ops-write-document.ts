import { NocoOps } from '@/lib/nocodb-ops'
import { markdownToProseMirror } from '@/lib/prosemirror-from-markdown'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'ops_write_document',
  description:
    'Replace the contents of a NocoDB document. Pass base_id + doc_id (use ops_list_documents to find by title), plus either `markdown` (auto-converted to ProseMirror JSON — supports headings, paragraphs, bullet/ordered lists, code blocks, **bold** / *italic* / `code` inline) or raw `content` (already a ProseMirror JSON object). Optionally rename the doc with `title`. Handles the optimistic-lock version automatically by re-reading before write.',
  category: 'Service Ops',
  icon: '✍️',
  parameters: {
    type: 'object',
    properties: {
      base_id: { type: 'string', description: 'NocoDB base id (from ops_list_tables)' },
      doc_id: { type: 'string', description: 'NocoDB document id (from ops_list_documents)' },
      title: { type: 'string', description: 'Optional new title' },
      markdown: { type: 'string', description: 'Markdown body — converted to ProseMirror JSON server-side. Use this for natural drafting; pass plain text for paragraphs.' },
      content: { type: 'object', description: 'Pre-built ProseMirror JSON ({ type:"doc", content:[…] }). Mutually exclusive with markdown — use one or the other.' },
    },
    required: ['base_id', 'doc_id'],
  },
  async handler(args) {
    if (!NocoOps.configured()) return { error: 'NOCODB_OPS_PAT missing.' }
    const baseId = String(args.base_id)
    const docId = String(args.doc_id)
    if (!args.markdown && !args.content && !args.title) {
      return { error: 'Pass at least one of: markdown, content, title.' }
    }

    // Re-read for the latest version (cheap insurance vs stale optimistic locks).
    const current = await NocoOps.getDocument(baseId, docId)
    const content = args.content
      ? args.content
      : (typeof args.markdown === 'string' ? markdownToProseMirror(args.markdown) : undefined)

    const updated = await NocoOps.updateDocument(baseId, {
      docId,
      version: current.version,
      title: typeof args.title === 'string' ? args.title : undefined,
      content,
    })
    return {
      doc_id: updated.id,
      title: updated.title,
      new_version: updated.version,
      // Echo back a short preview so the model can confirm in its reply.
      content_preview: content ? JSON.stringify(content).slice(0, 200) : null,
    }
  },
}
export default skill
