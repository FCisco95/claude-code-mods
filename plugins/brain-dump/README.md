# Brain-Dump

A Claude Code mod that turns a long, messy prompt into a clear one before it is sent.

When you submit a prompt over 120 words from the prompt box, the mod holds it back, asks 2 to 3 short questions about the gaps, then fills the prompt box with a four-part prompt: the job, why, guardrails, and what done means. You read it, edit it and press Enter yourself.

## Behaviour

- **Hold.** Only prompts typed in the prompt box and over 120 words. Short prompts, slash commands and prompts sent by other mods pass through untouched.
- **Bypass.** Start a prompt with `!!` to send it exactly as written.
- **No loop.** A prompt that already has the four headings is not refined again.
- **Cost.** One small model call to read the gaps and one to write the result, on the `sonnet` tier. Both are only made for long prompts.

## Tuning

`MIN_WORDS`, `BYPASS` and `MODEL` are constants at the top of `hooks/register.ts`.

## Install

```
/plugin install brain-dump --marketplace FCisco95/claude-code-mods
```

Or copy `plugins/brain-dump` to `~/.claude/skills/brain-dump` (see the [repo README](../../README.md)).
