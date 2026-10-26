# Cache Clock

A Claude Code mod that shows when this chat's prompt cache goes cold, and can keep it warm.

Returning to a chat after its cache has gone cold makes Claude reread and re-save the whole conversation at full price. On a long Opus chat that is the difference between roughly a dollar or more and a few cents. The timer is invisible, so this mod draws it above the prompt.

Inspired by Karan Binsal's "cache tax" mod. Credit and thanks to Karan Binsal for the idea.

## What it does

- **Countdown.** When Claude finishes a reply, a countdown above the prompt shows how long the cache stays warm. It restarts after every reply.
- **Lifetime from the API.** The length is read from the cache fields of Anthropic's own reply (`cache_creation.ephemeral_<n>m|h_input_tokens`), so it differs by itself between a Claude subscription (about 1 hour) and an API key (about 5 minutes). Nothing is hardcoded or configured. Until a reply shows a lifetime, no countdown is drawn.
- **Counted from the request.** The clock starts when the last request that used the cache started, not when the reply finished, so a long reply does not make the timer optimistic.
- **Keep warm.** The `Keep warm` button, or `/keep warm`, sends a small hidden message shortly before the cache runs out (the reply is not added to the chat). It reads the whole chat from cache, which refreshes the timer, and repeats each cycle. It stops when you send your next message, after 2 hours, or when you press `Stop` or type `/keep off`. It never pings while it is off, and never after the cache has already gone cold.

## Commands

- `/keep warm` switches keep warm on, `/keep off` switches it off.
- `/keep-warm` toggles it.

## Notes

- Claude Code only. Written as a mod for the Claude Code interface.
- The countdown sits in the band above the prompt box.

## Install

```
/plugin install cache-clock --marketplace FCisco95/claude-code-mods
```

Or copy `plugins/cache-clock` to `~/.claude/skills/cache-clock` (see the [repo README](../../README.md)).
