# One-time setup for the Telegram morning report. You copy two secrets, the script does the rest. No typing needed:
#   1) it waits until the Telegram bot token is in the clipboard (copy it),
#   2) then it waits until the Supabase secret key (sb_secret_...) is in the clipboard (copy it),
#   3) it stores both in Vercel, registers the webhook and deploys. The clipboard is cleared at the end. Nothing is saved on disk or in git.
$ErrorActionPreference = 'Stop'
$scope = '345s-projects-86bfc55a'
$domain = 'https://app.wetlandear.tech'
Set-Location (Join-Path $PSScriptRoot '..')

function Wait-Clip($pattern, $what, $seconds) {
  Write-Host "Copy $what now (Ctrl+C on it). Waiting up to $seconds seconds..."
  $end = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $end) {
    try { $c = (Get-Clipboard -Raw).Trim() } catch { $c = '' }
    if ($c -match $pattern) { return $c }
    Start-Sleep -Milliseconds 700
  }
  throw "Timed out waiting for $what in the clipboard."
}
function Rand($n) { $bytes = New-Object byte[] $n; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); ([BitConverter]::ToString($bytes) -replace '-', '').ToLower() }
function Set-VercelEnv($name, $value) {
  & npx --yes vercel env rm $name production --yes --scope $scope 2>$null | Out-Null
  $value | & npx --yes vercel env add $name production --scope $scope | Out-Null
  Write-Host "  saved $name"
}

$token = Wait-Clip '^\d{6,12}:[A-Za-z0-9_-]{30,}$' 'the TELEGRAM BOT TOKEN (looks like 123456789:AA...)' 300
Write-Host ('Got the bot token (starts with ' + $token.Substring(0, 6) + '...).')
$me = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getMe"
$bot = $me.result.username
Write-Host "Bot: @$bot"
Set-Clipboard -Value ' '
$sbKey = Wait-Clip '^sb_secret_[A-Za-z0-9_-]{20,}$' 'the SUPABASE SECRET KEY (sb_secret_..., Supabase > Project Settings > API Keys > Secret keys)' 300
Write-Host ('Got the Supabase key (starts with ' + $sbKey.Substring(0, 14) + '...).')

$webhookSecret = Rand 24
$cronSecret = Rand 24
Write-Host 'Saving settings in Vercel...'
Set-VercelEnv 'TELEGRAM_BOT_TOKEN' $token
Set-VercelEnv 'SUPABASE_SECRET_KEY' $sbKey
Set-VercelEnv 'TELEGRAM_WEBHOOK_SECRET' $webhookSecret
Set-VercelEnv 'CRON_SECRET' $cronSecret
Set-Clipboard -Value ' '

Write-Host 'Deploying (about a minute)...'
& npx --yes vercel deploy --prod --yes --scope $scope | Out-Null

Write-Host 'Registering the Telegram webhook...'
$body = @{ url = "$domain/api/telegram"; secret_token = $webhookSecret; allowed_updates = @('message') } | ConvertTo-Json
$r = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/setWebhook" -ContentType 'application/json' -Body $body
Write-Host ('Webhook ok: ' + $r.ok + ' ' + $r.description)
Write-Host "Done. Open the app > Profile > Morning report in Telegram > Connect."
