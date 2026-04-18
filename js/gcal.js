// ===== GOOGLE CALENDAR SYNC MODULE v2 =====
// Reliable bi-directional sync: CRM <-> Google Calendar
// - Each event has a unique CRM_ID embedded in GCal description
// - Source tracking: source=crm or source=gcal
// - Event map stored in Firestore (survives across devices)
// - Auto-sync every 3 minutes (pull only, push on save)
// - Zero duplicates: CRM_ID match + gcalEventId match + title+date+time match

const GCalSync = (() => {
    const SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/spreadsheets';
    const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
    const AUTO_SYNC_INTERVAL = 3 * 60 * 1000; // 3 minutes

    let gapiInited = false;
    let accessToken = null;
    let _autoSyncTimer = null;
    let _syncInProgress = false; // prevent concurrent syncs

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
      case 'deleteExcept':
        result = deleteExcept(calId, params.timeMin, params.timeMax, params.keepIds || '');
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
  if (!ev) return { error: 'Event not found' };
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
}

function deleteExcept(calId, timeMin, timeMax, keepIdsStr) {
  var cal = CalendarApp.getCalendarById(calId) || CalendarApp.getDefaultCalendar();
  var start = new Date(timeMin);
  var end = new Date(timeMax);
  var events = cal.getEvents(start, end);
  var keepSet = {};
  if (keepIdsStr) {
    keepIdsStr.split(',').forEach(function(id) { keepSet[id.trim()] = true; });
  }
  var deleted = 0;
  for (var i = 0; i < events.length; i++) {
    var eid = events[i].getId().replace('@google.com', '');
    if (!keepSet[eid]) {
      try { events[i].deleteEvent(); deleted++; } catch(e) {}
    }
  }
  return { deleted: deleted, kept: events.length - deleted, total: events.length };
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

    // --- Event Map: CRM_ID -> GCal_ID (persisted in Firestore + localStorage) ---
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

    // CRM → GCal format
    function crmToGcal(ev) {
        // Explicitly mark as Moscow time (UTC+3, no DST) so GAS/GCal never misinterpret it
        const startDT = ev.date + 'T' + (ev.time || '10:00') + ':00+03:00';
        const dur = ev.duration || 60;
        // Compute end time with UTC arithmetic to avoid local-timezone distortion
        const endMs = new Date(startDT).getTime() + dur * 60 * 1000;
        const endMoscow = new Date(endMs + 3 * 3600 * 1000); // shift to Moscow "virtual UTC"
        const pad = (n) => String(n).padStart(2, '0');
        const endDT = endMoscow.getUTCFullYear() + '-' + pad(endMoscow.getUTCMonth() + 1) + '-' + pad(endMoscow.getUTCDate()) +
            'T' + pad(endMoscow.getUTCHours()) + ':' + pad(endMoscow.getUTCMinutes()) + ':00+03:00';

        const descParts = [];
        if (ev.title) descParts.push('📋 ' + ev.title);
        if (ev.clientName) descParts.push('👤 Клиент: ' + ev.clientName);
        if (ev.clientPhone) descParts.push('📞 Телефон: ' + ev.clientPhone);
        const typeNames = { paintball: 'Пейнтбол', laser: 'Лазертаг', kidball: 'Кидбол', quest: 'Квест', corporate: 'Корпоратив', birthday: 'День рождения', other: 'Другое' };
        if (ev.type && ev.type !== 'other') descParts.push('🎯 Тип: ' + (typeNames[ev.type] || ev.type));
        if (ev.participants > 0 || ev.players > 0) descParts.push('👥 Участники: ' + (ev.participants || ev.players));
        if (ev.price > 0) descParts.push('💰 Стоимость: ' + ev.price + ' ₽');
        const statusNames = { pending: 'Ожидает', confirmed: 'Подтверждено', completed: 'Завершено', cancelled: 'Отменено' };
        if (ev.status && ev.status !== 'pending') descParts.push('📌 Статус: ' + (statusNames[ev.status] || ev.status));
        if (ev.prepayment > 0) {
            const prepayMethod = ev.prepaymentMethod === 'qr' ? ' (QR)' : ev.prepaymentMethod === 'cash' ? ' (нал.)' : '';
            descParts.push('💳 Предоплата: ' + ev.prepayment + ' ₽' + prepayMethod);
        }
        if (ev.occasion) descParts.push('🎉 Повод: ' + ev.occasion);
        if (ev.notes) descParts.push('📝 Заметки: ' + ev.notes);
        descParts.push('');
        descParts.push('📱 Источник: CRM');
        descParts.push('CRM_ID: ' + ev.id);

        return {
            summary: ev.title || (ev.clientName ? 'Мероприятие — ' + ev.clientName : 'Мероприятие'),
            description: descParts.join('\n'),
            start: { dateTime: startDT, timeZone: 'Europe/Moscow' },
            end: { dateTime: endDT, timeZone: 'Europe/Moscow' }
        };
    }

    // GCal → CRM format (for external events created directly in Google Calendar)
    function gcalToCrm(gcalEv) {
        const start = gcalEv.start.dateTime || gcalEv.start.date;
        const end = gcalEv.end.dateTime || gcalEv.end.date;
        const startD = new Date(start);
        const endD = new Date(end);
        const dur = Math.round((endD - startD) / 60000);
        const pad = (n) => String(n).padStart(2, '0');
        // Use explicit UTC+3 arithmetic — never rely on browser local timezone
        const startMoscow = new Date(startD.getTime() + 3 * 3600 * 1000);
        const dateStr = startMoscow.getUTCFullYear() + '-' + pad(startMoscow.getUTCMonth() + 1) + '-' + pad(startMoscow.getUTCDate());
        const timeStr = pad(startMoscow.getUTCHours()) + ':' + pad(startMoscow.getUTCMinutes());

        const desc = gcalEv.description || '';
        const getField = (label) => {
            const m = desc.match(new RegExp(label + ':\\s*(.+)'));
            return m ? m[1].trim() : '';
        };

        return {
            title: gcalEv.summary || 'Без названия',
            date: dateStr,
            time: timeStr,
            duration: dur || 60,
            type: getField('Тип') || 'other',
            clientName: getField('Клиент') || '',
            clientPhone: getField('Телефон') || '',
            participants: parseInt(getField('Участники')) || 0,
            price: parseFloat(getField('Стоимость')) || 0,
            // NEVER import status from GCal — status is managed only by CRM
            notes: getField('Заметки'),
            occasion: getField('Повод'),
            gcalEventId: gcalEv.id,
            source: 'gcal', // Mark as imported from Google Calendar
        };
    }

    // ===================== PUSH: CRM → GCAL =====================

    async function pushEvent(crmEvent) {
        if (!isConnected()) return null;
        const calId = getCalendarId();
        const gcalData = crmToGcal(crmEvent);
        const map = getEventMap();
        let existingGcalId = map[String(crmEvent.id)];

        // If event was imported from GCal, use its original gcalEventId for update
        // This prevents creating a duplicate when editing a GCal-originated event
        if (!existingGcalId && crmEvent.gcalEventId) {
            existingGcalId = crmEvent.gcalEventId;
            map[String(crmEvent.id)] = existingGcalId;
            setEventMap(map);
            console.log('[GCal] Using gcalEventId for update:', crmEvent.id, '->', existingGcalId);
        }

        // If no local mapping, search GCal by CRM_ID to recover lost mapping
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
                    // If event was deleted in GCal, create new one
                    if (result && result.error && result.error.includes('not found')) {
                        result = await gasCall({
                            action: 'create', calendarId: calId,
                            data: JSON.stringify(gcalData)
                        });
                    }
                } else {
                    result = await gasCall({
                        action: 'create', calendarId: calId,
                        data: JSON.stringify(gcalData)
                    });
                }
            } else {
                let resp;
                if (existingGcalId) {
                    try {
                        resp = await oauthApiCall(() =>
                            gapi.client.calendar.events.update({
                                calendarId: calId, eventId: existingGcalId, resource: gcalData
                            })
                        );
                    } catch (e) {
                        if (e.status === 404 || e.status === 410) {
                            resp = await oauthApiCall(() =>
                                gapi.client.calendar.events.insert({
                                    calendarId: calId, resource: gcalData
                                })
                            );
                        } else throw e;
                    }
                } else {
                    resp = await oauthApiCall(() =>
                        gapi.client.calendar.events.insert({
                            calendarId: calId, resource: gcalData
                        })
                    );
                }
                result = resp.result;
            }
            if (result && result.id) {
                map[String(crmEvent.id)] = result.id;
                setEventMap(map);
                // Invalidate cache so next search sees this event
                _gcalCache = null;
            }
            return result;
        } catch (err) {
            console.error('[GCal] Push error:', err);
            return null;
        }
    }

    // ===================== DELETE =====================

    async function deleteEvent(crmEventId) {
        if (!isConnected()) return;
        const map = getEventMap();
        const gcalId = map[String(crmEventId)];
        if (!gcalId) return;

        try {
            if (useAppsScript()) {
                await gasCall({ action: 'delete', calendarId: getCalendarId(), eventId: gcalId });
            } else {
                await oauthApiCall(() =>
                    gapi.client.calendar.events.delete({ calendarId: getCalendarId(), eventId: gcalId })
                );
            }
        } catch (err) {
            // 404/410 = already deleted, that's fine
            if (err.status !== 404 && err.status !== 410) {
                console.error('[GCal] Delete error:', err);
            }
        }
        delete map[String(crmEventId)];
        setEventMap(map);
        _gcalCache = null;
    }

    // ===================== PULL: GCAL → CRM =====================

    // GCal events cache for dedup lookups
    let _gcalCache = null;
    let _gcalCacheTime = 0;

    async function _fetchGcalEvents(calId, timeMin, timeMax) {
        if (useAppsScript()) {
            const result = await gasCall({ action: 'list', calendarId: calId, timeMin, timeMax });
            if (Array.isArray(result)) return result;
            if (result && result.error) {
                console.error('[GCal] List error:', result.error);
                return [];
            }
            return [];
        } else {
            const resp = await oauthApiCall(() =>
                gapi.client.calendar.events.list({
                    calendarId: calId, timeMin, timeMax,
                    singleEvents: true, orderBy: 'startTime', maxResults: 250
                })
            );
            return resp.result.items || [];
        }
    }

    // Find GCal event by CRM_ID in description (with caching)
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

    async function pullEvents(timeMin, timeMax) {
        if (!isConnected()) return { added: 0, updated: 0, total: 0 };
        updateStatus('syncing');

        try {
            const gcalEvents = await _fetchGcalEvents(getCalendarId(), timeMin, timeMax);
            const events = DB.get('events', []);
            const map = getEventMap();

            // Build lookup indexes for fast dedup
            const reverseMap = {}; // gcalId -> crmId
            Object.entries(map).forEach(([crmId, gcalId]) => { reverseMap[gcalId] = crmId; });

            const crmById = {}; // crmId -> index
            events.forEach((e, i) => { crmById[String(e.id)] = i; });

            const gcalEventIdIndex = {}; // gcalEventId -> index (for external events)
            events.forEach((e, i) => { if (e.gcalEventId) gcalEventIdIndex[e.gcalEventId] = i; });

            const titleDateIndex = {}; // "title|date|time" -> index
            events.forEach((e, i) => { titleDateIndex[`${e.title}|${e.date}|${e.time}`] = i; });

            let added = 0, updated = 0;

            for (const gEv of gcalEvents) {
                const desc = gEv.description || '';

                // === CHECK 1: Already mapped by gcalId ===
                if (reverseMap[gEv.id]) {
                    const crmId = reverseMap[gEv.id];
                    if (crmById[crmId] !== undefined) {
                        // Already synced — skip
                        continue;
                    }
                }

                // === CHECK 2: Has CRM_ID → originated from CRM ===
                const crmIdMatch = desc.match(/CRM_ID:\s*(\d+)/);
                if (crmIdMatch) {
                    const crmId = crmIdMatch[1];
                    if (crmById[crmId] !== undefined) {
                        // CRM event exists — just ensure mapping is correct
                        if (map[crmId] !== gEv.id) {
                            map[crmId] = gEv.id;
                            reverseMap[gEv.id] = crmId;
                        }
                        continue;
                    }
                    // CRM_ID exists in GCal but not in CRM — event was deleted from CRM, skip
                    continue;
                }

                // === This is an EXTERNAL event (created in Google Calendar) ===

                // CHECK 3: Already imported by gcalEventId
                if (gcalEventIdIndex[gEv.id] !== undefined) {
                    const idx = gcalEventIdIndex[gEv.id];
                    const imported = gcalToCrm(gEv);
                    // Update fields but preserve CRM-managed fields
                    events[idx] = {
                        ...events[idx],
                        title: imported.title,
                        date: imported.date,
                        time: imported.time,
                        duration: imported.duration,
                        clientName: imported.clientName || events[idx].clientName,
                        clientPhone: imported.clientPhone || events[idx].clientPhone,
                        participants: imported.participants || events[idx].participants,
                        price: imported.price || events[idx].price,
                        // Keep: id, status, source, gcalEventId
                    };
                    updated++;
                    continue;
                }

                // CHECK 4: Match by title + date + time (prevent import duplicates)
                const imported = gcalToCrm(gEv);
                const dedupKey = `${imported.title}|${imported.date}|${imported.time}`;
                if (titleDateIndex[dedupKey] !== undefined) {
                    const idx = titleDateIndex[dedupKey];
                    // Map existing CRM event to this GCal event
                    map[String(events[idx].id)] = gEv.id;
                    reverseMap[gEv.id] = String(events[idx].id);
                    if (!events[idx].gcalEventId) events[idx].gcalEventId = gEv.id;
                    if (!events[idx].source) events[idx].source = 'gcal';
                    updated++;
                    continue;
                }

                // === NEW external event — import it ===
                imported.id = Date.now() + Math.floor(Math.random() * 10000);
                imported.status = 'pending';
                imported.source = 'gcal';
                events.push(imported);

                // Update indexes
                const newIdx = events.length - 1;
                crmById[String(imported.id)] = newIdx;
                gcalEventIdIndex[gEv.id] = newIdx;
                titleDateIndex[dedupKey] = newIdx;
                map[String(imported.id)] = gEv.id;
                reverseMap[gEv.id] = String(imported.id);

                added++;
                console.log('[GCal] Imported external event:', imported.title, imported.date);
            }

            // === DETECT REMOTE DELETIONS ===
            // Если CRM-событие было замаплено в GCal, но в выгрузке его нет —
            // значит его удалили в Google Calendar → удаляем и из CRM.
            const gcalIdsPresent = new Set(gcalEvents.map(e => e.id));
            const fromStr = new Date(timeMin).toISOString().slice(0, 10);
            const toStr = new Date(timeMax).toISOString().slice(0, 10);
            let deleted = 0;
            const kept = [];
            for (const ev of events) {
                if (!ev.date || ev.date < fromStr || ev.date > toStr) { kept.push(ev); continue; }
                const gcalId = map[String(ev.id)] || ev.gcalEventId;
                if (!gcalId) { kept.push(ev); continue; }
                if (gcalIdsPresent.has(gcalId)) { kept.push(ev); continue; }
                // Замапленного события в GCal нет — удалено извне
                delete map[String(ev.id)];
                deleted++;
                console.log('[GCal] Remote delete → removing from CRM:', ev.title, ev.date);
            }
            const finalEvents = deleted > 0 ? kept : events;

            DB.set('events', finalEvents);
            setEventMap(map);
            updateStatus('connected');
            return { added, updated, deleted, total: gcalEvents.length };
        } catch (err) {
            console.error('[GCal] Pull error:', err);
            updateStatus('error');
            return { added: 0, updated: 0, total: 0 };
        }
    }

    // ===================== AUTO-SYNC =====================

    function startAutoSync() {
        stopAutoSync();
        // First sync after 5 seconds
        setTimeout(() => autoSync(), 5000);
        // Then every 3 minutes
        _autoSyncTimer = setInterval(() => autoSync(), AUTO_SYNC_INTERVAL);
        console.log('[GCal] Auto-sync started (every 3 min)');
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
            const now = new Date();
            const from = new Date(now); from.setDate(from.getDate() - 7);
            const to = new Date(now); to.setDate(to.getDate() + 180);
            const result = await pullEvents(from.toISOString(), to.toISOString());
            if (result.added > 0 || result.deleted > 0) {
                const parts = [];
                if (result.added > 0) parts.push(`+${result.added}`);
                if (result.deleted > 0) parts.push(`−${result.deleted}`);
                showToast(`📅 Google Calendar: ${parts.join(' / ')}`);
                // Re-render calendar if visible
                if (typeof renderCalendar === 'function') {
                    const schedPage = document.getElementById('page-schedule');
                    if (schedPage && schedPage.classList.contains('active')) renderCalendar();
                }
                if (typeof renderEmpCalendar === 'function') {
                    const empBooking = document.getElementById('emp-page-booking');
                    if (empBooking && empBooking.classList.contains('active')) renderEmpCalendar();
                }
            }
        } catch (err) {
            console.error('[GCal] Auto-sync error:', err);
        } finally {
            _syncInProgress = false;
        }
    }

    // ===================== FULL SYNC (manual) =====================

    async function fullSync() {
        if (!isConnected()) {
            showToast('Google Calendar не подключён');
            return;
        }
        if (_syncInProgress) {
            showToast('Синхронизация уже идёт...');
            return;
        }
        _syncInProgress = true;
        updateStatus('syncing');

        try {
            const now = new Date();
            const from = new Date(now); from.setDate(from.getDate() - 30);
            const to = new Date(now); to.setDate(to.getDate() + 180);

            // Step 1: Pull external events from GCal into CRM
            const pullResult = await pullEvents(from.toISOString(), to.toISOString());

            // Step 2: Push unmapped CRM events to GCal (safely, with dedup)
            const events = DB.get('events', []);
            const map = getEventMap();
            const unmapped = events.filter(e => e.date && !e.deleted && !map[String(e.id)]);
            let pushed = 0;
            for (const ev of unmapped) {
                try {
                    await pushEvent(ev);
                    pushed++;
                } catch (e) {
                    console.error('[GCal] Push failed for event', ev.id, e);
                }
            }

            // Step 3: Clean stale map entries
            const freshEvents = DB.get('events', []);
            const freshMap = getEventMap();
            const eventIds = new Set(freshEvents.map(e => String(e.id)));
            let cleaned = 0;
            for (const crmId of Object.keys(freshMap)) {
                if (!eventIds.has(crmId)) {
                    delete freshMap[crmId];
                    cleaned++;
                }
            }
            if (cleaned > 0) setEventMap(freshMap);

            updateStatus('connected');
            let msg = `Синхронизация: +${pullResult.added} из GCal`;
            if (pushed > 0) msg += `, ${pushed} в GCal`;
            if (pullResult.updated > 0) msg += `, ${pullResult.updated} обновл.`;
            if (pullResult.deleted > 0) msg += `, −${pullResult.deleted} удал.`;
            showToast(msg);
            return { ...pullResult, pushed };
        } catch (err) {
            console.error('[GCal] Full sync error:', err);
            updateStatus('error');
            showToast('Ошибка синхронизации');
        } finally {
            _syncInProgress = false;
        }
    }

    // ===================== DEDUP (safety net) =====================

    function deduplicateEvents() {
        const events = DB.get('events', []);
        const seen = new Map();
        const unique = [];
        for (const ev of events) {
            const key = `${ev.title}|${ev.date}|${ev.time}`;
            if (!seen.has(key)) {
                seen.set(key, ev);
                unique.push(ev);
            } else {
                // Keep the one with more data (prefer with gcalEventId, or with source)
                const existing = seen.get(key);
                if (ev.gcalEventId && !existing.gcalEventId) {
                    const idx = unique.indexOf(existing);
                    unique[idx] = { ...existing, gcalEventId: ev.gcalEventId, source: ev.source || existing.source };
                    seen.set(key, unique[idx]);
                }
            }
        }
        if (unique.length < events.length) {
            DB.set('events', unique);
            return events.length - unique.length;
        }
        return 0;
    }

    function reinitGis() {}
    function getGasCode() { return GAS_CODE; }

    // ===================== PUBLIC API =====================

    return {
        init, authorize, disconnect, isConnected,
        pushEvent, deleteEvent, pullEvents,
        fullSync, autoSync, updateStatus, reinitGis,
        deduplicateEvents, getGasCode,
        setAppsScriptUrl, getAppsScriptUrl,
        setCalendarId, getCalendarId,
        startAutoSync, stopAutoSync,
    };
})();
