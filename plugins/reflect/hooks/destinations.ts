// WHERE A SAVED RULE GOES. This is the file to change.
//
// Each destination is one entry in DESTINATIONS: a button label, whether it is offered, and a `save` that
// writes the rule and returns a short "where" for the confirmation. The band builds its buttons from this
// list, so a new entry shows up by itself.
//
// To send rules somewhere else (say, into a skill's SKILL.md), add an entry here, or ask Claude:
// "change Reflect so Save everywhere appends to the rules section of my <name> skill".

export type Io = {
  home: string
  root: string
  today: string
  read: (path: string) => Promise<string | null>
  write: (path: string, text: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
}

export type Config = {
  // Empty means ~/.claude/rules/reflect.md, a file only Reflect writes, which Claude Code loads in every project.
  rulesFile: string
  // Empty means no vault: the vault button is not offered.
  vaultFolder: string
}

export type Destination = {
  id: string
  label: string
  isAvailable: (config: Config) => boolean
  save: (io: Io, rule: string, config: Config) => Promise<string>
}

const START = '<!-- reflect:start -->'
const END = '<!-- reflect:end -->'
const HEADING = '## Rules saved with Reflect'

const clean = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '')
const expand = (path: string, home: string) => clean(path.startsWith('~') ? `${home}${path.slice(1)}` : path)

export const ruleSlug = (rule: string) => {
  const ascii = rule.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const words = ascii.replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
  let slug = ''

  for (const word of words) {
    if (`${slug}-${word}`.length > 48 && slug) {
      break
    }

    slug = slug ? `${slug}-${word}` : word
  }

  return slug || 'rule'
}

// Adds the rule as a bullet inside a marked block, making the block at the end of the file when it is missing.
export const addToBlock = (content: string, rule: string) => {
  const nl = content.includes('\r\n') ? '\r\n' : '\n'
  const bullet = `- ${rule}`

  if (content.split(/\r?\n/).some(line => line.trim() === bullet)) {
    return { text: content, isNew: false }
  }

  const start = content.indexOf(START)
  const end = content.indexOf(END)

  if (start !== -1 && end > start) {
    const before = content.slice(0, end).replace(/\s+$/, '')

    return { text: `${before}${nl}${bullet}${nl}${content.slice(end)}`, isNew: true }
  }

  const base = content.replace(/\s+$/, '')
  const block = [HEADING, '', START, bullet, END].join(nl)

  return { text: `${base}${base ? nl + nl : ''}${block}${nl}`, isNew: true }
}

const everywhere: Destination = {
  id: 'everywhere',
  label: 'Save everywhere',
  isAvailable: () => true,
  save: async (io, rule, config) => {
    const path = config.rulesFile.trim() ? expand(config.rulesFile.trim(), io.home) : `${io.home}/.claude/rules/reflect.md`
    const added = addToBlock((await io.read(path)) ?? '', rule)

    if (added.isNew) {
      await io.write(path, added.text)
    }

    return added.isNew ? path : `${path} (already there)`
  },
}

// Claude Code's own auto memory for this project: one file per rule plus a line in MEMORY.md.
const memory: Destination = {
  id: 'memory',
  label: 'Save to memory',
  isAvailable: () => true,
  save: async (io, rule) => {
    const dir = `${io.home}/.claude/projects/${io.root.replace(/[^A-Za-z0-9]/g, '-')}/memory`
    const slug = ruleSlug(rule)
    const file = `feedback_${slug}.md`
    const path = `${dir}/${file}`

    if (await io.exists(path)) {
      return `${path} (already there)`
    }

    const body = ['---', `name: ${slug}`, `description: ${JSON.stringify(rule)}`, 'metadata:', '  type: feedback', '---', '', rule, ''].join('\n')

    await io.write(path, body)

    const indexPath = `${dir}/MEMORY.md`
    const index = ((await io.read(indexPath)) ?? '').replace(/\s+$/, '')
    const title = (rule.length > 60 ? `${rule.slice(0, 57)}...` : rule).replace(/[[\]]/g, '')

    await io.write(indexPath, `${index}${index ? '\n' : ''}- [${title}](${file}) — rule saved ${io.today}\n`)

    return path
  },
}

// One note per rule in the folder the user set.
const vault: Destination = {
  id: 'vault',
  label: 'Save to vault',
  isAvailable: config => config.vaultFolder.trim() !== '',
  save: async (io, rule, config) => {
    const folder = expand(config.vaultFolder.trim(), io.home)
    const slug = ruleSlug(rule)
    let path = `${folder}/${slug}.md`

    for (let n = 2; (await io.exists(path)) && n < 50; n += 1) {
      path = `${folder}/${slug}-${n}.md`
    }

    await io.write(path, ['---', `summary: ${JSON.stringify(rule)}`, `created: ${io.today}`, '---', '', rule, ''].join('\n'))

    return path
  },
}

export const DESTINATIONS: Destination[] = [everywhere, memory, vault]
