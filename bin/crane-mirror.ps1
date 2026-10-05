# Pull an image from Docker Hub with crane and push it to Harbor.
# Usage: .\crane-mirror.ps1 -TargetTag dev_v0.0.27
[CmdletBinding()]
param(
    [string]$Crane,
    [string]$SourceImage = 'pyburn/ep:main',
    [string]$DockerHubUsername,
    [string]$HarborHost = 'dpsauatdk01.intra.hkma.gov.hk:8443',
    [string]$HarborRepo = 'tois/tois',
    [string]$HarborUsername,
    [string]$TargetTag,
    [string]$Tarball,
    [string]$ProxyUrl = 'http://proxy01-lb.intra.hkma.gov.hk:8080'
)

$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1 leaves $PSScriptRoot empty inside param() defaults
if (-not $Crane) {
    $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
    $Crane = Join-Path $scriptDir 'crane.exe'
}

function Read-Secret([string]$Prompt) {
    if ($PSVersionTable.PSVersion.Major -ge 7) {
        return Read-Host $Prompt -MaskInput
    }
    # Windows PowerShell 5.1 has no -MaskInput
    $secure = Read-Host $Prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Invoke-Crane {
    param([Parameter(ValueFromPipeline)][string]$InputText, [string[]]$Arguments)
    if ($PSBoundParameters.ContainsKey('InputText')) {
        $InputText | & $Crane @Arguments
    } else {
        & $Crane @Arguments
    }
    if ($LASTEXITCODE -ne 0) { throw "crane $($Arguments -join ' ') failed (exit $LASTEXITCODE)" }
}

if (-not (Get-Command $Crane -ErrorAction SilentlyContinue)) {
    throw "crane not found at '$Crane'. Pass -Crane <path>."
}

# Proxies
$env:HTTP_PROXY  = $ProxyUrl
$env:HTTPS_PROXY = $ProxyUrl
$env:NO_PROXY    = "$($HarborHost.Split(':')[0]),localhost,127.0.0.1"

if (-not $TargetTag) { $TargetTag = (Read-Host 'Target tag (e.g. dev_v0.0.27)').Trim() }
if (-not $TargetTag) { throw 'TargetTag is required.' }

$sourceRepo = $SourceImage.Split(':')[0]
$sourceTag = $SourceImage.Split(':')[1]
if (-not $Tarball) { $Tarball = ".\$(Split-Path $sourceRepo -Leaf)-$sourceTag.tar" }
$targetImage = "$HarborHost/${HarborRepo}:$TargetTag"

try {
    # Docker Hub
    if (-not $DockerHubUsername) { $DockerHubUsername = (Read-Host 'Docker Hub username').Trim() }
    $token = Read-Secret 'Docker Hub access token'
    $token | Invoke-Crane -Arguments 'auth', 'login', 'index.docker.io', '--username', $DockerHubUsername, '--password-stdin'
    $token = $null

    Write-Host "Pulling $SourceImage -> $Tarball"
    Invoke-Crane -Arguments 'pull', $SourceImage, $Tarball

    Write-Host "Available tags for ${sourceRepo}:"
    Invoke-Crane -Arguments 'ls', $sourceRepo

    # Harbor
    if (-not $HarborUsername) { $HarborUsername = (Read-Host 'Harbor username').Trim() }
    $token = Read-Secret 'Harbor password or robot token'
    $token | Invoke-Crane -Arguments 'auth', 'login', $HarborHost, '--username', $HarborUsername, '--password-stdin'
    $token = $null

    Write-Host "Pushing $Tarball -> $targetImage"
    Invoke-Crane -Arguments 'push', $Tarball, $targetImage

    Write-Host 'Verifying digest:'
    Invoke-Crane -Arguments 'digest', $targetImage

    Write-Host "Done: $targetImage"
}
finally {
    # crane stores logins in plain text in ~\.docker\config.json
    Write-Host 'Logging out of registries...'
    & $Crane auth logout 'index.docker.io'
    & $Crane auth logout $HarborHost
}
