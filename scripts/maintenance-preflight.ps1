param(
  [switch]$Repair
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$failures = [System.Collections.Generic.List[string]]::new()
$notes = [System.Collections.Generic.List[string]]::new()
$passed = 0

function Add-Check {
  param([bool]$Condition, [string]$Label, [string]$Detail = '')
  if ($Condition) {
    $script:passed += 1
    return
  }
  $script:failures.Add($(if ($Detail) { "${Label}: ${Detail}" } else { $Label }))
}

function Invoke-Captured {
  param([string]$FilePath, [string[]]$Arguments)
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $FilePath @Arguments 2>&1
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = @($output) }
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }
}

Set-Location -LiteralPath $projectRoot
$versionProbeScript = @'
const pkg = require('./package.json');
const lock = require('./package-lock.json');
console.log(JSON.stringify({ version: pkg.version, themeVersion: pkg.themeVersion, engine: pkg.engines.node, lockVersion: lock.version, lockRootVersion: lock.packages[''].version }));
'@
$versionInfo = (& node.exe -e $versionProbeScript) | ConvertFrom-Json

Add-Check ($projectRoot -ieq 'F:\APSproject\Theme') 'workspace path' $projectRoot

$nodeVersion = (& node -p "process.versions.node").Trim()
$nodeParts = $nodeVersion.Split('.') | ForEach-Object { [int]$_ }
$nodeSupported = $nodeParts[0] -gt 22 -or ($nodeParts[0] -eq 22 -and $nodeParts[1] -ge 12) -or ($nodeParts[0] -eq 20 -and $nodeParts[1] -ge 19)
Add-Check $nodeSupported 'Node.js runtime' "found v$nodeVersion; expected $($versionInfo.engine)"
Add-Check ($versionInfo.version -eq $versionInfo.themeVersion -and $versionInfo.version -eq $versionInfo.lockVersion -and $versionInfo.version -eq $versionInfo.lockRootVersion) 'version lock alignment'

$requiredPaths = @(
  'AGENTS.md',
  'memory\00_INDEX.md',
  'memory\10_current_state\theme_status.md',
  'memory\30_runbooks\theme_maintenance.md',
  'komari-theme.json',
  'src\utils\nodeResponse.ts',
  'scripts\test-node-compat.mjs',
  'scripts\smoke-komari-1.2.5.mjs'
)
Add-Check (-not ($requiredPaths | Where-Object { -not (Test-Path -LiteralPath (Join-Path $projectRoot $_)) })) 'maintenance truth files'

if ($Repair -and -not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\.package-lock.json'))) {
  Write-Host '[prepare] Restoring npm dependencies from package-lock.json...'
  & npm.cmd install --prefer-offline --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { $failures.Add('npm dependency restore failed') }
}

$npmTree = Invoke-Captured 'npm.cmd' @('ls', '--depth=0', '--silent')
Add-Check ($npmTree.ExitCode -eq 0) 'npm dependency tree' $($npmTree.Output | Select-Object -Last 1)

$browserProbeScript = @'
const { chromium, firefox, webkit } = require('playwright');
const fs = require('node:fs');
for (const [name, browser] of Object.entries({ chromium, firefox, webkit }))
  console.log(`${name}=${fs.existsSync(browser.executablePath()) ? 'ready' : 'missing'}`);
'@
$browserProbe = Invoke-Captured 'node.exe' @('-e', $browserProbeScript)
$missingPlaywright = @($browserProbe.Output | Where-Object { $_ -match '^(chromium|firefox|webkit)=missing$' } | ForEach-Object { ($_ -split '=')[0] })
if ($Repair -and ($browserProbe.ExitCode -ne 0 -or $missingPlaywright.Count -gt 0)) {
  Write-Host "[prepare] Installing Playwright browser engines..."
  & npx.cmd playwright install chromium firefox webkit
  if ($LASTEXITCODE -ne 0) { $failures.Add('Playwright browser installation failed') }
  $browserProbe = Invoke-Captured 'node.exe' @('-e', $browserProbeScript)
  $missingPlaywright = @($browserProbe.Output | Where-Object { $_ -match '^(chromium|firefox|webkit)=missing$' } | ForEach-Object { ($_ -split '=')[0] })
}
Add-Check ($browserProbe.ExitCode -eq 0 -and $missingPlaywright.Count -eq 0) 'Playwright browser engines' ($missingPlaywright -join ', ')

$systemBrowsers = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
)
Add-Check ([bool]($systemBrowsers | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1)) 'system Chrome or Edge'

$busyPorts = @(@(4179, 4180) | Where-Object { Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue })
Add-Check ($busyPorts.Count -eq 0) 'fixture ports' "in use: $($busyPorts -join ', ')"

$drive = [System.IO.DriveInfo]::new('F:\')
$freeGiB = [double]$drive.AvailableFreeSpace / 1GB
Add-Check ($freeGiB -ge 2) 'workspace free disk' ("{0:N1} GiB" -f $freeGiB)

$gitRoot = Invoke-Captured 'git.exe' @('rev-parse', '--show-toplevel')
Add-Check ($gitRoot.ExitCode -eq 0 -and [System.IO.Path]::GetFullPath([string]$gitRoot.Output[0]) -ieq $projectRoot) 'Git worktree root'
$envTracked = Invoke-Captured 'git.exe' @('ls-files', '--error-unmatch', '.env')
Add-Check ($envTracked.ExitCode -ne 0) 'local .env exclusion'

& git.exe diff --quiet -- src/utils/nodeResponse.ts
if ($LASTEXITCODE -ne 0) { $notes.Add('src/utils/nodeResponse.ts has local changes; treat the next task as compatibility-critical.') }

$status = Invoke-Captured 'git.exe' @('status', '--porcelain')
Add-Check ($status.ExitCode -eq 0) 'Git status command'
$changedCount = @($status.Output | Where-Object { $_ }).Count
$notes.Add($(if ($changedCount -eq 0) { 'Git worktree is clean.' } else { "Git worktree already contains $changedCount changed paths; preserve this candidate work." }))

$transient = @('dist', 'tmp', 'test-results', 'playwright-report') | Where-Object { Test-Path -LiteralPath (Join-Path $projectRoot $_) }
if ($transient) { $notes.Add("Transient paths present: $($transient -join ', ').") }

if ($failures.Count -gt 0) {
  Write-Error "Maintenance preflight failed ($($failures.Count)):`n- $($failures -join "`n- ")"
  exit 1
}

Write-Host "Maintenance environment ready: $passed checks passed."
$notes | ForEach-Object { Write-Host "- $_" }
