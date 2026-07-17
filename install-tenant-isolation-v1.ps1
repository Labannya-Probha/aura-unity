$ErrorActionPreference = "Stop"
$repo = Get-Location

$foundation = Join-Path $repo "assets/js/utils/foundation.js"
if (-not (Test-Path $foundation)) {
  throw "Run this script from the Aura Unity project root. Missing: $foundation"
}

Copy-Item $foundation "$foundation.before-tenant-isolation-v1.bak" -Force
$content = Get-Content $foundation -Raw

# Remove production organisation branding from global fallback state.
$content = $content.Replace(
  'company: { name:"Challengers of 90''s", sub:"Non Profit Krira Songothon ERP", address:"Victoria School Field, Sreemangal", phone:"01XXXXXXXXX", logo:"" }',
  'company: { name:"Aura Unity Demo", sub:"Enterprise Accounting Sandbox", address:"", phone:"", logo:"" }'
)

Set-Content $foundation $content -Encoding UTF8

# Copy migration into repository.
$sourceMigration = Join-Path $PSScriptRoot "..\supabase\migrations\20260717120000_tenant_isolation_v1.sql"
$targetMigration = Join-Path $repo "supabase\migrations\20260717120000_tenant_isolation_v1.sql"
Copy-Item $sourceMigration $targetMigration -Force

Write-Host "Tenant Isolation v1 files installed." -ForegroundColor Green
Write-Host "Next: run the SQL migration in Supabase SQL Editor, then commit and deploy." -ForegroundColor Yellow
