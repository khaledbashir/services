import type { Skill } from '@/lib/ai/types'
import { createSlackCanvas } from '@/lib/slack'

const skill: Skill = {
  name: 'slack_create_canvas',
  description: 'Create a Slack canvas, optionally attached to a Slack channel, using markdown content.',
  category: 'System',
  icon: '📋',
  role: 'technician',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Canvas title' },
      content: { type: 'string', description: 'Markdown body for the canvas' },
      channel_id: { type: 'string', description: 'Slack channel ID for a channel canvas' },
    },
    required: ['title'],
  },
  async handler(args) {
    const title = typeof args.title === 'string' ? args.title : ''
    const content = typeof args.content === 'string' ? args.content : ''
    const channelId = typeof args.channel_id === 'string' ? args.channel_id : undefined

    const result = await createSlackCanvas({ title, content, channelId })
    const link = result.canvas_id ? `https://app.slack.com/canvas/${result.canvas_id}` : undefined
    return {
      ...result,
      link,
      text_summary: link
        ? `Slack canvas **${title}** created — [open →](${link})`
        : `Slack canvas **${title}** created successfully.`,
    }
  },
}

export default skill
