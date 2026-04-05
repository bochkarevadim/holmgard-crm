/* ============================
   HOLMGARD PARK CRM — APP
   ============================ */

// ===== HELPERS =====
// All times are in Moscow timezone (UTC+3)
function moscowNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
}

function todayLocal() {
    const d = moscowNow();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function moscowTimeStr() {
    return moscowNow().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(min) {
    if (!min) return '—';
    if (min < 60) return min + ' мин';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} ч ${m} мин` : `${h} ч`;
}

// ===== DATA LAYER (Firestore-backed) =====
const FIRESTORE_KEYS = new Set([
    'employees', 'events', 'clients', 'tariffs', 'shifts',
    'stock', 'salaryRules', 'finances', 'documents',
    'loyaltyPercent', 'accentColor', 'empDashOrder',
    'initialized', 'roles_version_v2', 'multirole_v1',
    'stock_critical_v1', 'stock_kids_v1', 'consumables_v1', 'tariffs_version',
    'certificates', 'salaryPayments', 'gcal_token', 'gcal_apps_script_url', 'gcal_calendar_id', 'gcal_event_map', 'consumablePrices',
    'directorDashOrder'
]);

const DB = {
    _skipSync: false,
    _cache: {},
    _ready: false,
    _readyPromise: null,
    _readyResolve: null,
    _db: null,
    _uid: null,
    _unsubscribers: [],
    _onChangeCallbacks: [],

    get(key, fallback = null) {
        if (FIRESTORE_KEYS.has(key)) {
            let val = this._cache[key];
            // Safety: unwrap double-stringified values
            if (typeof val === 'string' && (val[0] === '[' || val[0] === '{')) {
                try { val = JSON.parse(val); this._cache[key] = val; } catch {}
            }
            return val !== undefined ? val : fallback;
        }
        try {
            const d = localStorage.getItem('hp_' + key);
            return d ? JSON.parse(d) : fallback;
        } catch { return fallback; }
    },

    set(key, val) {
        if (FIRESTORE_KEYS.has(key)) {
            this._cache[key] = val;
            if (this._db) {
                this._db.collection('orgs').doc('holmgard')
                    .collection('data').doc(key)
                    .set({ value: val, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
                    .catch(err => console.error('DB.set Firestore error:', key, err));
            }
        } else {
            localStorage.setItem('hp_' + key, JSON.stringify(val));
        }
        // Google Sheets sync disabled — Firestore is the single source of truth
    },

    remove(key) {
        if (FIRESTORE_KEYS.has(key)) {
            delete this._cache[key];
            if (this._db) {
                this._db.collection('orgs').doc('holmgard')
                    .collection('data').doc(key)
                    .delete()
                    .catch(err => console.error('DB.remove Firestore error:', key, err));
            }
        } else {
            localStorage.removeItem('hp_' + key);
        }
    },

    async initFirestore() {
        this._db = firebase.firestore();

        try {
            await this._db.enablePersistence({ synchronizeTabs: true });
        } catch (err) {
            if (err.code === 'failed-precondition') {
                console.warn('Firestore persistence: multiple tabs open');
            } else if (err.code === 'unimplemented') {
                console.warn('Firestore persistence: not supported');
            }
        }

        this._readyPromise = new Promise(resolve => {
            this._readyResolve = resolve;
        });

        const dataRef = this._db.collection('orgs').doc('holmgard').collection('data');
        const unsub = dataRef.onSnapshot(snapshot => {
            let changed = false;
            snapshot.docChanges().forEach(change => {
                const key = change.doc.id;
                if (!FIRESTORE_KEYS.has(key)) return;
                if (change.type === 'removed') {
                    delete this._cache[key];
                } else {
                    let v = change.doc.data().value;
                    if (typeof v === 'string' && (v[0] === '[' || v[0] === '{')) {
                        try { v = JSON.parse(v); } catch {}
                    }
                    this._cache[key] = v;
                }
                changed = true;
            });

            if (!this._ready) {
                this._ready = true;
                if (this._readyResolve) this._readyResolve();
            }

            if (changed && this._ready) {
                this._notifyChange();
            }
        }, err => {
            console.error('Firestore onSnapshot error:', err);
            if (!this._ready) {
                this._ready = true;
                if (this._readyResolve) this._readyResolve();
            }
        });

        this._unsubscribers.push(unsub);
        return this._readyPromise;
    },

    teardown() {
        this._unsubscribers.forEach(fn => fn());
        this._unsubscribers = [];
        this._cache = {};
        this._ready = false;
        this._readyPromise = null;
        this._readyResolve = null;
    },

    onChange(callback) {
        this._onChangeCallbacks.push(callback);
    },

    _notifyChange() {
        this._onChangeCallbacks.forEach(cb => {
            try { cb(); } catch (e) { console.error('DB onChange error:', e); }
        });
    },

    async migrateFromLocalStorage() {
        if (!this._db) return;
        const batch = this._db.batch();
        let hasMigrations = false;
        const dataRef = this._db.collection('orgs').doc('holmgard').collection('data');

        for (const key of FIRESTORE_KEYS) {
            if (this._cache[key] !== undefined) continue;
            try {
                const raw = localStorage.getItem('hp_' + key);
                if (raw) {
                    const val = JSON.parse(raw);
                    batch.set(dataRef.doc(key), {
                        value: val,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    this._cache[key] = val;
                    hasMigrations = true;
                }
            } catch (e) {
                console.warn('Migration skip:', key, e);
            }
        }

        if (hasMigrations) {
            await batch.commit();
            console.log('DB: migrated localStorage → Firestore');
        }
    }
};

// ===== INITIAL DATA =====
function initData() {
    if (!DB.get('initialized')) {
        DB.set('employees', [
            {
                id: 1, firstName: 'Вадим', lastName: 'Бочкарёв', role: 'director',
                pin: '1111', phone: '+7 (900) 111-11-11', dob: '1985-06-15',
                passport: '', bank: '', paid: 100000,
                email: '', blocked: false
            },
            {
                id: 2, firstName: 'Савелий', lastName: 'Данилов', role: 'senior_instructor',
                pin: '0080', phone: '+7 (900) 222-22-22', dob: '1990-05-12',
                passport: '', bank: '', paid: 0,
                allowedShiftRoles: ['admin', 'senior_instructor']
            },
            {
                id: 3, firstName: 'Елена', lastName: 'Бундзен', role: 'admin',
                pin: '3333', phone: '+7 (900) 333-33-33', dob: '1993-08-25',
                passport: '', bank: '', paid: 0,
                allowedShiftRoles: ['admin']
            },
            {
                id: 4, firstName: 'Дмитрий', lastName: 'Князев', role: 'instructor',
                pin: '4021', phone: '+7 (900) 444-44-44', dob: '1995-11-03',
                passport: '', bank: '', paid: 0,
                allowedShiftRoles: ['admin', 'instructor']
            },
            {
                id: 5, firstName: 'Ольга', lastName: 'Гусакова', role: 'admin',
                pin: '5555', phone: '+7 (900) 555-55-55', dob: '1997-02-18',
                passport: '', bank: '', paid: 0,
                allowedShiftRoles: ['admin']
            }
        ]);

        DB.set('events', []);
        DB.set('clients', []);

        DB.set('shifts', []);
        DB.set('salaryRules', {
            instructor: { shiftRate: 1500, bonusPercent: 5, bonusSources: ['services', 'optionsForGame'] },
            senior_instructor: { shiftRate: 2000, bonusPercent: 5, bonusSources: ['services', 'optionsForGame'] },
            admin: { shiftRate: 0, bonusPercent: 5, bonusSources: ['services', 'optionsForGame', 'options'] }
        });
        DB.set('stock', { balls: 4500, ballsCritical: 60000, kidsBalls: 0, kidsBallsCritical: 20000, grenades: 120, grenadesCritical: 100, smokes: 0, smokesCritical: 50 });
        DB.set('loyaltyPercent', 5);
        DB.set('finances', { income: 0, expense: 0, cash: 0, receipts: [], orders: [], cashOps: [], shifts: [] });
        DB.set('documents', []);

        DB.set('tariffs', [
            // === Услуги (services) — из Google Таблицы ===
            { id: 1, category: 'services', serviceId: 'pb_mission', sheetCategory: 'Пейнтбол', name: 'МИССИЯ ВЫПОЛНИМА', price: 1800, unit: 'чел', duration: 120, minPeople: 8, age: '', included: 'Комплект экипировки и защиты; 3 миссии ≈ 1 час; Беседка 2 часа; 300 шаров', description: '', ballsPerPerson: 300, grenadesPerPerson: 0 },
            { id: 2, category: 'services', serviceId: 'pb_bigcash', sheetCategory: 'Пейнтбол', name: 'БОЛЬШОЙ КУШ', price: 2200, unit: 'чел', duration: 180, minPeople: 6, age: '', included: 'Комплект экипировки и защиты; 4 миссии ≈ 2 часа; Беседка 3 часа; 500 шаров', description: '', ballsPerPerson: 500, grenadesPerPerson: 0 },
            { id: 3, category: 'services', serviceId: 'pb_unstop', sheetCategory: 'Пейнтбол', name: 'НЕУДЕРЖИМЫЕ', price: 2900, unit: 'чел', duration: 240, minPeople: 6, age: '', included: 'Комплект экипировки и защиты; 5 миссий ≈ 3 часа; Беседка 4 часа; 600 шаров; Граната; Удлинённый ствол; Щит', description: '', ballsPerPerson: 600, grenadesPerPerson: 1 },
            { id: 4, category: 'services', serviceId: 'kb_minepark', sheetCategory: 'Кидбол', name: 'MINEPARK', price: 1600, unit: 'чел', duration: 180, minPeople: 8, age: '6-12', included: 'Комплект детской экипировки, безлимитные шары, игровые сценарии, фотоотчёт, инструктор, беседка и мангальная зона', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
            { id: 5, category: 'services', serviceId: 'kb_fightstars', sheetCategory: 'Кидбол', name: 'ЗВЁЗДНЫЕ БОИ', price: 2300, unit: 'чел', duration: 240, minPeople: 6, age: '6-12', included: 'Комплект экипировки; 4 миссии ≈ 2 часа; Беседка 3 часа; безлимитные шары', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
            { id: 6, category: 'services', serviceId: 'lz_fightstars', sheetCategory: 'Лазертаг', name: 'ЗВЁЗДНЫЕ БОИ', price: 1100, unit: 'чел', duration: 180, minPeople: 10, age: '', included: 'Комплект экипировки; 4 миссии ≈ 2 часа; Беседка 3 часа', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
            { id: 7, category: 'services', serviceId: 'lz_pubg', sheetCategory: 'Лазертаг', name: 'LASERPUBG', price: 1500, unit: 'чел', duration: 240, minPeople: 8, age: '', included: 'Комплект экипировки; 6 миссий ≈ 3 часа; Беседка 4 часа', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
            { id: 8, category: 'services', serviceId: 'ATV_light', sheetCategory: 'Квадроциклы', name: 'Лёгкая трасса — 4 км', price: 2500, unit: 'чел', duration: 40, minPeople: 1, age: '14', included: 'Квадроцикл, комплект экипировки и защиты, небольшой пикник по завершении заезда', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
            { id: 9, category: 'services', serviceId: 'ATV_medium', sheetCategory: 'Квадроциклы', name: 'Умеренная трасса — 5 км', price: 3000, unit: 'чел', duration: 60, minPeople: 1, age: '14', included: 'Квадроцикл, комплект экипировки и защиты, небольшой пикник по завершении заезда', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
            { id: 10, category: 'services', serviceId: 'ATV_hard', sheetCategory: 'Квадроциклы', name: 'Сложная трасса — 9 км', price: 6000, unit: 'чел', duration: 90, minPeople: 1, age: '14', included: 'Квадроцикл, комплект экипировки и защиты, небольшой пикник по завершении заезда', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
            { id: 11, category: 'services', serviceId: 'sup_group', sheetCategory: 'Водная прогулка на Сап-бордах', name: 'Сборная группа', price: 2200, unit: 'чел', duration: 180, minPeople: 1, age: '18', included: 'Комплект оборудования; ≈ 3 часа прогулка; Пикник; Сопровождение инструкторами', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
            { id: 12, category: 'services', serviceId: 'sup_privet', sheetCategory: 'Водная прогулка на Сап-бордах', name: 'Все свои', price: 2800, unit: 'чел', duration: 180, minPeople: 6, age: '18', included: 'Комплект оборудования; ≈ 3 часа прогулка; Пикник; Сопровождение инструкторами', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
            { id: 13, category: 'services', serviceId: 'sup_romantic', sheetCategory: 'Водная прогулка на Сап-бордах', name: 'Романтическая прогулка на двоих', price: 8000, unit: 'чел', duration: 180, minPeople: 2, age: '18', included: 'Комплект оборудования; ≈ 3 часа прогулка; Пикник; Сопровождение инструкторами', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
            { id: 14, category: 'services', serviceId: 'Race_light', sheetCategory: 'Гонка с препятствиями', name: 'Лёгкая трасса — 1,6 км', price: 1600, unit: 'чел', duration: 30, minPeople: 8, age: '12', included: 'Трасса с препятствиями, сопровождающий инструктор, страховка', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
            { id: 15, category: 'services', serviceId: 'Race_medium', sheetCategory: 'Гонка с препятствиями', name: 'Умеренная трасса — 2,2 км', price: 2200, unit: 'чел', duration: 40, minPeople: 8, age: '18', included: 'Трасса с препятствиями, сопровождающий инструктор, страховка', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
            { id: 16, category: 'services', serviceId: 'Race_hard', sheetCategory: 'Гонка с препятствиями', name: 'Сложная трасса — 2,8 км', price: 2800, unit: 'чел', duration: 50, minPeople: 8, age: '18', included: 'Трасса с препятствиями, сопровождающий инструктор, страховка', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
            { id: 17, category: 'services', serviceId: 'Tir_200', sheetCategory: 'Тир пейнтбольный', name: 'ТИР200', price: 500, unit: 'чел', duration: 10, minPeople: 1, age: '0', included: 'Пейнтбольный тир 200 выстрелов', description: '', ballsPerPerson: 200, grenadesPerPerson: 0 },
            { id: 18, category: 'services', serviceId: 'Tir_500', sheetCategory: 'Тир пейнтбольный', name: 'ТИР500', price: 1000, unit: 'чел', duration: 20, minPeople: 1, age: '0', included: 'Пейнтбольный тир 500 выстрелов', description: '', ballsPerPerson: 500, grenadesPerPerson: 0 },
            // === Опции к игре (optionsForGame) ===
            { id: 19, category: 'optionsForGame', serviceId: 'opt_pb_grenade', sheetCategory: 'Доп. опции Пейнтбол/Кидбол/Лазертаг', name: 'Граната', price: 300, quantity: 1, unit: 'штука', included: '', description: '', ballsPerPerson: 0, grenadesPerPerson: 1 },
            { id: 20, category: 'optionsForGame', serviceId: 'opt_pb_balls', sheetCategory: 'Доп. опции Пейнтбол/Кидбол', name: 'Дополнительные шары', price: 2, quantity: 1, unit: 'шт', inputType: 'number', inputPlaceholder: 'Кол-во шаров', included: '', description: '', ballsPerPerson: 1, grenadesPerPerson: 0 },
            { id: 21, category: 'optionsForGame', serviceId: 'opt_pb_smoke', sheetCategory: 'Доп. опции Пейнтбол/Кидбол/Лазертаг', name: 'Дымовая шашка', price: 300, quantity: 1, unit: 'штука', included: '', description: '', ballsPerPerson: 0, grenadesPerPerson: 0, smokesPerPerson: 1 },
            { id: 22, category: 'optionsForGame', serviceId: 'opt_pb_barrel', sheetCategory: 'Доп. опции Пейнтбол', name: 'Удлинённый ствол', price: 200, quantity: 1, unit: 'штука', included: '', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
            // === Дополнительные опции (options) ===
            { id: 24, category: 'options', serviceId: 'Coffee', sheetCategory: 'Кофе', name: 'Кофе', price: 150, quantity: 1, unit: 'штука', included: '', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
            { id: 25, category: 'options', serviceId: 'Shop', sheetCategory: 'Магазин', name: 'Магазин', price: 1, quantity: 1, unit: 'шт', inputType: 'shop', inputPlaceholder: 'Сумма ₽', included: '', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
            { id: 26, category: 'options', serviceId: 'opt_gazebo_small', sheetCategory: 'Аренда беседки', name: 'Малая беседка', price: 1000, quantity: 1, unit: 'час', included: '', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
            { id: 27, category: 'options', serviceId: 'opt_gazebo_big', sheetCategory: 'Аренда беседки', name: 'Большая беседка', price: 2000, quantity: 1, unit: 'час', included: '', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
            { id: 28, category: 'options', serviceId: 'opt_tent', sheetCategory: 'Аренда беседки', name: 'Шатёр', price: 1000, quantity: 1, unit: 'час', included: '', description: '', ballsPerPerson: 0, grenadesPerPerson: 0 },
        ]);

        DB.set('accentColor', '#FFD600');

        DB.set('initialized', true);
    }

    // Pre-populate integration settings (runs on every device)
    if (!localStorage.getItem('hp_gcal_client_id')) {
        localStorage.setItem('hp_gcal_client_id', '707236174149-jvoffkaka7c03s70ek5ecknebao7nhk3.apps.googleusercontent.com');
    }
    if (!localStorage.getItem('hp_gsheets_id')) {
        localStorage.setItem('hp_gsheets_id', '1E6dtJNWzSNFCI3CXDUBsb2rWMuwpEbmIljrDmbBkWPE');
    }
    // Set default calendar to holmgardpark@gmail.com
    if (!DB.get('gcal_calendar_id', '')) {
        DB.set('gcal_calendar_id', 'holmgardpark@gmail.com');
    }
    localStorage.setItem('hp_gcal_calendar_id', DB.get('gcal_calendar_id', 'holmgardpark@gmail.com'));
}

// ===== DATA MIGRATIONS =====
function runDataMigrations() {
    // Migration: add senior_instructor to salary rules
    if (!DB.get('roles_version_v2')) {
        const rules = DB.get('salaryRules', {});
        if (!rules.senior_instructor) {
            rules.senior_instructor = { shiftRate: 2000, bonusPercent: 7, bonusSources: ['services', 'optionsForGame', 'options'] };
            DB.set('salaryRules', rules);
        }
        DB.set('roles_version_v2', true);
    }

    // Migration: add allowedShiftRoles to employees
    if (!DB.get('multirole_v1')) {
        const emps = DB.get('employees', []);
        let changed = false;
        emps.forEach(emp => {
            if (!emp.allowedShiftRoles) {
                changed = true;
                if (emp.role === 'director') {
                    emp.allowedShiftRoles = ['admin', 'senior_instructor', 'instructor'];
                } else if (emp.role === 'admin') {
                    emp.allowedShiftRoles = ['admin'];
                } else if (emp.role === 'senior_instructor') {
                    emp.allowedShiftRoles = ['senior_instructor'];
                } else {
                    emp.allowedShiftRoles = ['instructor'];
                }
            }
        });
        if (changed) DB.set('employees', emps);
        DB.set('multirole_v1', true);
    }

    // Migration: stock ballsMax → ballsCritical
    if (!DB.get('stock_critical_v1')) {
        const stock = DB.get('stock', {});
        if (stock.ballsMax !== undefined && stock.ballsCritical === undefined) {
            stock.ballsCritical = 60000;
            stock.grenadesCritical = 100;
            delete stock.ballsMax;
            delete stock.grenadesMax;
            DB.set('stock', stock);
        }
        DB.set('stock_critical_v1', true);
    }

    // Migration: add kidsBalls and smokes to stock
    if (!DB.get('stock_kids_v1')) {
        const stock = DB.get('stock', {});
        if (stock.kidsBalls === undefined) {
            stock.kidsBalls = 0;
            stock.kidsBallsCritical = 20000;
        }
        if (stock.smokes === undefined) {
            stock.smokes = 0;
            stock.smokesCritical = 50;
        }
        DB.set('stock', stock);
        DB.set('stock_kids_v1', true);
    }

    // Migration: add consumable fields to tariffs
    if (!DB.get('consumables_v1')) {
        const tariffs = DB.get('tariffs', []);
        let changed = false;
        const defaultConsumables = {
            'pb_mission': { balls: 300, grenades: 0 },
            'pb_bigcash': { balls: 500, grenades: 0 },
            'pb_unstop': { balls: 600, grenades: 1 },
            'Tir_200': { balls: 200, grenades: 0 },
            'Tir_500': { balls: 500, grenades: 0 },
            'opt_pb_grenade': { balls: 0, grenades: 1 },
            'opt_pb_balls': { balls: 200, grenades: 0 },
            'opt_pb_smoke': { balls: 0, grenades: 0, smokes: 1 },
        };
        tariffs.forEach(t => {
            if (t.ballsPerPerson === undefined) {
                changed = true;
                const def = defaultConsumables[t.serviceId];
                t.ballsPerPerson = def ? def.balls : 0;
                t.grenadesPerPerson = def ? def.grenades : 0;
                t.smokesPerPerson = def ? (def.smokes || 0) : 0;
            }
            // Fix smoke tariff: move from grenades to smokes
            if (t.serviceId === 'opt_pb_smoke' && !t.smokesPerPerson) {
                t.smokesPerPerson = t.grenadesPerPerson || 1;
                t.grenadesPerPerson = 0;
                changed = true;
            }
        });
        if (changed) DB.set('tariffs', tariffs);
        DB.set('consumables_v1', true);
    }

    // Migration: add email/blocked fields to employees
    const emps = DB.get('employees', []);
    let emailChanged = false;
    emps.forEach(function(e) {
        if (typeof e.email === 'undefined') { e.email = ''; emailChanged = true; }
        if (typeof e.blocked === 'undefined') { e.blocked = false; emailChanged = true; }
    });
    if (emailChanged) DB.set('employees', emps);

    // Migration v2: skip — superseded by v3

    // Migration v3: remove gazebo time option (id:23), update balls & shop inputType
    if (DB.get('tariffs_version') !== 'v3') {
        let tariffs = DB.get('tariffs', []);
        // Remove "Дополнительное время в беседке" (id:23)
        tariffs = tariffs.filter(t => t.id !== 23);
        // Update balls (id:20) — inputType number
        const balls = tariffs.find(t => t.id === 20);
        if (balls) { balls.inputType = 'number'; balls.inputPlaceholder = 'Кол-во шаров'; balls.name = 'Дополнительные шары'; balls.unit = 'шт'; balls.ballsPerPerson = 1; }
        // Update shop (id:25) — inputType shop
        const shop = tariffs.find(t => t.id === 25);
        if (shop) { shop.inputType = 'shop'; shop.inputPlaceholder = 'Сумма ₽'; shop.price = 1; shop.unit = 'шт'; }
        DB.set('tariffs', tariffs);
        DB.set('tariffs_version', 'v3');
        console.log('Migration v3: removed gazebo time, updated balls & shop');
    }

}

// ===== STATE =====
let currentUser = null;
let currentPin = '';
let calendarDate = moscowNow();
let empCalendarDate = moscowNow();
let selectedCalDay = null;
let empSelectedCalDay = null;
let revenueChart = null;
let servicesChart = null;
let shiftTimerInterval = null;
let pendingShiftRole = null;
let autoCloseInterval = null;
let empSalaryPeriod = 'month';
let dirSalaryPeriod = 'month';

// ===== AUTO-CLOSE SHIFTS AT 23:23 =====
function autoCloseStaleShifts() {
    // Close any open shifts from previous days (forgotten shifts)
    const todayStr = todayLocal();
    const shifts = DB.get('shifts', []);
    let changed = false;
    shifts.forEach(s => {
        if (!s.endTime && s.date < todayStr) {
            s.endTime = '23:23';
            s.autoClosedAt = new Date().toISOString();
            s.earnings = calculateShiftEarnings(s);
            changed = true;
            console.log('Auto-closed stale shift from', s.date, 'for', s.employeeName);
        }
    });
    if (changed) DB.set('shifts', shifts);
    return changed;
}

function startAutoCloseTimer() {
    if (autoCloseInterval) clearInterval(autoCloseInterval);
    autoCloseInterval = setInterval(() => {
        const now = moscowNow();
        if (now.getHours() > 23 || (now.getHours() === 23 && now.getMinutes() >= 23)) {
            const todayStr = todayLocal();
            const shifts = DB.get('shifts', []);
            let changed = false;
            shifts.forEach(s => {
                if (s.date === todayStr && !s.endTime) {
                    s.endTime = '23:23';
                    s.autoClosedAt = new Date().toISOString();
                    s.earnings = calculateShiftEarnings(s);
                    changed = true;
                    // Clear localStorage backup
                    try { localStorage.removeItem('hp_active_shift_' + s.employeeId); } catch(e) {}
                }
            });
            if (changed) {
                DB.set('shifts', shifts);
                const empScreen = document.getElementById('employee-screen');
                if (empScreen && empScreen.classList.contains('active')) loadEmployeeDashboard();
                const finPage = document.getElementById('page-finances');
                if (finPage && finPage.classList.contains('active')) loadFinances();
                showToast('Смены автоматически закрыты в 23:23');
            }
        }
    }, 60000);
}

// ===== INIT =====
// Called from auth.js after Firestore is ready and user is authenticated
function onFirestoreReady() {
    // Refresh UI with data from Firestore
    applyAccentColor(DB.get('accentColor', '#FFD600'));
    if (typeof loadDashboard === 'function') loadDashboard();
    if (typeof initDirectorDashDragDrop === 'function') initDirectorDashDragDrop();
    if (typeof loadDirectorTariffs === 'function') loadDirectorTariffs();

    // Auto-cleanup duplicate events on startup
    if (typeof GCalSync !== 'undefined' && GCalSync.deduplicateEvents) {
        var removed = GCalSync.deduplicateEvents();
        if (removed > 0) {
            console.log('Startup dedup: removed ' + removed + ' duplicate events');
        }
    }

    // Auto-close forgotten shifts from previous days
    autoCloseStaleShifts();

    // Start timer for auto-closing shifts at 23:23
    startAutoCloseTimer();
}

document.addEventListener('DOMContentLoaded', async () => {
    // UI initialization only — data comes from Firestore via auth.js
    initPinPad();
    initNavigation();
    initEmployeeNavigation();
    initEmployees();
    initSchedule();
    initFinances();
    initCertificates();
    initDocuments();
    initClients();
    initSettings();
    initEmployeeScreen();
    updateDate();
    applyAccentColor(DB.get('accentColor', '#FFD600'));
    GCalSync.init();
    // Auto-sync enabled — pulls from GCal every 3 min (startAutoSync called inside init)
    // GSheetsSync disabled — Firestore is the single source of truth
    initDirectorTariffs();
    // Firestore is the single source of truth

    // Real-time UI updates from other devices via Firestore
    DB.onChange(() => {
        // Re-render the active director page
        const activeDir = document.querySelector('#app-screen .page.active');
        if (activeDir) {
            const pid = activeDir.id;
            if (pid === 'page-dashboard') loadDashboard();
            else if (pid === 'page-employees') loadEmployees();
            else if (pid === 'page-schedule') renderCalendar();
            else if (pid === 'page-finances') loadFinances();
            else if (pid === 'page-certificates') loadCertificates();
            else if (pid === 'page-documents') loadDocuments();
            else if (pid === 'page-clients') loadClients();
            else if (pid === 'page-tariffs') loadDirectorTariffs();
            else if (pid === 'page-settings') { loadSettingsData(); loadManagerAssignment(); }
        }
        // Re-render employee screen if active
        const empScreen = document.getElementById('employee-screen');
        if (empScreen && empScreen.classList.contains('active')) {
            if (typeof loadEmployeeDashboard === 'function') loadEmployeeDashboard();
        }
        applyAccentColor(DB.get('accentColor', '#FFD600'));
    });
});

// ===== PIN PAD =====
function initPinPad() {
    document.querySelectorAll('.pin-btn[data-digit]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentPin.length >= 4) return;
            currentPin += btn.dataset.digit;
            updatePinDots();
            if (currentPin.length === 4) {
                setTimeout(() => attemptLogin(), 200);
            }
        });
    });

    document.getElementById('pin-backspace').addEventListener('click', () => {
        currentPin = currentPin.slice(0, -1);
        updatePinDots();
        document.getElementById('pin-message').textContent = 'Введите ПИН-код';
        document.getElementById('pin-message').className = 'pin-label';
    });

    document.addEventListener('keydown', (e) => {
        if (!document.getElementById('login-screen').classList.contains('active')) return;
        if (e.key >= '0' && e.key <= '9' && currentPin.length < 4) {
            currentPin += e.key;
            updatePinDots();
            if (currentPin.length === 4) setTimeout(() => attemptLogin(), 200);
        }
        if (e.key === 'Backspace') {
            currentPin = currentPin.slice(0, -1);
            updatePinDots();
        }
    });
}

function updatePinDots() {
    document.querySelectorAll('.pin-dot').forEach((dot, i) => {
        dot.classList.toggle('filled', i < currentPin.length);
        dot.classList.remove('error');
    });
}

function attemptLogin() {
    const employees = DB.get('employees', []);
    const user = employees.find(e => e.pin === currentPin);

    if (user) {
        // Check if PIN matches Firebase email
        const firebaseEmail = sessionStorage.getItem('hp_firebase_email');
        if (firebaseEmail && user.email && user.email.toLowerCase() !== firebaseEmail.toLowerCase()) {
            document.querySelectorAll('.pin-dot').forEach(d => d.classList.add('error'));
            document.getElementById('pin-message').textContent = 'ПИН не соответствует аккаунту';
            document.getElementById('pin-message').className = 'pin-label error';
            setTimeout(() => {
                currentPin = '';
                updatePinDots();
            }, 800);
            return;
        }
        currentUser = user;
        showToast(`Добро пожаловать, ${user.firstName}!`);
        if (user.role === 'director') {
            showScreen('app-screen');
            document.getElementById('director-name').textContent = user.firstName + ' ' + user.lastName;
            navigateTo('dashboard');
        } else {
            showScreen('employee-screen');
            setupEmployeeScreen(user);
            empNavigateTo('emp-dashboard');
        }
        // Init GCal connection + auto-sync
        if (typeof GCalSync !== 'undefined') {
            setTimeout(async () => {
                if (!GCalSync.isConnected()) await GCalSync.init();
            }, 2000);
        }
    } else {
        document.querySelectorAll('.pin-dot').forEach(d => d.classList.add('error'));
        document.getElementById('pin-message').textContent = 'Неверный ПИН-код';
        document.getElementById('pin-message').className = 'pin-label error';
        setTimeout(() => {
            currentPin = '';
            updatePinDots();
        }, 800);
        return;
    }
    currentPin = '';
    updatePinDots();
}

// ===== SCREENS =====
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function logout() {
    currentUser = null;
    currentPin = '';
    if (shiftTimerInterval) { clearInterval(shiftTimerInterval); shiftTimerInterval = null; }
    updatePinDots();
    // Firebase signOut — onAuthStateChanged will show firebase-login-screen
    if (typeof FirebaseAuth !== 'undefined') {
        FirebaseAuth.signOut();
    } else {
        showScreen('login-screen');
    }
    document.getElementById('pin-message').textContent = 'Введите ПИН-код';
    document.getElementById('pin-message').className = 'pin-label';
}

// ===== EMPLOYEE SCREEN SETUP =====
function setupEmployeeScreen(user) {
    document.getElementById('emp-user-name').textContent = user.firstName + ' ' + user.lastName;
    document.getElementById('emp-dash-name').textContent = user.firstName + ' ' + user.lastName;
    const empDate = document.getElementById('emp-top-bar-date');
    if (empDate) {
        empDate.textContent = moscowNow().toLocaleDateString('ru-RU', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    }
    loadEmployeeDashboard();
}

function loadEmployeeDashboard() {
    if (!currentUser) return;
    const todayStr = todayLocal();
    const shifts = DB.get('shifts', []);
    let todayShift = shifts.find(s => s.date === todayStr && s.employeeId === currentUser.id);

    // Recover active shift from localStorage backup if missing in DB
    if (!todayShift) {
        try {
            const backup = localStorage.getItem('hp_active_shift_' + currentUser.id);
            if (backup) {
                const saved = JSON.parse(backup);
                if (saved && saved.date === todayStr && !saved.endTime) {
                    shifts.push(saved);
                    DB.set('shifts', shifts);
                    todayShift = saved;
                    console.log('Shift restored from localStorage backup');
                } else {
                    localStorage.removeItem('hp_active_shift_' + currentUser.id);
                }
            }
        } catch(e) { console.error('Shift recovery error:', e); }
    }

    const btnStart = document.getElementById('emp-btn-start-work');
    const btnFinish = document.getElementById('emp-btn-finish-work');
    const btnCancel = document.getElementById('emp-btn-cancel-shift');
    const btnDone = document.getElementById('emp-btn-shift-done');
    const shiftInfo = document.getElementById('emp-shift-info');
    const shiftStatus = document.getElementById('emp-shift-status');
    const statusText = document.getElementById('emp-shift-status-text');
    const shiftBadge = document.getElementById('emp-shift-badge');
    const selectedEventsDiv = document.getElementById('emp-selected-events');
    const roleText = document.getElementById('emp-dash-role');

    btnStart.style.display = 'none';
    btnFinish.style.display = 'none';
    btnCancel.style.display = 'none';
    btnDone.style.display = 'none';
    shiftInfo.style.display = 'none';
    selectedEventsDiv.style.display = 'none';
    shiftBadge.style.display = 'none';
    document.getElementById('emp-earnings-row').style.display = 'none';
    document.getElementById('emp-earnings-detail').style.display = 'none';

    if (todayShift) {
        const shiftRoleName = getRoleName(todayShift.shiftRole) || todayShift.shiftRole;
        roleText.textContent = shiftRoleName;
        shiftInfo.style.display = 'block';
        document.getElementById('emp-shift-start-time').textContent = todayShift.startTime;

        if (todayShift.endTime) {
            // Shift ended
            document.getElementById('emp-shift-end-row').style.display = 'flex';
            document.getElementById('emp-shift-end-time').textContent = todayShift.endTime;
            btnDone.style.display = 'flex';
            shiftStatus.className = 'shift-status ended';
            statusText.textContent = todayShift.autoClosedAt ? 'Завершена автоматически (23:23)' : 'Смена завершена';
            shiftBadge.style.display = 'none';

            if (todayShift.earnings) {
                document.getElementById('emp-earnings-row').style.display = 'flex';
                document.getElementById('emp-shift-earnings').textContent = formatMoney(todayShift.earnings.total);
                document.getElementById('emp-earnings-detail').style.display = 'block';
                document.getElementById('emp-earn-base').textContent = formatMoney(todayShift.earnings.base);
                document.getElementById('emp-earn-bonus').textContent = formatMoney(todayShift.earnings.bonus);
            }
            if (shiftTimerInterval) { clearInterval(shiftTimerInterval); shiftTimerInterval = null; }
        } else {
            // On shift
            document.getElementById('emp-shift-end-row').style.display = 'none';
            btnFinish.style.display = 'flex';
            btnCancel.style.display = 'flex';
            shiftStatus.className = 'shift-status active';
            statusText.textContent = 'На смене';
            shiftBadge.style.display = 'flex';
            document.getElementById('emp-shift-badge-text').textContent = shiftRoleName;
            startShiftTimer(todayShift.startTime);

            // Show event bonuses earned during shift
            if (todayShift.eventBonuses && todayShift.eventBonuses.length > 0) {
                selectedEventsDiv.style.display = 'block';
                document.getElementById('emp-selected-events-list').innerHTML = todayShift.eventBonuses.map(b =>
                    `<span class="emp-selected-event-chip">${b.eventTitle || 'Мероприятие'}: +${formatMoney(b.amount)}</span>`
                ).join('');
            }
        }
    } else {
        roleText.textContent = 'Должность не выбрана';
        btnStart.style.display = 'flex';
        shiftStatus.className = 'shift-status';
        statusText.textContent = 'Смена не начата';
    }

    // Quick stats
    const events = DB.get('events', []).filter(e => e.date === todayStr);
    document.getElementById('emp-events-today-count').textContent = events.length;
    document.getElementById('emp-events-today-preview').innerHTML = events.length === 0
        ? '<p class="empty-state">Нет мероприятий</p>'
        : events.slice(0, 3).map(e => `
            <div class="list-item">
                <span class="material-icons-round">event</span>
                <div class="list-item-info">
                    <strong>${e.title}</strong>${e.clientName ? `<span style="color:var(--text-secondary);font-size:12px;">${e.clientName}</span>` : ''}
                    <span>${e.time} · ${formatParticipants(e)}</span>
                </div>
            </div>
        `).join('');

    // My events count
    const myEvents = todayShift && todayShift.selectedEvents
        ? events.filter(e => todayShift.selectedEvents.includes(e.id))
        : [];
    document.getElementById('emp-my-events-count').textContent = myEvents.length;
    document.getElementById('emp-my-events-preview').innerHTML = myEvents.length === 0
        ? '<p class="empty-state">Не выбраны</p>'
        : myEvents.map(e => `
            <div class="list-item">
                <span class="material-icons-round">assignment_ind</span>
                <div class="list-item-info">
                    <strong>${e.title}</strong>
                    <span>${e.time} · ${formatMoney(e.price)}</span>
                </div>
            </div>
        `).join('');
}

function startShiftTimer(startTimeStr) {
    if (shiftTimerInterval) clearInterval(shiftTimerInterval);
    const updateTimer = () => {
        const now = moscowNow();
        const [h, m] = startTimeStr.split(':').map(Number);
        const start = new Date(now);
        start.setHours(h, m, 0, 0);
        const diff = now - start;
        if (diff < 0) {
            document.getElementById('emp-shift-timer').textContent = '0:00';
            return;
        }
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        document.getElementById('emp-shift-timer').textContent = `${hours}:${String(mins).padStart(2, '0')}`;
        document.getElementById('emp-shift-timer-label').textContent = 'часов на смене';
    };
    updateTimer();
    shiftTimerInterval = setInterval(updateTimer, 30000);
}

// ===== EMPLOYEE SCREEN INIT =====
function initEmployeeScreen() {
    // START WORK button — shift always starts in employee's main role
    document.getElementById('emp-btn-start-work').addEventListener('click', () => {
        if (!currentUser) return;
        pendingShiftRole = currentUser.role;
        startShift();
    });

    document.getElementById('modal-role-close').addEventListener('click', () => closeModal('modal-role-select'));

    // Event selection modal
    document.getElementById('modal-event-select-close').addEventListener('click', () => closeModal('modal-event-select'));
    document.getElementById('btn-skip-events').addEventListener('click', () => {
        startShift([], {});
    });
    document.getElementById('btn-confirm-events').addEventListener('click', () => {
        const selected = [];
        const eventRoles = {};
        document.querySelectorAll('.event-select-item.selected').forEach(item => {
            const eventId = parseInt(item.dataset.eventId);
            selected.push(eventId);
            eventRoles[eventId] = item.dataset.eventRole || currentUser.role;
        });
        startShift(selected, eventRoles);
    });

    // FINISH WORK button — show comment modal first
    document.getElementById('emp-btn-finish-work').addEventListener('click', () => {
        document.getElementById('shift-comment-text').value = '';
        openModal('modal-shift-comment');
    });

    // Shift comment save — actually end the shift
    document.getElementById('shift-comment-save').addEventListener('click', () => {
        const comment = document.getElementById('shift-comment-text').value.trim();
        const todayStr = todayLocal();
        const timeStr = moscowTimeStr();
        const shifts = DB.get('shifts', []);
        const idx = shifts.findIndex(s => s.date === todayStr && s.employeeId === currentUser.id && !s.endTime);
        if (idx >= 0) {
            shifts[idx].endTime = timeStr;
            shifts[idx].shiftComment = comment || '';
            const earnings = calculateShiftEarnings(shifts[idx]);
            shifts[idx].earnings = earnings;
            DB.set('shifts', shifts);
            try { localStorage.removeItem('hp_active_shift_' + currentUser.id); } catch(e) {}
            showToast(`Смена завершена! Заработок: ${formatMoney(earnings.total)}`);
        }
        closeModal('modal-shift-comment');
        loadEmployeeDashboard();
    });

    // Cancel shift button
    document.getElementById('emp-btn-cancel-shift').addEventListener('click', () => {
        showConfirm('Отменить смену?', 'Данные о смене будут удалены', () => {
            const todayStr = todayLocal();
            const shifts = DB.get('shifts', []);
            const idx = shifts.findIndex(s => s.date === todayStr && s.employeeId === currentUser.id && !s.endTime);
            if (idx >= 0) {
                shifts.splice(idx, 1);
                DB.set('shifts', shifts);
            }
            // Clear localStorage backup — shift is cancelled
            try { localStorage.removeItem('hp_active_shift_' + currentUser.id); } catch(e) {}
            if (shiftTimerInterval) { clearInterval(shiftTimerInterval); shiftTimerInterval = null; }
            loadEmployeeDashboard();
            showToast('Смена отменена');
        });
    });

    // Shift done button (just a visual indicator, no action needed)
    document.getElementById('emp-btn-shift-done').addEventListener('click', () => {});

    // Logout
    document.getElementById('emp-logout').addEventListener('click', logout);

    // Employee booking
    const empBtnAdd = document.getElementById('emp-btn-add-booking');
    if (empBtnAdd) empBtnAdd.addEventListener('click', () => openEventModal());

    const empSyncGcal = document.getElementById('emp-btn-sync-gcal');
    if (empSyncGcal) empSyncGcal.addEventListener('click', async () => {
        if (!GCalSync.isConnected()) {
            showToast('Google Calendar не подключён. Директор должен подключить в Настройках.');
            return;
        }
        const result = await GCalSync.fullSync();
        if (result) {
            renderEmpCalendar();
            loadEmployeeEvents();
        }
    });

    // Employee calendar
    const empCalPrev = document.getElementById('emp-cal-prev');
    const empCalNext = document.getElementById('emp-cal-next');
    if (empCalPrev) empCalPrev.addEventListener('click', () => {
        empCalendarDate.setMonth(empCalendarDate.getMonth() - 1);
        renderEmpCalendar();
    });
    if (empCalNext) empCalNext.addEventListener('click', () => {
        empCalendarDate.setMonth(empCalendarDate.getMonth() + 1);
        renderEmpCalendar();
    });

    // Tariff tabs
    document.querySelectorAll('.tariff-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tariff-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadTariffs(tab.dataset.tariffTab);
        });
    });

    // Payment modal
    document.getElementById('modal-payment-close').addEventListener('click', () => closeModal('modal-payment'));
    document.getElementById('btn-cancel-payment').addEventListener('click', () => closeModal('modal-payment'));

    // Payment method toggle (combo + transfer bank)
    document.querySelectorAll('input[name="payment-method"]').forEach(radio => {
        radio.addEventListener('change', () => {
            document.getElementById('combo-payment-fields').style.display =
                radio.value === 'combo' && radio.checked ? 'block' : 'none';
            document.getElementById('transfer-bank-select').style.display =
                radio.value === 'transfer' && radio.checked ? 'block' : 'none';
        });
    });

    document.getElementById('btn-complete-payment').addEventListener('click', completeEventPayment);

    // Salary period toggle
    document.querySelectorAll('#emp-salary-period-toggle .period-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#emp-salary-period-toggle .period-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            empSalaryPeriod = btn.dataset.period;
            loadEmployeeSalary();
        });
    });

    // Draggable dashboard cards
    initDashboardDragDrop();
}

function getAvailableEventRoles() {
    if (!currentUser) return [];
    const mainRole = currentUser.role;
    const additionalRoles = (currentUser.allowedShiftRoles || []).filter(r => r !== mainRole && r !== 'manager');
    const roles = [mainRole];
    additionalRoles.forEach(r => { if (!roles.includes(r)) roles.push(r); });
    return roles.filter(r => r !== 'director');
}

function showEventSelectionModal() {
    const todayStr = todayLocal();
    const events = DB.get('events', []).filter(e => e.date === todayStr && e.status !== 'cancelled');
    const list = document.getElementById('event-select-list');
    const availableRoles = getAvailableEventRoles();
    const hasMultipleRoles = availableRoles.length > 1;

    if (events.length === 0) {
        list.innerHTML = '<p class="empty-state">Нет мероприятий на сегодня</p>';
    } else {
        list.innerHTML = events.map(e => `
            <div class="event-select-item" data-event-id="${e.id}" data-event-role="${availableRoles[0]}">
                <div class="event-select-checkbox">
                    <span class="material-icons-round">check</span>
                </div>
                <div class="event-select-info">
                    <strong>${e.title}</strong>${e.clientName ? ` <span style="font-weight:400;color:var(--text-secondary);font-size:12px;">— ${e.clientName}</span>` : ''}
                    <span>${e.time} · ${formatParticipants(e)} · ${getEventTypeName(e.type)}</span>
                </div>
                ${hasMultipleRoles ? `<select class="event-role-select" onclick="event.stopPropagation()">
                    ${availableRoles.map(r => `<option value="${r}">${getRoleName(r)}</option>`).join('')}
                </select>` : `<span class="event-role-badge"><span class="list-item-badge badge-blue">${getRoleName(availableRoles[0])}</span></span>`}
                <span class="event-select-price">${formatMoney(e.price)}</span>
            </div>
        `).join('');

        // Toggle selection + bind role select
        list.querySelectorAll('.event-select-item').forEach(item => {
            item.addEventListener('click', () => {
                item.classList.toggle('selected');
            });
            const roleSelect = item.querySelector('.event-role-select');
            if (roleSelect) {
                roleSelect.addEventListener('change', (ev) => {
                    item.dataset.eventRole = ev.target.value;
                });
            }
        });
    }

    openModal('modal-event-select');
}

function startShift() {
    const todayStr = todayLocal();
    const timeStr = moscowTimeStr();

    const shift = {
        id: Date.now(),
        employeeId: currentUser.id,
        employeeName: currentUser.firstName + ' ' + currentUser.lastName,
        employeeRole: currentUser.role,
        shiftRole: pendingShiftRole,
        date: todayStr,
        startTime: timeStr,
        endTime: null,
        eventBonuses: [],
        earnings: null
    };

    const shifts = DB.get('shifts', []);
    shifts.push(shift);
    DB.set('shifts', shifts);

    // Backup active shift in localStorage for tab-close resilience
    try { localStorage.setItem('hp_active_shift_' + currentUser.id, JSON.stringify(shift)); } catch(e) {}

    pendingShiftRole = null;
    loadEmployeeDashboard();
    showToast('Смена начата! Хорошего рабочего дня!');

}

// ===== SALARY CALCULATION =====
function calculateEventRevenueBySources(event, sources) {
    // Calculate revenue from an event based on selected bonus sources
    const tariffs = DB.get('tariffs', []);
    let total = 0;

    if (!sources || sources.length === 0) {
        // Legacy: use full event price
        return event.price || 0;
    }

    // Base service price
    if (sources.includes('services')) {
        if (event.tariffId) {
            const tariff = tariffs.find(t => t.id === event.tariffId);
            if (tariff) {
                total += (tariff.price || 0) * (event.participants || 1);
            }
        } else {
            // No specific tariff — use event price as service
            total += event.price || 0;
        }
    }

    // Options for game (price × qty × participants)
    if (sources.includes('optionsForGame') && event.selectedOptions) {
        event.selectedOptions.forEach(optId => {
            const opt = tariffs.find(t => t.id === optId && t.category === 'optionsForGame');
            if (opt) {
                const qty = event.optionQuantities?.[optId] || 1;
                total += (opt.price || 0) * qty * (event.participants || 1);
            }
        });
    }

    // Additional options (price × qty, NOT per participant)
    if (sources.includes('options') && event.selectedOptions) {
        event.selectedOptions.forEach(optId => {
            const opt = tariffs.find(t => t.id === optId && t.category === 'options');
            if (opt) {
                const qty = event.optionQuantities?.[optId] || 1;
                total += (opt.price || 0) * qty;
            }
        });
    }

    // If no tariff breakdown available, fallback to event price
    if (total === 0 && (event.price || 0) > 0) {
        total = event.price;
    }

    return total;
}

function calculateShiftEarnings(shift) {
    const rules = DB.get('salaryRules', {
        instructor: { shiftRate: 1500, bonusPercent: 5 },
        admin: { shiftRate: 0, bonusPercent: 5 }
    });

    const role = shift.shiftRole || shift.employeeRole;
    let base = 0;
    let bonusDetail = '';

    if (role === 'instructor' || role === 'senior_instructor') {
        const rule = rules[role] || rules.instructor || { shiftRate: 1500 };
        base = rule.shiftRate || 0;
    } else if (role === 'admin') {
        const rule = rules.admin || { shiftRate: 0 };
        base = rule.shiftRate || 0;
    } else if (role === 'manager') {
        base = 0;
        bonusDetail = 'Ставка менеджера начисляется автоматически ежедневно';
    }

    // Bonus comes from completed events (stored in eventBonuses)
    const bonus = (shift.eventBonuses || []).reduce((sum, b) => sum + (b.amount || 0), 0);
    if (bonus > 0) {
        bonusDetail = `Бонус за ${(shift.eventBonuses || []).length} мероприятий`;
    }

    return { base, bonus, total: base + bonus, bonusDetail };
}

function getEmployeeMonthEarnings(employeeId) {
    const now = moscowNow();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const shifts = DB.get('shifts', []).filter(s =>
        s.employeeId === employeeId &&
        s.date.startsWith(monthStr) &&
        s.endTime &&
        s.earnings
    );

    const totalEarned = shifts.reduce((sum, s) => sum + (s.earnings?.total || 0), 0);
    return { shifts, totalEarned, shiftCount: shifts.length };
}

// ===== SALARY PAYMENT HELPERS =====
function getPaymentMethodName(method) {
    const names = { cash: 'Наличные', card: 'Карта', sberbank: 'Сбербанк', tbank: 'Т-Банк', raiffeisen: 'Райффайзен', alfabank: 'Альфа Банк', invoice: 'По счёту', qr: 'QR' };
    return names[method] || method;
}

function getDateRangeForPeriod(period) {
    const now = moscowNow();
    const todayStr = todayLocal();
    let startDate;
    if (period === 'week') {
        const dayOfWeek = now.getDay() || 7;
        const monday = new Date(now);
        monday.setDate(now.getDate() - dayOfWeek + 1);
        startDate = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    } else if (period === 'month') {
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    } else {
        startDate = `${now.getFullYear()}-01-01`;
    }
    return { startDate, endDate: todayStr };
}

// Calculate manager daily accruals for a given period
// Returns array of { date, amount } for each day the employee was a manager
function getManagerDailyAccruals(emp, startDate, endDate) {
    const roles = emp.allowedShiftRoles || getDefaultAllowedRoles(emp.role);
    const isManager = roles.includes('manager');
    const managerSince = emp.managerSince; // date string YYYY-MM-DD
    const managerUntil = emp.managerUntil; // date string YYYY-MM-DD or undefined

    if (!isManager && !managerUntil) return [];
    if (!managerSince && !isManager) return [];

    const rules = DB.get('salaryRules', {});
    const mgrRule = rules.manager || { dailyRate: 360 };
    const dailyRate = mgrRule.dailyRate || 360;

    // Determine effective range
    const effectiveStart = managerSince && managerSince > startDate ? managerSince : startDate;
    const effectiveEnd = managerUntil && managerUntil < endDate ? managerUntil : endDate;

    if (effectiveStart > effectiveEnd) return [];

    const accruals = [];
    const today = todayLocal();
    let d = new Date(effectiveStart + 'T00:00:00');
    const end = new Date((effectiveEnd > today ? today : effectiveEnd) + 'T00:00:00');

    while (d <= end) {
        const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        accruals.push({ date: dateStr, amount: dailyRate });
        d.setDate(d.getDate() + 1);
    }
    return accruals;
}

function getEmployeeEarningsForPeriod(employeeId, period) {
    const { startDate, endDate } = getDateRangeForPeriod(period);
    const shifts = DB.get('shifts', []).filter(s =>
        s.employeeId === employeeId && s.date >= startDate && s.date <= endDate && s.endTime && s.earnings
    );
    const totalEarned = shifts.reduce((sum, s) => sum + (s.earnings?.total || 0), 0);
    return { shifts, totalEarned, shiftCount: shifts.length };
}

function getEmployeePaymentsForPeriod(employeeId, period) {
    const { startDate, endDate } = getDateRangeForPeriod(period);
    const payments = DB.get('salaryPayments', []).filter(p =>
        p.employeeId === employeeId && p.date >= startDate && p.date <= endDate
    );
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    return { payments, totalPaid };
}

function getEmployeeTotalPaid(employeeId) {
    return DB.get('salaryPayments', [])
        .filter(p => p.employeeId === employeeId)
        .reduce((sum, p) => sum + (p.amount || 0), 0);
}

// ===== SALARY PAYMENT MODAL =====
function openSalaryPaymentModal(preselectedEmployeeId) {
    const employees = DB.get('employees', []).filter(e => e.role !== 'director');
    const sel = document.getElementById('salary-pay-employee');
    sel.innerHTML = '<option value="">— Выберите сотрудника —</option>' +
        employees.map(e => `<option value="${e.id}">${e.firstName} ${e.lastName}</option>`).join('');
    if (preselectedEmployeeId) {
        sel.value = preselectedEmployeeId;
        updateSalaryPayInfo(preselectedEmployeeId);
    } else {
        document.getElementById('salary-pay-info').style.display = 'none';
    }
    document.getElementById('salary-pay-amount').value = '';
    document.getElementById('salary-pay-note').value = '';
    const cashRadio = document.querySelector('input[name="salary-pay-method"][value="cash"]');
    if (cashRadio) cashRadio.checked = true;
    openModal('modal-salary-payment');
}

function updateSalaryPayInfo(employeeId) {
    if (!employeeId) { document.getElementById('salary-pay-info').style.display = 'none'; return; }
    const empIdNum = parseInt(employeeId);
    const emp = DB.get('employees', []).find(e => e.id === empIdNum);
    const { startDate, endDate } = getDateRangeForPeriod('month');
    const shiftEarned = getEmployeeEarningsForPeriod(empIdNum, 'month').totalEarned;
    const mgrAccruals = emp ? getManagerDailyAccruals(emp, startDate, endDate) : [];
    const mgrTotal = mgrAccruals.reduce((s, a) => s + a.amount, 0);
    const earned = shiftEarned + mgrTotal;
    const paid = getEmployeePaymentsForPeriod(empIdNum, 'month').totalPaid;
    const balance = earned - paid;
    document.getElementById('salary-pay-earned').textContent = formatMoney(earned);
    document.getElementById('salary-pay-already-paid').textContent = formatMoney(paid);
    const debtEl = document.getElementById('salary-pay-debt');
    debtEl.textContent = (balance < 0 ? 'Переплата ' : '') + formatMoney(Math.abs(balance));
    debtEl.style.color = balance > 0 ? 'var(--red)' : balance < 0 ? 'var(--green)' : '';
    document.getElementById('salary-pay-info').style.display = 'block';
    document.getElementById('salary-pay-amount').value = balance > 0 ? balance : '';
}

function confirmSalaryPayment() {
    const employeeId = parseInt(document.getElementById('salary-pay-employee').value);
    if (!employeeId) { showToast('Выберите сотрудника'); return; }
    const amount = parseFloat(document.getElementById('salary-pay-amount').value);
    if (!amount || amount <= 0) { showToast('Введите сумму'); return; }
    const method = document.querySelector('input[name="salary-pay-method"]:checked')?.value || 'cash';
    const note = document.getElementById('salary-pay-note').value.trim();
    const employees = DB.get('employees', []);
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return;
    const payment = {
        id: Date.now(),
        date: todayLocal(),
        time: moscowTimeStr(),
        employeeId, employeeName: emp.firstName + ' ' + emp.lastName,
        amount, method, note
    };
    const payments = DB.get('salaryPayments', []);
    payments.push(payment);
    DB.set('salaryPayments', payments);
    closeModal('modal-salary-payment');
    showToast(`Выплата ${formatMoney(amount)} — ${emp.firstName} (${getPaymentMethodName(method)})`);
    const empPage = document.getElementById('page-employees');
    if (empPage && empPage.classList.contains('active')) loadEmployees();
    const finPage = document.getElementById('page-finances');
    if (finPage && finPage.classList.contains('active')) loadFinances(document.querySelector('.fin-tab.active')?.dataset.fin || 'receipts');
}

// ===== EMPLOYEE NAVIGATION =====
function initEmployeeNavigation() {
    document.querySelectorAll('[data-emp-page]').forEach(item => {
        item.addEventListener('click', () => {
            empNavigateTo(item.dataset.empPage);
        });
    });

    document.getElementById('emp-btn-hamburger').addEventListener('click', () => {
        document.getElementById('emp-sidebar').classList.toggle('open');
    });

    document.querySelector('#employee-screen .main-content').addEventListener('click', (e) => {
        if (!e.target.closest('#emp-btn-hamburger')) {
            document.getElementById('emp-sidebar').classList.remove('open');
        }
    });
}

function empNavigateTo(page) {
    // Sync sidebar nav
    document.querySelectorAll('#employee-screen .nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`#employee-screen .sidebar .nav-item[data-emp-page="${page}"]`);
    if (navItem) navItem.classList.add('active');
    // Sync mobile bottom nav
    document.querySelectorAll('#emp-mobile-bottom-nav .mobile-nav-item').forEach(n => n.classList.remove('active'));
    const mobileEl = document.querySelector(`#emp-mobile-bottom-nav .mobile-nav-item[data-emp-page="${page}"]`);
    if (mobileEl) mobileEl.classList.add('active');

    document.querySelectorAll('#employee-screen .page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById('emp-page-' + page.replace('emp-', ''));
    if (pageEl) pageEl.classList.add('active');

    const titles = {
        'emp-dashboard': 'Главная',
        'emp-events': 'Мероприятия',
        'emp-booking': 'Бронирование',
        'emp-salary': 'Зарплата',
        'emp-tariffs': 'Тарифы'
    };
    document.getElementById('emp-page-title').textContent = titles[page] || 'Главная';

    if (page === 'emp-dashboard') loadEmployeeDashboard();
    if (page === 'emp-events') loadEmployeeEvents();
    if (page === 'emp-booking') renderEmpCalendar();
    if (page === 'emp-salary') loadEmployeeSalary();
    if (page === 'emp-tariffs') loadTariffs('services');

    document.getElementById('emp-sidebar').classList.remove('open');
}

// ===== EMPLOYEE EVENTS PAGE =====
function loadEmployeeEvents() {
    const todayStr = todayLocal();
    const events = DB.get('events', []).filter(e => e.date === todayStr);
    const employees = DB.get('employees', []);
    const list = document.getElementById('emp-events-list');

    if (events.length === 0) {
        list.innerHTML = '<p class="empty-state">Нет мероприятий на сегодня</p>';
        return;
    }

    list.innerHTML = events.map(e => {
        const staffNames = getStaffNames(e) || '—';
        const statusClass = 'status-' + (e.status || 'pending');
        const statusName = getStatusName(e.status);
        const isCompleted = e.status === 'completed';

        return `
            <div class="emp-event-card">
                <div class="emp-event-time">${e.time}</div>
                <div class="emp-event-info">
                    <strong>${e.title}</strong>${e.clientName ? ` <span style="font-weight:400;color:var(--text-secondary);">— ${e.clientName}</span>` : ''}
                    <span>${formatParticipants(e)} · ${formatDuration(e.duration)} · ${staffNames} · ${formatMoney(e.price)}</span>
                </div>
                <span class="emp-event-status ${statusClass}">${statusName}</span>
                <div class="emp-event-actions">
                    <button class="btn-secondary btn-sm" onclick="openEventModal('${e.id}')">
                        <span class="material-icons-round" style="font-size:16px">visibility</span>
                        Подробнее
                    </button>
                    ${!isCompleted ? `
                    <button class="btn-primary btn-sm" onclick="openEventModal('${e.id}', true)">
                        <span class="material-icons-round" style="font-size:16px">done_all</span>
                        Выполнить
                    </button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ===== PAYMENT COMPLETION =====
let currentPaymentEventId = null;

function openPaymentModal(eventId) {
    currentPaymentEventId = eventId;
    const events = DB.get('events', []);
    const evt = events.find(e => String(e.id) === String(eventId));
    if (!evt) return;

    const prepay = evt.prepayment || 0;
    const amountToPay = prepay > 0 ? (evt.toPay || Math.max(0, (evt.price || 0) - prepay)) : (evt.price || 0);
    document.getElementById('payment-event-info').innerHTML = `
        <strong>${evt.title}</strong>${evt.clientName ? ` <span style="font-weight:400;color:var(--text-secondary);">— ${evt.clientName}</span>` : ''}
        <span>${evt.time} · ${formatParticipants(evt)} · ${getEventTypeName(evt.type)}</span>
        ${prepay > 0 ? `<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">Итого: ${formatMoney(evt.price)} · Предоплата: −${formatMoney(prepay)}</div>` : ''}
        <div class="payment-amount">К оплате: ${formatMoney(amountToPay)}</div>
    `;

    // Reset payment form
    document.querySelector('input[name="payment-method"][value="cash"]').checked = true;
    document.getElementById('combo-payment-fields').style.display = 'none';
    document.getElementById('transfer-bank-select').style.display = 'none';
    document.getElementById('combo-cash').value = '';
    document.getElementById('combo-card').value = '';
    document.getElementById('combo-transfer').value = '';
    document.getElementById('combo-qr').value = '';
    const defaultBank = document.querySelector('input[name="transfer-bank"][value="sberbank"]');
    if (defaultBank) defaultBank.checked = true;

    // Reset receipt checkbox
    const receiptCheckbox = document.getElementById('payment-receipt-printed');
    if (receiptCheckbox) receiptCheckbox.checked = false;

    // Instructor rating section — show if instructors assigned
    const hasInstructors = (evt.instructors && evt.instructors.length > 0) || (evt.assignedInstructors && evt.assignedInstructors.length > 0);
    const ratingSection = document.getElementById('instructor-rating-section');
    ratingSection.style.display = hasInstructors ? 'block' : 'none';
    // Reset stars
    document.querySelectorAll('#instructor-star-rating .star').forEach(s => s.classList.remove('active'));
    document.getElementById('instructor-rating-comment').value = '';
    // Star click handlers
    document.querySelectorAll('#instructor-star-rating .star').forEach(star => {
        star.onclick = () => {
            const val = parseInt(star.dataset.value);
            document.querySelectorAll('#instructor-star-rating .star').forEach(s => {
                s.classList.toggle('active', parseInt(s.dataset.value) <= val);
            });
        };
    });

    openModal('modal-payment');
}

function completeEventPayment() {
    if (!currentPaymentEventId) return;
    const events = DB.get('events', []);
    const idx = events.findIndex(e => String(e.id) === String(currentPaymentEventId));
    if (idx < 0) return;

    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
    let paymentDetails = { method: paymentMethod };

    if (paymentMethod === 'combo') {
        paymentDetails.combo = {
            cash: parseFloat(document.getElementById('combo-cash').value) || 0,
            card: parseFloat(document.getElementById('combo-card').value) || 0,
            transfer: parseFloat(document.getElementById('combo-transfer').value) || 0,
            qr: parseFloat(document.getElementById('combo-qr').value) || 0,
        };
    }

    if (paymentMethod === 'transfer') {
        const bankRadio = document.querySelector('input[name="transfer-bank"]:checked');
        paymentDetails.bank = bankRadio ? bankRadio.value : 'sberbank';
    }

    events[idx].status = 'completed';
    events[idx].paymentDetails = paymentDetails;
    events[idx].completedAt = new Date().toISOString();
    events[idx].completedBy = currentUser ? currentUser.id : null;

    // Save instructor rating
    const activeStars = document.querySelectorAll('#instructor-star-rating .star.active');
    const rating = activeStars.length > 0 ? activeStars.length : null;
    const ratingComment = document.getElementById('instructor-rating-comment').value.trim();
    if (rating) {
        events[idx].instructorRating = rating;
        events[idx].ratingComment = ratingComment || '';
    }

    // === DISTRIBUTE BONUSES TO ASSIGNED STAFF ===
    // Read from event data (saved in event form when completing)
    const selectedInstructors = events[idx].instructors || events[idx].assignedInstructors || [];
    const selectedAdmins = events[idx].admins || events[idx].assignedAdmins || [];

    const salaryRules = DB.get('salaryRules', {});
    const instrRule = salaryRules.instructor || salaryRules.senior_instructor || { bonusPercent: 5, bonusSources: ['services', 'optionsForGame', 'options'] };
    const adminRule = salaryRules.admin || { bonusPercent: 5, bonusSources: ['services', 'optionsForGame', 'options'] };

    const instrRevenue = calculateEventRevenueBySources(events[idx], instrRule.bonusSources || ['services', 'optionsForGame', 'options']);
    const adminRevenue = calculateEventRevenueBySources(events[idx], adminRule.bonusSources || ['services', 'optionsForGame', 'options']);

    const instrBonusTotal = Math.round(instrRevenue * (instrRule.bonusPercent || 5) / 100);
    const adminBonusTotal = Math.round(adminRevenue * (adminRule.bonusPercent || 5) / 100);
    const perInstructor = selectedInstructors.length > 0 ? Math.round(instrBonusTotal / selectedInstructors.length) : 0;
    const perAdmin = selectedAdmins.length > 0 ? Math.round(adminBonusTotal / selectedAdmins.length) : 0;

    events[idx].assignedInstructors = selectedInstructors;
    events[idx].assignedAdmins = selectedAdmins;
    events[idx].bonuses = {
        instructorTotal: instrBonusTotal, adminTotal: adminBonusTotal,
        perInstructor, perAdmin
    };

    // Credit bonuses to employee shifts
    const shifts = DB.get('shifts', []);
    const todayStr2 = todayLocal();
    const eventDate = events[idx].date || todayStr2;
    const evtTitle = events[idx].title || 'Мероприятие';

    const creditBonus = (empId, amount, bonusType) => {
        if (amount <= 0) return;
        // Find shift: first by event date, then by today (if completing next day)
        let shiftIdx = shifts.findIndex(s => s.date === eventDate && s.employeeId === empId);
        if (shiftIdx < 0 && eventDate !== todayStr2) {
            shiftIdx = shifts.findIndex(s => s.date === todayStr2 && s.employeeId === empId);
        }
        if (shiftIdx >= 0) {
            if (!shifts[shiftIdx].eventBonuses) shifts[shiftIdx].eventBonuses = [];
            // bonusType: 'instructor' or 'admin' — event role, NOT shift role
            // Shift rate is always based on employee's own role (for showing up)
            shifts[shiftIdx].eventBonuses.push({ eventId: events[idx].id, eventTitle: evtTitle, amount, bonusType });
            // Recalculate earnings (shift rate stays based on employee's own role)
            if (shifts[shiftIdx].endTime) {
                shifts[shiftIdx].earnings = calculateShiftEarnings(shifts[shiftIdx]);
            }
        }
    };

    selectedInstructors.forEach(id => creditBonus(id, perInstructor, 'instructor'));
    selectedAdmins.forEach(id => creditBonus(id, perAdmin, 'admin'));
    DB.set('shifts', shifts);

    // === AUTO-DEDUCT CONSUMABLES FROM STOCK ===
    const tariffs = DB.get('tariffs', []);
    const evt = events[idx];
    let totalBalls = 0, totalKidsBalls = 0, totalGrenades = 0, totalSmokes = 0;
    const isKidball = evt.type === 'kidball' || (evt.title || '').toLowerCase().includes('кидбол');

    // Main tariff × participants
    if (evt.tariffId) {
        const tariff = tariffs.find(t => t.id === evt.tariffId);
        if (tariff) {
            const balls = (tariff.ballsPerPerson || 0) * (evt.participants || 1);
            if (isKidball) totalKidsBalls += balls; else totalBalls += balls;
            totalGrenades += (tariff.grenadesPerPerson || 0) * (evt.participants || 1);
            totalSmokes += (tariff.smokesPerPerson || 0) * (evt.participants || 1);
        }
    }

    // Options × quantity × participants
    if (evt.selectedOptions && evt.selectedOptions.length > 0) {
        evt.selectedOptions.forEach(optId => {
            const opt = tariffs.find(t => t.id === optId);
            if (opt) {
                const qty = evt.optionQuantities?.[optId] || 1;
                const balls = (opt.ballsPerPerson || 0) * qty * (evt.participants || 1);
                if (isKidball) totalKidsBalls += balls; else totalBalls += balls;
                totalGrenades += (opt.grenadesPerPerson || 0) * qty * (evt.participants || 1);
                totalSmokes += (opt.smokesPerPerson || 0) * qty * (evt.participants || 1);
            }
        });
    }

    // Deduct from stock
    if (totalBalls > 0 || totalKidsBalls > 0 || totalGrenades > 0 || totalSmokes > 0) {
        const stock = DB.get('stock', {});
        stock.balls = Math.max(0, (stock.balls || 0) - totalBalls);
        stock.kidsBalls = Math.max(0, (stock.kidsBalls || 0) - totalKidsBalls);
        stock.grenades = Math.max(0, (stock.grenades || 0) - totalGrenades);
        stock.smokes = Math.max(0, (stock.smokes || 0) - totalSmokes);
        DB.set('stock', stock);
        events[idx].consumablesUsed = { balls: totalBalls, kidsBalls: totalKidsBalls, grenades: totalGrenades, smokes: totalSmokes };
    }

    DB.set('events', events);

    // === REDEEM CERTIFICATE IF USED ===
    redeemCertificateForEvent(events[idx]);

    // === AUTO-ADD CLIENT TO CLIENTS DATABASE ===
    const evtCompleted = events[idx];
    if (evtCompleted.clientName) {
        const clients = DB.get('clients', []);
        const nameParts = evtCompleted.clientName.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        const phone = evtCompleted.clientPhone || '';

        // Find existing client by phone or exact name
        let existingClient = null;
        if (phone) {
            existingClient = clients.find(c => c.phone && c.phone === phone);
        }
        if (!existingClient) {
            existingClient = clients.find(c =>
                c.firstName.toLowerCase() === firstName.toLowerCase() &&
                (c.lastName || '').toLowerCase() === lastName.toLowerCase()
            );
        }

        const visit = {
            date: evtCompleted.date,
            game: evtCompleted.title || 'Мероприятие',
            amount: evtCompleted.price || 0
        };

        if (existingClient) {
            const ci = clients.indexOf(existingClient);
            if (!clients[ci].visits) clients[ci].visits = [];
            clients[ci].visits.unshift(visit);
            clients[ci].totalSpent = (clients[ci].totalSpent || 0) + (visit.amount || 0);
            // Award loyalty groldiks
            const loyaltyPct = DB.get('loyaltyPercent', 5);
            clients[ci].groldiks = (clients[ci].groldiks || 0) + Math.round((visit.amount || 0) * loyaltyPct / 100);
            if (phone && !clients[ci].phone) clients[ci].phone = phone;
        } else {
            const loyaltyPct = DB.get('loyaltyPercent', 5);
            clients.push({
                id: Date.now(),
                firstName,
                lastName,
                phone,
                email: '',
                dob: '',
                notes: '',
                groldiks: Math.round((visit.amount || 0) * loyaltyPct / 100),
                totalSpent: visit.amount || 0,
                visits: [visit]
            });
        }
        DB.set('clients', clients);
    }

    closeModal('modal-payment');
    currentPaymentEventId = null;

    // Track receipt status from Sigma 8Ф
    const receiptPrinted = document.getElementById('payment-receipt-printed')?.checked || false;
    events[idx].receiptPrinted = receiptPrinted;
    DB.set('events', events);

    // Build toast message
    let toastMsg = receiptPrinted ? 'Заказ выполнен! Чек пробит ✓' : 'Заказ выполнен! Не забудьте пробить чек на кассе';
    if (totalBalls > 0 || totalGrenades > 0) {
        const parts = [];
        if (totalBalls > 0) parts.push(`${totalBalls} шаров`);
        if (totalGrenades > 0) parts.push(`${totalGrenades} гранат`);
        toastMsg += ` | Списано: ${parts.join(', ')}`;
    }
    showToast(toastMsg);

    // Reload current page
    if (document.getElementById('emp-page-events')?.classList.contains('active')) {
        loadEmployeeEvents();
    }
}

// ===== EMPLOYEE SALARY PAGE =====
function loadEmployeeSalary() {
    if (!currentUser) return;
    const period = empSalaryPeriod;
    const earnData = getEmployeeEarningsForPeriod(currentUser.id, period);
    const payData = getEmployeePaymentsForPeriod(currentUser.id, period);
    const balance = earnData.totalEarned - payData.totalPaid;

    document.getElementById('emp-sal-earned').textContent = formatMoney(earnData.totalEarned);
    document.getElementById('emp-sal-paid').textContent = formatMoney(payData.totalPaid);
    const debtEl = document.getElementById('emp-sal-debt');
    debtEl.textContent = formatMoney(Math.abs(balance));
    debtEl.className = 'salary-card-value ' + (balance > 0 ? 'red' : balance < 0 ? 'green' : '');
    const debtLabel = debtEl.closest('.salary-card')?.querySelector('.salary-card-label');
    if (debtLabel) debtLabel.textContent = balance >= 0 ? 'Задолженность' : 'Переплата';

    // Shifts table
    const tbody = document.getElementById('emp-salary-table-body');
    if (earnData.shifts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Нет завершённых смен</td></tr>';
    } else {
        tbody.innerHTML = earnData.shifts.sort((a,b) => b.date.localeCompare(a.date)).map(s => {
            const roleName = getRoleName(s.shiftRole) || s.shiftRole;
            const [sh, sm] = (s.startTime || '0:0').split(':').map(Number);
            const [eh, em] = (s.endTime || '0:0').split(':').map(Number);
            const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
            return `<tr>
                <td>${s.date}</td>
                <td>${roleName}</td>
                <td>${hours.toFixed(1)}ч</td>
                <td>${formatMoney(s.earnings?.base || 0)}</td>
                <td style="color:var(--green)">${formatMoney(s.earnings?.bonus || 0)}</td>
                <td style="color:var(--accent);font-weight:700">${formatMoney(s.earnings?.total || 0)}</td>
            </tr>`;
        }).join('');
    }

    // Payments table
    const payTbody = document.getElementById('emp-payments-table-body');
    if (payTbody) {
        if (payData.payments.length === 0) {
            payTbody.innerHTML = '<tr><td colspan="5" class="empty-state">Нет выплат</td></tr>';
        } else {
            payTbody.innerHTML = payData.payments.sort((a,b) => b.date.localeCompare(a.date)).map(p => `<tr>
                <td>${p.date}</td>
                <td>${p.time}</td>
                <td style="color:var(--green);font-weight:700">${formatMoney(p.amount)}</td>
                <td>${getPaymentMethodName(p.method)}</td>
                <td>${p.note || '—'}</td>
            </tr>`).join('');
        }
    }
}

// ===== EMPLOYEE BOOKING (Calendar) =====
function renderEmpCalendar() {
    const year = empCalendarDate.getFullYear();
    const month = empCalendarDate.getMonth();
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    document.getElementById('emp-cal-month-title').textContent = monthNames[month] + ' ' + year;

    const firstDay = new Date(year, month, 1);
    let startDay = firstDay.getDay();
    if (startDay === 0) startDay = 7;
    startDay--;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const events = DB.get('events', []);
    const todayStr = todayLocal();

    let cells = '';
    for (let i = startDay - 1; i >= 0; i--) {
        cells += `<div class="cal-day other-month">${daysInPrevMonth - i}</div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = dateStr === todayStr;
        const hasEvents = events.some(e => e.date === dateStr);
        const isSelected = empSelectedCalDay === dateStr;
        let classes = 'cal-day';
        if (isToday) classes += ' today';
        if (hasEvents) classes += ' has-events';
        if (isSelected) classes += ' selected';
        cells += `<div class="${classes}" data-date="${dateStr}" onclick="selectEmpCalDay('${dateStr}')">${d}</div>`;
    }
    const totalCells = startDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
        cells += `<div class="cal-day other-month">${i}</div>`;
    }

    document.getElementById('emp-calendar-cells').innerHTML = cells;
    if (!empSelectedCalDay) selectEmpCalDay(todayStr);
    else selectEmpCalDay(empSelectedCalDay);
}

function selectEmpCalDay(dateStr) {
    empSelectedCalDay = dateStr;
    document.querySelectorAll('#emp-calendar-cells .cal-day').forEach(d => d.classList.remove('selected'));
    const el = document.querySelector(`#emp-calendar-cells .cal-day[data-date="${dateStr}"]`);
    if (el) el.classList.add('selected');

    const events = DB.get('events', []).filter(e => e.date === dateStr)
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const dateFormatted = new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('emp-day-events-title').textContent = 'Мероприятия — ' + dateFormatted;

    const list = document.getElementById('emp-day-events-list');
    if (events.length === 0) {
        list.innerHTML = '<p class="empty-state">Нет мероприятий в этот день</p>';
    } else {
        list.innerHTML = events.map(e => `
            <div class="event-card" onclick="openEventModal('${e.id}')">
                <div class="event-time">${e.time}</div>
                <div class="event-info">
                    <strong>${e.title}</strong>${e.clientName ? ` <span style="font-weight:400;color:var(--text-secondary);">— ${e.clientName}</span>` : ''}
                    <span>${formatParticipants(e)} · ${formatDuration(e.duration)}${getStaffNames(e) ? ' · ' + getStaffNames(e) : ''}</span>
                </div>
                ${getSourceBadge(e)}
                <span class="event-type-badge">${getEventTypeName(e.type)}</span>
            </div>
        `).join('');
    }
}

// ===== TARIFFS PAGE =====
let empTariffSubcategory = null;

function getServiceSubcategories() {
    const tariffs = DB.get('tariffs', []).filter(t => t.category === 'services');
    const cats = [];
    tariffs.forEach(t => {
        if (t.sheetCategory && !cats.includes(t.sheetCategory)) cats.push(t.sheetCategory);
    });
    return cats;
}

function renderSubcategoryButtons(cats, onClickFn) {
    const icons = {
        'Пейнтбол': 'sports_mma', 'Кидбол': 'child_care', 'Лазертаг': 'bolt',
        'Квадроциклы': 'two_wheeler', 'Водная прогулка на Сап-бордах': 'surfing',
        'Гонка с препятствиями': 'directions_run', 'Тир пейнтбольный': 'gps_fixed'
    };
    return cats.map(cat => `
        <button class="tariff-subcategory-btn" data-subcat="${cat}">
            <span class="material-icons-round">${icons[cat] || 'category'}</span>
            <span>${cat}</span>
        </button>
    `).join('');
}

function loadTariffs(category = 'services', subcategory = null) {
    const grid = document.getElementById('emp-tariffs-grid');

    if (category === 'services' && !subcategory) {
        empTariffSubcategory = null;
        const cats = getServiceSubcategories();
        if (cats.length === 0) {
            grid.innerHTML = '<p class="empty-state">Нет тарифов</p>';
            return;
        }
        grid.innerHTML = '<div class="tariff-subcategories">' + renderSubcategoryButtons(cats) + '</div>';
        grid.querySelectorAll('.tariff-subcategory-btn').forEach(btn => {
            btn.addEventListener('click', () => loadTariffs('services', btn.dataset.subcat));
        });
        return;
    }

    empTariffSubcategory = subcategory;
    const tariffs = DB.get('tariffs', []).filter(t => {
        if (t.id === 23) return false; // removed option
        if (category === 'services' && subcategory) return t.category === 'services' && t.sheetCategory === subcategory;
        return t.category === category;
    });

    if (tariffs.length === 0) {
        grid.innerHTML = '<p class="empty-state">Нет тарифов в этой категории</p>';
        return;
    }

    const backBtn = subcategory ? `<button class="tariff-back-btn" id="emp-tariff-back"><span class="material-icons-round">arrow_back</span> ${subcategory}</button>` : '';

    grid.innerHTML = backBtn + tariffs.map(t => `
        <div class="tariff-card">
            <div class="tariff-card-header">
                <h3>${t.name}</h3>
                <div class="tariff-price">${formatMoney(t.price)} <span class="tariff-unit">/ ${t.unit}</span></div>
            </div>
            <p class="tariff-description">${t.description || '—'}</p>
            <div class="tariff-meta">
                ${t.duration ? `<span><span class="material-icons-round">timer</span> ${t.duration} мин</span>` : ''}
                ${t.minPeople ? `<span><span class="material-icons-round">group</span> от ${t.minPeople} чел.</span>` : ''}
                ${t.ballsPerPerson ? `<span class="consumable-badge balls"><span class="material-icons-round">radio_button_unchecked</span> ${t.ballsPerPerson} шаров</span>` : ''}
                ${t.grenadesPerPerson ? `<span class="consumable-badge grenades"><span class="material-icons-round">brightness_7</span> ${t.grenadesPerPerson} гранат</span>` : ''}
                ${t.smokesPerPerson ? `<span class="consumable-badge grenades"><span class="material-icons-round">cloud</span> ${t.smokesPerPerson} дым</span>` : ''}
            </div>
        </div>
    `).join('');

    const back = document.getElementById('emp-tariff-back');
    if (back) back.addEventListener('click', () => loadTariffs('services'));
}

// ===== DASHBOARD DRAG & DROP =====
function initDashboardDragDrop() {
    const grid = document.getElementById('emp-dash-grid');
    if (!grid) return;

    let draggedCard = null;

    grid.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.emp-dash-draggable');
        if (!card) return;
        draggedCard = card;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    grid.addEventListener('dragend', (e) => {
        const card = e.target.closest('.emp-dash-draggable');
        if (card) card.classList.remove('dragging');
        grid.querySelectorAll('.emp-dash-draggable').forEach(c => c.classList.remove('drag-over'));
        draggedCard = null;
    });

    grid.addEventListener('dragover', (e) => {
        e.preventDefault();
        const card = e.target.closest('.emp-dash-draggable');
        if (card && card !== draggedCard) {
            grid.querySelectorAll('.emp-dash-draggable').forEach(c => c.classList.remove('drag-over'));
            card.classList.add('drag-over');
        }
    });

    grid.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetCard = e.target.closest('.emp-dash-draggable');
        if (targetCard && draggedCard && targetCard !== draggedCard) {
            const cards = [...grid.children];
            const draggedIdx = cards.indexOf(draggedCard);
            const targetIdx = cards.indexOf(targetCard);
            if (draggedIdx < targetIdx) {
                grid.insertBefore(draggedCard, targetCard.nextSibling);
            } else {
                grid.insertBefore(draggedCard, targetCard);
            }
            // Save order
            const order = [...grid.querySelectorAll('.emp-dash-draggable')].map(c => c.dataset.cardId);
            DB.set('empDashOrder', order);
        }
        grid.querySelectorAll('.emp-dash-draggable').forEach(c => c.classList.remove('drag-over'));
    });

    // Restore order
    const savedOrder = DB.get('empDashOrder', null);
    if (savedOrder) {
        savedOrder.forEach(cardId => {
            const card = grid.querySelector(`[data-card-id="${cardId}"]`);
            if (card) grid.appendChild(card);
        });
    }
}

// ===== DIRECTOR DASHBOARD DRAG & DROP =====
function initDirectorDashDragDrop() {
    const grid = document.getElementById('dashboard-grid');
    if (!grid) return;
    let draggedCard = null;
    let editMode = false;

    const editBtn = document.getElementById('btn-edit-dashboard');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            editMode = !editMode;
            grid.classList.toggle('dash-edit-mode', editMode);
            editBtn.classList.toggle('active', editMode);
            // Toggle draggable on cards
            grid.querySelectorAll('.dash-sortable').forEach(c => {
                c.draggable = editMode;
            });
            if (editMode) {
                showToast('Режим редактирования: перетаскивайте карточки');
            } else {
                showToast('Порядок сохранён');
            }
        });
    }

    grid.addEventListener('dragstart', (e) => {
        if (!editMode) return;
        const card = e.target.closest('.dash-sortable');
        if (!card) return;
        draggedCard = card;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    grid.addEventListener('dragend', (e) => {
        const card = e.target.closest('.dash-sortable');
        if (card) card.classList.remove('dragging');
        grid.querySelectorAll('.dash-sortable').forEach(c => c.classList.remove('drag-over'));
        draggedCard = null;
    });

    grid.addEventListener('dragover', (e) => {
        if (!editMode) return;
        e.preventDefault();
        const card = e.target.closest('.dash-sortable');
        if (card && card !== draggedCard) {
            grid.querySelectorAll('.dash-sortable').forEach(c => c.classList.remove('drag-over'));
            card.classList.add('drag-over');
        }
    });

    grid.addEventListener('drop', (e) => {
        if (!editMode) return;
        e.preventDefault();
        const targetCard = e.target.closest('.dash-sortable');
        if (targetCard && draggedCard && targetCard !== draggedCard) {
            const cards = [...grid.querySelectorAll('.dash-sortable')];
            const draggedIdx = cards.indexOf(draggedCard);
            const targetIdx = cards.indexOf(targetCard);
            if (draggedIdx < targetIdx) {
                grid.insertBefore(draggedCard, targetCard.nextSibling);
            } else {
                grid.insertBefore(draggedCard, targetCard);
            }
            // Save order to Firestore
            const order = [...grid.querySelectorAll('.dash-sortable')].map(c => c.dataset.cardId);
            DB.set('directorDashOrder', order);
        }
        grid.querySelectorAll('.dash-sortable').forEach(c => c.classList.remove('drag-over'));
    });

    // Touch support for mobile drag
    let touchCard = null, touchClone = null, touchStartY = 0;

    grid.addEventListener('touchstart', (e) => {
        if (!editMode) return;
        const card = e.target.closest('.dash-sortable');
        if (!card) return;
        touchCard = card;
        touchStartY = e.touches[0].clientY;
        card.classList.add('dragging');
    }, { passive: true });

    grid.addEventListener('touchmove', (e) => {
        if (!editMode || !touchCard) return;
        e.preventDefault();
        const touch = e.touches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const target = el ? el.closest('.dash-sortable') : null;
        grid.querySelectorAll('.dash-sortable').forEach(c => c.classList.remove('drag-over'));
        if (target && target !== touchCard) {
            target.classList.add('drag-over');
        }
    }, { passive: false });

    grid.addEventListener('touchend', (e) => {
        if (!editMode || !touchCard) return;
        const touch = e.changedTouches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const target = el ? el.closest('.dash-sortable') : null;
        if (target && target !== touchCard) {
            const cards = [...grid.querySelectorAll('.dash-sortable')];
            const draggedIdx = cards.indexOf(touchCard);
            const targetIdx = cards.indexOf(target);
            if (draggedIdx < targetIdx) {
                grid.insertBefore(touchCard, target.nextSibling);
            } else {
                grid.insertBefore(touchCard, target);
            }
            const order = [...grid.querySelectorAll('.dash-sortable')].map(c => c.dataset.cardId);
            DB.set('directorDashOrder', order);
        }
        grid.querySelectorAll('.dash-sortable').forEach(c => c.classList.remove('drag-over', 'dragging'));
        touchCard = null;
    });

    // Restore saved order
    const savedOrder = DB.get('directorDashOrder', null);
    if (savedOrder) {
        savedOrder.forEach(cardId => {
            const card = grid.querySelector(`.dash-sortable[data-card-id="${cardId}"]`);
            if (card) grid.appendChild(card);
        });
    }
}

// ===== DIRECTOR NAVIGATION & LOGOUT =====
document.getElementById('director-logout').addEventListener('click', logout);

function initNavigation() {
    document.querySelectorAll('#app-screen .nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            if (page) navigateTo(page);
        });
    });

    // Mobile bottom nav (director)
    document.querySelectorAll('#mobile-bottom-nav .mobile-nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            if (page) navigateTo(page);
        });
    });

    document.getElementById('btn-hamburger').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    document.querySelector('#app-screen .main-content').addEventListener('click', (e) => {
        if (!e.target.closest('#btn-hamburger')) {
            document.getElementById('sidebar').classList.remove('open');
        }
    });
}

function navigateTo(page) {
    // Sync sidebar nav
    document.querySelectorAll('#app-screen .nav-item').forEach(n => n.classList.remove('active'));
    const navEl = document.querySelector(`#app-screen .nav-item[data-page="${page}"]`);
    if (navEl) navEl.classList.add('active');
    // Sync mobile bottom nav
    document.querySelectorAll('#mobile-bottom-nav .mobile-nav-item').forEach(n => n.classList.remove('active'));
    const mobileEl = document.querySelector(`#mobile-bottom-nav .mobile-nav-item[data-page="${page}"]`);
    if (mobileEl) mobileEl.classList.add('active');
    // Close sidebar on mobile after navigation
    document.getElementById('sidebar')?.classList.remove('open');

    document.querySelectorAll('#app-screen .page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');

    const titles = {
        dashboard: 'Главная',
        employees: 'Сотрудники',
        schedule: 'Расписание',
        finances: 'Финансы',
        documents: 'Документы',
        clients: 'Клиенты',
        tariffs: 'Тарифы и услуги',
        settings: 'Настройки'
    };
    document.getElementById('page-title').textContent = titles[page] || page;

    if (page === 'dashboard') loadDashboard();
    if (page === 'employees') loadEmployees();
    if (page === 'schedule') renderCalendar();
    if (page === 'finances') loadFinances();
    if (page === 'certificates') loadCertificates();
    if (page === 'documents') loadDocuments();
    if (page === 'clients') loadClients();
    if (page === 'tariffs') loadDirectorTariffs();
    if (page === 'settings') { loadSettingsData(); loadFirebaseAccounts(); }

    document.getElementById('sidebar').classList.remove('open');
}

// ===== DASHBOARD =====
let revenuePeriodType = 'today';
let revenuePeriodValue = null;

function toggleRevenuePeriodType(type) {
    revenuePeriodType = type;
    revenuePeriodValue = null;
    document.querySelectorAll('.dashboard-period [data-period]').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.dashboard-period [data-period="${type}"]`);
    if (btn) btn.classList.add('active');

    const sel = document.getElementById('revenue-period-selector');
    const now = moscowNow();
    const mNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    let opts = '';

    if (type === 'today') {
        sel.style.display = 'none';
        loadDashboard();
        return;
    } else if (type === 'week') {
        // Last 12 weeks
        for (let i = 0; i < 12; i++) {
            const wStart = new Date(now);
            const dow = wStart.getDay() || 7;
            wStart.setDate(wStart.getDate() - dow + 1 - i*7);
            const wEnd = new Date(wStart); wEnd.setDate(wStart.getDate() + 6);
            const val = `${wStart.getFullYear()}-${String(wStart.getMonth()+1).padStart(2,'0')}-${String(wStart.getDate()).padStart(2,'0')}`;
            const label = `${wStart.getDate()}.${String(wStart.getMonth()+1).padStart(2,'0')} — ${wEnd.getDate()}.${String(wEnd.getMonth()+1).padStart(2,'0')}.${wEnd.getFullYear()}`;
            opts += `<option value="${val}"${i===0?' selected':''}>${label}</option>`;
        }
    } else if (type === 'month') {
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            const label = mNames[d.getMonth()] + ' ' + d.getFullYear();
            opts += `<option value="${val}"${i===0?' selected':''}>${label}</option>`;
        }
    } else if (type === 'year') {
        for (let y = now.getFullYear(); y >= now.getFullYear()-3; y--) {
            opts += `<option value="${y}"${y===now.getFullYear()?' selected':''}>${y}</option>`;
        }
    }
    sel.innerHTML = opts;
    sel.style.display = '';
    loadDashboard();
}

function onRevenuePeriodSelect(val) {
    revenuePeriodValue = val;
    loadDashboard();
}

function loadDashboard() {
    loadRevenue();
    loadEventsToday();
    loadOnShift();
    loadServiceRating();
    loadEmployeeRating();
    loadStock();
}

function calculateRevenue(period) {
    const events = DB.get('events', []);
    const now = moscowNow();
    const todayStr = todayLocal();
    let startDate, endDate, prevStartDate, prevEndDate;

    if (period === 'today') {
        startDate = todayStr;
        endDate = todayStr;
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
        prevStartDate = yesterdayStr;
        prevEndDate = yesterdayStr;
    } else if (period === 'week') {
        let weekStart;
        if (revenuePeriodValue) {
            weekStart = new Date(revenuePeriodValue + 'T00:00:00');
        } else {
            weekStart = new Date(now);
            const dayOfWeek = weekStart.getDay() || 7;
            weekStart.setDate(weekStart.getDate() - dayOfWeek + 1);
        }
        startDate = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
        const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
        endDate = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth()+1).padStart(2,'0')}-${String(weekEnd.getDate()).padStart(2,'0')}`;
        const prevWeekEnd = new Date(weekStart);
        prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
        const prevWeekStart = new Date(prevWeekEnd);
        prevWeekStart.setDate(prevWeekStart.getDate() - 6);
        prevStartDate = `${prevWeekStart.getFullYear()}-${String(prevWeekStart.getMonth() + 1).padStart(2, '0')}-${String(prevWeekStart.getDate()).padStart(2, '0')}`;
        prevEndDate = `${prevWeekEnd.getFullYear()}-${String(prevWeekEnd.getMonth() + 1).padStart(2, '0')}-${String(prevWeekEnd.getDate()).padStart(2, '0')}`;
    } else if (period === 'month') {
        let selY, selM;
        if (revenuePeriodValue) {
            [selY, selM] = revenuePeriodValue.split('-').map(Number);
        } else {
            selY = now.getFullYear(); selM = now.getMonth() + 1;
        }
        startDate = `${selY}-${String(selM).padStart(2,'0')}-01`;
        endDate = `${selY}-${String(selM).padStart(2,'0')}-${String(new Date(selY, selM, 0).getDate()).padStart(2,'0')}`;
        const prevMonth = new Date(selY, selM - 2, 1);
        const prevMonthEnd = new Date(selY, selM - 1, 0);
        prevStartDate = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;
        prevEndDate = `${prevMonthEnd.getFullYear()}-${String(prevMonthEnd.getMonth() + 1).padStart(2, '0')}-${String(prevMonthEnd.getDate()).padStart(2, '0')}`;
    } else { // year
        const selYear = revenuePeriodValue ? parseInt(revenuePeriodValue) : now.getFullYear();
        startDate = `${selYear}-01-01`;
        endDate = `${selYear}-12-31`;
        prevStartDate = `${selYear - 1}-01-01`;
        prevEndDate = `${selYear - 1}-12-31`;
    }

    const currentRevenue = events
        .filter(e => e.date >= startDate && e.date <= endDate && e.status === 'completed' && (e.price || 0) > 0)
        .reduce((sum, e) => sum + (e.price || 0), 0);

    const prevRevenue = events
        .filter(e => e.date >= prevStartDate && e.date <= prevEndDate && e.status === 'completed' && (e.price || 0) > 0)
        .reduce((sum, e) => sum + (e.price || 0), 0);

    const change = prevRevenue > 0 ? Math.round((currentRevenue / prevRevenue - 1) * 100) : (currentRevenue > 0 ? 100 : 0);

    return { currentRevenue, prevRevenue, change };
}

function getMonthlyRevenueData(year) {
    const events = DB.get('events', []);
    const monthly = new Array(12).fill(0);
    events.forEach(e => {
        if (!e.date || !e.price || e.status !== 'completed') return;
        const parts = e.date.split('-');
        if (parseInt(parts[0]) === year) {
            const monthIdx = parseInt(parts[1]) - 1;
            if (monthIdx >= 0 && monthIdx < 12) {
                monthly[monthIdx] += e.price || 0;
            }
        }
    });
    return monthly;
}

function loadRevenue() {
    const period = revenuePeriodType || 'today';

    const { currentRevenue, change } = calculateRevenue(period);
    document.getElementById('revenue-current').textContent = formatMoney(currentRevenue);

    const changeEl = document.getElementById('revenue-change');
    changeEl.textContent = (change >= 0 ? '+' : '') + change + '%';
    changeEl.className = 'revenue-change' + (change < 0 ? ' negative' : '');

    // Update compare label
    const compareLabels = { today: 'vs вчера', week: 'vs прошлая неделя', month: 'vs прошлый месяц', year: 'vs прошлый год' };
    const compareLabelEl = changeEl.nextElementSibling;
    if (compareLabelEl) compareLabelEl.textContent = compareLabels[period] || 'vs прошлый период';

    const ctx = document.getElementById('revenueChart');
    if (revenueChart) revenueChart.destroy();

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const events = DB.get('events', []).filter(e => e.status === 'completed' && e.price > 0);
    const now = moscowNow();
    let labels = [], currentData = [], prevData = [], currentLabel = '', prevLabel = '';

    if (period === 'today') {
        // Hourly: 8:00–23:00 today vs yesterday
        const todayStr = todayLocal();
        const yest = new Date(now); yest.setDate(yest.getDate() - 1);
        const yestStr = `${yest.getFullYear()}-${String(yest.getMonth()+1).padStart(2,'0')}-${String(yest.getDate()).padStart(2,'0')}`;
        for (let h = 8; h <= 23; h++) { labels.push(h + ':00'); currentData.push(0); prevData.push(0); }
        events.forEach(e => {
            const hour = e.time ? parseInt(e.time.split(':')[0]) : -1;
            if (hour >= 8 && hour <= 23) {
                if (e.date === todayStr) currentData[hour - 8] += e.price;
                else if (e.date === yestStr) prevData[hour - 8] += e.price;
            }
        });
        currentLabel = 'Сегодня'; prevLabel = 'Вчера';
    } else if (period === 'week') {
        // Daily: Mon–Sun selected week vs prev week
        const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        let monday;
        if (revenuePeriodValue) {
            monday = new Date(revenuePeriodValue + 'T00:00:00');
        } else {
            monday = new Date(now);
            const dow = monday.getDay() || 7;
            monday.setDate(monday.getDate() - dow + 1);
        }
        const prevMonday = new Date(monday); prevMonday.setDate(monday.getDate() - 7);
        for (let i = 0; i < 7; i++) {
            labels.push(dayNames[i]); currentData.push(0); prevData.push(0);
            const d1 = new Date(monday); d1.setDate(monday.getDate() + i);
            const d1s = `${d1.getFullYear()}-${String(d1.getMonth()+1).padStart(2,'0')}-${String(d1.getDate()).padStart(2,'0')}`;
            const d2 = new Date(prevMonday); d2.setDate(prevMonday.getDate() + i);
            const d2s = `${d2.getFullYear()}-${String(d2.getMonth()+1).padStart(2,'0')}-${String(d2.getDate()).padStart(2,'0')}`;
            events.forEach(e => {
                if (e.date === d1s) currentData[i] += e.price;
                if (e.date === d2s) prevData[i] += e.price;
            });
        }
        currentLabel = 'Эта неделя'; prevLabel = 'Прошлая неделя';
    } else if (period === 'month') {
        let selY, selM;
        if (revenuePeriodValue) {
            [selY, selM] = revenuePeriodValue.split('-').map(Number);
        } else {
            selY = now.getFullYear(); selM = now.getMonth() + 1;
        }
        const daysInMonth = new Date(selY, selM, 0).getDate();
        const prevM = new Date(selY, selM - 2, 1);
        const daysInPrevMonth = new Date(prevM.getFullYear(), prevM.getMonth() + 1, 0).getDate();
        const maxDays = Math.max(daysInMonth, daysInPrevMonth);
        for (let d = 1; d <= maxDays; d++) { labels.push(String(d)); currentData.push(0); prevData.push(0); }
        events.forEach(e => {
            const parts = e.date.split('-');
            const y = parseInt(parts[0]), m = parseInt(parts[1]) - 1, day = parseInt(parts[2]);
            if (y === selY && m === selM - 1 && day <= maxDays) currentData[day - 1] += e.price;
            if (y === prevM.getFullYear() && m === prevM.getMonth() && day <= maxDays) prevData[day - 1] += e.price;
        });
        const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
        currentLabel = monthNames[selM - 1]; prevLabel = monthNames[prevM.getMonth()];
    } else {
        // Year: monthly
        const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
        labels = months;
        const selYear = revenuePeriodValue ? parseInt(revenuePeriodValue) : now.getFullYear();
        currentData = getMonthlyRevenueData(selYear);
        prevData = getMonthlyRevenueData(selYear - 1);
        currentLabel = String(selYear); prevLabel = String(selYear - 1);
    }

    revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: currentLabel, data: currentData,
                    borderColor: accent, backgroundColor: accent + '20',
                    fill: true, tension: 0.4, pointRadius: period === 'month' ? 2 : 4, pointBackgroundColor: accent,
                },
                {
                    label: prevLabel, data: prevData,
                    borderColor: '#5A5A6E', backgroundColor: 'transparent',
                    borderDash: [5, 5], tension: 0.4, pointRadius: 0,
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#8E8EA0', font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } } },
            scales: {
                x: { ticks: { color: '#5A5A6E', maxTicksLimit: period === 'month' ? 15 : undefined }, grid: { color: '#1A1A24' } },
                y: { ticks: { color: '#5A5A6E', callback: v => v >= 1000 ? (v / 1000) + 'K' : v }, grid: { color: '#1A1A24' } }
            }
        }
    });
}

function loadEventsToday() {
    const todayStr = todayLocal();
    const events = DB.get('events', []).filter(e => e.date === todayStr);
    document.getElementById('events-today').textContent = events.length;

    const list = document.getElementById('events-today-list');
    list.innerHTML = events.length === 0
        ? '<p class="empty-state">Нет мероприятий</p>'
        : events.map(e => {
            const isCompleted = e.status === 'completed';
            return `
            <div class="list-item" style="cursor:pointer;" onclick="navigateTo('schedule')">
                <span class="material-icons-round">event</span>
                <div class="list-item-info" style="flex:1;">
                    <strong>${e.title}</strong>${e.clientName ? ` <span style="font-weight:400;color:var(--text-secondary);">— ${e.clientName}</span>` : ''}
                    <span>${e.time} · ${formatParticipants(e)}${e.price ? ' · ' + formatMoney(e.price) : ''}</span>
                </div>
                ${!isCompleted ? `<button class="btn-primary btn-sm" onclick="event.stopPropagation();openEventModal('${e.id}', true)" style="font-size:11px;padding:4px 8px;">Выполнить</button>` : '<span class="list-item-badge" style="background:#4CAF50;color:#fff;">Выполнен</span>'}
                <span class="list-item-badge badge-blue">${getEventTypeName(e.type)}</span>
            </div>`;
        }).join('');
}

function loadOnShift() {
    const todayStr = todayLocal();
    const shifts = DB.get('shifts', []).filter(s => s.date === todayStr);
    const list = document.getElementById('on-shift-list');

    if (shifts.length === 0) {
        list.innerHTML = '<p class="empty-state">Никто ещё не вышел на смену</p>';
        return;
    }

    list.innerHTML = shifts.map(s => {
        const roleName = getRoleName(s.shiftRole) || s.shiftRole;
        const badge = s.endTime
            ? `<span class="list-item-badge badge-orange">${s.startTime} – ${s.endTime}</span>`
            : `<span class="list-item-badge badge-green">${s.startTime} – …</span>`;
        return `
            <div class="list-item">
                <span class="material-icons-round">person</span>
                <div class="list-item-info">
                    <strong>${s.employeeName}</strong>
                    <span>${roleName}</span>
                </div>
                ${badge}
            </div>
        `;
    }).join('');
}

let svcRatingPeriod = 'month';

function loadServiceRating() {
    const ctx = document.getElementById('servicesChart');
    if (servicesChart) servicesChart.destroy();

    const now = moscowNow();
    let startDate;
    if (svcRatingPeriod === 'year') {
        startDate = `${now.getFullYear()}-01-01`;
    } else {
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }

    const events = DB.get('events', []).filter(e => e.status === 'completed' && e.date >= startDate);
    const typeCounts = {};
    events.forEach(e => {
        // Normalize event type to standard service name
        const typeName = normalizeServiceName(getEventTypeName(e.type)) || normalizeServiceName(e.title) || getEventTypeName(e.type) || 'Другое';
        if (typeName && typeName !== 'Другое') typeCounts[typeName] = (typeCounts[typeName] || 0) + 1;
    });

    // Also count from client visit history (historical data)
    const clients = DB.get('clients', []);
    clients.forEach(c => {
        (c.visits || []).forEach(v => {
            if (v.date && v.date >= startDate && v.game) {
                const normalized = normalizeServiceName(v.game);
                if (normalized) typeCounts[normalized] = (typeCounts[normalized] || 0) + 1;
            }
        });
    });

    const labels = Object.keys(typeCounts);
    const data = Object.values(typeCounts);
    const colors = ['#FFD600', '#448AFF', '#00E676', '#FF9100', '#E040FB', '#FF5252', '#40C4FF', '#69F0AE'];

    if (labels.length === 0) {
        labels.push('Нет данных');
        data.push(1);
    }

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    colors[0] = accent;

    servicesChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 0,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: { legend: { position: 'right', labels: { color: '#8E8EA0', font: { size: 11 }, padding: 12, usePointStyle: true, pointStyle: 'circle' } } }
        }
    });
}

let empRatingPeriod = 'month';

function loadEmployeeRating() {
    const employees = DB.get('employees', []).filter(e => e.role !== 'director');
    const list = document.getElementById('employee-rating-list');
    const period = empRatingPeriod;

    const now = moscowNow();
    let startDate;
    if (period === 'year') {
        startDate = `${now.getFullYear()}-01-01`;
    } else {
        startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }

    const allEvents = DB.get('events', []).filter(e =>
        e.status === 'completed' && e.instructorRating && e.date >= startDate
    );

    const ratings = employees.map(e => {
        // Find completed events where this employee was an instructor
        const empEvents = allEvents.filter(ev =>
            (ev.instructors || []).includes(e.id) || (ev.assignedInstructors || []).includes(e.id)
        );
        const totalRating = empEvents.reduce((sum, ev) => sum + (ev.instructorRating || 0), 0);
        const avgRating = empEvents.length > 0 ? (totalRating / empEvents.length) : 0;

        return {
            name: e.firstName + ' ' + e.lastName,
            eventsCount: empEvents.length,
            avgRating: avgRating
        };
    }).filter(r => r.eventsCount > 0).sort((a, b) => b.avgRating - a.avgRating);

    const renderStars = (rating) => {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            stars += `<span style="color:${i <= Math.round(rating) ? 'var(--accent)' : 'var(--border)'};font-size:14px;">&#9733;</span>`;
        }
        return stars;
    };

    list.innerHTML = ratings.length === 0
        ? '<p class="empty-state">Нет оценок за период</p>'
        : ratings.map((r, i) => `
        <div class="rating-item">
            <div class="rating-pos">${i + 1}</div>
            <div class="rating-name">${r.name}</div>
            <div class="rating-score">${renderStars(r.avgRating)} ${r.avgRating.toFixed(1)} · ${r.eventsCount} мероприятий</div>
        </div>
    `).join('');
}

function loadStock() {
    const stock = DB.get('stock', { balls: 0, ballsCritical: 60000, kidsBalls: 0, kidsBallsCritical: 20000, grenades: 0, grenadesCritical: 100, smokes: 0, smokesCritical: 50 });

    const renderStockItem = (id, value, critical) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = (value || 0).toLocaleString('ru-RU');
        const pct = Math.min(100, ((value || 0) / (critical || 1)) * 100);
        const bar = document.getElementById(id + '-bar');
        if (bar) { bar.style.width = pct + '%'; bar.className = 'stock-bar-fill' + ((value || 0) < critical ? ' warning' : ''); }
        const warn = document.getElementById(id + '-warning');
        if (warn) warn.textContent = (value || 0) < critical ? `Ниже критического уровня (${critical.toLocaleString('ru-RU')})` : '';
    };

    renderStockItem('stock-balls', stock.balls, stock.ballsCritical || 60000);
    renderStockItem('stock-kids-balls', stock.kidsBalls, stock.kidsBallsCritical || 20000);
    renderStockItem('stock-grenades', stock.grenades, stock.grenadesCritical || 100);
    renderStockItem('stock-smokes', stock.smokes, stock.smokesCritical || 50);
}

// Period buttons are handled by onclick in HTML (toggleRevenuePeriodType / toggleSalaryPeriodType)

document.querySelectorAll('.rating-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.rating-period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        empRatingPeriod = btn.dataset.ratingPeriod;
        loadEmployeeRating();
    });
});

document.querySelectorAll('.svc-rating-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.svc-rating-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        svcRatingPeriod = btn.dataset.svcPeriod;
        loadServiceRating();
    });
});

// ===== EMPLOYEES =====
function initEmployees() {
    document.getElementById('btn-add-employee').addEventListener('click', () => openEmployeeModal());
    document.getElementById('modal-employee-close').addEventListener('click', () => closeModal('modal-employee'));
    document.getElementById('btn-cancel-employee').addEventListener('click', () => closeModal('modal-employee'));
    document.getElementById('employee-form').addEventListener('submit', saveEmployee);
}

let empDashPeriod = 'month';
let salaryAnalyticsPeriod = 'month';

let salaryPeriodValue = null; // specific selected value like '2026-04', 'Q1-2026', '2026'

function toggleSalaryPeriodType(type) {
    salaryAnalyticsPeriod = type;
    salaryPeriodValue = null;
    document.querySelectorAll('[data-sal-period]').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`[data-sal-period="${type}"]`);
    if (btn) btn.classList.add('active');

    const sel = document.getElementById('salary-period-selector');
    const now = moscowNow();
    const mNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    let opts = '';

    if (type === 'month') {
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            const label = mNames[d.getMonth()] + ' ' + d.getFullYear();
            opts += `<option value="${val}"${i===0?' selected':''}>${label}</option>`;
        }
    } else if (type === 'quarter') {
        for (let i = 0; i < 8; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i*3, 1);
            const q = Math.floor(d.getMonth()/3)+1;
            const val = `Q${q}-${d.getFullYear()}`;
            const label = `${q} квартал ${d.getFullYear()}`;
            if (i > 0 && opts.includes(val)) continue;
            opts += `<option value="${val}"${i===0?' selected':''}>${label}</option>`;
        }
    } else if (type === 'year') {
        for (let y = now.getFullYear(); y >= now.getFullYear()-3; y--) {
            opts += `<option value="${y}"${y===now.getFullYear()?' selected':''}>${y}</option>`;
        }
    }
    sel.innerHTML = opts;
    sel.style.display = '';
    loadEmployees();
}

function onSalaryPeriodSelect(val) {
    salaryPeriodValue = val;
    loadEmployees();
}

function getSalaryPeriodRange() {
    const now = moscowNow();
    let aStart, aEnd;
    if (salaryPeriodValue && salaryAnalyticsPeriod === 'month') {
        const [y, m] = salaryPeriodValue.split('-').map(Number);
        aStart = `${y}-${String(m).padStart(2,'0')}-01`;
        aEnd = `${y}-${String(m).padStart(2,'0')}-${String(new Date(y, m, 0).getDate()).padStart(2,'0')}`;
    } else if (salaryPeriodValue && salaryAnalyticsPeriod === 'quarter') {
        const [qStr, yStr] = salaryPeriodValue.split('-');
        const q = parseInt(qStr.replace('Q',''));
        const y = parseInt(yStr);
        const qStart = (q-1)*3;
        aStart = `${y}-${String(qStart+1).padStart(2,'0')}-01`;
        const qEndDate = new Date(y, qStart+3, 0);
        aEnd = `${y}-${String(qEndDate.getMonth()+1).padStart(2,'0')}-${String(qEndDate.getDate()).padStart(2,'0')}`;
    } else if (salaryPeriodValue && salaryAnalyticsPeriod === 'year') {
        const y = parseInt(salaryPeriodValue);
        aStart = `${y}-01-01`;
        aEnd = `${y}-12-31`;
    } else if (salaryAnalyticsPeriod === 'month') {
        aStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
        aEnd = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(new Date(now.getFullYear(),now.getMonth()+1,0).getDate()).padStart(2,'0')}`;
    } else if (salaryAnalyticsPeriod === 'quarter') {
        const qStart = Math.floor(now.getMonth()/3)*3;
        aStart = `${now.getFullYear()}-${String(qStart+1).padStart(2,'0')}-01`;
        const qEndDate = new Date(now.getFullYear(), qStart+3, 0);
        aEnd = `${qEndDate.getFullYear()}-${String(qEndDate.getMonth()+1).padStart(2,'0')}-${String(qEndDate.getDate()).padStart(2,'0')}`;
    } else {
        aStart = `${now.getFullYear()}-01-01`;
        aEnd = `${now.getFullYear()}-12-31`;
    }
    return { aStart, aEnd };
}

function renderSalaryAnalytics(employees, allShifts, allPayments, globalEndDate) {
    const contentEl = document.getElementById('salary-analytics-content');
    if (!contentEl) return;

    const now = moscowNow();
    const { aStart, aEnd } = getSalaryPeriodRange();

    const periodNames = { month: 'Текущий месяц', quarter: 'Текущий квартал', year: 'Текущий год' };

    let totalFundEarned = 0, totalFundPaid = 0, totalFundDebt = 0;

    const empRows = employees.map(emp => {
        // Period earned
        const shifts = allShifts.filter(s => s.employeeId === emp.id && s.date >= aStart && s.date <= aEnd && (s.shiftRole || s.employeeRole) !== 'manager');
        const shiftEarned = shifts.reduce((s, sh) => s + (sh.earnings?.total || 0), 0);
        const mgrEarned = getManagerDailyAccruals(emp, aStart, aEnd).reduce((s, a) => s + a.amount, 0);
        const earned = shiftEarned + mgrEarned;

        // Period paid
        const paid = allPayments.filter(p => p.employeeId === emp.id && p.date >= aStart && p.date <= aEnd).reduce((s, p) => s + (p.amount || 0), 0);

        // All-time balance (carry-over)
        const allTimeEarned = allShifts.filter(s => s.employeeId === emp.id && (s.shiftRole || s.employeeRole) !== 'manager')
            .reduce((s, sh) => s + (sh.earnings?.total || 0), 0)
            + getManagerDailyAccruals(emp, '2020-01-01', globalEndDate).reduce((s, a) => s + a.amount, 0);
        const allTimePaid = allPayments.filter(p => p.employeeId === emp.id).reduce((s, p) => s + (p.amount || 0), 0);
        const balance = allTimeEarned - allTimePaid;

        totalFundEarned += earned;
        totalFundPaid += paid;
        totalFundDebt += balance > 0 ? balance : 0;

        const balClass = balance > 0 ? 'red' : balance < 0 ? 'green' : '';
        const balLabel = balance > 0 ? 'Долг' : balance < 0 ? 'Переплата' : '0';

        return `<tr>
            <td><strong>${emp.firstName} ${emp.lastName}</strong></td>
            <td>${getRoleName(emp.role)}</td>
            <td style="text-align:right;">${formatMoney(earned)}</td>
            <td style="text-align:right;color:var(--success);">${formatMoney(paid)}</td>
            <td style="text-align:right;" class="${balClass}"><strong>${balance !== 0 ? (balance > 0 ? '' : '+') + formatMoney(Math.abs(balance)) : '—'}</strong></td>
        </tr>`;
    }).join('');

    contentEl.innerHTML = `
        <div class="salary-analytics-grid">
            <div class="salary-analytics-card">
                <div class="salary-analytics-title">Фонд ЗП (${periodNames[salaryAnalyticsPeriod]})</div>
                <div class="salary-analytics-value">${formatMoney(totalFundEarned)}</div>
            </div>
            <div class="salary-analytics-card">
                <div class="salary-analytics-title">Выплачено</div>
                <div class="salary-analytics-value green">${formatMoney(totalFundPaid)}</div>
            </div>
            <div class="salary-analytics-card">
                <div class="salary-analytics-title">Общая задолженность</div>
                <div class="salary-analytics-value ${totalFundDebt > 0 ? 'red' : ''}">${formatMoney(totalFundDebt)}</div>
            </div>
        </div>
        <div class="table-container" style="margin-top:12px;">
            <table class="data-table">
                <thead><tr>
                    <th>Сотрудник</th><th>Должность</th><th style="text-align:right;">Начислено</th><th style="text-align:right;">Выплачено</th><th style="text-align:right;">Баланс</th>
                </tr></thead>
                <tbody>${empRows}
                    <tr style="border-top:2px solid var(--border);font-weight:700;">
                        <td colspan="2">Итого</td>
                        <td style="text-align:right;">${formatMoney(totalFundEarned)}</td>
                        <td style="text-align:right;color:var(--success);">${formatMoney(totalFundPaid)}</td>
                        <td style="text-align:right;" class="${totalFundDebt > 0 ? 'red' : ''}">${formatMoney(totalFundDebt)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

function loadEmployees() {
    const employees = DB.get('employees', []).filter(e => e.role !== 'director');
    const container = document.getElementById('emp-dashboard-cards');
    if (!container) return;

    const allShifts = DB.get('shifts', []).filter(s => s.endTime && s.earnings);
    const allPayments = DB.get('salaryPayments', []);
    // Always current month
    const { startDate, endDate } = getDateRangeForPeriod('month');

    // ===== SALARY ANALYTICS SUMMARY =====
    renderSalaryAnalytics(employees, allShifts, allPayments, endDate);

    container.innerHTML = employees.map(emp => {
        // Regular shift earnings (exclude manager-role shifts to avoid double counting)
        const empShifts = allShifts.filter(s => s.employeeId === emp.id && s.date >= startDate && s.date <= endDate && (s.shiftRole || s.employeeRole) !== 'manager').sort((a, b) => a.date.localeCompare(b.date));
        const empPayments = allPayments.filter(p => p.employeeId === emp.id && p.date >= startDate && p.date <= endDate);

        // Manager daily accruals (auto-accrued per day)
        const mgrAccruals = getManagerDailyAccruals(emp, startDate, endDate);
        const mgrTotal = mgrAccruals.reduce((s, a) => s + a.amount, 0);

        const shiftEarned = empShifts.reduce((s, sh) => s + (sh.earnings?.total || 0), 0);
        const earned = shiftEarned + mgrTotal;
        const paid = empPayments.reduce((s, p) => s + (p.amount || 0), 0);
        // Balance with carry-over: all-time earned - all-time paid
        const allTimeEarnedEmp = allShifts.filter(s => s.employeeId === emp.id && (s.shiftRole || s.employeeRole) !== 'manager')
            .reduce((s, sh) => s + (sh.earnings?.total || 0), 0)
            + getManagerDailyAccruals(emp, '2020-01-01', endDate).reduce((s, a) => s + a.amount, 0);
        const allTimePaidEmp = allPayments.filter(p => p.employeeId === emp.id).reduce((s, p) => s + (p.amount || 0), 0);
        const balance = allTimeEarnedEmp - allTimePaidEmp; // positive = debt, negative = overpay (carries over)

        // Determine which accrual rows are "paid" (green)
        // All-time paid for this employee to determine paid coverage
        const allTimePaid = allPayments.filter(p => p.employeeId === emp.id).reduce((s, p) => s + (p.amount || 0), 0);
        // All-time accruals chronologically to determine coverage
        const allTimeShifts = DB.get('shifts', []).filter(s => s.employeeId === emp.id && s.endTime && s.earnings && (s.shiftRole || s.employeeRole) !== 'manager').sort((a, b) => a.date.localeCompare(b.date));
        const allTimeMgr = getManagerDailyAccruals(emp, '2020-01-01', endDate).sort((a, b) => a.date.localeCompare(b.date));
        // Merge all accruals chronologically
        const allAccruals = [];
        allTimeShifts.forEach(s => allAccruals.push({ date: s.date, amount: s.earnings?.total || 0, id: s.id }));
        allTimeMgr.forEach(a => allAccruals.push({ date: a.date, amount: a.amount, id: 'mgr_' + a.date }));
        allAccruals.sort((a, b) => a.date.localeCompare(b.date));
        let runningTotal = 0;
        const paidIds = new Set();
        for (const acc of allAccruals) {
            runningTotal += acc.amount;
            if (runningTotal <= allTimePaid) paidIds.add(acc.id);
            else break;
        }

        // Build merged day rows: one row per day combining shift + manager
        const mgrByDate = {};
        mgrAccruals.forEach(a => { mgrByDate[a.date] = a.amount; });
        const allDates = new Set();
        empShifts.forEach(s => allDates.add(s.date));
        mgrAccruals.forEach(a => allDates.add(a.date));
        const sortedDates = [...allDates].sort((a, b) => b.localeCompare(a)); // newest first

        const dayRows = sortedDates.map(date => {
            const shift = empShifts.find(s => s.date === date);
            const mgrAmount = mgrByDate[date] || 0;
            const dateF = new Date(date + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

            let startTime = '—', endTime = '—', hours = '—', base = 0;
            let instrBonus = 0, adminBonus = 0;
            let hasComment = false, commentEsc = '';
            let shiftId = null;

            if (shift) {
                shiftId = shift.id;
                startTime = shift.startTime || '—';
                endTime = shift.endTime || '—';
                const [sh, sm] = (shift.startTime || '0:0').split(':').map(Number);
                const [eh, em] = (shift.endTime || '0:0').split(':').map(Number);
                hours = (((eh * 60 + em) - (sh * 60 + sm)) / 60).toFixed(1) + 'ч';
                base = shift.earnings?.base || 0;
                // Split bonuses by event role (bonusType on each bonus entry)
                (shift.eventBonuses || []).forEach(b => {
                    if (b.bonusType === 'admin') adminBonus += (b.amount || 0);
                    else instrBonus += (b.amount || 0);
                });
                hasComment = shift.shiftComment && shift.shiftComment.trim();
                commentEsc = hasComment ? shift.shiftComment.replace(/'/g, "\\'").replace(/\n/g, "\\n") : '';
            }

            const dayTotal = base + instrBonus + adminBonus + mgrAmount;
            // Check paid status — shift and manager both paid for this day
            const shiftPaid = shiftId ? paidIds.has(shiftId) : true;
            const mgrPaid = mgrAmount > 0 ? paidIds.has('mgr_' + date) : true;
            const isPaid = (shiftId || mgrAmount > 0) && shiftPaid && mgrPaid;
            const rowStyle = isPaid ? 'background:rgba(76,175,80,0.12);' : '';

            return `<tr style="${rowStyle}cursor:pointer;" onclick="${hasComment ? `showShiftComment('${commentEsc}')` : ''}" title="${hasComment ? 'Нажмите — комментарий к смене' : ''}">
                <td>${dateF}</td>
                <td>${startTime}</td>
                <td>${endTime}</td>
                <td>${hours}</td>
                <td>${base > 0 ? formatMoney(base) : '—'}</td>
                <td style="color:var(--green)">${instrBonus > 0 ? formatMoney(instrBonus) : '—'}</td>
                <td style="color:var(--green)">${adminBonus > 0 ? formatMoney(adminBonus) : '—'}</td>
                <td style="color:var(--accent)">${mgrAmount > 0 ? formatMoney(mgrAmount) : '—'}</td>
                <td style="font-weight:700">${formatMoney(dayTotal)}</td>
                <td>${hasComment ? '<span class="material-icons-round" style="font-size:16px;color:var(--accent);">comment</span>' : ''}</td>
            </tr>`;
        }).join('');

        const hasData = sortedDates.length > 0;

        const paymentRows = empPayments.slice().reverse().map(p => `<tr>
            <td>${p.date}</td><td>${p.time}</td><td style="color:var(--green);font-weight:700">${formatMoney(p.amount)}</td>
            <td>${getPaymentMethodName(p.method)}</td><td>${p.note || '—'}</td>
        </tr>`).join('');

        return `<div class="emp-dash-card" data-emp-id="${emp.id}">
            <div class="emp-dash-card-header" onclick="toggleEmpCard(${emp.id})">
                <div class="emp-dash-card-info">
                    <h3>${emp.firstName} ${emp.lastName}</h3>
                </div>
                <div class="emp-dash-card-stats">
                    <div class="emp-dash-stat">
                        <span class="emp-dash-stat-label">К выплате</span>
                        <span class="emp-dash-stat-value">${formatMoney(earned)}</span>
                    </div>
                    <div class="emp-dash-stat">
                        <span class="emp-dash-stat-label">Выплачено</span>
                        <span class="emp-dash-stat-value green">${formatMoney(paid)}</span>
                    </div>
                    <div class="emp-dash-stat">
                        <span class="emp-dash-stat-label">${balance >= 0 ? 'Задолженность' : 'Переплата'}</span>
                        <span class="emp-dash-stat-value ${balance > 0 ? 'red' : balance < 0 ? 'green' : ''}">${formatMoney(Math.abs(balance))}</span>
                    </div>
                    <div class="emp-dash-stat">
                        <span class="emp-dash-stat-label">Должность</span>
                        <span class="emp-dash-stat-value" style="font-size:13px;">${getRoleName(emp.role)}${mgrAccruals.length > 0 ? ' + Менеджер' : ''}</span>
                    </div>
                </div>
                <span class="material-icons-round emp-dash-chevron">expand_more</span>
            </div>
            <div class="emp-dash-card-body" id="emp-card-body-${emp.id}" style="display:none;">
                <div class="emp-dash-card-actions" style="margin-bottom:12px;">
                    <button class="btn-primary" onclick="openSalaryPaymentModal(${emp.id})">
                        <span class="material-icons-round">account_balance_wallet</span>
                        Выплатить зарплату
                    </button>
                    <button class="btn-action" onclick="openEmployeeModal('${emp.id}')" title="Редактировать">
                        <span class="material-icons-round">edit</span>
                    </button>
                    <button class="btn-action danger" onclick="deleteEmployee('${emp.id}')" title="Удалить">
                        <span class="material-icons-round">delete</span>
                    </button>
                </div>
                <div class="emp-dash-section-title">Начисления${mgrTotal > 0 ? ` <span style="font-weight:400;font-size:12px;color:var(--text-secondary);">(менеджер: ${formatMoney(mgrTotal)} за ${mgrAccruals.length} дн.)</span>` : ''}</div>
                ${hasData ? `<div class="table-container"><table class="data-table">
                    <thead><tr><th>Дата</th><th>Начало</th><th>Конец</th><th>Часы</th><th>Ставка</th><th>Бонус инстр.</th><th>Бонус адм.</th><th>Менеджер</th><th>Итого</th><th></th></tr></thead>
                    <tbody>${dayRows}</tbody>
                </table></div>` : '<p class="empty-state-text">Нет начислений за период</p>'}
                ${empPayments.length ? `<div class="emp-dash-section-title" style="margin-top:16px;">Выплаты</div>
                <div class="table-container"><table class="data-table">
                    <thead><tr><th>Дата</th><th>Время</th><th>Сумма</th><th>Способ</th><th>Примечание</th></tr></thead>
                    <tbody>${paymentRows}</tbody>
                </table></div>` : ''}
            </div>
        </div>`;
    }).join('');

}

function showShiftComment(comment) {
    const text = comment.replace(/\\n/g, '\n');
    showConfirm('Комментарий к смене', text, () => {}, 'Закрыть');
}

function toggleEmpCard(empId) {
    const body = document.getElementById('emp-card-body-' + empId);
    if (!body) return;
    const card = body.closest('.emp-dash-card');
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    const chevron = card?.querySelector('.emp-dash-chevron');
    if (chevron) chevron.textContent = isOpen ? 'expand_more' : 'expand_less';
}

function setAllowedRolesCheckboxes(allowedRoles) {
    document.getElementById('emp-role-admin').checked = allowedRoles.includes('admin');
    document.getElementById('emp-role-senior_instructor').checked = allowedRoles.includes('senior_instructor');
    document.getElementById('emp-role-instructor').checked = allowedRoles.includes('instructor');
}

function getDefaultAllowedRoles(role) {
    if (role === 'director') return ['admin', 'senior_instructor', 'instructor', 'manager'];
    if (role === 'admin') return ['admin'];
    if (role === 'senior_instructor') return ['senior_instructor'];
    if (role === 'manager') return ['manager'];
    return ['instructor'];
}

function openEmployeeModal(id = null) {
    const form = document.getElementById('employee-form');
    form.reset();
    document.getElementById('emp-id').value = '';
    document.getElementById('emp-shifts-history').style.display = 'none';

    if (id) {
        const emp = DB.get('employees', []).find(e => String(e.id) === String(id));
        if (!emp) return;
        document.getElementById('modal-employee-title').textContent = 'Редактировать сотрудника';
        document.getElementById('emp-id').value = emp.id;
        document.getElementById('emp-first-name').value = emp.firstName;
        document.getElementById('emp-last-name').value = emp.lastName;
        document.getElementById('emp-role').value = emp.role;
        document.getElementById('emp-pin').value = emp.pin;
        document.getElementById('emp-dob').value = emp.dob || '';
        document.getElementById('emp-phone').value = emp.phone || '';
        document.getElementById('emp-passport').value = emp.passport || '';
        document.getElementById('emp-bank').value = emp.bank || '';
        document.getElementById('emp-paid').value = emp.paid || '';
        setAllowedRolesCheckboxes(emp.allowedShiftRoles || getDefaultAllowedRoles(emp.role));

        const monthData = getEmployeeMonthEarnings(emp.id);
        if (monthData.shifts.length > 0 || emp.role !== 'director') {
            document.getElementById('emp-shifts-history').style.display = 'block';
            const listEl = document.getElementById('emp-shifts-list');
            if (monthData.shifts.length === 0) {
                listEl.innerHTML = '<p class="empty-state" style="padding:8px">Нет завершённых смен в этом месяце</p>';
            } else {
                listEl.innerHTML = monthData.shifts.map(s => `
                    <div class="emp-shift-item">
                        <span class="shift-date">${s.date.slice(5)}</span>
                        <span class="shift-hours">${s.startTime} – ${s.endTime}</span>
                        <span class="shift-base">${formatMoney(s.earnings?.base || 0)}</span>
                        <span class="shift-bonus-val">+${formatMoney(s.earnings?.bonus || 0)}</span>
                        <span class="shift-total">${formatMoney(s.earnings?.total || 0)}</span>
                    </div>
                `).join('');
            }
            document.getElementById('emp-total-earned').textContent = formatMoney(monthData.totalEarned);
        }
    } else {
        document.getElementById('modal-employee-title').textContent = 'Новый сотрудник';
        // Default allowed roles based on selected role
        const role = document.getElementById('emp-role').value;
        setAllowedRolesCheckboxes(getDefaultAllowedRoles(role));
    }

    // Auto-update allowed roles when role changes (for new employees)
    document.getElementById('emp-role').onchange = function () {
        if (!document.getElementById('emp-id').value) {
            setAllowedRolesCheckboxes(getDefaultAllowedRoles(this.value));
        }
    };

    openModal('modal-employee');
}

function saveEmployee(e) {
    e.preventDefault();
    const employees = DB.get('employees', []);
    const id = document.getElementById('emp-id').value;

    // Collect allowed shift roles
    const allowedShiftRoles = [];
    if (document.getElementById('emp-role-admin').checked) allowedShiftRoles.push('admin');
    if (document.getElementById('emp-role-senior_instructor').checked) allowedShiftRoles.push('senior_instructor');
    if (document.getElementById('emp-role-instructor').checked) allowedShiftRoles.push('instructor');

    const data = {
        firstName: document.getElementById('emp-first-name').value.trim(),
        lastName: document.getElementById('emp-last-name').value.trim(),
        role: document.getElementById('emp-role').value,
        pin: document.getElementById('emp-pin').value.trim(),
        dob: document.getElementById('emp-dob').value,
        phone: document.getElementById('emp-phone').value.trim(),
        passport: document.getElementById('emp-passport').value.trim(),
        bank: document.getElementById('emp-bank').value.trim(),
        paid: parseFloat(document.getElementById('emp-paid').value) || 0,
        allowedShiftRoles: allowedShiftRoles.length > 0 ? allowedShiftRoles : getDefaultAllowedRoles(document.getElementById('emp-role').value),
    };

    const pinConflict = employees.find(e => e.pin === data.pin && String(e.id) !== id);
    if (pinConflict) {
        showToast('Этот ПИН-код уже используется!', 'error');
        return;
    }

    if (id) {
        const idx = employees.findIndex(e => e.id === parseInt(id));
        if (idx >= 0) employees[idx] = { ...employees[idx], ...data };
    } else {
        data.id = Date.now();
        employees.push(data);
    }

    DB.set('employees', employees);
    closeModal('modal-employee');
    loadEmployees();
    showToast('Сотрудник сохранён');

}

function deleteEmployee(id) {
    showConfirm('Удалить сотрудника?', 'Все данные сотрудника будут удалены', () => {
        let employees = DB.get('employees', []);
        employees = employees.filter(e => e.id !== id);
        DB.set('employees', employees);
        loadEmployees();
        showToast('Сотрудник удалён');
    });
}

// ===== SCHEDULE =====
function initSchedule() {
    document.getElementById('btn-add-event').addEventListener('click', () => openEventModal());
    document.getElementById('modal-event-close').addEventListener('click', () => closeModal('modal-event'));
    document.getElementById('btn-cancel-event').addEventListener('click', () => closeModal('modal-event'));
    document.getElementById('event-form').addEventListener('submit', saveEvent);

    document.getElementById('cal-prev').addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        renderCalendar();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() + 1);
        renderCalendar();
    });

    document.getElementById('btn-sync-gcal').addEventListener('click', async () => {
        if (!GCalSync.isConnected()) {
            showToast('Google Calendar не подключён. Настройте в Настройках.');
            return;
        }
        const result = await GCalSync.fullSync();
        if (result) renderCalendar();
    });
}

function renderCalendar() {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    document.getElementById('cal-month-title').textContent = monthNames[month] + ' ' + year;

    const firstDay = new Date(year, month, 1);
    let startDay = firstDay.getDay();
    if (startDay === 0) startDay = 7;
    startDay--;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const events = DB.get('events', []);
    const todayStr = todayLocal();

    let cells = '';
    for (let i = startDay - 1; i >= 0; i--) {
        cells += `<div class="cal-day other-month">${daysInPrevMonth - i}</div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = dateStr === todayStr;
        const hasEvents = events.some(e => e.date === dateStr);
        const isSelected = selectedCalDay === dateStr;
        let classes = 'cal-day';
        if (isToday) classes += ' today';
        if (hasEvents) classes += ' has-events';
        if (isSelected) classes += ' selected';
        cells += `<div class="${classes}" data-date="${dateStr}" onclick="selectCalDay('${dateStr}')">${d}</div>`;
    }
    const totalCells = startDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
        cells += `<div class="cal-day other-month">${i}</div>`;
    }

    document.getElementById('calendar-cells').innerHTML = cells;
    if (!selectedCalDay) selectCalDay(todayStr);
    else selectCalDay(selectedCalDay);

    // Render upcoming events table
    renderUpcomingEventsTable(events);
}

function renderUpcomingEventsTable(events) {
    const tbody = document.getElementById('month-events-tbody');
    if (!tbody) return;
    const today = todayLocal();
    const d30 = new Date(moscowNow());
    d30.setDate(d30.getDate() + 30);
    const endDate = `${d30.getFullYear()}-${String(d30.getMonth() + 1).padStart(2, '0')}-${String(d30.getDate()).padStart(2, '0')}`;

    const upcoming = events
        .filter(e => e.date && e.date >= today && e.date <= endDate && e.status !== 'cancelled')
        .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));

    if (upcoming.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:var(--text-secondary);">Нет ближайших мероприятий</td></tr>';
        return;
    }

    const channelLabels = { wa: '🟢WA', tg: '🔵TG', vk: '🟣VK' };
    const prepayLabels = { qr: 'QR', cash: 'Нал.' };
    const occasionNames = { corporate: 'Корпоратив', birthday: 'День рождения', friends: 'Встреча друзей', bachelor: 'Мальчишник', personal: 'Личный праздник', active: 'Активный отдых' };
    const tariffs = DB.get('tariffs', []);

    tbody.innerHTML = upcoming.map(e => {
        const dateF = new Date(e.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
        const isToday = e.date === today;
        const statusClass = e.status === 'completed' ? 'status-completed' : e.status === 'confirmed' ? 'status-confirmed' : '';
        const statusName = getStatusName(e.status);
        const rowStyle = e.status === 'completed' ? 'background:rgba(76,175,80,0.1);' : isToday ? 'background:rgba(255,214,0,0.08);' : '';
        // Find tariff name
        const tariff = e.tariffId ? tariffs.find(t => t.id === e.tariffId) : null;
        const tariffName = tariff ? tariff.name : (e.tariffName || '—');
        return `<tr style="${rowStyle}cursor:pointer;" onclick="openEventModal('${e.id}')">
            <td style="${isToday ? 'font-weight:700;color:var(--accent);' : ''}">${dateF}</td>
            <td>${e.time || '—'}</td>
            <td>${e.type ? getEventTypeName(e.type) : '—'}</td>
            <td>${tariffName}</td>
            <td><span class="emp-event-status ${statusClass}" style="font-size:11px;">${statusName}</span></td>
            <td><strong>${e.title || '—'}</strong></td>
            <td>${e.clientName || '—'}</td>
            <td>${channelLabels[e.contactChannel] || '—'}</td>
            <td>${occasionNames[e.occasion] || e.occasion || '—'}</td>
            <td style="text-align:center;">${e.participants || '—'}</td>
            <td style="text-align:right;">${e.price ? formatMoney(e.price) : '—'}</td>
            <td style="text-align:right;">${e.prepayment ? formatMoney(e.prepayment) + (prepayLabels[e.prepaymentMethod] ? ' ' + prepayLabels[e.prepaymentMethod] : '') : '—'}</td>
        </tr>`;
    }).join('');
}

function selectCalDay(dateStr) {
    selectedCalDay = dateStr;
    document.querySelectorAll('#calendar-cells .cal-day').forEach(d => d.classList.remove('selected'));
    const el = document.querySelector(`#calendar-cells .cal-day[data-date="${dateStr}"]`);
    if (el) el.classList.add('selected');

    const events = DB.get('events', []).filter(e => e.date === dateStr)
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const dateFormatted = new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('day-events-title').textContent = 'Мероприятия — ' + dateFormatted;

    const list = document.getElementById('day-events-list');
    if (events.length === 0) {
        list.innerHTML = '<p class="empty-state">Нет мероприятий в этот день</p>';
    } else {
        list.innerHTML = events.map(e => {
            const isCompleted = e.status === 'completed';
            const statusClass = 'status-' + (e.status || 'pending');
            const statusName = getStatusName(e.status);
            return `
            <div class="event-card event-card-day" onclick="openEventModal('${e.id}')" style="flex-direction:column;align-items:stretch;gap:8px;cursor:pointer;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <div class="event-time">${e.time}</div>
                    <span class="event-type-badge">${getEventTypeName(e.type)}</span>
                    <span class="emp-event-status ${statusClass}">${statusName}</span>
                    ${getSourceBadge(e)}
                </div>
                <div class="event-info">
                    <strong>${e.title}</strong>${e.clientName ? ` <span style="font-weight:400;color:var(--text-secondary);">— ${e.clientName}${getChannelBadge(e.contactChannel)}</span>` : ''}
                    <span>${formatParticipants(e)} · ${formatDuration(e.duration)}${getStaffNames(e) ? ' · ' + getStaffNames(e) : ''}${e.price ? ' · ' + formatMoney(e.price) : ''}${e.prepayment ? ' · предоплата ' + formatMoney(e.prepayment) + (e.prepaymentMethod === 'qr' ? ' QR' : e.prepaymentMethod === 'cash' ? ' нал.' : '') : ''}</span>
                </div>
                ${!isCompleted ? `<button class="btn-primary btn-sm" onclick="event.stopPropagation();openEventModal('${e.id}', true)" style="width:100%;justify-content:center;">
                    <span class="material-icons-round" style="font-size:16px">done_all</span> Выполнить
                </button>` : ''}
            </div>`;
        }).join('');
    }
}

function toggleOptionsSection(section) {
    const listId = section === 'game' ? 'evt-options-game-list' : 'evt-options-extra-list';
    const chevronId = section === 'game' ? 'options-game-chevron' : 'options-extra-chevron';
    const list = document.getElementById(listId);
    const chevron = document.getElementById(chevronId);
    if (!list) return;
    const isOpen = list.style.display !== 'none';
    list.style.display = isOpen ? 'none' : '';
    if (chevron) chevron.textContent = isOpen ? 'expand_more' : 'expand_less';
}

function toggleDiscountType() {
    const type = document.getElementById('evt-discount-type').value;
    const details = document.getElementById('evt-discount-details');
    const percentRow = document.getElementById('evt-discount-percent-row');
    const certRow = document.getElementById('evt-certificate-row');

    if (type === 'none') {
        details.style.display = 'none';
        document.getElementById('evt-discount').value = '';
        document.getElementById('evt-certificate-number').value = '';
        document.getElementById('evt-certificate-amount').value = '';
    } else if (type === 'percent') {
        details.style.display = '';
        percentRow.style.display = '';
        certRow.style.display = 'none';
        document.getElementById('evt-certificate-number').value = '';
        document.getElementById('evt-certificate-amount').value = '';
    } else if (type === 'certificate') {
        details.style.display = '';
        percentRow.style.display = 'none';
        certRow.style.display = '';
        document.getElementById('evt-discount').value = '';
    }
    recalcEventTotal();
}

function toggleFinSection(section) {
    const content = document.getElementById('fin-content-' + section);
    const chevron = document.getElementById('fin-chevron-' + section);
    if (!content) return;
    const isOpen = content.style.display !== 'none';
    content.style.display = isOpen ? 'none' : '';
    if (chevron) chevron.textContent = isOpen ? 'expand_more' : 'expand_less';
}

function toggleStaffSection(section) {
    const listId = 'evt-' + section + '-list';
    const chevronId = 'staff-' + section + '-chevron';
    const list = document.getElementById(listId);
    const chevron = document.getElementById(chevronId);
    if (!list) return;
    const isOpen = list.style.display !== 'none';
    list.style.display = isOpen ? 'none' : '';
    if (chevron) chevron.textContent = isOpen ? 'expand_more' : 'expand_less';
}

function changeOptionQty(optId, delta) {
    const el = document.getElementById('opt-qty-' + optId);
    if (!el) return;
    let qty = parseInt(el.textContent) || 0;
    qty = Math.max(0, qty + delta);
    el.textContent = qty;
    el.closest('.option-qty-row').classList.toggle('active', qty > 0);
    recalcEventTotal();
}

function openEventModal(id = null, completing = false) {
    const form = document.getElementById('event-form');
    form.reset();
    document.getElementById('evt-id').value = '';
    document.getElementById('btn-delete-event').style.display = 'none';

    // Populate instructor checkboxes (employees with instructor/senior_instructor in allowedShiftRoles)
    const allEmps = DB.get('employees', []).filter(e => e.role !== 'director');
    const instructorEmps = allEmps.filter(e => {
        const roles = e.allowedShiftRoles || getDefaultAllowedRoles(e.role);
        return roles.includes('instructor') || roles.includes('senior_instructor');
    });
    document.getElementById('evt-instructors-list').innerHTML = instructorEmps.length
        ? instructorEmps.map(i => `<label class="staff-select-item"><input type="checkbox" value="${i.id}" class="evt-instr-cb"> ${i.firstName} ${i.lastName}</label>`).join('')
        : '<span class="empty-state-text">Нет инструкторов</span>';

    // Populate admin checkboxes (employees with admin in allowedShiftRoles)
    const adminEmps = allEmps.filter(e => {
        const roles = e.allowedShiftRoles || getDefaultAllowedRoles(e.role);
        return roles.includes('admin');
    });
    document.getElementById('evt-admins-list').innerHTML = adminEmps.length
        ? adminEmps.map(a => `<label class="staff-select-item"><input type="checkbox" value="${a.id}" class="evt-admin-cb"> ${a.firstName} ${a.lastName}</label>`).join('')
        : '<span class="empty-state-text">Нет администраторов</span>';

    // Populate tariff select (filtered by event type)
    document.getElementById('evt-type').onchange = updateTariffsByType;
    updateTariffsByType();

    // Populate options with quantity controls
    const allTariffOptions = DB.get('tariffs', []).filter(t => (t.category === 'optionsForGame' || t.category === 'options') && t.id !== 23);
    const gameOptions = allTariffOptions.filter(t => t.category === 'optionsForGame');
    const extraOptions = allTariffOptions.filter(t => t.category === 'options');

    function renderOptionRow(o) {
        if (o.inputType === 'number') {
            return `<div class="option-qty-row" data-option-id="${o.id}" data-input-type="number">
                <span class="option-qty-name">${o.name}</span>
                <span class="option-qty-price">${formatMoney(o.price)}/${o.unit}</span>
                <div class="option-qty-controls">
                    <input type="number" class="option-number-input" id="opt-qty-${o.id}" placeholder="${o.inputPlaceholder || 'Кол-во'}" min="0" value="">
                </div>
            </div>`;
        } else if (o.inputType === 'shop') {
            return `<div class="option-qty-row" data-option-id="${o.id}" data-input-type="shop">
                <span class="option-qty-name">${o.name}</span>
                <div class="option-shop-controls">
                    <input type="number" class="option-number-input" id="opt-qty-${o.id}" placeholder="Сумма ₽" min="0" value="">
                    <input type="number" class="option-number-input option-shop-count" id="opt-shop-count-${o.id}" placeholder="Кол-во" min="0" value="">
                </div>
            </div>`;
        } else {
            const priceLabel = o.unit === 'час' ? '/час' : '/шт';
            return `<div class="option-qty-row" data-option-id="${o.id}">
                <span class="option-qty-name">${o.name}</span>
                <span class="option-qty-price">${formatMoney(o.price)}${priceLabel}</span>
                <div class="option-qty-controls">
                    <button type="button" class="option-qty-btn" onclick="changeOptionQty(${o.id}, -1)">−</button>
                    <span class="option-qty-value" id="opt-qty-${o.id}">0</span>
                    <button type="button" class="option-qty-btn" onclick="changeOptionQty(${o.id}, 1)">+</button>
                </div>
            </div>`;
        }
    }

    document.getElementById('evt-options-game-list').innerHTML = gameOptions.map(renderOptionRow).join('');
    document.getElementById('evt-options-extra-list').innerHTML = extraOptions.map(renderOptionRow).join('');

    // Bind input events for number/shop fields to toggle active class + recalc total
    document.querySelectorAll('#evt-options-game-list .option-number-input, #evt-options-extra-list .option-number-input').forEach(input => {
        input.addEventListener('input', () => {
            const row = input.closest('.option-qty-row');
            const val = parseInt(input.value) || 0;
            row?.classList.toggle('active', val > 0);
            recalcEventTotal();
        });
    });

    // Recalc total when key fields change
    ['evt-tariff', 'evt-participants', 'evt-discount', 'evt-prepayment', 'evt-certificate-amount'].forEach(fid => {
        const el = document.getElementById(fid);
        if (el) el.addEventListener('input', recalcEventTotal);
        if (el) el.addEventListener('change', recalcEventTotal);
    });

    if (id) {
        const evt = DB.get('events', []).find(e => String(e.id) === String(id));
        if (!evt) return;
        document.getElementById('modal-event-title').textContent = 'Редактировать мероприятие';
        document.getElementById('evt-id').value = evt.id;
        document.getElementById('evt-title').value = evt.title;
        document.getElementById('evt-client-name').value = evt.clientName || '';
        document.getElementById('evt-contact-channel').value = evt.contactChannel || '';
        document.getElementById('evt-client-phone').value = evt.clientPhone || '';
        document.getElementById('evt-date').value = evt.date;
        document.getElementById('evt-time').value = evt.time;
        document.getElementById('evt-duration').value = evt.duration;
        document.getElementById('evt-type').value = evt.type;
        updateTariffsByType(); // filter tariffs by selected type
        document.getElementById('evt-occasion').value = evt.occasion || '';
        document.getElementById('evt-player-age').value = evt.playerAge || '';
        document.getElementById('evt-tariff').value = evt.tariffId || '';
        document.getElementById('evt-participants').value = evt.participants;
        // Check instructors
        const instrIds = evt.instructors || (evt.instructor ? [evt.instructor] : []);
        document.querySelectorAll('.evt-instr-cb').forEach(cb => {
            cb.checked = instrIds.includes(parseInt(cb.value));
        });
        // Check admins
        const adminIds = evt.admins || [];
        document.querySelectorAll('.evt-admin-cb').forEach(cb => {
            cb.checked = adminIds.includes(parseInt(cb.value));
        });
        document.getElementById('evt-notes').value = evt.notes || '';
        document.getElementById('evt-price').value = evt.price || '';
        document.getElementById('evt-discount').value = evt.discount || '';
        // Set discount type
        if (evt.certificateNumber || evt.certificateAmount) {
            document.getElementById('evt-discount-type').value = 'certificate';
            document.getElementById('evt-certificate-number').value = evt.certificateNumber || '';
            document.getElementById('evt-certificate-amount').value = evt.certificateAmount || '';
        } else if (evt.discount > 0) {
            document.getElementById('evt-discount-type').value = 'percent';
        } else {
            document.getElementById('evt-discount-type').value = 'none';
        }
        toggleDiscountType();
        document.getElementById('evt-status').value = evt.status || 'pending';
        document.getElementById('evt-prepayment').value = evt.prepayment || '';
        document.getElementById('evt-prepayment-method').value = evt.prepaymentMethod || '';
        document.getElementById('evt-prepayment-date').value = evt.prepaymentDate || '';

        // Set option quantities
        if (evt.optionQuantities) {
            Object.entries(evt.optionQuantities).forEach(([optId, qty]) => {
                const el = document.getElementById('opt-qty-' + optId);
                const row = el?.closest('.option-qty-row');
                if (!el) return;
                const inputType = row?.dataset.inputType;
                if (inputType === 'number' || inputType === 'shop') {
                    el.value = qty || '';
                    if (inputType === 'shop' && evt.shopCount) {
                        const countEl = document.getElementById('opt-shop-count-' + optId);
                        if (countEl) countEl.value = evt.shopCount || '';
                    }
                } else {
                    el.textContent = qty;
                }
                row?.classList.toggle('active', qty > 0);
            });
        } else if (evt.selectedOptions) {
            // Legacy: convert old checkbox format to quantities (1 each)
            evt.selectedOptions.forEach(optId => {
                const el = document.getElementById('opt-qty-' + optId);
                if (el) {
                    if (el.tagName === 'INPUT') el.value = '1';
                    else el.textContent = '1';
                    el.closest('.option-qty-row')?.classList.add('active');
                }
            });
        }

        document.getElementById('btn-delete-event').style.display = 'inline-flex';
    } else {
        document.getElementById('modal-event-title').textContent = 'Новое мероприятие';
        if (selectedCalDay) document.getElementById('evt-date').value = selectedCalDay;
        else if (empSelectedCalDay) document.getElementById('evt-date').value = empSelectedCalDay;
        document.getElementById('evt-discount-type').value = 'none';
        document.getElementById('evt-certificate-number').value = '';
        document.getElementById('evt-certificate-amount').value = '';
        toggleDiscountType();
    }

    // Show/hide complete button and total summary
    const completeBtn = document.getElementById('btn-complete-event');
    const totalBlock = document.getElementById('evt-total-block');
    if (completing && id) {
        document.getElementById('modal-event-title').textContent = 'Выполнить заказ';
        if (completeBtn) completeBtn.style.display = 'inline-flex';
        if (totalBlock) totalBlock.style.display = 'block';
        recalcEventTotal();
    } else {
        if (completeBtn) completeBtn.style.display = 'none';
        if (totalBlock) totalBlock.style.display = 'none';
    }

    // Store completing flag for save handler
    document.getElementById('event-form').dataset.completing = completing ? '1' : '';

    openModal('modal-event');
}

function recalcEventTotal() {
    const tariffs = DB.get('tariffs', []);
    const tariffId = parseInt(document.getElementById('evt-tariff').value);
    const participants = parseInt(document.getElementById('evt-participants').value) || 0;
    const discount = parseFloat(document.getElementById('evt-discount').value) || 0;
    const prepayment = parseFloat(document.getElementById('evt-prepayment').value) || 0;

    let serviceCost = 0;
    const tariff = tariffs.find(t => t.id === tariffId);
    if (tariff) serviceCost = tariff.price * participants;

    let optionsCost = 0;
    document.querySelectorAll('#evt-options-game-list .option-qty-row, #evt-options-extra-list .option-qty-row').forEach(row => {
        const optId = parseInt(row.dataset.optionId);
        const opt = tariffs.find(t => t.id === optId);
        if (!opt) return;
        const inputType = row.dataset.inputType;
        let qty = 0;
        if (inputType === 'number' || inputType === 'shop') {
            qty = parseInt(document.getElementById('opt-qty-' + optId)?.value) || 0;
        } else {
            qty = parseInt(document.getElementById('opt-qty-' + optId)?.textContent) || 0;
        }
        if (qty <= 0) return;
        if (inputType === 'shop') {
            optionsCost += qty; // shop: value is already the sum in rubles
        } else {
            optionsCost += opt.price * qty;
        }
    });

    const subtotal = serviceCost + optionsCost;
    const discountType = document.getElementById('evt-discount-type').value;
    const certAmount = parseFloat(document.getElementById('evt-certificate-amount').value) || 0;
    let discountAmount = 0;
    let discountLabel = '';
    if (discountType === 'percent' && discount > 0) {
        discountAmount = subtotal * discount / 100;
        discountLabel = `Скидка ${discount}%`;
    } else if (discountType === 'certificate' && certAmount > 0) {
        discountAmount = certAmount;
        const certNum = document.getElementById('evt-certificate-number').value.trim();
        discountLabel = `Сертификат${certNum ? ' №' + certNum : ''}`;
    }
    const total = subtotal - discountAmount;
    const toPay = total - prepayment;

    const block = document.getElementById('evt-total-block');
    if (block) {
        block.innerHTML = `
            <div class="evt-total-summary">
                <div class="evt-total-row"><span>Услуга:</span><span>${formatMoney(serviceCost)}</span></div>
                <div class="evt-total-row"><span>Доп. опции:</span><span>${formatMoney(optionsCost)}</span></div>
                ${discountAmount > 0 ? `<div class="evt-total-row"><span>${discountLabel}:</span><span>−${formatMoney(discountAmount)}</span></div>` : ''}
                <div class="evt-total-row evt-total-main"><span>Итого:</span><span>${formatMoney(total)}</span></div>
                ${prepayment > 0 ? `<div class="evt-total-row"><span>Предоплата:</span><span>−${formatMoney(prepayment)}</span></div>
                <div class="evt-total-row evt-total-main"><span>К оплате:</span><span>${formatMoney(toPay)}</span></div>` : ''}
            </div>
        `;
    }

    // Update price field (full price for records, toPay shown in payment modal)
    document.getElementById('evt-price').value = total;
    document.getElementById('evt-price').dataset.toPay = toPay;
}

function completeEventFromModal() {
    // Save event first
    const form = document.getElementById('event-form');
    form.requestSubmit();
    // Then open payment modal
    const id = document.getElementById('evt-id').value;
    if (id) {
        setTimeout(() => openPaymentModal(id), 300);
    }
}

function saveEvent(e) {
    e.preventDefault();
    const events = DB.get('events', []);
    const id = document.getElementById('evt-id').value;

    // Collect option quantities
    const optionQuantities = {};
    const selectedOptions = [];
    let shopCount = null;
    document.querySelectorAll('#evt-options-game-list .option-qty-row, #evt-options-extra-list .option-qty-row').forEach(row => {
        const optId = parseInt(row.dataset.optionId);
        const inputType = row.dataset.inputType;
        let qty = 0;
        if (inputType === 'number' || inputType === 'shop') {
            qty = parseInt(document.getElementById('opt-qty-' + optId)?.value) || 0;
            if (inputType === 'shop') {
                shopCount = parseInt(document.getElementById('opt-shop-count-' + optId)?.value) || 0;
            }
        } else {
            qty = parseInt(row.querySelector('.option-qty-value')?.textContent) || 0;
        }
        if (qty > 0) {
            optionQuantities[optId] = qty;
            selectedOptions.push(optId);
        }
    });

    const participantsMax = parseInt(document.getElementById('evt-participants').value) || 0;

    const data = {
        title: document.getElementById('evt-title').value.trim(),
        clientName: document.getElementById('evt-client-name').value.trim(),
        contactChannel: document.getElementById('evt-contact-channel').value,
        clientPhone: document.getElementById('evt-client-phone').value.trim(),
        date: document.getElementById('evt-date').value,
        time: document.getElementById('evt-time').value,
        duration: parseInt(document.getElementById('evt-duration').value) || 60,
        type: document.getElementById('evt-type').value,
        occasion: document.getElementById('evt-occasion').value,
        playerAge: document.getElementById('evt-player-age').value.trim(),
        tariffId: parseInt(document.getElementById('evt-tariff').value) || null,
        participants: participantsMax,
        instructors: [...document.querySelectorAll('.evt-instr-cb:checked')].map(cb => parseInt(cb.value)),
        admins: [...document.querySelectorAll('.evt-admin-cb:checked')].map(cb => parseInt(cb.value)),
        instructor: [...document.querySelectorAll('.evt-instr-cb:checked')].map(cb => parseInt(cb.value))[0] || null, // backward compat
        notes: document.getElementById('evt-notes').value.trim(),
        price: parseFloat(document.getElementById('evt-price').value) || 0,
        totalPrice: parseFloat(document.getElementById('evt-price').value) || 0,
        toPay: parseFloat(document.getElementById('evt-price').dataset.toPay) || 0,
        discount: parseFloat(document.getElementById('evt-discount').value) || 0,
        discountType: document.getElementById('evt-discount-type').value,
        certificateNumber: document.getElementById('evt-certificate-number').value.trim(),
        certificateAmount: parseFloat(document.getElementById('evt-certificate-amount').value) || 0,
        status: document.getElementById('evt-status').value || 'pending',
        prepayment: parseFloat(document.getElementById('evt-prepayment').value) || 0,
        prepaymentMethod: document.getElementById('evt-prepayment-method').value,
        prepaymentDate: document.getElementById('evt-prepayment-date').value,
        selectedOptions: selectedOptions, // backward compat: array of IDs
        optionQuantities: optionQuantities, // new: { optionId: quantity }
        shopCount: shopCount, // quantity of shop items (if any)
    };

    if (id) {
        const idx = events.findIndex(e => e.id === parseInt(id));
        if (idx >= 0) events[idx] = { ...events[idx], ...data };
    } else {
        data.id = Date.now();
        data.source = 'crm'; // Mark as created in CRM
        events.push(data);
    }

    DB.set('events', events);
    closeModal('modal-event');
    if (document.getElementById('page-schedule').classList.contains('active')) renderCalendar();
    if (document.getElementById('emp-page-booking').classList.contains('active')) renderEmpCalendar();
    if (document.getElementById('emp-page-events').classList.contains('active')) loadEmployeeEvents();
    showToast('Мероприятие сохранено');


    // Push to Google Calendar
    const savedEvent = id ? events.find(ev => ev.id === parseInt(id)) : events[events.length - 1];
    if (savedEvent && GCalSync.isConnected()) {
        GCalSync.pushEvent(savedEvent);
    }
}

document.getElementById('btn-delete-event').addEventListener('click', () => {
    const id = parseInt(document.getElementById('evt-id').value);
    showConfirm('Удалить мероприятие?', 'Это действие нельзя отменить', () => {
        let events = DB.get('events', []);
        events = events.filter(e => e.id !== id);
        DB.set('events', events);
        closeModal('modal-event');
        if (document.getElementById('page-schedule').classList.contains('active')) renderCalendar();
        if (document.getElementById('emp-page-booking').classList.contains('active')) renderEmpCalendar();
        showToast('Мероприятие удалено');
        // Delete from Google Calendar
        if (GCalSync.isConnected()) GCalSync.deleteEvent(id);
    });
});

// ===== FINANCES =====
let finPeriodType = 'week';
let finPeriodValue = null;

function toggleFinPeriodType(type) {
    finPeriodType = type;
    finPeriodValue = null;
    document.querySelectorAll('.fin-period-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.fin-period-btn[data-fin-period="${type}"]`);
    if (btn) btn.classList.add('active');

    const sel = document.getElementById('fin-period-selector');
    const now = moscowNow();
    const mNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    let opts = '';

    if (type === 'week') {
        for (let i = 0; i < 12; i++) {
            const wStart = new Date(now);
            const dow = wStart.getDay() || 7;
            wStart.setDate(wStart.getDate() - dow + 1 - i*7);
            const wEnd = new Date(wStart); wEnd.setDate(wStart.getDate() + 6);
            const val = `${wStart.getFullYear()}-${String(wStart.getMonth()+1).padStart(2,'0')}-${String(wStart.getDate()).padStart(2,'0')}`;
            const label = `${wStart.getDate()}.${String(wStart.getMonth()+1).padStart(2,'0')} — ${wEnd.getDate()}.${String(wEnd.getMonth()+1).padStart(2,'0')}.${wEnd.getFullYear()}`;
            opts += `<option value="${val}"${i===0?' selected':''}>${label}</option>`;
        }
    } else if (type === 'month') {
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            opts += `<option value="${val}"${i===0?' selected':''}>${mNames[d.getMonth()]} ${d.getFullYear()}</option>`;
        }
    } else if (type === 'year') {
        for (let y = now.getFullYear(); y >= now.getFullYear()-3; y--) {
            opts += `<option value="${y}"${y===now.getFullYear()?' selected':''}>${y}</option>`;
        }
    }
    sel.innerHTML = opts;
    sel.style.display = '';
    loadFinances();
}

function onFinPeriodSelect(val) {
    finPeriodValue = val;
    loadFinances();
}

function initFinances() {
    // Period buttons now handled by onclick in HTML
    // Salary payment modal
    document.getElementById('btn-salary-payout')?.addEventListener('click', () => openSalaryPaymentModal());
    document.getElementById('modal-salary-payment-close')?.addEventListener('click', () => closeModal('modal-salary-payment'));
    document.getElementById('btn-cancel-salary-payment')?.addEventListener('click', () => closeModal('modal-salary-payment'));
    document.getElementById('btn-confirm-salary-payment')?.addEventListener('click', confirmSalaryPayment);
    document.getElementById('salary-pay-employee')?.addEventListener('change', function() { updateSalaryPayInfo(this.value); });
}

function loadFinances(period) {
    if (!period) period = finPeriodType || 'week';

    let startDate, endDate;
    if (finPeriodValue && period === 'week') {
        const ws = new Date(finPeriodValue + 'T00:00:00');
        startDate = finPeriodValue;
        const we = new Date(ws); we.setDate(ws.getDate() + 6);
        endDate = `${we.getFullYear()}-${String(we.getMonth()+1).padStart(2,'0')}-${String(we.getDate()).padStart(2,'0')}`;
    } else if (finPeriodValue && period === 'month') {
        const [y, m] = finPeriodValue.split('-').map(Number);
        startDate = `${y}-${String(m).padStart(2,'0')}-01`;
        endDate = `${y}-${String(m).padStart(2,'0')}-${String(new Date(y, m, 0).getDate()).padStart(2,'0')}`;
    } else if (finPeriodValue && period === 'year') {
        startDate = `${finPeriodValue}-01-01`;
        endDate = `${finPeriodValue}-12-31`;
    } else {
        ({ startDate, endDate } = getDateRangeForPeriod(period));
    }

    // === 1. INCOME: completed events in period ===
    const allEvents = DB.get('events', []);
    const completedEvents = allEvents.filter(e =>
        e.status === 'completed' && e.date >= startDate && e.date <= endDate
    );
    const totalIncome = completedEvents.reduce((sum, e) => sum + (e.price || e.totalPrice || 0), 0);

    // === 2. CONSUMABLES: only actual purchases (incoming documents) ===
    const docs = DB.get('documents', []).filter(d =>
        d.type === 'incoming' && d.date >= startDate && d.date <= endDate
    );
    const totalConsumablesCost = docs.reduce((sum, d) => sum + (d.amount || 0), 0);

    // === 3. SALARIES: payments made in this period ===
    const employees = DB.get('employees', []).filter(e => e.role !== 'director');
    let periodSalariesPaid = 0;
    const salaryRows = [];
    employees.forEach(emp => {
        const periodPaid = getEmployeePaymentsForPeriod(emp.id, period).totalPaid;
        periodSalariesPaid += periodPaid;
        if (periodPaid > 0) {
            salaryRows.push({
                name: emp.firstName + ' ' + emp.lastName,
                role: getRoleName(emp.role),
                paid: periodPaid
            });
        }
    });

    // === 4. CERTIFICATES: sold in this period ===
    const allCerts = DB.get('certificates', []);
    const periodCerts = allCerts.filter(c => c.createdDate >= startDate && c.createdDate <= endDate);
    const totalCertIncome = periodCerts.reduce((sum, c) => sum + (c.initialAmount || 0), 0);

    const totalExpenses = totalConsumablesCost + periodSalariesPaid;
    const totalBalance = totalIncome + totalCertIncome - totalExpenses;

    // === UPDATE CARDS ===
    document.getElementById('fin-income').textContent = formatMoney(totalIncome);
    document.getElementById('fin-cert-income').textContent = formatMoney(totalCertIncome);
    document.getElementById('fin-consumables').textContent = formatMoney(totalConsumablesCost);
    document.getElementById('fin-salaries').textContent = formatMoney(periodSalariesPaid);

    const balEl = document.getElementById('fin-balance');
    balEl.textContent = (totalBalance >= 0 ? '+' : '') + formatMoney(totalBalance);
    balEl.className = 'fin-card-value ' + (totalBalance > 0 ? 'green' : totalBalance < 0 ? 'red' : '');

    // === EVENTS TABLE ===
    const evtBody = document.getElementById('fin-events-body');
    if (completedEvents.length === 0) {
        evtBody.innerHTML = '<tr><td colspan="6" class="empty-state">Нет мероприятий за период</td></tr>';
    } else {
        evtBody.innerHTML = completedEvents.slice().sort((a, b) => b.date.localeCompare(a.date)).map(ev => {
            const methodName = ev.paymentDetails ? getPaymentMethodName(ev.paymentDetails.method) : '—';
            return `<tr>
                <td>${ev.date}</td>
                <td>${ev.clientName || '—'}</td>
                <td>${ev.title || getEventTypeName(ev.type)}</td>
                <td>${ev.participants || '—'}</td>
                <td style="color:var(--green);font-weight:600">${formatMoney(ev.price || ev.totalPrice || 0)}</td>
                <td>${methodName}</td>
            </tr>`;
        }).join('');
    }

    // === CONSUMABLES TABLE (only purchases) ===
    const consBody = document.getElementById('fin-consumables-body');
    if (docs.length === 0) {
        consBody.innerHTML = '<tr><td colspan="5" class="empty-state">Нет закупок за период</td></tr>';
    } else {
        let html = docs.map(d => `<tr>
            <td>${d.date}</td>
            <td>${d.item || '—'}</td>
            <td colspan="2">${d.qty || '—'} шт.</td>
            <td style="color:var(--red);font-weight:600">${formatMoney(d.amount || 0)}</td>
        </tr>`).join('');
        html += `<tr style="font-weight:700;border-top:2px solid var(--border);">
            <td colspan="4" style="text-align:right;">Итого закупки:</td>
            <td style="color:var(--red);">${formatMoney(totalConsumablesCost)}</td>
        </tr>`;
        consBody.innerHTML = html;
    }

    // === SALARIES TABLE ===
    const salBody = document.getElementById('fin-salaries-body');
    if (salaryRows.length === 0) {
        salBody.innerHTML = '<tr><td colspan="3" class="empty-state">Нет выплат за период</td></tr>';
    } else {
        let html = salaryRows.map(r => `<tr>
            <td>${r.name}</td>
            <td>${r.role}</td>
            <td style="color:var(--green);font-weight:600">${formatMoney(r.paid)}</td>
        </tr>`).join('');
        html += `<tr style="font-weight:700;border-top:2px solid var(--border);">
            <td colspan="2" style="text-align:right;">Итого выплачено:</td>
            <td style="color:var(--green)">${formatMoney(periodSalariesPaid)}</td>
        </tr>`;
        salBody.innerHTML = html;
    }

    // === CERTIFICATES TABLE ===
    const certBody = document.getElementById('fin-certificates-body');
    if (periodCerts.length === 0) {
        certBody.innerHTML = '<tr><td colspan="5" class="empty-state">Нет проданных сертификатов за период</td></tr>';
    } else {
        let html = periodCerts.sort((a, b) => (b.createdDate || '').localeCompare(a.createdDate || '')).map(c => `<tr>
            <td>${c.createdDate}</td>
            <td style="color:var(--accent);font-weight:600">${c.number || '—'}</td>
            <td>${formatMoney(c.initialAmount || 0)}</td>
            <td>${c.buyerName || '—'}</td>
            <td>${getPaymentMethodName(c.paymentMethod)}</td>
        </tr>`).join('');
        html += `<tr style="font-weight:700;border-top:2px solid var(--border);">
            <td colspan="2" style="text-align:right;">Итого продано:</td>
            <td style="color:var(--green)">${formatMoney(totalCertIncome)}</td>
            <td colspan="2">${periodCerts.length} шт.</td>
        </tr>`;
        certBody.innerHTML = html;
    }
}

// ===== CERTIFICATES =====
let certFilter = 'all';

function initCertificates() {
    document.getElementById('btn-add-certificate').addEventListener('click', () => openCertificateModal());
    document.getElementById('modal-cert-close').addEventListener('click', () => closeModal('modal-certificate'));
    document.getElementById('btn-cancel-cert').addEventListener('click', () => closeModal('modal-certificate'));
    document.getElementById('certificate-form').addEventListener('submit', saveCertificate);
}

function generateCertNumber(type) {
    const prefix = type === 'paper' ? 'БС' : 'ЭС';
    const certs = DB.get('certificates', []);
    const year = new Date().getFullYear();
    let maxNum = 0;
    certs.forEach(c => {
        const match = c.number && c.number.match(/(ЭС|БС|HP)-\d+-(\d+)/);
        if (match) maxNum = Math.max(maxNum, parseInt(match[2]) || 0);
    });
    return `${prefix}-${year}-${String(maxNum + 1).padStart(4, '0')}`;
}

function onCertTypeChange() {
    const type = document.querySelector('input[name="cert-type"]:checked').value;
    const numField = document.getElementById('cert-number');
    // Only regenerate if number matches auto-generated pattern
    if (!numField.value || /^(ЭС|БС|HP)-\d+-\d+$/.test(numField.value)) {
        numField.value = generateCertNumber(type);
    }
    numField.placeholder = type === 'paper' ? 'БС-2026-0001' : 'ЭС-2026-0001';
}

function openCertificateModal(certId) {
    const cert = certId ? DB.get('certificates', []).find(c => c.id === certId) : null;
    document.getElementById('modal-cert-title').textContent = cert ? 'Редактирование сертификата' : 'Новый сертификат';
    document.getElementById('cert-id').value = cert ? cert.id : '';

    // Set cert type
    const certType = cert ? (cert.certType || 'electronic') : 'electronic';
    document.querySelectorAll('input[name="cert-type"]').forEach(r => {
        r.checked = r.value === certType;
    });

    document.getElementById('cert-number').value = cert ? cert.number : generateCertNumber(certType);
    document.getElementById('cert-number').placeholder = certType === 'paper' ? 'БС-2026-0001' : 'ЭС-2026-0001';
    document.getElementById('cert-amount').value = cert ? cert.initialAmount : '';

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const sixMonths = new Date(today); sixMonths.setMonth(sixMonths.getMonth() + 6);
    const sixMonthsStr = `${sixMonths.getFullYear()}-${String(sixMonths.getMonth()+1).padStart(2,'0')}-${String(sixMonths.getDate()).padStart(2,'0')}`;

    document.getElementById('cert-date').value = cert ? cert.createdDate : todayStr;
    document.getElementById('cert-expiry').value = cert ? cert.expiryDate : sixMonthsStr;
    document.getElementById('cert-buyer-name').value = cert ? (cert.buyerName || '') : '';
    document.getElementById('cert-buyer-phone').value = cert ? (cert.buyerPhone || '') : '';
    document.getElementById('cert-note').value = cert ? (cert.note || '') : '';

    const paymentMethod = cert ? cert.paymentMethod : 'cash';
    document.querySelectorAll('input[name="cert-payment"]').forEach(r => {
        r.checked = r.value === paymentMethod;
    });

    // Usage history
    const historyBlock = document.getElementById('cert-usage-history');
    const historyBody = document.getElementById('cert-usage-body');
    if (cert && cert.usageHistory && cert.usageHistory.length > 0) {
        historyBlock.style.display = '';
        historyBody.innerHTML = cert.usageHistory.map(u => `<tr>
            <td>${u.date}</td>
            <td>${u.eventTitle || '—'}</td>
            <td style="color:var(--accent);font-weight:600">${formatMoney(u.amount)}</td>
        </tr>`).join('');
    } else {
        historyBlock.style.display = 'none';
        historyBody.innerHTML = '';
    }

    openModal('modal-certificate');
}

function saveCertificate(e) {
    e.preventDefault();
    const certs = DB.get('certificates', []);
    const id = document.getElementById('cert-id').value;
    const initialAmount = parseFloat(document.getElementById('cert-amount').value) || 0;

    const data = {
        certType: document.querySelector('input[name="cert-type"]:checked').value,
        number: document.getElementById('cert-number').value.trim(),
        initialAmount: initialAmount,
        createdDate: document.getElementById('cert-date').value,
        expiryDate: document.getElementById('cert-expiry').value,
        buyerName: document.getElementById('cert-buyer-name').value.trim(),
        buyerPhone: document.getElementById('cert-buyer-phone').value.trim(),
        paymentMethod: document.querySelector('input[name="cert-payment"]:checked').value,
        note: document.getElementById('cert-note').value.trim(),
    };

    if (id) {
        const idx = certs.findIndex(c => c.id === parseInt(id));
        if (idx >= 0) {
            certs[idx] = { ...certs[idx], ...data };
        }
    } else {
        data.id = Date.now();
        data.remainingAmount = initialAmount;
        data.status = 'active';
        data.usageHistory = [];
        certs.push(data);
    }

    DB.set('certificates', certs);
    closeModal('modal-certificate');
    loadCertificates();
    showToast('Сертификат сохранён');
}

function deleteCertificate(certId) {
    showConfirm('Удалить сертификат?', 'Это действие нельзя отменить', () => {
        let certs = DB.get('certificates', []);
        certs = certs.filter(c => c.id !== certId);
        DB.set('certificates', certs);
        loadCertificates();
        showToast('Сертификат удалён');
    });
}

function filterCertificates(filter) {
    certFilter = filter;
    document.querySelectorAll('.cert-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.certFilter === filter));
    loadCertificates();
}

function checkExpiredCertificates() {
    const certs = DB.get('certificates', []);
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    let changed = false;
    certs.forEach(c => {
        if (c.status === 'active' && c.expiryDate && c.expiryDate < todayStr) {
            c.status = 'expired';
            changed = true;
        }
    });
    if (changed) DB.set('certificates', certs);
}

function loadCertificates() {
    checkExpiredCertificates();
    const certs = DB.get('certificates', []);

    // Summary
    const active = certs.filter(c => c.status === 'active');
    const used = certs.filter(c => c.status === 'used');
    const expired = certs.filter(c => c.status === 'expired');

    document.getElementById('cert-active-count').textContent = active.length + ' шт';
    document.getElementById('cert-active-amount').textContent = formatMoney(active.reduce((s, c) => s + (c.remainingAmount || 0), 0));
    document.getElementById('cert-used-count').textContent = used.length + ' шт';
    document.getElementById('cert-used-amount').textContent = formatMoney(used.reduce((s, c) => s + (c.initialAmount || 0), 0));
    document.getElementById('cert-expired-count').textContent = expired.length + ' шт';
    document.getElementById('cert-expired-amount').textContent = formatMoney(expired.reduce((s, c) => s + (c.remainingAmount || 0), 0));

    // Filter
    let filtered = certs;
    if (certFilter !== 'all') filtered = certs.filter(c => c.status === certFilter);
    filtered.sort((a, b) => (b.createdDate || '').localeCompare(a.createdDate || ''));

    // Table
    const tbody = document.getElementById('cert-table-body');
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Нет сертификатов</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(c => {
        const statusClass = c.status === 'active' ? 'cert-status-active' : c.status === 'used' ? 'cert-status-used' : 'cert-status-expired';
        const statusName = c.status === 'active' ? 'Активен' : c.status === 'used' ? 'Использован' : 'Просрочен';
        const typeName = c.certType === 'paper' ? '📄' : '💻';
        return `<tr>
            <td style="font-size:18px;text-align:center" title="${c.certType === 'paper' ? 'Бумажный' : 'Электронный'}">${typeName}</td>
            <td style="font-weight:600;color:var(--accent)">${c.number || '—'}</td>
            <td>${c.createdDate || '—'}</td>
            <td>${formatMoney(c.initialAmount || 0)}</td>
            <td style="font-weight:600;${c.remainingAmount > 0 ? 'color:var(--green)' : ''}">${formatMoney(c.remainingAmount || 0)}</td>
            <td><span class="cert-status-badge ${statusClass}">${statusName}</span></td>
            <td>${c.buyerName || '—'}</td>
            <td>
                <button class="btn-icon" onclick="openCertificateModal(${c.id})" title="Редактировать"><span class="material-icons-round">edit</span></button>
                <button class="btn-icon" onclick="deleteCertificate(${c.id})" title="Удалить"><span class="material-icons-round">delete</span></button>
            </td>
        </tr>`;
    }).join('');
}

// === Certificate autocomplete in event modal ===
function onCertNumberInput(val) {
    const list = document.getElementById('cert-autocomplete');
    if (!list) return;
    const certs = DB.get('certificates', []).filter(c => c.status === 'active');

    if (!val && certs.length === 0) { list.style.display = 'none'; return; }

    const filtered = val ? certs.filter(c => c.number.toLowerCase().includes(val.toLowerCase())) : certs;

    if (filtered.length === 0) {
        list.style.display = 'none';
        document.getElementById('evt-cert-remaining').textContent = '';
        return;
    }

    list.style.display = '';
    list.innerHTML = filtered.map(c =>
        `<div class="cert-autocomplete-item" onclick="selectCertForEvent(${c.id})">
            <span style="font-weight:600;color:var(--accent)">${c.number}</span>
            <span>Остаток: ${formatMoney(c.remainingAmount || 0)}</span>
            ${c.buyerName ? `<span style="color:var(--text-secondary);font-size:11px">${c.buyerName}</span>` : ''}
        </div>`
    ).join('');
}

function selectCertForEvent(certId) {
    const cert = DB.get('certificates', []).find(c => c.id === certId);
    if (!cert) return;

    document.getElementById('evt-certificate-number').value = cert.number;
    document.getElementById('evt-certificate-amount').value = cert.remainingAmount || 0;
    document.getElementById('evt-cert-remaining').textContent = `Остаток на сертификате: ${formatMoney(cert.remainingAmount || 0)}`;
    document.getElementById('cert-autocomplete').style.display = 'none';

    // Store cert id for later use when saving
    document.getElementById('evt-certificate-number').dataset.certId = certId;

    recalcEventTotal();
}

// Close autocomplete on click outside
document.addEventListener('click', (e) => {
    const list = document.getElementById('cert-autocomplete');
    if (list && !e.target.closest('#evt-certificate-row')) {
        list.style.display = 'none';
    }
});

// === Certificate redemption when event is completed ===
function redeemCertificateForEvent(eventData) {
    if (eventData.discountType !== 'certificate' || !eventData.certificateAmount) return;

    const certNumber = eventData.certificateNumber;
    if (!certNumber) return;

    const certs = DB.get('certificates', []);
    const idx = certs.findIndex(c => c.number === certNumber && c.status === 'active');
    if (idx < 0) return; // Certificate not found or not active

    const redeemAmount = Math.min(eventData.certificateAmount, certs[idx].remainingAmount || 0);
    if (redeemAmount <= 0) return;

    certs[idx].remainingAmount = (certs[idx].remainingAmount || 0) - redeemAmount;
    if (!certs[idx].usageHistory) certs[idx].usageHistory = [];
    certs[idx].usageHistory.push({
        date: eventData.date,
        eventId: eventData.id,
        eventTitle: eventData.title || eventData.clientName || 'Мероприятие',
        amount: redeemAmount
    });

    if (certs[idx].remainingAmount <= 0) {
        certs[idx].remainingAmount = 0;
        certs[idx].status = 'used';
    }

    DB.set('certificates', certs);
}

// ===== DOCUMENTS =====
function initDocuments() {
    document.querySelectorAll('.doc-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.doc-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadDocuments(tab.dataset.doc);
        });
    });
    document.getElementById('btn-add-document').addEventListener('click', () => openDocumentModal());
    document.getElementById('modal-document-close').addEventListener('click', () => closeModal('modal-document'));
    document.getElementById('btn-cancel-document').addEventListener('click', () => closeModal('modal-document'));
    document.getElementById('document-form').addEventListener('submit', saveDocument);

    // Doc item: select consumable or enter custom
    document.getElementById('doc-item-select').addEventListener('change', function() {
        const input = document.getElementById('doc-item');
        if (this.value === '__custom') {
            input.style.display = '';
            input.value = '';
            input.focus();
        } else {
            input.style.display = 'none';
            input.value = this.value;
        }
    });
}

function loadDocuments(tab = 'incoming') {
    const docs = DB.get('documents', []).filter(d => d.type === tab);
    const thead = document.getElementById('doc-table-head');
    const tbody = document.getElementById('doc-table-body');

    thead.innerHTML = '<tr><th>Дата</th><th>Наименование</th><th>Кол-во</th><th>Сумма</th><th>Комментарий</th><th>Действия</th></tr>';
    tbody.innerHTML = docs.map(d => `
        <tr>
            <td>${d.date}</td><td>${d.item}</td><td>${d.qty}</td><td>${formatMoney(d.amount)}</td><td>${d.comment || '—'}</td>
            <td>
                <button class="btn-action" onclick="openDocumentModal('${d.id}')" title="Редактировать">
                    <span class="material-icons-round">edit</span>
                </button>
                <button class="btn-action danger" onclick="deleteDocument('${d.id}')" title="Удалить">
                    <span class="material-icons-round">delete</span>
                </button>
            </td>
        </tr>
    `).join('') || `<tr><td colspan="6" class="empty-state">Нет документов</td></tr>`;
}

function openDocumentModal(id = null) {
    const form = document.getElementById('document-form');
    form.reset();
    document.getElementById('doc-id').value = '';
    if (id) {
        const doc = DB.get('documents', []).find(d => String(d.id) === String(id));
        if (!doc) return;
        document.getElementById('modal-document-title').textContent = 'Редактировать документ';
        document.getElementById('doc-id').value = doc.id;
        document.getElementById('doc-type').value = doc.type;
        document.getElementById('doc-date').value = doc.date;
        document.getElementById('doc-item').value = doc.item;
        document.getElementById('doc-qty').value = doc.qty;
        document.getElementById('doc-amount').value = doc.amount;
        document.getElementById('doc-comment').value = doc.comment || '';
        // Set select to matching option or "custom"
        const sel = document.getElementById('doc-item-select');
        const match = [...sel.options].find(o => o.value === doc.item);
        if (match) {
            sel.value = doc.item;
            document.getElementById('doc-item').style.display = 'none';
        } else {
            sel.value = '__custom';
            document.getElementById('doc-item').style.display = '';
        }
    } else {
        document.getElementById('modal-document-title').textContent = 'Новый документ';
        document.getElementById('doc-date').value = todayLocal();
        document.getElementById('doc-item-select').value = '';
        document.getElementById('doc-item').style.display = 'none';
        document.getElementById('doc-item').value = '';
    }
    openModal('modal-document');
}

function saveDocument(e) {
    e.preventDefault();
    const docs = DB.get('documents', []);
    const id = document.getElementById('doc-id').value;
    const data = {
        type: document.getElementById('doc-type').value,
        date: document.getElementById('doc-date').value,
        item: document.getElementById('doc-item').value.trim(),
        qty: parseInt(document.getElementById('doc-qty').value) || 0,
        amount: parseFloat(document.getElementById('doc-amount').value) || 0,
        comment: document.getElementById('doc-comment').value.trim(),
    };
    if (id) {
        const idx = docs.findIndex(d => d.id === parseInt(id));
        if (idx >= 0) docs[idx] = { ...docs[idx], ...data };
    } else {
        data.id = Date.now();
        docs.push(data);
    }
    DB.set('documents', docs);

    // Auto-update stock when saving incoming/outgoing document for consumables
    const stockKeyMap = {
        'Пейнтбольные шары 0.68': 'balls',
        'Детские пейнтбольные шары 0.50': 'kidsBalls',
        'Гранаты': 'grenades',
        'Дымы': 'smokes'
    };
    const stockKey = stockKeyMap[data.item];
    if (stockKey && data.qty > 0) {
        const stock = DB.get('stock', {});
        const current = stock[stockKey] || 0;
        if (data.type === 'incoming') {
            stock[stockKey] = current + data.qty;
            DB.set('stock', stock);
        } else if (data.type === 'outgoing' || data.type === 'writeoff') {
            stock[stockKey] = Math.max(0, current - data.qty);
            DB.set('stock', stock);
        }
    }

    closeModal('modal-document');
    loadDocuments(data.type);
    showToast('Документ сохранён');
}

function deleteDocument(id) {
    showConfirm('Удалить документ?', 'Это действие нельзя отменить', () => {
        let docs = DB.get('documents', []);
        docs = docs.filter(d => d.id !== id);
        DB.set('documents', docs);
        loadDocuments();
        showToast('Документ удалён');
    });
}

// ===== CLIENTS =====
function initClients() {
    document.getElementById('btn-add-client').addEventListener('click', () => openClientModal());
    document.getElementById('modal-client-close').addEventListener('click', () => closeModal('modal-client'));
    document.getElementById('btn-cancel-client').addEventListener('click', () => closeModal('modal-client'));
    document.getElementById('client-form').addEventListener('submit', saveClient);

    document.getElementById('client-search').addEventListener('input', (e) => {
        loadClients(e.target.value);
    });

    document.getElementById('btn-loyalty-settings').addEventListener('click', () => {
        const pct = DB.get('loyaltyPercent', 5);
        document.getElementById('loyalty-range').value = pct;
        document.getElementById('loyalty-range-value').textContent = pct + '%';
        document.getElementById('loyalty-example').textContent = Math.round(1000 * pct / 100);
        openModal('modal-loyalty');
    });
    document.getElementById('modal-loyalty-close').addEventListener('click', () => closeModal('modal-loyalty'));
    document.getElementById('loyalty-range').addEventListener('input', (e) => {
        const v = e.target.value;
        document.getElementById('loyalty-range-value').textContent = v + '%';
        document.getElementById('loyalty-example').textContent = Math.round(1000 * v / 100);
    });
    document.getElementById('btn-save-loyalty').addEventListener('click', () => {
        const pct = parseInt(document.getElementById('loyalty-range').value);
        DB.set('loyaltyPercent', pct);
        document.getElementById('loyalty-percent').textContent = pct;
        closeModal('modal-loyalty');
        showToast('Процент начисления обновлён: ' + pct + '%');
    });

    document.getElementById('btn-add-groldiks').addEventListener('click', () => {
        const clientId = parseInt(document.getElementById('client-id').value);
        const amount = parseInt(document.getElementById('client-groldik-change').value) || 0;
        if (amount <= 0) return;
        const clients = DB.get('clients', []);
        const client = clients.find(c => String(c.id) === String(clientId));
        if (client) {
            client.groldiks = (client.groldiks || 0) + amount;
            DB.set('clients', clients);
            document.getElementById('client-groldiks').textContent = client.groldiks;
            document.getElementById('client-groldik-change').value = '';
            showToast(`+${amount} Грольдиков начислено`);
        }
    });

    document.getElementById('btn-spend-groldiks').addEventListener('click', () => {
        const clientId = parseInt(document.getElementById('client-id').value);
        const amount = parseInt(document.getElementById('client-groldik-change').value) || 0;
        if (amount <= 0) return;
        const clients = DB.get('clients', []);
        const client = clients.find(c => String(c.id) === String(clientId));
        if (client) {
            if (amount > (client.groldiks || 0)) {
                showToast('Недостаточно Грольдиков', 'error');
                return;
            }
            client.groldiks = (client.groldiks || 0) - amount;
            DB.set('clients', clients);
            document.getElementById('client-groldiks').textContent = client.groldiks;
            document.getElementById('client-groldik-change').value = '';
            showToast(`-${amount} Грольдиков списано`);
        }
    });
}

function loadClients(search = '') {
    const pct = DB.get('loyaltyPercent', 5);
    document.getElementById('loyalty-percent').textContent = pct;

    let clients = DB.get('clients', []);
    if (search) {
        const q = search.toLowerCase();
        clients = clients.filter(c =>
            (c.firstName + ' ' + c.lastName).toLowerCase().includes(q) ||
            (c.phone || '').includes(q)
        );
    }

    const tbody = document.getElementById('clients-table-body');
    tbody.innerHTML = clients.map(c => `
        <tr>
            <td><strong>${c.firstName} ${c.lastName || ''}</strong></td>
            <td>${c.phone || '—'}</td>
            <td>${c.visits && c.visits.length ? c.visits[0].date : '—'}</td>
            <td>${c.visits ? c.visits.map(v => v.game).join(', ') : '—'}</td>
            <td>${formatMoney(c.totalSpent || 0)}</td>
            <td><span style="color:var(--accent);font-weight:700">${c.groldiks || 0} G</span></td>
            <td>
                <button class="btn-action" onclick="openClientModal('${c.id}')" title="Подробнее">
                    <span class="material-icons-round">edit</span>
                </button>
                <button class="btn-action danger" onclick="deleteClient('${c.id}')" title="Удалить">
                    <span class="material-icons-round">delete</span>
                </button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="7" class="empty-state">Клиенты не найдены</td></tr>';
}

function openClientModal(id = null) {
    const form = document.getElementById('client-form');
    form.reset();
    document.getElementById('client-id').value = '';
    document.getElementById('client-history').style.display = 'none';
    document.getElementById('client-loyalty-card').style.display = 'none';

    if (id) {
        const client = DB.get('clients', []).find(c => String(c.id) === String(id));
        if (!client) return;
        document.getElementById('modal-client-title').textContent = client.firstName + ' ' + (client.lastName || '');
        document.getElementById('client-id').value = client.id;
        document.getElementById('client-first-name').value = client.firstName;
        document.getElementById('client-last-name').value = client.lastName || '';
        document.getElementById('client-phone').value = client.phone || '';
        document.getElementById('client-email').value = client.email || '';
        document.getElementById('client-dob').value = client.dob || '';
        document.getElementById('client-notes').value = client.notes || '';

        if (client.visits && client.visits.length) {
            document.getElementById('client-history').style.display = 'block';
            document.getElementById('client-history-list').innerHTML = client.visits.map(v => `
                <div class="list-item">
                    <span class="material-icons-round">sports_esports</span>
                    <div class="list-item-info">
                        <strong>${v.game}</strong>
                        <span>${v.date}</span>
                    </div>
                    <span>${formatMoney(v.amount)}</span>
                </div>
            `).join('');
        }

        document.getElementById('client-loyalty-card').style.display = 'block';
        document.getElementById('client-groldiks').textContent = client.groldiks || 0;
    } else {
        document.getElementById('modal-client-title').textContent = 'Новый клиент';
    }

    openModal('modal-client');
}

function saveClient(e) {
    e.preventDefault();
    const clients = DB.get('clients', []);
    const id = document.getElementById('client-id').value;
    const data = {
        firstName: document.getElementById('client-first-name').value.trim(),
        lastName: document.getElementById('client-last-name').value.trim(),
        phone: document.getElementById('client-phone').value.trim(),
        email: document.getElementById('client-email').value.trim(),
        dob: document.getElementById('client-dob').value,
        notes: document.getElementById('client-notes').value.trim(),
    };
    if (id) {
        const idx = clients.findIndex(c => c.id === parseInt(id));
        if (idx >= 0) clients[idx] = { ...clients[idx], ...data };
    } else {
        data.id = Date.now();
        data.groldiks = 0;
        data.totalSpent = 0;
        data.visits = [];
        clients.push(data);
    }
    DB.set('clients', clients);
    closeModal('modal-client');
    loadClients();
    showToast('Клиент сохранён');

}

function deleteClient(id) {
    showConfirm('Удалить клиента?', 'Все данные клиента будут удалены', () => {
        let clients = DB.get('clients', []);
        clients = clients.filter(c => c.id !== id);
        DB.set('clients', clients);
        loadClients();
        showToast('Клиент удалён');
    });
}

// ===== SETTINGS =====

// Загрузка актуальных данных в форму настроек (вызывается при каждом переходе на страницу)
function loadSettingsData() {
    const rules = DB.get('salaryRules', {
        instructor: { shiftRate: 1500, bonusPercent: 5 },
        senior_instructor: { shiftRate: 2000, bonusPercent: 7 },
        admin: { shiftRate: 0, bonusPercent: 5 }
    });
    document.getElementById('rule-instructor-rate').value = rules.instructor?.shiftRate ?? 1500;
    document.getElementById('rule-instructor-bonus').value = rules.instructor?.bonusPercent ?? 5;
    document.getElementById('rule-senior-instructor-rate').value = rules.senior_instructor?.shiftRate ?? 2000;
    document.getElementById('rule-senior-instructor-bonus').value = rules.senior_instructor?.bonusPercent ?? 7;
    document.getElementById('rule-admin-rate').value = rules.admin?.shiftRate ?? 0;
    document.getElementById('rule-admin-bonus').value = rules.admin?.bonusPercent ?? 5;

    // Bonus sources checkboxes
    const instrSources = rules.instructor?.bonusSources || ['services', 'optionsForGame', 'options'];
    const seniorSources = rules.senior_instructor?.bonusSources || ['services', 'optionsForGame', 'options'];
    const adminSources = rules.admin?.bonusSources || ['services', 'optionsForGame', 'options'];
    document.getElementById('rule-instructor-src-services').checked = instrSources.includes('services');
    document.getElementById('rule-instructor-src-optionsForGame').checked = instrSources.includes('optionsForGame');
    document.getElementById('rule-instructor-src-options').checked = instrSources.includes('options');
    document.getElementById('rule-senior-instructor-src-services').checked = seniorSources.includes('services');
    document.getElementById('rule-senior-instructor-src-optionsForGame').checked = seniorSources.includes('optionsForGame');
    document.getElementById('rule-senior-instructor-src-options').checked = seniorSources.includes('options');
    document.getElementById('rule-admin-src-services').checked = adminSources.includes('services');
    document.getElementById('rule-admin-src-optionsForGame').checked = adminSources.includes('optionsForGame');
    document.getElementById('rule-admin-src-options').checked = adminSources.includes('options');

    // Manager weekly rate
    document.getElementById('rule-manager-daily-rate').value = rules.manager?.dailyRate ?? 360;

    // Stock
    const stock = DB.get('stock', { balls: 0, ballsCritical: 60000, grenades: 0, grenadesCritical: 100 });
    document.getElementById('set-balls').value = stock.balls || 0;
    document.getElementById('set-balls-critical').value = stock.ballsCritical || 60000;
    document.getElementById('set-kids-balls').value = stock.kidsBalls || 0;
    document.getElementById('set-kids-balls-critical').value = stock.kidsBallsCritical || 20000;
    document.getElementById('set-grenades').value = stock.grenades || 0;
    document.getElementById('set-grenades-critical').value = stock.grenadesCritical || 100;
    document.getElementById('set-smokes').value = stock.smokes || 0;
    document.getElementById('set-smokes-critical').value = stock.smokesCritical || 50;

    // Manager assignment list
    loadManagerAssignment();
}

function loadManagerAssignment() {
    const employees = DB.get('employees', []).filter(e => e.role !== 'director');
    const container = document.getElementById('manager-assignment-list');
    if (!container) return;
    container.innerHTML = employees.map(emp => {
        const roles = emp.allowedShiftRoles || getDefaultAllowedRoles(emp.role);
        const isManager = roles.includes('manager');
        const sinceDate = emp.managerSince || '';
        return `<div class="manager-assign-row" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-color);">
            <label class="option-checkbox" style="flex-shrink:0;margin:0;">
                <input type="checkbox" data-emp-id="${emp.id}" class="manager-checkbox" ${isManager ? 'checked' : ''}>
                <span>${emp.firstName} ${emp.lastName}</span>
                <span style="color:var(--text-secondary);font-size:12px;">(${getRoleName(emp.role)})</span>
            </label>
            <div class="manager-date-wrap" data-emp-id="${emp.id}" style="margin-left:auto;display:flex;align-items:center;gap:6px;${isManager ? '' : 'opacity:0.4;pointer-events:none;'}">
                <span style="font-size:12px;color:var(--text-secondary);">с</span>
                <input type="date" class="manager-since-date" data-emp-id="${emp.id}" value="${sinceDate}"
                    style="background:var(--bg-secondary);border:1px solid var(--border-color);color:var(--text-primary);border-radius:8px;padding:6px 10px;font-size:13px;">
            </div>
        </div>`;
    }).join('');

    // Toggle date input when checkbox changes
    container.querySelectorAll('.manager-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const empId = cb.dataset.empId;
            const dateWrap = container.querySelector(`.manager-date-wrap[data-emp-id="${empId}"]`);
            if (cb.checked) {
                dateWrap.style.opacity = '1';
                dateWrap.style.pointerEvents = '';
                const dateInput = dateWrap.querySelector('.manager-since-date');
                if (!dateInput.value) dateInput.value = todayLocal();
            } else {
                dateWrap.style.opacity = '0.4';
                dateWrap.style.pointerEvents = 'none';
            }
        });
    });
}

var _settingsInitialized = false;
function initSettings() {
    if (_settingsInitialized) return;
    _settingsInitialized = true;

    // Загрузить данные при инициализации
    loadSettingsData();

    document.getElementById('btn-save-salary-rules').addEventListener('click', () => {
        const instructorSources = [];
        if (document.getElementById('rule-instructor-src-services').checked) instructorSources.push('services');
        if (document.getElementById('rule-instructor-src-optionsForGame').checked) instructorSources.push('optionsForGame');
        if (document.getElementById('rule-instructor-src-options').checked) instructorSources.push('options');

        const seniorInstrSources = [];
        if (document.getElementById('rule-senior-instructor-src-services').checked) seniorInstrSources.push('services');
        if (document.getElementById('rule-senior-instructor-src-optionsForGame').checked) seniorInstrSources.push('optionsForGame');
        if (document.getElementById('rule-senior-instructor-src-options').checked) seniorInstrSources.push('options');

        const adminSrc = [];
        if (document.getElementById('rule-admin-src-services').checked) adminSrc.push('services');
        if (document.getElementById('rule-admin-src-optionsForGame').checked) adminSrc.push('optionsForGame');
        if (document.getElementById('rule-admin-src-options').checked) adminSrc.push('options');

        const newRules = {
            instructor: {
                shiftRate: parseFloat(document.getElementById('rule-instructor-rate').value) || 0,
                bonusPercent: parseFloat(document.getElementById('rule-instructor-bonus').value) || 0,
                bonusSources: instructorSources
            },
            senior_instructor: {
                shiftRate: parseFloat(document.getElementById('rule-senior-instructor-rate').value) || 0,
                bonusPercent: parseFloat(document.getElementById('rule-senior-instructor-bonus').value) || 0,
                bonusSources: seniorInstrSources
            },
            admin: {
                shiftRate: parseFloat(document.getElementById('rule-admin-rate').value) || 0,
                bonusPercent: parseFloat(document.getElementById('rule-admin-bonus').value) || 0,
                bonusSources: adminSrc
            },
            manager: {
                dailyRate: parseFloat(document.getElementById('rule-manager-daily-rate').value) || 360
            }
        };
        DB.set('salaryRules', newRules);
        showToast('Правила начисления зарплаты сохранены');
    });

    document.getElementById('btn-save-stock').addEventListener('click', () => {
        const newStock = {
            balls: parseInt(document.getElementById('set-balls').value) || 0,
            ballsCritical: parseInt(document.getElementById('set-balls-critical').value) || 60000,
            kidsBalls: parseInt(document.getElementById('set-kids-balls').value) || 0,
            kidsBallsCritical: parseInt(document.getElementById('set-kids-balls-critical').value) || 20000,
            grenades: parseInt(document.getElementById('set-grenades').value) || 0,
            grenadesCritical: parseInt(document.getElementById('set-grenades-critical').value) || 100,
            smokes: parseInt(document.getElementById('set-smokes').value) || 0,
            smokesCritical: parseInt(document.getElementById('set-smokes-critical').value) || 50,
        };
        DB.set('stock', newStock);
        loadStock();
        showToast('Данные склада обновлены');
    });

    // Manager assignment save
    document.getElementById('btn-save-manager-assignment').addEventListener('click', () => {
        const employees = DB.get('employees', []);
        const today = todayLocal();
        document.querySelectorAll('.manager-checkbox').forEach(cb => {
            const empId = parseInt(cb.dataset.empId);
            const emp = employees.find(e => e.id === empId);
            if (!emp) return;
            let roles = emp.allowedShiftRoles || getDefaultAllowedRoles(emp.role);
            const wasManager = roles.includes('manager');
            const dateInput = document.querySelector(`.manager-since-date[data-emp-id="${empId}"]`);
            const sinceDate = dateInput ? dateInput.value : today;
            if (cb.checked && !wasManager) {
                roles.push('manager');
                emp.managerSince = sinceDate || today;
                delete emp.managerUntil;
            } else if (cb.checked && wasManager) {
                // Update date if changed
                if (sinceDate) emp.managerSince = sinceDate;
            } else if (!cb.checked && wasManager) {
                roles = roles.filter(r => r !== 'manager');
                emp.managerUntil = today;
            }
            emp.allowedShiftRoles = roles;
        });
        DB.set('employees', employees);
        showToast('Назначения менеджера сохранены');
    });

    document.querySelectorAll('.color-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-opt').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const color = btn.dataset.color;
            DB.set('accentColor', color);
            applyAccentColor(color);
            showToast('Цвет обновлён');
        });
    });

    document.getElementById('btn-reset-data').addEventListener('click', () => {
        showConfirm('Сбросить все данные?', 'Все данные будут удалены без возможности восстановления', async () => {
            // Clear Firestore data
            if (DB._db) {
                try {
                    const dataRef = DB._db.collection('orgs').doc('holmgard').collection('data');
                    const snapshot = await dataRef.get();
                    const batch = DB._db.batch();
                    snapshot.docs.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                } catch (err) {
                    console.error('Firestore reset error:', err);
                }
            }
            // Clear localStorage
            Object.keys(localStorage).filter(k => k.startsWith('hp_')).forEach(k => localStorage.removeItem(k));
            DB._cache = {};
            initData();
            runDataMigrations();
            showToast('Данные сброшены');
            setTimeout(() => location.reload(), 500);
        });
    });

    // Google Calendar settings
    const gcalAppsScriptInput = document.getElementById('gcal-apps-script-url');
    const gcalClientIdInput = document.getElementById('gcal-client-id');
    const gcalCalendarIdInput = document.getElementById('gcal-calendar-id');

    // Apps Script URL (primary method)
    if (gcalAppsScriptInput) {
        gcalAppsScriptInput.value = GCalSync.getAppsScriptUrl() || '';
        gcalAppsScriptInput.addEventListener('change', () => {
            const url = gcalAppsScriptInput.value.trim();
            GCalSync.setAppsScriptUrl(url);
            if (url) {
                GCalSync.init();
                showToast('Проверяю подключение к Google Calendar...');
            }
        });
    }
    // Copy GAS code button
    document.getElementById('btn-copy-gas-code')?.addEventListener('click', () => {
        const code = GCalSync.getGasCode();
        navigator.clipboard.writeText(code).then(() => {
            showToast('Код скрипта скопирован в буфер обмена');
        }).catch(() => {
            // Fallback: create textarea
            const ta = document.createElement('textarea');
            ta.value = code;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('Код скрипта скопирован');
        });
    });
    // OAuth Client ID (fallback)
    if (gcalClientIdInput) {
        gcalClientIdInput.value = localStorage.getItem('hp_gcal_client_id') || '';
        gcalClientIdInput.addEventListener('change', () => {
            localStorage.setItem('hp_gcal_client_id', gcalClientIdInput.value.trim());
            GCalSync.init();
        });
    }
    if (gcalCalendarIdInput) {
        gcalCalendarIdInput.value = localStorage.getItem('hp_gcal_calendar_id') || 'primary';
        gcalCalendarIdInput.addEventListener('change', () => {
            const calId = gcalCalendarIdInput.value.trim() || 'primary';
            localStorage.setItem('hp_gcal_calendar_id', calId);
            GCalSync.setCalendarId(calId);
        });
    }
    document.getElementById('btn-connect-gcal').addEventListener('click', () => {
        if (GCalSync.isConnected()) {
            GCalSync.disconnect();
            if (gcalAppsScriptInput) gcalAppsScriptInput.value = '';
        } else if (GCalSync.getAppsScriptUrl()) {
            GCalSync.init();
        } else {
            GCalSync.authorize();
        }
    });
    // Google Sheets settings
    const gsheetsIdInput = document.getElementById('gsheets-spreadsheet-id');
    const gsheetsAutoSync = document.getElementById('gsheets-autosync');
    if (gsheetsIdInput) {
        gsheetsIdInput.value = GSheetsSync.getSpreadsheetId();
        gsheetsIdInput.addEventListener('change', () => {
            GSheetsSync.setSpreadsheetId(gsheetsIdInput.value.trim());
            GSheetsSync.init();
        });
    }
    if (gsheetsAutoSync) {
        gsheetsAutoSync.checked = GSheetsSync.getAutoSync();
        gsheetsAutoSync.addEventListener('change', () => {
            localStorage.setItem('hp_gsheets_autosync', gsheetsAutoSync.checked ? 'true' : 'false');
        });
    }
    const gsheetsBtn = document.getElementById('btn-connect-gsheets');
    if (gsheetsBtn) gsheetsBtn.addEventListener('click', async () => {
        showToast('Синхронизация с Google Sheets отключена. Firestore — единственный источник данных.');
    });
    // --- Sigma 8Ф — физическая касса, облачные настройки не нужны ---

    // Firebase Accounts management
    loadFirebaseAccounts();
}

function applyAccentColor(color) {
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-dim', color + '25');
    document.documentElement.style.setProperty('--accent-glow', color + '4D');
    if (document.querySelector('.page#page-dashboard.active')) loadDashboard();
}

// ===== HELPERS =====
function formatMoney(n) {
    return new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
}

function formatParticipants(evt) {
    const max = evt.players || evt.participants || 0;
    const min = evt.participantsMin;
    if (min && min < max) return `${min}–${max} чел.`;
    return `${max} чел.`;
}

function getRoleName(role) {
    const names = { director: 'Директор', admin: 'Администратор', senior_instructor: 'Старший инструктор', instructor: 'Инструктор', manager: 'Менеджер' };
    return names[role] || role;
}

function getEventTypeName(type) {
    const names = { paintball: 'Пейнтбол', laser: 'Лазертаг', kidball: 'Кидбол', quest: 'Квесты', sup: 'Сапы', atv: 'Квадроциклы', race: 'Гонка с препятствиями', rent: 'Аренда', other: 'Другое' };
    return names[type] || type;
}

function getChannelBadge(channel) {
    const badges = { wa: '🟢WA', tg: '🔵TG', vk: '🟣VK' };
    return channel && badges[channel] ? ` <span style="font-size:11px;font-weight:600;opacity:0.8;">${badges[channel]}</span>` : '';
}

// Normalize any service name (from events or client visits) to standard 8 service names
function normalizeServiceName(name) {
    if (!name) return null;
    const lower = name.toLowerCase();
    if (lower.includes('пейнтбол')) return 'Пейнтбол';
    if (lower.includes('лазертаг') || lower.includes('орбитаг')) return 'Лазертаг';
    if (lower.includes('кидбол')) return 'Кидбол';
    if (lower.includes('гонк') || lower.includes('препятств')) return 'Гонка с препятствиями';
    if (lower.includes('квадроцикл') || lower.includes('atv')) return 'Квадроциклы';
    if (lower.includes('сап')) return 'Сапы';
    if (lower.includes('аренд')) return 'Аренда';
    if (lower.includes('квест')) return 'Квесты';
    return null; // Skip unknown (e.g. "Мероприятие")
}

function getSourceBadge(ev) {
    if (ev.source === 'gcal') return '<span class="source-badge source-gcal" title="Создано в Google Calendar">📅 GCal</span>';
    if (ev.source === 'crm') return '<span class="source-badge source-crm" title="Создано в CRM">📱 CRM</span>';
    return '<span class="source-badge source-crm" title="CRM">📱 CRM</span>'; // default = CRM
}

// Map event type to tariff sheetCategory for filtering
const EVENT_TYPE_TARIFF_MAP = {
    paintball: ['Пейнтбол', 'Тир пейнтбольный'],
    laser: ['Лазертаг'],
    kidball: ['Кидбол'],
    quest: ['Квесты'],
    sup: ['Водная прогулка на Сап-бордах', 'Сапы'],
    atv: ['Квадроциклы'],
    race: ['Гонка с препятствиями'],
    rent: ['Аренда'],
};

function updateTariffsByType() {
    const type = document.getElementById('evt-type').value;
    const tariffSel = document.getElementById('evt-tariff');
    const currentVal = tariffSel.value;
    const allTariffs = DB.get('tariffs', []).filter(t => t.category === 'services');
    const allowedCategories = EVENT_TYPE_TARIFF_MAP[type];
    const filtered = allowedCategories
        ? allTariffs.filter(t => allowedCategories.includes(t.sheetCategory))
        : allTariffs;
    tariffSel.innerHTML = '<option value="">— Выберите тариф —</option>' +
        filtered.map(t => `<option value="${t.id}">${t.name} — ${formatMoney(t.price)}/${t.unit}</option>`).join('');
    // Restore previous value if still available
    if (currentVal && [...tariffSel.options].some(o => o.value === currentVal)) {
        tariffSel.value = currentVal;
    }
}

function getStatusName(status) {
    const names = { pending: 'Ожидает', confirmed: 'Подтверждено', completed: 'Выполнено', cancelled: 'Отменено' };
    return names[status] || status || 'Ожидает';
}

function getInstructorName(id) {
    const emp = DB.get('employees', []).find(e => String(e.id) === String(id));
    return emp ? emp.firstName + ' ' + emp.lastName : '—';
}

function getStaffNames(evt) {
    const emps = DB.get('employees', []);
    const names = [];
    const instrIds = evt.instructors || (evt.instructor ? [evt.instructor] : []);
    instrIds.forEach(id => {
        const emp = emps.find(e => e.id === id);
        if (emp) names.push(emp.firstName);
    });
    (evt.admins || []).forEach(id => {
        const emp = emps.find(e => e.id === id);
        if (emp) names.push(emp.firstName);
    });
    return names.length > 0 ? names.join(', ') : '';
}

function updateDate() {
    const now = moscowNow();
    const dateStr = now.toLocaleDateString('ru-RU', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    const topBarDate = document.getElementById('top-bar-date');
    if (topBarDate) topBarDate.textContent = dateStr;
}

// ===== DIRECTOR TARIFFS MANAGEMENT =====
let currentDirTariffTab = 'services';

function initDirectorTariffs() {
    const addBtn = document.getElementById('btn-add-tariff');
    if (addBtn) addBtn.addEventListener('click', () => openTariffModal());

    const closeBtn = document.getElementById('modal-tariff-close');
    if (closeBtn) closeBtn.addEventListener('click', () => closeModal('modal-tariff'));

    const cancelBtn = document.getElementById('btn-cancel-tariff');
    if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal('modal-tariff'));

    const deleteBtn = document.getElementById('btn-delete-tariff');
    if (deleteBtn) deleteBtn.addEventListener('click', () => {
        const id = parseInt(document.getElementById('tariff-id').value);
        if (!id) return;
        showConfirm('Удалить тариф?', 'Это действие нельзя отменить', () => {
            let tariffs = DB.get('tariffs', []);
            tariffs = tariffs.filter(t => t.id !== id);
            DB.set('tariffs', tariffs);
            closeModal('modal-tariff');
            loadDirectorTariffs();
            showToast('Тариф удалён');

        });
    });

    const form = document.getElementById('tariff-form');
    if (form) form.addEventListener('submit', saveTariff);

    // Director tariff tabs
    document.querySelectorAll('[data-dir-tariff-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('[data-dir-tariff-tab]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentDirTariffTab = tab.dataset.dirTariffTab;
            dirTariffSubcategory = null;
            loadDirectorTariffs();
        });
    });

    // Google Sheets sync button disabled
}

let dirTariffSubcategory = null;

function loadDirectorTariffs(subcategory = undefined) {
    const grid = document.getElementById('dir-tariffs-grid');
    if (!grid) return;

    // If services tab and no subcategory — show subcategory buttons
    if (currentDirTariffTab === 'services' && subcategory === undefined && dirTariffSubcategory === null) {
        const cats = getServiceSubcategories();
        if (cats.length === 0) {
            grid.innerHTML = '<p class="empty-state">Нет тарифов</p>';
            return;
        }
        grid.innerHTML = '<div class="tariff-subcategories">' + renderSubcategoryButtons(cats) + '</div>';
        grid.querySelectorAll('.tariff-subcategory-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                dirTariffSubcategory = btn.dataset.subcat;
                loadDirectorTariffs(btn.dataset.subcat);
            });
        });
        return;
    }

    const subcat = subcategory !== undefined ? subcategory : dirTariffSubcategory;
    const tariffs = DB.get('tariffs', []).filter(t => {
        if (currentDirTariffTab === 'services' && subcat) return t.category === 'services' && t.sheetCategory === subcat;
        return t.category === currentDirTariffTab;
    });

    if (tariffs.length === 0) {
        grid.innerHTML = '<p class="empty-state">Нет тарифов в этой категории</p>';
        return;
    }

    const backBtn = subcat ? `<button class="tariff-back-btn" id="dir-tariff-back"><span class="material-icons-round">arrow_back</span> ${subcat}</button>` : '';

    grid.innerHTML = backBtn + tariffs.map(t => `
        <div class="tariff-card tariff-card-editable" onclick="openTariffModal('${t.id}')">
            <div class="tariff-card-header">
                <h3>${t.name}</h3>
                <div class="tariff-price">${formatMoney(t.price)} <span class="tariff-unit">/ ${t.unit || 'чел'}</span></div>
            </div>
            <p class="tariff-description">${t.description || t.included || '—'}</p>
            <div class="tariff-meta">
                ${t.serviceId ? `<span><span class="material-icons-round">tag</span> ${t.serviceId}</span>` : ''}
                ${t.duration ? `<span><span class="material-icons-round">timer</span> ${t.duration} мин</span>` : ''}
                ${t.minPeople ? `<span><span class="material-icons-round">group</span> от ${t.minPeople} чел.</span>` : ''}
                ${t.age ? `<span><span class="material-icons-round">cake</span> ${t.age} лет</span>` : ''}
                ${t.ballsPerPerson ? `<span class="consumable-badge balls"><span class="material-icons-round">radio_button_unchecked</span> ${t.ballsPerPerson} шаров</span>` : ''}
                ${t.grenadesPerPerson ? `<span class="consumable-badge grenades"><span class="material-icons-round">brightness_7</span> ${t.grenadesPerPerson} гранат</span>` : ''}
                ${t.smokesPerPerson ? `<span class="consumable-badge grenades"><span class="material-icons-round">cloud</span> ${t.smokesPerPerson} дым</span>` : ''}
            </div>
            <div class="tariff-card-actions">
                <button class="btn-action" title="Редактировать">
                    <span class="material-icons-round">edit</span>
                </button>
            </div>
        </div>
    `).join('');

    const back = document.getElementById('dir-tariff-back');
    if (back) back.addEventListener('click', () => {
        dirTariffSubcategory = null;
        loadDirectorTariffs();
    });
}

function openTariffModal(id = null) {
    const form = document.getElementById('tariff-form');
    form.reset();
    document.getElementById('tariff-id').value = '';
    document.getElementById('btn-delete-tariff').style.display = 'none';
    document.getElementById('tariff-category').value = currentDirTariffTab;

    if (id) {
        const tariff = DB.get('tariffs', []).find(t => String(t.id) === String(id));
        if (!tariff) return;
        document.getElementById('modal-tariff-title').textContent = 'Редактировать тариф';
        document.getElementById('tariff-id').value = tariff.id;
        document.getElementById('tariff-category').value = tariff.category;
        document.getElementById('tariff-service-id').value = tariff.serviceId || '';
        document.getElementById('tariff-name').value = tariff.name;
        document.getElementById('tariff-price').value = tariff.price || '';
        document.getElementById('tariff-unit').value = tariff.unit || '';
        document.getElementById('tariff-duration').value = tariff.duration || '';
        document.getElementById('tariff-min-people').value = tariff.minPeople || '';
        document.getElementById('tariff-age').value = tariff.age || '';
        document.getElementById('tariff-included').value = tariff.included || '';
        document.getElementById('tariff-description').value = tariff.description || '';
        document.getElementById('tariff-balls').value = tariff.ballsPerPerson || '';
        document.getElementById('tariff-grenades').value = tariff.grenadesPerPerson || '';
        document.getElementById('btn-delete-tariff').style.display = 'inline-flex';
    } else {
        document.getElementById('modal-tariff-title').textContent = 'Новый тариф';
    }

    openModal('modal-tariff');
}

function saveTariff(e) {
    e.preventDefault();
    const tariffs = DB.get('tariffs', []);
    const id = document.getElementById('tariff-id').value;

    const data = {
        category: document.getElementById('tariff-category').value,
        serviceId: document.getElementById('tariff-service-id').value.trim(),
        name: document.getElementById('tariff-name').value.trim(),
        price: parseFloat(document.getElementById('tariff-price').value) || 0,
        unit: document.getElementById('tariff-unit').value.trim() || 'чел',
        duration: parseInt(document.getElementById('tariff-duration').value) || 0,
        minPeople: parseInt(document.getElementById('tariff-min-people').value) || 0,
        age: document.getElementById('tariff-age').value.trim(),
        included: document.getElementById('tariff-included').value.trim(),
        description: document.getElementById('tariff-description').value.trim(),
        ballsPerPerson: parseInt(document.getElementById('tariff-balls').value) || 0,
        grenadesPerPerson: parseInt(document.getElementById('tariff-grenades').value) || 0,
    };

    if (id) {
        const idx = tariffs.findIndex(t => t.id === parseInt(id));
        if (idx >= 0) tariffs[idx] = { ...tariffs[idx], ...data };
    } else {
        data.id = Date.now();
        tariffs.push(data);
    }

    DB.set('tariffs', tariffs);
    closeModal('modal-tariff');
    loadDirectorTariffs();
    showToast('Тариф сохранён');
}

// ===== MODALS =====
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
});

// ===== TOAST =====
let toastTimer = null;
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toast-icon');
    const msg = document.getElementById('toast-message');
    msg.textContent = message;
    icon.textContent = type === 'error' ? 'error' : 'check_circle';
    icon.style.color = type === 'error' ? 'var(--red)' : 'var(--green)';
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===== CONFIRM DIALOG =====
let confirmCallback = null;
function showConfirm(title, message, callback, okText) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const okBtn = document.getElementById('confirm-ok');
    okBtn.textContent = okText || 'Удалить';
    okBtn.className = okText ? 'btn-primary' : 'btn-danger';
    confirmCallback = callback;
    openModal('modal-confirm');
}

document.getElementById('confirm-ok').addEventListener('click', () => {
    closeModal('modal-confirm');
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
});
document.getElementById('confirm-cancel').addEventListener('click', () => {
    closeModal('modal-confirm');
    confirmCallback = null;
});

// ===== FIREBASE ACCOUNTS MANAGEMENT =====
function loadFirebaseAccounts() {
    const tbody = document.getElementById('firebase-accounts-body');
    if (!tbody) return;
    const employees = DB.get('employees', []);
    tbody.innerHTML = employees.map(emp => {
        const hasEmail = emp.email && emp.email.trim();
        const isBlocked = emp.blocked === true;
        let statusBadge, actions;

        if (!hasEmail) {
            statusBadge = '<span class="fb-status fb-status-none">Нет аккаунта</span>';
            actions = `<button class="btn-secondary btn-sm" onclick="openCreateAccountModal(${emp.id})">
                <span class="material-icons-round" style="font-size:16px;">person_add</span> Создать
            </button>`;
        } else if (isBlocked) {
            statusBadge = '<span class="fb-status fb-status-blocked">Заблокирован</span>';
            actions = `<button class="btn-secondary btn-sm" onclick="toggleBlockAccount(${emp.id}, false)">
                <span class="material-icons-round" style="font-size:16px;">lock_open</span> Разблокировать
            </button>
            <button class="btn-secondary btn-sm" onclick="resetEmployeePassword('${emp.email}')">
                <span class="material-icons-round" style="font-size:16px;">key</span>
            </button>`;
        } else {
            statusBadge = '<span class="fb-status fb-status-active">Активен</span>';
            actions = `<button class="btn-secondary btn-sm" onclick="toggleBlockAccount(${emp.id}, true)">
                <span class="material-icons-round" style="font-size:16px;">lock</span> Блокировать
            </button>
            <button class="btn-secondary btn-sm" onclick="resetEmployeePassword('${emp.email}')">
                <span class="material-icons-round" style="font-size:16px;">key</span>
            </button>`;
        }

        return `<tr>
            <td>${emp.firstName} ${emp.lastName}</td>
            <td>${hasEmail ? emp.email : '<span class="text-muted">—</span>'}</td>
            <td>${statusBadge}</td>
            <td>${actions}</td>
        </tr>`;
    }).join('');
}

var _fbAccountEmployeeId = null;

function openCreateAccountModal(empId) {
    const employees = DB.get('employees', []);
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;
    _fbAccountEmployeeId = empId;
    document.getElementById('fb-acc-name').value = emp.firstName + ' ' + emp.lastName;
    document.getElementById('fb-acc-email').value = '';
    document.getElementById('fb-acc-password').value = '';
    const errEl = document.getElementById('fb-acc-error');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    openModal('modal-fb-account');
}

function createFirebaseAccount() {
    const email = document.getElementById('fb-acc-email').value.trim();
    const password = document.getElementById('fb-acc-password').value;
    const errEl = document.getElementById('fb-acc-error');
    const btn = document.getElementById('fb-acc-create-btn');

    if (!email || !password) {
        if (errEl) { errEl.textContent = 'Заполните email и пароль'; errEl.style.display = 'block'; }
        return;
    }
    if (password.length < 6) {
        if (errEl) { errEl.textContent = 'Пароль должен быть не менее 6 символов'; errEl.style.display = 'block'; }
        return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Создание...'; }
    if (errEl) errEl.style.display = 'none';

    FirebaseAuth.createAccount(email, password)
        .then(function() {
            // Save email to employee
            linkEmailToEmployee(_fbAccountEmployeeId, email);
            closeModal('modal-fb-account');
            loadFirebaseAccounts();
            showToast('Аккаунт создан для ' + email);
        })
        .catch(function(errorMsg) {
            // If email already exists in Firebase Auth — offer to link it
            if (errorMsg && (errorMsg.indexOf('уже используется') !== -1 || errorMsg.indexOf('already') !== -1)) {
                showConfirm(
                    'Привязать существующий аккаунт?',
                    'Аккаунт с email ' + email + ' уже существует в Firebase. Привязать его к этому сотруднику?',
                    function() {
                        linkEmailToEmployee(_fbAccountEmployeeId, email);
                        closeModal('modal-fb-account');
                        loadFirebaseAccounts();
                        showToast('Аккаунт ' + email + ' привязан к сотруднику');
                    },
                    'Привязать'
                );
            } else {
                if (errEl) { errEl.textContent = errorMsg; errEl.style.display = 'block'; }
            }
        })
        .finally(function() {
            if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons-round">person_add</span> Создать'; }
        });
}

function linkEmailToEmployee(empId, email) {
    var employees = DB.get('employees', []);
    var idx = employees.findIndex(function(e) { return e.id === empId; });
    if (idx !== -1) {
        employees[idx].email = email;
        employees[idx].blocked = false;
        DB.set('employees', employees);
    }
}

function toggleBlockAccount(empId, block) {
    const employees = DB.get('employees', []);
    const idx = employees.findIndex(e => e.id === empId);
    if (idx === -1) return;
    employees[idx].blocked = block;
    DB.set('employees', employees);
    loadFirebaseAccounts();
    showToast(block ? 'Аккаунт заблокирован' : 'Аккаунт разблокирован');
}

function resetEmployeePassword(email) {
    if (!email) return;
    FirebaseAuth.resetPassword(email)
        .then(function() {
            showToast('Письмо для сброса пароля отправлено на ' + email);
        })
        .catch(function(errorMsg) {
            showToast('Ошибка: ' + errorMsg);
        });
}
