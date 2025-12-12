# Оптимизация размера бэкенда

## Текущий размер
- Полный размер: ~374 МБ
- node_modules: ~373 МБ
- dist: ~1 МБ

## Цель: < 100 МБ

## Шаги оптимизации для production

### 1. Production сборка
```bash
npm run build:prod
```

### 2. Установка только production зависимостей
```bash
npm ci --production
```

Это удалит все devDependencies и уменьшит размер node_modules примерно на 50-70%.

### 3. Очистка после сборки
После сборки можно удалить:
- `src/` - исходный код (не нужен в production)
- `test/` - тесты
- `*.ts` файлы (остаются только `.js` в `dist/`)
- `tsconfig*.json` - конфигурация TypeScript
- `nest-cli.json` - конфигурация NestJS CLI
- `eslint.config.*` - конфигурация ESLint

### 4. Оптимизация Prisma
Prisma генерирует клиент, который можно оптимизировать:
```bash
npx prisma generate --schema=./prisma/schema.prisma
```

### 5. Docker multi-stage build (рекомендуется)
Используйте `.dockerignore` для исключения ненужных файлов.

### 6. Ожидаемый результат
После оптимизации:
- node_modules (production only): ~150-200 МБ
- dist: ~1-2 МБ
- prisma: ~5-10 МБ
- Итого: ~160-210 МБ

**Для достижения < 100 МБ:**
- Используйте Docker multi-stage build
- Или используйте `npm ci --production` и удалите ненужные файлы вручную
- Рассмотрите возможность использования альтернативных легковесных библиотек

## Команды для быстрой оптимизации

```bash
# 1. Сборка
npm run build:prod

# 2. Установка только production зависимостей
npm ci --production

# 3. Очистка (опционально, будьте осторожны!)
rm -rf src test *.ts tsconfig*.json nest-cli.json eslint.config.* .git .gitignore README.md

# 4. Проверка размера
du -sh .
```

## Важно
⚠️ Не удаляйте:
- `dist/` - скомпилированный код
- `node_modules/` - зависимости
- `prisma/` - схема и миграции (но можно удалить `prisma/migrations` если не нужны)
- `package.json` и `package-lock.json`
- `.env` файлы (если используются)

