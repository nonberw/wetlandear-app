# Adds the Anthropic API key to Vercel (production) and redeploys.
# 1) Copy the key to the clipboard (select it, Ctrl+C).  2) Run:
#   powershell -ExecutionPolicy Bypass -File scripts\add-anthropic-key.ps1
# The key is read from the clipboard, sent to Vercel through stdin, and the clipboard is cleared afterwards. Nothing is saved on disk or in git.
$ErrorActionPreference = 'Stop'
$scope = '345s-projects-86bfc55a'
Set-Location (Join-Path $PSScriptRoot '..')
$key = ''
try { $key = (Get-Clipboard -Raw).Trim() } catch { }
if (-not $key) { throw 'The clipboard is empty. Copy the Anthropic key first (Ctrl+C), then run this again.' }
if (-not $key.StartsWith('sk-ant-')) { throw 'The clipboard does not contain an Anthropic key (it should start with sk-ant-). Copy the key and run again.' }
Write-Host ('Key found in the clipboard: ' + $key.Substring(0, 12) + '...  length ' + $key.Length)
& npx --yes vercel env rm ANTHROPIC_API_KEY production --yes --scope $scope 2>$null | Out-Null
$key | & npx --yes vercel env add ANTHROPIC_API_KEY production --scope $scope | Out-Null
$key = $null
Set-Clipboard -Value ' '
Write-Host 'Key saved, clipboard cleared. Deploying (about a minute)...'
& npx --yes vercel deploy --prod --yes --scope $scope | Out-Null
Write-Host 'Done. Open the app -> Journal -> Ask the journal.'
