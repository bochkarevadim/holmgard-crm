/* ============================
   HOLMGARD PARK CRM — SUPABASE DATA LAYER
   ============================

   Заменяет Firestore-слой в app.js.

   Совместимый API:
       DB.get(key, fallback)
       DB.set(key, value)
       DB.remove(key)
       DB.initFirestore()       — запускает загрузку + realtime (название оставлено для совместимости)
       DB.teardown()
       DB.onChange(cb)

   Под капотом:
       • Все данные маппятся между camelCase (плоский ключ) и нормализованными таблицами snake_case
       • In-memory cache (как в Firestore-версии) — синхронный get()
       • Supabase Realtime — заменяет onSnapshot
*/

const SUPABASE_URL = 'https://zubxspuiogpyvnaevpxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YnhzcHVpb2dweXZuYWV2cHh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMTEyNTgsImV4cCI6MjA5MTY4NzI1OH0.0YoLXHBahPOXAcLsJiW1HnJg27ifhzm9A8YaF-r2GV8';

// ============================================================
// SUPABASE CLIENT
// ============================================================
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'hp_supabase_auth' },
    realtime: { params: { eventsPerSecond: 10 } }
});

// ============================================================
// FIRESTORE_KEYS — плоские ключи, которые использует app.js
// ============================================================
const FIRESTORE_KEYS = new Set([
    'employees', 'events', 'clients', 'tariffs', 'shifts',
    'stock', 'salaryRules', 'finances', 'documents',
    'loyaltyPercent', 'accentColor', 'empDashOrder',
    'initialized', 'roles_version_v2', 'multirole_v1',
    'stock_critical_v1', 'stock_kids_v1', 'consumables_v1', 'tariffs_version',
    'certificates', 'finEntries', 'salaryPayments',
    'gcal_token', 'gcal_apps_script_url', 'gcal_calendar_id', 'gcal_event_map',
    'consumablePrices',
    'directorDashOrder', 'dirSalaryOrder',
    'salary_import_v1', 'salary_import_v2', 'salary_import_v3', 'salary_import_v4',
    'salary_import_v5', 'salary_import_v5b', 'stock_recalc_v6', 'salary_cleanup_v7',
    'bonus_recalc_v8', 'bonus_recalc_v8b', 'bonus_recalc_v8c', 'bonus_recalc_v8d',
    'price_recalc_v9', 'deletedSalaryPaymentIds', 'historicalAccruals',
    'stockBase', 'stock_docs_v10'
]);

const MIGRATION_FLAG_KEYS = new Set([
    'initialized', 'roles_version_v2', 'multirole_v1',
    'stock_critical_v1', 'stock_kids_v1', 'consumables_v1', 'tariffs_version',
    'salary_import_v1', 'salary_import_v2', 'salary_import_v3', 'salary_import_v4',
    'salary_import_v5', 'salary_import_v5b', 'stock_recalc_v6', 'salary_cleanup_v7',
    'bonus_recalc_v8', 'bonus_recalc_v8b', 'bonus_recalc_v8c', 'bonus_recalc_v8d',
    'price_recalc_v9', 'stock_docs_v10'
]);

const SETTINGS_KEYS_MAP = {
    loyaltyPercent: 'loyalty_percent',
    accentColor: 'accent_color',
    gcal_token: 'gcal_token',
    gcal_apps_script_url: 'gcal_apps_script_url',
    gcal_calendar_id: 'gcal_calendar_id',
    gcal_event_map: 'gcal_event_map',
    empDashOrder: 'emp_dash_order',
    directorDashOrder: 'dir_salary_order',
    dirSalaryOrder: 'dir_salary_order',
    deletedSalaryPaymentIds: 'deleted_salary_payment_ids'
};

// ============================================================
// DB OBJECT (совместимый API с Firestore-версией)
// ============================================================
const DB = {
    _cache: {},
    _orgId: null,
    _ready: false,
    _readyPromise: null,
    _readyResolve: null,
    _channels: [],
    _onChangeCallbacks: [],
    _writing: new Set(),  // чтобы не срабатывать realtime от своих записей
    _writeQueue: new Map(),
    _pendingFlush: null,

    // ─── SYNC API (как было в Firestore) ───────────────────
    get(key, fallback = null) {
        if (FIRESTORE_KEYS.has(key)) {
            const v = this._cache[key];
            return v !== undefined ? v : fallback;
        }
        try {
            const d = localStorage.getItem('hp_' + key);
            return d ? JSON.parse(d) : fallback;
        } catch { return fallback; }
    },

    set(key, val) {
        if (FIRESTORE_KEYS.has(key)) {
            this._cache[key] = val;
            // Дебаунс записи чтобы не долбить БД на каждый чих
            this._writeQueue.set(key, val);
            this._scheduleFlush();
        } else {
            localStorage.setItem('hp_' + key, JSON.stringify(val));
        }
    },

    remove(key) {
        if (FIRESTORE_KEYS.has(key)) {
            delete this._cache[key];
            this._writeQueue.set(key, null);
            this._scheduleFlush();
        } else {
            localStorage.removeItem('hp_' + key);
        }
    },

    _scheduleFlush() {
        if (this._pendingFlush) return;
        this._pendingFlush = setTimeout(() => {
            this._pendingFlush = null;
            this._flushWrites();
        }, 200);
    },

    async _flushWrites() {
        if (this._writeQueue.size === 0) return;
        const entries = Array.from(this._writeQueue.entries());
        this._writeQueue.clear();
        for (const [key, val] of entries) {
            try { await this._writeKey(key, val); }
            catch (e) { console.error('DB write error:', key, e); }
        }
    },

    // ─── INIT ───────────────────────────────────────────────
    async initFirestore() {
        this._readyPromise = new Promise(resolve => { this._readyResolve = resolve; });

        // Получить org_id (для первого прохода — всегда holmgard)
        const { data: org, error: orgErr } = await sb
            .from('organizations').select('id').eq('slug', 'holmgard').single();
        if (orgErr) {
            console.error('Supabase org fetch error:', orgErr);
            this._ready = true;
            this._readyResolve();
            return this._readyPromise;
        }
        this._orgId = org.id;

        // Загрузить все данные параллельно
        await this._loadAll();

        // Подписки realtime
        this._subscribeRealtime();

        this._ready = true;
        this._readyResolve();
        return this._readyPromise;
    },

    async _loadAll() {
        const [
            employees, clients, clientVisits, tariffs, events,
            etg, eo, ei, ea, shifts, shiftBonuses,
            salaryRules, salaryPayments, historicalAccruals,
            documents, stockBase, certificates, certUsage,
            finEntries, orgSettings, consumablePrices, migrationFlags
        ] = await Promise.all([
            sb.from('employees').select('*').eq('org_id', this._orgId),
            sb.from('clients').select('*').eq('org_id', this._orgId),
            sb.from('client_visits').select('*'),
            sb.from('tariffs').select('*').eq('org_id', this._orgId),
            sb.from('events').select('*').eq('org_id', this._orgId),
            sb.from('event_tariff_groups').select('*'),
            sb.from('event_options').select('*'),
            sb.from('event_instructors').select('*'),
            sb.from('event_admins').select('*'),
            sb.from('shifts').select('*').eq('org_id', this._orgId),
            sb.from('shift_event_bonuses').select('*'),
            sb.from('salary_rules').select('*').eq('org_id', this._orgId),
            sb.from('salary_payments').select('*').eq('org_id', this._orgId),
            sb.from('historical_accruals').select('*').eq('org_id', this._orgId),
            sb.from('documents').select('*').eq('org_id', this._orgId),
            sb.from('stock_base').select('*').eq('org_id', this._orgId).maybeSingle(),
            sb.from('certificates').select('*').eq('org_id', this._orgId),
            sb.from('certificate_usage').select('*'),
            sb.from('financial_entries').select('*').eq('org_id', this._orgId),
            sb.from('org_settings').select('*').eq('org_id', this._orgId).maybeSingle(),
            sb.from('consumable_prices').select('*').eq('org_id', this._orgId),
            sb.from('migration_flags').select('*').eq('org_id', this._orgId)
        ]);

        // ─── employees ───
        this._cache.employees = (employees.data || []).map(rowToEmployee);

        // ─── clients ───
        const visitsById = groupBy(clientVisits.data || [], 'client_id');
        this._cache.clients = (clients.data || []).map(c => rowToClient(c, visitsById[c.id] || []));

        // ─── tariffs ───
        this._cache.tariffs = (tariffs.data || []).map(rowToTariff);

        // ─── events ───
        const etgById = groupBy(etg.data || [], 'event_id');
        const eoById = groupBy(eo.data || [], 'event_id');
        const eiById = groupBy(ei.data || [], 'event_id');
        const eaById = groupBy(ea.data || [], 'event_id');
        this._cache.events = (events.data || []).map(ev => rowToEvent(
            ev,
            etgById[ev.id] || [],
            eoById[ev.id] || [],
            eiById[ev.id] || [],
            eaById[ev.id] || []
        ));

        // ─── shifts ───
        const sbById = groupBy(shiftBonuses.data || [], 'shift_id');
        this._cache.shifts = (shifts.data || []).map(s => rowToShift(s, sbById[s.id] || []));

        // ─── salaryRules ───
        this._cache.salaryRules = rowsToSalaryRules(salaryRules.data || []);

        // ─── salaryPayments / historicalAccruals ───
        this._cache.salaryPayments = (salaryPayments.data || []).map(rowToSalaryPayment);
        this._cache.historicalAccruals = (historicalAccruals.data || []).map(rowToHistoricalAccrual);

        // ─── documents ───
        this._cache.documents = (documents.data || []).map(rowToDocument);

        // ─── stockBase + stock (computed) ───
        this._cache.stockBase = rowToStockBase(stockBase.data);
        this._cache.stock = computeStock(this._cache.stockBase, this._cache.documents);

        // ─── certificates ───
        const cuById = groupBy(certUsage.data || [], 'certificate_id');
        this._cache.certificates = (certificates.data || []).map(c => rowToCertificate(c, cuById[c.id] || []));

        // ─── finEntries ───
        this._cache.finEntries = (finEntries.data || []).map(rowToFinEntry);

        // ─── settings ───
        const settings = orgSettings.data || {};
        this._cache.loyaltyPercent = settings.loyalty_percent ?? 5;
        this._cache.accentColor = settings.accent_color ?? '#FFD600';
        this._cache.gcal_token = settings.gcal_token;
        this._cache.gcal_apps_script_url = settings.gcal_apps_script_url;
        this._cache.gcal_calendar_id = settings.gcal_calendar_id;
        this._cache.gcal_event_map = settings.gcal_event_map || {};
        this._cache.empDashOrder = settings.emp_dash_order;
        this._cache.directorDashOrder = settings.dir_salary_order;
        this._cache.dirSalaryOrder = settings.dir_salary_order;
        this._cache.deletedSalaryPaymentIds = settings.deleted_salary_payment_ids || [];

        // ─── consumablePrices ───
        const prices = {};
        for (const p of (consumablePrices.data || [])) prices[p.item_key] = Number(p.price);
        this._cache.consumablePrices = prices;

        // ─── migration flags ───
        for (const f of (migrationFlags.data || [])) {
            this._cache[f.flag_key] = f.value;
        }

        // finances — локальная заглушка (не используется в новой архитектуре)
        if (this._cache.finances === undefined) {
            this._cache.finances = { income: 0, expense: 0, cash: 0, receipts: [], orders: [], cashOps: [], shifts: [] };
        }
    },

    // ─── REALTIME SUBSCRIPTIONS ─────────────────────────────
    _subscribeRealtime() {
        const tables = [
            'employees', 'clients', 'client_visits', 'tariffs',
            'events', 'event_tariff_groups', 'event_options', 'event_instructors', 'event_admins',
            'shifts', 'shift_event_bonuses',
            'salary_rules', 'salary_payments', 'historical_accruals',
            'documents', 'stock_base', 'certificates', 'certificate_usage',
            'financial_entries', 'org_settings', 'consumable_prices', 'migration_flags'
        ];
        for (const table of tables) {
            const ch = sb.channel(`rt-${table}`)
                .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
                    this._debouncedReload();
                })
                .subscribe();
            this._channels.push(ch);
        }
    },

    _debouncedReload() {
        if (this._reloadTimer) clearTimeout(this._reloadTimer);
        this._reloadTimer = setTimeout(async () => {
            await this._loadAll();
            this._notifyChange();
        }, 300);
    },

    teardown() {
        for (const ch of this._channels) sb.removeChannel(ch);
        this._channels = [];
        this._cache = {};
        this._ready = false;
        this._readyPromise = null;
        this._readyResolve = null;
    },

    onChange(cb) { this._onChangeCallbacks.push(cb); },

    _notifyChange() {
        this._onChangeCallbacks.forEach(cb => {
            try { cb(); } catch (e) { console.error('DB onChange error:', e); }
        });
    },

    // ─── MIGRATION HELPERS (legacy API) ─────────────────────
    async migrateFromLocalStorage() { /* no-op — используем Supabase напрямую */ },

    // ─── ROUTING: key → table write ─────────────────────────
    async _writeKey(key, val) {
        if (!this._orgId) return;

        // Migration flags — просто флаги
        if (MIGRATION_FLAG_KEYS.has(key)) {
            if (val) {
                await sb.from('migration_flags').upsert({
                    org_id: this._orgId, flag_key: key, value: !!val
                }, { onConflict: 'org_id,flag_key' });
            } else {
                await sb.from('migration_flags').delete()
                    .eq('org_id', this._orgId).eq('flag_key', key);
            }
            return;
        }

        // Settings-ключи → org_settings column
        if (SETTINGS_KEYS_MAP[key]) {
            const col = SETTINGS_KEYS_MAP[key];
            await sb.from('org_settings').upsert({
                org_id: this._orgId, [col]: val
            }, { onConflict: 'org_id' });
            return;
        }

        // Роутинг по ключу
        switch (key) {
            case 'employees':       return await this._writeEmployees(val);
            case 'clients':         return await this._writeClients(val);
            case 'tariffs':         return await this._writeTariffs(val);
            case 'events':          return await this._writeEvents(val);
            case 'shifts':          return await this._writeShifts(val);
            case 'salaryRules':     return await this._writeSalaryRules(val);
            case 'salaryPayments':  return await this._writeSalaryPayments(val);
            case 'historicalAccruals': return await this._writeHistoricalAccruals(val);
            case 'documents':       return await this._writeDocuments(val);
            case 'certificates':    return await this._writeCertificates(val);
            case 'finEntries':      return await this._writeFinEntries(val);
            case 'stockBase':       return await this._writeStockBase(val);
            case 'consumablePrices': return await this._writeConsumablePrices(val);
            case 'stock':           /* computed — игнорируем писание */ return;
            case 'finances':        /* локальная заглушка */ return;
        }
    },

    // ─── WRITES (full replace по ключу) ─────────────────────
    async _writeEmployees(arr) {
        if (!Array.isArray(arr)) return;
        const rows = arr.map(e => employeeToRow(e, this._orgId));
        await sb.from('employees').upsert(rows, { onConflict: 'id' });
        // Удалить тех, кого нет в массиве
        const ids = arr.map(e => e.id);
        if (ids.length) {
            await sb.from('employees').delete()
                .eq('org_id', this._orgId).not('id', 'in', `(${ids.join(',')})`);
        }
    },

    async _writeClients(arr) {
        if (!Array.isArray(arr)) return;
        const rows = arr.map(c => clientToRow(c, this._orgId));
        await sb.from('clients').upsert(rows, { onConflict: 'id' });

        // Визиты — полная замена
        const ids = arr.map(c => c.id);
        if (ids.length) {
            await sb.from('client_visits').delete().in('client_id', ids);
            const visits = [];
            for (const c of arr) {
                if (c.visits?.length) {
                    for (const v of c.visits) {
                        visits.push({
                            client_id: c.id,
                            visit_date: parseDate(v.date),
                            game: v.game || ''
                        });
                    }
                }
            }
            if (visits.length) await sb.from('client_visits').insert(visits);
        }
    },

    async _writeTariffs(arr) {
        if (!Array.isArray(arr)) return;
        const rows = arr.map(t => tariffToRow(t, this._orgId));
        await sb.from('tariffs').upsert(rows, { onConflict: 'id' });
        const ids = arr.map(t => t.id);
        if (ids.length) {
            await sb.from('tariffs').delete()
                .eq('org_id', this._orgId).not('id', 'in', `(${ids.join(',')})`);
        }
    },

    async _writeEvents(arr) {
        if (!Array.isArray(arr)) return;
        const rows = arr.map(e => eventToRow(e, this._orgId));
        await sb.from('events').upsert(rows, { onConflict: 'id' });

        const ids = arr.map(e => e.id);
        // Очистим связанные таблицы и перепишем
        if (ids.length) {
            await Promise.all([
                sb.from('event_tariff_groups').delete().in('event_id', ids),
                sb.from('event_options').delete().in('event_id', ids),
                sb.from('event_instructors').delete().in('event_id', ids),
                sb.from('event_admins').delete().in('event_id', ids)
            ]);

            const etgRows = [], eoRows = [], eiRows = [], eaRows = [];
            for (const e of arr) {
                if (e.tariffGroups?.length) {
                    e.tariffGroups.forEach((g, i) => {
                        etgRows.push({
                            event_id: e.id,
                            tariff_id: g.tariffId || null,
                            participants: g.participants || 0,
                            sort_order: i
                        });
                    });
                } else if (e.tariffId) {
                    etgRows.push({
                        event_id: e.id,
                        tariff_id: e.tariffId,
                        participants: e.participants || 0,
                        sort_order: 0
                    });
                }

                const opts = e.selectedOptions || [];
                const qtys = e.optionQuantities || {};
                for (const oId of opts) {
                    eoRows.push({
                        event_id: e.id,
                        tariff_id: oId,
                        quantity: qtys[oId] || 1
                    });
                }

                const instrs = e.instructors || e.assignedInstructors || [];
                for (const empId of (Array.isArray(instrs) ? instrs : [instrs])) {
                    if (empId) eiRows.push({ event_id: e.id, employee_id: empId });
                }

                const adms = e.admins || e.assignedAdmins || [];
                for (const empId of (Array.isArray(adms) ? adms : [adms])) {
                    if (empId) eaRows.push({ event_id: e.id, employee_id: empId });
                }
            }
            if (etgRows.length) await sb.from('event_tariff_groups').insert(etgRows);
            if (eoRows.length) await sb.from('event_options').insert(eoRows);
            if (eiRows.length) await sb.from('event_instructors').insert(eiRows);
            if (eaRows.length) await sb.from('event_admins').insert(eaRows);

            // Удалить отсутствующие events
            await sb.from('events').delete()
                .eq('org_id', this._orgId).not('id', 'in', `(${ids.join(',')})`);
        }
    },

    async _writeShifts(arr) {
        if (!Array.isArray(arr)) return;
        const rows = arr.map(s => shiftToRow(s, this._orgId));
        await sb.from('shifts').upsert(rows, { onConflict: 'id' });

        const ids = arr.map(s => s.id);
        if (ids.length) {
            await sb.from('shift_event_bonuses').delete().in('shift_id', ids);
            const bonusRows = [];
            for (const s of arr) {
                if (s.eventBonuses?.length) {
                    for (const b of s.eventBonuses) {
                        bonusRows.push({
                            shift_id: s.id,
                            event_id: b.eventId,
                            amount: b.amount || 0,
                            bonus_type: b.bonusType || 'instructor'
                        });
                    }
                }
            }
            if (bonusRows.length) await sb.from('shift_event_bonuses').insert(bonusRows);

            await sb.from('shifts').delete()
                .eq('org_id', this._orgId).not('id', 'in', `(${ids.join(',')})`);
        }
    },

    async _writeSalaryRules(obj) {
        if (!obj || typeof obj !== 'object') return;
        const roles = ['instructor', 'senior_instructor', 'admin', 'manager'];
        const rows = [];
        for (const role of roles) {
            const r = obj[role];
            if (!r) continue;
            rows.push({
                org_id: this._orgId,
                role,
                shift_rate: r.shiftRate || 0,
                bonus_percent: r.bonusPercent || 0,
                daily_rate: r.dailyRate || 0,
                bonus_sources: r.bonusSources || []
            });
        }
        if (rows.length) await sb.from('salary_rules').upsert(rows, { onConflict: 'org_id,role' });
    },

    async _writeSalaryPayments(arr) {
        if (!Array.isArray(arr)) return;
        const rows = arr.map(p => ({
            id: p.id,
            org_id: this._orgId,
            employee_id: p.employeeId,
            payment_date: parseDate(p.date),
            payment_time: parseTime(p.time),
            amount: p.amount || 0,
            method: p.method || 'cash',
            note: p.note || ''
        }));
        await sb.from('salary_payments').upsert(rows, { onConflict: 'id' });
        const ids = arr.map(p => p.id);
        if (ids.length) {
            await sb.from('salary_payments').delete()
                .eq('org_id', this._orgId).not('id', 'in', `(${ids.join(',')})`);
        }
    },

    async _writeHistoricalAccruals(arr) {
        if (!Array.isArray(arr)) return;
        const rows = arr.map(a => ({
            id: String(a.id),
            org_id: this._orgId,
            employee_id: a.employeeId,
            accrual_date: parseDate(a.date),
            amount: a.amount || 0,
            note: a.note || ''
        }));
        await sb.from('historical_accruals').upsert(rows, { onConflict: 'id' });
        const ids = arr.map(a => String(a.id));
        if (ids.length) {
            // Supabase не любит not().in() со строками — используем rpc или иную стратегию
            // Простой вариант: удаляем отсутствующие по одному
            const { data: existing } = await sb.from('historical_accruals').select('id').eq('org_id', this._orgId);
            const toDelete = (existing || []).filter(e => !ids.includes(e.id)).map(e => e.id);
            if (toDelete.length) {
                await sb.from('historical_accruals').delete().in('id', toDelete);
            }
        }
    },

    async _writeDocuments(arr) {
        if (!Array.isArray(arr)) return;
        const rows = arr.map(d => ({
            id: Math.round(d.id),
            org_id: this._orgId,
            doc_type: d.type || 'incoming',
            doc_date: parseDate(d.date),
            item: d.item || '',
            qty: d.qty || 0,
            amount: d.amount || 0,
            delivery: d.delivery || 0,
            comment: d.comment || '',
            event_id: d.eventId || null
        }));
        // дедуп по id
        const seen = new Set();
        const unique = rows.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
        if (unique.length) await sb.from('documents').upsert(unique, { onConflict: 'id' });
        const ids = unique.map(r => r.id);
        if (ids.length) {
            await sb.from('documents').delete()
                .eq('org_id', this._orgId).not('id', 'in', `(${ids.join(',')})`);
        }
    },

    async _writeCertificates(arr) {
        if (!Array.isArray(arr)) return;
        const rows = arr.map(c => ({
            id: c.id,
            org_id: this._orgId,
            cert_type: c.certType || 'electronic',
            cert_number: c.number || '',
            initial_amount: c.initialAmount || 0,
            remaining_amount: c.remainingAmount || 0,
            status: c.status || 'active',
            created_date: parseDate(c.createdDate),
            expiry_date: parseDate(c.expiryDate),
            buyer_name: c.buyerName || '',
            buyer_phone: c.buyerPhone || '',
            payment_method: c.paymentMethod || null,
            transfer_bank: c.transferBank || null,
            note: c.note || ''
        }));
        await sb.from('certificates').upsert(rows, { onConflict: 'id' });

        const ids = arr.map(c => c.id);
        if (ids.length) {
            await sb.from('certificate_usage').delete().in('certificate_id', ids);
            const usageRows = [];
            for (const c of arr) {
                if (c.usageHistory?.length) {
                    for (const u of c.usageHistory) {
                        usageRows.push({
                            certificate_id: c.id,
                            usage_date: parseDate(u.date),
                            event_title: u.eventTitle || '',
                            amount: u.amount || 0
                        });
                    }
                }
            }
            if (usageRows.length) await sb.from('certificate_usage').insert(usageRows);

            await sb.from('certificates').delete()
                .eq('org_id', this._orgId).not('id', 'in', `(${ids.join(',')})`);
        }
    },

    async _writeFinEntries(arr) {
        if (!Array.isArray(arr)) return;
        const rows = arr.map(e => ({
            id: e.id,
            org_id: this._orgId,
            entry_type: e.type || 'income',
            entry_date: parseDate(e.date),
            amount: e.amount || 0,
            description: e.description || '',
            method: e.method || null,
            comment: e.comment || ''
        }));
        await sb.from('financial_entries').upsert(rows, { onConflict: 'id' });
        const ids = arr.map(e => e.id);
        if (ids.length) {
            await sb.from('financial_entries').delete()
                .eq('org_id', this._orgId).not('id', 'in', `(${ids.join(',')})`);
        }
    },

    async _writeStockBase(obj) {
        if (!obj || typeof obj !== 'object') return;
        await sb.from('stock_base').upsert({
            org_id: this._orgId,
            balls: obj.balls || 0,
            kids_balls: obj.kidsBalls || 0,
            grenades: obj.grenades || 0,
            smokes: obj.smokes || 0,
            balls_critical: obj.ballsCritical || 60000,
            kids_balls_critical: obj.kidsBallsCritical || 20000,
            grenades_critical: obj.grenadesCritical || 100,
            smokes_critical: obj.smokesCritical || 50
        }, { onConflict: 'org_id' });
    },

    async _writeConsumablePrices(obj) {
        if (!obj || typeof obj !== 'object') return;
        const rows = Object.entries(obj).map(([key, price]) => ({
            org_id: this._orgId,
            item_key: key,
            price: price || 0
        }));
        if (rows.length) await sb.from('consumable_prices').upsert(rows, { onConflict: 'org_id,item_key' });
    }
};

// ============================================================
// TRANSFORM HELPERS — row ↔ camelCase object
// ============================================================
function parseDate(d) {
    if (!d) return null;
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    return String(d).slice(0, 10) || null;
}

function parseTime(t) {
    if (!t) return null;
    return String(t).slice(0, 5) || null;
}

function groupBy(arr, key) {
    const m = {};
    for (const r of arr) {
        const k = r[key];
        if (!m[k]) m[k] = [];
        m[k].push(r);
    }
    return m;
}

// ─── EMPLOYEES ──────────────────────────────────────────────
function rowToEmployee(r) {
    return {
        id: Number(r.id),
        firstName: r.first_name || '',
        lastName: r.last_name || '',
        role: r.role,
        pin: r.pin,
        phone: r.phone || '',
        email: r.email || '',
        dob: r.dob || '',
        passport: r.passport || '',
        bank: r.bank || '',
        paid: 0, // считается динамически из salary_payments
        blocked: !!r.blocked,
        allowedShiftRoles: r.allowed_shift_roles || [],
        managerSince: r.manager_since || undefined,
        managerUntil: r.manager_until || undefined
    };
}

function employeeToRow(e, orgId) {
    return {
        id: e.id,
        org_id: orgId,
        first_name: e.firstName || '',
        last_name: e.lastName || '',
        role: e.role || 'instructor',
        pin: e.pin || '0000',
        phone: e.phone || '',
        email: e.email || '',
        dob: parseDate(e.dob),
        passport: e.passport || '',
        bank: e.bank || '',
        blocked: !!e.blocked,
        allowed_shift_roles: e.allowedShiftRoles || [],
        manager_since: parseDate(e.managerSince),
        manager_until: parseDate(e.managerUntil)
    };
}

// ─── CLIENTS ────────────────────────────────────────────────
function rowToClient(r, visits) {
    return {
        id: Number(r.id),
        firstName: r.first_name || '',
        lastName: r.last_name || '',
        phone: r.phone || '',
        email: r.email || '',
        dob: r.dob || '',
        notes: r.notes || '',
        groldiks: r.groldiks || 0,
        totalSpent: Number(r.total_spent) || 0,
        visits: visits.map(v => ({ date: v.visit_date, game: v.game }))
    };
}

function clientToRow(c, orgId) {
    return {
        id: c.id,
        org_id: orgId,
        first_name: c.firstName || '',
        last_name: c.lastName || '',
        phone: c.phone || '',
        email: c.email || '',
        dob: parseDate(c.dob),
        notes: c.notes || '',
        groldiks: c.groldiks || 0,
        total_spent: c.totalSpent || 0
    };
}

// ─── TARIFFS ────────────────────────────────────────────────
function rowToTariff(r) {
    return {
        id: Number(r.id),
        category: r.category,
        serviceId: r.service_id,
        sheetCategory: r.sheet_category,
        name: r.name || '',
        price: Number(r.price) || 0,
        unit: r.unit || 'чел',
        duration: r.duration || 0,
        minPeople: r.min_people || 0,
        age: r.age || '',
        included: r.included || '',
        description: r.description || '',
        ballsPerPerson: r.balls_per_person || 0,
        kidsBallsPerPerson: r.kids_balls_per_person || 0,
        grenadesPerPerson: Number(r.grenades_per_person) || 0,
        smokesPerPerson: Number(r.smokes_per_person) || 0,
        inputType: r.input_type || undefined,
        inputPlaceholder: r.input_placeholder || '',
        quantity: r.quantity || 1
    };
}

function tariffToRow(t, orgId) {
    return {
        id: t.id,
        org_id: orgId,
        category: t.category || 'services',
        service_id: t.serviceId || null,
        sheet_category: t.sheetCategory || null,
        name: t.name || '',
        price: t.price || 0,
        unit: t.unit || 'чел',
        duration: t.duration || 0,
        min_people: t.minPeople || 0,
        age: t.age || '',
        included: t.included || '',
        description: t.description || '',
        balls_per_person: t.ballsPerPerson || 0,
        kids_balls_per_person: t.kidsBallsPerPerson || 0,
        grenades_per_person: t.grenadesPerPerson || 0,
        smokes_per_person: t.smokesPerPerson || 0,
        input_type: t.inputType || null,
        input_placeholder: t.inputPlaceholder || '',
        quantity: t.quantity || 1
    };
}

// ─── EVENTS ─────────────────────────────────────────────────
function rowToEvent(r, etg, eo, ei, ea) {
    const sortedTg = etg.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const tariffGroups = sortedTg.map(g => ({
        tariffId: g.tariff_id ? Number(g.tariff_id) : null,
        participants: g.participants || 0
    }));
    const selectedOptions = eo.map(o => Number(o.tariff_id)).filter(Boolean);
    const optionQuantities = {};
    for (const o of eo) if (o.tariff_id) optionQuantities[o.tariff_id] = o.quantity || 1;

    return {
        id: Number(r.id),
        title: r.title || '',
        clientName: r.client_name || '',
        clientPhone: r.client_phone || '',
        contactChannel: r.contact_channel,
        date: r.event_date,
        time: parseTime(r.event_time),
        duration: r.duration || 0,
        type: r.event_type,
        occasion: r.occasion || '',
        playerAge: r.player_age || '',
        participants: r.participants || 0,
        tariffId: tariffGroups[0]?.tariffId || null,
        tariffGroups: tariffGroups.length > 1 ? tariffGroups : null,
        selectedOptions,
        optionQuantities,
        instructors: ei.map(x => Number(x.employee_id)),
        admins: ea.map(x => Number(x.employee_id)),
        price: Number(r.price) || 0,
        totalPrice: Number(r.price) || 0,
        discount: Number(r.discount) || 0,
        discountType: r.discount_type || 'none',
        certificateNumber: r.certificate_number || '',
        certificateAmount: Number(r.certificate_amount) || 0,
        status: r.status,
        prepayment: Number(r.prepayment) || 0,
        prepaymentMethod: r.prepayment_method,
        prepaymentDate: r.prepayment_date,
        consumablesUsed: {
            balls: r.consumables_balls || 0,
            kidsBalls: r.consumables_kids_balls || 0,
            grenades: r.consumables_grenades || 0,
            smokes: r.consumables_smokes || 0
        },
        bonuses: {
            instructorTotal: Number(r.bonus_instructor_total) || 0,
            adminTotal: Number(r.bonus_admin_total) || 0,
            perInstructor: Number(r.bonus_per_instructor) || 0,
            perAdmin: Number(r.bonus_per_admin) || 0
        },
        notes: r.notes || '',
        source: r.source || 'crm',
        gcalEventId: r.gcal_event_id || null,
        instructorRating: r.instructor_rating || 0
    };
}

function eventToRow(e, orgId) {
    const allowedChannels = ['wa', 'tg', 'vk', 'phone', 'other'];
    const allowedTypes = ['paintball', 'laser', 'kidball', 'quest', 'sup', 'atv', 'race', 'rent', 'other'];
    const allowedStatus = ['pending', 'confirmed', 'completed', 'cancelled'];
    const allowedDiscount = ['none', 'percent', 'certificate'];

    return {
        id: e.id,
        org_id: orgId,
        title: e.title || '',
        client_name: e.clientName || '',
        client_phone: e.clientPhone || '',
        contact_channel: allowedChannels.includes(e.contactChannel) ? e.contactChannel : 'other',
        event_date: parseDate(e.date),
        event_time: parseTime(e.time),
        duration: e.duration || 0,
        event_type: allowedTypes.includes(e.type) ? e.type : 'other',
        occasion: e.occasion || '',
        player_age: e.playerAge || '',
        participants: e.participants || 0,
        price: e.price || e.totalPrice || 0,
        discount: e.discount || 0,
        discount_type: allowedDiscount.includes(e.discountType) ? e.discountType : 'none',
        certificate_number: e.certificateNumber || null,
        certificate_amount: e.certificateAmount || 0,
        status: allowedStatus.includes(e.status) ? e.status : 'pending',
        prepayment: e.prepayment || 0,
        prepayment_method: e.prepaymentMethod || null,
        prepayment_date: parseDate(e.prepaymentDate),
        consumables_balls: e.consumablesUsed?.balls || 0,
        consumables_kids_balls: e.consumablesUsed?.kidsBalls || 0,
        consumables_grenades: e.consumablesUsed?.grenades || 0,
        consumables_smokes: e.consumablesUsed?.smokes || 0,
        bonus_instructor_total: e.bonuses?.instructorTotal || 0,
        bonus_admin_total: e.bonuses?.adminTotal || 0,
        bonus_per_instructor: e.bonuses?.perInstructor || 0,
        bonus_per_admin: e.bonuses?.perAdmin || 0,
        notes: e.notes || '',
        source: e.source || 'crm',
        gcal_event_id: e.gcalEventId || null,
        instructor_rating: e.instructorRating || 0
    };
}

// ─── SHIFTS ─────────────────────────────────────────────────
function rowToShift(r, bonuses) {
    return {
        id: Number(r.id),
        employeeId: Number(r.employee_id),
        employeeName: '', // вычислим в app при рендере
        employeeRole: r.shift_role,
        shiftRole: r.shift_role,
        date: r.shift_date,
        startTime: parseTime(r.start_time),
        endTime: parseTime(r.end_time),
        eventBonuses: bonuses.map(b => ({
            eventId: Number(b.event_id),
            amount: Number(b.amount) || 0,
            bonusType: b.bonus_type || 'instructor'
        })),
        earnings: r.end_time ? {
            base: Number(r.earnings_base) || 0,
            bonus: Number(r.earnings_bonus) || 0,
            total: Number(r.earnings_total) || 0,
            bonusDetail: r.bonus_detail || ''
        } : null,
        autoClosedAt: r.auto_closed ? true : null
    };
}

function shiftToRow(s, orgId) {
    const allowedRoles = ['admin', 'senior_instructor', 'instructor', 'manager'];
    const role = s.shiftRole || s.employeeRole || 'instructor';
    return {
        id: s.id,
        org_id: orgId,
        employee_id: s.employeeId,
        shift_role: allowedRoles.includes(role) ? role : 'instructor',
        shift_date: parseDate(s.date),
        start_time: parseTime(s.startTime),
        end_time: parseTime(s.endTime),
        earnings_base: s.earnings?.base || 0,
        earnings_bonus: s.earnings?.bonus || 0,
        earnings_total: s.earnings?.total || 0,
        bonus_detail: s.earnings?.bonusDetail || '',
        auto_closed: !!s.autoClosedAt
    };
}

// ─── SALARY RULES ───────────────────────────────────────────
function rowsToSalaryRules(rows) {
    const result = {};
    for (const r of rows) {
        result[r.role] = {
            shiftRate: Number(r.shift_rate) || 0,
            bonusPercent: Number(r.bonus_percent) || 0,
            dailyRate: Number(r.daily_rate) || 0,
            bonusSources: r.bonus_sources || []
        };
    }
    return result;
}

// ─── SALARY PAYMENTS / HISTORICAL ACCRUALS ──────────────────
function rowToSalaryPayment(r) {
    return {
        id: Number(r.id),
        employeeId: Number(r.employee_id),
        employeeName: '',
        date: r.payment_date,
        time: parseTime(r.payment_time),
        amount: Number(r.amount) || 0,
        method: r.method || 'cash',
        note: r.note || ''
    };
}

function rowToHistoricalAccrual(r) {
    return {
        id: r.id,
        employeeId: Number(r.employee_id),
        employeeName: '',
        date: r.accrual_date,
        amount: Number(r.amount) || 0,
        note: r.note || ''
    };
}

// ─── DOCUMENTS ──────────────────────────────────────────────
function rowToDocument(r) {
    return {
        id: Number(r.id),
        type: r.doc_type,
        date: r.doc_date,
        item: r.item || '',
        qty: r.qty || 0,
        amount: Number(r.amount) || 0,
        delivery: Number(r.delivery) || 0,
        comment: r.comment || '',
        eventId: r.event_id ? Number(r.event_id) : null
    };
}

// ─── STOCK ──────────────────────────────────────────────────
function rowToStockBase(r) {
    if (!r) return { balls: 0, kidsBalls: 0, grenades: 0, smokes: 0, ballsCritical: 60000, kidsBallsCritical: 20000, grenadesCritical: 100, smokesCritical: 50 };
    return {
        balls: r.balls || 0,
        kidsBalls: r.kids_balls || 0,
        grenades: r.grenades || 0,
        smokes: r.smokes || 0,
        ballsCritical: r.balls_critical || 60000,
        kidsBallsCritical: r.kids_balls_critical || 20000,
        grenadesCritical: r.grenades_critical || 100,
        smokesCritical: r.smokes_critical || 50
    };
}

const STOCK_KEY_MAP = {
    'Пейнтбольные шары 0.68': 'balls',
    'Детские пейнтбольные шары 0.50': 'kidsBalls',
    'Гранаты': 'grenades',
    'Дымы': 'smokes'
};

function computeStock(base, docs) {
    const result = {
        balls: base.balls || 0,
        kidsBalls: base.kidsBalls || 0,
        grenades: base.grenades || 0,
        smokes: base.smokes || 0,
        ballsCritical: base.ballsCritical,
        kidsBallsCritical: base.kidsBallsCritical,
        grenadesCritical: base.grenadesCritical,
        smokesCritical: base.smokesCritical
    };
    for (const d of docs) {
        const k = STOCK_KEY_MAP[d.item];
        if (!k || !d.qty) continue;
        if (d.type === 'incoming') result[k] += d.qty;
        else result[k] -= d.qty;
    }
    return result;
}

// ─── CERTIFICATES ───────────────────────────────────────────
function rowToCertificate(r, usage) {
    return {
        id: Number(r.id),
        certType: r.cert_type,
        number: r.cert_number,
        initialAmount: Number(r.initial_amount) || 0,
        remainingAmount: Number(r.remaining_amount) || 0,
        status: r.status,
        createdDate: r.created_date,
        expiryDate: r.expiry_date,
        buyerName: r.buyer_name || '',
        buyerPhone: r.buyer_phone || '',
        paymentMethod: r.payment_method,
        transferBank: r.transfer_bank,
        note: r.note || '',
        usageHistory: usage.map(u => ({
            date: u.usage_date,
            eventTitle: u.event_title || '',
            amount: Number(u.amount) || 0
        }))
    };
}

// ─── FINANCIAL ENTRIES ──────────────────────────────────────
function rowToFinEntry(r) {
    return {
        id: Number(r.id),
        type: r.entry_type,
        date: r.entry_date,
        amount: Number(r.amount) || 0,
        description: r.description || '',
        method: r.method,
        comment: r.comment || ''
    };
}

// ============================================================
// EXPORT (глобально как в оригинале)
// ============================================================
window.DB = DB;
window.supabaseClient = sb;
window.FIRESTORE_KEYS = FIRESTORE_KEYS;
