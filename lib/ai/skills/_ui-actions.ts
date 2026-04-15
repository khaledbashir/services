import type { Skill } from '@/lib/ai/types'

// Browser-driving skills. These "run" on the server only as a passthrough —
// the handler echoes a _ui_action payload which the client-side dispatcher
// picks up from the tool_result stream and performs in the real DOM with
// a visible cursor animation. This is how the agent drives the UI like a
// human: click a button, fill a field, navigate to a page.

function ui(type: string, args: Record<string, unknown>) {
  return { ok: true, _ui_action: { type, ...args } }
}

const navigate: Skill = {
  name: 'ui_navigate',
  description: 'Navigate the user to a dashboard path (e.g. /events, /designs, /tickets/abc123). Use for "open the events page", "go to the Prudential venue", etc.',
  category: 'System',
  icon: '🧭',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Path starting with /' } },
    required: ['path'],
  },
  async handler(args) {
    return ui('navigate', { path: String(args.path || '') })
  },
}

const click: Skill = {
  name: 'ui_click',
  description: 'Click a button or link on the current page. Prefer semantic selectors (button text, label). Pass a CSS selector or a visible text label.',
  category: 'System',
  icon: '👆',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector OR visible text of the element (searches text if not a selector)' },
    },
    required: ['selector'],
  },
  async handler(args) {
    return ui('click', { selector: String(args.selector || '') })
  },
}

const fill: Skill = {
  name: 'ui_fill',
  description: 'Type text into an input, textarea, or contenteditable field on the current page. Submits the change with an input + change + blur event.',
  category: 'System',
  icon: '⌨️',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector OR label text of the field' },
      value: { type: 'string' },
    },
    required: ['selector', 'value'],
  },
  async handler(args) {
    return ui('fill', { selector: String(args.selector || ''), value: String(args.value || '') })
  },
}

const select: Skill = {
  name: 'ui_select',
  description: 'Change a <select> dropdown on the current page to a specific option value or label.',
  category: 'System',
  icon: '🔽',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string' },
      value: { type: 'string' },
    },
    required: ['selector', 'value'],
  },
  async handler(args) {
    return ui('select', { selector: String(args.selector || ''), value: String(args.value || '') })
  },
}

const highlight: Skill = {
  name: 'ui_highlight',
  description: 'Briefly pulse a ring around an element so the user notices it. Good for "here is the thing you asked about".',
  category: 'System',
  icon: '✨',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string' },
      label: { type: 'string', description: 'Optional floating label text' },
    },
    required: ['selector'],
  },
  async handler(args) {
    return ui('highlight', { selector: String(args.selector || ''), label: args.label ? String(args.label) : undefined })
  },
}

const wait: Skill = {
  name: 'ui_wait',
  description: 'Pause briefly so the user can see what just happened before the next action. Default 800ms.',
  category: 'System',
  icon: '⏳',
  parameters: {
    type: 'object',
    properties: { ms: { type: 'integer', default: 800 } },
  },
  async handler(args) {
    return ui('wait', { ms: Math.min(Math.max(Number(args.ms) || 800, 100), 5000) })
  },
}

const toast: Skill = {
  name: 'ui_toast',
  description: 'Show a short success/info notification in the corner of the page.',
  category: 'System',
  icon: '💬',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string' },
      variant: { type: 'string', enum: ['info', 'success', 'warning'], default: 'info' },
    },
    required: ['message'],
  },
  async handler(args) {
    return ui('toast', { message: String(args.message || ''), variant: String(args.variant || 'info') })
  },
}

export function uiSkills(): Skill[] {
  return [navigate, click, fill, select, highlight, wait, toast]
}
