/**
 * restore-event-staff.mjs
 *
 * Восстанавливает event_instructors / event_admins из данных shift_event_bonuses.
 * Запустить: node restore-event-staff.mjs
 *
 * Работает если сотрудники были удалены из событий.
 * Не трогает события у которых данные уже корректны.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zubxspuiogpyvnaevpxu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YnhzcHVpb2dweXZuYWV2cHh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjExMTI1OCwiZXhwIjoyMDkxNjg3MjU4fQ.2NTxhbkqW4j2VCuEQNzB_xVVuLRT1UpFKdyuNEgikw0';
const ORG_ID = '6365118f-eccd-4aaf-912e-8ad906787e59';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function restore() {
  console.log('Загружаем shift_event_bonuses...');

  // Получаем все бонусы со сменами (employee_id и org_id из shifts)
  const { data: bonuses, error: bonErr } = await sb
    .from('shift_event_bonuses')
    .select('event_id, bonus_type, shifts!inner(employee_id, org_id)')
    .eq('shifts.org_id', ORG_ID);

  if (bonErr) {
    console.error('Ошибка загрузки бонусов:', bonErr.message);
    process.exit(1);
  }

  console.log(`Найдено бонусных записей: ${bonuses.length}`);

  // Строим наборы event→[employees] для инструкторов и администраторов
  const instMap = new Map(); // event_id → Set<employee_id>
  const admMap  = new Map();

  for (const b of bonuses) {
    const empId = b.shifts?.employee_id;
    if (!empId) continue;

    if (b.bonus_type === 'instructor' || b.bonus_type === 'senior_instructor') {
      if (!instMap.has(b.event_id)) instMap.set(b.event_id, new Set());
      instMap.get(b.event_id).add(empId);
    } else if (b.bonus_type === 'admin') {
      if (!admMap.has(b.event_id)) admMap.set(b.event_id, new Set());
      admMap.get(b.event_id).add(empId);
    }
  }

  // Получаем текущие данные чтобы не вставлять дубликаты
  const { data: curInst } = await sb.from('event_instructors').select('event_id, employee_id');
  const { data: curAdm  } = await sb.from('event_admins').select('event_id, employee_id');

  const instExists = new Set((curInst || []).map(r => `${r.event_id}:${r.employee_id}`));
  const admExists  = new Set((curAdm  || []).map(r => `${r.event_id}:${r.employee_id}`));

  // Строим строки для вставки (только те, которых нет)
  const instRows = [];
  const admRows  = [];

  for (const [eventId, empSet] of instMap) {
    for (const empId of empSet) {
      if (!instExists.has(`${eventId}:${empId}`)) {
        instRows.push({ event_id: eventId, employee_id: empId });
      }
    }
  }
  for (const [eventId, empSet] of admMap) {
    for (const empId of empSet) {
      if (!admExists.has(`${eventId}:${empId}`)) {
        admRows.push({ event_id: eventId, employee_id: empId });
      }
    }
  }

  console.log(`Нужно восстановить инструкторов: ${instRows.length}`);
  console.log(`Нужно восстановить администраторов: ${admRows.length}`);

  if (instRows.length === 0 && admRows.length === 0) {
    console.log('✅ Данные уже корректны, восстанавливать нечего.');
    return;
  }

  // Вставляем
  if (instRows.length > 0) {
    const { error: iErr } = await sb.from('event_instructors').insert(instRows);
    if (iErr) console.error('❌ Ошибка вставки инструкторов:', iErr.message);
    else console.log(`✅ Инструкторов восстановлено: ${instRows.length}`);
  }

  if (admRows.length > 0) {
    const { error: aErr } = await sb.from('event_admins').insert(admRows);
    if (aErr) console.error('❌ Ошибка вставки администраторов:', aErr.message);
    else console.log(`✅ Администраторов восстановлено: ${admRows.length}`);
  }

  // Итоговая проверка
  const { data: finalInst } = await sb.from('event_instructors').select('event_id, employee_id');
  const { data: finalAdm  } = await sb.from('event_admins').select('event_id, employee_id');
  console.log(`\nИТОГ: ${finalInst?.length || 0} инструкторов, ${finalAdm?.length || 0} администраторов`);
}

restore().catch(e => { console.error('Fatal:', e); process.exit(1); });
