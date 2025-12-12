# Script to setup Git in PATH if needed

Write-Host "Searching for Git..." -ForegroundColor Yellow

# Standard Git installation paths
$gitPaths = @(
    "C:\Program Files\Git\cmd",
    "C:\Program Files (x86)\Git\cmd",
    "$env:LOCALAPPDATA\Programs\Git\cmd",
    "$env:ProgramFiles\Git\cmd"
)

$gitFound = $false

foreach ($path in $gitPaths) {
    if (Test-Path "$path\git.exe") {
        Write-Host "Git found: $path" -ForegroundColor Green
        $gitFound = $true
        
        # Add to PATH for current session
        $env:PATH = "$path;$env:PATH"
        
        Write-Host "Git added to PATH for current session" -ForegroundColor Green
        Write-Host ""
        Write-Host "Checking:" -ForegroundColor Cyan
        git --version
        
        Write-Host ""
        Write-Host "NOTE: This change only applies to current PowerShell session." -ForegroundColor Yellow
        Write-Host "To permanently add Git to PATH:" -ForegroundColor Yellow
        Write-Host "1. Open 'Environment Variables'" -ForegroundColor White
        Write-Host "2. Find PATH in 'System variables'" -ForegroundColor White
        Write-Host "3. Add path: $path" -ForegroundColor White
        Write-Host ""
        Write-Host "Or simply restart terminal - Git is usually added automatically." -ForegroundColor Cyan
        
        break
    }
}

if (-not $gitFound) {
    Write-Host "Git not found in standard locations." -ForegroundColor Red
    Write-Host ""
    Write-Host "Try:" -ForegroundColor Yellow
    Write-Host "1. Restart terminal/PowerShell" -ForegroundColor White
    Write-Host "2. Restart computer" -ForegroundColor White
    Write-Host "3. Check that Git is installed correctly" -ForegroundColor White
    Write-Host ""
    Write-Host "Or find path to git.exe manually and add it to PATH." -ForegroundColor Cyan
}
