// ===== GOOGLE CALENDAR SYNC MODULE v3 =====
// One-way sync: CRM → Google Calendar (CRM is the single source of truth)
// - Events created/edited/deleted in CRM are pushed to GCal immediately
// - GCal changes are NOT imported back into CRM (CRM owns the data)
// - Each CRM event embeds CRM_ID in GCal description for mapping recovery
// - Event map (CRM_ID → GCal_ID) stored in Firestore + localStorage
// - Auto-sync every 2 minutes: reconcile mappings + push any missed events
// - Zero duplicates: CRM_ID is unique, pushEvent always update-or-create

const GCalSync = (() => {
    const SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/spreadsheets';
    const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
    const AUTO_SYNC_INTERVAL = 2 * 60 * 1000; // 2 minutes

    let gapiInited = false;
    let accessToken = null;
    let _autoSyncTimer = null;
    let _syncInProgress = false;

    // --- Google Apps Script code ---
    const GAS_CODE = `function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  var params = e.parameter;
  var action = params.action;
  var calId = params.calendarId || 'primary';

  try {
    var result;
    switch (action) {
      case 'list':
        result = listEvents(calId, params.timeMin, params.timeMax);
        break;
      case 'create':
        result = createEvent(calId, JSON.parse(params.data));
        break;
      case 'update':
        result = updateEvent(calId, params.eventId, JSON.parse(params.data));
        break;
      case 'delete':
        deleteEvent(calId, params.eventId);
        result = { deleted: true };
        break;
      case 'ping':
        result = { ok: true, email: Session.getActiveUser().getEmail() };
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function listEvents(calId, timeMin, timeMax) {
  var cal = CalendarApp.getCalendarById(calId) || CalendarApp.getDefaultCalendar();
  var start = new Date(timeMin);
  var end = new Date(timeMax);
  var events = cal.getEvents(start, end);
  return events.map(function(ev) {
    return {
      id: ev.getId().replace('@google.com', ''),
      summary: ev.getTitle(),
      description: ev.getDescription() || '',
      start: { dateTime: ev.getStartTime().toISOString() },
      end: { dateTime: ev.getEndTime().toISOString() },
      location: ev.getLocation() || ''
    };
  });
}

function createEvent(calId, data) {
  var cal = CalendarApp.getCalendarById(calId) || CalendarApp.getDefaultCalendar();
  var start = new Date(data.start.dateTime);
  var end = new Date(data.end.dateTime);
  var ev = cal.createEvent(data.summary, start, end, {
    description: data.description || '',
    location: data.location || ''
  });
  return { id: ev.getId().replace('@google.com', ''), summary: ev.getTitle() };
}

function updateEvent(calId, eventId, data) {
  var cal = CalendarApp.getCalendarById(calId) || CalendarApp.getDefaultCalendar();
  var fullId = eventId.indexOf('@') === -1 ? eventId + '@google.com' : eventId;
  var ev = cal.getEventById(fullId);
  if (!ev) return { error: 'Event not found: ' + fullId };
  ev.setTitle(data.summary);
  if (data.description !== undefined) ev.setDescription(data.description);
  ev.setTime(new Date(data.start.dateTime), new Date(data.end.dateTime));
  return { id: eventId, summary: ev.getTitle() };
}

function deleteEvent(calId, eventId) {
  var cal = CalendarApp.getCalendarById(calId) || CalendarApp.getDefaultCalendar();
  var fullId = eventId.indexOf('@') === -1 ? eventId + '@google.com' : eventId;
  var ev = cal.getEventById(fullId);
  if (ev) ev.deleteEvent();
}`;

    // ===================== STORAGE HELPERS =====================

    function getAppsScriptUrl() {
        const shared = typeof DB !== 'undefined' ? DB.get('gcal_apps_script_url', '') : '';
        return shared || localStorage.getItem('hp_gcal_apps_script_url') || '';
    }
    function setAppsScriptUrl(url) {
        localStorage.setItem('hp_gcal_apps_script_url', url);
        if (typeof DB !== 'undefined') DB.set('gcal_apps_script_url', url);
    }
    function getClientId() { return localStorage.getItem('hp_gcal_client_id') || ''; }
    function getCalendarId() {
        const shared = typeof DB !== 'undefined' ? DB.get('gcal_calendar_id', '') : '';
        return shared || localStorage.getItem('hp_gcal_calendar_id') || 'holmgardpark@gmail.com';
    }
    function setCalendarId(id) {
        localStorage.setItem('hp_gcal_calendar_id', id);
        if (typeof DB !== 'undefined') DB.set('gcal_calendar_id', id);
    }

    // --- Event Map: CRM_ID → GCal_ID ---
    function getEventMap() {
        try {
            const dbMap = typeof DB !== 'undefined' ? DB.get('gcal_event_map', null) : null;
            if (dbMap && typeof dbMap === 'object' && Object.keys(dbMap).length > 0) return dbMap;
            return JSON.parse(localStorage.getItem('hp_gcal_event_map') || '{}');
        } catch { return {}; }
    }
    function setEventMap(map) {
        localStorage.setItem('hp_gcal_event_map', JSON.stringify(map));
        if (typeof DB !== 'undefined') {
            try { DB.set('gcal_event_map', map); } catch(e) {}
        }
    }

    function useAppsScript() { return !!getAppsScriptUrl(); }

    // ===================== API LAYER =====================

    async function gasCall(params) {
        const url = getAppsScriptUrl();
        if (!url) throw new Error('Apps Script URL not set');
        const queryStr = Object.entries(params)
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
            .join('&');
        const resp = await fetch(`${url}?${queryStr}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
    }

    // ===================== OAUTH (FALLBACK) =====================

    function restoreToken() {
        const shared = typeof DB !== 'undefined' ? DB.get('gcal_token', null) : null;
        if (shared && shared.token && Date.now() < shared.expiry) {
            accessToken = shared.token;
            return true;
        }
        const t = localStorage.getItem('hp_gcal_token');
        const exp = parseInt(localStorage.getItem('hp_gcal_token_expiry') || '0');
        if (t && Date.now() < exp) { accessToken = t; return true; }
        accessToken = null;
        return false;
    }

    function storeToken(token, expiresIn) {
        accessToken = token;
        const expiry = Date.now() + expiresIn * 1000;
        localStorage.setItem('hp_gcal_token', token);
        localStorage.setItem('hp_gcal_token_expiry', String(expiry));
        if (typeof DB !== 'undefined') DB.set('gcal_token', { token, expiry });
    }

    function clearToken() {
        accessToken = null;
        localStorage.removeItem('hp_gcal_token');
        localStorage.removeItem('hp_gcal_token_expiry');
        if (typeof DB !== 'undefined') DB.set('gcal_token', null);
    }

    function silentRefresh() {
        return new Promise((resolve) => {
            const clientId = getClientId();
            if (!clientId) { resolve(false); return; }
            const redirectUri = window.location.origin + window.location.pathname;
            const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
                'client_id=' + encodeURIComponent(clientId) +
                '&redirect_uri=' + encodeURIComponent(redirectUri) +
                '&response_type=token' +
                '&scope=' + encodeURIComponent(SCOPES) +
                '&include_granted_scopes=true' +
                '&prompt=none';
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) { resolved = true; cleanup(); resolve(false); }
            }, 8000);
            function cleanup() {
                clearTimeout(timeout);
                try { document.body.removeChild(iframe); } catch {}
            }
            iframe.addEventListener('load', () => {
                try {
                    const hash = iframe.contentWindow.location.hash;
                    if (hash) {
                        const params = new URLSearchParams(hash.substring(1));
                        const token = params.get('access_token');
                        const expiresIn = params.get('expires_in');
                        if (token && expiresIn) {
                            storeToken(token, parseInt(expiresIn));
                            resolved = true; cleanup(); resolve(true);
                            return;
                        }
                    }
                } catch (e) {}
                if (!resolved) { resolved = true; cleanup(); resolve(false); }
            });
            iframe.src = authUrl;
        });
    }

    function handleRedirectResponse() {
        const hash = window.location.hash.substring(1);
        if (!hash) return false;
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');
        const expiresIn = params.get('expires_in');
        if (token && expiresIn) {
            storeToken(token, parseInt(expiresIn));
            history.replaceState(null, '', window.location.pathname + window.location.search);
            return true;
        }
        const error = params.get('error');
        if (error) {
            console.error('OAuth error:', error);
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        return false;
    }

    function loadGapi() {
        return new Promise((resolve, reject) => {
            if (gapiInited) { resolve(); return; }
            function tryLoad() {
                if (typeof gapi === 'undefined' || typeof gapi.load !== 'function') return false;
                gapi.load('client', async () => {
                    try {
                        await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] });
                        gapiInited = true;
                        resolve();
                    } catch (e) { reject(e); }
                });
                return true;
            }
            if (tryLoad()) return;
            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (tryLoad()) { clearInterval(interval); return; }
                if (attempts >= 25) { clearInterval(interval); reject('gapi not loaded after timeout'); }
            }, 200);
        });
    }

    async function oauthApiCall(fn) {
        try {
            return await fn();
        } catch (err) {
            if (err.status === 401) {
                const refreshed = await silentRefresh();
                if (refreshed && gapiInited) {
                    gapi.client.setToken({ access_token: accessToken });
                    updateStatus('connected');
                    return await fn();
                }
                clearToken();
                updateStatus('disconnected');
                showToast('Токен истёк. Нажмите Подключить заново.');
                throw err;
            }
            throw err;
        }
    }

    // ===================== INIT & AUTH =====================

    async function init() {
        if (useAppsScript()) {
            try {
                const r = await gasCall({ action: 'ping', calendarId: getCalendarId() });
                if (r && (r.ok || r.email)) {
                    updateStatus('connected');
                    startAutoSync();
                    return;
                }
            } catch (err) {
                console.error('GCalSync Apps Script ping error:', err);
                updateStatus('error');
                return;
            }
        }

        if (!getClientId()) { updateStatus('none'); return; }
        const gotToken = handleRedirectResponse();
        try {
            await loadGapi();
            if (gotToken || restoreToken()) {
                gapi.client.setToken({ access_token: accessToken });
                updateStatus('connected');
                startAutoSync();
                if (gotToken) showToast('Google Calendar подключён');
            } else {
                const refreshed = await silentRefresh();
                if (refreshed) {
                    gapi.client.setToken({ access_token: accessToken });
                    updateStatus('connected');
                    startAutoSync();
                } else {
                    updateStatus('disconnected');
                }
            }
        } catch (err) {
            console.error('GCalSync init error:', err);
            updateStatus('error');
        }
    }

    function authorize() {
        const clientId = getClientId();
        if (!clientId) { showToast('Введите Client ID в Настройках'); return; }
        sessionStorage.setItem('hp_gcal_pre_auth_page', 'settings');
        if (typeof currentUser !== 'undefined' && currentUser) {
            sessionStorage.setItem('hp_gcal_returning_user_id', String(currentUser.id));
        }
        const redirectUri = window.location.origin + window.location.pathname;
        const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
            'client_id=' + encodeURIComponent(clientId) +
            '&redirect_uri=' + encodeURIComponent(redirectUri) +
            '&response_type=token' +
            '&scope=' + encodeURIComponent(SCOPES) +
            '&include_granted_scopes=true' +
            '&prompt=select_account';
        window.location.href = authUrl;
    }

    function disconnect() {
        stopAutoSync();
        if (useAppsScript()) {
            setAppsScriptUrl('');
            updateStatus('none');
            showToast('Google Calendar отключён');
            return;
        }
        if (accessToken) {
            fetch('https://oauth2.googleapis.com/revoke?token=' + accessToken, { method: 'POST' }).catch(() => {});
        }
        clearToken();
        if (gapiInited) gapi.client.setToken(null);
        updateStatus('disconnected');
        showToast('Google Calendar отключён');
    }

    function isConnected() {
        if (useAppsScript()) return true;
        return !!accessToken;
    }

    // ===================== STATUS UI =====================

    function updateStatus(state) {
        const dot = document.getElementById('gcal-status-dot');
        const label = document.getElementById('gcal-status-label');
        const btnConnect = document.getElementById('btn-connect-gcal');
        if (!dot || !label) return;
        dot.className = 'gcal-status-dot gcal-status-' + state;
        const labels = {
            connected: useAppsScript() ? 'Подключено (Apps Script)' : 'Подключено (OAuth)',
            disconnected: 'Отключено',
            error: 'Ошибка подключения',
            none: 'Не настроено',
            syncing: 'Синхронизация...'
        };
        label.textContent = labels[state] || state;
        if (btnConnect) {
            if (state === 'connected') {
                btnConnect.textContent = 'Отключить';
                btnConnect.className = 'btn-danger btn-sm';
            } else {
                btnConnect.textContent = 'Подключить';
                btnConnect.className = 'btn-secondary btn-sm';
            }
        }
    }

    // ===================== EVENT CONVERSION =====================

    // CRM → GCal format (Moscow time UTC+3, no DST)
    function crmToGcal(ev) {
        const startDT = ev.date + 'T' + (ev.time || '10:00') + ':00+03:00';
        const dur = ev.duration || 60;
        const endMs = new Date(startDT).getTime() + dur * 60 * 1000;
        // Compute end time as Moscow wall-clock
        const endMoscow = new Date(endMs + 3 * 3600 * 1000);
        const pad = (n) => String(n).padStart(2, '0');
        const endDT = endMoscow.getUTCFullYear() + '-' + pad(endMoscow.getUTCMonth() + 1) + '-' + pad(endMoscow.getUTCDate()) +
            'T' + pad(endMoscow.getUTCHours()) + ':' + pad(endMoscow.getUTCMinutes()) + ':00+03:00';

        // Build description with all CRM fields
        const descParts = [];
        if (ev.clientName) descParts.push('👤 Клиент: ' + ev.clientName);
        if (ev.clientPhone) descParts.push('📞 ' + ev.clientPhone);
        const typeNames = { paintball: 'Пейнтбол', laser: 'Лазертаг', kidball: 'Кидбол',
            quest: 'Квест', corporate: 'Корпоратив', birthday: 'День рождения',
            atv: 'Квадроциклы', sup: 'САП-борды', race: 'Гонка', tir: 'Тир', other: 'Другое' };
        if (ev.type && ev.type !== 'other') descParts.push('🎯 ' + (typeNames[ev.type] || ev.type));
        const ppl = ev.participants || ev.players;
        if (ppl > 0) descParts.push('👥 ' + ppl + ' чел.');
        if (ev.price > 0) descParts.push('💰 ' + ev.price + ' ₽');
        if (ev.prepayment > 0) {
            const m = ev.prepaymentMethod === 'qr' ? ' QR' : ev.prepaymentMethod === 'cash' ? ' нал.' : '';
            descParts.push('💳 Предоплата: ' + ev.prepayment + ' ₽' + m);
        }
        const statusNames = { pending: 'Ожидает', confirmed: 'Подтверждено', completed: 'Выполнено', cancelled: 'Отменено' };
        descParts.push('📌 ' + (statusNames[ev.status] || 'Ожидает'));
        if (ev.occasion) descParts.push('🎉 ' + ev.occasion);
        if (ev.notes) descParts.push('📝 ' + ev.notes);
        descParts.push('');
        descParts.push('CRM_ID: ' + ev.id); // machine-readable marker — do not remove

        // Title: include status emoji for quick visual scanning
        const statusEmoji = { pending: '🕐', confirmed: '✅', completed: '🏁', cancelled: '❌' };
        const emoji = statusEmoji[ev.status] || '🕐';
        const summary = emoji + ' ' + (ev.title || (ev.clientName ? 'Мероприятие — ' + ev.clientName : 'Мероприятие'));

        return {
            summary,
            description: descParts.join('\n'),
            start: { dateTime: startDT, timeZone: 'Europe/Moscow' },
            end: { dateTime: endDT, timeZone: 'Europe/Moscow' }
        };
    }

    // ===================== PUSH: CRM → GCAL =====================

    async function pushEvent(crmEvent) {
        if (!isConnected()) return null;
        const calId = getCalendarId();
        const gcalData = crmToGcal(crmEvent);
        const map = getEventMap();
        let existingGcalId = map[String(crmEvent.id)];

        // Recover mapping from gcalEventId field (if event was previously imported)
        if (!existingGcalId && crmEvent.gcalEventId) {
            existingGcalId = crmEvent.gcalEventId;
            map[String(crmEvent.id)] = existingGcalId;
            setEventMap(map);
        }

        // Recover lost mapping: search GCal for this CRM_ID
        if (!existingGcalId) {
            existingGcalId = await _findGcalByCrmId(calId, crmEvent.id);
            if (existingGcalId) {
                map[String(crmEvent.id)] = existingGcalId;
                setEventMap(map);
                console.log('[GCal] Restored mapping:', crmEvent.id, '->', existingGcalId);
            }
        }

        try {
            let result;
            if (useAppsScript()) {
                if (existingGcalId) {
                    result = await gasCall({
                        action: 'update', calendarId: calId,
                        eventId: existingGcalId, data: JSON.stringify(gcalData)
                    });
                    // If event was deleted in GCal, recreate it
                    if (result && result.error && result.error.includes('not found')) {
                        delete map[String(crmEvent.id)];
                        result = await gasCall({ action: 'create', calendarId: calId, data: JSON.stringify(gcalData) });
                    }
                } else {
                    result = await gasCall({ action: 'create', calendarId: calId, data: JSON.stringify(gcalData) });
                }
            } else {
                let resp;
                if (existingGcalId) {
                    try {
                        resp = await oauthApiCall(() =>
                            gapi.client.calendar.events.update({ calendarId: calId, eventId: existingGcalId, resource: gcalData })
                        );
                    } catch (e) {
                        if (e.status === 404 || e.status === 410) {
                            delete map[String(crmEvent.id)];
                            resp = await oauthApiCall(() =>
                                gapi.client.calendar.events.insert({ calendarId: calId, resource: gcalData })
                            );
                        } else throw e;
                    }
                } else {
                    resp = await oauthApiCall(() =>
                        gapi.client.calendar.events.insert({ calendarId: calId, resource: gcalData })
                    );
                }
                result = resp.result;
            }
            if (result && result.id) {
                map[String(crmEvent.id)] = result.id;
                setEventMap(map);
                _gcalCache = null; // invalidate cache
            }
            return result;
        } catch (err) {
            console.error('[GCal] Push error for event', crmEvent.id, ':', err);
            return null;
        }
    }

    // ===================== DELETE =====================

    async function deleteEvent(crmEventId) {
        if (!isConnected()) return;
        const map = getEventMap();
        const gcalId = map[String(crmEventId)];
        if (!gcalId) {
            // Try to find by CRM_ID in case map was lost
            const found = await _findGcalByCrmId(getCalendarId(), crmEventId);
            if (!found) return;
            try {
                if (useAppsScript()) {
                    await gasCall({ action: 'delete', calendarId: getCalendarId(), eventId: found });
                } else {
                    await oauthApiCall(() =>
                        gapi.client.calendar.events.delete({ calendarId: getCalendarId(), eventId: found })
                    );
                }
            } catch (err) {
                if (err.status !== 404 && err.status !== 410) console.error('[GCal] Delete error:', err);
            }
            _gcalCache = null;
            return;
        }
        try {
            if (useAppsScript()) {
                await gasCall({ action: 'delete', calendarId: getCalendarId(), eventId: gcalId });
            } else {
                await oauthApiCall(() =>
                    gapi.client.calendar.events.delete({ calendarId: getCalendarId(), eventId: gcalId })
                );
            }
        } catch (err) {
            if (err.status !== 404 && err.status !== 410) console.error('[GCal] Delete error:', err);
        }
        delete map[String(crmEventId)];
        setEventMap(map);
        _gcalCache = null;
    }

    // ===================== MAPPING RECONCILIATION =====================
    // Only reads GCal to restore lost CRM_ID → GCal_ID mappings.
    // Does NOT import external events, does NOT delete CRM events.

    let _gcalCache = null;
    let _gcalCacheTime = 0;

    async function _fetchGcalEvents(calId, timeMin, timeMax) {
        if (useAppsScript()) {
            const result = await gasCall({ action: 'list', calendarId: calId, timeMin, timeMax });
            if (Array.isArray(result)) return result;
            if (result && result.error) { console.error('[GCal] List error:', result.error); return []; }
            return [];
        } else {
            const resp = await oauthApiCall(() =>
                gapi.client.calendar.events.list({
                    calendarId: calId, timeMin, timeMax,
                    singleEvents: true, orderBy: 'startTime', maxResults: 500
                })
            );
            return resp.result.items || [];
        }
    }

    async function _findGcalByCrmId(calId, crmId) {
        try {
            const now = Date.now();
            if (!_gcalCache || now - _gcalCacheTime > 60000) {
                const fromD = new Date(); fromD.setFullYear(fromD.getFullYear() - 1);
                const toD = new Date(); toD.setFullYear(toD.getFullYear() + 1);
                _gcalCache = await _fetchGcalEvents(calId, fromD.toISOString(), toD.toISOString());
                _gcalCacheTime = now;
            }
            const needle = 'CRM_ID: ' + crmId;
            const found = _gcalCache.find(e => e.description && e.description.includes(needle));
            return found ? found.id : null;
        } catch (e) {
            console.warn('[GCal] findByCrmId error:', e);
            return null;
        }
    }

    // Read GCal events and restore any lost CRM_ID → GCal_ID mappings.
    // CRM is authoritative — we never delete or modify CRM events here.
    async function reconcileMappings(timeMin, timeMax) {
        if (!isConnected()) return;
        try {
            const gcalEvents = await _fetchGcalEvents(getCalendarId(), timeMin, timeMax);
            const map = getEventMap();
            let restored = 0;

            for (const gEv of gcalEvents) {
                const desc = gEv.description || '';
                const m = desc.match(/CRM_ID:\s*(\d+)/);
                if (!m) continue; // Not a CRM event — ignore completely
                const crmId = m[1];
                if (map[crmId] !== gEv.id) {
                    map[crmId] = gEv.id;
                    restored++;
                }
            }

            if (restored > 0) {
                setEventMap(map);
                console.log('[GCal] Reconciled', restored, 'mappings');
            }
        } catch (err) {
            console.error('[GCal] reconcileMappings error:', err);
        }
    }

    // ===================== AUTO-SYNC =====================

    function startAutoSync() {
        stopAutoSync();
        // Initial sync after 3 seconds (push missed events + reconcile)
        setTimeout(() => autoSync(), 3000);
        // Then every 2 minutes
        _autoSyncTimer = setInterval(() => autoSync(), AUTO_SYNC_INTERVAL);
        console.log('[GCal] Auto-sync started (every 2 min)');
    }

    function stopAutoSync() {
        if (_autoSyncTimer) {
            clearInterval(_autoSyncTimer);
            _autoSyncTimer = null;
        }
    }

    async function autoSync() {
        if (!isConnected() || _syncInProgress) return;
        _syncInProgress = true;
        try {
            // Step 1: Reconcile mappings (recover any lost CRM_ID → GCal_ID links)
            const now = new Date();
            const from = new Date(now); from.setDate(from.getDate() - 14);
            const to = new Date(now); to.setDate(to.getDate() + 180);
            await reconcileMappings(from.toISOString(), to.toISOString());

            // Step 2: Push any CRM events that are missing from GCal map
            const events = DB.get('events', []);
            const map = getEventMap();
            const unmapped = events.filter(e => e.date && !e.deleted && !map[String(e.id)]);

            if (unmapped.length > 0) {
                console.log('[GCal] Auto-sync: pushing', unmapped.length, 'unmapped events');
                let pushed = 0;
                for (const ev of unmapped) {
                    try { const r = await pushEvent(ev); if (r) pushed++; } catch (e) {}
                }
                if (pushed > 0) {
                    showToast(`📅 Google Calendar: ${pushed} событий синхронизировано`);
                    if (typeof renderCalendar === 'function') {
                        const schedPage = document.getElementById('page-schedule');
                        if (schedPage && schedPage.classList.contains('active')) renderCalendar();
                    }
                }
            }
        } catch (err) {
            console.error('[GCal] Auto-sync error:', err);
        } finally {
            _syncInProgress = false;
        }
    }

    // ===================== FULL SYNC (manual) =====================
    // Pushes ALL CRM events to GCal. Use after bulk changes or first setup.

    async function fullSync() {
        if (!isConnected()) { showToast('Google Calendar не подключён'); return; }
        if (_syncInProgress) { showToast('Синхронизация уже идёт...'); return; }
        _syncInProgress = true;
        updateStatus('syncing');

        try {
            const events = DB.get('events', []);
            const toPush = events.filter(e => e.date && !e.deleted);
            let pushed = 0, failed = 0;

            console.log('[GCal] Full sync: pushing', toPush.length, 'events...');
            for (const ev of toPush) {
                try {
                    const r = await pushEvent(ev);
                    if (r) pushed++;
                    else failed++;
                } catch (e) {
                    failed++;
                    console.warn('[GCal] fullSync push failed:', ev.id, e);
                }
            }

            // Clean stale map entries (CRM events that no longer exist)
            const freshMap = getEventMap();
            const eventIds = new Set(events.map(e => String(e.id)));
            let cleaned = 0;
            for (const crmId of Object.keys(freshMap)) {
                if (!eventIds.has(crmId)) { delete freshMap[crmId]; cleaned++; }
            }
            if (cleaned > 0) setEventMap(freshMap);

            updateStatus('connected');
            let msg = `📅 Синхронизировано: ${pushed} событий`;
            if (failed > 0) msg += ` (${failed} ошибок)`;
            showToast(msg);
            return { pushed, failed };
        } catch (err) {
            console.error('[GCal] Full sync error:', err);
            updateStatus('error');
            showToast('Ошибка синхронизации');
        } finally {
            _syncInProgress = false;
        }
    }

    // For backward compatibility — kept but simplified to just push all
    async function pullEvents(timeMin, timeMax) {
        await reconcileMappings(timeMin, timeMax);
        return { added: 0, updated: 0, total: 0 };
    }

    async function repushAllEvents() {
        if (!isConnected() || _syncInProgress) return 0;
        const events = DB.get('events', []);
        const toPush = events.filter(e => e.date && !e.deleted);
        let fixed = 0;
        for (const ev of toPush) {
            try { await pushEvent(ev); fixed++; } catch (e) {}
        }
        return fixed;
    }

    function deduplicateEvents() {
        const events = DB.get('events', []);
        const seen = new Map();
        const unique = [];
        for (const ev of events) {
            const key = `${ev.title}|${ev.date}|${ev.time}`;
            if (!seen.has(key)) { seen.set(key, ev); unique.push(ev); }
        }
        if (unique.length < events.length) {
            DB.set('events', unique);
            return events.length - unique.length;
        }
        return 0;
    }

    function getGasCode() { return GAS_CODE; }
    function reinitGis() {}

    // ===================== PUBLIC API =====================

    return {
        init, authorize, disconnect, isConnected,
        pushEvent, deleteEvent, pullEvents, reconcileMappings,
        fullSync, autoSync, updateStatus, reinitGis,
        repushAllEvents, deduplicateEvents, getGasCode,
        setAppsScriptUrl, getAppsScriptUrl,
        setCalendarId, getCalendarId,
        startAutoSync, stopAutoSync,
    };
})();
