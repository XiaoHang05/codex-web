[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$BaseUrl,
    [Parameter(Mandatory=$true)][string]$Uri,
    [switch]$PlanOnly
)
$ErrorActionPreference='Stop'
try {
    $origin=[Uri]$BaseUrl
    if($origin.Scheme -ne 'http' -or $origin.Host -ne '127.0.0.1' -or $origin.AbsolutePath -ne '/' -or $origin.Query -or $origin.Fragment -or $origin.UserInfo){throw 'Invalid local service URL.'}
    if($Uri -cnotmatch '^codex-local-file://open/([a-f0-9]{64})$'){throw 'Invalid file-open link.'}
    $ticket=$Matches[1]
    $session=New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $auth=Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/')+'/codex-api/v1/auth/status') -WebSession $session -TimeoutSec 10
    if(!$auth.authenticated -or !$auth.local){throw 'Local authentication is unavailable.'}
    $body=@{token=$ticket}|ConvertTo-Json -Compress
    $result=Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/')+'/codex-api/v1/artifacts/local-open/consume') -Method Post -WebSession $session -Headers @{'X-CSRF-Token'=$auth.csrf} -ContentType 'application/json' -Body $body -TimeoutSec 15
    $file=[string]$result.path
    $allowed='.pdf .txt .md .markdown .log .json .jsonc .csv .tsv .yaml .yml .toml .xml .png .jpg .jpeg .webp .gif .avif .bmp .tif .tiff .heic .doc .docx .xls .xlsx .ppt .pptx .odt .ods .odp .rtf .mp3 .wav .flac .m4a .mp4 .mkv .mov .avi .webm .html .htm'.Split(' ')
    if($result.action -ne 'open' -or $file -notmatch '^[a-zA-Z]:[\\/]' -or $file.Substring(2).Contains(':') -or $allowed -notcontains [IO.Path]::GetExtension($file).ToLowerInvariant() -or !(Test-Path -LiteralPath $file -PathType Leaf)){throw 'File cannot be opened.'}
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$file
    $info.UseShellExecute=$true
    $info.WorkingDirectory=[IO.Path]::GetDirectoryName($file)
    if($PlanOnly){@{path=$info.FileName;useShellExecute=$info.UseShellExecute}|ConvertTo-Json -Compress;exit 0}
    [Diagnostics.Process]::Start($info)|Out-Null
} catch {
    if($PlanOnly){Write-Error $_;exit 1}
    Add-Type -AssemblyName System.Windows.Forms
    [Windows.Forms.MessageBox]::Show(('Unable to open file. Please click Open again.'+[Environment]::NewLine+$_.Exception.Message),'Open file')|Out-Null
    exit 1
}
