# Extract jobsData from v6-backup.html and save as JSON
$html = Get-Content "D:\岗位信息爬取网页项目\v6-backup.html" -Raw

# Find jobsData assignment
$pattern = '(?s)(?:var|let|const)\s+jobsData\s*=\s*(\[.*?\]);'
$match = [regex]::Match($html, $pattern)

if ($match.Success) {
    $jobsJson = $match.Groups[1].Value
    # Write as UTF-8 without BOM
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText("D:\岗位信息爬取网页项目\v6\src\jobsData.json", $jobsJson, $utf8NoBom)
    Write-Host "Extracted jobsData to jobsData.json"
} else {
    # Try to find the script block and extract manually
    Write-Host "Pattern not matched, trying alternate approach..."
    $start = $html.IndexOf('jobsData')
    if ($start -gt 0) {
        Write-Host "Found jobsData at index $start"
    }
}