# Holmgard CRM: План миграции Firebase → Supabase

## Архитектура

### Было (Firebase)
```
Firebase Auth (email/password)
    ↓
Firestore: orgs/holmgard/data/{key}
    ↓
38 ключей = 38 JSON-документов (flat, без связей)
    ↓
Клиент: DB.get/DB.set (in-memory cache + onSnapshot)
```

### Будет (Supabase)
```
Supabase Auth (email/password, совместим с Firebase)
    ↓
PostgreSQL: 22 таблицы с FK, индексами, RLS
    ↓
Supabase Realtime (заменяет onSnapshot)
    ↓
Клиент: supabase-js SDK (прямые запросы + подписки)
```

## Файлы

| Файл | Описание |
|------|----------|
| `supabase/schema.sql` | Полная SQL-схема: таблицы, индексы, RLS, функции, триггеры |
| `supabase/migrate-data.js` | Node.js скрипт миграции данных из Firestore |

## Таблицы (22 штуки)

### Основные сущности
| Таблица | Firestore ключ | Записей (прим.) |
|---------|----------------|-----------------|
| `organizations` | — | 1 |
| `employees` | `employees` | ~10 |
| `clients` | `clients` | ~100 |
| `tariffs` | `tariffs` | ~30 |
| `events` | `events` | ~500 |
| `shifts` | `shifts` | ~300 |
| `certificates` | `certificates` | ~20 |
| `documents` | `documents` | ~100 |

### Связующие (нормализация)
| Таблица | Из поля |
|---------|---------|
| `event_tariff_groups` | `event.tariffGroups[]` |
| `event_options` | `event.selectedOptions[]` + `optionQuantities` |
| `event_instructors` | `event.instructors[]` |
| `event_admins` | `event.admins[]` |
| `shift_event_bonuses` | `shift.eventBonuses[]` |
| `client_visits` | `client.visits[]` |
| `certificate_usage` | `certificate.usageHistory[]` |

### Зарплата
| Таблица | Firestore ключ |
|---------|----------------|
| `salary_rules` | `salaryRules` (объект → 4 строки по ролям) |
| `salary_payments` | `salaryPayments` |
| `historical_accruals` | `historicalAccruals` |

### Склад и настройки
| Таблица | Firestore ключ |
|---------|----------------|
| `stock_base` | `stockBase` |
| `financial_entries` | `finEntries` |
| `consumable_prices` | `consumablePrices` |
| `org_settings` | `loyaltyPercent`, `accentColor`, `gcal_*`, etc. |
| `historical_sales` | `HISTORICAL_SALES_DATA` (из sales-history.js) |
| `migration_flags` | Все `*_v1..v10` флаги |

### Вычисляемые данные (View)
| View | Описание |
|------|----------|
| `stock_current` | Текущий склад = `stock_base + Σ(docs)` |

## Маппинг полей: camelCase → snake_case

Все поля переименованы в snake_case для PostgreSQL:

```
firstName       → first_name
lastName        → last_name
employeeId      → employee_id
shiftRole       → shift_role
tariffId        → tariff_id
clientName      → client_name
clientPhone     → client_phone
contactChannel  → contact_channel
eventDate       → event_date
eventTime       → event_time
eventType       → event_type
playerAge       → player_age
discountType    → discount_type
prepaymentDate  → prepayment_date
ballsPerPerson  → balls_per_person
managerSince    → manager_since
managerUntil    → manager_until
bonusPercent    → bonus_percent
dailyRate       → daily_rate
shiftRate       → shift_rate
bonusSources    → bonus_sources
```

## Что улучшается

### 1. Нормализация данных
- **Было**: массивы в полях JSON (`event.instructors`, `event.tariffGroups`)
- **Стало**: отдельные таблицы с FK → целостность данных

### 2. Row Level Security
- Каждый сотрудник видит только данные своей организации
- Директор может изменять, остальные — только чтение
- Сотрудники могут управлять своими сменами

### 3. Вычисляемый склад (View)
- **Было**: `getStockFromDocs()` в JS каждый раз пересчитывает
- **Стало**: PostgreSQL View `stock_current` — автоматически

### 4. Серверные функции (RPC)
- `get_employee_earnings()` — расчёт зарплаты на сервере
- `auto_close_shifts()` — автозакрытие по cron, не клиентом

### 5. Realtime
- **Было**: Firestore `onSnapshot` на каждый ключ
- **Стало**: Supabase Realtime на нужные таблицы

### 6. Типизация
- ENUM-ы вместо строк → невозможно записать невалидные данные
- FK → нельзя сослаться на несуществующую сущность
- NOT NULL / DEFAULT → гарантия формата

## План перехода (этапы)

### Этап 1: Подготовка Supabase ✅
- [x] Создать проект Supabase
- [x] Выполнить `schema.sql`
- [x] Проверить таблицы, RLS, функции

### Этап 2: Миграция данных
- [ ] Получить Firebase service account JSON
- [ ] Экспортировать `HISTORICAL_SALES_DATA` в JSON
- [ ] Запустить `migrate-data.js`
- [ ] Верифицировать: сравнить количество записей Firebase ↔ Supabase
- [ ] Связать employees с Supabase Auth (auth_uid)

### Этап 3: Создать `js/supabase-db.js` (новый слой данных)
- [ ] Инициализация Supabase client
- [ ] Реализовать `DB.get()` / `DB.set()` через Supabase queries
- [ ] Realtime подписки (заменят `onSnapshot`)
- [ ] In-memory cache (как сейчас, но источник — Supabase)

### Этап 4: Заменить `auth.js`
- [ ] Supabase Auth вместо Firebase Auth
- [ ] PIN-логика остаётся (проверка по таблице employees)
- [ ] Миграция пользователей Firebase Auth → Supabase Auth

### Этап 5: Переключение фронтенда
- [ ] Подключить `supabase-db.js` вместо Firebase
- [ ] Убрать Firebase SDK из `index.html`
- [ ] Обновить `app.js`: адаптировать запросы
- [ ] Тестирование всех разделов

### Этап 6: Cleanup
- [ ] Удалить Firebase зависимости
- [ ] Удалить миграционные функции (v4-v10)
- [ ] Обновить SW и manifest
- [ ] Деплой

## Безопасность

### RLS Policies (краткая сводка)
| Таблица | SELECT | INSERT/UPDATE/DELETE |
|---------|--------|---------------------|
| employees | org members | director only |
| events | org members | director + admin |
| shifts | org members | own shifts + director |
| salary_* | org members | director only |
| documents | org members | director only |
| settings | org members | director only |

### Функции (SECURITY DEFINER)
- `get_user_org_id()` — org_id текущего пользователя
- `get_user_role()` — роль текущего пользователя
- `get_employee_earnings()` — расчёт зарплаты
- `auto_close_shifts()` — автозакрытие смен

## Realtime подписки

Таблицы с Realtime:
- `employees` — обновление списка / блокировка
- `events` — новые/изменённые мероприятия
- `shifts` — открытие/закрытие смен
- `documents` — склад
- `salary_payments` — выплаты
- `historical_accruals` — начисления
- `certificates` — сертификаты
- `stock_base` — инвентаризация

## Совместимость с Google Calendar / Sheets

GCal и GSheets интеграции остаются на фронтенде (OAuth + Apps Script).
Данные синхронизации (`gcal_token`, `gcal_event_map`) хранятся в `org_settings`.
При необходимости можно перенести синхронизацию на Supabase Edge Functions.
