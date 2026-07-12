import { SkillError, type Skill } from '@/lib/ai/types'

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

const fillForm: Skill = {
  name: 'ui_fill_form',
  description: 'FIRST CHOICE for filling multiple fields on the current page in one pass. Use this for "fill it", "fill the form", or "fill every blank". Set only_if_empty:true when the user wants blank fields filled without overwriting existing values.',
  category: 'System',
  icon: '🧩',
  parameters: {
    type: 'object',
    properties: {
      assignments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'Prefer [data-ai-target="name"] selectors when available.' },
            value: { type: 'string' },
          },
          required: ['selector', 'value'],
        },
      },
      only_if_empty: { type: 'boolean', description: 'Skip any field that already has a value.' },
    },
    required: ['assignments'],
  },
  async handler(args) {
    return ui('fill_form', {
      assignments: Array.isArray(args.assignments) ? args.assignments : [],
      only_if_empty: args.only_if_empty === true || undefined,
    })
  },
}

const fill: Skill = {
  name: 'ui_fill',
  description: 'FIRST CHOICE when the user says fill, populate, or autofill the current page. Type text into an input, textarea, or contenteditable field on the current page instead of creating a separate record. Submits the change with input + change + blur events. Pass fast:true (or any value >40 chars) to skip the typewriter animation and set the value directly.',
  category: 'System',
  icon: '⌨️',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector OR label text of the field. Prefer [data-ai-target="name"] selectors when available.' },
      value: { type: 'string' },
      fast: { type: 'boolean', description: 'Skip the per-char typewriter animation. Use for long strings or bulk form filling.' },
    },
    required: ['selector', 'value'],
  },
  async handler(args) {
    return ui('fill', {
      selector: String(args.selector || ''),
      value: String(args.value || ''),
      fast: args.fast === true || undefined,
    })
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

const refresh: Skill = {
  name: 'ui_refresh',
  description: 'Re-fetch the current page so the user sees data you just mutated. Call this AFTER any create/update/delete skill so the UI reflects the new state.',
  category: 'System',
  icon: '🔄',
  parameters: { type: 'object', properties: {} },
  async handler() {
    return ui('refresh', {})
  },
}

const showSteps: Skill = {
  name: 'ui_show_steps',
  description: 'Run a visible guided workflow on the current page: move the AI cursor, highlight controls, open tabs, fill safe drafts, pause between steps, and show a completion toast. On ticket pages use this around API-backed mutations so the user can watch the work. Never use it to click submit/send/save or mutate status, priority, owner, category, or resolution.',
  category: 'System',
  icon: '🎬',
  parameters: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        minItems: 1,
        maxItems: 12,
        items: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['highlight', 'click', 'fill', 'wait', 'toast'] },
            selector: { type: 'string', description: 'CSS selector or visible label. Prefer stable [data-ai-target="..."] selectors.' },
            label: { type: 'string', description: 'Short label shown above a highlighted control.' },
            value: { type: 'string', description: 'Draft text for a fill step, or toast text for a toast step.' },
            ms: { type: 'integer', minimum: 100, maximum: 3000, description: 'Pause length for a wait step.' },
          },
          required: ['action'],
        },
      },
    },
    required: ['steps'],
  },
  async handler(args) {
    const rawSteps = Array.isArray(args.steps) ? args.steps.slice(0, 12) : []
    if (rawSteps.length === 0) throw new SkillError('missing_ui_steps', 'Provide at least one visible workflow step.')

    const actions: Record<string, unknown>[] = []
    for (const raw of rawSteps) {
      if (!raw || typeof raw !== 'object') continue
      const step = raw as Record<string, unknown>
      const action = String(step.action || '')
      const selector = String(step.selector || '').trim()

      if (action === 'highlight') {
        if (!selector) throw new SkillError('missing_selector', 'Highlight steps require a selector.')
        actions.push({ type: 'highlight', selector, label: step.label ? String(step.label) : undefined })
      } else if (action === 'click') {
        if (!selector) throw new SkillError('missing_selector', 'Click steps require a selector.')
        if (/submit|send|save|mark-complete|ticket-status-|ticket-priority-|ticket-assignee/i.test(selector)) {
          throw new SkillError(
            'unsafe_ui_click',
            'That control must not be clicked by the guided UI workflow.',
            'Use the authoritative API tool for mutations, or highlight the human-confirmation control instead.',
          )
        }
        actions.push({ type: 'click', selector })
      } else if (action === 'fill') {
        if (!selector) throw new SkillError('missing_selector', 'Fill steps require a selector.')
        actions.push({ type: 'fill', selector, value: String(step.value || ''), fast: String(step.value || '').length > 120 })
      } else if (action === 'wait') {
        actions.push({ type: 'wait', ms: Math.min(Math.max(Number(step.ms) || 650, 100), 3000) })
      } else if (action === 'toast') {
        actions.push({ type: 'toast', message: String(step.value || 'Step complete'), variant: 'success' })
      }
    }

    if (actions.length === 0) throw new SkillError('invalid_ui_steps', 'No supported visible workflow steps were provided.')
    return ui('sequence', { actions })
  },
}

export function uiSkills(): Skill[] {
  return [navigate, click, fillForm, fill, select, highlight, wait, toast, refresh, showSteps]
}
