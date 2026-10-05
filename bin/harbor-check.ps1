# Check Harbor login and whether the account can push to a repository.
# Usage: .\harbor-check.ps1            (uses the login saved by crane auth login)
#        .\harbor-check.ps1 -Prompt    (type username/password instead)
[CmdletBinding()]
param(
    [string]$Crane,
    [string]$HarborHost = 'dpsauatdk01.intra.hkma.gov.hk:8443',
    [string]$Project = 'tois',
    [string]$Repository = 'tois/tois',
    [string]$ProxyUrl = 'http://proxy01-lb.intra.hkma.gov.hk:8080',
    [switch]$ViaProxy,
    [switch]$Prompt
)

$ErrorActionPreference = 'Stop'
$tls = [Net.SecurityProtocolType]::Tls12
# Tls13 only exists on .NET Framework 4.8+
try { $tls = $tls -bor [Net.SecurityProtocolType]'Tls13' } catch { }
try { [Net.ServicePointManager]::SecurityProtocol = $tls }
catch { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 }
# A profile-set scriptblock callback (e.g. { $true }) crashes TLS on 5.1 with "no Runspace available"
[Net.ServicePointManager]::ServerCertificateValidationCallback = $null

if (-not $Crane) {
    $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
    $Crane = Join-Path $scriptDir 'crane.exe'
}

# Proxies (same as crane-mirror.ps1: Harbor is bypassed via NO_PROXY)
$env:HTTP_PROXY  = $ProxyUrl
$env:HTTPS_PROXY = $ProxyUrl
$env:NO_PROXY    = "$($HarborHost.Split(':')[0]),localhost,127.0.0.1"

# Invoke-RestMethod on PowerShell 5.1 ignores the env vars above, so set it explicitly
$webArgs = @{}
if ($ViaProxy) {
    $webArgs.Proxy = $ProxyUrl
    Write-Host "Calling Harbor through proxy $ProxyUrl"
} elseif ($PSVersionTable.PSVersion.Major -ge 7) {
    $webArgs.NoProxy = $true
} else {
    [Net.WebRequest]::DefaultWebProxy = New-Object Net.WebProxy
}

# 1. Credentials
if ($Prompt) {
    $user = (Read-Host 'Harbor username').Trim()
    $secure = Read-Host 'Harbor password' -AsSecureString
    $pass = [Net.NetworkCredential]::new('', $secure).Password
} else {
    $saved = $HarborHost | & $Crane auth get | ConvertFrom-Json
    $user = $saved.Username
    $pass = $saved.Secret
    if (-not $user) { throw "No saved crane login for $HarborHost. Run crane auth login first, or use -Prompt." }
    Write-Host "Saved crane login for ${HarborHost}: username '$user', password length $($pass.Length)"
}

$basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${user}:${pass}"))
$headers = @{ Authorization = "Basic $basic" }
$base = "https://$HarborHost"

function Get-Harbor([string]$Path) {
    try {
        return Invoke-RestMethod -Uri "$base$Path" -Headers $headers @webArgs
    } catch {
        if (-not $_.Exception.Response) {
            $msgs = @(); $e = $_.Exception
            while ($e) { $msgs += $e.Message; $e = $e.InnerException }
            throw "CONNECTION: could not reach $base ($($msgs -join ' -> '))"
        }
        throw "HTTP $([int]$_.Exception.Response.StatusCode) on GET ${Path}: $($_.Exception.Message)"
    }
}

# 2. Are the credentials valid?
try {
    $me = Get-Harbor '/api/v2.0/users/current'
    Write-Host "[OK] Logged in as '$($me.username)' (sysadmin: $($me.sysadmin_flag))" -ForegroundColor Green
} catch {
    if ("$_" -like 'CONNECTION:*') {
        Write-Host "[FAIL] $_" -ForegroundColor Red
        Write-Host 'This is a network/TLS problem in PowerShell, not a credentials problem.'
    } elseif ("$_" -notmatch '^HTTP 40[13] ') {
        Write-Host "[FAIL] $_" -ForegroundColor Red
        Write-Host 'Unexpected HTTP error (not a credentials problem). A 502 with -ViaProxy means the proxy cannot reach Harbor.'
    } else {
        Write-Host "[FAIL] Harbor rejected the credentials. $_" -ForegroundColor Red
        Write-Host "If Harbor uses OIDC/SSO login, use the 'CLI secret' from your Harbor user profile as the password."
    }
    exit 1
}

# 3. Project role
$roles = @{ 1 = 'Project Admin'; 2 = 'Developer'; 3 = 'Guest'; 4 = 'Maintainer'; 5 = 'Limited Guest' }
$proj = Get-Harbor "/api/v2.0/projects/$Project"
$roleId = [int]$proj.current_user_role_id
$roleName = if ($roles.ContainsKey($roleId)) { $roles[$roleId] } else { 'none' }
Write-Host "Project '$Project': public = $($proj.metadata.public), your role = $roleName"
if ($roleId -in 1, 2, 4) {
    Write-Host '[OK] Role allows push' -ForegroundColor Green
} else {
    Write-Host '[FAIL] Role does not allow push (needs Developer, Maintainer or Project Admin)' -ForegroundColor Red
}

# 4. Ask the registry token service exactly what crane would ask for
$scope = [uri]::EscapeDataString("repository:${Repository}:pull,push")
$tok = Get-Harbor "/service/token?service=harbor-registry&scope=$scope"
$payload = $tok.token.Split('.')[1].Replace('-', '+').Replace('_', '/')
$payload += '=' * ((4 - $payload.Length % 4) % 4)
$claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
$actions = @($claims.access | Where-Object { $_.name -eq $Repository } | ForEach-Object { $_.actions }) -join ','
Write-Host "Registry token for '$Repository' grants: [$actions]"
if ($actions -match 'push') {
    Write-Host '[OK] Push is allowed' -ForegroundColor Green
} else {
    Write-Host '[FAIL] Push is NOT allowed for this account' -ForegroundColor Red
}
