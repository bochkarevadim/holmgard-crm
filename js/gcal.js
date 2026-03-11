// ===== GOOGLE CALENDAR SYNC MODULE =====
const GCalSync = (() => {
    const SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/spreadsheets';
    const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';

    let tokenClient = null;
    let gapiInited = false;
    let gisInited = false;
    let accessToken = null;

    // --- Storage helpers ---
    function getClientId() { return localStorage.getItem('hp_gcal_client_id') || ''; }
    function getCalendarId() { return localStorage.getItem('hp_gcal_calendar_id') || 'primary'; }
    function getEventMap() {
        try { return JSON.parse(localStorage.getItem('hp_gcal_event_map') || '{}'); } catch { return {}; }
    }
    function setEventMap(map) { localStorage.setItem('hp_gcal_event_map', JSON.stringify(map)); }

    function restoreToken() {
        const t = sessionStorage.getItem('hp_gcal_token');
        const exp = parseInt(sessionStorage.getItem('hp_gcal_token_expiry') || '0');
        if (t && Date.now() < exp) { accessToken = t; return true; }
        accessToken = null;
        return false;
    }

    function storeToken(token, expiresIn) {
        accessToken = token;
        sessionStorage.setItem('hp_gcal_token', token);
        sessionStorage.setItem('hp_gcal_token_expiry', String(Date.now() + expiresIn * 1000));
    }

    function clearToken() {
        accessToken = null;
        sessionStorage.removeItem('hp_gcal_token');
        sessionStorage.removeItem('hp_gcal_token_expiry');
    }

    // --- Init ---
    async function init() {
        if (!getClientId()) { updateStatus('none'); return; }
        try {
            await loadGapi();
            initGis();
            if (restoreToken()) {
                updateStatus('connected');
            } else {
                updateStatus('disconnected');
            }
        } catch (err) {
            console.error('GCalSync init error:', err);
            updateStatus('error');
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

    function initGis() {
        if (gisInited) return;
        if (typeof google === 'undefined' || !google.accounts) return;
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: getClientId(),
            scope: SCOPES,
            callback: (resp) => {
                if (resp.error) {
                    console.error('GIS error:', resp);
                    showToast('Ошибка авторизации Google: ' + resp.error);
                    updateStatus('error');
                    return;
                }
                storeToken(resp.access_token, resp.expires_in);
                gapi.client.setToken({ access_token: resp.access_token });
                updateStatus('connected');
                showToast('Google Calendar подключён');
            },
        });
        gisInited = true;
    }

    // --- Auth ---
    function authorize() {
        const clientId = getClientId();
        if (!clientId) {
            showToast('Введите Client ID в Настройках');
            return;
        }
        // IMPORTANT: This function must be synchronous from user click to
        // requestAccessToken(), otherwise browser blocks the OAuth popup.
        // gapi should already be loaded by init() at page load.
        if (!gapiInited) {
            showToast('Google API ещё загружается, попробуйте через пару секунд');
            loadGapi().catch(() => {});
            return;
        }
        if (!gisInited) {
            gisInited = false;
            tokenClient = null;
            initGis();
        }
        if (!tokenClient) {
            showToast('Google Identity Services не загружен. Проверьте соединение.');
            return;
        }
        if (accessToken) {
            tokenClient.requestAccessToken({ prompt: '' });
        } else {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        }
    }

    function disconnect() {
        if (accessToken) {
            google.accounts.oauth2.revoke(accessToken, () => {});
        }
        clearToken();
        gapi.client.setToken(null);
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

    // --- API calls with retry on 401 ---
    async function apiCall(fn) {
        try {
            return await fn();
        } catch (err) {
            if (err.status === 401) {
                // Token expired — try silent refresh
                return new Promise((resolve, reject) => {
                    tokenClient.requestAccessToken({ prompt: '' });
                    // Wait for callback to fire, then retry
                    const check = setInterval(() => {
                        if (accessToken) {
                            clearInterval(check);
                            gapi.client.setToken({ access_token: accessToken });
                            fn().then(resolve).catch(reject);
                        }
                    }, 200);
                    setTimeout(() => { clearInterval(check); reject(err); }, 10000);
                });
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
                        // New external event — import it
                        const imported = gcalToCrm(gEv);
                        imported.id = Date.now() + Math.floor(Math.random() * 1000);
                        events.push(imported);
                        map[String(imported.id)] = gEv.id;
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
        const msg = `Синхронизация: +${pullResult.added} импорт, ${pullResult.updated} обновл., ${pushed} отправл.`;
        showToast(msg);

        return { ...pullResult, pushed };
    }

    // --- Re-init GIS if client ID changed ---
    function reinitGis() {
        gisInited = false;
        tokenClient = null;
        initGis();
    }

    return {
        init,
        authorize,
        disconnect,
        isConnected,
        pushEvent,
        deleteEvent,
        pullEvents,
        fullSync,
        updateStatus,
        reinitGis
    };
})();
