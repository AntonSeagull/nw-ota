# nw-ota

[English](README.md) | Русский

Обновление бандла приложения NW.js (файлы приложения) без замены всего приложения.

Эта библиотека позволяет обновлять только бандл приложения (например, папку `app/`) вашего приложения NW.js, сохраняя при этом runtime NW.js и другие файлы нетронутыми.

## Установка

```bash
npm install nw-ota
```

## Использование

### Базовый пример - Обновление бандла

```typescript
import BundleUpdater from "nw-ota";

// Вариант 1: Автоматическое определение пути к бандлу (рекомендуется для NW.js приложений)
// bundlePath будет автоматически определен с помощью getDefaultBundlePath()
const updater = new BundleUpdater({});

// Вариант 2: Ручной путь
// const updater = new BundleUpdater({
//   bundlePath: "./app", // Путь к директории бандла приложения
// });

// Обновление бандла по URL
try {
  await updater.update("https://example.com/updates/app-bundle.zip");
  console.log("Бандл успешно обновлен!");
} catch (error) {
  console.error("Ошибка обновления:", error);
}
```

### Автоматическая проверка обновлений (контекст NW.js)

Библиотека может автоматически проверять обновления из S3 и устанавливать их. Это работает в контексте NW.js и автоматически определяет платформу и версию приложения:

```typescript
import BundleUpdater from "nw-ota";

// Автоматическое определение пути к бандлу на основе платформы (bundlePath опционально)
const updater = new BundleUpdater({});

// Проверка обновлений и автоматическая установка
await updater.checkForUpdate({
  endpoint: "https://bucket.s3.region.amazonaws.com",
  projectKey: "my-project",
  // currentVersion опционально - если не предоставлен, будет загружен из сохраненного файла версии
  // После успешного обновления версия автоматически сохраняется

  // Колбэки
  progress: (received, total) => {
    console.log(`Прогресс загрузки: ${received}/${total} байт`);
  },

  updateFound: (update) => {
    console.log(`Обновление найдено: версия ${update.version}`);
  },

  updateSuccess: () => {
    console.log("Обновление успешно установлено!");
  },

  updateFail: (error) => {
    console.error("Ошибка обновления:", error);
  },

  noUpdate: () => {
    console.log("Обновления недоступны");
  },

  // Опционально: уведомить, что требуется перезапуск
  onNeedRestart: () => {
    console.log(
      "Обновление установлено! Пожалуйста, перезапустите приложение для применения изменений."
    );
  },

  // Опционально: отслеживание изменений статуса
  onStatus: (status) => {
    console.log("Статус обновления:", status);
  },
});
```

Функция автоматически:

- Определяет платформу (win/mac/linux32/linux64) из NW.js
- Получает **версию приложения** (например, "1.0.0") из `nw.App.manifest.version` - это версия из вашего package.json/manifest
- Загружает текущую версию бандла из локального файла (`.nw-bundle-version.json`), если `currentVersion` не предоставлен
- Строит URL update.json: `{endpoint}/ota/nwjs/{projectKey}/{platform}/{appVersion}/update.json`
- Находит последнее включенное обновление с версией > currentVersion
- Загружает и устанавливает обновление
- **Автоматически сохраняет новую версию** после успешной установки

**Примечание:** `appVersion` в пути URL относится к версии приложения из `nw.App.manifest.version` (например, "1.0.0", "1.2.3"). Это позволяет иметь отдельные каналы обновлений для разных версий приложения.

### Пошаговое обновление

```typescript
import BundleUpdater from "nw-ota";

const updater = new BundleUpdater({
  bundlePath: "./app",
  temporaryDirectory: "./temp",
  backup: true, // Создать резервную копию перед заменой (по умолчанию: true)
});

try {
  // 1. Загрузить zip файл
  const zipPath = await updater.download(
    "https://example.com/updates/app-bundle.zip"
  );

  // 2. Распаковать zip файл
  const unpackedPath = await updater.unpack(zipPath);

  // 3. Заменить бандл
  await updater.replace(unpackedPath);

  console.log("Бандл успешно обновлен!");
} catch (error) {
  console.error("Ошибка обновления:", error);
}
```

## Публикация обновлений (CLI)

Пакет включает CLI инструмент для публикации обновлений в S3 хранилище.

### Установка

```bash
npm install -g nw-ota
```

Или используйте с npx:

```bash
npx nw-ota
```

### Использование

Запустите команду публикации в директории вашего проекта:

```bash
npx nw-ota-publish
```

Или:

```bash
npx nw-ota
```

CLI проведет вас через процесс:

1. **Путь к сборке**: Введите путь к директории сборки (сохраняется для будущего использования)
2. **Ключ проекта**: Введите уникальный идентификатор проекта (сохраняется для будущего использования)
3. **Платформа**: Выберите платформу (win, mac, linux32, linux64)
4. **Версия**: Введите версию приложения (например, "1.0.0") - это должно соответствовать версии из вашего package.json/manifest (сохраняется для каждой платформы)
5. **Конфигурация S3**: Введите учетные данные и настройки S3 (сохраняется для будущего использования)
6. **Загрузка**: Инструмент:
   - Создаст zip архив из директории сборки
   - Загрузит его в S3 по адресу: `/ota/nwjs/{projectKey}/{platform}/{version}/update-v{X}.zip`
   - Обновит или создаст `update.json` с новой версией

**Примечание:** Версия должна соответствовать версии приложения из вашего package.json/manifest (например, "1.0.0", "1.2.3"). Это позволяет иметь отдельные каналы обновлений для разных версий приложения.

### Конфигурация

CLI сохраняет конфигурацию в `.nw-ota-config.json` в директории вашего проекта. Этот файл содержит:

- Путь к сборке
- Ключ проекта
- Версии для конкретных платформ
- Конфигурацию S3

**Примечание**: Файл конфигурации автоматически добавляется в `.gitignore`, чтобы предотвратить коммит чувствительных учетных данных S3.

### Структура S3

Обновления хранятся в S3 со следующей структурой:

```
ota/nwjs/{projectKey}/{platform}/{version}/
  ├── update.json
  ├── update-v1.zip
  ├── update-v2.zip
  └── ...
```

### Формат update.json

Файл `update.json` содержит массив доступных обновлений:

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

## API

### `new BundleUpdater(options)`

Создает новый экземпляр BundleUpdater.

**Опции:**

- `bundlePath` (опционально): Путь к директории бандла для замены. Если не предоставлен, будет автоматически определен с помощью `BundleUpdater.getDefaultBundlePath()`.

  **Важно:** В приложениях NW.js расположение бандла **зависит от платформы** согласно [документации NW.js](https://docs.nwjs.io/For%20Users/Package%20and%20Distribute/):

  - **Windows/Linux**: Та же папка, что и `nw.exe` (или `nw`), ИЛИ папка `package.nw` в той же директории
  - **Mac**: `nwjs.app/Contents/Resources/app.nw`

  Если `bundlePath` не предоставлен, библиотека автоматически определит его:

  ```typescript
  // Автоматическое определение (рекомендуется для NW.js приложений)
  const updater = new BundleUpdater({});

  // Или указать вручную
  const updater = new BundleUpdater({
    bundlePath: "./app",
  });
  ```

  Примеры:

  - `'./app'` - относительный путь
  - `'./package.nw'` - папка package.nw (Windows/Linux)
  - `'/path/to/app'` - абсолютный путь

- `temporaryDirectory` (опционально): Путь к временной директории для загрузок. По умолчанию `os.tmpdir()`
- `backup` (опционально): Создавать ли резервную копию перед заменой. По умолчанию `true`

### `BundleUpdater.getDefaultBundlePath()`

Статический метод, который автоматически определяет путь к бандлу по умолчанию на основе специфичной для платформы структуры NW.js.

**Возвращает:** `string | null` - Определенный путь к бандлу, или `null`, если NW.js недоступен или путь не может быть определен.

**Пример:**

```typescript
const defaultPath = BundleUpdater.getDefaultBundlePath();
if (defaultPath) {
  const updater = new BundleUpdater({
    bundlePath: defaultPath,
  });
} else {
  // Резервный вариант - ручной путь
  const updater = new BundleUpdater({
    bundlePath: "./app",
  });
}
```

### `updater.update(url)`

Загружает, распаковывает и заменяет бандл одним вызовом.

**Параметры:**

- `url` (string): URL для загрузки zip файла

**Возвращает:** `Promise<void>`

### `updater.download(url)`

Загружает zip файл по URL.

**Параметры:**

- `url` (string): URL для загрузки zip файла

**Возвращает:** `Promise<string>` - Путь к загруженному файлу

### `updater.unpack(zipPath)`

Распаковывает zip файл во временную директорию.

**Параметры:**

- `zipPath` (string): Путь к zip файлу

**Возвращает:** `Promise<string>` - Путь к распакованной директории

### `updater.replace(newBundlePath)`

Заменяет текущий бандл новым.

**Параметры:**

- `newBundlePath` (string): Путь к новой директории бандла

**Возвращает:** `Promise<void>`

### `updater.createBackup()`

Создает резервную копию текущего бандла.

**Возвращает:** `Promise<string | null>` - Путь к директории резервной копии, или null, если бандл не существует

### `updater.getCurrentVersion()`

Получает текущую версию бандла из сохраненного файла версии.

**Возвращает:** `number` - Текущая версия бандла (0, если файл версии не существует)

**Примечание:** Версия автоматически сохраняется после успешных обновлений через `checkForUpdate()`. Файл версии хранится в `.nw-bundle-version.json` рядом с директорией бандла.

### `updater.getVersionInfo()`

Получает строку информации о версии с платформой, версией приложения и версией OTA бандла.

**Возвращает:** `string` - Информация о версии в формате: `"Platform Version OTAVersion"`

**Пример:**

```typescript
const versionInfo = updater.getVersionInfo();
console.log(versionInfo); // "win 1.0.0 5" or "mac 1.2.3 3"
```

Это та же информация, которая используется при проверке обновлений (платформа, версия приложения и текущая версия OTA).

### `updater.checkForUpdate(options)`

Проверяет обновления из S3 хранилища и устанавливает их автоматически. Работает в контексте NW.js - автоматически определяет платформу и версию приложения.

**Параметры:**

- `options` (CheckUpdateOptions): Объект конфигурации
  - `endpoint` (string, обязательно): S3 endpoint/base URL, где хранятся обновления
  - `projectKey` (string, обязательно): Уникальный идентификатор проекта
  - `currentVersion` (number, опционально): Текущая версия бандла. Если не предоставлена, будет загружена из сохраненного файла версии (`.nw-bundle-version.json`). По умолчанию 0, если сохраненная версия не существует.
  - `headers` (Record<string, string>, опционально): Опциональные заголовки для запросов
  - `progress` (функция, опционально): Колбэк для прогресса загрузки `(received: number, total: number) => void`
  - `updateFound` (функция, опционально): Колбэк, когда обновление найдено `(update: UpdateEntry) => void`
  - `updateSuccess` (функция, опционально): Колбэк, когда обновление успешно `() => void`
  - `updateFail` (функция, опционально): Колбэк, когда обновление не удалось `(error?: string | Error) => void`
  - `noUpdate` (функция, опционально): Колбэк, когда обновления недоступны `() => void`
  - `onNeedRestart` (функция, опционально): Колбэк, вызываемый после успешной установки обновления. Приложение не перезапустится автоматически - пользователь должен перезапустить вручную для применения обновления `() => void`
  - `onStatus` (функция, опционально): Колбэк, вызываемый при каждом изменении статуса в процессе обновления. Предоставляет единое отслеживание статуса `(status: UpdateStatus) => void`

**Значения UpdateStatus:**

- `'checking'` - Проверка доступных обновлений
- `'update-found'` - Обновление найдено и будет установлено
- `'downloading'` - Загрузка пакета обновления
- `'downloaded'` - Загрузка успешно завершена
- `'unpacking'` - Распаковка загруженного архива
- `'unpacked'` - Распаковка успешно завершена
- `'replacing'` - Замена текущего бандла новым
- `'replaced'` - Замена бандла успешно завершена
- `'saving'` - Сохранение информации о новой версии
- `'cleaning'` - Очистка временных файлов
- `'success'` - Установка обновления успешно завершена
- `'error'` - Произошла ошибка в процессе обновления
- `'no-update'` - Обновления недоступны
- `'restart-needed'` - Обновление установлено, требуется перезапуск приложения

**Возвращает:** `Promise<void>`

**Пример:**

```typescript
await updater.checkForUpdate({
  endpoint: "https://bucket.s3.region.amazonaws.com",
  projectKey: "my-project",
  // currentVersion будет автоматически загружен из сохраненного файла
  progress: (received, total) => {
    console.log(`Прогресс: ${((received / total) * 100).toFixed(2)}%`);
  },
  updateSuccess: () => {
    console.log("Обновление установлено! Версия автоматически сохранена.");
  },
  onNeedRestart: () => {
    console.log(
      "Пожалуйста, перезапустите приложение для применения обновления."
    );
  },
});

// Получить текущую версию
const currentVersion = updater.getCurrentVersion();
console.log(`Текущая версия бандла: ${currentVersion}`);
```

## Сборка

Для сборки исходного кода TypeScript:

```bash
npm run build
```

Это скомпилирует файлы TypeScript в JavaScript в директории `dist/`.

## Отличия от nw-updater

- **nw-updater**: Заменяет все приложение NW.js (исполняемый файл, runtime и все файлы)
- **nw-ota**: Заменяет только бандл приложения (ваш код приложения), сохраняя runtime NW.js нетронутым

Это полезно, когда:

- Вы хотите обновить код приложения без перераспределения всего runtime NW.js
- Вы хотите меньшие пакеты обновлений
- Вы хотите более быстрые обновления (только файлы приложения, а не все приложение)

## Требования

- Node.js 14.0.0 или выше
- TypeScript 5.0+ (для разработки)
- Для Windows: PowerShell 5.0+ (Windows 10+) или утилита unzip
- Для macOS/Linux: утилита unzip (обычно предустановлена)
- Для публикации: AWS S3 или S3-совместимое хранилище
- Для автоматических обновлений: контекст приложения NW.js (для метода `checkForUpdate`)

## Лицензия

MIT
