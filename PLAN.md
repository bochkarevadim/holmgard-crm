# План: Миграция с localStorage на Firebase Firestore

## Суть
Заменить localStorage на Firestore как основную базу данных. Все устройства сотрудников будут видеть одни и те же данные в реальном времени.

## Архитектура

### Текущий поток данных:
```
DB.set(key, val) → localStorage → GSheetsSync (опционально)
DB.get(key) → localStorage
```

### Новый поток данных:
```
DB.set(key, val) → кэш в памяти + запись в Firestore → GSheetsSync (опционально)
DB.get(key) → кэш в памяти (синхронно, мгновенно)
Firestore onSnapshot → обновление кэша → перерисовка UI на всех устройствах
```

### Структура Firestore
Путь: `orgs/holmgard/data/{key}` — общий для всех сотрудников парка.
Каждый документ: `{ value: <данные>, updatedAt: serverTimestamp() }`

## Шаги реализации

### Шаг 1. index.html — добавить Firestore SDK
Добавить `firebase-firestore-compat.js` после `firebase-auth-compat.js`

### Шаг 2. app.js — переписать объект DB (строки 20-38)
Новый DB:
- `DB.get(key)` — читает из `_cache` (мгновенно, синхронно)
- `DB.set(key, val)` — пишет в `_cache` + асинхронно в Firestore + GSheetsSync
- `DB.remove(key)` — удаляет из кэша и Firestore
- `DB.initFirestore(uid)` — подключение, onSnapshot слушатели, офлайн-кэш
- `DB.teardown()` — отключение при выходе
- `DB.migrateFromLocalStorage()` — одноразовая миграция данных в Firestore
- `DB.onChange(callback)` — колбэк для обновления UI при изменениях с других устройств

12 ключей переезжают в Firestore: employees, events, clients, tariffs, shifts, stock, salaryRules, finances, documents, loyaltyPercent, accentColor, empDashOrder + флаги миграций (initialized, roles_version_v2, multirole_v1, stock_critical_v1, consumables_v1, tariffs_version).

Настройки интеграций (gcal, gsheets, atol) остаются в localStorage — они привязаны к устройству.

### Шаг 3. auth.js — инициализация Firestore после авторизации
В `onAuthStateChanged`:
1. `await DB.initFirestore(uid)` — подключаемся к Firestore, ждём первый снапшот
2. `await DB.migrateFromLocalStorage()` — переносим данные из localStorage (если есть)
3. `initData()` + `runDataMigrations()` — создание демо-данных или миграции
4. На выходе (signOut) — `DB.teardown()`

### Шаг 4. app.js — вынести initData() и миграции из DOMContentLoaded
- `initData()` вызывается из auth.js (после Firestore готов), НЕ из DOMContentLoaded
- Миграции (roles_version_v2, multirole_v1, и т.д.) — в функцию `runDataMigrations()`
- DOMContentLoaded — только UI-инициализация (initPinPad, initNavigation, и т.д.)

### Шаг 5. app.js — добавить DB.onChange для realtime UI
При изменении данных с другого устройства — перерисовать активную страницу (loadDashboard, loadEmployees, renderCalendar, loadFinances, loadDocuments, loadClients, loadDirectorTariffs).

### Шаг 6. app.js — обновить кнопку «Сброс данных»
Удалять данные не только из localStorage, но и из Firestore (batch delete всех документов).

### Шаг 7. gsheets.js — исправить pullAllData()
Заменить прямые `localStorage.setItem` на `DB._skipSync = true` + `DB.set()`, чтобы данные писались в Firestore.

### Шаг 8. Firebase Console — Firestore и правила безопасности
- Включить Firestore в проекте holmgard-crm-c5680
- Правила: только авторизованные пользователи могут читать/писать в `orgs/holmgard/data/*`

## Тестирование
1. Свежая установка — демо-данные создаются и пушатся в Firestore
2. Существующий пользователь — данные из localStorage мигрируют в Firestore
3. Новое устройство — данные подтягиваются из Firestore, демо-данные НЕ перезаписывают
4. Realtime — два устройства, изменение на одном видно на другом
5. Оффлайн — работает, синхронизируется при восстановлении сети
6. Google Sheets — auto-sync продолжает работать
7. Сброс данных — очищает и localStorage и Firestore
