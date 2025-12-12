#!/bin/bash

# Скрипт оптимизации бэкенда для production
# Использование: ./optimize.sh

set -e

echo "🚀 Начинаем оптимизацию бэкенда..."

# 1. Production сборка
echo "📦 Собираем production версию..."
npm run build:prod

# 2. Удаляем старые node_modules
echo "🗑️  Удаляем старые зависимости..."
rm -rf node_modules package-lock.json

# 3. Устанавливаем только production зависимости
echo "📥 Устанавливаем только production зависимости..."
npm install --production

# 4. Очистка ненужных файлов
echo "🧹 Очищаем ненужные файлы..."
rm -rf src
rm -rf test
rm -rf coverage
rm -rf .nyc_output
rm -f tsconfig.json
rm -f tsconfig.build.json
rm -f nest-cli.json
rm -f eslint.config.*
rm -f .eslintrc.*
rm -rf .git
rm -f .gitignore
rm -f README.md
rm -f OPTIMIZATION.md
rm -f optimize.sh

# 5. Очистка node_modules от ненужных файлов
echo "🧹 Очищаем node_modules..."
find node_modules -name "*.md" -delete
find node_modules -name "*.map" -delete
find node_modules -name "test" -type d -exec rm -rf {} + 2>/dev/null || true
find node_modules -name "tests" -type d -exec rm -rf {} + 2>/dev/null || true
find node_modules -name "*.test.js" -delete
find node_modules -name "*.spec.js" -delete
find node_modules -name ".github" -type d -exec rm -rf {} + 2>/dev/null || true

# 6. Проверка размера
echo "📊 Размер после оптимизации:"
du -sh .

echo "✅ Оптимизация завершена!"

