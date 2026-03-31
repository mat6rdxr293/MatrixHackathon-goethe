param(
  [string]$KeyUrl = "http://g70210t9.beget.tech/key.txt"
)

$ErrorActionPreference = "Stop"

function Set-EnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][string]$Value
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  $content = Get-Content -LiteralPath $Path -Encoding UTF8
  $updated = @()
  $found = $false

  foreach ($line in $content) {
    if ($line -match "^$([Regex]::Escape($Key))=") {
      $updated += "$Key=$Value"
      $found = $true
    } else {
      $updated += $line
    }
  }

  if (-not $found) {
    $updated += "$Key=$Value"
  }

  Set-Content -LiteralPath $Path -Value $updated -Encoding UTF8
}

try {
  $response = Invoke-WebRequest -Uri $KeyUrl -UseBasicParsing -TimeoutSec 20
  $rawKey = [string]$response.Content
  $openAiKey = $rawKey.Trim()

  if ([string]::IsNullOrWhiteSpace($openAiKey)) {
    throw "Remote key is empty"
  }

  $root = Resolve-Path (Join-Path $PSScriptRoot "..")
  $targets = @(
    (Join-Path $root "backend\.env"),
    (Join-Path $root "backend\.env.production"),
    (Join-Path $root "backend\.env.example")
  )

  foreach ($target in $targets) {
    Set-EnvValue -Path $target -Key "OPENAI_API_KEY" -Value $openAiKey
  }

  Write-Host "[OK] OpenAI key synchronized in backend env files."
  exit 0
} catch {
  Write-Host ("[WARN] Failed to sync OpenAI key: " + $_.Exception.Message)
  exit 1
}

