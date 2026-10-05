<#
.SYNOPSIS
    Step 07 - Open network access to the database (connectivity phase).

.DESCRIPTION
    This is the ONLY step that exposes PostgreSQL beyond localhost. Run it
    standalone when you are ready to connect the application:

        .\07-network.ps1 -SuperPassword '<pw>' -AllowedCidr '10.20.30.0/24'
        .\07-network.ps1 -SuperPassword '<pw>' -AllowedCidr '10.1.1.5,10.1.1.6'   # individual k8s node IPs

    It performs, atomically per re-run:
      - ALTER SYSTEM SET listen_addresses = '*'
      - a managed pg_hba.conf rule (hostssl if TLS is configured, host
        otherwise) restricted to the app database, app role, and CIDR
      - a Windows Firewall inbound rule for the port, scoped to the CIDR
      - a service restart (unless -NoRestart)

    Re-running with a different CIDR updates the managed rule and firewall
    scope rather than stacking rules.

    Exit code 0 on success, 1 on failure.
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "")]
[CmdletBinding()]
param(
    [string]$PgVersion = "18",
    # Auto-detected from the service registration when omitted.
    [string]$DataDir,
    [int]$Port = 5432,
    [Parameter(Mandatory = $true)][string]$SuperPassword,
    [Parameter(Mandatory = $true)][string]$AllowedCidr,
    [string]$AppDbName = "ep",
    [string]$AppRole = "ep_app",
    [string]$PgBin,
    [switch]$NoRestart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path (Split-Path -Parent $PSScriptRoot) "lib/common.ps1")

try {
    Write-Step "[07] Network access"

    $cidrs = @($AllowedCidr -split '\s*,\s*' | Where-Object { $_ })
    foreach ($c in $cidrs) {
        if ($c -notmatch '^\d{1,3}(\.\d{1,3}){3}(/\d{1,2})?$') {
            throw "-AllowedCidr entry '$c' is not a valid IPv4 address or CIDR (expected e.g. 10.20.30.0/24 or 10.1.1.5,10.1.1.6)."
        }
    }

    $ctx = Get-PgContext -PgVersion $PgVersion
    if (-not $PgBin) { $PgBin = $ctx.PgBin }
    if (-not $DataDir) { $DataDir = Get-PgDataDir -PgVersion $PgVersion }

    # 1. Listen on all interfaces; pg_hba + firewall constrain who gets in.
    Invoke-Psql -PgBin $PgBin -Port $Port -Password $SuperPassword -Sql "ALTER SYSTEM SET listen_addresses = '*';" | Out-Null
    Write-Host "    listen_addresses = *"

    # 2. pg_hba.conf managed rule.
    $hbaPath = Join-Path $DataDir "pg_hba.conf"
    if (-not (Test-Path $hbaPath)) {
        throw "pg_hba.conf not found at '$hbaPath'. Is -DataDir correct?"
    }
    $connType = if (Test-SslConfigured -DataDir $DataDir) { "hostssl" } else { "host" }
    $rules = @($cidrs | ForEach-Object { "{0,-8}{1,-16}{2,-16}{3,-24}scram-sha-256" -f $connType, $AppDbName, $AppRole, $_ })
    $marker = "# ep-app network access (managed by provision scripts)"
    $endMarker = "# end ep-app network access"

    # Drop any previously managed block (legacy single-line or delimited), then append the current one.
    $existing = @(Get-Content $hbaPath)
    $kept = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -lt $existing.Count; $i++) {
        if ($existing[$i] -eq $marker) {
            $j = [array]::IndexOf($existing, $endMarker, $i)
            $i = if ($j -ge 0) { $j } else { $i + 1 }
            continue
        }
        $kept.Add($existing[$i])
    }
    while ($kept.Count -gt 0 -and $kept[$kept.Count - 1] -eq "") { $kept.RemoveAt($kept.Count - 1) }
    $kept.Add(""); $kept.Add($marker); $rules | ForEach-Object { $kept.Add($_) }; $kept.Add($endMarker)
    Set-Content -Path $hbaPath -Value $kept -Encoding ascii
    $rules | ForEach-Object { Write-Host "    pg_hba rule: $_" }

    # 3. Windows Firewall rule scoped to the CIDRs.
    $ruleName = "PostgreSQL $Port (ep app)"
    $fwRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($fwRule) {
        Set-NetFirewallRule -DisplayName $ruleName -RemoteAddress $cidrs
        Write-Host "    Updated firewall rule '$ruleName' -> remote address $($cidrs -join ', ')."
    }
    else {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
            -Protocol TCP -LocalPort $Port -RemoteAddress $cidrs -Profile Domain, Private | Out-Null
        Write-Host "    Created inbound firewall rule '$ruleName' for TCP $Port from $($cidrs -join ', ')."
    }

    # 4. Restart to apply listen_addresses (and pick up pg_hba changes).
    if ($NoRestart) {
        Write-Host "    -NoRestart given: restart service '$($ctx.ServiceName)' manually to apply."
    }
    else {
        Write-Host "    Restarting '$($ctx.ServiceName)'..."
        Restart-Service -Name $ctx.ServiceName -Force
        Wait-PostgresReady -PgBin $PgBin -Port $Port
        Write-Host "    Service restarted."
    }

    $sslMode = if ($connType -eq "hostssl") { "require" } else { "disable" }
    Write-Host ""
    Write-Host "    Connection string for the app:"
    Write-Host "    postgresql://${AppRole}:<password>@$($env:COMPUTERNAME):$Port/$AppDbName`?sslmode=$sslMode"
    exit 0
}
catch {
    Write-Host "STEP FAILED [07-network]: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
