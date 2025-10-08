# Script to create a complete workspace zip for sharing
$ErrorActionPreference = "Stop"

$sourceDir = "d:\v2"
$date = Get-Date -Format "yyyy-MM-dd_HHmmss"
$zipName = "CodeCollab_Complete_$date.zip"
$zipPath = "d:\$zipName"

Write-Host "Creating comprehensive workspace zip..." -ForegroundColor Cyan
Write-Host "Source: $sourceDir" -ForegroundColor Gray
Write-Host "Destination: $zipPath" -ForegroundColor Gray

# Folders to exclude (these can be regenerated from package.json)
$excludeFolders = @(
    "node_modules",
    ".git",
    "build",
    "dist",
    "lib"
)

Write-Host "`nExcluding folders: $($excludeFolders -join ', ')" -ForegroundColor Yellow

# Get all items except excluded folders
$items = Get-ChildItem -Path $sourceDir -Force -Recurse | Where-Object {
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

Write-Host "`nCollecting files..." -ForegroundColor Cyan
$files = $items | Where-Object { -not $_.PSIsContainer }
Write-Host "Total files to include: $($files.Count)" -ForegroundColor Green

# Create zip using .NET (more reliable than Compress-Archive)
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Write-Host "`nCreating zip archive..." -ForegroundColor Cyan

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)

$progressCount = 0
$totalFiles = $files.Count

foreach ($file in $files) {
    $progressCount++
    if ($progressCount % 50 -eq 0) {
        $percent = [math]::Round(($progressCount / $totalFiles) * 100, 1)
        Write-Host "Progress: $percent% ($progressCount/$totalFiles)" -ForegroundColor Gray
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
        Write-Host "Warning: Could not add $relativePath" -ForegroundColor Yellow
    }
}

$zip.Dispose()

Write-Host "`n✓ Zip file created successfully!" -ForegroundColor Green
$zipInfo = Get-Item $zipPath
Write-Host "`nFile: $($zipInfo.Name)" -ForegroundColor Cyan
Write-Host "Size: $([math]::Round($zipInfo.Length / 1MB, 2)) MB" -ForegroundColor Cyan
Write-Host "Location: $($zipInfo.FullName)" -ForegroundColor Cyan

Write-Host "`n=== What is Included ===" -ForegroundColor Yellow
Write-Host "✓ All source code (src/)" -ForegroundColor Green
Write-Host "✓ Configuration files (.json, .yaml, .ts config)" -ForegroundColor Green
Write-Host "✓ Environment files (.env*)" -ForegroundColor Green
Write-Host "✓ Firebase files (firebase.json, firestore.*)" -ForegroundColor Green
Write-Host "✓ Package files (package.json, package-lock.json)" -ForegroundColor Green
Write-Host "✓ HTML files (index.html, etc.)" -ForegroundColor Green
Write-Host "✓ Public assets" -ForegroundColor Green
Write-Host "✓ Functions code" -ForegroundColor Green
Write-Host "✓ Data Connect schemas" -ForegroundColor Green
Write-Host "✓ Landing page" -ForegroundColor Green
Write-Host "✓ Dev server files" -ForegroundColor Green

Write-Host "`n=== Excluded (can be regenerated) ===" -ForegroundColor Yellow
Write-Host "✗ node_modules/ (run: npm install)" -ForegroundColor Gray
Write-Host "✗ build/ (run: npm run build)" -ForegroundColor Gray
Write-Host "✗ lib/ (generated from build)" -ForegroundColor Gray
Write-Host "✗ .git/ (version control)" -ForegroundColor Gray

Write-Host "`n=== Setup Instructions for Teammates ===" -ForegroundColor Cyan
Write-Host "1. Extract the zip file" -ForegroundColor White
Write-Host "2. Run: npm install (in root)" -ForegroundColor White
Write-Host "3. Run: npm install (in functions/)" -ForegroundColor White
Write-Host "4. Run: npm install (in landing/)" -ForegroundColor White
Write-Host "5. Run: npm install (in dev-server/)" -ForegroundColor White
Write-Host "6. Configure Firebase credentials if needed" -ForegroundColor White
Write-Host "7. Run: npm run dev" -ForegroundColor White

Write-Host "`nDone! Share this file with your teammates." -ForegroundColor Green
