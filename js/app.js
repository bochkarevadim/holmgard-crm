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

// ===== DATA LAYER =====
// DB и FIRESTORE_KEYS определены в js/supabase-db.js (загружается до app.js).
// Здесь только алиасы для удобства обращения внутри app.js.
/* global DB, FIRESTORE_KEYS */

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
            senior_instructor: { shiftRate: 2000, bonusPercent: 7, bonusSources: ['services', 'optionsForGame'] },
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
            rules.senior_instructor = { shiftRate: 2000, bonusPercent: 7, bonusSources: ['services', 'optionsForGame'] };
            DB.set('salaryRules', rules);
        }
        DB.set('roles_version_v2', true);
    }

    // Migration: fix senior_instructor bonusPercent (was incorrectly set to 5 in initData)
    if (!DB.get('senior_instr_bonus_v1')) {
        const rules = DB.get('salaryRules', {});
        if (rules.senior_instructor && rules.senior_instructor.bonusPercent !== 7) {
            rules.senior_instructor.bonusPercent = 7;
            DB.set('salaryRules', rules);
        }
        DB.set('senior_instr_bonus_v1', true);
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

    // Migration v4: kidball tariffs use kidsBallsPerPerson (0.50 шары)
    if (DB.get('tariffs_version') !== 'v4') {
        let tariffs = DB.get('tariffs', []);
        tariffs.forEach(t => {
            if (t.category === 'services' && t.sheetCategory === 'Кидбол') {
                if (!t.kidsBallsPerPerson) {
                    // Default: безлимитные шары → ставим 300 на чел.
                    t.kidsBallsPerPerson = 300;
                }
                t.ballsPerPerson = 0;
            }
        });
        DB.set('tariffs', tariffs);
        DB.set('tariffs_version', 'v4');
        console.log('Migration v4: kidball tariffs got kidsBallsPerPerson');
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

// ===== FIX MISSING WRITEOFFS FOR COMPLETED EVENTS =====
function fixMissingWriteoffs() {
    const events = DB.get('events', []);
    const docs = DB.get('documents', []);
    const tariffs = DB.get('tariffs', []);
    const existingEventIds = new Set(docs.filter(d => d.type === 'writeoff' && d.eventId).map(d => String(d.eventId)));
    let stockChanged = false;
    const stock = DB.get('stock', {});
    let addedDocs = 0;

    events.forEach(evt => {
        if (evt.status !== 'completed') return;
        if (existingEventIds.has(String(evt.id))) return; // уже есть документы-списания
        // Если consumablesUsed уже записан но документов нет — пересоздадим документы (без повторного списания со склада)

        let totalBalls, totalKidsBalls, totalGrenades, totalSmokes;
        const alreadyDeducted = !!evt.consumablesUsed;

        if (alreadyDeducted) {
            // Склад уже списан, просто восстанавливаем документы
            totalBalls = evt.consumablesUsed.balls || 0;
            totalKidsBalls = evt.consumablesUsed.kidsBalls || 0;
            totalGrenades = evt.consumablesUsed.grenades || 0;
            totalSmokes = evt.consumablesUsed.smokes || 0;
        } else {
            // Пересчитать расходники и списать со склада
            totalBalls = 0; totalKidsBalls = 0; totalGrenades = 0; totalSmokes = 0;
            const isKidball = evt.type === 'kidball' || (evt.title || '').toLowerCase().includes('кидбол');
            // Support tariffGroups (multi-tariff) or fallback to single tariffId
            const evtGroups = evt.tariffGroups || (evt.tariffId ? [{ tariffId: evt.tariffId, participants: evt.participants || 1 }] : []);
            evtGroups.forEach(g => {
                if (!g.tariffId) return;
                const tariff = tariffs.find(t => String(t.id) === String(g.tariffId));
                if (!tariff) return;
                const ppl = g.participants || 1;
                const kbpp = tariff.kidsBallsPerPerson || 0;
                const bpp = tariff.ballsPerPerson || 0;
                if (kbpp > 0) totalKidsBalls += kbpp * ppl;
                else if (bpp > 0) { if (isKidball) totalKidsBalls += bpp * ppl; else totalBalls += bpp * ppl; }
                totalGrenades += (tariff.grenadesPerPerson || 0) * ppl;
                totalSmokes += (tariff.smokesPerPerson || 0) * ppl;
            });
            if (evt.selectedOptions && evt.selectedOptions.length > 0) {
                evt.selectedOptions.forEach(optId => {
                    const opt = tariffs.find(t => String(t.id) === String(optId));
                    if (opt) {
                        const qty = evt.optionQuantities?.[optId] || 1;
                        const ppl = evt.participants || 1;
                        const kbpp = opt.kidsBallsPerPerson || 0;
                        const bpp = opt.ballsPerPerson || 0;
                        if (kbpp > 0) totalKidsBalls += kbpp * qty * ppl;
                        else if (bpp > 0) { if (isKidball) totalKidsBalls += bpp * qty * ppl; else totalBalls += bpp * qty * ppl; }
                        totalGrenades += (opt.grenadesPerPerson || 0) * qty;
                        totalSmokes += (opt.smokesPerPerson || 0) * qty;
                    }
                });
            }
            if (totalBalls > 0 || totalKidsBalls > 0 || totalGrenades > 0 || totalSmokes > 0) {
                stockChanged = true;
            }
            evt.consumablesUsed = { balls: totalBalls, kidsBalls: totalKidsBalls, grenades: totalGrenades, smokes: totalSmokes };
        }

        if (totalBalls === 0 && totalKidsBalls === 0 && totalGrenades === 0 && totalSmokes === 0) return;

        // Создать документы-списания
        const evtDate = evt.date || todayLocal();
        const evtName = evt.title || 'Мероприятие';
        const writeoffItems = [
            { item: 'Пейнтбольные шары 0.68', qty: totalBalls },
            { item: 'Детские пейнтбольные шары 0.50', qty: totalKidsBalls },
            { item: 'Гранаты', qty: totalGrenades },
            { item: 'Дымы', qty: totalSmokes }
        ];
        writeoffItems.forEach(wi => {
            if (wi.qty > 0) {
                docs.push({
                    id: Date.now() + Math.random(),
                    type: 'writeoff',
                    date: evtDate,
                    item: wi.item,
                    qty: wi.qty,
                    amount: 0,
                    delivery: 0,
                    comment: `Авто (восст.): ${evtName} (${evt.participants || 0} чел.)`,
                    eventId: evt.id
                });
                addedDocs++;
            }
        });
    });

    if (addedDocs > 0) {
        DB.set('documents', docs);
        DB.set('events', events);
        console.log('fixMissingWriteoffs: created ' + addedDocs + ' writeoff documents');
    }
}

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
// === ONE-TIME SALARY IMPORT FROM EXCEL ===
function importSalaryPaymentsFromExcel() {
    const v3Done = DB.get('salary_import_v3', false);
    if (v3Done) return;
    const CUTOFF = '2026-04-05';
    const IMPORT_EMP_IDS = new Set([2, 3, 4, 5]);
    const importAccruals = [
        {id:"h1800000000001",employeeId:3,employeeName:"Елена Бундзен",date:"2025-05-25",amount:19550,note:"Историческое начисление: 19.05-25.05 2025"},
        {id:"h1800000000002",employeeId:5,employeeName:"Ольга Гусакова",date:"2025-05-25",amount:5550,note:"Историческое начисление: 19.05-25.05 2025"},
        {id:"h1800000000003",employeeId:2,employeeName:"Савелий Данилов",date:"2025-05-25",amount:8640,note:"Историческое начисление: 19.05-25.05 2025"},
        {id:"h1800000000004",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-05-25",amount:10540,note:"Историческое начисление: 19.05-25.05 2025"},
        {id:"h1800000000005",employeeId:3,employeeName:"Елена Бундзен",date:"2025-06-05",amount:6180,note:"Историческое начисление: 26.05-05.06 2025"},
        {id:"h1800000000006",employeeId:5,employeeName:"Ольга Гусакова",date:"2025-06-05",amount:6350,note:"Историческое начисление: 26.05-05.06 2025"},
        {id:"h1800000000007",employeeId:2,employeeName:"Савелий Данилов",date:"2025-06-05",amount:20000,note:"Историческое начисление: 26.05-05.06 2025"},
        {id:"h1800000000008",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-06-05",amount:5850,note:"Историческое начисление: 26.05-05.06 2025"},
        {id:"h1800000000009",employeeId:5,employeeName:"Ольга Гусакова",date:"2025-06-12",amount:2250,note:"Историческое начисление: 06.06-12.06 2025"},
        {id:"h1800000000010",employeeId:2,employeeName:"Савелий Данилов",date:"2025-06-12",amount:12500,note:"Историческое начисление: 06.06-12.06 2025"},
        {id:"h1800000000011",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-06-12",amount:5750,note:"Историческое начисление: 06.06-12.06 2025"},
        {id:"h1800000000012",employeeId:3,employeeName:"Елена Бундзен",date:"2025-06-18",amount:7500,note:"Историческое начисление: 13.06-18.06 2025"},
        {id:"h1800000000013",employeeId:5,employeeName:"Ольга Гусакова",date:"2025-06-18",amount:2400,note:"Историческое начисление: 13.06-18.06 2025"},
        {id:"h1800000000014",employeeId:2,employeeName:"Савелий Данилов",date:"2025-06-18",amount:11800,note:"Историческое начисление: 13.06-18.06 2025"},
        {id:"h1800000000015",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-06-18",amount:7150,note:"Историческое начисление: 13.06-18.06 2025"},
        {id:"h1800000000016",employeeId:3,employeeName:"Елена Бундзен",date:"2025-06-23",amount:12130,note:"Историческое начисление: 19.06-23.06 2025"},
        {id:"h1800000000017",employeeId:2,employeeName:"Савелий Данилов",date:"2025-06-23",amount:9160,note:"Историческое начисление: 19.06-23.06 2025"},
        {id:"h1800000000018",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-06-23",amount:8910,note:"Историческое начисление: 19.06-23.06 2025"},
        {id:"h1800000000019",employeeId:3,employeeName:"Елена Бундзен",date:"2025-06-29",amount:6780,note:"Историческое начисление: 24.06-29.06 2025"},
        {id:"h1800000000020",employeeId:5,employeeName:"Ольга Гусакова",date:"2025-06-29",amount:4640,note:"Историческое начисление: 24.06-29.06 2025"},
        {id:"h1800000000021",employeeId:2,employeeName:"Савелий Данилов",date:"2025-06-29",amount:11090,note:"Историческое начисление: 24.06-29.06 2025"},
        {id:"h1800000000022",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-06-29",amount:10200,note:"Историческое начисление: 24.06-29.06 2025"},
        {id:"h1800000000023",employeeId:3,employeeName:"Елена Бундзен",date:"2025-07-07",amount:12500,note:"Историческое начисление: 30.06-07.07 2025"},
        {id:"h1800000000024",employeeId:5,employeeName:"Ольга Гусакова",date:"2025-07-07",amount:5200,note:"Историческое начисление: 30.06-07.07 2025"},
        {id:"h1800000000025",employeeId:2,employeeName:"Савелий Данилов",date:"2025-07-07",amount:18750,note:"Историческое начисление: 30.06-07.07 2025"},
        {id:"h1800000000026",employeeId:3,employeeName:"Елена Бундзен",date:"2025-07-15",amount:10620,note:"Историческое начисление: 08.07-15.07 2025"},
        {id:"h1800000000027",employeeId:5,employeeName:"Ольга Гусакова",date:"2025-07-15",amount:1755,note:"Историческое начисление: 08.07-15.07 2025"},
        {id:"h1800000000028",employeeId:2,employeeName:"Савелий Данилов",date:"2025-07-15",amount:14230,note:"Историческое начисление: 08.07-15.07 2025"},
        {id:"h1800000000029",employeeId:3,employeeName:"Елена Бундзен",date:"2025-07-20",amount:10640,note:"Историческое начисление: 16.07-20.07 2025"},
        {id:"h1800000000030",employeeId:2,employeeName:"Савелий Данилов",date:"2025-07-20",amount:13370,note:"Историческое начисление: 16.07-20.07 2025"},
        {id:"h1800000000031",employeeId:3,employeeName:"Елена Бундзен",date:"2025-07-27",amount:10910,note:"Историческое начисление: 21.07-27.07 2025"},
        {id:"h1800000000032",employeeId:2,employeeName:"Савелий Данилов",date:"2025-07-27",amount:14450,note:"Историческое начисление: 21.07-27.07 2025"},
        {id:"h1800000000033",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-07-27",amount:10270,note:"Историческое начисление: 21.07-27.07 2025"},
        {id:"h1800000000034",employeeId:5,employeeName:"Ольга Гусакова",date:"2025-08-03",amount:12400,note:"Историческое начисление: 28.07-03.08 2025"},
        {id:"h1800000000035",employeeId:2,employeeName:"Савелий Данилов",date:"2025-08-03",amount:16395,note:"Историческое начисление: 28.07-03.08 2025"},
        {id:"h1800000000036",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-08-03",amount:9650,note:"Историческое начисление: 28.07-03.08 2025"},
        {id:"h1800000000037",employeeId:3,employeeName:"Елена Бундзен",date:"2025-08-11",amount:15720,note:"Историческое начисление: 04.08-11.08 2025"},
        {id:"h1800000000038",employeeId:5,employeeName:"Ольга Гусакова",date:"2025-08-11",amount:970,note:"Историческое начисление: 04.08-11.08 2025"},
        {id:"h1800000000039",employeeId:2,employeeName:"Савелий Данилов",date:"2025-08-11",amount:23080,note:"Историческое начисление: 04.08-11.08 2025"},
        {id:"h1800000000040",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-08-11",amount:15025,note:"Историческое начисление: 04.08-11.08 2025"},
        {id:"h1800000000041",employeeId:3,employeeName:"Елена Бундзен",date:"2025-08-17",amount:12000,note:"Историческое начисление: 12.08-17.08 2025"},
        {id:"h1800000000042",employeeId:2,employeeName:"Савелий Данилов",date:"2025-08-17",amount:20000,note:"Историческое начисление: 12.08-17.08 2025"},
        {id:"h1800000000043",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-08-17",amount:10500,note:"Историческое начисление: 12.08-17.08 2025"},
        {id:"h1800000000044",employeeId:3,employeeName:"Елена Бундзен",date:"2025-08-24",amount:27437,note:"Историческое начисление: 18.08-24.08 2025"},
        {id:"h1800000000045",employeeId:2,employeeName:"Савелий Данилов",date:"2025-08-24",amount:6700,note:"Историческое начисление: 18.08-24.08 2025"},
        {id:"h1800000000046",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-08-24",amount:18990,note:"Историческое начисление: 18.08-24.08 2025"},
        {id:"h1800000000047",employeeId:3,employeeName:"Елена Бундзен",date:"2025-08-31",amount:12100,note:"Историческое начисление: 25.08-31.08 2025"},
        {id:"h1800000000048",employeeId:5,employeeName:"Ольга Гусакова",date:"2025-08-31",amount:2000,note:"Историческое начисление: 25.08-31.08 2025"},
        {id:"h1800000000049",employeeId:2,employeeName:"Савелий Данилов",date:"2025-08-31",amount:8590,note:"Историческое начисление: 25.08-31.08 2025"},
        {id:"h1800000000050",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-08-31",amount:15350,note:"Историческое начисление: 25.08-31.08 2025"},
        {id:"h1800000000051",employeeId:3,employeeName:"Елена Бундзен",date:"2025-09-07",amount:7770,note:"Историческое начисление: 01.09-07.09 2025"},
        {id:"h1800000000052",employeeId:5,employeeName:"Ольга Гусакова",date:"2025-09-07",amount:3960,note:"Историческое начисление: 01.09-07.09 2025"},
        {id:"h1800000000053",employeeId:2,employeeName:"Савелий Данилов",date:"2025-09-07",amount:22300,note:"Историческое начисление: 01.09-07.09 2025"},
        {id:"h1800000000054",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-09-07",amount:11400,note:"Историческое начисление: 01.09-07.09 2025"},
        {id:"h1800000000055",employeeId:3,employeeName:"Елена Бундзен",date:"2025-09-15",amount:16320,note:"Историческое начисление: 08.09-15.09 2025"},
        {id:"h1800000000056",employeeId:2,employeeName:"Савелий Данилов",date:"2025-09-15",amount:28000,note:"Историческое начисление: 08.09-15.09 2025"},
        {id:"h1800000000057",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-09-15",amount:18000,note:"Историческое начисление: 08.09-15.09 2025"},
        {id:"h1800000000058",employeeId:3,employeeName:"Елена Бундзен",date:"2025-09-21",amount:8245,note:"Историческое начисление: 16.09-21.09 2025"},
        {id:"h1800000000059",employeeId:5,employeeName:"Ольга Гусакова",date:"2025-09-21",amount:3905,note:"Историческое начисление: 16.09-21.09 2025"},
        {id:"h1800000000060",employeeId:2,employeeName:"Савелий Данилов",date:"2025-09-21",amount:14325,note:"Историческое начисление: 16.09-21.09 2025"},
        {id:"h1800000000061",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-09-21",amount:11555,note:"Историческое начисление: 16.09-21.09 2025"},
        {id:"h1800000000062",employeeId:3,employeeName:"Елена Бундзен",date:"2025-09-28",amount:8905,note:"Историческое начисление: 22.09-28.09 2025"},
        {id:"h1800000000063",employeeId:2,employeeName:"Савелий Данилов",date:"2025-09-28",amount:14380,note:"Историческое начисление: 22.09-28.09 2025"},
        {id:"h1800000000064",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-09-28",amount:10155,note:"Историческое начисление: 22.09-28.09 2025"},
        {id:"h1800000000065",employeeId:3,employeeName:"Елена Бундзен",date:"2025-10-05",amount:8105,note:"Историческое начисление: 29.09-05.10 2025"},
        {id:"h1800000000066",employeeId:5,employeeName:"Ольга Гусакова",date:"2025-10-05",amount:2725,note:"Историческое начисление: 29.09-05.10 2025"},
        {id:"h1800000000067",employeeId:2,employeeName:"Савелий Данилов",date:"2025-10-05",amount:16480,note:"Историческое начисление: 29.09-05.10 2025"},
        {id:"h1800000000068",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-10-05",amount:8205,note:"Историческое начисление: 29.09-05.10 2025"},
        {id:"h1800000000069",employeeId:3,employeeName:"Елена Бундзен",date:"2025-10-12",amount:5637,note:"Историческое начисление: 06.10-12.10 2025"},
        {id:"h1800000000070",employeeId:5,employeeName:"Ольга Гусакова",date:"2025-10-12",amount:2600,note:"Историческое начисление: 06.10-12.10 2025"},
        {id:"h1800000000071",employeeId:2,employeeName:"Савелий Данилов",date:"2025-10-12",amount:16600,note:"Историческое начисление: 06.10-12.10 2025"},
        {id:"h1800000000072",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-10-12",amount:12305,note:"Историческое начисление: 06.10-12.10 2025"},
        {id:"h1800000000073",employeeId:3,employeeName:"Елена Бундзен",date:"2025-10-19",amount:4000,note:"Историческое начисление: 13.10-19.10 2025"},
        {id:"h1800000000074",employeeId:2,employeeName:"Савелий Данилов",date:"2025-10-19",amount:15000,note:"Историческое начисление: 13.10-19.10 2025"},
        {id:"h1800000000075",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-10-19",amount:9000,note:"Историческое начисление: 13.10-19.10 2025"},
        {id:"h1800000000076",employeeId:3,employeeName:"Елена Бундзен",date:"2025-10-26",amount:3350,note:"Историческое начисление: 20.10-26.10 2025"},
        {id:"h1800000000077",employeeId:5,employeeName:"Ольга Гусакова",date:"2025-10-26",amount:1650,note:"Историческое начисление: 20.10-26.10 2025"},
        {id:"h1800000000078",employeeId:2,employeeName:"Савелий Данилов",date:"2025-10-26",amount:11810,note:"Историческое начисление: 20.10-26.10 2025"},
        {id:"h1800000000079",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-10-26",amount:8200,note:"Историческое начисление: 20.10-26.10 2025"},
        {id:"h1800000000080",employeeId:3,employeeName:"Елена Бундзен",date:"2025-11-02",amount:2150,note:"Историческое начисление: 27.10-2.11 2025"},
        {id:"h1800000000081",employeeId:2,employeeName:"Савелий Данилов",date:"2025-11-02",amount:19950,note:"Историческое начисление: 27.10-2.11 2025"},
        {id:"h1800000000082",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-11-02",amount:10000,note:"Историческое начисление: 27.10-2.11 2025"},
        {id:"h1800000000083",employeeId:2,employeeName:"Савелий Данилов",date:"2025-11-15",amount:20000,note:"Историческое начисление: 03.11-15.11 2025"},
        {id:"h1800000000084",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-11-15",amount:10000,note:"Историческое начисление: 03.11-15.11 2025"},
        {id:"h1800000000085",employeeId:2,employeeName:"Савелий Данилов",date:"2025-11-23",amount:16890,note:"Историческое начисление: 16.11-23.11 2025"},
        {id:"h1800000000086",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-11-23",amount:6890,note:"Историческое начисление: 16.11-23.11 2025"},
        {id:"h1800000000087",employeeId:2,employeeName:"Савелий Данилов",date:"2025-11-30",amount:14500,note:"Историческое начисление: 24.11-30.11 2025"},
        {id:"h1800000000088",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-11-30",amount:6000,note:"Историческое начисление: 24.11-30.11 2025"},
        {id:"h1800000000089",employeeId:2,employeeName:"Савелий Данилов",date:"2025-12-07",amount:16000,note:"Историческое начисление: 02.12-07.12 2025"},
        {id:"h1800000000090",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-12-07",amount:6000,note:"Историческое начисление: 02.12-07.12 2025"},
        {id:"h1800000000091",employeeId:2,employeeName:"Савелий Данилов",date:"2025-12-13",amount:14100,note:"Историческое начисление: 08.12-13.12 2025"},
        {id:"h1800000000092",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-12-13",amount:4600,note:"Историческое начисление: 08.12-13.12 2025"},
        {id:"h1800000000093",employeeId:2,employeeName:"Савелий Данилов",date:"2025-12-21",amount:14000,note:"Историческое начисление: 15.12-21.12 2025"},
        {id:"h1800000000094",employeeId:2,employeeName:"Савелий Данилов",date:"2025-12-31",amount:18480,note:"Историческое начисление: 22.12-31.12 2025"},
        {id:"h1800000000095",employeeId:4,employeeName:"Дмитрий Князев",date:"2025-12-31",amount:5495,note:"Историческое начисление: 22.12-31.12 2025"},
        {id:"h1800000000096",employeeId:3,employeeName:"Елена Бундзен",date:"2026-01-05",amount:4510,note:"Историческое начисление: 01.01-05.01 2026"},
        {id:"h1800000000097",employeeId:2,employeeName:"Савелий Данилов",date:"2026-01-05",amount:15065,note:"Историческое начисление: 01.01-05.01 2026"},
        {id:"h1800000000098",employeeId:2,employeeName:"Савелий Данилов",date:"2026-01-25",amount:5380,note:"Историческое начисление: 19.01-25.01 2026"},
        {id:"h1800000000099",employeeId:4,employeeName:"Дмитрий Князев",date:"2026-01-25",amount:2580,note:"Историческое начисление: 19.01-25.01 2026"},
        {id:"h1800000000100",employeeId:2,employeeName:"Савелий Данилов",date:"2026-02-15",amount:36600,note:"Историческое начисление: 29.01-15.02 2026"},
        {id:"h1800000000101",employeeId:4,employeeName:"Дмитрий Князев",date:"2026-02-15",amount:10000,note:"Историческое начисление: 29.01-15.02 2026"},
        {id:"h1800000000102",employeeId:5,employeeName:"Ольга Гусакова",date:"2026-02-23",amount:5000,note:"Историческое начисление: 16.02-23.02 2026"},
        {id:"h1800000000103",employeeId:2,employeeName:"Савелий Данилов",date:"2026-02-23",amount:26500,note:"Историческое начисление: 16.02-23.02 2026"},
        {id:"h1800000000104",employeeId:4,employeeName:"Дмитрий Князев",date:"2026-02-23",amount:13800,note:"Историческое начисление: 16.02-23.02 2026"},
        {id:"h1800000000105",employeeId:2,employeeName:"Савелий Данилов",date:"2026-03-01",amount:10000,note:"Историческое начисление: 24.02-01.03 2026"},
        {id:"h1800000000106",employeeId:4,employeeName:"Дмитрий Князев",date:"2026-03-01",amount:9800,note:"Историческое начисление: 24.02-01.03 2026"},
        {id:"h1800000000107",employeeId:2,employeeName:"Савелий Данилов",date:"2026-03-08",amount:11200,note:"Историческое начисление: 02.03-08.03 2026"},
        {id:"h1800000000108",employeeId:4,employeeName:"Дмитрий Князев",date:"2026-03-08",amount:3750,note:"Историческое начисление: 02.03-08.03 2026"},
        {id:"h1800000000109",employeeId:2,employeeName:"Савелий Данилов",date:"2026-03-15",amount:16440,note:"Историческое начисление: 09.03-15.03 2026"},
        {id:"h1800000000110",employeeId:4,employeeName:"Дмитрий Князев",date:"2026-03-15",amount:6460,note:"Историческое начисление: 09.03-15.03 2026"},
        {id:"h1800000000111",employeeId:3,employeeName:"Елена Бундзен",date:"2026-03-22",amount:4240,note:"Историческое начисление: 16.03-22.03 2026"},
        {id:"h1800000000112",employeeId:2,employeeName:"Савелий Данилов",date:"2026-03-22",amount:20760,note:"Историческое начисление: 16.03-22.03 2026"},
        {id:"h1800000000113",employeeId:4,employeeName:"Дмитрий Князев",date:"2026-03-22",amount:9560,note:"Историческое начисление: 16.03-22.03 2026"},
        {id:"h1800000000114",employeeId:2,employeeName:"Савелий Данилов",date:"2026-03-29",amount:14200,note:"Историческое начисление: 23.03-29.03 2026"},
        {id:"h1800000000115",employeeId:4,employeeName:"Дмитрий Князев",date:"2026-03-29",amount:7000,note:"Историческое начисление: 23.03-29.03 2026"},
        {id:"h1800000000116",employeeId:3,employeeName:"Елена Бундзен",date:"2026-04-05",amount:910,note:"Историческое начисление: 30.03-05.04 2026"},
        {id:"h1800000000117",employeeId:2,employeeName:"Савелий Данилов",date:"2026-04-05",amount:11480,note:"Историческое начисление: 30.03-05.04 2026"},
        {id:"h1800000000118",employeeId:4,employeeName:"Дмитрий Князев",date:"2026-04-05",amount:5540,note:"Историческое начисление: 30.03-05.04 2026"}
    ];
    const importPayments = [
        {id:1800000000001,date:"2025-05-25",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:19550,method:"cash",note:"Импорт: 19.05-25.05 2025"},
        {id:1800000000002,date:"2025-05-25",time:"12:00",employeeId:5,employeeName:"Ольга Гусакова",amount:5550,method:"cash",note:"Импорт: 19.05-25.05 2025"},
        {id:1800000000003,date:"2025-05-25",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:8640,method:"cash",note:"Импорт: 19.05-25.05 2025"},
        {id:1800000000004,date:"2025-05-25",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:10540,method:"cash",note:"Импорт: 19.05-25.05 2025"},
        {id:1800000000005,date:"2025-06-05",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:6180,method:"cash",note:"Импорт: 26.05-05.06 2025"},
        {id:1800000000006,date:"2025-06-05",time:"12:00",employeeId:5,employeeName:"Ольга Гусакова",amount:6350,method:"cash",note:"Импорт: 26.05-05.06 2025"},
        {id:1800000000007,date:"2025-06-05",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:20000,method:"cash",note:"Импорт: 26.05-05.06 2025"},
        {id:1800000000008,date:"2025-06-05",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:5850,method:"cash",note:"Импорт: 26.05-05.06 2025"},
        {id:1800000000009,date:"2025-06-12",time:"12:00",employeeId:5,employeeName:"Ольга Гусакова",amount:2250,method:"cash",note:"Импорт: 06.06-12.06 2025"},
        {id:1800000000010,date:"2025-06-12",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:12500,method:"cash",note:"Импорт: 06.06-12.06 2025"},
        {id:1800000000011,date:"2025-06-12",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:5750,method:"cash",note:"Импорт: 06.06-12.06 2025"},
        {id:1800000000012,date:"2025-06-18",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:7500,method:"cash",note:"Импорт: 13.06-18.06 2025"},
        {id:1800000000013,date:"2025-06-18",time:"12:00",employeeId:5,employeeName:"Ольга Гусакова",amount:2400,method:"cash",note:"Импорт: 13.06-18.06 2025"},
        {id:1800000000014,date:"2025-06-18",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:11800,method:"cash",note:"Импорт: 13.06-18.06 2025"},
        {id:1800000000015,date:"2025-06-18",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:7150,method:"cash",note:"Импорт: 13.06-18.06 2025"},
        {id:1800000000016,date:"2025-06-23",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:12130,method:"cash",note:"Импорт: 19.06-23.06 2025"},
        {id:1800000000017,date:"2025-06-23",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:9160,method:"cash",note:"Импорт: 19.06-23.06 2025"},
        {id:1800000000018,date:"2025-06-23",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:8910,method:"cash",note:"Импорт: 19.06-23.06 2025"},
        {id:1800000000019,date:"2025-06-29",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:6780,method:"cash",note:"Импорт: 24.06-29.06 2025"},
        {id:1800000000020,date:"2025-06-29",time:"12:00",employeeId:5,employeeName:"Ольга Гусакова",amount:4640,method:"cash",note:"Импорт: 24.06-29.06 2025"},
        {id:1800000000021,date:"2025-06-29",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:11090,method:"cash",note:"Импорт: 24.06-29.06 2025"},
        {id:1800000000022,date:"2025-06-29",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:10200,method:"cash",note:"Импорт: 24.06-29.06 2025"},
        {id:1800000000023,date:"2025-07-07",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:12500,method:"cash",note:"Импорт: 30.06-07.07 2025"},
        {id:1800000000024,date:"2025-07-07",time:"12:00",employeeId:5,employeeName:"Ольга Гусакова",amount:5200,method:"cash",note:"Импорт: 30.06-07.07 2025"},
        {id:1800000000025,date:"2025-07-07",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:18750,method:"cash",note:"Импорт: 30.06-07.07 2025"},
        {id:1800000000026,date:"2025-07-15",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:10620,method:"cash",note:"Импорт: 08.07-15.07 2025"},
        {id:1800000000027,date:"2025-07-15",time:"12:00",employeeId:5,employeeName:"Ольга Гусакова",amount:1755,method:"cash",note:"Импорт: 08.07-15.07 2025"},
        {id:1800000000028,date:"2025-07-15",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:14230,method:"cash",note:"Импорт: 08.07-15.07 2025"},
        {id:1800000000029,date:"2025-07-20",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:10640,method:"cash",note:"Импорт: 16.07-20.07 2025"},
        {id:1800000000030,date:"2025-07-20",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:13370,method:"cash",note:"Импорт: 16.07-20.07 2025"},
        {id:1800000000031,date:"2025-07-27",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:10910,method:"cash",note:"Импорт: 21.07-27.07 2025"},
        {id:1800000000032,date:"2025-07-27",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:14450,method:"cash",note:"Импорт: 21.07-27.07 2025"},
        {id:1800000000033,date:"2025-07-27",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:10270,method:"cash",note:"Импорт: 21.07-27.07 2025"},
        {id:1800000000034,date:"2025-08-03",time:"12:00",employeeId:5,employeeName:"Ольга Гусакова",amount:12400,method:"cash",note:"Импорт: 28.07-03.08 2025"},
        {id:1800000000035,date:"2025-08-03",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:16395,method:"cash",note:"Импорт: 28.07-03.08 2025"},
        {id:1800000000036,date:"2025-08-03",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:9650,method:"cash",note:"Импорт: 28.07-03.08 2025"},
        {id:1800000000037,date:"2025-08-11",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:15720,method:"cash",note:"Импорт: 04.08-11.08 2025"},
        {id:1800000000038,date:"2025-08-11",time:"12:00",employeeId:5,employeeName:"Ольга Гусакова",amount:970,method:"cash",note:"Импорт: 04.08-11.08 2025"},
        {id:1800000000039,date:"2025-08-11",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:23080,method:"cash",note:"Импорт: 04.08-11.08 2025"},
        {id:1800000000040,date:"2025-08-11",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:15025,method:"cash",note:"Импорт: 04.08-11.08 2025"},
        {id:1800000000041,date:"2025-08-17",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:12000,method:"cash",note:"Импорт: 12.08-17.08 2025"},
        {id:1800000000042,date:"2025-08-17",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:20000,method:"cash",note:"Импорт: 12.08-17.08 2025"},
        {id:1800000000043,date:"2025-08-17",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:10500,method:"cash",note:"Импорт: 12.08-17.08 2025"},
        {id:1800000000044,date:"2025-08-24",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:27437,method:"cash",note:"Импорт: 18.08-24.08 2025"},
        {id:1800000000045,date:"2025-08-24",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:6700,method:"cash",note:"Импорт: 18.08-24.08 2025"},
        {id:1800000000046,date:"2025-08-24",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:18990,method:"cash",note:"Импорт: 18.08-24.08 2025"},
        {id:1800000000047,date:"2025-08-31",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:12100,method:"cash",note:"Импорт: 25.08-31.08 2025"},
        {id:1800000000048,date:"2025-08-31",time:"12:00",employeeId:5,employeeName:"Ольга Гусакова",amount:2000,method:"cash",note:"Импорт: 25.08-31.08 2025"},
        {id:1800000000049,date:"2025-08-31",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:8590,method:"cash",note:"Импорт: 25.08-31.08 2025"},
        {id:1800000000050,date:"2025-08-31",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:15350,method:"cash",note:"Импорт: 25.08-31.08 2025"},
        {id:1800000000051,date:"2025-09-07",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:7770,method:"cash",note:"Импорт: 01.09-07.09 2025"},
        {id:1800000000052,date:"2025-09-07",time:"12:00",employeeId:5,employeeName:"Ольга Гусакова",amount:3960,method:"cash",note:"Импорт: 01.09-07.09 2025"},
        {id:1800000000053,date:"2025-09-07",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:22300,method:"cash",note:"Импорт: 01.09-07.09 2025"},
        {id:1800000000054,date:"2025-09-07",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:11400,method:"cash",note:"Импорт: 01.09-07.09 2025"},
        {id:1800000000055,date:"2025-09-15",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:16320,method:"cash",note:"Импорт: 08.09-15.09 2025"},
        {id:1800000000056,date:"2025-09-15",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:28000,method:"cash",note:"Импорт: 08.09-15.09 2025"},
        {id:1800000000057,date:"2025-09-15",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:18000,method:"cash",note:"Импорт: 08.09-15.09 2025"},
        {id:1800000000058,date:"2025-09-21",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:8245,method:"cash",note:"Импорт: 16.09-21.09 2025"},
        {id:1800000000059,date:"2025-09-21",time:"12:00",employeeId:5,employeeName:"Ольга Гусакова",amount:3905,method:"cash",note:"Импорт: 16.09-21.09 2025"},
        {id:1800000000060,date:"2025-09-21",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:14325,method:"cash",note:"Импорт: 16.09-21.09 2025"},
        {id:1800000000061,date:"2025-09-21",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:11555,method:"cash",note:"Импорт: 16.09-21.09 2025"},
        {id:1800000000062,date:"2025-09-28",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:8905,method:"cash",note:"Импорт: 22.09-28.09 2025"},
        {id:1800000000063,date:"2025-09-28",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:14380,method:"cash",note:"Импорт: 22.09-28.09 2025"},
        {id:1800000000064,date:"2025-09-28",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:10155,method:"cash",note:"Импорт: 22.09-28.09 2025"},
        {id:1800000000065,date:"2025-10-05",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:8105,method:"cash",note:"Импорт: 29.09-05.10 2025"},
        {id:1800000000066,date:"2025-10-05",time:"12:00",employeeId:5,employeeName:"Ольга Гусакова",amount:2725,method:"cash",note:"Импорт: 29.09-05.10 2025"},
        {id:1800000000067,date:"2025-10-05",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:16480,method:"cash",note:"Импорт: 29.09-05.10 2025"},
        {id:1800000000068,date:"2025-10-05",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:8205,method:"cash",note:"Импорт: 29.09-05.10 2025"},
        {id:1800000000069,date:"2025-10-12",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:5637,method:"cash",note:"Импорт: 06.10-12.10 2025"},
        {id:1800000000070,date:"2025-10-12",time:"12:00",employeeId:5,employeeName:"Ольга Гусакова",amount:2600,method:"cash",note:"Импорт: 06.10-12.10 2025"},
        {id:1800000000071,date:"2025-10-12",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:16600,method:"cash",note:"Импорт: 06.10-12.10 2025"},
        {id:1800000000072,date:"2025-10-12",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:12305,method:"cash",note:"Импорт: 06.10-12.10 2025"},
        {id:1800000000073,date:"2025-10-19",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:4000,method:"cash",note:"Импорт: 13.10-19.10 2025"},
        {id:1800000000074,date:"2025-10-19",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:15000,method:"cash",note:"Импорт: 13.10-19.10 2025"},
        {id:1800000000075,date:"2025-10-19",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:9000,method:"cash",note:"Импорт: 13.10-19.10 2025"},
        {id:1800000000076,date:"2025-10-26",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:3350,method:"cash",note:"Импорт: 20.10-26.10 2025"},
        {id:1800000000077,date:"2025-10-26",time:"12:00",employeeId:5,employeeName:"Ольга Гусакова",amount:1650,method:"cash",note:"Импорт: 20.10-26.10 2025"},
        {id:1800000000078,date:"2025-10-26",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:11810,method:"cash",note:"Импорт: 20.10-26.10 2025"},
        {id:1800000000079,date:"2025-10-26",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:8200,method:"cash",note:"Импорт: 20.10-26.10 2025"},
        {id:1800000000080,date:"2025-11-02",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:2150,method:"cash",note:"Импорт: 27.10-2.11 2025"},
        {id:1800000000081,date:"2025-11-02",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:19950,method:"cash",note:"Импорт: 27.10-2.11 2025"},
        {id:1800000000082,date:"2025-11-02",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:10000,method:"cash",note:"Импорт: 27.10-2.11 2025"},
        {id:1800000000083,date:"2025-11-15",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:20000,method:"cash",note:"Импорт: 03.11-15.11 2025"},
        {id:1800000000084,date:"2025-11-15",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:10000,method:"cash",note:"Импорт: 03.11-15.11 2025"},
        {id:1800000000085,date:"2025-11-23",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:16890,method:"cash",note:"Импорт: 16.11-23.11 2025"},
        {id:1800000000086,date:"2025-11-23",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:6890,method:"cash",note:"Импорт: 16.11-23.11 2025"},
        {id:1800000000087,date:"2025-11-30",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:14500,method:"cash",note:"Импорт: 24.11-30.11 2025"},
        {id:1800000000088,date:"2025-11-30",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:6000,method:"cash",note:"Импорт: 24.11-30.11 2025"},
        {id:1800000000089,date:"2025-12-07",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:16000,method:"cash",note:"Импорт: 02.12-07.12 2025"},
        {id:1800000000090,date:"2025-12-07",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:6000,method:"cash",note:"Импорт: 02.12-07.12 2025"},
        {id:1800000000091,date:"2025-12-13",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:14100,method:"cash",note:"Импорт: 08.12-13.12 2025"},
        {id:1800000000092,date:"2025-12-13",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:4600,method:"cash",note:"Импорт: 08.12-13.12 2025"},
        {id:1800000000093,date:"2025-12-21",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:14000,method:"cash",note:"Импорт: 15.12-21.12 2025"},
        {id:1800000000094,date:"2025-12-31",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:18480,method:"cash",note:"Импорт: 22.12-31.12 2025"},
        {id:1800000000095,date:"2025-12-31",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:5495,method:"cash",note:"Импорт: 22.12-31.12 2025"},
        {id:1800000000096,date:"2026-01-05",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:4510,method:"cash",note:"Импорт: 01.01-05.01 2026"},
        {id:1800000000097,date:"2026-01-05",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:15065,method:"cash",note:"Импорт: 01.01-05.01 2026"},
        {id:1800000000098,date:"2026-01-25",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:5380,method:"cash",note:"Импорт: 19.01-25.01 2026"},
        {id:1800000000099,date:"2026-01-25",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:2580,method:"cash",note:"Импорт: 19.01-25.01 2026"},
        {id:1800000000100,date:"2026-02-15",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:36600,method:"cash",note:"Импорт: 29.01-15.02 2026"},
        {id:1800000000101,date:"2026-02-15",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:10000,method:"cash",note:"Импорт: 29.01-15.02 2026"},
        {id:1800000000102,date:"2026-02-23",time:"12:00",employeeId:5,employeeName:"Ольга Гусакова",amount:5000,method:"cash",note:"Импорт: 16.02-23.02 2026"},
        {id:1800000000103,date:"2026-02-23",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:26500,method:"cash",note:"Импорт: 16.02-23.02 2026"},
        {id:1800000000104,date:"2026-02-23",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:13800,method:"cash",note:"Импорт: 16.02-23.02 2026"},
        {id:1800000000105,date:"2026-03-01",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:10000,method:"cash",note:"Импорт: 24.02-01.03 2026"},
        {id:1800000000106,date:"2026-03-01",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:9800,method:"cash",note:"Импорт: 24.02-01.03 2026"},
        {id:1800000000107,date:"2026-03-08",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:11200,method:"cash",note:"Импорт: 02.03-08.03 2026"},
        {id:1800000000108,date:"2026-03-08",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:3750,method:"cash",note:"Импорт: 02.03-08.03 2026"},
        {id:1800000000109,date:"2026-03-15",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:16440,method:"cash",note:"Импорт: 09.03-15.03 2026"},
        {id:1800000000110,date:"2026-03-15",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:6460,method:"cash",note:"Импорт: 09.03-15.03 2026"},
        {id:1800000000111,date:"2026-03-22",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:4240,method:"cash",note:"Импорт: 16.03-22.03 2026"},
        {id:1800000000112,date:"2026-03-22",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:20760,method:"cash",note:"Импорт: 16.03-22.03 2026"},
        {id:1800000000113,date:"2026-03-22",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:9560,method:"cash",note:"Импорт: 16.03-22.03 2026"},
        {id:1800000000114,date:"2026-03-29",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:14200,method:"cash",note:"Импорт: 23.03-29.03 2026"},
        {id:1800000000115,date:"2026-03-29",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:7000,method:"cash",note:"Импорт: 23.03-29.03 2026"},
        {id:1800000000116,date:"2026-04-05",time:"12:00",employeeId:3,employeeName:"Елена Бундзен",amount:910,method:"cash",note:"Импорт: 30.03-05.04 2026"},
        {id:1800000000117,date:"2026-04-05",time:"12:00",employeeId:2,employeeName:"Савелий Данилов",amount:11480,method:"cash",note:"Импорт: 30.03-05.04 2026"},
        {id:1800000000118,date:"2026-04-05",time:"12:00",employeeId:4,employeeName:"Дмитрий Князев",amount:5540,method:"cash",note:"Импорт: 30.03-05.04 2026"}
    ];
    // 1. Заменить historicalAccruals до CUTOFF, сохранить после
    const existingHistAfterCutoff = DB.get('historicalAccruals', []).filter(a => a.date > CUTOFF);
    DB.set('historicalAccruals', [...importAccruals, ...existingHistAfterCutoff]);
    // 2. Удалить salaryPayments <= CUTOFF, добавить новые
    const existingPayments = DB.get('salaryPayments', []).filter(p => p.date > CUTOFF);
    const mergedPayments = [...existingPayments, ...importPayments];
    DB.set('salaryPayments', mergedPayments);
    // 3. Удалить смены <= CUTOFF для импортируемых сотрудников (чтобы не было двойного начисления)
    const existingShifts = DB.get('shifts', []).filter(s => !(IMPORT_EMP_IDS.has(s.employeeId) && s.date <= CUTOFF));
    DB.set('shifts', existingShifts);
    // 4. Очистить tombstone'ы (новые данные чистые)
    DB.set('deletedSalaryPaymentIds', []);
    // 5. Пометить v3 завершённым (и обновить v1/v2)
    DB.set('salary_import_v1', true);
    DB.set('salary_import_v2', true);
    DB.set('salary_import_v3', true);
    console.log('Salary import v3: ' + importAccruals.length + ' accruals, ' + importPayments.length + ' payments. Old data up to ' + CUTOFF + ' replaced.');
}

// v4: Пересчитать earnings для смен после CUTOFF (если потеряны/неполные)
function migrateV4RestorePostCutoffAccruals() {
    if (DB.get('salary_import_v4', false)) return;
    const CUTOFF = '2026-04-05';
    const shifts = DB.get('shifts', []);
    let fixed = 0;
    shifts.forEach(s => {
        if (s.date > CUTOFF && s.endTime) {
            // Пересчитать earnings если они отсутствуют или нулевые но есть eventBonuses
            if (!s.earnings || (s.earnings.total === 0 && s.eventBonuses && s.eventBonuses.length > 0)) {
                s.earnings = calculateShiftEarnings(s);
                fixed++;
            }
        }
    });
    if (fixed > 0) {
        DB.set('shifts', shifts);
        console.log('Salary import v4: recalculated earnings for ' + fixed + ' shifts after ' + CUTOFF);
    }
    DB.set('salary_import_v4', true);
}

// v5: Retroactively credit missing event bonuses — if event completed but bonus not on any shift or accrual
function migrateV5FixMissingEventBonuses() {
    // v5b: перезапуск после бага (v5 могла пройти с пустыми events)
    if (DB.get('salary_import_v5b', false)) return;
    const events = DB.get('events', []);
    if (events.length === 0) return; // данные ещё не загружены
    const shifts = DB.get('shifts', []);
    const accruals = DB.get('historicalAccruals', []);
    let addedCount = 0;

    events.forEach(evt => {
        if (evt.status !== 'completed' || !evt.bonuses) return;
        const eventId = evt.id;
        const eventDate = evt.date || '';
        const evtTitle = evt.title || 'Мероприятие';

        const checkAndCredit = (empId, amount, bonusType) => {
            if (!empId || amount <= 0) return;
            // Check if bonus already exists on a shift
            const hasOnShift = shifts.some(s =>
                s.employeeId === empId && s.eventBonuses &&
                s.eventBonuses.some(b => String(b.eventId) === String(eventId) && b.bonusType === bonusType)
            );
            if (hasOnShift) return;
            // Check if bonus already exists as historical accrual
            const hasAccrual = accruals.some(a =>
                a.employeeId === empId && a.id && String(a.id).startsWith('evtbonus_' + eventId + '_' + empId)
            );
            if (hasAccrual) return;
            // Missing — create accrual
            const emps = DB.get('employees', []);
            const emp = emps.find(e => e.id === empId);
            const empName = emp ? (emp.firstName + ' ' + emp.lastName) : '';
            const roleName = bonusType === 'instructor' ? 'инструктор' : 'администратор';
            accruals.push({
                id: 'evtbonus_' + eventId + '_' + empId + '_' + Date.now() + '_' + Math.random(),
                employeeId: empId,
                employeeName: empName,
                date: eventDate,
                amount: amount,
                note: `Бонус за мероприятие "${evtTitle}" (${roleName})`
            });
            addedCount++;
        };

        const instrIds = evt.assignedInstructors || evt.instructors || [];
        const adminIds = evt.assignedAdmins || evt.admins || [];
        const perInstr = evt.bonuses.perInstructor || 0;
        const perAdm = evt.bonuses.perAdmin || 0;

        instrIds.forEach(id => checkAndCredit(id, perInstr, 'instructor'));
        adminIds.forEach(id => checkAndCredit(id, perAdm, 'admin'));
    });

    if (addedCount > 0) {
        DB.set('historicalAccruals', accruals);
        console.log('Salary import v5: created ' + addedCount + ' missing event bonus accruals');
    }
    DB.set('salary_import_v5', true);
    DB.set('salary_import_v5b', true);
}

// v6: Пересчитать склад по всем документам (после бага с гранатами/дымами × ppl)
function migrateV6RecalcStock() {
    if (DB.get('stock_recalc_v6', false)) return;
    const docs = DB.get('documents', []);
    const stock = { balls: 0, kidsBalls: 0, grenades: 0, smokes: 0 };
    const keyMap = {
        'Пейнтбольные шары 0.68': 'balls',
        'Детские пейнтбольные шары 0.50': 'kidsBalls',
        'Гранаты': 'grenades',
        'Дымы': 'smokes'
    };
    docs.forEach(d => {
        const k = keyMap[d.item];
        if (!k || !d.qty) return;
        if (d.type === 'incoming') stock[k] += d.qty;
        else if (d.type === 'outgoing' || d.type === 'writeoff') stock[k] -= d.qty;
    });
    DB.set('stock_recalc_v6', true);
    // Stock is now computed from documents in getStockFromDocs() — no need to persist
}

// v7: Удалить автоматические evtbonus_ начисления до 31 марта (покрыты Excel-импортом)
// + пересоздать бонусы за мероприятия с 1 апреля если их нет
function migrateV7CleanupPreAprilBonuses() {
    if (DB.get('salary_cleanup_v7', false)) return;
    const events = DB.get('events', []);
    if (events.length === 0) return; // данные ещё не загружены

    const CUTOFF = '2026-03-31';
    const accruals = DB.get('historicalAccruals', []);

    // 1. Удалить evtbonus_ начисления до 31 марта включительно
    const before = accruals.length;
    const cleaned = accruals.filter(a => {
        if (a.id && String(a.id).startsWith('evtbonus_') && a.date && a.date <= CUTOFF) {
            return false; // удалить
        }
        return true;
    });
    const removed = before - cleaned.length;

    // 2. Пересоздать бонусы за мероприятия с 1 апреля если их нет
    const shifts = DB.get('shifts', []);
    let added = 0;

    events.forEach(evt => {
        if (evt.status !== 'completed' || !evt.bonuses) return;
        if (!evt.date || evt.date <= CUTOFF) return; // только после 31 марта

        const eventId = evt.id;
        const eventDate = evt.date;
        const evtTitle = evt.title || 'Мероприятие';
        const instrIds = evt.assignedInstructors || evt.instructors || [];
        const adminIds = evt.assignedAdmins || evt.admins || [];
        const perInstr = evt.bonuses.perInstructor || 0;
        const perAdm = evt.bonuses.perAdmin || 0;

        const creditIfMissing = (empId, amount, bonusType) => {
            if (!empId || amount <= 0) return;
            // Проверить на смене
            const hasOnShift = shifts.some(s =>
                s.employeeId === empId && s.eventBonuses &&
                s.eventBonuses.some(b => String(b.eventId) === String(eventId) && b.bonusType === bonusType)
            );
            if (hasOnShift) return;
            // Проверить в начислениях
            const hasAccrual = cleaned.some(a =>
                a.employeeId === empId && a.id && String(a.id).startsWith('evtbonus_' + eventId + '_' + empId)
            );
            if (hasAccrual) return;
            // Создать
            const emps = DB.get('employees', []);
            const emp = emps.find(e => e.id === empId);
            const empName = emp ? (emp.firstName + ' ' + emp.lastName) : '';
            const roleName = bonusType === 'instructor' ? 'инструктор' : 'администратор';
            cleaned.push({
                id: 'evtbonus_' + eventId + '_' + empId + '_' + Date.now() + '_' + Math.random(),
                employeeId: empId,
                employeeName: empName,
                date: eventDate,
                amount: amount,
                note: `Бонус за мероприятие "${evtTitle}" (${roleName})`
            });
            added++;
        };

        instrIds.forEach(id => creditIfMissing(id, perInstr, 'instructor'));
        adminIds.forEach(id => creditIfMissing(id, perAdm, 'admin'));
    });

    if (removed > 0 || added > 0) {
        DB.set('historicalAccruals', cleaned);
        console.log(`Salary cleanup v7: removed ${removed} pre-April evtbonus, added ${added} post-April bonuses`);
    }
    DB.set('salary_cleanup_v7', true);
}

// v8: Полный пересчёт бонусов за мероприятия с 1 апреля
// Удаляет все evtbonus_ дубли, пересчитывает и создаёт заново
function migrateV8RecalcEventBonuses() {
    if (DB.get('bonus_recalc_v8d', false)) return;
    const events = DB.get('events', []);
    if (events.length === 0) return;

    const CUTOFF = '2026-03-31';
    const salaryRules = DB.get('salaryRules', {});
    const instrRule = salaryRules.instructor || salaryRules.senior_instructor || { bonusPercent: 5, bonusSources: ['services', 'optionsForGame'] };
    const adminRule = salaryRules.admin || { bonusPercent: 5, bonusSources: ['services', 'optionsForGame', 'options'] };
    const shifts = DB.get('shifts', []);
    let accruals = DB.get('historicalAccruals', []);

    // 1. Удалить ВСЕ evtbonus_ начисления после CUTOFF (будут пересозданы с правильными суммами)
    const beforeCount = accruals.length;
    accruals = accruals.filter(a => {
        if (a.id && String(a.id).startsWith('evtbonus_') && a.date && a.date > CUTOFF) return false;
        return true;
    });
    const removedDupes = beforeCount - accruals.length;

    // 2. Убрать eventBonuses со смен после CUTOFF (тоже пересоздадим)
    shifts.forEach(s => {
        if (s.date && s.date > CUTOFF && s.eventBonuses && s.eventBonuses.length > 0) {
            s.eventBonuses = [];
            if (s.endTime) s.earnings = calculateShiftEarnings(s);
        }
    });

    // 3. Пересчитать бонусы для каждого завершённого мероприятия после CUTOFF
    let created = 0;
    events.forEach(evt => {
        if (evt.status !== 'completed' || !evt.date || evt.date <= CUTOFF) return;
        const eventId = evt.id;
        const eventDate = evt.date;
        const evtTitle = evt.title || 'Мероприятие';
        const instrIds = evt.assignedInstructors || evt.instructors || [];
        const adminIds = evt.assignedAdmins || evt.admins || [];

        const instrRevenue = calculateEventRevenueBySources(evt, instrRule.bonusSources || ['services', 'optionsForGame']);
        const adminRevenue = calculateEventRevenueBySources(evt, adminRule.bonusSources || ['services', 'optionsForGame', 'options']);
        const instrBonusTotal = Math.round(instrRevenue * (instrRule.bonusPercent || 5) / 100);
        const adminBonusTotal = Math.round(adminRevenue * (adminRule.bonusPercent || 5) / 100);
        const perInstructor = instrIds.length > 0 ? Math.round(instrBonusTotal / instrIds.length) : 0;
        const perAdmin = adminIds.length > 0 ? Math.round(adminBonusTotal / adminIds.length) : 0;

        // Обновить bonuses в событии
        evt.bonuses = { instructorTotal: instrBonusTotal, adminTotal: adminBonusTotal, perInstructor, perAdmin };

        // Начислить бонус: на смену если есть, иначе historicalAccrual
        const creditTo = (empId, amount, bonusType) => {
            if (!empId || amount <= 0) return;
            // Попробовать найти смену
            let shiftIdx = shifts.findIndex(s => s.date === eventDate && s.employeeId === empId);
            if (shiftIdx < 0) {
                const todayStr = todayLocal();
                if (eventDate !== todayStr) shiftIdx = shifts.findIndex(s => s.date === todayStr && s.employeeId === empId);
            }
            if (shiftIdx >= 0) {
                if (!shifts[shiftIdx].eventBonuses) shifts[shiftIdx].eventBonuses = [];
                shifts[shiftIdx].eventBonuses.push({ eventId, eventTitle: evtTitle, amount, bonusType });
                if (shifts[shiftIdx].endTime) shifts[shiftIdx].earnings = calculateShiftEarnings(shifts[shiftIdx]);
            } else {
                // На historicalAccrual
                const emps = DB.get('employees', []);
                const emp = emps.find(e => e.id === empId);
                const empName = emp ? (emp.firstName + ' ' + emp.lastName) : '';
                const roleName = bonusType === 'instructor' ? 'инструктор' : 'администратор';
                accruals.push({
                    id: 'evtbonus_' + eventId + '_' + empId + '_' + Date.now() + '_' + Math.random(),
                    employeeId: empId, employeeName: empName, date: eventDate,
                    amount, note: `Бонус за мероприятие "${evtTitle}" (${roleName})`
                });
            }
            created++;
        };

        instrIds.forEach(id => creditTo(id, perInstructor, 'instructor'));
        adminIds.forEach(id => creditTo(id, perAdmin, 'admin'));
    });

    DB.set('events', events);
    DB.set('shifts', shifts);
    DB.set('historicalAccruals', accruals);
    DB.set('bonus_recalc_v8d', true);
    console.log(`Bonus recalc v8d: removed ${removedDupes} old, created ${created} bonuses`);
}

// ===== ПОСТОЯННАЯ ФУНКЦИЯ: добавить пропущенные бонусы за завершённые мероприятия =====
// Запускается при каждом старте. Не удаляет существующие начисления — только добавляет отсутствующие.
function fixMissingEventBonuses() {
    const events = DB.get('events', []);
    if (events.length === 0) return;

    const CUTOFF = '2026-03-31'; // до этой даты покрыто Excel-импортом
    const salaryRules = DB.get('salaryRules', {});
    const adminRule = salaryRules.admin || { bonusPercent: 5, bonusSources: ['services', 'optionsForGame', 'options'] };
    const shifts = DB.get('shifts', []);
    const accruals = DB.get('historicalAccruals', []);
    const allEmps = DB.get('employees', []);
    let changed = false;

    events.forEach(evt => {
        if (evt.status !== 'completed') return;
        if (!evt.date || evt.date <= CUTOFF) return;

        const eventId = evt.id;
        const eventDate = evt.date;
        const evtTitle = evt.title || 'Мероприятие';

        // Собираем сотрудников: сначала из топ-уровня, затем из gameBlocks (если топ-уровень пустой)
        let instrIds = (evt.assignedInstructors && evt.assignedInstructors.length > 0)
            ? evt.assignedInstructors
            : (evt.instructors && evt.instructors.length > 0 ? evt.instructors : []);
        let adminIds = (evt.assignedAdmins && evt.assignedAdmins.length > 0)
            ? evt.assignedAdmins
            : (evt.admins && evt.admins.length > 0 ? evt.admins : []);

        // Fallback: взять сотрудников из gameBlocks если топ-уровень пуст
        if (instrIds.length === 0 && adminIds.length === 0 && evt.gameBlocks && evt.gameBlocks.length > 0) {
            instrIds = [...new Set(evt.gameBlocks.flatMap(b => b.instructors || []))];
            adminIds = [...new Set(evt.gameBlocks.flatMap(b => b.admins || []))];
            // Обновить поля события чтобы следующий запуск не пересчитывал
            if (instrIds.length > 0 || adminIds.length > 0) {
                evt.instructors = instrIds;
                evt.admins = adminIds;
                evt.assignedInstructors = instrIds;
                evt.assignedAdmins = adminIds;
                changed = true;
            }
        }

        if (instrIds.length === 0 && adminIds.length === 0) return;

        // Пересчитать суммы бонусов из выручки (чтобы исправить evt.bonuses: { perInstructor: 0 } из-за пустого состава)
        const instrRevPerPerson = {};
        instrIds.forEach(empId => {
            const emp = allEmps.find(e => e.id === empId);
            const role = emp?.role || 'instructor';
            const rule = salaryRules[role] || salaryRules.instructor || { bonusPercent: 5, bonusSources: ['services', 'optionsForGame'] };
            const revenue = calculateEventRevenueBySources(evt, rule.bonusSources || ['services', 'optionsForGame']);
            instrRevPerPerson[empId] = Math.round(revenue * (rule.bonusPercent || 5) / 100 / Math.max(instrIds.length, 1));
        });
        const adminRevPerPerson = {};
        adminIds.forEach(empId => {
            const revenue = calculateEventRevenueBySources(evt, adminRule.bonusSources || ['services', 'optionsForGame', 'options']);
            adminRevPerPerson[empId] = Math.round(revenue * (adminRule.bonusPercent || 5) / 100 / Math.max(adminIds.length, 1));
        });

        // Обновить evt.bonuses если там были нули из-за пустого состава при завершении
        const instrBonusTotal = Object.values(instrRevPerPerson).reduce((s, v) => s + v, 0);
        const adminBonusTotal = Object.values(adminRevPerPerson).reduce((s, v) => s + v, 0);
        const perInstructor = instrIds.length > 0 ? Math.round(instrBonusTotal / instrIds.length) : 0;
        const perAdmin = adminIds.length > 0 ? Math.round(adminBonusTotal / adminIds.length) : 0;
        if (!evt.bonuses || (evt.bonuses.perInstructor === 0 && perInstructor > 0) ||
                            (evt.bonuses.perAdmin === 0 && perAdmin > 0)) {
            evt.bonuses = { instructorTotal: instrBonusTotal, adminTotal: adminBonusTotal, perInstructor, perAdmin };
            changed = true;
        }

        const checkAndCredit = (empId, amount, bonusType) => {
            if (!empId || amount <= 0) return;
            // Бонус уже на смене?
            const hasOnShift = shifts.some(s =>
                s.employeeId === empId && s.eventBonuses &&
                s.eventBonuses.some(b => String(b.eventId) === String(eventId))
            );
            if (hasOnShift) return;
            // Бонус уже в историческом начислении?
            const hasAccrual = accruals.some(a =>
                a.employeeId === empId &&
                a.id && String(a.id).startsWith('evtbonus_' + eventId + '_' + empId)
            );
            if (hasAccrual) return;
            // Добавить
            const emp = allEmps.find(e => e.id === empId);
            const roleName = bonusType === 'instructor' ? 'инструктор' : 'администратор';
            accruals.push({
                id: 'evtbonus_' + eventId + '_' + empId + '_' + Date.now() + '_' + Math.random(),
                employeeId: empId,
                employeeName: emp ? (emp.firstName + ' ' + emp.lastName) : '',
                date: eventDate,
                amount: amount,
                note: `Бонус за мероприятие "${evtTitle}" (${roleName})`
            });
            changed = true;
        };

        instrIds.forEach(id => checkAndCredit(id, instrRevPerPerson[id] || 0, 'instructor'));
        adminIds.forEach(id => checkAndCredit(id, adminRevPerPerson[id] || 0, 'admin'));
    });

    if (changed) {
        DB.set('historicalAccruals', accruals);
        DB.set('events', events);
        console.log('fixMissingEventBonuses: updated bonus accruals');
    }
}

// Сумма исторических виртуальных начислений по сотруднику в диапазоне
function getHistoricalAccrualSum(empId, startDate, endDate) {
    return DB.get('historicalAccruals', [])
        .filter(a => a.employeeId === empId && a.date >= startDate && a.date <= endDate)
        .reduce((s, a) => s + (a.amount || 0), 0);
}

// v9: Пересчитать event.price для всех мероприятий с учётом опций
function migrateV9RecalcEventPrices() {
    if (DB.get('price_recalc_v9', false)) return;
    const events = DB.get('events', []);
    if (events.length === 0) return;
    const tariffs = DB.get('tariffs', []);
    let fixed = 0;

    events.forEach(evt => {
        if (!evt.tariffId) return;
        const tariff = tariffs.find(t => String(t.id) === String(evt.tariffId));
        if (!tariff) return;

        let serviceCost = tariff.price * (evt.participants || 1);
        let optionsCost = 0;

        if (evt.optionQuantities) {
            Object.entries(evt.optionQuantities).forEach(([optId, qty]) => {
                if (qty <= 0) return;
                const opt = tariffs.find(t => String(t.id) === String(optId));
                if (!opt) return;
                if (opt.serviceId === 'Shop') {
                    optionsCost += qty; // shop: value is already roubles
                } else {
                    optionsCost += opt.price * qty;
                }
            });
        } else if (evt.selectedOptions) {
            evt.selectedOptions.forEach(optId => {
                const opt = tariffs.find(t => String(t.id) === String(optId));
                if (opt) optionsCost += opt.price;
            });
        }

        const subtotal = serviceCost + optionsCost;
        let discountAmount = 0;
        if (evt.discountType === 'percent' && evt.discount > 0) {
            discountAmount = subtotal * evt.discount / 100;
        } else if (evt.discountType === 'certificate' && evt.certificateAmount > 0) {
            discountAmount = evt.certificateAmount;
        }
        const correctPrice = subtotal - discountAmount;

        if (evt.price !== correctPrice) {
            console.log(`v9: Event "${evt.title}" ${evt.date}: ${evt.price} → ${correctPrice}`);
            evt.price = correctPrice;
            evt.totalPrice = correctPrice;
            evt.toPay = correctPrice - (evt.prepayment || 0);
            fixed++;
        }
    });

    if (fixed > 0) {
        DB.set('events', events);
        console.log(`Price recalc v9: fixed ${fixed} event prices`);
    }
    DB.set('price_recalc_v9', true);
}

// Открыть карточку с неоплаченными начислениями для сотрудника (FIFO)
function showUnpaidAccrualsModal(empId) {
    const emp = DB.get('employees', []).find(e => e.id === empId);
    if (!emp) return;
    const START = '2020-01-01';
    const today = todayLocal();
    // Собрать все начисления
    const accruals = [];
    DB.get('shifts', [])
        .filter(s => s.employeeId === empId && s.endTime && s.earnings && (s.shiftRole || s.employeeRole) !== 'manager')
        .forEach(s => accruals.push({ date: s.date, amount: s.earnings.total || 0, type: 'Смена', note: s.earnings.bonusDetail || '' }));
    getManagerDailyAccruals(emp, START, today).forEach(a => accruals.push({ date: a.date, amount: a.amount, type: 'Менеджер', note: '' }));
    DB.get('historicalAccruals', [])
        .filter(a => a.employeeId === empId)
        .forEach(a => accruals.push({ date: a.date, amount: a.amount || 0, type: 'Историческое', note: a.note || '' }));
    // Сортировка хронологически (старые → новые)
    accruals.sort((a, b) => a.date.localeCompare(b.date));
    // Сумма всех выплат
    let paidPool = getActiveSalaryPayments()
        .filter(p => p.employeeId === empId)
        .reduce((s, p) => s + (p.amount || 0), 0);
    // FIFO: выплаты гасят начисления с конца (новые) — нет, обычно с начала. Гасим с начала.
    const unpaid = [];
    for (const a of accruals) {
        if (paidPool >= a.amount) {
            paidPool -= a.amount;
        } else {
            const remaining = a.amount - paidPool;
            paidPool = 0;
            unpaid.push({ ...a, amount: remaining });
        }
    }
    const total = unpaid.reduce((s, a) => s + a.amount, 0);
    document.getElementById('unpaid-accruals-title').textContent = 'Не выплачено: ' + emp.name;
    document.getElementById('unpaid-accruals-total').textContent = formatMoney(total);
    const list = document.getElementById('unpaid-accruals-list');
    if (!unpaid.length) {
        list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-secondary);">Нет неоплаченных начислений</div>';
    } else {
        list.innerHTML = '<table class="data-table"><thead><tr><th>Дата</th><th>Тип</th><th style="text-align:right;">Сумма</th></tr></thead><tbody>' +
            unpaid.map(a => `<tr><td>${a.date.split('-').reverse().join('.')}</td><td>${a.type}${a.note ? '<br><small style="color:var(--text-secondary)">' + a.note + '</small>' : ''}</td><td style="text-align:right;">${formatMoney(a.amount)}</td></tr>`).join('') +
            '</tbody></table>';
    }
    openModal('modal-unpaid-accruals');
}
document.addEventListener('DOMContentLoaded', () => {
    const c = document.getElementById('modal-unpaid-accruals-close');
    if (c) c.addEventListener('click', () => closeModal('modal-unpaid-accruals'));
});

// v10: Switch stock tracking to document-based (compute from docs, not incremental)
function migrateV10StockBase() {
    if (DB.get('stock_docs_v10', false)) return;
    // Migrate: set stockBase so that getStockFromDocs() matches current stock value
    const stock = DB.get('stock', {});
    const fromDocs = { balls: 0, kidsBalls: 0, grenades: 0, smokes: 0 };
    DB.get('documents', []).forEach(d => {
        const k = STOCK_KEY_MAP[d.item];
        if (!k || !d.qty) return;
        if (d.type === 'incoming') fromDocs[k] += d.qty;
        else if (d.type === 'outgoing' || d.type === 'writeoff') fromDocs[k] -= d.qty;
    });
    const existingBase = DB.get('stockBase', {});
    DB.set('stockBase', {
        balls: (stock.balls || 0) - fromDocs.balls,
        kidsBalls: (stock.kidsBalls || 0) - fromDocs.kidsBalls,
        grenades: (stock.grenades || 0) - fromDocs.grenades,
        smokes: (stock.smokes || 0) - fromDocs.smokes,
        ballsCritical: existingBase.ballsCritical || stock.ballsCritical || 60000,
        kidsBallsCritical: existingBase.kidsBallsCritical || stock.kidsBallsCritical || 20000,
        grenadesCritical: existingBase.grenadesCritical || stock.grenadesCritical || 100,
        smokesCritical: existingBase.smokesCritical || stock.smokesCritical || 50,
    });
    DB.set('stock_docs_v10', true);
}

function onFirestoreReady() {
    // One-time salary import from Excel spreadsheet
    importSalaryPaymentsFromExcel();
    migrateV4RestorePostCutoffAccruals();
    migrateV5FixMissingEventBonuses();
    migrateV6RecalcStock();
    migrateV7CleanupPreAprilBonuses();
    migrateV9RecalcEventPrices();
    migrateV10StockBase();
    migrateV8RecalcEventBonuses();

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

    // Восстановить пропущенные списания для завершённых мероприятий
    fixMissingWriteoffs();

    // Восстановить пропущенные бонусы за завершённые мероприятия
    fixMissingEventBonuses();

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

// Восстановление сессии после выгрузки из памяти (мобильные)
function tryRestoreSession() {
    try {
        const savedId = localStorage.getItem('hp_session_user_id');
        if (!savedId) return false;
        const employees = DB.get('employees', []);
        const user = employees.find(e => String(e.id) === savedId);
        if (!user) { localStorage.removeItem('hp_session_user_id'); return false; }
        // Проверяем Firebase email
        const firebaseEmail = sessionStorage.getItem('hp_firebase_email');
        if (firebaseEmail && user.email && user.email.toLowerCase() !== firebaseEmail.toLowerCase()) {
            localStorage.removeItem('hp_session_user_id');
            return false;
        }
        if (user.blocked) { localStorage.removeItem('hp_session_user_id'); return false; }
        currentUser = user;
        if (user.role === 'director') {
            showScreen('app-screen');
            document.getElementById('director-name').textContent = user.firstName + ' ' + user.lastName;
            navigateTo('dashboard');
        } else {
            showScreen('employee-screen');
            setupEmployeeScreen(user);
            empNavigateTo('emp-dashboard');
        }
        if (typeof GCalSync !== 'undefined') {
            setTimeout(async () => {
                if (!GCalSync.isConnected()) await GCalSync.init();
            }, 2000);
        }
        return true;
    } catch(e) { return false; }
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
        // Сохраняем сессию для восстановления после выгрузки из памяти
        try { localStorage.setItem('hp_session_user_id', String(user.id)); } catch(e) {}
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
    try { localStorage.removeItem('hp_session_user_id'); } catch(e) {}
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

    // Sync button on employee events page
    const empEventsSyncGcal = document.getElementById('emp-events-btn-sync-gcal');
    if (empEventsSyncGcal) empEventsSyncGcal.addEventListener('click', async () => {
        if (!GCalSync.isConnected()) {
            showToast('Google Calendar не подключён. Директор должен подключить в Настройках.');
            return;
        }
        const result = await GCalSync.fullSync();
        if (result) loadEmployeeEvents();
    });

    // Sync button on employee dashboard page
    const empDashSyncGcal = document.getElementById('emp-dash-btn-sync-gcal');
    if (empDashSyncGcal) empDashSyncGcal.addEventListener('click', async () => {
        if (!GCalSync.isConnected()) {
            showToast('Google Calendar не подключён. Директор должен подключить в Настройках.');
            return;
        }
        await GCalSync.fullSync();
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

    // Base service price (support tariffGroups)
    if (sources.includes('services')) {
        const evGroups = event.tariffGroups || (event.tariffId ? [{ tariffId: event.tariffId, participants: event.participants || 1 }] : null);
        if (evGroups && evGroups.length > 0) {
            evGroups.forEach(g => {
                if (!g.tariffId) return;
                const tariff = tariffs.find(t => String(t.id) === String(g.tariffId));
                if (tariff) total += (tariff.price || 0) * (g.participants || 1);
            });
        } else {
            // No tariff — use event price as service
            total += event.price || 0;
        }
    }

    // Options for game (price × qty, same as in event price calculation)
    if (sources.includes('optionsForGame') && event.selectedOptions) {
        event.selectedOptions.forEach(optId => {
            const opt = tariffs.find(t => String(t.id) === String(optId) && t.category === 'optionsForGame');
            if (opt) {
                const qty = event.optionQuantities?.[optId] || 1;
                total += (opt.price || 0) * qty;
            }
        });
    }

    // Additional options (price × qty, NOT per participant)
    if (sources.includes('options') && event.selectedOptions) {
        event.selectedOptions.forEach(optId => {
            const opt = tariffs.find(t => String(t.id) === String(optId) && t.category === 'options');
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
    const startDate = monthStr + '-01';
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const endDate = monthStr + '-' + String(lastDay).padStart(2, '0');

    const shifts = DB.get('shifts', []).filter(s =>
        s.employeeId === employeeId &&
        s.date.startsWith(monthStr) &&
        s.endTime &&
        s.earnings &&
        (s.shiftRole || s.employeeRole) !== 'manager'
    );

    let totalEarned = shifts.reduce((sum, s) => sum + (s.earnings?.total || 0), 0);

    // Include manager daily accruals for the month
    const emp = DB.get('employees', []).find(e => e.id === employeeId);
    if (emp) {
        totalEarned += getManagerDailyAccruals(emp, startDate, endDate).reduce((s, a) => s + a.amount, 0);
    }

    // Include historical accruals (event bonuses without a shift, etc.)
    totalEarned += getHistoricalAccrualSum(employeeId, startDate, endDate);

    return { shifts, totalEarned, shiftCount: shifts.length };
}

// ===== SALARY PAYMENT HELPERS =====
function getPaymentMethodName(method) {
    const names = { cash: 'Наличные', card: 'Карта', transfer: 'Перевод', sberbank: 'Сбербанк', tbank: 'Т-Банк', raiffeisen: 'Райффайзен', alfabank: 'Альфа Банк', invoice: 'По счёту', qr: 'QR' };
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
    // До 31 марта 2026 включительно менеджерская ставка покрыта историческим импортом из Excel
    const MGR_AUTO_START = '2026-04-01';
    const roles = emp.allowedShiftRoles || getDefaultAllowedRoles(emp.role);
    const isManager = roles.includes('manager');
    const managerSince = emp.managerSince; // date string YYYY-MM-DD
    const managerUntil = emp.managerUntil; // date string YYYY-MM-DD or undefined

    if (!isManager && !managerUntil) return [];
    if (!managerSince && !isManager) return [];

    const rules = DB.get('salaryRules', {});
    const mgrRule = rules.manager || { dailyRate: 340 };
    const dailyRate = mgrRule.dailyRate || 340;

    // Determine effective range — не раньше MGR_AUTO_START
    const floorStart = startDate < MGR_AUTO_START ? MGR_AUTO_START : startDate;
    const effectiveStart = managerSince && managerSince > floorStart ? managerSince : floorStart;
    let mgrLastDay = endDate;
    if (managerUntil) {
        // Day before managerUntil is the last paid day
        const untilD = new Date(managerUntil + 'T00:00:00');
        untilD.setDate(untilD.getDate() - 1);
        const lastPaidDay = untilD.getFullYear() + '-' + String(untilD.getMonth() + 1).padStart(2, '0') + '-' + String(untilD.getDate()).padStart(2, '0');
        if (lastPaidDay < endDate) mgrLastDay = lastPaidDay;
    }
    const effectiveEnd = mgrLastDay;

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

function getEmployeeEarningsForPeriod(employeeId, period, startDateOverride, endDateOverride) {
    const { startDate, endDate } = startDateOverride
        ? { startDate: startDateOverride, endDate: endDateOverride }
        : getDateRangeForPeriod(period);
    const shifts = DB.get('shifts', []).filter(s =>
        s.employeeId === employeeId && s.date >= startDate && s.date <= endDate && s.endTime && s.earnings
        && (s.shiftRole || s.employeeRole) !== 'manager'
    );
    let totalEarned = shifts.reduce((sum, s) => sum + (s.earnings?.total || 0), 0);
    const emp = DB.get('employees', []).find(e => e.id === employeeId);
    if (emp) {
        totalEarned += getManagerDailyAccruals(emp, startDate, endDate).reduce((s, a) => s + a.amount, 0);
    }
    totalEarned += getHistoricalAccrualSum(employeeId, startDate, endDate);
    return { shifts, totalEarned, shiftCount: shifts.length };
}

function getEmployeePaymentsForPeriod(employeeId, period, startDateOverride, endDateOverride) {
    const { startDate, endDate } = startDateOverride
        ? { startDate: startDateOverride, endDate: endDateOverride }
        : getDateRangeForPeriod(period);
    const payments = getActiveSalaryPayments().filter(p =>
        p.employeeId === employeeId && p.date >= startDate && p.date <= endDate
    );
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    return { payments, totalPaid };
}

function getEmployeeTotalPaid(employeeId) {
    return getActiveSalaryPayments()
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
    document.getElementById('salary-pay-edit-id').value = '';
    document.getElementById('salary-pay-date').value = todayLocal();
    document.getElementById('salary-pay-amount').value = '';
    document.getElementById('salary-pay-note').value = '';
    const cashRadio = document.querySelector('input[name="salary-pay-method"][value="cash"]');
    if (cashRadio) cashRadio.checked = true;
    document.querySelector('#modal-salary-payment .modal-header h2').textContent = 'Выплата зарплаты';
    document.getElementById('btn-confirm-salary-payment').innerHTML = '<span class="material-icons-round">send</span> Выплатить';
    openModal('modal-salary-payment');
}

function updateSalaryPayInfo(employeeId) {
    if (!employeeId) { document.getElementById('salary-pay-info').style.display = 'none'; return; }
    const empIdNum = parseInt(employeeId);
    const emp = DB.get('employees', []).find(e => e.id === empIdNum);
    const { startDate, endDate } = getDateRangeForPeriod('month');
    const shiftsData = DB.get('shifts', []).filter(s => s.employeeId === empIdNum && s.date >= startDate && s.date <= endDate && s.endTime && s.earnings && (s.shiftRole || s.employeeRole) !== 'manager');
    const shiftEarned = shiftsData.reduce((s, sh) => s + (sh.earnings?.total || 0), 0);
    const mgrAccruals = emp ? getManagerDailyAccruals(emp, startDate, endDate) : [];
    const mgrTotal = mgrAccruals.reduce((s, a) => s + a.amount, 0);
    const histEarned = getHistoricalAccrualSum(empIdNum, startDate, endDate);
    const earned = shiftEarned + mgrTotal + histEarned;
    const paid = getActiveSalaryPayments().filter(p => p.employeeId === empIdNum && p.date >= startDate && p.date <= endDate).reduce((s, p) => s + (p.amount || 0), 0);
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
    const editId = document.getElementById('salary-pay-edit-id').value;
    const employeeId = parseInt(document.getElementById('salary-pay-employee').value);
    if (!employeeId) { showToast('Выберите сотрудника'); return; }
    const amount = parseFloat(document.getElementById('salary-pay-amount').value);
    if (!amount || amount <= 0) { showToast('Введите сумму'); return; }
    const method = document.querySelector('input[name="salary-pay-method"]:checked')?.value || 'cash';
    const note = document.getElementById('salary-pay-note').value.trim();
    const date = document.getElementById('salary-pay-date').value || todayLocal();
    const employees = DB.get('employees', []);
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return;
    const payments = DB.get('salaryPayments', []);
    if (editId) {
        const idx = payments.findIndex(p => String(p.id) === String(editId));
        if (idx >= 0) {
            payments[idx].employeeId = employeeId;
            payments[idx].employeeName = emp.firstName + ' ' + emp.lastName;
            payments[idx].amount = amount;
            payments[idx].method = method;
            payments[idx].note = note;
            payments[idx].date = date;
        }
        showToast(`Выплата обновлена: ${formatMoney(amount)} — ${emp.firstName}`);
    } else {
        payments.push({
            id: Date.now(),
            date,
            time: moscowTimeStr(),
            employeeId, employeeName: emp.firstName + ' ' + emp.lastName,
            amount, method, note
        });
        showToast(`Выплата ${formatMoney(amount)} — ${emp.firstName} (${getPaymentMethodName(method)})`);
    }
    DB.set('salaryPayments', payments);
    closeModal('modal-salary-payment');
    const empPage = document.getElementById('page-employees');
    if (empPage && empPage.classList.contains('active')) loadEmployees();
    const finPage = document.getElementById('page-finances');
    if (finPage && finPage.classList.contains('active')) loadFinances(document.querySelector('.fin-tab.active')?.dataset.fin || 'receipts');
}

function editSalaryPayment(paymentId) {
    const payments = DB.get('salaryPayments', []);
    const p = payments.find(pay => String(pay.id) === String(paymentId));
    if (!p) return;
    openSalaryPaymentModal(p.employeeId);
    document.getElementById('salary-pay-edit-id').value = p.id;
    document.getElementById('salary-pay-date').value = p.date;
    document.getElementById('salary-pay-amount').value = p.amount;
    document.getElementById('salary-pay-note').value = p.note || '';
    const methodRadio = document.querySelector(`input[name="salary-pay-method"][value="${p.method}"]`);
    if (methodRadio) methodRadio.checked = true;
    document.querySelector('#modal-salary-payment .modal-header h2').textContent = 'Редактировать выплату';
    document.getElementById('btn-confirm-salary-payment').innerHTML = '<span class="material-icons-round">save</span> Сохранить';
}

function deleteSalaryPayment(paymentId) {
    if (!confirm('Удалить эту выплату?')) return;
    const payments = DB.get('salaryPayments', []).filter(p => String(p.id) !== String(paymentId));
    DB.set('salaryPayments', payments);
    // Tombstone — чтобы платёж не вернулся из импорта/синка
    const tombs = DB.get('deletedSalaryPaymentIds', []);
    if (!tombs.includes(String(paymentId))) {
        tombs.push(String(paymentId));
        DB.set('deletedSalaryPaymentIds', tombs);
    }
    showToast('Выплата удалена');
    loadEmployees();
}

function getActiveSalaryPayments() {
    const tombs = new Set((DB.get('deletedSalaryPaymentIds', []) || []).map(String));
    return DB.get('salaryPayments', []).filter(p => !tombs.has(String(p.id)));
}

// ===== ACCRUAL CRUD =====
function openAccrualModal(preselectedEmployeeId, editId) {
    const employees = DB.get('employees', []).filter(e => e.role !== 'director');
    const sel = document.getElementById('accrual-employee');
    sel.innerHTML = employees.map(e => `<option value="${e.id}">${e.firstName} ${e.lastName}</option>`).join('');
    document.getElementById('accrual-edit-id').value = '';
    document.getElementById('accrual-date').value = todayLocal();
    document.getElementById('accrual-amount').value = '';
    document.getElementById('accrual-note').value = '';
    if (preselectedEmployeeId) sel.value = preselectedEmployeeId;
    document.querySelector('#modal-accrual .modal-header h2').textContent = 'Добавить начисление';
    document.querySelector('#btn-confirm-accrual').innerHTML = '<span class="material-icons-round">add</span> Добавить';
    if (editId) {
        const acc = DB.get('historicalAccruals', []).find(a => a.id === editId);
        if (acc) {
            document.getElementById('accrual-edit-id').value = acc.id;
            sel.value = acc.employeeId;
            document.getElementById('accrual-date').value = acc.date;
            document.getElementById('accrual-amount').value = acc.amount;
            document.getElementById('accrual-note').value = (acc.note || '').replace('Историческое начисление: ', '');
            document.querySelector('#modal-accrual .modal-header h2').textContent = 'Редактировать начисление';
            document.querySelector('#btn-confirm-accrual').innerHTML = '<span class="material-icons-round">save</span> Сохранить';
        }
    }
    openModal('modal-accrual');
}

function confirmAccrual() {
    const empId = parseInt(document.getElementById('accrual-employee').value);
    const amount = parseInt(document.getElementById('accrual-amount').value);
    const date = document.getElementById('accrual-date').value;
    const note = document.getElementById('accrual-note').value.trim();
    const editId = document.getElementById('accrual-edit-id').value;
    if (!empId || !amount || amount <= 0) { showToast('Укажите сотрудника и сумму', 'error'); return; }
    if (!date) { showToast('Укажите дату', 'error'); return; }
    const emp = DB.get('employees', []).find(e => e.id === empId);
    const empName = emp ? `${emp.firstName} ${emp.lastName}` : '';
    let accruals = DB.get('historicalAccruals', []);
    if (editId) {
        const idx = accruals.findIndex(a => a.id === editId);
        if (idx !== -1) {
            accruals[idx].date = date;
            accruals[idx].amount = amount;
            accruals[idx].note = note ? 'Историческое начисление: ' + note : '';
            accruals[idx].employeeId = empId;
            accruals[idx].employeeName = empName;
        }
        showToast('Начисление обновлено');
    } else {
        accruals.push({
            id: 'h' + Date.now(),
            employeeId: empId,
            employeeName: empName,
            date: date,
            amount: amount,
            note: note ? 'Историческое начисление: ' + note : ''
        });
        showToast('Начисление добавлено');
    }
    DB.set('historicalAccruals', accruals);
    closeModal('modal-accrual');
    loadEmployees();
}

function editAccrual(accrualId) {
    const acc = DB.get('historicalAccruals', []).find(a => a.id === accrualId);
    if (!acc) return;
    openAccrualModal(acc.employeeId, accrualId);
}

function deleteAccrual(accrualId) {
    if (!confirm('Удалить это начисление?')) return;
    const accruals = DB.get('historicalAccruals', []).filter(a => a.id !== accrualId);
    DB.set('historicalAccruals', accruals);
    showToast('Начисление удалено');
    loadEmployees();
}

// ===== EDIT SHIFT EARNINGS (директор) =====
function editShiftEarnings(shiftId) {
    const shifts = DB.get('shifts', []);
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return;
    const e = shift.earnings || {};
    const base = e.base || 0;
    const instrBonus = (shift.eventBonuses || []).filter(b => b.bonusType !== 'admin').reduce((s, b) => s + (b.amount || 0), 0);
    const adminBonus = (shift.eventBonuses || []).filter(b => b.bonusType === 'admin').reduce((s, b) => s + (b.amount || 0), 0);
    const total = e.total || (base + instrBonus + adminBonus);

    document.getElementById('edit-shift-id').value = shiftId;
    document.getElementById('edit-shift-base').value = base;
    document.getElementById('edit-shift-instr-bonus').value = instrBonus;
    document.getElementById('edit-shift-admin-bonus').value = adminBonus;
    document.getElementById('edit-shift-total').textContent = formatMoney(total);
    document.getElementById('edit-shift-info').textContent = `${shift.date} | ${shift.startTime || '?'} — ${shift.endTime || '?'}`;
    recalcShiftTotal();
    openModal('modal-edit-shift');
}

function recalcShiftTotal() {
    const base = parseInt(document.getElementById('edit-shift-base').value) || 0;
    const instr = parseInt(document.getElementById('edit-shift-instr-bonus').value) || 0;
    const admin = parseInt(document.getElementById('edit-shift-admin-bonus').value) || 0;
    document.getElementById('edit-shift-total').textContent = formatMoney(base + instr + admin);
}

function saveShiftEarnings() {
    const shiftId = parseInt(document.getElementById('edit-shift-id').value);
    const base = parseInt(document.getElementById('edit-shift-base').value) || 0;
    const instrBonus = parseInt(document.getElementById('edit-shift-instr-bonus').value) || 0;
    const adminBonus = parseInt(document.getElementById('edit-shift-admin-bonus').value) || 0;
    const total = base + instrBonus + adminBonus;
    const shifts = DB.get('shifts', []);
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return;
    shift.earnings = { ...shift.earnings, base, total };
    // Rebuild eventBonuses
    shift.eventBonuses = [];
    if (instrBonus > 0) shift.eventBonuses.push({ bonusType: 'instructor', amount: instrBonus });
    if (adminBonus > 0) shift.eventBonuses.push({ bonusType: 'admin', amount: adminBonus });
    DB.set('shifts', shifts);
    closeModal('modal-edit-shift');
    showToast('Начисление за смену обновлено');
    loadEmployees();
}

function editMgrDailyRate(empId) {
    const rules = DB.get('salaryRules', {});
    const current = (rules.manager || {}).dailyRate || 340;
    const newRate = prompt('Дневная ставка менеджера (₽):', current);
    if (newRate === null) return;
    const rate = parseInt(newRate);
    if (isNaN(rate) || rate < 0) { showToast('Неверная сумма', 'error'); return; }
    rules.manager = { ...(rules.manager || {}), dailyRate: rate };
    DB.set('salaryRules', rules);
    showToast(`Ставка менеджера: ${formatMoney(rate)}/день`);
    loadEmployees();
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
                    <span>${formatParticipants(e)} · ${formatDuration(e.duration)} · ${formatMoney(e.price)}</span>
                    ${getStaffBadges(e) ? `<span style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px;">${getStaffBadges(e)}</span>` : ''}
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
// Staff captured from DOM in completeEventFromModal — used as authoritative source in
// completeEventPayment to avoid reading stale cache if _loadAll races the debounced write.
let _pendingEventStaff = null;

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

    // === CALCULATE CONSUMABLES PREVIEW ===
    {
        const tariffs = DB.get('tariffs', []);
        let totalBalls = 0, totalKidsBalls = 0, totalGrenades = 0, totalSmokes = 0;
        const isKidball = evt.type === 'kidball' || (evt.title || '').toLowerCase().includes('кидбол');
        const evtGroups = evt.tariffGroups || (evt.tariffId ? [{ tariffId: evt.tariffId, participants: evt.participants || 1 }] : []);
        evtGroups.forEach(g => {
            if (!g.tariffId) return;
            const tariff = tariffs.find(t => String(t.id) === String(g.tariffId));
            if (!tariff) return;
            const ppl = g.participants || 1;
            const kbpp = tariff.kidsBallsPerPerson || 0;
            const bpp = tariff.ballsPerPerson || 0;
            if (kbpp > 0) totalKidsBalls += kbpp * ppl;
            else if (bpp > 0) { if (isKidball) totalKidsBalls += bpp * ppl; else totalBalls += bpp * ppl; }
            totalGrenades += (tariff.grenadesPerPerson || 0) * ppl;
            totalSmokes += (tariff.smokesPerPerson || 0) * ppl;
        });
        if (evt.selectedOptions && evt.selectedOptions.length > 0) {
            evt.selectedOptions.forEach(optId => {
                const opt = tariffs.find(t => String(t.id) === String(optId));
                if (opt) {
                    const qty = evt.optionQuantities?.[optId] || 1;
                    const ppl = evt.participants || 1;
                    const kbpp = opt.kidsBallsPerPerson || 0;
                    const bpp = opt.ballsPerPerson || 0;
                    if (kbpp > 0) totalKidsBalls += kbpp * qty * ppl;
                    else if (bpp > 0) { if (isKidball) totalKidsBalls += bpp * qty * ppl; else totalBalls += bpp * qty * ppl; }
                    totalGrenades += (opt.grenadesPerPerson || 0) * qty;
                    totalSmokes += (opt.smokesPerPerson || 0) * qty;
                }
            });
        }
        // Populate editable consumable fields
        const hasConsumables = totalBalls > 0 || totalKidsBalls > 0 || totalGrenades > 0 || totalSmokes > 0;
        const sec = document.getElementById('payment-consumables-section');
        if (sec) sec.style.display = hasConsumables ? 'block' : 'none';
        const showRow = (rowId, inputId, value) => {
            const row = document.getElementById(rowId);
            const inp = document.getElementById(inputId);
            if (row) row.style.display = value > 0 ? 'flex' : 'none';
            if (inp) inp.value = value > 0 ? value : '';
        };
        showRow('payment-consumable-balls-row', 'payment-consumable-balls', totalBalls);
        showRow('payment-consumable-kids-balls-row', 'payment-consumable-kids-balls', totalKidsBalls);
        showRow('payment-consumable-grenades-row', 'payment-consumable-grenades', totalGrenades);
        showRow('payment-consumable-smokes-row', 'payment-consumable-smokes', totalSmokes);
    }

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
    // Prefer _pendingEventStaff (captured directly from DOM in completeEventFromModal, zero race risk).
    // Fall back to the cached event data if completing via a different path (e.g. direct API call).
    // Use _pendingEventStaff only if it has non-empty arrays; ?? doesn't fallback on [].
    const selectedInstructors = (_pendingEventStaff?.instructors?.length > 0)
        ? _pendingEventStaff.instructors
        : (events[idx].instructors?.length > 0 ? events[idx].instructors : (events[idx].assignedInstructors ?? []));
    const selectedAdmins = (_pendingEventStaff?.admins?.length > 0)
        ? _pendingEventStaff.admins
        : (events[idx].admins?.length > 0 ? events[idx].admins : (events[idx].assignedAdmins ?? []));
    _pendingEventStaff = null; // consume once — don't leak into subsequent completions

    const salaryRules = DB.get('salaryRules', {});
    const adminRule = salaryRules.admin || { bonusPercent: 5, bonusSources: ['services', 'optionsForGame', 'options'] };
    const allEmpsForBonus = DB.get('employees', []);

    // Per-person instructor bonus: each uses their own role's % / total instr count
    const instrBonusPerPerson = {};
    if (selectedInstructors.length > 0) {
        selectedInstructors.forEach(empId => {
            const emp = allEmpsForBonus.find(e => e.id === empId);
            const role = emp?.role || 'instructor';
            const rule = salaryRules[role] || salaryRules.instructor || { bonusPercent: 5, bonusSources: ['services', 'optionsForGame'] };
            const revenue = calculateEventRevenueBySources(events[idx], rule.bonusSources || ['services', 'optionsForGame']);
            instrBonusPerPerson[empId] = Math.round(revenue * (rule.bonusPercent || 5) / 100 / selectedInstructors.length);
        });
    }

    // Per-person admin bonus: all admins use admin rule / total admin count
    const adminBonusPerPerson = {};
    if (selectedAdmins.length > 0) {
        selectedAdmins.forEach(empId => {
            const revenue = calculateEventRevenueBySources(events[idx], adminRule.bonusSources || ['services', 'optionsForGame', 'options']);
            adminBonusPerPerson[empId] = Math.round(revenue * (adminRule.bonusPercent || 5) / 100 / selectedAdmins.length);
        });
    }

    const instrBonusTotal = Object.values(instrBonusPerPerson).reduce((s, v) => s + v, 0);
    const adminBonusTotal = Object.values(adminBonusPerPerson).reduce((s, v) => s + v, 0);
    const perInstructor = selectedInstructors.length > 0 ? Math.round(instrBonusTotal / selectedInstructors.length) : 0;
    const perAdmin = selectedAdmins.length > 0 ? Math.round(adminBonusTotal / selectedAdmins.length) : 0;

    // Explicitly update both fields so _writeEvents always gets non-empty arrays even if
    // _loadAll replaced the cache with admins:[] before completeEventPayment ran.
    events[idx].instructors = selectedInstructors;
    events[idx].admins = selectedAdmins;
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
        // Only match CLOSED shifts (endTime set). Open shifts are invisible in the director's
        // accruals table (filtered by endTime && earnings), so crediting to them hides the bonus.
        let shiftIdx = shifts.findIndex(s => s.date === eventDate && s.employeeId === empId && s.endTime);
        if (shiftIdx < 0 && eventDate !== todayStr2) {
            shiftIdx = shifts.findIndex(s => s.date === todayStr2 && s.employeeId === empId && s.endTime);
        }
        if (shiftIdx >= 0) {
            if (!shifts[shiftIdx].eventBonuses) shifts[shiftIdx].eventBonuses = [];
            shifts[shiftIdx].eventBonuses.push({ eventId: events[idx].id, eventTitle: evtTitle, amount, bonusType });
            shifts[shiftIdx].earnings = calculateShiftEarnings(shifts[shiftIdx]);
        } else {
            // No closed shift found — save bonus as historical accrual (always visible immediately)
            const emps = DB.get('employees', []);
            const emp = emps.find(e => e.id === empId);
            const empName = emp ? (emp.firstName + ' ' + emp.lastName) : '';
            const roleName = bonusType === 'instructor' ? 'инструктор' : 'администратор';
            const accruals = DB.get('historicalAccruals', []);
            accruals.push({
                id: 'evtbonus_' + events[idx].id + '_' + empId + '_' + Date.now(),
                employeeId: empId,
                employeeName: empName,
                date: eventDate,
                amount: amount,
                note: `Бонус за мероприятие "${evtTitle}" (${roleName})`
            });
            DB.set('historicalAccruals', accruals);
        }
    };

    selectedInstructors.forEach(id => creditBonus(id, instrBonusPerPerson[id] ?? perInstructor, 'instructor'));
    selectedAdmins.forEach(id => creditBonus(id, adminBonusPerPerson[id] ?? perAdmin, 'admin'));
    DB.set('shifts', shifts);

    // === AUTO-DEDUCT CONSUMABLES FROM STOCK ===
    // Read values from the editable fields in the payment modal (pre-calculated in openPaymentModal).
    // User may have corrected the amounts — always trust the fields, not tariff recalculation.
    const evt = events[idx];
    const totalBalls     = parseInt(document.getElementById('payment-consumable-balls')?.value)      || 0;
    const totalKidsBalls = parseInt(document.getElementById('payment-consumable-kids-balls')?.value) || 0;
    const totalGrenades  = parseInt(document.getElementById('payment-consumable-grenades')?.value)   || 0;
    const totalSmokes    = parseInt(document.getElementById('payment-consumable-smokes')?.value)     || 0;

    // Auto-create write-off documents for consumables used
    if (totalBalls > 0 || totalKidsBalls > 0 || totalGrenades > 0 || totalSmokes > 0) {
        events[idx].consumablesUsed = { balls: totalBalls, kidsBalls: totalKidsBalls, grenades: totalGrenades, smokes: totalSmokes };

        // === AUTO-CREATE WRITE-OFF DOCUMENTS ===
        const docs = DB.get('documents', []);
        const evtDate = events[idx].date || todayLocal();
        const evtName = events[idx].title || 'Мероприятие';
        const participants = events[idx].participants || 0;
        const writeoffItems = [
            { item: 'Пейнтбольные шары 0.68',       qty: totalBalls },
            { item: 'Детские пейнтбольные шары 0.50', qty: totalKidsBalls },
            { item: 'Гранаты',                        qty: totalGrenades },
            { item: 'Дымы',                           qty: totalSmokes }
        ];
        writeoffItems.forEach(wi => {
            if (wi.qty > 0) {
                docs.push({
                    id: Date.now() + Math.random(),
                    type: 'writeoff',
                    date: evtDate,
                    item: wi.item,
                    qty: wi.qty,
                    amount: 0,
                    delivery: 0,
                    comment: `Авто: ${evtName} (${participants} чел.)`,
                    eventId: events[idx].id
                });
            }
        });
        DB.set('documents', docs);
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
    if (totalBalls > 0 || totalKidsBalls > 0 || totalGrenades > 0 || totalSmokes > 0) {
        const parts = [];
        if (totalBalls > 0) parts.push(`${totalBalls} шаров 0.68`);
        if (totalKidsBalls > 0) parts.push(`${totalKidsBalls} шаров 0.50`);
        if (totalGrenades > 0) parts.push(`${totalGrenades} гранат`);
        if (totalSmokes > 0) parts.push(`${totalSmokes} дымов`);
        toastMsg += ` | Списано: ${parts.join(', ')}`;
    }
    showToast(toastMsg);

    // Sync status update to Google Calendar
    if (GCalSync.isConnected()) {
        const completedEv = events[idx];
        if (completedEv) GCalSync.pushEvent(completedEv);
    }

    // Reload current page — employee view
    if (document.getElementById('emp-page-events')?.classList.contains('active')) {
        loadEmployeeEvents();
    }
    // Reload director pages that need to reflect the completion
    if (document.getElementById('page-finances')?.classList.contains('active')) loadFinances();
    if (document.getElementById('page-schedule')?.classList.contains('active')) renderCalendar();
    if (document.getElementById('page-dashboard')?.classList.contains('active')) loadDashboard();
    // Refresh stock page if open (consumables were just deducted)
    if (document.getElementById('page-stock')?.classList.contains('active')) loadStock();
    // Always reload employees — bonuses just credited to historicalAccruals must appear immediately
    loadEmployees();
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

    // Shifts table — one row per day, aggregated across all shifts
    const tbody = document.getElementById('emp-salary-table-body');
    const { startDate: salStart, endDate: salEnd } = getDateRangeForPeriod(period);

    // All shifts for current user in period
    const allEmpShifts = DB.get('shifts', []).filter(s =>
        s.employeeId === currentUser.id &&
        (s.shiftRole || s.employeeRole) !== 'manager' &&
        s.date >= salStart && s.date <= salEnd
    );

    // Manager accruals for the period
    const emp = DB.get('employees', []).find(e => e.id === currentUser.id);
    const mgrAccruals = emp ? getManagerDailyAccruals(emp, salStart, salEnd) : [];
    const mgrByDate = {};
    mgrAccruals.forEach(a => { mgrByDate[a.date] = (mgrByDate[a.date] || 0) + a.amount; });

    // Historical accruals for the period
    // Event-bonus accruals on days that have a shift → merge into the shift row (not shown separately)
    const datesWithShift = new Set(allEmpShifts.map(s => s.date));
    const histEventBonusInstrByDate = {}; // date → total instructor bonus from hist accruals
    const histEventBonusAdminByDate = {}; // date → total admin bonus from hist accruals

    const histAccruals = DB.get('historicalAccruals', []).filter(a => {
        if (a.employeeId !== currentUser.id) return false;
        if (a.date < salStart || a.date > salEnd) return false;
        const isEventBonus = (a.note || '').includes('инструктор') || (a.note || '').includes('администратор') || (a.note || '').includes('Бонус за мероприятие');
        if (isEventBonus && datesWithShift.has(a.date)) {
            // Merge into shift row
            const isAdm = (a.note || '').includes('администратор');
            if (isAdm) {
                histEventBonusAdminByDate[a.date] = (histEventBonusAdminByDate[a.date] || 0) + (a.amount || 0);
            } else {
                histEventBonusInstrByDate[a.date] = (histEventBonusInstrByDate[a.date] || 0) + (a.amount || 0);
            }
            return false; // exclude from separate hist rows
        }
        return true;
    });

    // Build unique dates
    const allDates = new Set([
        ...allEmpShifts.map(s => s.date),
        ...mgrAccruals.map(a => a.date)
    ]);

    const shiftHtml = [...allDates].sort((a, b) => b.localeCompare(a)).map(date => {
        const shiftsForDate = allEmpShifts.filter(s => s.date === date);
        const mgrAmount = mgrByDate[date] || 0;
        const dateF = new Date(date + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

        let startTime = '—', endTime = '—', hours = '—', base = 0, instrBonus = 0, adminBonus = 0;

        if (shiftsForDate.length > 0) {
            const starts = shiftsForDate.map(s => s.startTime).filter(Boolean);
            const ends   = shiftsForDate.map(s => s.endTime).filter(Boolean);
            if (starts.length) startTime = starts.reduce((min, t) => t < min ? t : min);
            if (ends.length)   endTime   = ends.reduce((max, t) => t > max ? t : max);

            if (startTime !== '—' && endTime !== '—') {
                const [sh, sm] = startTime.split(':').map(Number);
                const [eh, em] = endTime.split(':').map(Number);
                const mins = (eh * 60 + em) - (sh * 60 + sm);
                hours = mins > 0 ? (mins / 60).toFixed(1) + 'ч' : '—';
            }

            shiftsForDate.forEach(s => {
                base += s.earnings?.base || 0;
                (s.eventBonuses || []).forEach(b => {
                    if (b.bonusType === 'admin') adminBonus += (b.amount || 0);
                    else instrBonus += (b.amount || 0);
                });
            });
            // Add event-bonus hist accruals merged into this date's shift row
            instrBonus += histEventBonusInstrByDate[date] || 0;
            adminBonus += histEventBonusAdminByDate[date] || 0;
        }

        const total = base + instrBonus + adminBonus + mgrAmount;
        return `<tr>
            <td>${dateF}</td>
            <td>${startTime}</td>
            <td>${endTime}</td>
            <td>${hours}</td>
            <td>${base > 0 ? formatMoney(base) : '—'}</td>
            <td style="color:var(--green)">${instrBonus > 0 ? formatMoney(instrBonus) : '—'}</td>
            <td style="color:var(--green)">${adminBonus > 0 ? formatMoney(adminBonus) : '—'}</td>
            <td style="color:var(--accent)">${mgrAmount > 0 ? formatMoney(mgrAmount) : '—'}</td>
            <td style="font-weight:700">${formatMoney(total)}</td>
        </tr>`;
    }).join('');

    const histHtml = histAccruals.sort((a, b) => b.date.localeCompare(a.date)).map(a => {
        const dateF = new Date(a.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const isInstr = (a.note || '').includes('инструктор');
        const isAdm   = (a.note || '').includes('администратор');
        return `<tr style="background:rgba(33,150,243,0.07);">
            <td>${dateF}</td>
            <td colspan="2" style="font-size:12px;color:var(--text-secondary);">${(a.note || 'Начисление').replace('Историческое начисление: ', '')}</td>
            <td>—</td>
            <td>—</td>
            <td style="color:var(--green)">${isInstr ? formatMoney(a.amount) : '—'}</td>
            <td style="color:var(--green)">${isAdm  ? formatMoney(a.amount) : '—'}</td>
            <td>—</td>
            <td style="font-weight:700">${formatMoney(a.amount)}</td>
        </tr>`;
    }).join('');

    if (!shiftHtml && !histHtml) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Нет начислений за период</td></tr>';
    } else {
        tbody.innerHTML = shiftHtml + histHtml;
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
                    <span>${formatParticipants(e)} · ${formatDuration(e.duration)}</span>
                    ${getStaffBadges(e) ? `<span style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px;">${getStaffBadges(e)}</span>` : ''}
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
                ${t.slug ? `<span><span class="material-icons-round">tag</span> ${t.slug}</span>` : ''}
                ${t.duration ? `<span><span class="material-icons-round">timer</span> ${t.duration} мин</span>` : ''}
                ${t.minPeople ? `<span><span class="material-icons-round">group</span> от ${t.minPeople} чел.</span>` : ''}
                ${t.ageRange ? `<span><span class="material-icons-round">child_care</span> ${t.ageRange} лет</span>` : ''}
                ${(t.ballsPerPerson || t.kidsBallsPerPerson || t.grenadesPerPerson || t.smokesPerPerson || t.freePrice) ? `<div class="tariff-consumables">
                    ${t.ballsPerPerson ? `<span class="consumable-badge balls">${t.ballsPerPerson} шаров 0.68</span>` : ''}
                    ${t.kidsBallsPerPerson ? `<span class="consumable-badge balls">${t.kidsBallsPerPerson} шаров 0.50</span>` : ''}
                    ${t.grenadesPerPerson ? `<span class="consumable-badge grenades">${t.grenadesPerPerson} гранат</span>` : ''}
                    ${t.smokesPerPerson ? `<span class="consumable-badge smokes">${t.smokesPerPerson} дым</span>` : ''}
                    ${t.freePrice ? `<span class="consumable-badge">свободная цена</span>` : ''}
                </div>` : ''}
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
let revenuePeriodType = 'month';
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
        .reduce((sum, e) => sum + (e.price || 0), 0)
        + getHistoricalSalesSum(startDate, endDate);

    const prevRevenue = events
        .filter(e => e.date >= prevStartDate && e.date <= prevEndDate && e.status === 'completed' && (e.price || 0) > 0)
        .reduce((sum, e) => sum + (e.price || 0), 0)
        + getHistoricalSalesSum(prevStartDate, prevEndDate);

    const change = prevRevenue > 0 ? Math.round((currentRevenue / prevRevenue - 1) * 100) : (currentRevenue > 0 ? 100 : 0);

    return { currentRevenue, prevRevenue, change };
}

// Исторические продажи из Excel (только для аналитики директора)
// Daily записи включаются только за даты БЕЗ завершённых CRM-мероприятий (чтобы не дублировать).
// Annual записи (y:1) за 2024 включаются всегда (CRM тогда не работал).
function _buildCrmDateSet() {
    // Строим Set дат с завершёнными CRM-мероприятиями (вызывается только после загрузки данных)
    const events = DB.get('events', []);
    return new Set(events.filter(e => e.status === 'completed' && e.date).map(e => e.date));
}

function getHistoricalSalesSum(startDate, endDate) {
    if (typeof HISTORICAL_SALES_DATA === 'undefined') return 0;
    const crmDates = _buildCrmDateSet();
    let sum = 0;
    const startYear = parseInt(startDate.split('-')[0]);
    const endYear = parseInt(endDate.split('-')[0]);
    HISTORICAL_SALES_DATA.forEach(s => {
        if (s.y) {
            // Годовые сводки
            const recYear = parseInt(s.d.split('-')[0]);
            if (recYear >= startYear && recYear <= endYear) {
                const yearStart = `${recYear}-01-01`;
                const yearEnd = `${recYear}-12-31`;
                if (startDate <= yearStart && endDate >= yearEnd) {
                    sum += s.a || 0;
                } else {
                    const effStart = startDate > yearStart ? startDate : yearStart;
                    const effEnd = endDate < yearEnd ? endDate : yearEnd;
                    const startM = parseInt(effStart.split('-')[1]);
                    const endM = parseInt(effEnd.split('-')[1]);
                    const months = endM - startM + 1;
                    sum += Math.round((s.a || 0) * months / 12);
                }
            }
        } else {
            // Daily записи: включаем только если за эту дату НЕТ завершённых CRM-событий
            if (s.d >= startDate && s.d <= endDate && !crmDates.has(s.d)) {
                sum += s.a || 0;
            }
        }
    });
    return sum;
}

function getHistoricalSalesForDate(dateStr) {
    if (typeof HISTORICAL_SALES_DATA === 'undefined') return 0;
    if (_buildCrmDateSet().has(dateStr)) return 0;
    return HISTORICAL_SALES_DATA
        .filter(s => s.d === dateStr && !s.y)
        .reduce((sum, s) => sum + (s.a || 0), 0);
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
    // Добавить исторические продажи (annual + daily без дублей с CRM)
    if (typeof HISTORICAL_SALES_DATA !== 'undefined') {
        const crmDates = _buildCrmDateSet();
        HISTORICAL_SALES_DATA.forEach(s => {
            if (s.y) {
                if (parseInt(s.d.split('-')[0]) === year) {
                    const perMonth = Math.round((s.a || 0) / 12);
                    for (let i = 0; i < 12; i++) monthly[i] += perMonth;
                }
            } else if (!crmDates.has(s.d)) {
                const parts = s.d.split('-');
                if (parseInt(parts[0]) === year) {
                    const monthIdx = parseInt(parts[1]) - 1;
                    if (monthIdx >= 0 && monthIdx < 12) monthly[monthIdx] += s.a || 0;
                }
            }
        });
    }
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
        // Historical sales distributed to 12:00 slot for daily view
        const hToday = getHistoricalSalesForDate(todayStr);
        const hYest = getHistoricalSalesForDate(yestStr);
        if (hToday > 0) currentData[4] += hToday; // 12:00
        if (hYest > 0) prevData[4] += hYest;
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
            currentData[i] += getHistoricalSalesForDate(d1s);
            prevData[i] += getHistoricalSalesForDate(d2s);
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
        // Historical daily records (только за даты без CRM-событий)
        if (typeof HISTORICAL_SALES_DATA !== 'undefined') {
            const crmDates = _buildCrmDateSet();
            HISTORICAL_SALES_DATA.forEach(s => {
                if (s.y || crmDates.has(s.d)) return;
                const parts = s.d.split('-');
                const y = parseInt(parts[0]), m = parseInt(parts[1]) - 1, day = parseInt(parts[2]);
                if (y === selY && m === selM - 1 && day <= maxDays) currentData[day - 1] += s.a || 0;
                if (y === prevM.getFullYear() && m === prevM.getMonth() && day <= maxDays) prevData[day - 1] += s.a || 0;
            });
        }
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

    const employees = DB.get('employees', []);
    list.innerHTML = shifts.map(s => {
        // Resolve name from employees list (rowToShift leaves employeeName blank)
        const emp = employees.find(e => e.id === s.employeeId);
        const displayName = (emp ? emp.firstName + ' ' + emp.lastName : null)
            || s.employeeName || '—';
        const roleName = getRoleName(s.shiftRole) || s.shiftRole;
        const badge = s.endTime
            ? `<span class="list-item-badge badge-orange">${s.startTime} – ${s.endTime}</span>`
            : `<span class="list-item-badge badge-green">${s.startTime} – …</span>`;
        return `
            <div class="list-item">
                <span class="material-icons-round">person</span>
                <div class="list-item-info">
                    <strong>${displayName}</strong>
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

const STOCK_KEY_MAP = {
    'Пейнтбольные шары 0.68': 'balls',
    'Детские пейнтбольные шары 0.50': 'kidsBalls',
    'Гранаты': 'grenades',
    'Дымы': 'smokes'
};

function getStockFromDocs() {
    const base = DB.get('stockBase', {});
    const result = {
        balls: base.balls || 0,
        kidsBalls: base.kidsBalls || 0,
        grenades: base.grenades || 0,
        smokes: base.smokes || 0
    };
    DB.get('documents', []).forEach(d => {
        const k = STOCK_KEY_MAP[d.item];
        if (!k || !d.qty) return;
        if (d.type === 'incoming') result[k] += d.qty;
        else if (d.type === 'outgoing' || d.type === 'writeoff') result[k] -= d.qty;
    });
    return result;
}

function loadStock() {
    const stock = getStockFromDocs();
    const stockMeta = DB.get('stockBase', {});

    const renderStockItem = (id, value, critical) => {
        const el = document.getElementById(id);
        if (!el) return;
        const v = value || 0;
        el.textContent = v.toLocaleString('ru-RU');
        el.style.color = v < 0 ? 'var(--red)' : '';
        // Bar: negative = 0%, warning if below critical
        const pct = v <= 0 ? 0 : Math.min(100, (v / (critical || 1)) * 100);
        const bar = document.getElementById(id + '-bar');
        if (bar) { bar.style.width = pct + '%'; bar.className = 'stock-bar-fill' + (v < critical ? ' warning' : ''); }
        const warn = document.getElementById(id + '-warning');
        if (warn) warn.textContent = v < critical ? `Ниже критического уровня (${(critical || 0).toLocaleString('ru-RU')})` : '';
    };

    renderStockItem('stock-balls', stock.balls, stockMeta.ballsCritical || 60000);
    renderStockItem('stock-kids-balls', stock.kidsBalls, stockMeta.kidsBallsCritical || 20000);
    renderStockItem('stock-grenades', stock.grenades, stockMeta.grenadesCritical || 100);
    renderStockItem('stock-smokes', stock.smokes, stockMeta.smokesCritical || 50);
}

// ===== STOCK INVENTORY (manual set) =====
function openStockInventoryModal() {
    const computed = getStockFromDocs();
    document.getElementById('inv-balls').value = computed.balls ?? 0;
    document.getElementById('inv-kids-balls').value = computed.kidsBalls ?? 0;
    document.getElementById('inv-grenades').value = computed.grenades ?? 0;
    document.getElementById('inv-smokes').value = computed.smokes ?? 0;
    openModal('modal-stock-inventory');
}

function saveStockInventory() {
    // User enters actual stock counts → compute base = actual - fromDocs
    const userBalls = parseInt(document.getElementById('inv-balls').value) ?? 0;
    const userKidsBalls = parseInt(document.getElementById('inv-kids-balls').value) ?? 0;
    const userGrenades = parseInt(document.getElementById('inv-grenades').value) ?? 0;
    const userSmokes = parseInt(document.getElementById('inv-smokes').value) ?? 0;

    // Compute what documents contribute
    const fromDocs = { balls: 0, kidsBalls: 0, grenades: 0, smokes: 0 };
    DB.get('documents', []).forEach(d => {
        const k = STOCK_KEY_MAP[d.item];
        if (!k || !d.qty) return;
        if (d.type === 'incoming') fromDocs[k] += d.qty;
        else if (d.type === 'outgoing' || d.type === 'writeoff') fromDocs[k] -= d.qty;
    });

    const stockBase = DB.get('stockBase', {});
    stockBase.balls = userBalls - fromDocs.balls;
    stockBase.kidsBalls = userKidsBalls - fromDocs.kidsBalls;
    stockBase.grenades = userGrenades - fromDocs.grenades;
    stockBase.smokes = userSmokes - fromDocs.smokes;
    DB.set('stockBase', stockBase);
    closeModal('modal-stock-inventory');
    loadStock();
    showToast('Остатки склада обновлены');
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

// Историческая отметка не используется — вместо этого historicalAccruals
// (виртуальные начисления, синхронные импортированным выплатам по датам).

function renderSalaryAnalytics(employees, allShifts, allPayments, globalEndDate) {
    const contentEl = document.getElementById('salary-analytics-content');
    if (!contentEl) return;

    const now = moscowNow();
    const { aStart, aEnd } = getSalaryPeriodRange();

    const periodNames = { month: 'Текущий месяц', quarter: 'Текущий квартал', year: 'Текущий год' };

    let totalFundEarned = 0, totalFundPaid = 0;

    const empRows = employees.map(emp => {
        // Period earned (within selected period) — реальные смены + менеджерская ставка + исторические начисления
        const shifts = allShifts.filter(s => s.employeeId === emp.id && s.date >= aStart && s.date <= aEnd && (s.shiftRole || s.employeeRole) !== 'manager');
        const shiftEarned = shifts.reduce((s, sh) => s + (sh.earnings?.total || 0), 0);
        const mgrEarned = getManagerDailyAccruals(emp, aStart, aEnd).reduce((s, a) => s + a.amount, 0);
        const histEarned = getHistoricalAccrualSum(emp.id, aStart, aEnd);
        const earned = shiftEarned + mgrEarned + histEarned;

        // Payments made in this period
        const paid = allPayments.filter(p => p.employeeId === emp.id && p.date >= aStart && p.date <= aEnd).reduce((s, p) => s + (p.amount || 0), 0);

        // Cumulative balance: всё начислено − всё выплачено до конца периода
        const cumEarned = allShifts.filter(s => s.employeeId === emp.id && s.date <= aEnd && (s.shiftRole || s.employeeRole) !== 'manager')
            .reduce((s, sh) => s + (sh.earnings?.total || 0), 0)
            + getManagerDailyAccruals(emp, '2020-01-01', aEnd).reduce((s, a) => s + a.amount, 0)
            + getHistoricalAccrualSum(emp.id, '2020-01-01', aEnd);
        const cumPaid = allPayments.filter(p => p.employeeId === emp.id && p.date <= aEnd).reduce((s, p) => s + (p.amount || 0), 0);
        const balance = cumEarned - cumPaid;

        totalFundEarned += earned;
        totalFundPaid += paid;

        // Per-employee balance shown in table: all-time cumulative (to see who needs payment)
        const balStr = balance > 0
            ? `<span style="color:var(--red);font-weight:600;">−${formatMoney(balance)}</span>`
            : balance < 0
                ? `<span style="color:var(--green);font-weight:600;">+${formatMoney(-balance)}</span>`
                : '—';

        return `<tr>
            <td><strong>${emp.firstName} ${emp.lastName}</strong></td>
            <td>${getRoleName(emp.role)}</td>
            <td style="text-align:right;">${formatMoney(earned)}</td>
            <td style="text-align:right;color:var(--green);">${formatMoney(paid)}</td>
            <td style="text-align:right;">${balStr}</td>
        </tr>`;
    }).join('');

    // Period balance: consistent with the other two cards (both are period-filtered)
    const totalBalance = totalFundEarned - totalFundPaid;
    const debtLabel = totalBalance > 0 ? 'Задолженность' : totalBalance < 0 ? 'Переплата' : 'Баланс';
    const debtCardClass = totalBalance > 0 ? 'sa-card-debt' : totalBalance < 0 ? 'sa-card-overpay' : 'sa-card-debt';

    contentEl.innerHTML = `
        <div class="salary-analytics-grid">
            <div class="salary-analytics-card sa-card-fund">
                <div class="salary-analytics-title">Начислено</div>
                <div class="salary-analytics-value">${formatMoney(totalFundEarned)}</div>
            </div>
            <div class="salary-analytics-card sa-card-paid">
                <div class="salary-analytics-title">Выплачено</div>
                <div class="salary-analytics-value">${formatMoney(totalFundPaid)}</div>
            </div>
            <div class="salary-analytics-card ${debtCardClass}">
                <div class="salary-analytics-title">${debtLabel}</div>
                <div class="salary-analytics-value">${formatMoney(Math.abs(totalBalance))}</div>
            </div>
        </div>
        <div class="table-container" style="margin-top:12px;">
            <table class="data-table">
                <thead><tr>
                    <th>Сотрудник</th><th>Должность</th>
                    <th style="text-align:right;">Начислено</th>
                    <th style="text-align:right;">Выплачено</th>
                    <th style="text-align:right;">Баланс (всего)</th>
                </tr></thead>
                <tbody>${empRows}
                    <tr style="border-top:2px solid var(--border);font-weight:700;">
                        <td colspan="2">Итого</td>
                        <td style="text-align:right;">${formatMoney(totalFundEarned)}</td>
                        <td style="text-align:right;color:var(--green);">${formatMoney(totalFundPaid)}</td>
                        <td></td>
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
    const allPayments = getActiveSalaryPayments();
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
        const histPeriod = getHistoricalAccrualSum(emp.id, startDate, endDate);
        const earned = shiftEarned + mgrTotal + histPeriod;
        const paid = empPayments.reduce((s, p) => s + (p.amount || 0), 0);
        // FIFO: все начисления хронологически (смены + менеджер + исторические)
        const allTimePaid = allPayments.filter(p => p.employeeId === emp.id).reduce((s, p) => s + (p.amount || 0), 0);
        const allTimeShifts = DB.get('shifts', []).filter(s => s.employeeId === emp.id && s.endTime && s.earnings && (s.shiftRole || s.employeeRole) !== 'manager').sort((a, b) => a.date.localeCompare(b.date));
        const allTimeMgr = getManagerDailyAccruals(emp, '2020-01-01', endDate).sort((a, b) => a.date.localeCompare(b.date));
        const allTimeHistEntries = DB.get('historicalAccruals', []).filter(a => a.employeeId === emp.id).sort((a, b) => a.date.localeCompare(b.date));
        // Merge all accruals chronologically
        const allAccruals = [];
        allTimeShifts.forEach(s => allAccruals.push({ date: s.date, amount: s.earnings?.total || 0, id: s.id }));
        allTimeMgr.forEach(a => allAccruals.push({ date: a.date, amount: a.amount, id: 'mgr_' + a.date }));
        allTimeHistEntries.forEach(a => allAccruals.push({ date: a.date, amount: a.amount || 0, id: a.id }));
        allAccruals.sort((a, b) => a.date.localeCompare(b.date));
        let paidPool = allTimePaid;
        let balance = 0;
        const paidIds = new Set();
        for (const acc of allAccruals) {
            if (paidPool >= acc.amount) {
                paidPool -= acc.amount;
                paidIds.add(acc.id);
            } else {
                balance += acc.amount - paidPool;
                paidPool = 0;
            }
        }

        // Build merged timeline: shifts + manager accruals + payments, last 30 days
        const now30 = moscowNow();
        const date30ago = new Date(now30); date30ago.setDate(date30ago.getDate() - 30);
        const start30 = `${date30ago.getFullYear()}-${String(date30ago.getMonth()+1).padStart(2,'0')}-${String(date30ago.getDate()).padStart(2,'0')}`;

        // All shifts for this employee (not limited to period)
        const allEmpShifts = allShifts.filter(s => s.employeeId === emp.id && (s.shiftRole || s.employeeRole) !== 'manager').sort((a, b) => a.date.localeCompare(b.date));
        const allMgrAccruals = getManagerDailyAccruals(emp, '2020-01-01', endDate);
        const allEmpPayments = allPayments.filter(p => p.employeeId === emp.id);

        const mgrByDate = {};
        allMgrAccruals.forEach(a => { mgrByDate[a.date] = a.amount; });

        // Historical accruals for this employee
        const empHistAccruals = DB.get('historicalAccruals', []).filter(a => a.employeeId === emp.id);
        const histByDate = {};
        empHistAccruals.forEach(a => {
            if (!histByDate[a.date]) histByDate[a.date] = [];
            histByDate[a.date].push(a);
        });

        // Build timeline entries: shifts/accruals + historical + payments
        const timeline = [];
        const shiftDates = new Set();
        allEmpShifts.forEach(s => shiftDates.add(s.date));
        allMgrAccruals.forEach(a => shiftDates.add(a.date));
        [...shiftDates].forEach(date => {
            timeline.push({ type: 'accrual', date });
        });
        // Add historical accrual entries (separate rows) ONLY if:
        // - it is NOT an event-bonus accrual (those are now in shift_event_bonuses), OR
        // - there is no shift on that date that already captures the bonus.
        // This prevents duplicate rows when event bonuses exist both as historical
        // accruals and as shift_event_bonuses.
        const datesWithShiftBonuses = new Set(
            allEmpShifts.filter(s => (s.eventBonuses || []).length > 0).map(s => s.date)
        );
        empHistAccruals.forEach(a => {
            const isEventBonus = (a.note || '').includes('инструктор') || (a.note || '').includes('администратор') || (a.note || '').includes('Бонус за мероприятие');
            // Skip event-bonus historical accruals for dates that already have shift event bonuses
            if (isEventBonus && datesWithShiftBonuses.has(a.date)) return;
            timeline.push({ type: 'historical', date: a.date, amount: a.amount, note: a.note || '', histId: a.id });
        });
        allEmpPayments.forEach(p => {
            timeline.push({ type: 'payment', date: p.date, time: p.time, amount: p.amount, method: p.method, note: p.note, paymentId: p.id });
        });
        timeline.sort((a, b) => b.date.localeCompare(a.date) || (a.type === 'payment' ? -1 : 1));

        // Split: last 30 days visible, rest hidden
        const recentTimeline = timeline.filter(t => t.date >= start30);
        const olderTimeline = timeline.filter(t => t.date < start30);

        const buildRow = (entry) => {
            if (entry.type === 'payment') {
                const dateF = new Date(entry.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
                return `<tr style="background:rgba(76,175,80,0.18);">
                    <td>${dateF}</td>
                    <td colspan="7" style="color:var(--green);font-weight:700;">💰 Выплата ${formatMoney(entry.amount)} — ${getPaymentMethodName(entry.method)}${entry.note ? ' (' + entry.note + ')' : ''}</td>
                    <td style="color:var(--green);font-weight:700;">${formatMoney(entry.amount)}</td>
                    <td>
                        <button class="btn-action" onclick="editSalaryPayment(${entry.paymentId})" title="Редактировать" style="padding:2px;"><span class="material-icons-round" style="font-size:15px;">edit</span></button>
                        <button class="btn-action danger" onclick="deleteSalaryPayment(${entry.paymentId})" title="Удалить" style="padding:2px;"><span class="material-icons-round" style="font-size:15px;">delete</span></button>
                    </td>
                </tr>`;
            }
            if (entry.type === 'historical') {
                const dateF = new Date(entry.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const noteShort = entry.note.replace('Историческое начисление: ', '');
                // Place bonus in the correct column when it's an event bonus (note contains role)
                const isInstrBonus = noteShort.includes('инструктор');
                const isAdminBonus = noteShort.includes('администратор');
                const instrBonusCell = isInstrBonus ? `<td style="color:var(--green);font-weight:600;">${formatMoney(entry.amount)}</td>` : '<td>—</td>';
                const adminBonusCell = isAdminBonus ? `<td style="color:var(--green);font-weight:600;">${formatMoney(entry.amount)}</td>` : '<td>—</td>';
                const isEventBonus = isInstrBonus || isAdminBonus;
                return `<tr style="background:rgba(33,150,243,0.10);" title="${noteShort}">
                    <td>${dateF}</td>
                    <td colspan="2" style="color:var(--accent);font-size:12px;">${isEventBonus ? '🎯 ' : '📋 '}${noteShort || 'Начисление'}</td>
                    <td>—</td>
                    <td>—</td>
                    ${instrBonusCell}
                    ${adminBonusCell}
                    <td>—</td>
                    <td style="font-weight:700;">${formatMoney(entry.amount)}</td>
                    <td>
                        <button class="btn-action" onclick="editAccrual('${entry.histId}')" title="Редактировать" style="padding:2px;"><span class="material-icons-round" style="font-size:15px;">edit</span></button>
                        <button class="btn-action danger" onclick="deleteAccrual('${entry.histId}')" title="Удалить" style="padding:2px;"><span class="material-icons-round" style="font-size:15px;">delete</span></button>
                    </td>
                </tr>`;
            }
            const date = entry.date;
            // Aggregate ALL shifts for this date into one row (not just the first)
            const shiftsForDate = allEmpShifts.filter(s => s.date === date);
            const mgrAmount = mgrByDate[date] || 0;
            const dateF = new Date(date + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

            let startTime = '—', endTime = '—', hours = '—', base = 0;
            let instrBonus = 0, adminBonus = 0;
            let hasComment = false, commentEsc = '';
            let shiftId = null;  // first shift id for edit button

            if (shiftsForDate.length > 0) {
                shiftId = shiftsForDate[0].id;

                // Earliest start and latest end across all shifts for the day
                const starts = shiftsForDate.map(s => s.startTime).filter(Boolean);
                const ends   = shiftsForDate.map(s => s.endTime).filter(Boolean);
                if (starts.length) startTime = starts.reduce((min, t) => t < min ? t : min);
                if (ends.length)   endTime   = ends.reduce((max, t) => t > max ? t : max);

                if (startTime !== '—' && endTime !== '—') {
                    const [sh, sm] = startTime.split(':').map(Number);
                    const [eh, em] = endTime.split(':').map(Number);
                    const mins = (eh * 60 + em) - (sh * 60 + sm);
                    hours = mins > 0 ? (mins / 60).toFixed(1) + 'ч' : '—';
                }

                // Sum base pay and all event bonuses across all shifts for the day
                shiftsForDate.forEach(shift => {
                    base += shift.earnings?.base || 0;
                    (shift.eventBonuses || []).forEach(b => {
                        if (b.bonusType === 'admin') adminBonus += (b.amount || 0);
                        else instrBonus += (b.amount || 0);
                    });
                    if (!hasComment && shift.shiftComment && shift.shiftComment.trim()) {
                        hasComment = true;
                        commentEsc = shift.shiftComment.replace(/'/g, "\\'").replace(/\n/g, "\\n");
                    }
                });
            }

            const dayTotal = base + instrBonus + adminBonus + mgrAmount;
            const shiftPaid = shiftId ? paidIds.has(shiftId) : true;
            const mgrPaid = mgrAmount > 0 ? paidIds.has('mgr_' + date) : true;
            const isPaid = (shiftId || mgrAmount > 0) && shiftPaid && mgrPaid;

            const editBtns = (shiftId ? `<button class="btn-action" onclick="event.stopPropagation();editShiftEarnings(${shiftId})" title="Редактировать начисление" style="padding:2px;"><span class="material-icons-round" style="font-size:15px;">edit</span></button>` : '')
                + (mgrAmount > 0 ? `<button class="btn-action" onclick="event.stopPropagation();editMgrDailyRate(${emp.id})" title="Ставка менеджера" style="padding:2px;"><span class="material-icons-round" style="font-size:15px;">tune</span></button>` : '');
            return `<tr style="cursor:pointer;" onclick="${hasComment ? `showShiftComment('${commentEsc}')` : ''}" title="${hasComment ? 'Нажмите — комментарий к смене' : ''}">
                <td>${dateF}</td>
                <td>${startTime}</td>
                <td>${endTime}</td>
                <td>${hours}</td>
                <td>${base > 0 ? formatMoney(base) : '—'}</td>
                <td style="color:var(--green)">${instrBonus > 0 ? formatMoney(instrBonus) : '—'}</td>
                <td style="color:var(--green)">${adminBonus > 0 ? formatMoney(adminBonus) : '—'}</td>
                <td style="color:var(--accent)">${mgrAmount > 0 ? formatMoney(mgrAmount) : '—'}</td>
                <td style="font-weight:700">${formatMoney(dayTotal)}</td>
                <td>${editBtns}${hasComment ? '<span class="material-icons-round" style="font-size:16px;color:var(--accent);">comment</span>' : ''}</td>
            </tr>`;
        };

        const dayRows = recentTimeline.map(buildRow).join('');
        const olderRows = olderTimeline.map(buildRow).join('');
        const hasData = timeline.length > 0;

        return `<div class="emp-dash-card" data-emp-id="${emp.id}">
            <div class="emp-dash-card-header" onclick="toggleEmpCard(${emp.id})">
                <div class="emp-dash-card-info">
                    <h3>${emp.firstName} ${emp.lastName}</h3>
                </div>
                <div class="emp-dash-card-stats">
                    <div class="emp-dash-stat" onclick="event.stopPropagation(); showUnpaidAccrualsModal(${emp.id})" style="cursor:pointer;" title="Показать неоплаченные начисления">
                        <span class="emp-dash-stat-label">К выплате</span>
                        <span class="emp-dash-stat-value ${balance > 0 ? 'red' : ''}" style="text-decoration:underline dotted;">${balance > 0 ? formatMoney(balance) : '—'}</span>
                    </div>
                    <div class="emp-dash-stat">
                        <span class="emp-dash-stat-label">За месяц</span>
                        <span class="emp-dash-stat-value" style="color:${earned > 0 ? 'var(--green)' : 'var(--text-secondary)'};">${earned > 0 ? formatMoney(earned) : '—'}</span>
                    </div>
                    <div class="emp-dash-stat">
                        <span class="emp-dash-stat-label">Должность</span>
                        <span class="emp-dash-stat-value" style="font-size:13px;">${getRoleName(emp.role)}${(emp.allowedShiftRoles || []).includes('manager') ? ' + Менеджер' : ''}</span>
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
                    <button class="btn-secondary" onclick="openAccrualModal(${emp.id})">
                        <span class="material-icons-round">add_circle</span>
                        Добавить начисление
                    </button>
                    <button class="btn-action" onclick="openEmployeeModal('${emp.id}')" title="Редактировать">
                        <span class="material-icons-round">edit</span>
                    </button>
                    <button class="btn-action danger" onclick="deleteEmployee('${emp.id}')" title="Удалить">
                        <span class="material-icons-round">delete</span>
                    </button>
                </div>
                <div class="emp-dash-section-title">Начисления (30 дней)${mgrTotal > 0 ? ` <span style="font-weight:400;font-size:12px;color:var(--text-secondary);">(менеджер: ${formatMoney(mgrTotal)} за ${mgrAccruals.length} дн.)</span>` : ''}</div>
                ${hasData ? `<div class="table-container"><table class="data-table">
                    <thead><tr><th>Дата</th><th>Начало</th><th>Конец</th><th>Часы</th><th>Ставка</th><th>Бонус инстр.</th><th>Бонус адм.</th><th>Менеджер</th><th>Итого</th><th></th></tr></thead>
                    <tbody>${dayRows}</tbody>
                    <tbody id="emp-older-rows-${emp.id}" style="display:none;">${olderRows}</tbody>
                </table></div>
                ${olderTimeline.length > 0 ? `<button class="btn-secondary btn-sm" style="margin-top:8px;width:100%;" onclick="toggleOlderRows(${emp.id}, this)">Показать ранние записи (${olderTimeline.length})</button>` : ''}` : '<p class="empty-state-text">Нет начислений за период</p>'}
            </div>
        </div>`;
    }).join('');

}

function toggleOlderRows(empId, btn) {
    const tbody = document.getElementById('emp-older-rows-' + empId);
    if (!tbody) return;
    const isHidden = tbody.style.display === 'none';
    tbody.style.display = isHidden ? '' : 'none';
    btn.textContent = isHidden ? 'Скрыть ранние записи' : btn.textContent;
    if (!isHidden) btn.textContent = btn.textContent.replace('Скрыть', 'Показать');
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

function openExportEventsModal() {
    const now = moscowNow();
    const first = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const last = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()).padStart(2,'0')}`;
    document.getElementById('export-events-from').value = first;
    document.getElementById('export-events-to').value = last;
    document.getElementById('export-events-status').value = '';
    openModal('modal-export-events');
}

function exportEventsCSV() {
    const from = document.getElementById('export-events-from').value;
    const to = document.getElementById('export-events-to').value;
    const status = document.getElementById('export-events-status').value;
    if (!from || !to) { showToast('Укажите период'); return; }

    const events = DB.get('events', []).filter(e =>
        e.date && e.date >= from && e.date <= to && (status ? e.status === status : true)
    ).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));

    const tariffs = DB.get('tariffs', []);
    const occasionNames = { corporate: 'Корпоратив', birthday: 'День рождения', friends: 'Встреча друзей', bachelor: 'Мальчишник', personal: 'Личный праздник', active: 'Активный отдых' };
    const channelNames = { wa: 'WhatsApp', tg: 'Telegram', vk: 'VK' };
    const prepayNames = { qr: 'QR', cash: 'Наличные' };

    const headers = ['Дата','Время','Статус','Тип','Тариф','Название','Клиент','Телефон','Связь','Повод','Участников','Стоимость','Предоплата','Способ предоплаты','Скидка','Сертификат','Комментарий'];
    const rows = events.map(e => {
        const tariff = e.tariffId ? tariffs.find(t => String(t.id) === String(e.tariffId)) : null;
        return [
            e.date || '',
            e.time || '',
            getStatusName(e.status) || '',
            e.type || '',
            tariff ? tariff.name : (e.tariffName || ''),
            e.title || '',
            e.clientName || '',
            e.clientPhone || '',
            channelNames[e.channel] || '',
            occasionNames[e.occasion] || '',
            e.participants || 0,
            e.price || 0,
            e.prepayment || 0,
            prepayNames[e.prepaymentMethod] || '',
            e.discount || 0,
            e.certificateAmount || 0,
            (e.comment || '').replace(/\r?\n/g, ' ')
        ];
    });

    const escape = (v) => {
        const s = String(v == null ? '' : v);
        return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(escape).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `events_${from}_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    closeModal('modal-export-events');
    showToast(`Экспортировано: ${events.length}`);
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
        // Find tariff name(s) — support multi-group
        let tariffName;
        if (e.tariffGroups && e.tariffGroups.length > 1) {
            tariffName = e.tariffGroups.map(g => {
                const t = g.tariffId ? tariffs.find(t => String(t.id) === String(g.tariffId)) : null;
                return t ? `${t.name} ×${g.participants}` : '?';
            }).join(', ');
        } else {
            const tariff = e.tariffId ? tariffs.find(t => String(t.id) === String(e.tariffId)) : null;
            tariffName = tariff ? tariff.name : (e.tariffName || '—');
        }
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
                    <span>${formatParticipants(e)} · ${formatDuration(e.duration)}${e.price ? ' · ' + formatMoney(e.price) : ''}${e.prepayment ? ' · предоплата ' + formatMoney(e.prepayment) + (e.prepaymentMethod === 'qr' ? ' QR' : e.prepaymentMethod === 'cash' ? ' нал.' : '') : ''}</span>
                    ${getStaffBadges(e) ? `<span style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">${getStaffBadges(e)}</span>` : ''}
                </div>
                ${!isCompleted
                    ? `<button class="btn-primary btn-sm" onclick="event.stopPropagation();openEventModal('${e.id}', true)" style="width:100%;justify-content:center;">
                        <span class="material-icons-round" style="font-size:16px">done_all</span> Выполнить
                       </button>`
                    : `<button class="btn-secondary btn-sm" onclick="event.stopPropagation();openBonusAssignModal('${e.id}')" style="width:100%;justify-content:center;font-size:12px;">
                        <span class="material-icons-round" style="font-size:15px">payments</span> Начислить бонус
                       </button>`}
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
    const discountLabel = document.getElementById('evt-discount-label');

    if (type === 'none') {
        details.style.display = 'none';
        document.getElementById('evt-discount').value = '';
        document.getElementById('evt-certificate-number').value = '';
        document.getElementById('evt-certificate-amount').value = '';
    } else if (type === 'percent') {
        details.style.display = '';
        percentRow.style.display = '';
        certRow.style.display = 'none';
        if (discountLabel) discountLabel.textContent = 'Скидка (%)';
        document.getElementById('evt-discount').setAttribute('max', '100');
        document.getElementById('evt-certificate-number').value = '';
        document.getElementById('evt-certificate-amount').value = '';
    } else if (type === 'amount') {
        details.style.display = '';
        percentRow.style.display = '';
        certRow.style.display = 'none';
        if (discountLabel) discountLabel.textContent = 'Скидка (₽)';
        document.getElementById('evt-discount').removeAttribute('max');
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
    ['evt-discount', 'evt-prepayment', 'evt-certificate-amount'].forEach(fid => {
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
        document.getElementById('evt-occasion').value = evt.occasion || '';
        document.getElementById('evt-player-age').value = evt.playerAge || '';
        // Load game blocks (support old single-tariff and tariffGroups format).
        // Use ?.length instead of || for arrays — [] is truthy and would suppress the fallback.
        const resolvedInstrs = evt.gameBlocks?.[0]?.instructors?.length
            ? null // will use evt.gameBlocks directly below
            : (evt.instructors?.length ? evt.instructors
               : evt.assignedInstructors?.length ? evt.assignedInstructors
               : (evt.instructor ? [evt.instructor] : []));
        const resolvedAdmins = evt.gameBlocks?.[0]?.admins?.length
            ? null
            : (evt.admins?.length ? evt.admins
               : evt.assignedAdmins?.length ? evt.assignedAdmins
               : []);
        const gameBlocks = evt.gameBlocks?.length ? evt.gameBlocks : [{
            gameType: evt.type || 'other',
            tariffs: evt.tariffGroups || [{ tariffId: evt.tariffId, participants: evt.participants || 1 }],
            instructors: resolvedInstrs || [],
            admins: resolvedAdmins || []
        }];
        initGameBlocksUI(gameBlocks);
        document.getElementById('evt-notes').value = evt.notes || '';
        document.getElementById('evt-price').value = evt.price || '';
        document.getElementById('evt-discount').value = evt.discount || '';
        // Set discount type
        if (evt.certificateNumber || evt.certificateAmount) {
            document.getElementById('evt-discount-type').value = 'certificate';
            document.getElementById('evt-certificate-number').value = evt.certificateNumber || '';
            document.getElementById('evt-certificate-amount').value = evt.certificateAmount || '';
        } else if (evt.discountType === 'amount' && evt.discount > 0) {
            document.getElementById('evt-discount-type').value = 'amount';
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
        // Init default game block for new event
        initGameBlocksUI(null);
    }

    // Always recalculate total to keep price in sync with options
    recalcEventTotal();

    // Show/hide complete button and total summary
    const completeBtn = document.getElementById('btn-complete-event');
    const bonusBtn = document.getElementById('btn-bonus-event');
    const totalBlock = document.getElementById('evt-total-block');
    const evtStatus = id ? (DB.get('events', []).find(e => String(e.id) === String(id))?.status) : null;
    const isAlreadyCompleted = evtStatus === 'completed';
    if (completing && id) {
        document.getElementById('modal-event-title').textContent = 'Выполнить заказ';
        if (completeBtn) completeBtn.style.display = 'inline-flex';
        if (totalBlock) totalBlock.style.display = 'block';
        if (bonusBtn) bonusBtn.style.display = 'none';
    } else {
        if (completeBtn) completeBtn.style.display = 'none';
        if (totalBlock) totalBlock.style.display = 'none';
        // Показать «Начислить бонус» только для завершённых мероприятий (директор)
        if (bonusBtn) bonusBtn.style.display = (isAlreadyCompleted && currentUser?.role === 'director') ? 'inline-flex' : 'none';
    }

    // Store completing flag for save handler
    document.getElementById('event-form').dataset.completing = completing ? '1' : '';

    openModal('modal-event');
}

function recalcEventTotal() {
    const tariffs = DB.get('tariffs', []);
    const discount = parseFloat(document.getElementById('evt-discount').value) || 0;
    const prepayment = parseFloat(document.getElementById('evt-prepayment').value) || 0;

    // Sum service cost across all game blocks
    let serviceCost = 0;
    const serviceRows_data = []; // for breakdown display
    document.querySelectorAll('#game-blocks-list .game-block').forEach(block => {
        block.querySelectorAll('.gb-tariff-row').forEach(row => {
            const tariffId = row.querySelector('.gb-tariff-sel')?.value;
            const ppl = parseInt(row.querySelector('.gb-ppl-input')?.value) || 1;
            const t = tariffs.find(t => String(t.id) === String(tariffId));
            if (t) {
                const amt = (t.price || 0) * ppl;
                serviceCost += amt;
                serviceRows_data.push({ name: t.name, ppl, amt });
            }
        });
    });

    let optionsCost = 0;
    document.querySelectorAll('#evt-options-game-list .option-qty-row, #evt-options-extra-list .option-qty-row').forEach(row => {
        const optId = parseInt(row.dataset.optionId);
        const opt = tariffs.find(t => String(t.id) === String(optId));
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
    } else if (discountType === 'amount' && discount > 0) {
        discountAmount = discount;
        discountLabel = `Скидка ${formatMoney(discount)}`;
    } else if (discountType === 'certificate' && certAmount > 0) {
        discountAmount = certAmount;
        const certNum = document.getElementById('evt-certificate-number').value.trim();
        discountLabel = `Сертификат${certNum ? ' №' + certNum : ''}`;
    }
    const total = subtotal - discountAmount;
    const toPay = total - prepayment;

    const block = document.getElementById('evt-total-block');
    if (block) {
        let serviceBreakdown = '';
        if (serviceRows_data.length > 1) {
            serviceBreakdown = serviceRows_data.map(r =>
                `<div class="evt-total-row" style="padding-left:12px;font-size:12px;color:var(--text-secondary);">
                    <span>${r.name} × ${r.ppl} чел.</span><span>${formatMoney(r.amt)}</span></div>`
            ).join('');
        }
        block.innerHTML = `
            <div class="evt-total-summary">
                <div class="evt-total-row"><span>Услуга:</span><span>${formatMoney(serviceCost)}</span></div>
                ${serviceBreakdown}
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
    // Capture instructor/admin selections from DOM BEFORE form.requestSubmit() closes the modal.
    // This is the authoritative source — avoids any race between the debounced DB write and
    // the _loadAll that can fire from a realtime notification within the 300ms window.
    const _blocks = getGameBlocksFromDOM();
    _pendingEventStaff = {
        instructors: [...new Set(_blocks.flatMap(b => b.instructors || []))],
        admins: [...new Set(_blocks.flatMap(b => b.admins || []))]
    };

    // Save event first
    const form = document.getElementById('event-form');
    form.requestSubmit();
    // Then open payment modal
    const id = document.getElementById('evt-id').value;
    if (id) {
        setTimeout(() => openPaymentModal(id), 300);
    }
}

// ===== «Восстановить пропущенные бонусы» из страницы Настроек =====
function runFixBonusesUI() {
    const events = DB.get('events', [])
        .filter(e => e.status === 'completed' && e.date > '2026-03-31')
        .sort((a, b) => b.date.localeCompare(a.date));
    const employees = DB.get('employees', []).filter(e => !e.blocked);
    const accruals = DB.get('historicalAccruals', []);
    const shifts = DB.get('shifts', []);

    // Найти мероприятия у которых нет бонусов для назначенных сотрудников
    const missing = events.filter(evt => {
        const instrIds = evt.assignedInstructors || evt.instructors || [];
        const adminIds = evt.assignedAdmins || evt.admins || [];
        if (instrIds.length === 0 && adminIds.length === 0) return true; // нет состава — тоже показать
        const allIds = [...instrIds, ...adminIds];
        return allIds.some(empId => {
            const onShift = shifts.some(s => s.employeeId === empId && s.eventBonuses && s.eventBonuses.some(b => String(b.eventId) === String(evt.id)));
            const onAccrual = accruals.some(a => a.employeeId === empId && String(a.id).startsWith('evtbonus_' + evt.id + '_' + empId));
            return !onShift && !onAccrual;
        });
    });

    const instrEmps = employees.filter(e => ['instructor', 'senior_instructor'].includes(e.role));
    const adminEmps = employees.filter(e => e.role === 'admin');

    const evtOptions = missing.length
        ? missing.map(e => `<option value="${e.id}">[${e.date}] ${e.title} — ${e.participants || '?'}чел. — ${e.price ? formatMoney(e.price) : '0₽'}</option>`).join('')
        : '<option value="">— нет мероприятий без бонусов —</option>';

    const makeCheck = (emps, prefix, eventStaff) => emps.map(e =>
        `<label style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;">
            <input type="checkbox" class="${prefix}-cb" value="${e.id}" ${(eventStaff||[]).includes(e.id)?'checked':''}
                style="width:16px;height:16px;accent-color:var(--accent);">
            <span style="font-size:14px;">${e.firstName} ${e.lastName}</span>
        </label>`).join('');

    const firstEvt = missing[0];
    const fi = firstEvt ? (firstEvt.assignedInstructors || firstEvt.instructors || []) : [];
    const fa = firstEvt ? (firstEvt.assignedAdmins || firstEvt.admins || []) : [];

    const html = `
        <div style="padding:16px 16px 8px;max-width:420px;">
            <h3 style="margin:0 0 12px;font-size:15px;">Восстановить бонусы за мероприятие</h3>
            <div class="form-group" style="margin-bottom:12px;">
                <label style="font-size:13px;font-weight:600;">Мероприятие</label>
                <select id="fix-bonus-evt-select" style="width:100%;margin-top:4px;" onchange="updateFixBonusStaff()">
                    ${evtOptions}
                </select>
            </div>
            <div class="form-row" style="gap:16px;margin-bottom:12px;">
                <div style="flex:1;">
                    <div style="font-weight:600;font-size:13px;margin-bottom:6px;">Инструкторы</div>
                    <div id="fix-bonus-instrs">${makeCheck(instrEmps, 'fix-instr', fi)}</div>
                </div>
                <div style="flex:1;">
                    <div style="font-weight:600;font-size:13px;margin-bottom:6px;">Администраторы</div>
                    <div id="fix-bonus-admins">${makeCheck(adminEmps, 'fix-admin', fa)}</div>
                </div>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--border);">
                <button class="btn-secondary" onclick="closeModal('modal-fix-bonuses')">Отмена</button>
                <button class="btn-primary" onclick="applyFixBonus()">
                    <span class="material-icons-round" style="font-size:16px">payments</span> Начислить
                </button>
            </div>
        </div>`;

    let modal = document.getElementById('modal-fix-bonuses');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-fix-bonuses';
        modal.className = 'modal-overlay';
        modal.innerHTML = '<div class="modal modal-sm" id="modal-fix-bonuses-inner"></div>';
        modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });
        document.body.appendChild(modal);
    }
    document.getElementById('modal-fix-bonuses-inner').innerHTML = html;
    modal.classList.add('active');
}

function updateFixBonusStaff() {
    const eventId = document.getElementById('fix-bonus-evt-select')?.value;
    if (!eventId) return;
    const evt = DB.get('events', []).find(e => String(e.id) === String(eventId));
    if (!evt) return;
    const instrIds = evt.assignedInstructors || evt.instructors || [];
    const adminIds = evt.assignedAdmins || evt.admins || [];
    document.querySelectorAll('.fix-instr-cb').forEach(cb => { cb.checked = instrIds.map(String).includes(cb.value); });
    document.querySelectorAll('.fix-admin-cb').forEach(cb => { cb.checked = adminIds.map(String).includes(cb.value); });
}

function applyFixBonus() {
    const eventId = document.getElementById('fix-bonus-evt-select')?.value;
    if (!eventId) { showToast('Выберите мероприятие', 'error'); return; }
    const instrIds = [...document.querySelectorAll('.fix-instr-cb:checked')].map(el => parseInt(el.value));
    const adminIds = [...document.querySelectorAll('.fix-admin-cb:checked')].map(el => parseInt(el.value));
    if (instrIds.length === 0 && adminIds.length === 0) { showToast('Выберите хотя бы одного сотрудника', 'error'); return; }

    // Обновить состав в событии
    const events = DB.get('events', []);
    const idx = events.findIndex(e => String(e.id) === String(eventId));
    if (idx >= 0) {
        events[idx].instructors = instrIds;
        events[idx].admins = adminIds;
        events[idx].assignedInstructors = instrIds;
        events[idx].assignedAdmins = adminIds;
        DB.set('events', events);
    }
    closeModal('modal-fix-bonuses');
    setTimeout(() => {
        recalculateEventBonuses(isNaN(eventId) ? eventId : parseInt(eventId));
        if (document.getElementById('page-employees')?.classList.contains('active')) loadEmployees();
    }, 200);
}

// ===== ДИАЛОГ: РУЧНОЕ НАЧИСЛЕНИЕ БОНУСА ЗА ЗАВЕРШЁННОЕ МЕРОПРИЯТИЕ =====
let _bonusAssignEventId = null;
function openBonusAssignModal(eventId) {
    _bonusAssignEventId = typeof eventId === 'string' ? parseInt(eventId) || eventId : eventId;
    const events = DB.get('events', []);
    const evt = events.find(e => String(e.id) === String(eventId));
    if (!evt) return;

    const employees = DB.get('employees', []).filter(e => !e.blocked);
    const currentInstrs = evt.assignedInstructors || evt.instructors || [];
    const currentAdmins = evt.assignedAdmins || evt.admins || [];
    // Fallback from gameBlocks
    const gbInstrs = evt.gameBlocks ? [...new Set(evt.gameBlocks.flatMap(b => b.instructors || []))] : [];
    const gbAdmins = evt.gameBlocks ? [...new Set(evt.gameBlocks.flatMap(b => b.admins || []))] : [];
    const initInstrs = currentInstrs.length > 0 ? currentInstrs : gbInstrs;
    const initAdmins = currentAdmins.length > 0 ? currentAdmins : gbAdmins;

    const instrEmps = employees.filter(e => ['instructor', 'senior_instructor'].includes(e.role));
    const adminEmps = employees.filter(e => e.role === 'admin');

    const makeList = (emps, initIds, prefix) => emps.map(e => `
        <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;">
            <input type="checkbox" id="${prefix}-${e.id}" value="${e.id}" ${initIds.includes(e.id) ? 'checked' : ''}
                style="width:18px;height:18px;accent-color:var(--accent);">
            <span>${e.firstName} ${e.lastName}</span>
        </label>`).join('');

    const html = `
        <div style="padding:16px;max-width:400px;">
            <h3 style="margin:0 0 4px;font-size:16px;">Начислить бонус</h3>
            <p style="margin:0 0 14px;font-size:13px;color:var(--text-secondary);">${evt.title} · ${evt.date}</p>
            <div style="margin-bottom:12px;">
                <div style="font-weight:600;font-size:13px;margin-bottom:6px;">Инструкторы</div>
                ${instrEmps.length ? makeList(instrEmps, initInstrs, 'ba-instr') : '<span style="font-size:13px;color:var(--text-secondary);">Нет</span>'}
            </div>
            <div style="margin-bottom:16px;">
                <div style="font-weight:600;font-size:13px;margin-bottom:6px;">Администраторы</div>
                ${adminEmps.length ? makeList(adminEmps, initAdmins, 'ba-admin') : '<span style="font-size:13px;color:var(--text-secondary);">Нет</span>'}
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="btn-secondary" onclick="closeModal('modal-bonus-assign')">Отмена</button>
                <button class="btn-primary" onclick="saveBonusAssign()">
                    <span class="material-icons-round" style="font-size:16px">payments</span>
                    Начислить
                </button>
            </div>
        </div>`;

    let modal = document.getElementById('modal-bonus-assign');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-bonus-assign';
        modal.className = 'modal-overlay';
        modal.innerHTML = '<div class="modal modal-sm" id="modal-bonus-assign-inner"></div>';
        modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });
        document.body.appendChild(modal);
    }
    document.getElementById('modal-bonus-assign-inner').innerHTML = html;
    modal.classList.add('active');
}

function saveBonusAssign() {
    if (!_bonusAssignEventId) return;
    const instrIds = [...document.querySelectorAll('[id^="ba-instr-"]:checked')].map(el => parseInt(el.value));
    const adminIds = [...document.querySelectorAll('[id^="ba-admin-"]:checked')].map(el => parseInt(el.value));

    // Сохранить состав в событии
    const events = DB.get('events', []);
    const idx = events.findIndex(e => String(e.id) === String(_bonusAssignEventId));
    if (idx >= 0) {
        events[idx].instructors = instrIds;
        events[idx].admins = adminIds;
        events[idx].assignedInstructors = instrIds;
        events[idx].assignedAdmins = adminIds;
        DB.set('events', events);
    }
    closeModal('modal-bonus-assign');
    // Пересчитать и начислить бонусы
    setTimeout(() => {
        recalculateEventBonuses(_bonusAssignEventId);
        _bonusAssignEventId = null;
    }, 150);
}

// Пересчёт бонусов завершённого мероприятия при изменении состава сотрудников
function recalculateEventBonuses(eventId) {
    const events = DB.get('events', []);
    const evt = events.find(e => e.id === eventId);
    if (!evt || evt.status !== 'completed') return;

    // 1. Снять старые бонусы этого события с смен
    const shifts = DB.get('shifts', []);
    shifts.forEach(s => {
        if (!s.eventBonuses?.length) return;
        const before = s.eventBonuses.length;
        s.eventBonuses = s.eventBonuses.filter(b => b.eventId !== eventId);
        if (s.eventBonuses.length !== before && s.endTime) {
            s.earnings = calculateShiftEarnings(s);
        }
    });
    DB.set('shifts', shifts);

    // 2. Снять старые исторические начисления этого события
    const prefix = 'evtbonus_' + eventId + '_';
    const accruals = DB.get('historicalAccruals', []);
    DB.set('historicalAccruals', accruals.filter(a => !String(a.id).startsWith(prefix)));

    // 3. Начислить заново по актуальному составу
    const selectedInstructors = evt.instructors || [];
    const selectedAdmins = evt.admins || [];
    const salaryRules = DB.get('salaryRules', {});
    const adminRule = salaryRules.admin || { bonusPercent: 5, bonusSources: ['services', 'optionsForGame', 'options'] };
    const allEmps = DB.get('employees', []);

    const instrBonusPerPerson = {};
    selectedInstructors.forEach(empId => {
        const emp = allEmps.find(e => e.id === empId);
        const role = emp?.role || 'instructor';
        const rule = salaryRules[role] || salaryRules.instructor || { bonusPercent: 5, bonusSources: ['services', 'optionsForGame'] };
        const revenue = calculateEventRevenueBySources(evt, rule.bonusSources || ['services', 'optionsForGame']);
        instrBonusPerPerson[empId] = Math.round(revenue * (rule.bonusPercent || 5) / 100 / Math.max(selectedInstructors.length, 1));
    });
    const adminBonusPerPerson = {};
    selectedAdmins.forEach(empId => {
        const revenue = calculateEventRevenueBySources(evt, adminRule.bonusSources || ['services', 'optionsForGame', 'options']);
        adminBonusPerPerson[empId] = Math.round(revenue * (adminRule.bonusPercent || 5) / 100 / Math.max(selectedAdmins.length, 1));
    });

    const eventDate = evt.date || todayLocal();
    const todayStr2 = todayLocal();
    const evtTitle = evt.title || 'Мероприятие';
    const shifts2 = DB.get('shifts', []);

    const credit = (empId, amount, bonusType) => {
        if (amount <= 0) return;
        // Only match CLOSED shifts — open shifts are invisible in the director's table
        let si = shifts2.findIndex(s => s.date === eventDate && s.employeeId === empId && s.endTime);
        if (si < 0 && eventDate !== todayStr2) si = shifts2.findIndex(s => s.date === todayStr2 && s.employeeId === empId && s.endTime);
        if (si >= 0) {
            if (!shifts2[si].eventBonuses) shifts2[si].eventBonuses = [];
            shifts2[si].eventBonuses.push({ eventId, eventTitle: evtTitle, amount, bonusType });
            shifts2[si].earnings = calculateShiftEarnings(shifts2[si]);
        } else {
            const emp = allEmps.find(e => e.id === empId);
            const roleName = bonusType === 'instructor' ? 'инструктор' : 'администратор';
            const hist = DB.get('historicalAccruals', []);
            hist.push({
                id: 'evtbonus_' + eventId + '_' + empId + '_' + Date.now(),
                employeeId: empId,
                employeeName: emp ? (emp.firstName + ' ' + emp.lastName) : '',
                date: eventDate,
                amount,
                note: `Бонус за мероприятие "${evtTitle}" (${roleName})`
            });
            DB.set('historicalAccruals', hist);
        }
    };

    selectedInstructors.forEach(id => credit(id, instrBonusPerPerson[id] || 0, 'instructor'));
    selectedAdmins.forEach(id => credit(id, adminBonusPerPerson[id] || 0, 'admin'));
    DB.set('shifts', shifts2);

    const instrTotal = Object.values(instrBonusPerPerson).reduce((s, v) => s + v, 0);
    const adminTotal = Object.values(adminBonusPerPerson).reduce((s, v) => s + v, 0);
    const evtsUpd = DB.get('events', []);
    const ei = evtsUpd.findIndex(e => e.id === eventId);
    if (ei >= 0) {
        evtsUpd[ei].bonuses = { instructorTotal: instrTotal, adminTotal, perInstructor: instrTotal || 0, perAdmin: adminTotal || 0 };
        evtsUpd[ei].assignedInstructors = selectedInstructors;
        evtsUpd[ei].assignedAdmins = selectedAdmins;
        DB.set('events', evtsUpd);
    }

    const parts = [];
    if (instrTotal > 0) parts.push(`инстр. ${formatMoney(instrTotal)}`);
    if (adminTotal > 0) parts.push(`адм. ${formatMoney(adminTotal)}`);
    showToast('✅ Бонусы пересчитаны' + (parts.length ? ': ' + parts.join(', ') : ''));
    if (document.getElementById('page-employees')?.classList.contains('active')) loadEmployees();
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

    // Collect game blocks
    const gameBlocks = getGameBlocksFromDOM();
    // Backward compat derived fields
    const firstBlock = gameBlocks[0] || {};
    const firstTariffId = firstBlock.tariffs?.[0]?.tariffId || null;
    const allTariffs = gameBlocks.flatMap(b => b.tariffs || []);
    const totalParticipants = allTariffs.reduce((s, t) => s + (t.participants || 1), 0) || 1;
    const allInstructors = [...new Set(gameBlocks.flatMap(b => b.instructors || []))];
    const allAdmins = [...new Set(gameBlocks.flatMap(b => b.admins || []))];
    // Compute duration from first block's first tariff
    const tariffData = DB.get('tariffs', []);
    const firstTariffObj = tariffData.find(t => String(t.id) === String(firstTariffId));
    const computedDuration = firstTariffObj?.duration || parseInt(document.getElementById('evt-duration').value) || 60;

    const data = {
        title: document.getElementById('evt-title').value.trim(),
        clientName: document.getElementById('evt-client-name').value.trim(),
        contactChannel: document.getElementById('evt-contact-channel').value,
        clientPhone: document.getElementById('evt-client-phone').value.trim(),
        date: document.getElementById('evt-date').value,
        time: document.getElementById('evt-time').value,
        duration: computedDuration,
        // game blocks (new)
        gameBlocks: gameBlocks,
        // backward compat fields
        type: firstBlock.gameType || 'other',
        occasion: document.getElementById('evt-occasion').value,
        playerAge: document.getElementById('evt-player-age').value.trim(),
        tariffId: firstTariffId,
        tariffGroups: allTariffs,
        participants: totalParticipants,
        instructors: allInstructors,
        admins: allAdmins,
        instructor: allInstructors[0] || null, // backward compat
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

    let needBonusRecalc = false;
    let savedEventId = null;

    if (id) {
        const idx = events.findIndex(e => e.id === parseInt(id));
        if (idx >= 0) {
            const wasCompleted = events[idx].status === 'completed';
            const prevInstrs = (events[idx].instructors || []).slice().sort().join(',');
            const prevAdmins = (events[idx].admins || []).slice().sort().join(',');
            events[idx] = { ...events[idx], ...data };
            const newInstrs = allInstructors.slice().sort().join(',');
            const newAdmins2 = allAdmins.slice().sort().join(',');
            // Пересчитать бонусы если мероприятие завершено и состав изменился
            if (wasCompleted && (prevInstrs !== newInstrs || prevAdmins !== newAdmins2)) {
                needBonusRecalc = true;
                savedEventId = parseInt(id);
            }
        }
    } else {
        data.id = Date.now();
        data.source = 'crm'; // Mark as created in CRM
        events.push(data);
    }

    DB.set('events', events);

    // For EXISTING events: immediately write instructor/admin to Supabase (no 200ms debounce).
    // This prevents a race condition where _loadAll (realtime) fires before the debounced
    // _writeEvents flush and overwrites the cache with stale (empty) instructor data.
    // New events are skipped — their event row doesn't exist in DB yet, so the FK would fail;
    // _writeEvents handles new events correctly (upserts event first, then inserts staff).
    if (id) {
        DB.updateEventStaff(parseInt(id), allInstructors, allAdmins)
            .catch(e => console.error('updateEventStaff failed:', e));
    }

    closeModal('modal-event');
    if (document.getElementById('page-schedule').classList.contains('active')) renderCalendar();
    if (document.getElementById('emp-page-booking').classList.contains('active')) renderEmpCalendar();
    if (document.getElementById('emp-page-events').classList.contains('active')) loadEmployeeEvents();
    showToast('Мероприятие сохранено');
    if (needBonusRecalc) setTimeout(() => recalculateEventBonuses(savedEventId), 200);


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
    // Accrual modal
    document.getElementById('modal-accrual-close')?.addEventListener('click', () => closeModal('modal-accrual'));
    document.getElementById('btn-cancel-accrual')?.addEventListener('click', () => closeModal('modal-accrual'));
    document.getElementById('btn-confirm-accrual')?.addEventListener('click', confirmAccrual);
    // Shift earnings edit modal
    document.getElementById('modal-edit-shift-close')?.addEventListener('click', () => closeModal('modal-edit-shift'));
    document.getElementById('btn-cancel-edit-shift')?.addEventListener('click', () => closeModal('modal-edit-shift'));
    document.getElementById('btn-confirm-edit-shift')?.addEventListener('click', saveShiftEarnings);
    // Finance entry modal
    document.getElementById('modal-fin-entry-close')?.addEventListener('click', () => closeModal('modal-fin-entry'));
    document.getElementById('btn-cancel-fin-entry')?.addEventListener('click', () => closeModal('modal-fin-entry'));
    document.getElementById('fin-entry-form')?.addEventListener('submit', saveFinEntry);
}

function openFinEntryModal(type, entryId) {
    const entry = entryId ? DB.get('finEntries', []).find(e => e.id === entryId) : null;
    document.getElementById('modal-fin-entry-title').textContent = entry
        ? (type === 'income' ? 'Редактировать доход' : 'Редактировать расход')
        : (type === 'income' ? 'Добавить доход' : 'Добавить расход');
    document.getElementById('fin-entry-id').value = entry ? entry.id : '';
    document.getElementById('fin-entry-type').value = type;
    document.getElementById('fin-entry-date').value = entry ? entry.date : todayLocal();
    document.getElementById('fin-entry-amount').value = entry ? entry.amount : '';
    document.getElementById('fin-entry-description').value = entry ? entry.description : '';
    document.getElementById('fin-entry-method').value = entry ? (entry.method || 'cash') : 'cash';
    document.getElementById('fin-entry-comment').value = entry ? (entry.comment || '') : '';
    openModal('modal-fin-entry');
}

function saveFinEntry(e) {
    e.preventDefault();
    const entries = DB.get('finEntries', []);
    const id = document.getElementById('fin-entry-id').value;
    const data = {
        type: document.getElementById('fin-entry-type').value,
        date: document.getElementById('fin-entry-date').value,
        amount: parseFloat(document.getElementById('fin-entry-amount').value) || 0,
        description: document.getElementById('fin-entry-description').value.trim(),
        method: document.getElementById('fin-entry-method').value,
        comment: document.getElementById('fin-entry-comment').value.trim(),
    };
    if (id) {
        const idx = entries.findIndex(e => e.id === parseInt(id));
        if (idx >= 0) entries[idx] = { ...entries[idx], ...data };
    } else {
        data.id = Date.now();
        entries.push(data);
    }
    DB.set('finEntries', entries);
    closeModal('modal-fin-entry');
    loadFinances();
    showToast(data.type === 'income' ? 'Доход добавлен' : 'Расход добавлен');
}

function deleteFinEntry(entryId) {
    showConfirm('Удалить запись?', 'Это действие нельзя отменить', () => {
        let entries = DB.get('finEntries', []);
        entries = entries.filter(e => e.id !== entryId);
        DB.set('finEntries', entries);
        loadFinances();
        showToast('Запись удалена');
    });
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

    // === 1b. MANUAL INCOME/EXPENSE entries ===
    const allFinEntries = DB.get('finEntries', []);
    const periodIncomeEntries = allFinEntries.filter(e => e.type === 'income' && e.date >= startDate && e.date <= endDate);
    const periodExpenseEntries = allFinEntries.filter(e => e.type === 'expense' && e.date >= startDate && e.date <= endDate);
    const totalManualIncome = periodIncomeEntries.reduce((s, e) => s + (e.amount || 0), 0);
    const totalManualExpense = periodExpenseEntries.reduce((s, e) => s + (e.amount || 0), 0);

    // === 2. CONSUMABLES: only actual purchases (incoming documents) ===
    const docs = DB.get('documents', []).filter(d =>
        d.type === 'incoming' && d.date >= startDate && d.date <= endDate
    );
    const totalConsumablesCost = docs.reduce((sum, d) => sum + (d.amount || 0) + (d.delivery || 0), 0) + totalManualExpense;

    // === 3. SALARIES ===
    const employees = DB.get('employees', []).filter(e => e.role !== 'director');
    const allShifts = DB.get('shifts', []);
    const todayForSal = todayLocal();
    const allPayments = getActiveSalaryPayments();
    let periodSalariesPaid = 0;
    let periodSalariesAccrued = 0; // earnings accrued DURING selected period
    const salaryRows = [];
    employees.forEach(emp => {
        // All-time earned (for debt/balance column in salary table)
        const allTimeShiftEarned = allShifts
            .filter(s => s.employeeId === emp.id && s.endTime && s.earnings && (s.shiftRole || s.employeeRole) !== 'manager')
            .reduce((s, sh) => s + (sh.earnings?.total || 0), 0);
        const allTimeMgr = getManagerDailyAccruals(emp, '2020-01-01', todayForSal)
            .reduce((s, a) => s + a.amount, 0);
        const allTimeHist = getHistoricalAccrualSum(emp.id, '2020-01-01', todayForSal);
        const accrued = allTimeShiftEarned + allTimeMgr + allTimeHist;

        // Period accruals — what employee EARNED during selected period
        const periodShiftEarned = allShifts
            .filter(s => s.employeeId === emp.id && s.date >= startDate && s.date <= endDate
                      && s.endTime && s.earnings && (s.shiftRole || s.employeeRole) !== 'manager')
            .reduce((s, sh) => s + (sh.earnings?.total || 0), 0);
        const periodMgrEarned = getManagerDailyAccruals(emp, startDate, endDate)
            .reduce((s, a) => s + a.amount, 0);
        const periodHistEarned = getHistoricalAccrualSum(emp.id, startDate, endDate);
        const periodAccrued = periodShiftEarned + periodMgrEarned + periodHistEarned;
        periodSalariesAccrued += periodAccrued;

        // All-time paid
        const paid = allPayments.filter(p => p.employeeId === emp.id).reduce((s, p) => s + (p.amount || 0), 0);
        // Period paid
        const periodPaid = allPayments
            .filter(p => p.employeeId === emp.id && p.date >= startDate && p.date <= endDate)
            .reduce((s, p) => s + (p.amount || 0), 0);
        periodSalariesPaid += periodPaid;

        // Shifts in period (for shift count display)
        const empShifts = allShifts.filter(s =>
            s.employeeId === emp.id && s.date >= startDate && s.date <= endDate
            && s.endTime && s.earnings && (s.shiftRole || s.employeeRole) !== 'manager'
        );
        const debt = accrued - paid; // positive = owed to employee, negative = overpaid
        if (accrued > 0 || paid > 0) {
            salaryRows.push({
                id: emp.id,
                name: emp.firstName + ' ' + emp.lastName,
                role: getRoleName(emp.role),
                shiftCount: empShifts.length,
                accrued, paid, debt,
                periodAccrued
            });
        }
    });

    // === 4. CERTIFICATES: sold in this period ===
    const allCerts = DB.get('certificates', []);
    const periodCerts = allCerts.filter(c => c.createdDate >= startDate && c.createdDate <= endDate);
    const totalCertIncome = periodCerts.reduce((sum, c) => sum + (c.initialAmount || 0), 0);

    // Balance = income – consumables – salary accruals for period (accrual-basis P&L)
    const totalExpenses = totalConsumablesCost + periodSalariesAccrued;
    const totalAllIncome = totalIncome + totalCertIncome + totalManualIncome;
    const totalBalance = totalAllIncome - totalExpenses;

    // === UPDATE CARDS ===
    document.getElementById('fin-income').textContent = formatMoney(totalIncome + totalManualIncome);
    document.getElementById('fin-cert-income').textContent = formatMoney(totalCertIncome);
    document.getElementById('fin-consumables').textContent = formatMoney(totalConsumablesCost);
    document.getElementById('fin-salaries').textContent = formatMoney(periodSalariesAccrued);

    const balEl = document.getElementById('fin-balance');
    balEl.textContent = (totalBalance >= 0 ? '+' : '') + formatMoney(totalBalance);
    balEl.className = 'fin-card-value ' + (totalBalance > 0 ? 'green' : totalBalance < 0 ? 'red' : '');

    // === EVENTS TABLE (events + manual income) ===
    const evtBody = document.getElementById('fin-events-body');
    if (completedEvents.length === 0 && periodIncomeEntries.length === 0) {
        evtBody.innerHTML = '<tr><td colspan="6" class="empty-state">Нет доходов за период</td></tr>';
    } else {
        let incomeHtml = completedEvents.slice().sort((a, b) => b.date.localeCompare(a.date)).map(ev => {
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
        // Manual income entries
        incomeHtml += periodIncomeEntries.sort((a, b) => b.date.localeCompare(a.date)).map(e => `<tr style="background:rgba(255,215,0,0.08);">
            <td>${e.date}</td>
            <td colspan="2">${e.description}${e.comment ? ' <span style="color:var(--text-secondary);font-size:11px;">(' + e.comment + ')</span>' : ''}</td>
            <td>—</td>
            <td style="color:var(--green);font-weight:600">${formatMoney(e.amount)}</td>
            <td>${getPaymentMethodName(e.method)}
                <button class="btn-icon" onclick="openFinEntryModal('income',${e.id})" title="Редактировать"><span class="material-icons-round" style="font-size:14px;">edit</span></button>
                <button class="btn-icon" onclick="deleteFinEntry(${e.id})" title="Удалить"><span class="material-icons-round" style="font-size:14px;">delete</span></button>
            </td>
        </tr>`).join('');
        evtBody.innerHTML = incomeHtml;
    }

    // === CONSUMABLES TABLE (purchases + manual expenses) ===
    const consBody = document.getElementById('fin-consumables-body');
    if (docs.length === 0 && periodExpenseEntries.length === 0) {
        consBody.innerHTML = '<tr><td colspan="6" class="empty-state">Нет расходов за период</td></tr>';
    } else {
        let html = docs.map(d => {
            const delivery = d.delivery || 0;
            const itemCost = d.amount || 0;
            const total = itemCost + delivery;
            return `<tr>
                <td>${d.date}</td>
                <td>${d.item || '—'}</td>
                <td>${d.qty || '—'} шт.</td>
                <td>${formatMoney(itemCost)}</td>
                <td>${delivery > 0 ? formatMoney(delivery) : '—'}</td>
                <td style="color:var(--red);font-weight:600">${formatMoney(total)}</td>
            </tr>`;
        }).join('');
        // Manual expense entries
        html += periodExpenseEntries.sort((a, b) => b.date.localeCompare(a.date)).map(e => `<tr style="background:rgba(255,82,82,0.08);">
            <td>${e.date}</td>
            <td>${e.description}${e.comment ? ' <span style="color:var(--text-secondary);font-size:11px;">(' + e.comment + ')</span>' : ''}</td>
            <td>—</td>
            <td style="color:var(--red);font-weight:600">${formatMoney(e.amount)}</td>
            <td>—</td>
            <td>
                <button class="btn-icon" onclick="openFinEntryModal('expense',${e.id})" title="Редактировать"><span class="material-icons-round" style="font-size:14px;">edit</span></button>
                <button class="btn-icon" onclick="deleteFinEntry(${e.id})" title="Удалить"><span class="material-icons-round" style="font-size:14px;">delete</span></button>
            </td>
        </tr>`).join('');
        html += `<tr style="font-weight:700;border-top:2px solid var(--border);">
            <td colspan="5" style="text-align:right;">Итого расходы:</td>
            <td style="color:var(--red);">${formatMoney(totalConsumablesCost)}</td>
        </tr>`;
        consBody.innerHTML = html;
    }

    // === SALARIES TABLE — per employee analytics ===
    // All-time totals (same as Сотрудники section)
    const totalSalAccrued = salaryRows.reduce((s, r) => s + r.accrued, 0);
    const totalSalPaid = salaryRows.reduce((s, r) => s + r.paid, 0);
    const totalSalDebt = totalSalAccrued - totalSalPaid;
    const salAccruedEl = document.getElementById('fin-sal-accrued');
    const salPaidEl = document.getElementById('fin-sal-paid');
    const salDebtEl = document.getElementById('fin-sal-debt');
    if (salAccruedEl) salAccruedEl.textContent = formatMoney(totalSalAccrued);
    if (salPaidEl) salPaidEl.textContent = formatMoney(totalSalPaid);
    if (salDebtEl) {
        salDebtEl.textContent = formatMoney(Math.abs(totalSalDebt));
        salDebtEl.className = 'sal-summary-value ' + (totalSalDebt > 0 ? 'red' : totalSalDebt < 0 ? 'green' : '');
    }

    const salBody = document.getElementById('fin-salaries-body');
    if (salaryRows.length === 0) {
        salBody.innerHTML = '<tr><td colspan="6" class="empty-state">Нет начислений за период</td></tr>';
    } else {
        let html = salaryRows.map(r => {
            const debtColor = r.debt > 0 ? 'var(--red)' : r.debt < 0 ? 'var(--green)' : '';
            const debtStr = r.debt > 0 ? formatMoney(r.debt) : r.debt < 0 ? '−' + formatMoney(-r.debt) : '—';
            return `<tr>
                <td>${r.name}<br><span style="color:var(--text-secondary);font-size:11px;">${r.role}</span></td>
                <td>${r.shiftCount}</td>
                <td style="color:var(--green);font-weight:600">${formatMoney(r.accrued)}</td>
                <td>${formatMoney(r.paid)}</td>
                <td style="color:${debtColor};font-weight:600">${debtStr}</td>
                <td><button class="btn-sm btn-primary" onclick="openSalaryPaymentModal(${r.id})" style="font-size:11px;padding:3px 8px;white-space:nowrap;">Выплатить</button></td>
            </tr>`;
        }).join('');
        const totalDebtStr = totalSalDebt > 0 ? formatMoney(totalSalDebt) : totalSalDebt < 0 ? '−' + formatMoney(-totalSalDebt) : '—';
        const totalDebtColor = totalSalDebt > 0 ? 'var(--red)' : totalSalDebt < 0 ? 'var(--green)' : '';
        html += `<tr style="font-weight:700;border-top:2px solid var(--border);">
            <td colspan="2" style="text-align:right;">Итого:</td>
            <td style="color:var(--green)">${formatMoney(totalSalAccrued)}</td>
            <td>${formatMoney(totalSalPaid)}</td>
            <td style="color:${totalDebtColor}">${totalDebtStr}</td>
            <td></td>
        </tr>`;
        salBody.innerHTML = html;
    }

    // === PAYMENT HISTORY TABLE ===
    const histBody = document.getElementById('fin-payments-history-body');
    if (histBody) {
        const periodPayments = getActiveSalaryPayments()
            .filter(p => p.date >= startDate && p.date <= endDate)
            .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
        if (periodPayments.length === 0) {
            histBody.innerHTML = '<tr><td colspan="6" class="empty-state">Нет выплат за период</td></tr>';
        } else {
            histBody.innerHTML = periodPayments.map(p => `<tr>
                <td>${p.date}</td>
                <td>${p.time || '—'}</td>
                <td>${p.employeeName || '—'}</td>
                <td style="color:var(--green);font-weight:600">${formatMoney(p.amount)}</td>
                <td>${getPaymentMethodName(p.method)}</td>
                <td style="color:var(--text-secondary);font-size:12px;">${p.note || '—'}</td>
            </tr>`).join('');
        }
    }

    // === SHIFTS TABLE ===
    const shiftsBody = document.getElementById('fin-shifts-body');
    if (shiftsBody) {
        const periodShifts = allShifts.filter(s =>
            s.date >= startDate && s.date <= endDate && s.endTime
        ).sort((a, b) => b.date.localeCompare(a.date));
        const empMap = {};
        DB.get('employees', []).forEach(e => empMap[e.id] = e);
        if (periodShifts.length === 0) {
            shiftsBody.innerHTML = '<tr><td colspan="7" class="empty-state">Нет смен за период</td></tr>';
        } else {
            shiftsBody.innerHTML = periodShifts.map(s => {
                const emp = empMap[s.employeeId];
                const empName = emp ? (emp.firstName + ' ' + emp.lastName) : '—';
                const role = s.shiftRole || s.employeeRole || emp?.role;
                const isManager = role === 'manager';
                const startT = s.startTime || '—';
                const endT = s.endTime || '—';
                const hours = s.duration ? formatDuration(s.duration) : '—';
                const baseVal = s.earnings?.base || 0;
                const bonusVal = s.earnings?.bonus || 0;
                const base = isManager ? '—' : formatMoney(baseVal);
                const bonus = isManager ? '—' : (bonusVal > 0 ? formatMoney(bonusVal) : '—');
                const mgrRate = isManager ? formatMoney(s.earnings?.total || 0) : '—';
                return `<tr>
                    <td>${s.date}</td>
                    <td>${startT}–${endT}<br><span style="color:var(--text-secondary);font-size:11px;">${hours}</span></td>
                    <td>${empName}</td>
                    <td>${getRoleName(role)}</td>
                    <td>${base}</td>
                    <td>${bonus}</td>
                    <td>${mgrRate}</td>
                </tr>`;
            }).join('');
        }
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
            <td>${c.paymentMethod === 'transfer' && c.transferBank ? getPaymentMethodName(c.transferBank) : getPaymentMethodName(c.paymentMethod)}</td>
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

function toggleCertTransferBanks(e) {
    // Select the radio inside the clicked label
    const radio = e.currentTarget.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;
    document.getElementById('cert-transfer-banks').style.display = '';
}

// Hide transfer banks when other payment is selected
document.addEventListener('change', (e) => {
    if (e.target.name === 'cert-payment' && e.target.value !== 'transfer') {
        const banks = document.getElementById('cert-transfer-banks');
        if (banks) banks.style.display = 'none';
    }
});

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

    const paymentMethod = cert ? cert.paymentMethod : 'card';
    document.querySelectorAll('input[name="cert-payment"]').forEach(r => {
        r.checked = r.value === paymentMethod;
    });

    // Transfer banks
    const banksEl = document.getElementById('cert-transfer-banks');
    if (paymentMethod === 'transfer') {
        banksEl.style.display = '';
        const transferBank = cert ? (cert.transferBank || 'sberbank') : 'sberbank';
        document.querySelectorAll('input[name="cert-transfer-bank"]').forEach(r => {
            r.checked = r.value === transferBank;
        });
    } else {
        banksEl.style.display = 'none';
    }

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
        transferBank: document.querySelector('input[name="cert-payment"]:checked').value === 'transfer'
            ? (document.querySelector('input[name="cert-transfer-bank"]:checked')?.value || 'sberbank') : null,
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
    const docs = DB.get('documents', []).filter(d => d.type === tab).sort((a, b) => b.date.localeCompare(a.date));
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

let _saveDoc_oldData = null; // Хранит старые данные документа для коррекции склада при редактировании

function openDocumentModal(id = null) {
    const form = document.getElementById('document-form');
    form.reset();
    document.getElementById('doc-id').value = '';
    _saveDoc_oldData = null;
    if (id) {
        const doc = DB.get('documents', []).find(d => String(d.id) === String(id));
        if (!doc) return;
        _saveDoc_oldData = { item: doc.item, qty: doc.qty, type: doc.type };
        document.getElementById('modal-document-title').textContent = 'Редактировать документ';
        document.getElementById('doc-id').value = doc.id;
        document.getElementById('doc-type').value = doc.type;
        document.getElementById('doc-date').value = doc.date;
        document.getElementById('doc-item').value = doc.item;
        document.getElementById('doc-qty').value = doc.qty;
        document.getElementById('doc-amount').value = doc.amount;
        document.getElementById('doc-delivery').value = doc.delivery || '';
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
    // Read item name: from select if not custom, else from text input
    const itemSel = document.getElementById('doc-item-select');
    const itemInput = document.getElementById('doc-item');
    const itemValue = (itemSel.value && itemSel.value !== '__custom')
        ? itemSel.value
        : itemInput.value.trim();

    const data = {
        type: document.getElementById('doc-type').value,
        date: document.getElementById('doc-date').value,
        item: itemValue,
        qty: parseInt(document.getElementById('doc-qty').value) || 0,
        amount: parseFloat(document.getElementById('doc-amount').value) || 0,
        delivery: parseFloat(document.getElementById('doc-delivery').value) || 0,
        comment: document.getElementById('doc-comment').value.trim(),
    };
    if (id) {
        const idx = docs.findIndex(d => String(d.id) === String(id));
        if (idx >= 0) docs[idx] = { ...docs[idx], ...data };
    } else {
        data.id = Date.now();
        docs.push(data);
    }
    DB.set('documents', docs);

    closeModal('modal-document');
    loadDocuments(data.type);
    // Refresh stock display if on stock page
    if (typeof loadStock === 'function') loadStock();
    showToast('Документ сохранён');
}

function deleteDocument(id) {
    showConfirm('Удалить документ?', 'Это действие нельзя отменить', () => {
        const docs = DB.get('documents', []);
        const doc = docs.find(d => String(d.id) === String(id));
        const remaining = docs.filter(d => String(d.id) !== String(id));
        DB.set('documents', remaining);
        loadDocuments();
        if (typeof loadStock === 'function') loadStock();
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
    document.getElementById('rule-manager-daily-rate').value = rules.manager?.dailyRate ?? 340;

    // Stock
    const stockComputed = getStockFromDocs();
    const stockBase = DB.get('stockBase', {});
    document.getElementById('set-balls').value = stockComputed.balls || 0;
    document.getElementById('set-balls-critical').value = stockBase.ballsCritical || 60000;
    document.getElementById('set-kids-balls').value = stockComputed.kidsBalls || 0;
    document.getElementById('set-kids-balls-critical').value = stockBase.kidsBallsCritical || 20000;
    document.getElementById('set-grenades').value = stockComputed.grenades || 0;
    document.getElementById('set-grenades-critical').value = stockBase.grenadesCritical || 100;
    document.getElementById('set-smokes').value = stockComputed.smokes || 0;
    document.getElementById('set-smokes-critical').value = stockBase.smokesCritical || 50;

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
                dailyRate: parseFloat(document.getElementById('rule-manager-daily-rate').value) || 340
            }
        };
        DB.set('salaryRules', newRules);
        showToast('Правила начисления зарплаты сохранены');
    });

    document.getElementById('btn-save-stock').addEventListener('click', () => {
        // Save critical levels to stockBase; actual quantities use document-based calculation
        const stockBase = DB.get('stockBase', {});
        stockBase.ballsCritical = parseInt(document.getElementById('set-balls-critical').value) || 60000;
        stockBase.kidsBallsCritical = parseInt(document.getElementById('set-kids-balls-critical').value) || 20000;
        stockBase.grenadesCritical = parseInt(document.getElementById('set-grenades-critical').value) || 100;
        stockBase.smokesCritical = parseInt(document.getElementById('set-smokes-critical').value) || 50;
        DB.set('stockBase', stockBase);
        loadStock();
        showToast('Настройки склада сохранены');
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
                emp.managerUntil = today; // exclusive: this day is NOT paid
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
    paintball: ['Пейнтбол'],
    tir: ['Тир пейнтбольный'],
    laser: ['Лазертаг'],
    kidball: ['Кидбол'],
    quest: ['Квесты'],
    sup: ['Водная прогулка на Сап-бордах', 'Сапы'],
    atv: ['Квадроциклы'],
    race: ['Гонка с препятствиями'],
    rent: ['Аренда'],
};

// ===== GAME BLOCKS =====

function _buildTariffOptionsForType(gameType, currentVal) {
    const allTariffs = DB.get('tariffs', []).filter(t => t.category === 'services');
    const allowedCats = EVENT_TYPE_TARIFF_MAP[gameType];
    const filtered = allowedCats ? allTariffs.filter(t => allowedCats.includes(t.sheetCategory)) : allTariffs;
    return '<option value="">— Тариф —</option>' +
        filtered.map(t => `<option value="${t.id}"${String(t.id) === String(currentVal) ? ' selected' : ''}>${t.name} — ${formatMoney(t.price)}/${t.unit || 'чел.'}</option>`).join('');
}

// Keep for any internal backward-compat usage
function _buildTariffOptions(currentVal) {
    const type = document.getElementById('evt-type')?.value || '';
    return _buildTariffOptionsForType(type, currentVal);
}

const GAME_TYPE_LABELS = {
    paintball: 'Пейнтбол', tir: 'Тир', kidball: 'Кидбол', laser: 'Лазертаг',
    atv: 'Квадроциклы', race: 'Гонка с препятствиями', sup: 'Сапы',
    rent: 'Аренда', quest: 'Квесты', other: 'Другое'
};

function _renderGBTypeOptions(selectedType) {
    return Object.entries(GAME_TYPE_LABELS)
        .map(([v, l]) => `<option value="${v}"${v === selectedType ? ' selected' : ''}>${l}</option>`)
        .join('');
}

function _renderGBTariffRow(gameType, tariffId, participants) {
    return `<div class="gb-tariff-row">
      <select class="gb-tariff-sel" onchange="recalcEventTotal()">${_buildTariffOptionsForType(gameType, tariffId)}</select>
      <input type="number" class="gb-ppl-input" min="1" value="${participants || 1}" oninput="recalcEventTotal()">
      <span class="gb-ppl-lbl">чел.</span>
      <button type="button" class="gb-tr-remove" onclick="removeGBTariffRow(this)">
        <span class="material-icons-round">close</span>
      </button>
    </div>`;
}

function _renderGBStaffChips(allEmps, selectedIds, role) {
    const filtered = allEmps.filter(e => {
        const roles = e.allowedShiftRoles || getDefaultAllowedRoles(e.role);
        if (role === 'instructor') return roles.includes('instructor') || roles.includes('senior_instructor');
        if (role === 'admin') return roles.includes('admin');
        return false;
    });
    if (!filtered.length) return '<span style="font-size:11px;color:var(--text-secondary);">—</span>';
    return filtered.map(e =>
        `<button type="button" class="gb-staff-chip${selectedIds.includes(e.id) ? ' active' : ''}" data-emp-id="${e.id}" onclick="toggleGBStaffChip(this)">${e.firstName}</button>`
    ).join('');
}

function _renderGameBlock(blockData, allEmps, blockIndex, totalBlocks) {
    const { gameType = 'paintball', tariffs = [{ tariffId: null, participants: 10 }], instructors = [], admins = [] } = blockData;
    const showRemove = totalBlocks > 1;
    const firstTariff = tariffs[0] || { tariffId: null, participants: 10 };
    const extraRows = tariffs.slice(1).map(t => _renderGBTariffRow(gameType, t.tariffId, t.participants)).join('');
    const instrChips = _renderGBStaffChips(allEmps, instructors, 'instructor');
    const adminChips = _renderGBStaffChips(allEmps, admins, 'admin');
    return `<div class="game-block">
  <div class="gb-tariff-rows">
    <div class="gb-tariff-row gb-first-row">
      <select class="gb-type" onchange="onGBTypeChange(this)">${_renderGBTypeOptions(gameType)}</select>
      <select class="gb-tariff-sel" onchange="recalcEventTotal()">${_buildTariffOptionsForType(gameType, firstTariff.tariffId)}</select>
      <input type="number" class="gb-ppl-input" min="1" value="${firstTariff.participants || 1}" oninput="recalcEventTotal()">
      <span class="gb-ppl-lbl">чел.</span>
      <button type="button" class="gb-remove-btn" onclick="removeGameBlock(this)" style="${showRemove ? '' : 'display:none;'}">
        <span class="material-icons-round">close</span>
      </button>
    </div>
    ${extraRows}
  </div>
  <button type="button" class="gb-add-tariff-btn" onclick="addGBTariffRow(this)">
    <span class="material-icons-round" style="font-size:13px;">add</span> Тариф
  </button>
  <div class="gb-staff">
    <div class="gb-staff-row">
      <span class="gb-staff-lbl">Инстр.:</span>
      <div class="gb-instr-chips">${instrChips}</div>
    </div>
    <div class="gb-staff-row">
      <span class="gb-staff-lbl">Адм.:</span>
      <div class="gb-admin-chips">${adminChips}</div>
    </div>
  </div>
</div>`;
}

function initGameBlocksUI(gameBlocks) {
    const list = document.getElementById('game-blocks-list');
    if (!list) return;
    const allEmps = DB.get('employees', []).filter(e => e.role !== 'director');
    if (!gameBlocks || gameBlocks.length === 0) {
        gameBlocks = [{ gameType: 'paintball', tariffs: [{ tariffId: null, participants: 10 }], instructors: [], admins: [] }];
    }
    list.innerHTML = gameBlocks.map((b, i) => _renderGameBlock(b, allEmps, i, gameBlocks.length)).join('');
    _updateGBRemoveButtons();
}

function addGameBlock() {
    const list = document.getElementById('game-blocks-list');
    if (!list) return;
    const allEmps = DB.get('employees', []).filter(e => e.role !== 'director');
    const totalBlocks = list.querySelectorAll('.game-block').length + 1;
    const html = _renderGameBlock({ gameType: 'paintball', tariffs: [{ tariffId: null, participants: 1 }], instructors: [], admins: [] }, allEmps, totalBlocks - 1, totalBlocks);
    list.insertAdjacentHTML('beforeend', html);
    _updateGBRemoveButtons();
    recalcEventTotal();
}

function removeGameBlock(btn) {
    btn.closest('.game-block')?.remove();
    _updateGBRemoveButtons();
    recalcEventTotal();
}

function _updateGBRemoveButtons() {
    const blocks = document.querySelectorAll('#game-blocks-list .game-block');
    blocks.forEach(block => {
        const btn = block.querySelector('.gb-remove-btn');
        if (btn) btn.style.display = blocks.length > 1 ? 'inline-flex' : 'none';
    });
}

function onGBTypeChange(sel) {
    const block = sel.closest('.game-block');
    if (!block) return;
    const gameType = sel.value;
    block.querySelectorAll('.gb-tariff-row').forEach(row => {
        const tariffSel = row.querySelector('.gb-tariff-sel');
        if (tariffSel) tariffSel.innerHTML = _buildTariffOptionsForType(gameType, tariffSel.value);
    });
    recalcEventTotal();
}

function addGBTariffRow(btn) {
    const block = btn.closest('.game-block');
    if (!block) return;
    const gameType = block.querySelector('.gb-type')?.value || '';
    const rowsContainer = block.querySelector('.gb-tariff-rows');
    if (rowsContainer) {
        rowsContainer.insertAdjacentHTML('beforeend', _renderGBTariffRow(gameType, null, 1));
    }
    recalcEventTotal();
}

function removeGBTariffRow(btn) {
    const row = btn.closest('.gb-tariff-row');
    const block = btn.closest('.game-block');
    if (!block) return;
    const rows = block.querySelectorAll('.gb-tariff-row');
    if (rows.length > 1) {
        row?.remove();
        recalcEventTotal();
    }
}

function toggleGBStaffChip(btn) {
    btn.classList.toggle('active');
}

function getGameBlocksFromDOM() {
    const blocks = [];
    document.querySelectorAll('#game-blocks-list .game-block').forEach(block => {
        const gameType = block.querySelector('.gb-type')?.value || 'other';
        const tariffs = [];
        block.querySelectorAll('.gb-tariff-row').forEach(row => {
            const tariffId = row.querySelector('.gb-tariff-sel')?.value || null;
            const participants = parseInt(row.querySelector('.gb-ppl-input')?.value) || 1;
            tariffs.push({ tariffId: tariffId ? parseInt(tariffId) : null, participants });
        });
        const instructors = [...block.querySelectorAll('.gb-instr-chips .gb-staff-chip.active')].map(c => parseInt(c.dataset.empId));
        const admins = [...block.querySelectorAll('.gb-admin-chips .gb-staff-chip.active')].map(c => parseInt(c.dataset.empId));
        blocks.push({ gameType, tariffs, instructors, admins });
    });
    return blocks.length > 0 ? blocks : [{ gameType: 'other', tariffs: [{ tariffId: null, participants: 1 }], instructors: [], admins: [] }];
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

function getStaffBadges(evt) {
    const emps = DB.get('employees', []);
    const badges = [];
    const instrIds = evt.instructors || (evt.instructor ? [evt.instructor] : []);
    instrIds.forEach(id => {
        const emp = emps.find(e => e.id === id);
        if (emp) badges.push(`<span style="display:inline-flex;align-items:center;gap:2px;background:rgba(var(--accent-rgb,33,150,243),0.18);color:var(--accent);border-radius:10px;padding:1px 8px;font-size:11px;font-weight:600;white-space:nowrap;"><span class="material-icons-round" style="font-size:11px;">sports</span>${emp.firstName}</span>`);
    });
    (evt.admins || []).forEach(id => {
        const emp = emps.find(e => e.id === id);
        if (emp) badges.push(`<span style="display:inline-flex;align-items:center;gap:2px;background:rgba(156,39,176,0.15);color:#ce93d8;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:600;white-space:nowrap;"><span class="material-icons-round" style="font-size:11px;">manage_accounts</span>${emp.firstName}</span>`);
    });
    return badges.join('');
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
                ${(t.ballsPerPerson || t.kidsBallsPerPerson || t.grenadesPerPerson || t.smokesPerPerson || t.freePrice) ? `<div class="tariff-consumables">
                    ${t.ballsPerPerson ? `<span class="consumable-badge balls">${t.ballsPerPerson} шаров 0.68</span>` : ''}
                    ${t.kidsBallsPerPerson ? `<span class="consumable-badge balls">${t.kidsBallsPerPerson} шаров 0.50</span>` : ''}
                    ${t.grenadesPerPerson ? `<span class="consumable-badge grenades">${t.grenadesPerPerson} гранат</span>` : ''}
                    ${t.smokesPerPerson ? `<span class="consumable-badge smokes">${t.smokesPerPerson} дым</span>` : ''}
                    ${t.freePrice ? `<span class="consumable-badge">свободная цена</span>` : ''}
                </div>` : ''}
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
        document.getElementById('tariff-sheet-category').value = tariff.sheetCategory || '';
        document.getElementById('tariff-service-id').value = tariff.serviceId || '';
        document.getElementById('tariff-name').value = tariff.name;
        document.getElementById('tariff-price').value = tariff.price || '';
        document.getElementById('tariff-unit').value = tariff.unit || '';
        document.getElementById('tariff-free-price').checked = !!tariff.freePrice;
        document.getElementById('tariff-duration').value = tariff.duration || '';
        document.getElementById('tariff-min-people').value = tariff.minPeople || '';
        document.getElementById('tariff-age').value = tariff.age || '';
        document.getElementById('tariff-included').value = tariff.included || '';
        document.getElementById('tariff-description').value = tariff.description || '';
        document.getElementById('tariff-balls').value = tariff.ballsPerPerson || '';
        document.getElementById('tariff-kids-balls').value = tariff.kidsBallsPerPerson || '';
        document.getElementById('tariff-grenades').value = tariff.grenadesPerPerson || '';
        document.getElementById('tariff-smokes').value = tariff.smokesPerPerson || '';
        document.getElementById('btn-delete-tariff').style.display = 'inline-flex';
    } else {
        document.getElementById('modal-tariff-title').textContent = 'Новый тариф';
        document.getElementById('tariff-sheet-category').value = dirTariffSubcategory || '';
    }

    // Populate categories datalist
    const dl = document.getElementById('tariff-sheet-category-list');
    if (dl) {
        const cats = [...new Set(DB.get('tariffs', []).map(t => t.sheetCategory).filter(Boolean))];
        dl.innerHTML = cats.map(c => `<option value="${c}">`).join('');
    }

    openModal('modal-tariff');
}

function saveTariff(e) {
    e.preventDefault();
    const tariffs = DB.get('tariffs', []);
    const id = document.getElementById('tariff-id').value;

    const data = {
        category: document.getElementById('tariff-category').value,
        sheetCategory: document.getElementById('tariff-sheet-category').value.trim(),
        serviceId: document.getElementById('tariff-service-id').value.trim(),
        name: document.getElementById('tariff-name').value.trim(),
        price: parseFloat(document.getElementById('tariff-price').value) || 0,
        unit: document.getElementById('tariff-unit').value.trim() || 'чел',
        freePrice: document.getElementById('tariff-free-price').checked,
        duration: parseInt(document.getElementById('tariff-duration').value) || 0,
        minPeople: parseInt(document.getElementById('tariff-min-people').value) || 0,
        age: document.getElementById('tariff-age').value.trim(),
        included: document.getElementById('tariff-included').value.trim(),
        description: document.getElementById('tariff-description').value.trim(),
        ballsPerPerson: parseInt(document.getElementById('tariff-balls').value) || 0,
        kidsBallsPerPerson: parseInt(document.getElementById('tariff-kids-balls').value) || 0,
        grenadesPerPerson: parseInt(document.getElementById('tariff-grenades').value) || 0,
        smokesPerPerson: parseInt(document.getElementById('tariff-smokes').value) || 0,
    };
    if (data.category === 'services' && !data.sheetCategory) {
        showToast('Укажите категорию (например: Пейнтбол)', 'error');
        return;
    }

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
