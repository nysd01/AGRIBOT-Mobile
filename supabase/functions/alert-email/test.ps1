# AGRIBOT Alert Email — Quick Test
# Run this in PowerShell after deploying the edge function.
#
# Replace these two values:
$SUPABASE_URL  = "https://YOUR_PROJECT_REF.supabase.co"   # your Supabase project URL
$SUPABASE_ANON = "YOUR_ANON_KEY"                           # Project Settings → API → anon public
$USER_EMAIL    = "YOUR_LOGIN_EMAIL@gmail.com"               # the email you used to sign up in AGRIBOT

$body = @{
    type      = "FLAME"
    userEmail = $USER_EMAIL
    temp      = 38.5
    humidity  = 62
    moisture  = 18
    smokeRaw  = 0
    timestamp = (Get-Date -Format "o")
    lat       = 12.34567
    lng       = 7.89012
} | ConvertTo-Json

$headers = @{
    "Content-Type"  = "application/json"
    "Authorization" = "Bearer $SUPABASE_ANON"
}

Write-Host "Sending test FIRE ALERT email to $USER_EMAIL ..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod `
        -Uri     "$SUPABASE_URL/functions/v1/alert-email" `
        -Method  POST `
        -Headers $headers `
        -Body    $body

    Write-Host "SUCCESS! Email sent. ID: $($response.id)" -ForegroundColor Green
    Write-Host "Check your inbox at $USER_EMAIL" -ForegroundColor Cyan
}
catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    Write-Host "Check: Supabase → Edge Functions → alert-email → Logs" -ForegroundColor Yellow
}
