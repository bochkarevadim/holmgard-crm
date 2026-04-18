/**
 * Миграция Firebase Auth → Supabase Auth
 *
 * Запуск: node supabase/migrate-auth.js
 *
 * Что делает:
 *   1. Загружает всех Firebase Auth пользователей
 *   2. Для каждого создаёт Supabase Auth пользователя (admin API — без email confirmation)
 *   3. Находит соответствующего сотрудника в Supabase и обновляет поле auth_uid
 *
 * Новые пароли НЕ устанавливаются (Firebase не отдаёт хэши bcrypt в открытом виде).
 * После миграции каждый сотрудник должен задать новый пароль через "Забыли пароль?"
 * или директор может выслать reset-email через систему.
 */
import { createClient } from '@supabase/supabase-js';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://zubxspuiogpyvnaevpxu.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YnhzcHVpb2dweXZuYWV2cHh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjExMTI1OCwiZXhwIjoyMDkxNjg3MjU4fQ.2NTxhbkqW4j2VCuEQNzB_xVVuLRT1UpFKdyuNEgikw0';
const FIREBASE_SA_PATH = new URL('./holmgard-crm-c5680-firebase-adminsdk-fbsvc-e08acf5f35.json', import.meta.url).pathname;

// Временный пароль для новых аккаунтов — сразу после создания отправим reset email
const TEMP_PASSWORD = 'Holmgard_temp_2026!';

// ─── INIT ─────────────────────────────────────────────────────────────────────

const serviceAccount = JSON.parse(readFileSync(FIREBASE_SA_PATH, 'utf8'));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const fbAuth = admin.auth();

// Supabase с service_role (нужен для auth.admin.*)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function getOrgId() {
    const { data, error } = await supabase
        .from('organizations').select('id').eq('slug', 'holmgard').single();
    if (error) throw error;
    return data.id;
}

/** Получить всех Firebase Auth пользователей (может быть несколько страниц) */
async function listAllFirebaseUsers() {
    const users = [];
    let pageToken;
    do {
        const result = await fbAuth.listUsers(1000, pageToken);
        users.push(...result.users);
        pageToken = result.pageToken;
    } while (pageToken);
    return users;
}

/** Получить всех уже существующих Supabase Auth пользователей */
async function listSupabaseUsers() {
    const all = [];
    let page = 1;
    while (true) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        all.push(...(data.users || []));
        if (!data.users || data.users.length < 1000) break;
        page++;
    }
    return all;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════');
    console.log('  Firebase Auth → Supabase Auth Migration');
    console.log('═══════════════════════════════════════════\n');

    const orgId = await getOrgId();
    console.log('Org ID:', orgId);

    // 1. Загрузить Firebase пользователей
    console.log('\n→ Загружаю Firebase Auth пользователей...');
    const fbUsers = await listAllFirebaseUsers();
    console.log(`  Найдено: ${fbUsers.length}`);

    // 2. Загрузить уже существующих Supabase пользователей (для dedup)
    console.log('\n→ Загружаю существующих Supabase Auth пользователей...');
    const sbUsers = await listSupabaseUsers();
    const sbEmailMap = new Map(sbUsers.map(u => [u.email?.toLowerCase(), u]));
    console.log(`  Уже есть: ${sbUsers.length}`);

    // 3. Загрузить сотрудников из Supabase
    const { data: employees, error: empErr } = await supabase
        .from('employees').select('id, email, auth_uid').eq('org_id', orgId);
    if (empErr) throw empErr;
    const empByEmail = new Map(employees.map(e => [e.email?.toLowerCase(), e]));
    console.log(`  Сотрудников в Supabase: ${employees.length}`);

    // 4. Создать/привязать каждого пользователя
    console.log('\n→ Обрабатываю пользователей...\n');

    const stats = { created: 0, existed: 0, linked: 0, noEmployee: 0, errors: 0 };

    for (const fbUser of fbUsers) {
        const email = (fbUser.email || '').toLowerCase();
        if (!email) {
            console.log(`  ⚠ Пропущен (нет email): ${fbUser.uid}`);
            continue;
        }

        let sbUser = sbEmailMap.get(email);

        // Создать в Supabase если ещё нет
        if (!sbUser) {
            const { data, error } = await supabase.auth.admin.createUser({
                email: fbUser.email,
                password: TEMP_PASSWORD,
                email_confirm: true,     // сразу считать email подтверждённым
                user_metadata: {
                    display_name: fbUser.displayName || '',
                    migrated_from_firebase: fbUser.uid
                }
            });
            if (error) {
                console.log(`  ✗ Ошибка создания ${email}: ${error.message}`);
                stats.errors++;
                continue;
            }
            sbUser = data.user;
            stats.created++;
            console.log(`  ✓ Создан: ${email}`);
        } else {
            stats.existed++;
            console.log(`  · Уже есть: ${email}`);
        }

        // Привязать auth_uid к сотруднику
        const emp = empByEmail.get(email);
        if (!emp) {
            console.log(`    ⚠ Сотрудник не найден в таблице employees: ${email}`);
            stats.noEmployee++;
            continue;
        }

        if (emp.auth_uid !== sbUser.id) {
            const { error: updErr } = await supabase
                .from('employees')
                .update({ auth_uid: sbUser.id })
                .eq('id', emp.id);
            if (updErr) {
                console.log(`    ✗ Ошибка обновления auth_uid для ${email}: ${updErr.message}`);
                stats.errors++;
            } else {
                stats.linked++;
                console.log(`    → auth_uid обновлён`);
            }
        }
    }

    // 5. Итого
    console.log('\n═══════════════════════════════════════════');
    console.log('  Результат:');
    console.log(`  • Создано новых:     ${stats.created}`);
    console.log(`  • Уже существовали:  ${stats.existed}`);
    console.log(`  • Привязано (auth_uid): ${stats.linked}`);
    console.log(`  • Нет сотрудника:    ${stats.noEmployee}`);
    console.log(`  • Ошибок:            ${stats.errors}`);
    console.log('═══════════════════════════════════════════\n');

    // 6. Отправить reset-email всем новым пользователям
    if (stats.created > 0) {
        console.log('→ Отправляю письма для сброса пароля новым пользователям...');
        for (const fbUser of fbUsers) {
            const email = (fbUser.email || '').toLowerCase();
            if (!email || sbEmailMap.has(email)) continue; // уже существовавшие — не трогаем
            const { error } = await supabase.auth.admin.generateLink({
                type: 'recovery',
                email: fbUser.email,
                options: {
                    redirectTo: 'https://holmgard-park.github.io/crm/'
                }
            });
            if (error) {
                console.log(`  ✗ reset email для ${email}: ${error.message}`);
            } else {
                console.log(`  ✉ reset email → ${email}`);
            }
        }
    }

    console.log('\n✅ Миграция Auth завершена!');
    console.log('\nВАЖНО: Временный пароль для всех новых аккаунтов: ' + TEMP_PASSWORD);
    console.log('Сразу после проверки отправьте сотрудникам письма для сброса пароля.');
}

main().catch(err => {
    console.error('\n💥 Критическая ошибка:', err.message || err);
    process.exit(1);
});
