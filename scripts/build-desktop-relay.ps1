[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [string]$CompilerPath
)
$ErrorActionPreference = 'Stop'

if ($OutputDirectory -notmatch '^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)') {
    throw 'OutputDirectory must be an absolute Windows directory.'
}
$directory = [IO.Path]::GetFullPath($OutputDirectory)
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../adapters/desktop/windows-relay-shim.cs'))
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'Relay shim source is missing.' }
if (-not $CompilerPath) {
    $CompilerPath = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    if (-not (Test-Path -LiteralPath $CompilerPath -PathType Leaf)) {
        $CompilerPath = Join-Path $env:WINDIR 'Microsoft.NET/Framework/v4.0.30319/csc.exe'
    }
}
if (-not (Test-Path -LiteralPath $CompilerPath -PathType Leaf)) { throw 'The .NET Framework C# compiler is unavailable.' }
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$target = Join-Path $directory 'windows-relay-shim.exe'
$receipt = Join-Path $directory 'windows-relay-shim.source.sha256'
$sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
if ((Test-Path -LiteralPath $target -PathType Leaf) -and (Test-Path -LiteralPath $receipt -PathType Leaf)) {
    if (([IO.File]::ReadAllText($receipt)).Trim() -eq $sourceHash) {
        return [pscustomobject]@{ OutputPath = $target; SourceSHA256 = $sourceHash; Reused = $true }
    }
}
$candidate = Join-Path $directory ('relay-build-' + [guid]::NewGuid().ToString('N') + '.exe')
& $CompilerPath /nologo /target:exe /optimize+ (('/out:' + $candidate)) $source
if ($LASTEXITCODE -ne 0) { throw "Relay compiler exited with code $LASTEXITCODE." }
if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw 'Compiler did not produce the relay shim.' }
# A running wrapper is never stopped to replace its executable. Windows will
# reject replacement of a locked target; the existing file remains intact.
Move-Item -LiteralPath $candidate -Destination $target -Force
[IO.File]::WriteAllText($receipt, $sourceHash, (New-Object Text.UTF8Encoding($false)))
[pscustomobject]@{ OutputPath = $target; SourceSHA256 = $sourceHash; Reused = $false }
