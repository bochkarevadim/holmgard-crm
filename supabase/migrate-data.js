/**
 * Миграция данных из Firebase Firestore → Supabase
 *
 * Запуск: node supabase/migrate-data.js
 *
 * Переменные окружения:
 *   SUPABASE_URL       — URL проекта Supabase
 *   SUPABASE_KEY       — service_role key (для обхода RLS)
 *   FIREBASE_PROJECT_ID — ID проекта Firebase
 *
 * Требуется:
 *   npm install @supabase/supabase-js firebase-admin
 */

import { createClient } from '@supabase/supabase-js';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// ──────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zubxspuiogpyvnaevpxu.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YnhzcHVpb2dweXZuYWV2cHh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjExMTI1OCwiZXhwIjoyMDkxNjg3MjU4fQ.2NTxhbkqW4j2VCuEQNzB_xVVuLRT1UpFKdyuNEgikw0';
const FIREBASE_SERVICE_ACCOUNT = new URL('./holmgard-crm-c5680-firebase-adminsdk-fbsvc-e08acf5f35.json', import.meta.url).pathname;
const ORG_PATH = 'orgs/holmgard/data';

// ──────────────────────────────────────────
// INIT
// ──────────────────────────────────────────

const serviceAccount = JSON.parse(readFileSync(FIREBASE_SERVICE_ACCOUNT, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const firestore = admin.firestore();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ──────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────

async function getFirestoreData(key) {
    const doc = await firestore.doc(`${ORG_PATH}/${key}`).get();
    return doc.exists ? doc.data()?.value : null;
}

async function getOrgId() {
    const { data } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', 'holmgard')
        .single();
    return data.id;
}

function parseDate(d) {
    if (!d) return null;
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    return String(d).slice(0, 10) || null;
}

function parseTime(t) {
    if (!t) return null;
    return String(t).slice(0, 5) || null;
}

// Batch insert (Supabase limit ~1000 rows per request)
async function batchInsert(table, rows, batchSize = 500) {
    if (!rows.length) return;
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase.from(table).insert(batch);
        if (error) {
            console.error(`  ERROR inserting into ${table} (batch ${i}):`, error.message);
            // Попробуем по одной записи
            for (const row of batch) {
                const { error: e2 } = await supabase.from(table).insert(row);
                if (e2) console.error(`  SKIP row in ${table}:`, e2.message, row.id);
            }
        }
    }
    console.log(`  ✓ ${table}: ${rows.length} rows`);
}

// ──────────────────────────────────────────
// MIGRATIONS
// ──────────────────────────────────────────

async function migrateEmployees(orgId) {
    console.log('\n→ Employees...');
    const employees = await getFirestoreData('employees');
    if (!employees?.length) return;

    const rows = employees.map(e => ({
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
        blocked: e.blocked || false,
        allowed_shift_roles: e.allowedShiftRoles || [],
        manager_since: parseDate(e.managerSince),
        manager_until: parseDate(e.managerUntil),
    }));

    await batchInsert('employees', rows);
}

async function migrateClients(orgId) {
    console.log('\n→ Clients...');
    const clients = await getFirestoreData('clients');
    if (!clients?.length) return;

    const clientRows = [];
    const visitRows = [];

    for (const c of clients) {
        clientRows.push({
            id: c.id,
            org_id: orgId,
            first_name: c.firstName || '',
            last_name: c.lastName || '',
            phone: c.phone || '',
            email: c.email || '',
            dob: parseDate(c.dob),
            notes: c.notes || '',
            groldiks: c.groldiks || 0,
            total_spent: c.totalSpent || 0,
        });

        if (c.visits?.length) {
            for (const v of c.visits) {
                visitRows.push({
                    client_id: c.id,
                    visit_date: parseDate(v.date),
                    game: v.game || '',
                });
            }
        }
    }

    await batchInsert('clients', clientRows);
    await batchInsert('client_visits', visitRows);
}

async function migrateTariffs(orgId) {
    console.log('\n→ Tariffs...');
    const tariffs = await getFirestoreData('tariffs');
    if (!tariffs?.length) return;

    const rows = tariffs.map(t => ({
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
        quantity: t.quantity || 1,
    }));

    await batchInsert('tariffs', rows);
}

async function migrateEvents(orgId) {
    console.log('\n→ Events...');
    const events = await getFirestoreData('events');
    if (!events?.length) return;

    const eventRows = [];
    const tariffGroupRows = [];
    const optionRows = [];
    const instructorRows = [];
    const adminRows = [];

    for (const e of events) {
        eventRows.push({
            id: e.id,
            org_id: orgId,
            title: e.title || '',
            client_name: e.clientName || '',
            client_phone: e.clientPhone || '',
            contact_channel: ['wa', 'tg', 'vk', 'phone', 'other'].includes(e.contactChannel)
                ? e.contactChannel : 'other',
            event_date: parseDate(e.date),
            event_time: parseTime(e.time),
            duration: e.duration || 0,
            event_type: ['paintball', 'laser', 'kidball', 'quest', 'sup', 'atv', 'race', 'rent', 'other'].includes(e.type)
                ? e.type : 'other',
            occasion: e.occasion || '',
            player_age: e.playerAge || '',
            participants: e.participants || 0,
            price: e.price || e.totalPrice || 0,
            discount: e.discount || 0,
            discount_type: ['none', 'percent', 'certificate'].includes(e.discountType)
                ? e.discountType : 'none',
            certificate_number: e.certificateNumber || null,
            certificate_amount: e.certificateAmount || 0,
            status: ['pending', 'confirmed', 'completed', 'cancelled'].includes(e.status)
                ? e.status : 'pending',
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
            instructor_rating: e.instructorRating || 0,
        });

        // Тарифные группы
        if (e.tariffGroups?.length) {
            e.tariffGroups.forEach((g, i) => {
                tariffGroupRows.push({
                    event_id: e.id,
                    tariff_id: g.tariffId || null,
                    participants: g.participants || 0,
                    sort_order: i,
                });
            });
        } else if (e.tariffId) {
            tariffGroupRows.push({
                event_id: e.id,
                tariff_id: e.tariffId,
                participants: e.participants || 0,
                sort_order: 0,
            });
        }

        // Опции
        const options = e.selectedOptions || [];
        const quantities = e.optionQuantities || {};
        for (const optId of options) {
            optionRows.push({
                event_id: e.id,
                tariff_id: optId,
                quantity: quantities[optId] || 1,
            });
        }

        // Инструкторы
        const instrs = e.instructors || e.assignedInstructors || [];
        for (const empId of (Array.isArray(instrs) ? instrs : [instrs])) {
            if (empId) instructorRows.push({ event_id: e.id, employee_id: empId });
        }

        // Админы
        const adms = e.admins || e.assignedAdmins || [];
        for (const empId of (Array.isArray(adms) ? adms : [adms])) {
            if (empId) adminRows.push({ event_id: e.id, employee_id: empId });
        }
    }

    await batchInsert('events', eventRows);
    await batchInsert('event_tariff_groups', tariffGroupRows);
    await batchInsert('event_options', optionRows);
    await batchInsert('event_instructors', instructorRows);
    await batchInsert('event_admins', adminRows);
}

async function migrateShifts(orgId) {
    console.log('\n→ Shifts...');
    const shifts = await getFirestoreData('shifts');
    if (!shifts?.length) return;

    const shiftRows = [];
    const bonusRows = [];

    for (const s of shifts) {
        const role = s.shiftRole || s.employeeRole || 'instructor';
        shiftRows.push({
            id: s.id,
            org_id: orgId,
            employee_id: s.employeeId,
            shift_role: ['admin', 'senior_instructor', 'instructor', 'manager'].includes(role)
                ? role : 'instructor',
            shift_date: parseDate(s.date),
            start_time: parseTime(s.startTime),
            end_time: parseTime(s.endTime),
            earnings_base: s.earnings?.base || 0,
            earnings_bonus: s.earnings?.bonus || 0,
            earnings_total: s.earnings?.total || 0,
            bonus_detail: s.earnings?.bonusDetail || '',
            auto_closed: s.autoClosedAt ? true : false,
        });

        if (s.eventBonuses?.length) {
            for (const b of s.eventBonuses) {
                bonusRows.push({
                    shift_id: s.id,
                    event_id: b.eventId,
                    amount: b.amount || 0,
                    bonus_type: b.bonusType || 'instructor',
                });
            }
        }
    }

    await batchInsert('shifts', shiftRows);
    await batchInsert('shift_event_bonuses', bonusRows);
}

async function migrateSalaryPayments(orgId) {
    console.log('\n→ Salary Payments...');
    const payments = await getFirestoreData('salaryPayments');
    const deleted = await getFirestoreData('deletedSalaryPaymentIds') || [];
    if (!payments?.length) return;

    const rows = payments
        .filter(p => !deleted.includes(p.id))
        .map(p => ({
            id: p.id,
            org_id: orgId,
            employee_id: p.employeeId,
            payment_date: parseDate(p.date),
            payment_time: parseTime(p.time),
            amount: p.amount || 0,
            method: p.method || 'cash',
            note: p.note || '',
        }));

    await batchInsert('salary_payments', rows);
}

async function migrateHistoricalAccruals(orgId) {
    console.log('\n→ Historical Accruals...');
    const accruals = await getFirestoreData('historicalAccruals');
    if (!accruals?.length) return;

    const rows = accruals.map(a => ({
        id: String(a.id),
        org_id: orgId,
        employee_id: a.employeeId,
        accrual_date: parseDate(a.date),
        amount: a.amount || 0,
        note: a.note || '',
    }));

    await batchInsert('historical_accruals', rows);
}

async function migrateSalaryRules(orgId) {
    console.log('\n→ Salary Rules...');
    const rules = await getFirestoreData('salaryRules');
    if (!rules) return;

    for (const role of ['instructor', 'senior_instructor', 'admin', 'manager']) {
        const r = rules[role];
        if (!r) continue;
        await supabase.from('salary_rules').upsert({
            org_id: orgId,
            role,
            shift_rate: r.shiftRate || 0,
            bonus_percent: r.bonusPercent || 0,
            daily_rate: r.dailyRate || 0,
            bonus_sources: r.bonusSources || [],
        }, { onConflict: 'org_id,role' });
    }
    console.log('  ✓ salary_rules');
}

async function migrateDocuments(orgId) {
    console.log('\n→ Documents...');
    const docs = await getFirestoreData('documents');
    if (!docs?.length) return;

    const rows = docs.map(d => ({
        id: Math.round(d.id),
        org_id: orgId,
        doc_type: d.type || 'incoming',
        doc_date: parseDate(d.date),
        item: d.item || '',
        qty: d.qty || 0,
        amount: d.amount || 0,
        delivery: d.delivery || 0,
        comment: d.comment || '',
        event_id: d.eventId || null,
    }));

    await batchInsert('documents', rows);
}

async function migrateStockBase(orgId) {
    console.log('\n→ Stock Base...');
    const base = await getFirestoreData('stockBase');
    if (!base) return;

    await supabase.from('stock_base').upsert({
        org_id: orgId,
        balls: base.balls || 0,
        kids_balls: base.kidsBalls || 0,
        grenades: base.grenades || 0,
        smokes: base.smokes || 0,
        balls_critical: base.ballsCritical || 60000,
        kids_balls_critical: base.kidsBallsCritical || 20000,
        grenades_critical: base.grenadesCritical || 100,
        smokes_critical: base.smokesCritical || 50,
    }, { onConflict: 'org_id' });
    console.log('  ✓ stock_base');
}

async function migrateCertificates(orgId) {
    console.log('\n→ Certificates...');
    const certs = await getFirestoreData('certificates');
    if (!certs?.length) return;

    const certRows = [];
    const usageRows = [];

    for (const c of certs) {
        certRows.push({
            id: c.id,
            org_id: orgId,
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
            note: c.note || '',
        });

        if (c.usageHistory?.length) {
            for (const u of c.usageHistory) {
                usageRows.push({
                    certificate_id: c.id,
                    usage_date: parseDate(u.date),
                    event_title: u.eventTitle || '',
                    amount: u.amount || 0,
                });
            }
        }
    }

    await batchInsert('certificates', certRows);
    await batchInsert('certificate_usage', usageRows);
}

async function migrateFinancialEntries(orgId) {
    console.log('\n→ Financial Entries...');
    const entries = await getFirestoreData('finEntries');
    if (!entries?.length) return;

    const rows = entries.map(e => ({
        id: e.id,
        org_id: orgId,
        entry_type: e.type || 'income',
        entry_date: parseDate(e.date),
        amount: e.amount || 0,
        description: e.description || '',
        method: e.method || null,
        comment: e.comment || '',
    }));

    await batchInsert('financial_entries', rows);
}

async function migrateSettings(orgId) {
    console.log('\n→ Settings...');
    const loyalty = await getFirestoreData('loyaltyPercent');
    const accent = await getFirestoreData('accentColor');
    const gcalUrl = await getFirestoreData('gcal_apps_script_url');
    const gcalCalId = await getFirestoreData('gcal_calendar_id');
    const gcalToken = await getFirestoreData('gcal_token');
    const gcalMap = await getFirestoreData('gcal_event_map');
    const empOrder = await getFirestoreData('empDashOrder');
    const dirOrder = await getFirestoreData('dirSalaryOrder');

    await supabase.from('org_settings').upsert({
        org_id: orgId,
        loyalty_percent: loyalty || 5,
        accent_color: accent || '#FFD600',
        gcal_apps_script_url: gcalUrl || null,
        gcal_calendar_id: gcalCalId || 'holmgardpark@gmail.com',
        gcal_token: gcalToken || null,
        gcal_event_map: gcalMap || {},
        emp_dash_order: empOrder || null,
        dir_salary_order: dirOrder || null,
    }, { onConflict: 'org_id' });
    console.log('  ✓ org_settings');
}

async function migrateConsumablePrices(orgId) {
    console.log('\n→ Consumable Prices...');
    const prices = await getFirestoreData('consumablePrices');
    if (!prices) return;

    for (const [key, price] of Object.entries(prices)) {
        await supabase.from('consumable_prices').upsert({
            org_id: orgId,
            item_key: key,
            price: price || 0,
        }, { onConflict: 'org_id,item_key' });
    }
    console.log('  ✓ consumable_prices');
}

async function migrateHistoricalSales(orgId) {
    console.log('\n→ Historical Sales (from sales-history.js)...');
    // Этот файл нужно прочитать отдельно или передать данные
    // В данной миграции предполагается что HISTORICAL_SALES_DATA
    // уже преобразован в JSON файл
    try {
        const hsPath = new URL('./historical-sales.json', import.meta.url).pathname;
        const data = JSON.parse(readFileSync(hsPath, 'utf8'));
        const rows = data.map(d => ({
            org_id: orgId,
            sale_date: d.d,
            category: d.c || '',
            title: d.t || '',
            participants: d.p || 0,
            amount: d.a || 0,
            is_yearly: d.y === 1,
            method: d.m || null,
        }));
        await batchInsert('historical_sales', rows);
    } catch (e) {
        console.log('  ⚠ Пропуск historical_sales (файл не найден)');
    }
}

async function migrateMigrationFlags(orgId) {
    console.log('\n→ Migration flags...');
    const flags = [
        'roles_version_v2', 'multirole_v1', 'stock_critical_v1',
        'stock_kids_v1', 'consumables_v1', 'tariffs_version',
        'salary_import_v1', 'salary_import_v2', 'salary_import_v3',
        'salary_import_v4', 'salary_import_v5', 'salary_import_v5b',
        'stock_recalc_v6', 'salary_cleanup_v7',
        'bonus_recalc_v8', 'bonus_recalc_v8b', 'bonus_recalc_v8c', 'bonus_recalc_v8d',
        'price_recalc_v9', 'stock_docs_v10',
    ];

    for (const key of flags) {
        const val = await getFirestoreData(key);
        if (val) {
            await supabase.from('migration_flags').upsert({
                org_id: orgId,
                flag_key: key,
                value: true,
            }, { onConflict: 'org_id,flag_key' });
        }
    }
    console.log('  ✓ migration_flags');
}

// ──────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════');
    console.log('  Holmgard CRM: Firebase → Supabase');
    console.log('═══════════════════════════════════════');

    const orgId = await getOrgId();
    console.log(`\nOrg ID: ${orgId}`);

    // Порядок важен: сначала сущности без FK, потом зависимые
    await migrateEmployees(orgId);
    await migrateClients(orgId);
    await migrateTariffs(orgId);
    await migrateEvents(orgId);     // зависит от employees, tariffs
    await migrateShifts(orgId);     // зависит от employees, events
    await migrateSalaryRules(orgId);
    await migrateSalaryPayments(orgId);
    await migrateHistoricalAccruals(orgId);
    await migrateDocuments(orgId);
    await migrateStockBase(orgId);
    await migrateCertificates(orgId);
    await migrateFinancialEntries(orgId);
    await migrateSettings(orgId);
    await migrateConsumablePrices(orgId);
    await migrateHistoricalSales(orgId);
    await migrateMigrationFlags(orgId);

    console.log('\n═══════════════════════════════════════');
    console.log('  ✅ Миграция завершена!');
    console.log('═══════════════════════════════════════');
}

main().catch(console.error);
