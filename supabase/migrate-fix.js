/**
 * Донастройка миграции — вставка пропущенных документов и исторических продаж
 */
import { createClient } from '@supabase/supabase-js';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://zubxspuiogpyvnaevpxu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YnhzcHVpb2dweXZuYWV2cHh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjExMTI1OCwiZXhwIjoyMDkxNjg3MjU4fQ.2NTxhbkqW4j2VCuEQNzB_xVVuLRT1UpFKdyuNEgikw0';
const FIREBASE_SERVICE_ACCOUNT = new URL('./holmgard-crm-c5680-firebase-adminsdk-fbsvc-e08acf5f35.json', import.meta.url).pathname;

const serviceAccount = JSON.parse(readFileSync(FIREBASE_SERVICE_ACCOUNT, 'utf8'));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const firestore = admin.firestore();
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ORG_PATH = 'orgs/holmgard/data';

async function getFirestoreData(key) {
    const doc = await firestore.doc(`${ORG_PATH}/${key}`).get();
    return doc.exists ? doc.data()?.value : null;
}

function parseDate(d) {
    if (!d) return null;
    return String(d).slice(0, 10) || null;
}

async function batchInsert(table, rows, batchSize = 500) {
    if (!rows.length) return;
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase.from(table).insert(batch);
        if (error) {
            console.error(`  ERROR ${table} batch ${i}:`, error.message);
            for (const row of batch) {
                const { error: e2 } = await supabase.from(table).insert(row);
                if (e2) console.error(`  SKIP:`, e2.message, row.id || '');
            }
        }
    }
    console.log(`  ✓ ${table}: ${rows.length} rows`);
}

async function main() {
    // Get org_id
    const { data: org } = await supabase.from('organizations').select('id').eq('slug', 'holmgard').single();
    const orgId = org.id;
    console.log('Org:', orgId);

    // 1. Fix documents with fractional IDs
    console.log('\n→ Fixing documents...');
    // First delete existing to avoid conflicts
    await supabase.from('documents').delete().eq('org_id', orgId);

    const docs = await getFirestoreData('documents');
    if (docs?.length) {
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

        // Deduplicate by rounded ID
        const seen = new Set();
        const unique = rows.filter(r => {
            if (seen.has(r.id)) return false;
            seen.add(r.id);
            return true;
        });

        await batchInsert('documents', unique);
    }

    // 2. Historical sales
    console.log('\n→ Historical Sales...');
    const hsPath = new URL('./historical-sales.json', import.meta.url).pathname;
    try {
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
        console.error('  Error:', e.message);
    }

    console.log('\n✅ Done!');
}

main().catch(console.error);
