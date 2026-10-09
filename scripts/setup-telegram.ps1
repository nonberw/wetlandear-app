# One-time setup for the Telegram morning report. Run it yourself in PowerShell from the app folder:
#   powershell -ExecutionPolicy Bypass -File scripts\setup-telegram.ps1
# It asks for two secrets (typed hidden), stores them in Vercel, registers the Telegram webhook and redeploys.
# Nothing is written to disk or to git. You need: the bot token from @BotFather and the Supabase secret key
# (Supabase -> Project Settings -> API Keys -> Secret keys -> "default" -> Reveal/copy).

$ErrorActionPreference = 'Stop'
$scope = '345s-projects-86bfc55a'
$domain = 'https://app.wetlandear.tech'

function Read-Secret($prompt) {
  $s = Read-Host $prompt -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
function Rand($n) { $bytes = New-Object byte[] $n; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); ([BitConverter]::ToString($bytes) -replace '-', '').ToLower() }
function Set-VercelEnv($name, $value) {
  # remove the old value if any, then add (production). The value goes through stdin, not the command line.
  & npx --yes vercel env rm $name production --yes --scope $scope 2>$null | Out-Null
  $value | & npx --yes vercel env add $name production --scope $scope | Out-Null
  Write-Host "  set $name"
}

Write-Host 'Bot username (public, without @, e.g. wetlandear_bot):'
$bot = Read-Host
$token = Read-Secret 'Telegram bot token (hidden)'
$sbKey = Read-Secret 'Supabase secret key (hidden)'
if (-not $token -or -not $sbKey -or -not $bot) { throw 'All three values are required.' }

$webhookSecret = Rand 24
$cronSecret = Rand 24
Write-Host 'Saving settings in Vercel...'
Set-VercelEnv 'TELEGRAM_BOT_TOKEN' $token
Set-VercelEnv 'SUPABASE_SECRET_KEY' $sbKey
Set-VercelEnv 'TELEGRAM_WEBHOOK_SECRET' $webhookSecret
Set-VercelEnv 'CRON_SECRET' $cronSecret

Write-Host 'Writing the bot username into js/config.js...'
Set-Content -Encoding UTF8 -Path (Join-Path $PSScriptRoot '..\js\config.js') -Value "/* Public settings. The Telegram bot username is public (it is in every t.me link); the bot token is a secret and lives only in Vercel. */`nwindow.WE_CONFIG = { telegramBot: '$bot' };"

Write-Host 'Deploying...'
Push-Location (Join-Path $PSScriptRoot '..')
& npx --yes vercel deploy --prod --yes --scope $scope | Out-Null
Pop-Location

Write-Host 'Registering the Telegram webhook...'
$body = @{ url = "$domain/api/telegram"; secret_token = $webhookSecret; allowed_updates = @('message') } | ConvertTo-Json
$r = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/setWebhook" -ContentType 'application/json' -Body $body
Write-Host ("Webhook: " + ($r | ConvertTo-Json -Compress))
Write-Host 'Done. Commit the js/config.js change so it stays: git add js/config.js; git commit -m "Set Telegram bot username"; git push'
