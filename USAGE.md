# Инструкция по использованию

## Установка зависимостей

```bash
npm install
```

## Сборка проекта

```bash
npm run build
```

Это скомпилирует TypeScript файлы в директорию `dist/`.

## Использование CLI для публикации обновлений

### Локально (после сборки)

```bash
node dist/cli.js
```

### Через npx (после публикации в npm)

```bash
npx nw-ota-publish
```

или

```bash
npx nw-ota
```

## Процесс публикации

1. **Путь к сборке**: Укажите путь к директории с собранным бандлом

   - Если ранее уже указывали, будет предложено использовать сохраненный путь

2. **Ключ проекта**: Введите уникальный идентификатор проекта

   - Используется для организации обновлений в S3
   - Если ранее уже указывали, будет предложено использовать сохраненный ключ

3. **Платформа**: Выберите платформу из списка

   - `win` - Windows
   - `mac` - macOS
   - `linux32` - Linux 32-bit
   - `linux64` - Linux 64-bit

4. **Нативная версия**: Введите версию нативного приложения

   - Если ранее вводили для этой платформы, будет предложено использовать сохраненную версию
   - Можно отредактировать

5. **Настройки S3**: Введите данные для доступа к S3

   - Access Key ID
   - Secret Access Key
   - Region (по умолчанию: us-east-1)
   - Bucket name
   - Endpoint (опционально, для S3-совместимых сервисов)
   - Если ранее уже настраивали, будет предложено использовать сохраненные настройки

6. **Загрузка**: CLI автоматически:
   - Создаст zip архив из указанной директории
   - Загрузит его в S3 по пути: `/ota/nwjs/{projectKey}/{platform}/{nativeVersion}/update-v{X}.zip`
   - Обновит или создаст `update.json` с новым обновлением

## Структура в S3

```
ota/nwjs/
  └── {projectKey}/
      └── {platform}/
          └── {nativeVersion}/
              ├── update.json
              ├── update-v1.zip
              ├── update-v2.zip
              └── ...
```

## Формат update.json

```json
[
  {
    "version": 1,
    "enable": true,
    "download": "https://bucket.s3.region.amazonaws.com/ota/nwjs/project/win/1.0.0/update-v1.zip"
  },
  {
    "version": 2,
    "enable": true,
    "download": "https://bucket.s3.region.amazonaws.com/ota/nwjs/project/win/1.0.0/update-v2.zip"
  }
]
```

## Конфигурация

Настройки сохраняются в файле `.nw-ota-config.json` в корне проекта:

```json
{
  "buildPath": "./dist",
  "projectKey": "my-project",
  "platforms": {
    "win": {
      "nativeVersion": "1.0.0"
    },
    "mac": {
      "nativeVersion": "1.0.0"
    }
  },
  "s3": {
    "accessKeyId": "...",
    "secretAccessKey": "...",
    "region": "us-east-1",
    "bucket": "my-bucket"
  }
}
```

**Важно**: Файл `.nw-ota-config.json` автоматически добавлен в `.gitignore` для защиты конфиденциальных данных.

## Использование библиотеки в коде

```typescript
import BundleUpdater from "nw-ota";

const updater = new BundleUpdater({
  bundlePath: "./app",
});

// Обновить бандл из URL
await updater.update("https://example.com/updates/app-bundle.zip");
```
