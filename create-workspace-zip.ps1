# Create complete workspace zip for teammates
$ErrorActionPreference = "Stop"

$sourceDir = "d:\v2"
$date = Get-Date -Format "yyyy-MM-dd_HHmmss"
$zipName = "CodeCollab_Complete_$date.zip"
$zipPath = "d:\$zipName"

Write-Host "Creating workspace zip..." -ForegroundColor Cyan
Write-Host "Source: $sourceDir"
Write-Host "Output: $zipPath"
Write-Host ""

# Folders to exclude
$excludeFolders = @("node_modules", ".git", "build", "dist", "lib")

Write-Host "Excluding: $($excludeFolders -join ', ')" -ForegroundColor Yellow
Write-Host ""

# Get all files
Write-Host "Collecting files..." -ForegroundColor Cyan

$allFiles = Get-ChildItem -Path $sourceDir -Force -Recurse -File | Where-Object {
    $path = $_.FullName
    $shouldExclude = $false
    
    foreach ($folder in $excludeFolders) {
        if ($path -match "\\$folder\\|\\$folder$") {
            $shouldExclude = $true
            break
        }
    }
    
    -not $shouldExclude
}

Write-Host "Files to include: $($allFiles.Count)" -ForegroundColor Green
Write-Host ""

# Create zip
Write-Host "Creating zip archive..." -ForegroundColor Cyan

Add-Type -AssemblyName System.IO.Compression.FileSystem

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)

$count = 0
$total = $allFiles.Count

foreach ($file in $allFiles) {
    $count++
    if ($count % 100 -eq 0) {
        $percent = [math]::Round(($count / $total) * 100, 1)
        Write-Host "  Progress: $percent% ($count/$total)"
    }
    
    $relativePath = $file.FullName.Substring($sourceDir.Length + 1)
    
    try {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, 
            $file.FullName, 
            $relativePath,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
    catch {
        Write-Host "  Warning: Could not add $relativePath" -ForegroundColor Yellow
    }
}

$zip.Dispose()

Write-Host ""
Write-Host "SUCCESS! Zip file created" -ForegroundColor Green
Write-Host ""

$zipInfo = Get-Item $zipPath
Write-Host "File Name: $($zipInfo.Name)"
Write-Host "File Size: $([math]::Round($zipInfo.Length / 1MB, 2)) MB"
Write-Host "Location: $($zipInfo.FullName)"
Write-Host ""

Write-Host "INCLUDED:" -ForegroundColor Yellow
Write-Host "  - All source code"
Write-Host "  - Configuration files"
Write-Host "  - Environment files"
Write-Host "  - Firebase configs"
Write-Host "  - Package.json files"
Write-Host "  - Public assets"
Write-Host ""

Write-Host "EXCLUDED (regenerate with npm install):" -ForegroundColor Yellow
Write-Host "  - node_modules"
Write-Host "  - build outputs"
Write-Host "  - .git folder"
Write-Host ""

Write-Host "TEAMMATE SETUP:" -ForegroundColor Cyan
Write-Host "  1. Extract zip"
Write-Host "  2. npm install (in root)"
Write-Host "  3. npm install (in functions/)"
Write-Host "  4. npm install (in landing/)"
Write-Host "  5. npm install (in dev-server/)"
Write-Host "  6. npm run dev"
Write-Host ""
