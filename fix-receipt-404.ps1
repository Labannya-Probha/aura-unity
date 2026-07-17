$ErrorActionPreference = "Stop"

Write-Host "Aura Unity receipt 404 fix started..." -ForegroundColor Cyan

$repo = Get-Location
$receiptPrint = Join-Path $repo "assets/js/print/receiptPrint.js"
$receivables = Join-Path $repo "assets/js/modules/receivables/receivables.js"

if (-not (Test-Path $receiptPrint)) { throw "Missing file: $receiptPrint" }
if (-not (Test-Path $receivables)) { throw "Missing file: $receivables" }

Copy-Item $receiptPrint "$receiptPrint.before-receipt-path-fix.bak" -Force
Copy-Item $receivables "$receivables.before-receipt-path-fix.bak" -Force

$receiptContent = Get-Content $receiptPrint -Raw
$receiptContent = $receiptContent.Replace(
  'const url = `money-receipt.html?',
  'const url = `${window.location.origin}/money-receipt.html?'
)
$receiptContent = $receiptContent.Replace(
  'window.open(`money-receipt.html?',
  'window.open(`${window.location.origin}/money-receipt.html?'
)
Set-Content -Path $receiptPrint -Value $receiptContent -Encoding UTF8

$arContent = Get-Content $receivables -Raw
$arContent = $arContent.Replace(
  'window.open(`money-receipt.html?',
  'window.open(`${window.location.origin}/money-receipt.html?'
)
Set-Content -Path $receivables -Value $arContent -Encoding UTF8

Write-Host "Fix completed." -ForegroundColor Green
Write-Host "Run the git commands listed in README.md."
