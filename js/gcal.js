// ===== GOOGLE CALENDAR SYNC MODULE =====
// Supports two modes:
// 1. Apps Script proxy (recommended) — permanent, no token expiry
// 2. OAuth implicit flow (fallback) — token expires in 1 hour
const GCalSync = (() => {
    const SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/spreadsheets';
    const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';

    let gapiInited = false;
    let accessToken = null;

    // --- Google Apps Script code to copy ---
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

    // --- Storage helpers ---
    function getAppsScriptUrl() {
        // Shared via Firestore (set once by director, available to all)
        const shared = typeof DB !== 'undefined' ? DB.get('gcal_apps_script_url', '') : '';
        return shared || localStorage.getItem('hp_gcal_apps_script_url') || '';
    }
    function setAppsScriptUrl(url) {
        localStorage.setItem('hp_gcal_apps_script_url', url);
        if (typeof DB !== 'undefined') {
            DB.set('gcal_apps_script_url', url);
        }
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
    function getEventMap() {
        // Try Firestore first, fallback to localStorage
        try {
            const dbMap = typeof DB !== 'undefined' ? DB.get('gcal_event_map', null) : null;
            if (dbMap && typeof dbMap === 'object' && Object.keys(dbMap).length > 0) return dbMap;
            return JSON.parse(localStorage.getItem('hp_gcal_event_map') || '{}');
        } catch { return {}; }
    }
    function setEventMap(map) {
        localStorage.setItem('hp_gcal_event_map', JSON.stringify(map));
        // Persist to Firestore so map survives across devices/cache clears
        if (typeof DB !== 'undefined') {
            try { DB.set('gcal_event_map', map); } catch(e) {}
        }
    }

    function useAppsScript() { return !!getAppsScriptUrl(); }

    // --- Apps Script API calls ---
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

    // --- OAuth token management (fallback) ---
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

    // --- Silent token refresh via hidden iframe ---
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

    // --- Init ---
    async function init() {
        // Apps Script mode — ping to verify
        if (useAppsScript()) {
            try {
                const r = await gasCall({ action: 'ping', calendarId: getCalendarId() });
                if (r && (r.ok || r.email)) {
                    updateStatus('connected');
                    return;
                }
            } catch (err) {
                console.error('GCalSync Apps Script ping error:', err);
                updateStatus('error');
                return;
            }
        }

        // OAuth mode
        if (!getClientId()) { updateStatus('none'); return; }
        const gotToken = handleRedirectResponse();
        try {
            await loadGapi();
            if (gotToken || restoreToken()) {
                gapi.client.setToken({ access_token: accessToken });
                updateStatus('connected');
                if (gotToken) showToast('Google Calendar подключён');
            } else {
                const refreshed = await silentRefresh();
                if (refreshed) {
                    gapi.client.setToken({ access_token: accessToken });
                    updateStatus('connected');
                } else {
                    updateStatus('disconnected');
                }
            }
        } catch (err) {
            console.error('GCalSync init error:', err);
            updateStatus('error');
        }
    }

    // --- Auto-sync ---
    async function autoSync() {
        if (!isConnected()) return;
        try {
            const now = new Date();
            const from = new Date(now); from.setDate(from.getDate() - 7);
            const to = new Date(now); to.setDate(to.getDate() + 180);
            const result = await pullEvents(from.toISOString(), to.toISOString());
            if (result.added > 0) {
                showToast(`Google Calendar: +${result.added} новых мероприятий`);
            }
        } catch (err) {
            console.error('GCal autoSync error:', err);
        }
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

    // --- Auth (OAuth fallback) ---
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

    // --- Status UI ---
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

    // --- Mapping CRM <-> GCal ---
    function crmToGcal(ev) {
        const startDT = ev.date + 'T' + (ev.time || '10:00') + ':00';
        const dur = ev.duration || 60;
        const endDate = new Date(startDT);
        endDate.setMinutes(endDate.getMinutes() + dur);
        const pad = (n) => String(n).padStart(2, '0');
        const endDT = endDate.getFullYear() + '-' + pad(endDate.getMonth() + 1) + '-' + pad(endDate.getDate()) +
            'T' + pad(endDate.getHours()) + ':' + pad(endDate.getMinutes()) + ':00';

        // Build rich description — skip empty/default values
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
        if (ev.occasion) descParts.push('🎉 Повод: ' + ev.occasion);
        if (ev.notes) descParts.push('📝 Заметки: ' + ev.notes);
        descParts.push('');
        descParts.push('CRM_ID: ' + ev.id);

        return {
            summary: ev.title || (ev.clientName ? 'Мероприятие — ' + ev.clientName : 'Мероприятие'),
            description: descParts.join('\n'),
            start: { dateTime: startDT, timeZone: 'Europe/Moscow' },
            end: { dateTime: endDT, timeZone: 'Europe/Moscow' }
        };
    }

    function gcalToCrm(gcalEv) {
        const start = gcalEv.start.dateTime || gcalEv.start.date;
        const end = gcalEv.end.dateTime || gcalEv.end.date;
        const startD = new Date(start);
        const endD = new Date(end);
        const dur = Math.round((endD - startD) / 60000);
        const pad = (n) => String(n).padStart(2, '0');
        const dateStr = startD.getFullYear() + '-' + pad(startD.getMonth() + 1) + '-' + pad(startD.getDate());
        const timeStr = pad(startD.getHours()) + ':' + pad(startD.getMinutes());

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
        };
    }

    // --- API call with retry (OAuth mode) ---
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

    // --- Find existing GCal event by CRM_ID in description ---
    // Cache the GCal events list to avoid repeated API calls during batch operations
    let _gcalEventsCache = null;
    let _gcalEventsCacheTime = 0;

    async function findGcalEventByCrmId(calId, crmId) {
        try {
            if (useAppsScript()) {
                // Use cached list if fresh (< 30 seconds old)
                const now = Date.now();
                if (!_gcalEventsCache || now - _gcalEventsCacheTime > 30000) {
                    const fromD = new Date(); fromD.setFullYear(fromD.getFullYear() - 2);
                    const toD = new Date(); toD.setFullYear(toD.getFullYear() + 2);
                    const data = await gasCall({
                        action: 'list', calendarId: calId,
                        timeMin: fromD.toISOString(), timeMax: toD.toISOString()
                    });
                    // GAS returns array directly, not {events: [...]}
                    _gcalEventsCache = Array.isArray(data) ? data : [];
                    _gcalEventsCacheTime = now;
                }
                const needle = 'CRM_ID: ' + crmId;
                const found = _gcalEventsCache.find(e => e.description && e.description.includes(needle));
                if (found) return found.id;
            }
        } catch(e) { console.warn('findGcalEventByCrmId error:', e); }
        return null;
    }

    // --- Push event (with duplicate protection) ---
    async function pushEvent(crmEvent) {
        if (!isConnected()) return null;
        const calId = getCalendarId();
        const gcalData = crmToGcal(crmEvent);
        const map = getEventMap();
        let existingGcalId = map[String(crmEvent.id)];

        // If no mapping exists, search GCal for existing event by CRM_ID to prevent duplicates
        if (!existingGcalId) {
            existingGcalId = await findGcalEventByCrmId(calId, crmEvent.id);
            if (existingGcalId) {
                // Restore lost mapping
                map[String(crmEvent.id)] = existingGcalId;
                setEventMap(map);
                console.log('GCal: restored mapping for CRM event', crmEvent.id, '->', existingGcalId);
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
                } else {
                    result = await gasCall({
                        action: 'create', calendarId: calId,
                        data: JSON.stringify(gcalData)
                    });
                }
            } else {
                let resp;
                if (existingGcalId) {
                    resp = await oauthApiCall(() =>
                        gapi.client.calendar.events.update({
                            calendarId: calId, eventId: existingGcalId, resource: gcalData
                        })
                    );
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
            }
            return result;
        } catch (err) {
            console.error('GCal push error:', err);
            showToast('Ошибка синхронизации с Google Calendar');
            return null;
        }
    }

    // --- Delete event ---
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
            delete map[String(crmEventId)];
            setEventMap(map);
        } catch (err) {
            if (err.status === 404 || err.status === 410) {
                delete map[String(crmEventId)];
                setEventMap(map);
            } else {
                console.error('GCal delete error:', err);
            }
        }
    }

    // --- Pull events ---
    async function pullEvents(timeMin, timeMax) {
        if (!isConnected()) return { added: 0, updated: 0, total: 0 };
        updateStatus('syncing');

        try {
            let gcalEvents;
            if (useAppsScript()) {
                const result = await gasCall({
                    action: 'list', calendarId: getCalendarId(),
                    timeMin, timeMax
                });
                gcalEvents = Array.isArray(result) ? result : (result.error ? [] : []);
                if (result.error) {
                    console.error('GCal pull error:', result.error);
                    updateStatus('error');
                    return { added: 0, updated: 0, total: 0 };
                }
            } else {
                const resp = await oauthApiCall(() =>
                    gapi.client.calendar.events.list({
                        calendarId: getCalendarId(),
                        timeMin, timeMax,
                        singleEvents: true, orderBy: 'startTime', maxResults: 250
                    })
                );
                gcalEvents = resp.result.items || [];
            }

            const events = DB.get('events', []);
            const map = getEventMap();
            // Build reverse map: gcalId -> crmId
            const reverseMap = {};
            Object.entries(map).forEach(([crmId, gcalId]) => { reverseMap[gcalId] = crmId; });
            let added = 0, updated = 0;

            for (const gEv of gcalEvents) {
                // Skip if this gcal event is already mapped to a CRM event
                if (reverseMap[gEv.id]) {
                    const crmId = reverseMap[gEv.id];
                    const idx = events.findIndex(e => String(e.id) === crmId);
                    if (idx >= 0) {
                        // Already mapped — don't overwrite CRM data, just update mapping
                        map[crmId] = gEv.id;
                        continue;
                    }
                }

                // Check CRM_ID in description — this is a CRM-originated event
                const desc = gEv.description || '';
                const crmIdMatch = desc.match(/CRM_ID:\s*(\d+)/);
                const crmId = crmIdMatch ? crmIdMatch[1] : null;

                if (crmId) {
                    // Event from CRM — just update mapping, don't overwrite CRM data
                    const idx = events.findIndex(e => String(e.id) === crmId);
                    if (idx >= 0) {
                        map[String(events[idx].id)] = gEv.id;
                        reverseMap[gEv.id] = String(events[idx].id);
                    }
                    continue;
                }

                // External event (created in Google Calendar, not in CRM)
                const existingIdx = events.findIndex(e => e.gcalEventId === gEv.id);
                if (existingIdx >= 0) {
                    // Already imported — update from GCal
                    const imported = gcalToCrm(gEv);
                    events[existingIdx] = { ...events[existingIdx], ...imported, id: events[existingIdx].id, status: events[existingIdx].status };
                    updated++;
                } else {
                    const imported = gcalToCrm(gEv);
                    // Dedup by title + date + time
                    const dupIdx = events.findIndex(e =>
                        e.title === imported.title && e.date === imported.date && e.time === imported.time
                    );
                    if (dupIdx >= 0) {
                        map[String(events[dupIdx].id)] = gEv.id;
                        reverseMap[gEv.id] = String(events[dupIdx].id);
                        updated++;
                    } else {
                        imported.id = Date.now() + Math.floor(Math.random() * 1000);
                        events.push(imported);
                        map[String(imported.id)] = gEv.id;
                        reverseMap[gEv.id] = String(imported.id);
                        added++;
                    }
                }
            }

            DB.set('events', events);
            setEventMap(map);
            updateStatus('connected');
            return { added, updated, total: gcalEvents.length };
        } catch (err) {
            console.error('GCal pull error:', err);
            updateStatus('error');
            showToast('Ошибка загрузки из Google Calendar');
            return { added: 0, updated: 0, total: 0 };
        }
    }

    // --- Dedup ---
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
                const existing = seen.get(key);
                if (ev.gcalEventId && !existing.gcalEventId) {
                    const idx = unique.indexOf(existing);
                    unique[idx] = ev;
                    seen.set(key, ev);
                }
            }
        }
        if (unique.length < events.length) {
            DB.set('events', unique);
            return events.length - unique.length;
        }
        return 0;
    }

    // --- Full sync (pull only — push happens on event save) ---
    async function fullSync() {
        if (!isConnected()) {
            showToast('Google Calendar не подключён');
            return;
        }
        updateStatus('syncing');

        const now = new Date();
        const from = new Date(now); from.setDate(from.getDate() - 30);
        const to = new Date(now); to.setDate(to.getDate() + 180);

        // Step 1: Pull external events from GCal into CRM
        const pullResult = await pullEvents(from.toISOString(), to.toISOString());
        const removed = deduplicateEvents();

        // Step 2: Clean stale map entries
        const events = DB.get('events', []);
        const map = getEventMap();
        const eventIds = new Set(events.map(e => String(e.id)));
        for (const crmId of Object.keys(map)) {
            if (!eventIds.has(crmId)) delete map[crmId];
        }
        setEventMap(map);

        // NOTE: We do NOT bulk-push unmapped events to avoid duplicates.
        // Events are pushed to GCal individually when created/edited in CRM.

        updateStatus('connected');
        let msg = `Синхронизация: +${pullResult.added} импорт, ${pullResult.updated} обновл.`;
        if (removed > 0) msg += `, ${removed} дубл. удалено`;
        showToast(msg);
        return { ...pullResult, pushed: 0 };
    }

    function reinitGis() {}

    function getGasCode() { return GAS_CODE; }

    return {
        init, authorize, disconnect, isConnected,
        pushEvent, deleteEvent, pullEvents,
        fullSync, autoSync, updateStatus, reinitGis,
        deduplicateEvents, getGasCode,
        setAppsScriptUrl, getAppsScriptUrl,
        setCalendarId
    };
})();
