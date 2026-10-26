import { expect, test } from 'claude-code/testing'

import { extractFacts, renderFacts } from '../hooks/facts'

const use = (tool: string, input: Record<string, unknown>) => ({ tool_use_id: `${tool}-1`, tool, input })

test('facts: files, skills, commands, links and tools are read from the transcript', async () => {
  const facts = extractFacts([
    { role: 'user', text: '<command-name>/helper-desk</command-name> see https://example.com/a.', toolUses: [] },
    {
      role: 'assistant',
      text: 'Reading.',
      toolUses: [
        use('Read', { file_path: 'a.md' }),
        use('Edit', { file_path: 'a.md' }),
        use('Write', { file_path: 'b.md' }),
        use('Skill', { skill: 'plugin-authoring' }),
        use('WebFetch', { url: 'https://example.com/b' }),
        use('Bash', { command: 'git status\nls' }),
        use('mcp__x__y', {}),
      ],
    },
  ])

  expect(facts.files.map(f => f.path)).toEqual(['b.md', 'a.md'])
  expect(facts.files.find(f => f.path === 'a.md')).toEqual({ path: 'a.md', reads: 1, edits: 1, writes: 0 })
  expect(facts.skills).toEqual(['plugin-authoring'])
  expect(facts.commands).toEqual(['/helper-desk'])
  expect(facts.links).toEqual(['https://example.com/a', 'https://example.com/b'])
  expect(facts.bash).toEqual(['git status'])
  expect(facts.userTurns).toBe(1)

  const text = renderFacts(facts)

  expect(text).toContain('`b.md` (created or overwritten 1x)')
  expect(text).toContain('MCP: mcp__x__y x1')
})
