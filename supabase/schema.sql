-- ============================================================
-- HOLMGARD PARK CRM — Supabase (PostgreSQL) Schema
-- ============================================================
-- Миграция с Firebase Firestore (flat document store)
-- на реляционную БД с RLS, FK, индексами
-- ============================================================

-- ======================== ENUMS ========================

CREATE TYPE employee_role AS ENUM (
    'director',
    'admin',
    'senior_instructor',
    'instructor'
);

CREATE TYPE shift_role AS ENUM (
    'admin',
    'senior_instructor',
    'instructor',
    'manager'
);

CREATE TYPE event_type AS ENUM (
    'paintball',
    'laser',
    'kidball',
    'quest',
    'sup',
    'atv',
    'race',
    'rent',
    'other'
);

CREATE TYPE event_status AS ENUM (
    'pending',
    'confirmed',
    'completed',
    'cancelled'
);

CREATE TYPE discount_type AS ENUM (
    'none',
    'percent',
    'certificate'
);

CREATE TYPE payment_method AS ENUM (
    'cash',
    'card',
    'transfer',
    'sberbank',
    'tbank',
    'raiffeisen',
    'alfabank',
    'invoice',
    'qr'
);

CREATE TYPE contact_channel AS ENUM (
    'wa',
    'tg',
    'vk',
    'phone',
    'other'
);

CREATE TYPE tariff_category AS ENUM (
    'services',
    'optionsForGame',
    'options'
);

CREATE TYPE document_type AS ENUM (
    'incoming',
    'outgoing',
    'writeoff'
);

CREATE TYPE certificate_type AS ENUM (
    'electronic',
    'paper'
);

CREATE TYPE certificate_status AS ENUM (
    'active',
    'used',
    'expired'
);

CREATE TYPE fin_entry_type AS ENUM (
    'income',
    'expense'
);

-- ======================== ОРГАНИЗАЦИЯ ========================

-- Мультитенантность: одна таблица, в будущем можно добавить org
-- Сейчас единственная организация = 'holmgard'

CREATE TABLE organizations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT UNIQUE NOT NULL,  -- 'holmgard'
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO organizations (slug, name) VALUES ('holmgard', 'HOLMGARD PARK');

-- ======================== СОТРУДНИКИ ========================

CREATE TABLE employees (
    id                  BIGINT PRIMARY KEY,  -- timestamp-based ID из Firebase
    org_id              UUID NOT NULL REFERENCES organizations(id),
    first_name          TEXT NOT NULL,
    last_name           TEXT NOT NULL DEFAULT '',
    role                employee_role NOT NULL DEFAULT 'instructor',
    pin                 TEXT NOT NULL,           -- 4-значный PIN
    phone               TEXT DEFAULT '',
    email               TEXT DEFAULT '',
    dob                 DATE,
    passport            TEXT DEFAULT '',
    bank                TEXT DEFAULT '',
    blocked             BOOLEAN DEFAULT false,

    -- Роли на сменах (массив допустимых ролей)
    allowed_shift_roles shift_role[] DEFAULT '{}',

    -- Менеджерские даты
    manager_since       DATE,
    manager_until       DATE,

    -- Supabase Auth UID (связь с auth.users, добавим FK позже)
    auth_uid            UUID UNIQUE,

    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),

    UNIQUE(org_id, pin)
);

CREATE INDEX idx_employees_org ON employees(org_id);
CREATE INDEX idx_employees_role ON employees(role);
CREATE INDEX idx_employees_auth ON employees(auth_uid);

-- ======================== КЛИЕНТЫ ========================

CREATE TABLE clients (
    id              BIGINT PRIMARY KEY,  -- timestamp-based ID
    org_id          UUID NOT NULL REFERENCES organizations(id),
    first_name      TEXT NOT NULL,
    last_name       TEXT DEFAULT '',
    phone           TEXT DEFAULT '',
    email           TEXT DEFAULT '',
    dob             DATE,
    notes           TEXT DEFAULT '',
    groldiks        INTEGER DEFAULT 0,      -- бонусные баллы
    total_spent     NUMERIC(12,2) DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_clients_org ON clients(org_id);
CREATE INDEX idx_clients_phone ON clients(phone);

-- История визитов клиента
CREATE TABLE client_visits (
    id          BIGSERIAL PRIMARY KEY,
    client_id   BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    visit_date  DATE NOT NULL,
    game        TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_client_visits_client ON client_visits(client_id);

-- ======================== ТАРИФЫ ========================

CREATE TABLE tariffs (
    id                  BIGINT PRIMARY KEY,  -- timestamp-based или serial
    org_id              UUID NOT NULL REFERENCES organizations(id),
    category            tariff_category NOT NULL,
    service_id          TEXT,                   -- внутренний идентификатор
    sheet_category      TEXT,                   -- из Google Sheets
    name                TEXT NOT NULL,
    price               NUMERIC(10,2) NOT NULL DEFAULT 0,
    unit                TEXT DEFAULT 'чел',     -- 'чел', 'шт', 'час'
    duration            INTEGER DEFAULT 0,      -- минуты (для услуг)
    min_people          INTEGER DEFAULT 0,
    age                 TEXT DEFAULT '',
    included            TEXT DEFAULT '',
    description         TEXT DEFAULT '',

    -- Расход расходников на человека
    balls_per_person        INTEGER DEFAULT 0,
    kids_balls_per_person   INTEGER DEFAULT 0,
    grenades_per_person     NUMERIC(5,2) DEFAULT 0,
    smokes_per_person       NUMERIC(5,2) DEFAULT 0,

    -- Для опций: тип ввода
    input_type          TEXT,                   -- 'number', 'shop', null
    input_placeholder   TEXT DEFAULT '',
    quantity            INTEGER DEFAULT 1,

    is_active           BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tariffs_org ON tariffs(org_id);
CREATE INDEX idx_tariffs_category ON tariffs(category);

-- ======================== МЕРОПРИЯТИЯ ========================

CREATE TABLE events (
    id                  BIGINT PRIMARY KEY,
    org_id              UUID NOT NULL REFERENCES organizations(id),
    title               TEXT DEFAULT '',
    client_name         TEXT DEFAULT '',
    client_phone        TEXT DEFAULT '',
    contact_channel     contact_channel DEFAULT 'phone',

    event_date          DATE NOT NULL,
    event_time          TIME,
    duration            INTEGER DEFAULT 0,      -- минуты

    event_type          event_type NOT NULL DEFAULT 'other',
    occasion            TEXT DEFAULT '',
    player_age          TEXT DEFAULT '',
    participants        INTEGER DEFAULT 0,      -- общее число участников

    -- Цены
    price               NUMERIC(12,2) DEFAULT 0,

    -- Скидки
    discount            NUMERIC(10,2) DEFAULT 0,
    discount_type       discount_type DEFAULT 'none',
    certificate_number  TEXT,
    certificate_amount  NUMERIC(10,2) DEFAULT 0,

    -- Статус и оплата
    status              event_status DEFAULT 'pending',
    prepayment          NUMERIC(10,2) DEFAULT 0,
    prepayment_method   payment_method,
    prepayment_date     DATE,

    -- Расход расходников (заполняется при завершении)
    consumables_balls       INTEGER DEFAULT 0,
    consumables_kids_balls  INTEGER DEFAULT 0,
    consumables_grenades    INTEGER DEFAULT 0,
    consumables_smokes      INTEGER DEFAULT 0,

    -- Бонусы сотрудникам (заполняются при завершении)
    bonus_instructor_total  NUMERIC(10,2) DEFAULT 0,
    bonus_admin_total       NUMERIC(10,2) DEFAULT 0,
    bonus_per_instructor    NUMERIC(10,2) DEFAULT 0,
    bonus_per_admin         NUMERIC(10,2) DEFAULT 0,

    notes               TEXT DEFAULT '',
    source              TEXT DEFAULT 'crm',     -- 'crm' | 'gcal'
    gcal_event_id       TEXT,                   -- ID в Google Calendar
    instructor_rating   SMALLINT DEFAULT 0,     -- 0-5

    completed_at        TIMESTAMPTZ,
    completed_by        BIGINT REFERENCES employees(id),

    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_events_org ON events(org_id);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_gcal ON events(gcal_event_id);

-- Тарифные группы мероприятия (мульти-тариф)
CREATE TABLE event_tariff_groups (
    id          BIGSERIAL PRIMARY KEY,
    event_id    BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    tariff_id   BIGINT REFERENCES tariffs(id),
    participants INTEGER NOT NULL DEFAULT 0,
    sort_order  SMALLINT DEFAULT 0
);

CREATE INDEX idx_etg_event ON event_tariff_groups(event_id);

-- Выбранные опции мероприятия
CREATE TABLE event_options (
    id          BIGSERIAL PRIMARY KEY,
    event_id    BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    tariff_id   BIGINT REFERENCES tariffs(id),
    quantity    INTEGER DEFAULT 1
);

CREATE INDEX idx_eo_event ON event_options(event_id);

-- Назначенные инструкторы
CREATE TABLE event_instructors (
    event_id    BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    employee_id BIGINT NOT NULL REFERENCES employees(id),
    PRIMARY KEY (event_id, employee_id)
);

-- Назначенные администраторы
CREATE TABLE event_admins (
    event_id    BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    employee_id BIGINT NOT NULL REFERENCES employees(id),
    PRIMARY KEY (event_id, employee_id)
);

-- ======================== СМЕНЫ ========================

CREATE TABLE shifts (
    id              BIGINT PRIMARY KEY,
    org_id          UUID NOT NULL REFERENCES organizations(id),
    employee_id     BIGINT NOT NULL REFERENCES employees(id),
    shift_role      shift_role NOT NULL,
    shift_date      DATE NOT NULL,
    start_time      TIME NOT NULL,
    end_time        TIME,                       -- NULL = смена ещё открыта

    -- Рассчитанный заработок
    earnings_base   NUMERIC(10,2) DEFAULT 0,
    earnings_bonus  NUMERIC(10,2) DEFAULT 0,
    earnings_total  NUMERIC(10,2) DEFAULT 0,
    bonus_detail    TEXT DEFAULT '',

    -- Автозакрытие
    auto_closed     BOOLEAN DEFAULT false,

    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shifts_org ON shifts(org_id);
CREATE INDEX idx_shifts_employee ON shifts(employee_id);
CREATE INDEX idx_shifts_date ON shifts(shift_date);
CREATE INDEX idx_shifts_open ON shifts(employee_id) WHERE end_time IS NULL;

-- Бонусы за мероприятия в рамках смены
CREATE TABLE shift_event_bonuses (
    id          BIGSERIAL PRIMARY KEY,
    shift_id    BIGINT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    event_id    BIGINT NOT NULL REFERENCES events(id),
    amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
    bonus_type  TEXT NOT NULL DEFAULT 'instructor'  -- 'instructor' | 'admin'
);

CREATE INDEX idx_seb_shift ON shift_event_bonuses(shift_id);
CREATE INDEX idx_seb_event ON shift_event_bonuses(event_id);

-- ======================== ЗАРПЛАТА ========================

-- Правила начисления зарплаты
CREATE TABLE salary_rules (
    id              SERIAL PRIMARY KEY,
    org_id          UUID NOT NULL REFERENCES organizations(id),
    role            TEXT NOT NULL,               -- 'instructor', 'senior_instructor', 'admin', 'manager'
    shift_rate      NUMERIC(10,2) DEFAULT 0,     -- ставка за смену
    bonus_percent   NUMERIC(5,2) DEFAULT 0,      -- % от выручки
    daily_rate      NUMERIC(10,2) DEFAULT 0,     -- дневная ставка (для менеджера)
    bonus_sources   TEXT[] DEFAULT '{}',          -- ['services', 'optionsForGame', 'options']

    updated_at      TIMESTAMPTZ DEFAULT now(),

    UNIQUE(org_id, role)
);

-- Выплаты зарплаты
CREATE TABLE salary_payments (
    id              BIGINT PRIMARY KEY,
    org_id          UUID NOT NULL REFERENCES organizations(id),
    employee_id     BIGINT NOT NULL REFERENCES employees(id),
    payment_date    DATE NOT NULL,
    payment_time    TIME,
    amount          NUMERIC(10,2) NOT NULL,
    method          payment_method NOT NULL,
    note            TEXT DEFAULT '',

    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sp_org ON salary_payments(org_id);
CREATE INDEX idx_sp_employee ON salary_payments(employee_id);
CREATE INDEX idx_sp_date ON salary_payments(payment_date);

-- Исторические начисления (импорт из Excel + автогенерация)
CREATE TABLE historical_accruals (
    id              TEXT PRIMARY KEY,            -- может быть 'evtbonus_...' или числовой
    org_id          UUID NOT NULL REFERENCES organizations(id),
    employee_id     BIGINT NOT NULL REFERENCES employees(id),
    accrual_date    DATE NOT NULL,
    amount          NUMERIC(10,2) NOT NULL,
    note            TEXT DEFAULT '',

    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ha_org ON historical_accruals(org_id);
CREATE INDEX idx_ha_employee ON historical_accruals(employee_id);
CREATE INDEX idx_ha_date ON historical_accruals(accrual_date);

-- ======================== СКЛАД ========================

-- Базовые остатки (инвентаризация)
CREATE TABLE stock_base (
    id                      SERIAL PRIMARY KEY,
    org_id                  UUID NOT NULL UNIQUE REFERENCES organizations(id),
    balls                   INTEGER DEFAULT 0,
    kids_balls              INTEGER DEFAULT 0,
    grenades                INTEGER DEFAULT 0,
    smokes                  INTEGER DEFAULT 0,
    balls_critical          INTEGER DEFAULT 60000,
    kids_balls_critical     INTEGER DEFAULT 20000,
    grenades_critical       INTEGER DEFAULT 100,
    smokes_critical         INTEGER DEFAULT 50,

    updated_at              TIMESTAMPTZ DEFAULT now()
);

-- Документы прихода/расхода/списания
CREATE TABLE documents (
    id          BIGINT PRIMARY KEY,
    org_id      UUID NOT NULL REFERENCES organizations(id),
    doc_type    document_type NOT NULL,
    doc_date    DATE NOT NULL,
    item        TEXT NOT NULL,           -- 'Пейнтбольные шары 0.68', etc.
    qty         INTEGER NOT NULL DEFAULT 0,
    amount      NUMERIC(12,2) DEFAULT 0, -- сумма закупки
    delivery    NUMERIC(10,2) DEFAULT 0, -- стоимость доставки
    comment     TEXT DEFAULT '',
    event_id    BIGINT REFERENCES events(id),  -- для списаний

    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_docs_org ON documents(org_id);
CREATE INDEX idx_docs_date ON documents(doc_date);
CREATE INDEX idx_docs_type ON documents(doc_type);
CREATE INDEX idx_docs_item ON documents(item);

-- View: текущий склад (вычисляется из документов)
CREATE OR REPLACE VIEW stock_current AS
SELECT
    sb.org_id,
    sb.balls + COALESCE(d_balls.total, 0)           AS balls,
    sb.kids_balls + COALESCE(d_kids.total, 0)        AS kids_balls,
    sb.grenades + COALESCE(d_grenades.total, 0)      AS grenades,
    sb.smokes + COALESCE(d_smokes.total, 0)          AS smokes,
    sb.balls_critical,
    sb.kids_balls_critical,
    sb.grenades_critical,
    sb.smokes_critical
FROM stock_base sb
LEFT JOIN LATERAL (
    SELECT SUM(
        CASE WHEN doc_type = 'incoming' THEN qty ELSE -qty END
    ) AS total
    FROM documents
    WHERE org_id = sb.org_id AND item = 'Пейнтбольные шары 0.68'
) d_balls ON true
LEFT JOIN LATERAL (
    SELECT SUM(
        CASE WHEN doc_type = 'incoming' THEN qty ELSE -qty END
    ) AS total
    FROM documents
    WHERE org_id = sb.org_id AND item = 'Детские пейнтбольные шары 0.50'
) d_kids ON true
LEFT JOIN LATERAL (
    SELECT SUM(
        CASE WHEN doc_type = 'incoming' THEN qty ELSE -qty END
    ) AS total
    FROM documents
    WHERE org_id = sb.org_id AND item = 'Гранаты'
) d_grenades ON true
LEFT JOIN LATERAL (
    SELECT SUM(
        CASE WHEN doc_type = 'incoming' THEN qty ELSE -qty END
    ) AS total
    FROM documents
    WHERE org_id = sb.org_id AND item = 'Дымы'
) d_smokes ON true;

-- ======================== СЕРТИФИКАТЫ ========================

CREATE TABLE certificates (
    id              BIGINT PRIMARY KEY,
    org_id          UUID NOT NULL REFERENCES organizations(id),
    cert_type       certificate_type NOT NULL,
    cert_number     TEXT NOT NULL,           -- 'ЭС-2026-0001'
    initial_amount  NUMERIC(10,2) NOT NULL,
    remaining_amount NUMERIC(10,2) NOT NULL,
    status          certificate_status DEFAULT 'active',

    created_date    DATE NOT NULL,
    expiry_date     DATE NOT NULL,
    buyer_name      TEXT DEFAULT '',
    buyer_phone     TEXT DEFAULT '',
    payment_method  payment_method,
    transfer_bank   TEXT,                    -- 'sberbank', 'tbank', etc.
    note            TEXT DEFAULT '',

    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),

    UNIQUE(org_id, cert_number)
);

CREATE INDEX idx_certs_org ON certificates(org_id);
CREATE INDEX idx_certs_status ON certificates(status);
CREATE INDEX idx_certs_number ON certificates(cert_number);

-- Использование сертификатов
CREATE TABLE certificate_usage (
    id              BIGSERIAL PRIMARY KEY,
    certificate_id  BIGINT NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
    event_id        BIGINT REFERENCES events(id),
    usage_date      DATE NOT NULL,
    event_title     TEXT DEFAULT '',
    amount          NUMERIC(10,2) NOT NULL,

    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cu_cert ON certificate_usage(certificate_id);

-- ======================== ФИНАНСЫ ========================

-- Ручные финансовые записи
CREATE TABLE financial_entries (
    id          BIGINT PRIMARY KEY,
    org_id      UUID NOT NULL REFERENCES organizations(id),
    entry_type  fin_entry_type NOT NULL,
    entry_date  DATE NOT NULL,
    amount      NUMERIC(12,2) NOT NULL,
    description TEXT DEFAULT '',
    method      payment_method,
    comment     TEXT DEFAULT '',

    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fe_org ON financial_entries(org_id);
CREATE INDEX idx_fe_date ON financial_entries(entry_date);
CREATE INDEX idx_fe_type ON financial_entries(entry_type);

-- ======================== ЦЕНЫ РАСХОДНИКОВ ========================

CREATE TABLE consumable_prices (
    id          SERIAL PRIMARY KEY,
    org_id      UUID NOT NULL REFERENCES organizations(id),
    item_key    TEXT NOT NULL,           -- 'balls', 'kidsBalls', 'grenades', 'smokes'
    price       NUMERIC(10,4) NOT NULL DEFAULT 0,

    updated_at  TIMESTAMPTZ DEFAULT now(),

    UNIQUE(org_id, item_key)
);

-- ======================== НАСТРОЙКИ ========================

CREATE TABLE org_settings (
    id              SERIAL PRIMARY KEY,
    org_id          UUID NOT NULL UNIQUE REFERENCES organizations(id),
    loyalty_percent NUMERIC(5,2) DEFAULT 5,
    accent_color    TEXT DEFAULT '#FFD600',

    -- Google Calendar интеграция
    gcal_apps_script_url TEXT,
    gcal_calendar_id     TEXT DEFAULT 'holmgardpark@gmail.com',
    gcal_token           JSONB,          -- OAuth token object
    gcal_event_map       JSONB DEFAULT '{}',  -- CRM_ID → GCal_ID mapping

    -- Google Sheets
    gsheets_id           TEXT,

    -- Employee dashboard order
    emp_dash_order       JSONB,
    dir_salary_order     JSONB,

    updated_at           TIMESTAMPTZ DEFAULT now()
);

-- ======================== ИСТОРИЧЕСКАЯ ВЫРУЧКА ========================

-- Данные из sales-history.js (перенос в БД для запросов)
CREATE TABLE historical_sales (
    id          BIGSERIAL PRIMARY KEY,
    org_id      UUID NOT NULL REFERENCES organizations(id),
    sale_date   DATE NOT NULL,
    category    TEXT NOT NULL,           -- 'Пейнтбол', 'Кидбол', etc.
    title       TEXT DEFAULT '',
    participants INTEGER DEFAULT 0,
    amount      NUMERIC(12,2) NOT NULL,
    is_yearly   BOOLEAN DEFAULT false,   -- годовая сводка
    method      TEXT,                    -- 'Наличные', 'Безналичный', etc.

    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_hs_org ON historical_sales(org_id);
CREATE INDEX idx_hs_date ON historical_sales(sale_date);
CREATE INDEX idx_hs_category ON historical_sales(category);

-- ======================== МИГРАЦИОННЫЕ ФЛАГИ ========================
-- (Временная таблица — для отслеживания миграций при переходе)

CREATE TABLE migration_flags (
    org_id      UUID NOT NULL REFERENCES organizations(id),
    flag_key    TEXT NOT NULL,
    value       BOOLEAN DEFAULT true,
    migrated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (org_id, flag_key)
);

-- ======================== ROW LEVEL SECURITY ========================

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_tariff_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_event_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_accruals ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificate_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumable_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_sales ENABLE ROW LEVEL SECURITY;

-- Хелпер: получить org_id текущего пользователя
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT org_id FROM employees WHERE auth_uid = auth.uid() LIMIT 1;
$$;

-- Хелпер: проверить роль текущего пользователя
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS employee_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT role FROM employees WHERE auth_uid = auth.uid() LIMIT 1;
$$;

-- === RLS Policies ===

-- Сотрудники: все видят коллег своей организации
CREATE POLICY employees_select ON employees
    FOR SELECT USING (org_id = get_user_org_id());

-- Сотрудники: только директор может изменять
CREATE POLICY employees_modify ON employees
    FOR ALL USING (
        org_id = get_user_org_id() AND get_user_role() = 'director'
    );

-- Макро-политика: все таблицы с org_id — доступ по организации
-- Чтение — всем сотрудникам организации
-- Запись — только директору

-- Клиенты
CREATE POLICY clients_select ON clients
    FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY clients_modify ON clients
    FOR ALL USING (org_id = get_user_org_id() AND get_user_role() = 'director');

-- Тарифы (чтение всем, запись директору)
CREATE POLICY tariffs_select ON tariffs
    FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY tariffs_modify ON tariffs
    FOR ALL USING (org_id = get_user_org_id() AND get_user_role() = 'director');

-- Мероприятия (чтение всем, запись директору + админу)
CREATE POLICY events_select ON events
    FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY events_modify ON events
    FOR ALL USING (
        org_id = get_user_org_id()
        AND get_user_role() IN ('director', 'admin')
    );

-- Смены — сотрудник может создать/изменить свою, директор — любую
CREATE POLICY shifts_select ON shifts
    FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY shifts_insert ON shifts
    FOR INSERT WITH CHECK (
        org_id = get_user_org_id()
        AND (employee_id = (SELECT id FROM employees WHERE auth_uid = auth.uid())
             OR get_user_role() = 'director')
    );
CREATE POLICY shifts_update ON shifts
    FOR UPDATE USING (
        org_id = get_user_org_id()
        AND (employee_id = (SELECT id FROM employees WHERE auth_uid = auth.uid())
             OR get_user_role() = 'director')
    );

-- Зарплата — чтение всем, запись директору
CREATE POLICY salary_payments_select ON salary_payments
    FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY salary_payments_modify ON salary_payments
    FOR ALL USING (org_id = get_user_org_id() AND get_user_role() = 'director');

-- Правила зарплаты — чтение всем, запись директору
CREATE POLICY salary_rules_select ON salary_rules
    FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY salary_rules_modify ON salary_rules
    FOR ALL USING (org_id = get_user_org_id() AND get_user_role() = 'director');

-- Исторические начисления
CREATE POLICY ha_select ON historical_accruals
    FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY ha_modify ON historical_accruals
    FOR ALL USING (org_id = get_user_org_id() AND get_user_role() = 'director');

-- Документы склада
CREATE POLICY docs_select ON documents
    FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY docs_modify ON documents
    FOR ALL USING (org_id = get_user_org_id() AND get_user_role() = 'director');

-- Склад базовый
CREATE POLICY stock_select ON stock_base
    FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY stock_modify ON stock_base
    FOR ALL USING (org_id = get_user_org_id() AND get_user_role() = 'director');

-- Сертификаты
CREATE POLICY certs_select ON certificates
    FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY certs_modify ON certificates
    FOR ALL USING (org_id = get_user_org_id() AND get_user_role() = 'director');

-- Финансы
CREATE POLICY fe_select ON financial_entries
    FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY fe_modify ON financial_entries
    FOR ALL USING (org_id = get_user_org_id() AND get_user_role() = 'director');

-- Настройки
CREATE POLICY settings_select ON org_settings
    FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY settings_modify ON org_settings
    FOR ALL USING (org_id = get_user_org_id() AND get_user_role() = 'director');

-- Дочерние таблицы (через JOIN с родителем)
CREATE POLICY etg_select ON event_tariff_groups
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.org_id = get_user_org_id())
    );
CREATE POLICY etg_modify ON event_tariff_groups
    FOR ALL USING (
        EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.org_id = get_user_org_id()
            AND get_user_role() IN ('director', 'admin'))
    );

CREATE POLICY eo_select ON event_options
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.org_id = get_user_org_id())
    );
CREATE POLICY eo_modify ON event_options
    FOR ALL USING (
        EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.org_id = get_user_org_id()
            AND get_user_role() IN ('director', 'admin'))
    );

CREATE POLICY ei_select ON event_instructors
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.org_id = get_user_org_id())
    );
CREATE POLICY ei_modify ON event_instructors
    FOR ALL USING (
        EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.org_id = get_user_org_id()
            AND get_user_role() IN ('director', 'admin'))
    );

CREATE POLICY ea_select ON event_admins
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.org_id = get_user_org_id())
    );
CREATE POLICY ea_modify ON event_admins
    FOR ALL USING (
        EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.org_id = get_user_org_id()
            AND get_user_role() IN ('director', 'admin'))
    );

CREATE POLICY seb_select ON shift_event_bonuses
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM shifts s WHERE s.id = shift_id AND s.org_id = get_user_org_id())
    );

CREATE POLICY cu_select ON certificate_usage
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM certificates c WHERE c.id = certificate_id AND c.org_id = get_user_org_id())
    );

CREATE POLICY cv_select ON client_visits
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id AND c.org_id = get_user_org_id())
    );

CREATE POLICY hs_select ON historical_sales
    FOR SELECT USING (org_id = get_user_org_id());

-- ======================== RPC FUNCTIONS ========================

-- Рассчитать текущий склад
CREATE OR REPLACE FUNCTION get_stock_current(p_org_id UUID)
RETURNS TABLE (
    balls INTEGER,
    kids_balls INTEGER,
    grenades INTEGER,
    smokes INTEGER,
    balls_critical INTEGER,
    kids_balls_critical INTEGER,
    grenades_critical INTEGER,
    smokes_critical INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM stock_current WHERE org_id = p_org_id;
END;
$$;

-- Рассчитать заработок за период
CREATE OR REPLACE FUNCTION get_employee_earnings(
    p_employee_id BIGINT,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    shift_base NUMERIC,
    shift_bonus NUMERIC,
    manager_accruals NUMERIC,
    historical_accruals_sum NUMERIC,
    total_earned NUMERIC,
    total_paid NUMERIC,
    debt NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_shift_base NUMERIC := 0;
    v_shift_bonus NUMERIC := 0;
    v_mgr_accruals NUMERIC := 0;
    v_hist_accruals NUMERIC := 0;
    v_total_paid NUMERIC := 0;
    v_org_id UUID;
BEGIN
    -- Получаем org_id сотрудника
    SELECT e.org_id INTO v_org_id FROM employees e WHERE e.id = p_employee_id;

    -- Заработок со смен (не менеджерских)
    SELECT
        COALESCE(SUM(s.earnings_base), 0),
        COALESCE(SUM(s.earnings_bonus), 0)
    INTO v_shift_base, v_shift_bonus
    FROM shifts s
    WHERE s.employee_id = p_employee_id
        AND s.end_time IS NOT NULL
        AND s.shift_date BETWEEN p_start_date AND p_end_date
        AND s.shift_role != 'manager';

    -- Менеджерские начисления (дневная ставка)
    SELECT COALESCE(SUM(sr.daily_rate), 0) INTO v_mgr_accruals
    FROM salary_rules sr, employees emp,
         generate_series(p_start_date, p_end_date, '1 day'::interval) d(dt)
    WHERE sr.org_id = v_org_id
        AND sr.role = 'manager'
        AND emp.id = p_employee_id
        AND emp.manager_since IS NOT NULL
        AND d.dt::date >= emp.manager_since
        AND (emp.manager_until IS NULL OR d.dt::date <= emp.manager_until)
        AND d.dt::date >= '2026-04-01';

    -- Исторические начисления
    SELECT COALESCE(SUM(ha.amount), 0) INTO v_hist_accruals
    FROM historical_accruals ha
    WHERE ha.employee_id = p_employee_id
        AND ha.accrual_date BETWEEN p_start_date AND p_end_date;

    -- Выплаты (всегда all-time для баланса)
    SELECT COALESCE(SUM(sp.amount), 0) INTO v_total_paid
    FROM salary_payments sp
    WHERE sp.employee_id = p_employee_id;

    RETURN QUERY SELECT
        v_shift_base,
        v_shift_bonus,
        v_mgr_accruals,
        v_hist_accruals,
        v_shift_base + v_shift_bonus + v_mgr_accruals + v_hist_accruals,
        v_total_paid,
        (v_shift_base + v_shift_bonus + v_mgr_accruals + v_hist_accruals) - v_total_paid;
END;
$$;

-- Автозакрытие смен в 23:23
CREATE OR REPLACE FUNCTION auto_close_shifts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    closed_count INTEGER := 0;
BEGIN
    UPDATE shifts
    SET end_time = '23:23'::TIME,
        auto_closed = true,
        updated_at = now()
    WHERE end_time IS NULL
        AND shift_date < CURRENT_DATE;

    GET DIAGNOSTICS closed_count = ROW_COUNT;
    RETURN closed_count;
END;
$$;

-- ======================== TRIGGERS ========================

-- Автообновление updated_at
CREATE OR REPLACE FUNCTION trigger_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();
CREATE TRIGGER trg_tariffs_updated BEFORE UPDATE ON tariffs
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();
CREATE TRIGGER trg_events_updated BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();
CREATE TRIGGER trg_shifts_updated BEFORE UPDATE ON shifts
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();
CREATE TRIGGER trg_certificates_updated BEFORE UPDATE ON certificates
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();
CREATE TRIGGER trg_stock_updated BEFORE UPDATE ON stock_base
    FOR EACH ROW EXECUTE FUNCTION trigger_updated_at();

-- ======================== REALTIME ========================
-- Включить Supabase Realtime для таблиц, которые нужны в реальном времени

ALTER PUBLICATION supabase_realtime ADD TABLE employees;
ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE shifts;
ALTER PUBLICATION supabase_realtime ADD TABLE documents;
ALTER PUBLICATION supabase_realtime ADD TABLE salary_payments;
ALTER PUBLICATION supabase_realtime ADD TABLE historical_accruals;
ALTER PUBLICATION supabase_realtime ADD TABLE certificates;
ALTER PUBLICATION supabase_realtime ADD TABLE stock_base;

-- ======================== CRON (pg_cron) ========================
-- Автозакрытие смен каждый день в 23:23

-- SELECT cron.schedule(
--     'auto-close-shifts',
--     '23 23 * * *',
--     'SELECT auto_close_shifts()'
-- );

-- ======================== SEED DATA ========================

-- Начальные правила зарплаты
INSERT INTO salary_rules (org_id, role, shift_rate, bonus_percent, daily_rate, bonus_sources) VALUES
    ((SELECT id FROM organizations WHERE slug = 'holmgard'), 'instructor', 1500, 5, 0, ARRAY['services', 'optionsForGame']),
    ((SELECT id FROM organizations WHERE slug = 'holmgard'), 'senior_instructor', 2000, 5, 0, ARRAY['services', 'optionsForGame']),
    ((SELECT id FROM organizations WHERE slug = 'holmgard'), 'admin', 0, 5, 0, ARRAY['services', 'optionsForGame', 'options']),
    ((SELECT id FROM organizations WHERE slug = 'holmgard'), 'manager', 0, 0, 340, ARRAY[]::TEXT[]);

-- Начальные остатки склада
INSERT INTO stock_base (org_id) VALUES
    ((SELECT id FROM organizations WHERE slug = 'holmgard'));

-- Настройки организации
INSERT INTO org_settings (org_id) VALUES
    ((SELECT id FROM organizations WHERE slug = 'holmgard'));
