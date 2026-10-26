#!/usr/bin/env sh
# Copies the mods into ~/.claude/skills, where Claude Code loads them in every project.
# Usage: ./install.sh [mod ...]   (no arguments installs all)
set -eu
here=$(cd "$(dirname "$0")" && pwd)
dest="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills"
mods=${*:-"brain-dump cache-clock chat-handoff helper-desk reflect chat-inventory screen-share replay-theater switchboard"}
mkdir -p "$dest"
for m in $mods; do
  [ -d "$here/plugins/$m" ] || { echo "unknown mod: $m" >&2; exit 1; }
  rm -rf "$dest/$m"
  cp -R "$here/plugins/$m" "$dest/$m"
  echo "installed $m -> $dest/$m"
done
echo "Start a new Claude Code session to load them."
