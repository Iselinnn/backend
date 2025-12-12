# Add Git to PATH permanently
# Run as Administrator for system-wide, or as user for user-only

$gitPath = "A:\Git\cmd"

if (-not (Test-Path "$gitPath\git.exe")) {
    Write-Host "Git not found at $gitPath" -ForegroundColor Red
    exit 1
}

Write-Host "Adding Git to PATH: $gitPath" -ForegroundColor Yellow

# Get current PATH
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")

# Check if already in PATH
if ($currentPath -notlike "*$gitPath*") {
    # Add to user PATH
    $newPath = "$currentPath;$gitPath"
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    
    # Also add to current session
    $env:PATH = "$gitPath;$env:PATH"
    
    Write-Host "Git added to PATH successfully!" -ForegroundColor Green
    Write-Host "Restart terminal for changes to take effect system-wide." -ForegroundColor Cyan
} else {
    Write-Host "Git is already in PATH" -ForegroundColor Green
    # Still add to current session
    $env:PATH = "$gitPath;$env:PATH"
}

Write-Host "`nTesting Git:" -ForegroundColor Cyan
git --version

