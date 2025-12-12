# Скрипт оптимизации бэкенда для production (PowerShell)
# Использование: .\optimize.ps1

Write-Host "🚀 Начинаем оптимизацию бэкенда..." -ForegroundColor Green

# 1. Production сборка
Write-Host "📦 Собираем production версию..." -ForegroundColor Yellow
npm run build:prod

# 2. Удаляем старые node_modules
Write-Host "🗑️  Удаляем старые зависимости..." -ForegroundColor Yellow
if (Test-Path node_modules) { Remove-Item -Recurse -Force node_modules }
if (Test-Path package-lock.json) { Remove-Item -Force package-lock.json }

# 3. Устанавливаем только production зависимости
Write-Host "📥 Устанавливаем только production зависимости..." -ForegroundColor Yellow
npm install --production

# 4. Очистка ненужных файлов
Write-Host "🧹 Очищаем ненужные файлы..." -ForegroundColor Yellow
$filesToRemove = @(
    "src",
    "test",
    "coverage",
    ".nyc_output",
    "tsconfig.json",
    "tsconfig.build.json",
    "nest-cli.json",
    "README.md",
    "OPTIMIZATION.md",
    "optimize.ps1",
    "optimize.sh"
)

foreach ($file in $filesToRemove) {
    if (Test-Path $file) {
        Remove-Item -Recurse -Force $file -ErrorAction SilentlyContinue
    }
}

# Удаляем eslint конфиги
Get-ChildItem -Filter "eslint.config.*" | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Filter ".eslintrc.*" | Remove-Item -Force -ErrorAction SilentlyContinue

# 5. Очистка node_modules от ненужных файлов
Write-Host "🧹 Очищаем node_modules..." -ForegroundColor Yellow
Get-ChildItem -Path node_modules -Recurse -Include "*.md" | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path node_modules -Recurse -Include "*.map" | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path node_modules -Recurse -Include "*.test.js" | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path node_modules -Recurse -Include "*.spec.js" | Remove-Item -Force -ErrorAction SilentlyContinue

# Удаляем тестовые директории
Get-ChildItem -Path node_modules -Recurse -Directory -Filter "test" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path node_modules -Recurse -Directory -Filter "tests" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path node_modules -Recurse -Directory -Filter ".github" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# 6. Проверка размера
Write-Host "📊 Размер после оптимизации:" -ForegroundColor Yellow
$size = (Get-ChildItem -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "Размер: $([math]::Round($size, 2)) МБ" -ForegroundColor Cyan

Write-Host "✅ Оптимизация завершена!" -ForegroundColor Green

