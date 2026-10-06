# ==============================================================================
# Script di avvio per il tunnel ngrok (RoR - Rider On Road)
# ==============================================================================
[CmdletBinding()]
param(
    [switch]$Stop
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

if ($Stop) {
    Write-Host "[INFO] Arresto del container ngrok..." -ForegroundColor Yellow
    docker compose stop ngrok
    Write-Host "[OK] Container ngrok fermato." -ForegroundColor Green
    exit 0
}

# 1. Verifica esistenza file .env
$EnvFile = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Host "[ERRORE] File .env non trovato!" -ForegroundColor Red
    Write-Host "Copia .env.example in .env ed imposta le variabili necessarie:"
    Write-Host "  Copy-Item .env.example .env" -ForegroundColor Gray
    exit 1
}

# 2. Verifica NGROK_AUTHTOKEN
$AuthtokenLine = Get-Content $EnvFile | Where-Object { $_ -match '^\s*NGROK_AUTHTOKEN\s*=\s*(.+)$' }
if (-not $AuthtokenLine -or $AuthtokenLine.Trim() -eq "") {
    Write-Host "[ERRORE] NGROK_AUTHTOKEN non impostato in .env!" -ForegroundColor Red
    Write-Host "1. Registrati gratuitamente su: https://dashboard.ngrok.com"
    Write-Host "2. Copia il tuo authtoken da: https://dashboard.ngrok.com/get-started/your-authtoken"
    Write-Host "3. Incollalo nel file .env alla riga NGROK_AUTHTOKEN=<tuo-token>"
    exit 1
}

# 3. Avvio del servizio ngrok
Write-Host "[INFO] Avvio del servizio ngrok tramite Docker Compose..." -ForegroundColor Cyan
docker compose up -d ngrok

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERRORE] Impossibile avviare il container ngrok." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 4. Attesa inizializzazione tunnel e recupero URL pubblico
Write-Host "[INFO] In attesa che il tunnel sia attivo..." -ForegroundColor Yellow
$maxAttempts = 15
$attempt = 0
$publicUrl = $null

while ($attempt -lt $maxAttempts -and -not $publicUrl) {
    Start-Sleep -Seconds 1
    $attempt++
    try {
        $tunnels = (Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2).tunnels
        if ($tunnels -and $tunnels.Count -gt 0) {
            $publicUrl = $tunnels[0].public_url
        }
    } catch {
        # Continua ad attendere che ngrok apra la porta 4040
    }
}

if ($publicUrl) {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "  🚀 TUNNEL NGROK ATTIVO CON SUCCESSO!" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "  Indirizzo pubblico: " -NoNewline
    Write-Host $publicUrl -ForegroundColor Cyan
    Write-Host "  Dashboard traffico: " -NoNewline
    Write-Host "http://localhost:4040" -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "Apri questo URL dallo smartphone per testare la traccia GPS!" -ForegroundColor White
    Write-Host "Per fermare il tunnel: .\scripts\start_ngrok.ps1 -Stop" -ForegroundColor Gray
} else {
    Write-Host "[AVVISO] Il container ngrok e' avviato, ma non e' stato possibile ricavare l'URL automaticamente." -ForegroundColor Yellow
    Write-Host "Controlla i log con: docker compose logs -f ngrok" -ForegroundColor Gray
    Write-Host "Oppure visita: http://localhost:4040" -ForegroundColor Gray
}
