# OpenCode Mobile Setup - Interactive Windows Installer
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File scripts/install.ps1
#
# Discovers your values, generates a token + ntfy topic, installs the plugin,
# sets env vars, adds a firewall rule, and (optionally) enables Tailscale Funnel.
# Safe to re-run.

$ErrorActionPreference = "Stop"
function Info($m){ Write-Host $m -ForegroundColor Cyan }
function Ok($m){ Write-Host "  $m" -ForegroundColor Green }
function Warn($m){ Write-Host "  $m" -ForegroundColor Yellow }

$RepoRoot   = Split-Path -Parent $PSScriptRoot
$PluginSrc  = Join-Path $RepoRoot "plugin\mobile-proxy.js"
$PluginDir  = "$env:USERPROFILE\.config\opencode\plugins"
$PluginDst  = Join-Path $PluginDir "mobile-proxy.js"
$NodeExe    = (Get-Command node -ErrorAction SilentlyContinue).Source
$TailExe    = "C:\Program Files\Tailscale\tailscale.exe"

Info "=== OpenCode Mobile Setup (Windows) ==="

# 0. Prereqs
if (-not $NodeExe) { Warn "Node.js not found - install from https://nodejs.org then re-run."; exit 1 }
if (-not (Test-Path $PluginSrc)) { Warn "plugin\mobile-proxy.js not found. Run from the repo root."; exit 1 }

# 1. Install plugin
Info "[1/7] Installing plugin..."
New-Item -ItemType Directory -Path $PluginDir -Force | Out-Null
Copy-Item $PluginSrc $PluginDst -Force
Ok "Copied to $PluginDst"

# 2. Pick a port
Info "[2/7] Proxy port"
$port = Read-Host "  Proxy port [47800]"
if (-not $port) { $port = "47800" }

# 3. Generate secrets
Info "[3/7] Generating secrets"
$token = -join ((48..57)+(97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
$topic = "opencode-" + (-join ((48..57)+(97..122) | Get-Random -Count 16 | ForEach-Object {[char]$_}))
Ok "Access token + ntfy topic generated"

# 4. Optional force-model
Info "[4/7] Default model (optional)"
Write-Host "  The official app may send a model your server doesn't have." -ForegroundColor DarkGray
Write-Host "  To force a model, enter its provider id and model id (leave blank to skip)." -ForegroundColor DarkGray
$fprov = Read-Host "  Force provider id (e.g. anthropic) [blank=skip]"
$fmodel = ""
if ($fprov) { $fmodel = Read-Host "  Force model id (e.g. claude-3-7-sonnet-latest)" }

# 5. Notifications
Info "[5/7] Notifications"
$wantNtfy = Read-Host "  Enable ntfy push notifications? [Y/n]"
$useNtfy = ($wantNtfy -ne "n" -and $wantNtfy -ne "N")

# Set env vars
Info "Setting environment variables (User scope)..."
[Environment]::SetEnvironmentVariable("OPENCODE_MOBILE_TAILSCALE_PORT", $port, "User")
[Environment]::SetEnvironmentVariable("OPENCODE_MOBILE_ACCESS_TOKEN", $token, "User")
[Environment]::SetEnvironmentVariable("OPENCODE_MOBILE_DEBUG", "1", "User")
if ($fprov -and $fmodel) {
  [Environment]::SetEnvironmentVariable("OPENCODE_MOBILE_FORCE_PROVIDER", $fprov, "User")
  [Environment]::SetEnvironmentVariable("OPENCODE_MOBILE_FORCE_MODEL", $fmodel, "User")
}
if ($useNtfy) {
  [Environment]::SetEnvironmentVariable("OPENCODE_MOBILE_NTFY_TOPIC", $topic, "User")
  [Environment]::SetEnvironmentVariable("OPENCODE_MOBILE_NTFY_SERVER", "https://ntfy.sh", "User")
}
Ok "Env vars set"

# 6. Firewall rule
Info "[6/7] Firewall rule for port $port"
$rule = Get-NetFirewallRule -DisplayName "OpenCode Mobile $port" -ErrorAction SilentlyContinue
if ($rule) { Ok "Already exists" }
else {
  try { New-NetFirewallRule -DisplayName "OpenCode Mobile $port" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile Any -ErrorAction Stop | Out-Null; Ok "Added" }
  catch { Warn "Needs admin. Run in elevated PowerShell:"; Warn "New-NetFirewallRule -DisplayName 'OpenCode Mobile $port' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile Any" }
}

# 7. Tailscale Funnel (optional)
Info "[7/7] Remote access via Tailscale Funnel"
$tsName = ""
if (Test-Path $TailExe) {
  try { $tsName = (& $TailExe status --json 2>$null | ConvertFrom-Json).Self.DNSName.TrimEnd(".") } catch {}
  if (-not $tsName) { Warn "Tailscale not connected? Sign in, then re-run for the URL." }
  $wantFunnel = Read-Host "  Enable public HTTPS access (Tailscale Funnel)? [Y/n]"
  if ($wantFunnel -ne "n" -and $wantFunnel -ne "N") {
    & $TailExe set --accept-dns=false 2>$null | Out-Null   # keep PC DNS fast
    & $TailExe funnel --bg --https=443 "http://127.0.0.1:$port" 2>&1 | Select-Object -First 6 | ForEach-Object { Write-Host "    $_" }
  }
} else { Warn "Tailscale not found - install it for remote access. Home-Wi-Fi mode still works via LAN IP." }

# LAN IP
$lan = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -match '^(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[01]))' } | Select-Object -First 1).IPAddress

Write-Host ""
Info "=== DONE ==="
Write-Host "Restart OpenCode, then set the server URL in the OpenCode app:" -ForegroundColor White
if ($tsName) { Write-Host "  Away:  https://user:$token@$tsName" -ForegroundColor White }
if ($lan)    { Write-Host "  Home:  http://user:$token@$lan`:$port" -ForegroundColor White }
if ($useNtfy){ Write-Host "  Notifications: subscribe to topic  $topic  in the ntfy app" -ForegroundColor White }
Write-Host ""
Write-Host "Keep your token PRIVATE. Disable public access anytime:" -ForegroundColor DarkGray
Write-Host "  & '$TailExe' funnel --https=443 off" -ForegroundColor DarkGray
