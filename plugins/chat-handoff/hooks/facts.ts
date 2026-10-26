import type { SessionMessage } from 'claude-code'

// What the chat touched, read from the transcript itself (not left to the model's memory): files, skills,
// slash commands, tools, links and shell commands. The handoff prompt carries this as its appendix.
export type Facts = {
  files: { path: string; reads: number; edits: number; writes: number }[]
  skills: string[]
  commands: string[]
  tools: { name: string; count: number }[]
  agents: string[]
  searches: string[]
  links: string[]
  bash: string[]
  userTurns: number
}

const URL_RE = /https?:\/\/[^\s)"'<>\]`}\\]+/g
const COMMAND_RE = /<command-name>\/?([^<\s]+)<\/command-name>/g
const MAX_LINKS = 80
const MAX_BASH = 30
const MAX_FILES = 120

const asString = (v: unknown) => (typeof v === 'string' ? v : '')

const cleanUrl = (u: string) => u.replace(/[.,;:!?]+$/, '')

const addUnique = (list: string[], value: string) => {
  if (value && !list.includes(value)) {
    list.push(value)
  }
}

export const extractFacts = (messages: readonly SessionMessage[]): Facts => {
  const files = new Map<string, { path: string; reads: number; edits: number; writes: number }>()
  const tools = new Map<string, number>()
  const skills: string[] = []
  const commands: string[] = []
  const agents: string[] = []
  const searches: string[] = []
  const links: string[] = []
  const bash: string[] = []
  let userTurns = 0

  const touch = (path: string, kind: 'reads' | 'edits' | 'writes') => {
    if (!path) {
      return
    }

    const row = files.get(path) ?? { path, reads: 0, edits: 0, writes: 0 }
    row[kind] += 1
    // Re-insert so the map ends in order of last use.
    files.delete(path)
    files.set(path, row)
  }

  const scanText = (text: string) => {
    for (const m of text.matchAll(URL_RE)) {
      addUnique(links, cleanUrl(m[0]))
    }
  }

  for (const message of messages) {
    if (message.role === 'user') {
      if (message.text && !message.toolResults?.length) {
        userTurns += 1
      }

      for (const m of message.text.matchAll(COMMAND_RE)) {
        addUnique(commands, `/${m[1]}`)
      }
    }

    scanText(message.text)

    for (const use of message.toolUses) {
      const input = use.input ?? {}

      tools.set(use.tool, (tools.get(use.tool) ?? 0) + 1)

      switch (use.tool) {
        case 'Read':
          touch(asString(input.file_path), 'reads')
          break
        case 'Edit':
        case 'MultiEdit':
          touch(asString(input.file_path), 'edits')
          break
        case 'Write':
          touch(asString(input.file_path), 'writes')
          break
        case 'NotebookEdit':
          touch(asString(input.notebook_path), 'edits')
          break
        case 'Skill':
          addUnique(skills, [asString(input.skill), asString(input.args)].filter(Boolean).join(' '))
          break
        case 'Agent':
        case 'Task':
          addUnique(agents, asString(input.subagent_type) || 'general-purpose')
          break
        case 'WebSearch':
          addUnique(searches, asString(input.query))
          break
        case 'WebFetch':
          addUnique(links, cleanUrl(asString(input.url)))
          break
        case 'Bash':
        case 'PowerShell': {
          const command = asString(input.command).trim().split('\n')[0]?.slice(0, 200) ?? ''

          if (command) {
            const at = bash.indexOf(command)

            if (at !== -1) {
              bash.splice(at, 1)
            }

            bash.push(command)
          }

          scanText(asString(input.command))
          break
        }
        default:
          break
      }
    }
  }

  return {
    files: [...files.values()].slice(-MAX_FILES).reverse(),
    skills,
    commands,
    tools: [...tools.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    agents,
    searches,
    links: links.slice(0, MAX_LINKS),
    bash: bash.slice(-MAX_BASH).reverse(),
    userTurns,
  }
}

const bullets = (items: string[], empty: string) => (items.length ? items.map(i => `- ${i}`).join('\n') : empty)

const fileLine = (f: Facts['files'][number]) => {
  const did = [
    f.writes ? `created or overwritten ${f.writes}x` : '',
    f.edits ? `edited ${f.edits}x` : '',
    f.reads ? `read ${f.reads}x` : '',
  ]
    .filter(Boolean)
    .join(', ')

  return `\`${f.path}\` (${did})`
}

export const renderFacts = (f: Facts): string => {
  const changed = f.files.filter(x => x.writes || x.edits)
  const readOnly = f.files.filter(x => !x.writes && !x.edits)
  const mcp = f.tools.filter(t => t.name.startsWith('mcp__'))
  const builtin = f.tools.filter(t => !t.name.startsWith('mcp__'))
  const line = (t: { name: string; count: number }) => `${t.name} x${t.count}`

  return [
    '## Appendix A: files created or changed in the chat (most recent first)',
    bullets(changed.map(fileLine), '- none recorded'),
    '',
    '## Appendix B: files read only',
    bullets(readOnly.map(fileLine), '- none recorded'),
    '',
    '## Appendix C: skills and slash commands used',
    bullets([...f.skills.map(s => `skill: ${s}`), ...f.commands.map(c => `command: ${c}`)], '- none recorded'),
    '',
    '## Appendix D: tools and subagents used',
    `- built-in: ${builtin.map(line).join(', ') || 'none'}`,
    `- MCP: ${mcp.map(line).join(', ') || 'none'}`,
    `- subagents: ${f.agents.join(', ') || 'none'}`,
    '',
    '## Appendix E: links and searches',
    bullets(f.links, '- no links'),
    ...(f.searches.length ? ['', 'Web searches:', bullets(f.searches, '')] : []),
    '',
    '## Appendix F: recent shell commands (most recent first)',
    bullets(f.bash.map(c => `\`${c}\``), '- none recorded'),
  ].join('\n')
}
