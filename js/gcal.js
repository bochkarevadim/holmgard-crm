// ===== GOOGLE CALENDAR SYNC MODULE =====
const GCalSync = (() => {
    const SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/spreadsheets';
    const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';

    let gapiInited = false;
    let accessToken = null;

    // --- Storage helpers ---
    function getClientId() { return localStorage.getItem('hp_gcal_client_id') || ''; }
    function getCalendarId() { return localStorage.getItem('hp_gcal_calendar_id') || 'primary'; }
    function getEventMap() {
        try { return JSON.parse(localStorage.getItem('hp_gcal_event_map') || '{}'); } catch { return {}; }
    }
    function setEventMap(map) { localStorage.setItem('hp_gcal_event_map', JSON.stringify(map)); }

    function restoreToken() {
        // Try Firestore shared token first (set by director, available to all)
        const shared = typeof DB !== 'undefined' ? DB.get('gcal_token', null) : null;
        if (shared && shared.token && Date.now() < shared.expiry) {
            accessToken = shared.token;
            return true;
        }
        // Fallback to localStorage
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
        // Share token via Firestore so all devices/employees can use it
        if (typeof DB !== 'undefined') {
            DB.set('gcal_token', { token, expiry });
        }
    }

    function clearToken() {
        accessToken = null;
        localStorage.removeItem('hp_gcal_token');
        localStorage.removeItem('hp_gcal_token_expiry');
        if (typeof DB !== 'undefined') {
            DB.set('gcal_token', null);
        }
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
                } catch (e) {
                    // cross-origin — Google login page, no consent cached
                }
                if (!resolved) { resolved = true; cleanup(); resolve(false); }
            });

            iframe.src = authUrl;
        });
    }

    // --- Check URL hash for OAuth redirect response ---
    function handleRedirectResponse() {
        const hash = window.location.hash.substring(1);
        if (!hash) return false;

        const params = new URLSearchParams(hash);
        const token = params.get('access_token');
        const expiresIn = params.get('expires_in');

        if (token && expiresIn) {
            storeToken(token, parseInt(expiresIn));
            // Clean URL hash
            history.replaceState(null, '', window.location.pathname + window.location.search);
            return true;
        }

        // Check for error
        const error = params.get('error');
        if (error) {
            console.error('OAuth error:', error);
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        return false;
    }

    // --- Init ---
    async function init() {
        if (!getClientId()) { updateStatus('none'); return; }

        // Check if returning from OAuth redirect
        const gotToken = handleRedirectResponse();

        try {
            await loadGapi();
            if (gotToken || restoreToken()) {
                gapi.client.setToken({ access_token: accessToken });
                updateStatus('connected');
                if (gotToken) showToast('Google Calendar подключён');
            } else {
                // Token missing or expired — try silent refresh
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

    // --- Auto-sync: called after CRM login ---
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
                if (typeof gapi === 'undefined' || typeof gapi.load !== 'function') {
                    return false;
                }
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

            // gapi script loaded async — wait up to 5s for it
            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (tryLoad()) { clearInterval(interval); return; }
                if (attempts >= 25) { clearInterval(interval); reject('gapi not loaded after timeout'); }
            }, 200);
        });
    }

    // --- Auth via OAuth redirect (no popup needed) ---
    function authorize() {
        const clientId = getClientId();
        if (!clientId) {
            showToast('Введите Client ID в Настройках');
            return;
        }
        // Save current session before redirect (so PIN screen is skipped on return)
        sessionStorage.setItem('hp_gcal_pre_auth_page', 'settings');
        if (typeof currentUser !== 'undefined' && currentUser) {
            sessionStorage.setItem('hp_gcal_returning_user_id', String(currentUser.id));
        }

        // Build OAuth 2.0 implicit flow URL
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
        if (accessToken) {
            // Revoke token via Google's endpoint
            fetch('https://oauth2.googleapis.com/revoke?token=' + accessToken, { method: 'POST' }).catch(() => {});
        }
        clearToken();
        if (gapiInited) gapi.client.setToken(null);
        updateStatus('disconnected');
        showToast('Google Calendar отключён');
    }

    function isConnected() {
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
            connected: 'Подключено',
            disconnected: 'Отключено',
            error: 'Ошибка',
            none: 'Нет Client ID',
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
        const endDT = endDate.getFullYear() + '-' +
            String(endDate.getMonth() + 1).padStart(2, '0') + '-' +
            String(endDate.getDate()).padStart(2, '0') + 'T' +
            String(endDate.getHours()).padStart(2, '0') + ':' +
            String(endDate.getMinutes()).padStart(2, '0') + ':00';

        const descParts = [];
        if (ev.type) descParts.push('Тип: ' + ev.type);
        if (ev.participants || ev.players) descParts.push('Участники: ' + (ev.participants || ev.players));
        if (ev.price) descParts.push('Стоимость: ' + ev.price + ' ₽');
        if (ev.status) descParts.push('Статус: ' + ev.status);
        if (ev.notes) descParts.push('Заметки: ' + ev.notes);
        if (ev.occasion) descParts.push('Повод: ' + ev.occasion);
        if (ev.playerAge) descParts.push('Возраст: ' + ev.playerAge);

        return {
            summary: ev.title || 'Мероприятие',
            description: descParts.join('\n'),
            start: { dateTime: startDT, timeZone: 'Europe/Moscow' },
            end: { dateTime: endDT, timeZone: 'Europe/Moscow' },
            extendedProperties: {
                private: {
                    crm_id: String(ev.id),
                    crm_source: 'holmgard-crm'
                }
            }
        };
    }

    function gcalToCrm(gcalEv) {
        const start = gcalEv.start.dateTime || gcalEv.start.date;
        const end = gcalEv.end.dateTime || gcalEv.end.date;
        const startD = new Date(start);
        const endD = new Date(end);
        const dur = Math.round((endD - startD) / 60000);

        const dateStr = startD.getFullYear() + '-' +
            String(startD.getMonth() + 1).padStart(2, '0') + '-' +
            String(startD.getDate()).padStart(2, '0');
        const timeStr = String(startD.getHours()).padStart(2, '0') + ':' +
            String(startD.getMinutes()).padStart(2, '0');

        // Parse description for structured fields
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
            participants: parseInt(getField('Участники')) || 0,
            price: parseFloat(getField('Стоимость')) || 0,
            status: getField('Статус') || 'pending',
            notes: getField('Заметки'),
            occasion: getField('Повод'),
            playerAge: getField('Возраст'),
            gcalEventId: gcalEv.id,
        };
    }

    // --- API calls with retry on 401 (auto-refresh token) ---
    async function apiCall(fn) {
        try {
            return await fn();
        } catch (err) {
            if (err.status === 401) {
                // Token expired — try silent refresh
                const refreshed = await silentRefresh();
                if (refreshed && gapiInited) {
                    gapi.client.setToken({ access_token: accessToken });
                    updateStatus('connected');
                    return await fn(); // retry once
                }
                clearToken();
                updateStatus('disconnected');
                showToast('Токен истёк. Нажмите Подключить заново.');
                throw err;
            }
            throw err;
        }
    }

    // --- Push event to Google Calendar ---
    async function pushEvent(crmEvent) {
        if (!isConnected()) return null;
        const calId = getCalendarId();
        const gcalData = crmToGcal(crmEvent);
        const map = getEventMap();
        const existingGcalId = map[String(crmEvent.id)];

        try {
            let resp;
            if (existingGcalId) {
                resp = await apiCall(() =>
                    gapi.client.calendar.events.update({
                        calendarId: calId,
                        eventId: existingGcalId,
                        resource: gcalData
                    })
                );
            } else {
                resp = await apiCall(() =>
                    gapi.client.calendar.events.insert({
                        calendarId: calId,
                        resource: gcalData
                    })
                );
            }
            map[String(crmEvent.id)] = resp.result.id;
            setEventMap(map);
            return resp.result;
        } catch (err) {
            console.error('GCal push error:', err);
            showToast('Ошибка синхронизации с Google Calendar');
            return null;
        }
    }

    // --- Delete event from Google Calendar ---
    async function deleteEvent(crmEventId) {
        if (!isConnected()) return;
        const map = getEventMap();
        const gcalId = map[String(crmEventId)];
        if (!gcalId) return;

        try {
            await apiCall(() =>
                gapi.client.calendar.events.delete({
                    calendarId: getCalendarId(),
                    eventId: gcalId
                })
            );
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

    // --- Pull events from Google Calendar ---
    async function pullEvents(timeMin, timeMax) {
        if (!isConnected()) return [];
        updateStatus('syncing');

        try {
            const resp = await apiCall(() =>
                gapi.client.calendar.events.list({
                    calendarId: getCalendarId(),
                    timeMin: timeMin,
                    timeMax: timeMax,
                    singleEvents: true,
                    orderBy: 'startTime',
                    maxResults: 250
                })
            );

            const gcalEvents = resp.result.items || [];
            const events = DB.get('events', []);
            const map = getEventMap();
            let added = 0, updated = 0;

            for (const gEv of gcalEvents) {
                // Check if this is our own event
                const priv = (gEv.extendedProperties && gEv.extendedProperties.private) || {};
                const crmId = priv.crm_id;

                if (crmId && priv.crm_source === 'holmgard-crm') {
                    // This event originated from CRM — update if exists
                    const idx = events.findIndex(e => String(e.id) === String(crmId));
                    if (idx >= 0) {
                        const imported = gcalToCrm(gEv);
                        events[idx] = { ...events[idx], ...imported, id: events[idx].id };
                        map[String(events[idx].id)] = gEv.id;
                        updated++;
                    }
                } else {
                    // External event — check if already imported by gcalEventId
                    const existingIdx = events.findIndex(e => e.gcalEventId === gEv.id);
                    if (existingIdx >= 0) {
                        const imported = gcalToCrm(gEv);
                        events[existingIdx] = { ...events[existingIdx], ...imported, id: events[existingIdx].id };
                        updated++;
                    } else {
                        const imported = gcalToCrm(gEv);
                        // Fallback dedup: check by title + date + time
                        const dupIdx = events.findIndex(e =>
                            e.title === imported.title &&
                            e.date === imported.date &&
                            e.time === imported.time
                        );
                        if (dupIdx >= 0) {
                            // Found duplicate — update and link gcalEventId
                            events[dupIdx] = { ...events[dupIdx], ...imported, id: events[dupIdx].id };
                            map[String(events[dupIdx].id)] = gEv.id;
                            updated++;
                        } else {
                            // Truly new event — import it
                            imported.id = Date.now() + Math.floor(Math.random() * 1000);
                            events.push(imported);
                            map[String(imported.id)] = gEv.id;
                            added++;
                        }
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

    // --- Cleanup existing duplicate events ---
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
                // Keep the one with gcalEventId if possible
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
            console.log(`GCal dedup: removed ${events.length - unique.length} duplicates`);
            return events.length - unique.length;
        }
        return 0;
    }

    // --- Full sync: pull then push all ---
    async function fullSync() {
        if (!isConnected()) {
            showToast('Google Calendar не подключён');
            return;
        }
        updateStatus('syncing');

        // Pull: last 30 days to next 90 days
        const now = new Date();
        const from = new Date(now);
        from.setDate(from.getDate() - 30);
        const to = new Date(now);
        to.setDate(to.getDate() + 90);

        const pullResult = await pullEvents(from.toISOString(), to.toISOString());

        // Cleanup any existing duplicates
        const removed = deduplicateEvents();

        // Push all CRM events without gcal mapping
        const events = DB.get('events', []);
        const map = getEventMap();
        let pushed = 0;

        for (const ev of events) {
            if (!map[String(ev.id)]) {
                await pushEvent(ev);
                pushed++;
            }
        }

        updateStatus('connected');
        let msg = `Синхронизация: +${pullResult.added} импорт, ${pullResult.updated} обновл., ${pushed} отправл.`;
        if (removed > 0) msg += `, ${removed} дубл. удалено`;
        showToast(msg);

        return { ...pullResult, pushed };
    }

    // --- Re-init (no longer needed but kept for compatibility) ---
    function reinitGis() {}

    return {
        init,
        authorize,
        disconnect,
        isConnected,
        pushEvent,
        deleteEvent,
        pullEvents,
        fullSync,
        autoSync,
        updateStatus,
        reinitGis,
        deduplicateEvents
    };
})();
