# Copies the mods into ~/.claude/skills, where Claude Code loads them in every project.
# Usage: ./install.ps1 [mod ...]   (no arguments installs all four)
param([string[]]$Mods = @('brain-dump', 'cache-clock', 'chat-handoff', 'helper-desk'))
$ErrorActionPreference = 'Stop'
$root = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
$dest = Join-Path $root 'skills'
New-Item -ItemType Directory -Force $dest | Out-Null
foreach ($m in $Mods) {
  $src = Join-Path $PSScriptRoot "plugins/$m"
  if (-not (Test-Path $src)) { throw "unknown mod: $m" }
  $target = Join-Path $dest $m
  if (Test-Path $target) { Remove-Item -Recurse -Force $target }
  Copy-Item -Recurse $src $target
  Write-Host "installed $m -> $target"
}
Write-Host 'Start a new Claude Code session to load them.'
