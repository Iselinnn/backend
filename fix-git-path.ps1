# Fix Git PATH issue in PowerShell
# This script refreshes PATH and ensures Git is available

Write-Host "Refreshing PATH..." -ForegroundColor Yellow

# Get fresh PATH from environment variables
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")

# Combine and update current session PATH
$env:PATH = "$userPath;$machinePath"

# Ensure Git path is in PATH (in case it's missing)
$gitPath = "A:\Git\cmd"
if ($env:PATH -notlike "*$gitPath*") {
    $env:PATH = "$gitPath;$env:PATH"
    Write-Host "Added Git to PATH: $gitPath" -ForegroundColor Cyan
}

Write-Host "`nTesting Git:" -ForegroundColor Cyan
try {
    $gitVersion = git --version
    Write-Host $gitVersion -ForegroundColor Green
    Write-Host "`nGit is working!" -ForegroundColor Green
} catch {
    Write-Host "Git still not found. Try restarting PowerShell." -ForegroundColor Red
}

