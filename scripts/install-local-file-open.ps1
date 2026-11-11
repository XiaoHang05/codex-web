[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$BaseUrl,
    [Parameter(Mandatory=$true)][string]$DataDirectory,
    [switch]$Check
)
$ErrorActionPreference='Stop'
$origin=[Uri]$BaseUrl
if($origin.Scheme -ne 'http' -or $origin.Host -ne '127.0.0.1' -or $origin.AbsolutePath -ne '/' -or $origin.Query -or $origin.Fragment -or $origin.UserInfo){throw 'Only the loopback service URL is supported.'}
$helper=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'windows-file-open.ps1'))
if(!(Test-Path -LiteralPath $helper -PathType Leaf)){throw 'Missing file-open helper.'}
$directory=[IO.Path]::GetFullPath($DataDirectory)
$key='HKCU:\Software\Classes\codex-local-file'
$powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$command='"'+$powershell+'" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$helper+'" -BaseUrl "'+$origin.AbsoluteUri+'" -Uri "%1"'
$marker=Join-Path $directory 'local-file-open.json'
if($Check){
    if(!(Test-Path -LiteralPath ($key+'\shell\open\command')) -or (Get-Item -LiteralPath ($key+'\shell\open\command')).GetValue('') -ne $command){throw 'Protocol handler does not match.'}
    $record=Get-Content -LiteralPath $marker -Raw|ConvertFrom-Json
    if($record.version -ne 1 -or $record.protocol -ne 'codex-local-file'){throw 'Protocol marker does not match.'}
    @{installed=$true;protocol='codex-local-file';helper=$helper;baseUrl=$origin.AbsoluteUri}|ConvertTo-Json
    exit 0
}
$backup=Join-Path $directory ('backups\local-file-open-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
[IO.Directory]::CreateDirectory($backup)|Out-Null
if(Test-Path -LiteralPath $key){
    $old=(Get-Item -LiteralPath ($key+'\shell\open\command') -ErrorAction SilentlyContinue).GetValue('')
    if($old -and $old -ne $command){throw 'A different protocol handler is already installed; no changes made.'}
    & reg.exe export 'HKCU\Software\Classes\codex-local-file' (Join-Path $backup 'protocol.reg') /y|Out-Null
    if($LASTEXITCODE -ne 0){throw 'Cannot back up protocol registration.'}
}
if(Test-Path -LiteralPath $marker){Copy-Item -LiteralPath $marker -Destination (Join-Path $backup 'local-file-open.json')}
New-Item -Path ($key+'\shell\open\command') -Force|Out-Null
Set-Item -LiteralPath $key -Value 'URL:Codex local file opener'
New-ItemProperty -LiteralPath $key -Name 'URL Protocol' -Value '' -PropertyType String -Force|Out-Null
Set-Item -LiteralPath ($key+'\shell\open\command') -Value $command
$record=@{version=1;protocol='codex-local-file';baseUrl=$origin.AbsoluteUri;helper=$helper;installedAt=[DateTime]::UtcNow.ToString('o')}
[IO.File]::WriteAllText($marker,($record|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
@{installed=$true;protocol='codex-local-file';backup=$backup}|ConvertTo-Json
