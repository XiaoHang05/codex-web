[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$DesktopExecutable,
    [Parameter(Mandatory = $true)][string]$NativeBinary,
    [Parameter(Mandatory = $true)][string]$NodeBinary,
    [Parameter(Mandatory = $true)][string]$NativeHome,
    [Parameter(Mandatory = $true)][string]$RuntimeDirectory,
    [switch]$Check
)
$ErrorActionPreference = 'Stop'
function Resolve-RelayPath([string]$Value, [string]$Label, [bool]$Directory = $false) {
    if ($Value -notmatch '^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)') { throw "$Label must be an absolute Windows path." }
    $kind = if ($Directory) { 'Container' } else { 'Leaf' }
    if (-not (Test-Path -LiteralPath $Value -PathType $kind)) { throw "$Label does not exist." }
    return (Resolve-Path -LiteralPath $Value).ProviderPath
}
$desktopPath = Resolve-RelayPath $DesktopExecutable 'DesktopExecutable'
$nativePath = Resolve-RelayPath $NativeBinary 'NativeBinary'
$nodePath = Resolve-RelayPath $NodeBinary 'NodeBinary'
$homePath = Resolve-RelayPath $NativeHome 'NativeHome' $true
if ($RuntimeDirectory -notmatch '^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)') { throw 'RuntimeDirectory must be an absolute Windows directory.' }
$runtimePath = [IO.Path]::GetFullPath($RuntimeDirectory)
$entry = Resolve-RelayPath (Join-Path $PSScriptRoot '../adapters/desktop/relay-cli.js') 'Relay entry'

# Fail closed if a matching executable is running or its path cannot be read.
$desktopName = [IO.Path]::GetFileName($desktopPath)
$packageMatch = [regex]::Match($desktopPath, '(?i)[\\/](OpenAI\.Codex_[^\\/]+)[\\/]app[\\/]ChatGPT\.exe$')
$desktopPackage = if ($packageMatch.Success) { $packageMatch.Groups[1].Value } else { $null }
$running = @(Get-CimInstance Win32_Process | Where-Object {
    $samePackage = $false
    if ($desktopPackage -and $_.ExecutablePath) {
        $candidatePackage = [regex]::Match($_.ExecutablePath, '(?i)[\\/](OpenAI\.Codex_[^\\/]+)[\\/]app[\\/]ChatGPT\.exe$')
        $samePackage = $candidatePackage.Success -and [string]::Equals($candidatePackage.Groups[1].Value, $desktopPackage, [StringComparison]::OrdinalIgnoreCase)
    }
    $_.Name -eq $desktopName -and ((-not $_.ExecutablePath) -or $samePackage -or
        [string]::Equals($_.ExecutablePath, $desktopPath, [StringComparison]::OrdinalIgnoreCase))
})
if (-not $Check -and $running.Count -gt 0) {
    throw 'Desktop is already running. This launcher will not close, restart or take it over. Close it explicitly before using this launcher.'
}
$nativeVersion = & $nativePath --version
if ($LASTEXITCODE -ne 0) { throw 'Native CLI version check failed.' }
$nodeVersion = & $nodePath --version
if ($LASTEXITCODE -ne 0) { throw 'Node version check failed.' }
$build = & (Join-Path $PSScriptRoot 'build-desktop-relay.ps1') -OutputDirectory $runtimePath
$result = [ordered]@{
    Checked = $true; Desktop = $desktopPath; Native = $nativePath;
    NativeVersion = ($nativeVersion -join "`n"); Node = $nodePath;
    NodeVersion = ($nodeVersion -join "`n"); NativeHome = $homePath;
    Entry = $entry; Shim = $build.OutputPath;
    DesktopAlreadyRunning = ($running.Count -gt 0); Started = $false
}
if ($Check) { return [pscustomobject]$result }

$start = New-Object Diagnostics.ProcessStartInfo
$start.FileName = $desktopPath
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.WorkingDirectory = [IO.Path]::GetDirectoryName($desktopPath)
$start.EnvironmentVariables['CODEX_CLI_PATH'] = $build.OutputPath
$start.EnvironmentVariables['CODEX_APP_SERVER_FORCE_CLI'] = '1'
$start.EnvironmentVariables['CODEX_WEB_RELAY_NATIVE_BINARY'] = $nativePath
$start.EnvironmentVariables['CODEX_WEB_RELAY_NODE_BINARY'] = $nodePath
$start.EnvironmentVariables['CODEX_WEB_RELAY_ENTRY'] = $entry
$start.EnvironmentVariables['CODEX_HOME'] = $homePath
# Do not propagate the management chat's executor attribution into Desktop.
$start.EnvironmentVariables.Remove('CODEX_THREAD_ID')
$process = [Diagnostics.Process]::Start($start)
if (-not $process) { throw 'Desktop process did not start.' }
$result['Started'] = $true
$result['DesktopPid'] = $process.Id
[pscustomobject]$result
