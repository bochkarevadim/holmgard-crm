// ===== GOOGLE SHEETS SYNC MODULE =====
const GSheetsSync = (() => {
    const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
    const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/sheets/v4/rest';

    let gapiInited = false;

    // --- Storage helpers ---
    function getSpreadsheetId() { return localStorage.getItem('hp_gsheets_id') || ''; }
    function setSpreadsheetId(id) { localStorage.setItem('hp_gsheets_id', id); }
    function getAutoSync() { return localStorage.getItem('hp_gsheets_autosync') !== 'false'; }

    // Use same token as GCalSync (shared OAuth)
    function getAccessToken() {
        return sessionStorage.getItem('hp_gcal_token') || null;
    }

    function isConnected() {
        return !!getAccessToken() && !!getSpreadsheetId();
    }

    // --- Init ---
    async function init() {
        if (!getSpreadsheetId()) { updateStatus('none'); return; }
        try {
            await loadGapi();
            if (getAccessToken()) {
                updateStatus('connected');
            } else {
                updateStatus('ready'); // Has spreadsheet ID but no OAuth — ready for CSV import
            }
        } catch (err) {
            // gapi not loaded (expected on some environments) — still functional with CSV import
            console.warn('GSheetsSync: gapi not available, CSV import still works');
            updateStatus('ready');
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

    // --- Status UI ---
    function updateStatus(state) {
        const dot = document.getElementById('gsheets-status-dot');
        const label = document.getElementById('gsheets-status-label');
        const btnConnect = document.getElementById('btn-connect-gsheets');
        if (!dot || !label) return;

        dot.className = 'gcal-status-dot gcal-status-' + state;
        const labels = {
            connected: 'Подключено (OAuth)',
            ready: 'Готово к импорту',
            disconnected: 'Отключено',
            error: 'Ошибка',
            none: 'Нет Spreadsheet ID',
            syncing: 'Синхронизация...'
        };
        label.textContent = labels[state] || state;

        if (btnConnect) {
            if (state === 'connected') {
                btnConnect.textContent = 'Синхронизировать';
                btnConnect.className = 'btn-primary btn-sm';
            } else if (state === 'ready') {
                btnConnect.textContent = 'Импортировать';
                btnConnect.className = 'btn-primary btn-sm';
            } else {
                btnConnect.textContent = 'Подключить';
                btnConnect.className = 'btn-secondary btn-sm';
            }
        }
    }

    // --- API helper ---
    async function apiCall(fn) {
        const token = getAccessToken();
        if (!token) throw new Error('Not authenticated');
        gapi.client.setToken({ access_token: token });
        try {
            return await fn();
        } catch (err) {
            if (err.status === 401) {
                // Token expired — notify
                updateStatus('disconnected');
                showToast('Токен Google истёк. Переподключите в Настройках.');
                throw err;
            }
            throw err;
        }
    }

    // --- Sheet helpers ---
    async function ensureSheets(sheetNames) {
        const ssId = getSpreadsheetId();
        const resp = await apiCall(() =>
            gapi.client.sheets.spreadsheets.get({ spreadsheetId: ssId })
        );
        const existing = resp.result.sheets.map(s => s.properties.title);
        const missing = sheetNames.filter(n => !existing.includes(n));

        if (missing.length > 0) {
            await apiCall(() =>
                gapi.client.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: ssId,
                    resource: {
                        requests: missing.map(title => ({
                            addSheet: { properties: { title } }
                        }))
                    }
                })
            );
        }
        return existing.concat(missing);
    }

    async function readSheet(sheetName) {
        const ssId = getSpreadsheetId();
        try {
            const resp = await apiCall(() =>
                gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: ssId,
                    range: sheetName
                })
            );
            return resp.result.values || [];
        } catch (err) {
            if (err.status === 400) return []; // Sheet empty
            throw err;
        }
    }

    async function writeSheet(sheetName, data) {
        const ssId = getSpreadsheetId();
        // Clear existing
        try {
            await apiCall(() =>
                gapi.client.sheets.spreadsheets.values.clear({
                    spreadsheetId: ssId,
                    range: sheetName
                })
            );
        } catch (e) { /* ignore if empty */ }

        if (data.length > 0) {
            await apiCall(() =>
                gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: ssId,
                    range: sheetName + '!A1',
                    valueInputOption: 'RAW',
                    resource: { values: data }
                })
            );
        }
    }

    // --- Data Mapping: CRM <-> Sheets ---

    // TARIFFS (services)
    function tariffsServicesToRows(tariffs) {
        const services = tariffs.filter(t => t.category === 'services');
        const header = ['service_id', 'category', 'name', 'base_price', 'duration_min', 'min_players', 'AGE', 'included', 'description', 'unit'];
        const rows = services.map(t => [
            t.serviceId || 'svc_' + t.id,
            t.sheetCategory || 'Услуга',
            t.name,
            t.price || 0,
            t.duration || 0,
            t.minPeople || 0,
            t.age || '',
            t.included || '',
            t.description || '',
            t.unit || 'чел'
        ]);
        return [header, ...rows];
    }

    function tariffsOptionsForGameToRows(tariffs) {
        const opts = tariffs.filter(t => t.category === 'optionsForGame');
        const header = ['service_id', 'category', 'name', 'base_price', 'quantity', 'unit of measurement', 'included', 'description'];
        const rows = opts.map(t => [
            t.serviceId || 'opt_' + t.id,
            t.sheetCategory || 'Доп. опции',
            t.name,
            t.price || 0,
            t.quantity || 1,
            t.unit || 'шт',
            t.included || '',
            t.description || ''
        ]);
        return [header, ...rows];
    }

    function tariffsOptionsToRows(tariffs) {
        const opts = tariffs.filter(t => t.category === 'options');
        const header = ['service_id', 'category', 'name', 'base_price', 'quantity', 'unit of measurement', 'included', 'description'];
        const rows = opts.map(t => [
            t.serviceId || 'opt_' + t.id,
            t.sheetCategory || 'Дополнительная опция',
            t.name,
            t.price || 0,
            t.quantity || 1,
            t.unit || 'шт',
            t.included || '',
            t.description || ''
        ]);
        return [header, ...rows];
    }

    function rowsToTariffs(servicesRows, optionsForGameRows, optionsRows) {
        const tariffs = [];
        let nextId = 1;

        // Parse services
        if (servicesRows.length > 1) {
            const headers = servicesRows[0];
            for (let i = 1; i < servicesRows.length; i++) {
                const row = servicesRows[i];
                if (!row || !row[0]) continue;
                const get = (name) => {
                    const idx = headers.indexOf(name);
                    return idx >= 0 ? (row[idx] || '') : '';
                };
                tariffs.push({
                    id: nextId++,
                    category: 'services',
                    serviceId: get('service_id'),
                    sheetCategory: get('category'),
                    name: get('name'),
                    price: parseFloat(get('base_price')) || 0,
                    unit: get('unit') || 'чел',
                    duration: parseInt(get('duration_min')) || 0,
                    minPeople: parseInt(get('min_players')) || 0,
                    age: get('AGE'),
                    included: get('included'),
                    description: get('description')
                });
            }
        }

        // Parse options for game
        if (optionsForGameRows.length > 1) {
            const headers = optionsForGameRows[0];
            for (let i = 1; i < optionsForGameRows.length; i++) {
                const row = optionsForGameRows[i];
                if (!row || !row[0]) continue;
                const get = (name) => {
                    const idx = headers.indexOf(name);
                    return idx >= 0 ? (row[idx] || '') : '';
                };
                tariffs.push({
                    id: nextId++,
                    category: 'optionsForGame',
                    serviceId: get('service_id'),
                    sheetCategory: get('category'),
                    name: get('name'),
                    price: parseFloat(get('base_price')) || 0,
                    quantity: parseInt(get('quantity')) || 1,
                    unit: get('unit of measurement') || 'шт',
                    included: get('included'),
                    description: get('description')
                });
            }
        }

        // Parse options
        if (optionsRows.length > 1) {
            const headers = optionsRows[0];
            for (let i = 1; i < optionsRows.length; i++) {
                const row = optionsRows[i];
                if (!row || !row[0]) continue;
                const get = (name) => {
                    const idx = headers.indexOf(name);
                    return idx >= 0 ? (row[idx] || '') : '';
                };
                tariffs.push({
                    id: nextId++,
                    category: 'options',
                    serviceId: get('service_id'),
                    sheetCategory: get('category'),
                    name: get('name'),
                    price: parseFloat(get('base_price')) || 0,
                    quantity: parseInt(get('quantity')) || 1,
                    unit: get('unit of measurement') || 'шт',
                    included: get('included'),
                    description: get('description')
                });
            }
        }

        return tariffs;
    }

    // EMPLOYEES
    function employeesToRows(employees) {
        const header = ['id', 'firstName', 'lastName', 'role', 'pin', 'phone', 'dob', 'passport', 'bank', 'paid', 'allowedShiftRoles'];
        const rows = employees.map(e => [
            e.id, e.firstName, e.lastName, e.role, e.pin,
            e.phone || '', e.dob || '', e.passport || '', e.bank || '', e.paid || 0,
            JSON.stringify(e.allowedShiftRoles || [])
        ]);
        return [header, ...rows];
    }

    function rowsToEmployees(data) {
        if (data.length < 2) return null;
        const headers = data[0];
        const employees = [];
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || !row[0]) continue;
            const get = (name) => {
                const idx = headers.indexOf(name);
                return idx >= 0 ? (row[idx] || '') : '';
            };
            const allowedRolesStr = get('allowedShiftRoles');
            let allowedShiftRoles;
            try { allowedShiftRoles = allowedRolesStr ? JSON.parse(allowedRolesStr) : null; } catch { allowedShiftRoles = null; }
            employees.push({
                id: parseInt(get('id')) || Date.now() + i,
                firstName: get('firstName'),
                lastName: get('lastName'),
                role: get('role') || 'instructor',
                pin: get('pin'),
                phone: get('phone'),
                dob: get('dob'),
                passport: get('passport'),
                bank: get('bank'),
                paid: parseFloat(get('paid')) || 0,
                allowedShiftRoles: allowedShiftRoles || undefined
            });
        }
        return employees.length > 0 ? employees : null;
    }

    // CLIENTS
    function clientsToRows(clients) {
        const header = ['id', 'firstName', 'lastName', 'phone', 'email', 'dob', 'notes', 'groldiks', 'totalSpent', 'visits'];
        const rows = clients.map(c => [
            c.id, c.firstName, c.lastName || '', c.phone || '', c.email || '',
            c.dob || '', c.notes || '', c.groldiks || 0, c.totalSpent || 0,
            JSON.stringify(c.visits || [])
        ]);
        return [header, ...rows];
    }

    function rowsToClients(data) {
        if (data.length < 2) return null;
        const headers = data[0];
        const clients = [];
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || !row[0]) continue;
            const get = (name) => {
                const idx = headers.indexOf(name);
                return idx >= 0 ? (row[idx] || '') : '';
            };
            let visits = [];
            try { visits = JSON.parse(get('visits') || '[]'); } catch {}
            clients.push({
                id: parseInt(get('id')) || Date.now() + i,
                firstName: get('firstName'),
                lastName: get('lastName'),
                phone: get('phone'),
                email: get('email'),
                dob: get('dob'),
                notes: get('notes'),
                groldiks: parseInt(get('groldiks')) || 0,
                totalSpent: parseFloat(get('totalSpent')) || 0,
                visits: visits
            });
        }
        return clients.length > 0 ? clients : null;
    }

    // EVENTS (orders)
    function eventsToRows(events) {
        const header = ['id', 'title', 'date', 'time', 'duration', 'type', 'occasion', 'playerAge',
            'participants', 'instructor', 'notes', 'price', 'status', 'prepayment', 'prepaymentDate',
            'selectedOptions', 'discount', 'tariffId', 'paymentDetails', 'completedAt', 'completedBy'];
        const rows = events.map(e => [
            e.id, e.title, e.date, e.time, e.duration || 60, e.type || '', e.occasion || '',
            e.playerAge || '', e.participants || 0, e.instructor || '', e.notes || '',
            e.price || 0, e.status || 'pending', e.prepayment || 0, e.prepaymentDate || '',
            JSON.stringify(e.selectedOptions || []), e.discount || 0, e.tariffId || '',
            JSON.stringify(e.paymentDetails || {}), e.completedAt || '', e.completedBy || ''
        ]);
        return [header, ...rows];
    }

    function rowsToEvents(data) {
        if (data.length < 2) return null;
        const headers = data[0];
        const events = [];
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || !row[0]) continue;
            const get = (name) => {
                const idx = headers.indexOf(name);
                return idx >= 0 ? (row[idx] || '') : '';
            };
            let selectedOptions = [];
            try { selectedOptions = JSON.parse(get('selectedOptions') || '[]'); } catch {}
            let paymentDetails = {};
            try { paymentDetails = JSON.parse(get('paymentDetails') || '{}'); } catch {}
            events.push({
                id: parseInt(get('id')) || Date.now() + i,
                title: get('title'),
                date: get('date'),
                time: get('time'),
                duration: parseInt(get('duration')) || 60,
                type: get('type'),
                occasion: get('occasion'),
                playerAge: get('playerAge'),
                participants: parseInt(get('participants')) || 0,
                instructor: parseInt(get('instructor')) || null,
                notes: get('notes'),
                price: parseFloat(get('price')) || 0,
                status: get('status') || 'pending',
                prepayment: parseFloat(get('prepayment')) || 0,
                prepaymentDate: get('prepaymentDate'),
                selectedOptions: selectedOptions,
                discount: parseFloat(get('discount')) || 0,
                tariffId: parseInt(get('tariffId')) || null,
                paymentDetails: paymentDetails,
                completedAt: get('completedAt'),
                completedBy: get('completedBy') ? parseInt(get('completedBy')) : null
            });
        }
        return events.length > 0 ? events : null;
    }

    // SHIFTS
    function shiftsToRows(shifts) {
        const header = ['id', 'employeeId', 'employeeName', 'employeeRole', 'shiftRole', 'date',
            'startTime', 'endTime', 'selectedEvents', 'earnings'];
        const rows = shifts.map(s => [
            s.id, s.employeeId, s.employeeName, s.employeeRole || '', s.shiftRole || '',
            s.date, s.startTime, s.endTime || '', JSON.stringify(s.selectedEvents || []),
            JSON.stringify(s.earnings || {})
        ]);
        return [header, ...rows];
    }

    function rowsToShifts(data) {
        if (data.length < 2) return null;
        const headers = data[0];
        const shifts = [];
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || !row[0]) continue;
            const get = (name) => {
                const idx = headers.indexOf(name);
                return idx >= 0 ? (row[idx] || '') : '';
            };
            let selectedEvents = [];
            try { selectedEvents = JSON.parse(get('selectedEvents') || '[]'); } catch {}
            let earnings = null;
            try { const e = JSON.parse(get('earnings') || '{}'); if (e && e.total !== undefined) earnings = e; } catch {}
            shifts.push({
                id: parseInt(get('id')) || Date.now() + i,
                employeeId: parseInt(get('employeeId')) || 0,
                employeeName: get('employeeName'),
                employeeRole: get('employeeRole'),
                shiftRole: get('shiftRole'),
                date: get('date'),
                startTime: get('startTime'),
                endTime: get('endTime') || null,
                selectedEvents: selectedEvents,
                earnings: earnings
            });
        }
        return shifts.length > 0 ? shifts : null;
    }

    // STOCK & SALARY RULES (config sheet)
    function configToRows(stock, salaryRules, loyaltyPercent) {
        return [
            ['key', 'value'],
            ['balls', stock.balls || 0],
            ['ballsMax', stock.ballsMax || 10000],
            ['grenades', stock.grenades || 0],
            ['grenadesMax', stock.grenadesMax || 500],
            ['instructor_shiftRate', salaryRules.instructor?.shiftRate || 0],
            ['instructor_bonusPercent', salaryRules.instructor?.bonusPercent || 0],
            ['instructor_bonusSources', JSON.stringify(salaryRules.instructor?.bonusSources || ['services', 'optionsForGame', 'options'])],
            ['senior_instructor_shiftRate', salaryRules.senior_instructor?.shiftRate || 0],
            ['senior_instructor_bonusPercent', salaryRules.senior_instructor?.bonusPercent || 0],
            ['senior_instructor_bonusSources', JSON.stringify(salaryRules.senior_instructor?.bonusSources || ['services', 'optionsForGame', 'options'])],
            ['admin_shiftRate', salaryRules.admin?.shiftRate || 0],
            ['admin_bonusPercent', salaryRules.admin?.bonusPercent || 0],
            ['admin_bonusSources', JSON.stringify(salaryRules.admin?.bonusSources || ['services', 'optionsForGame', 'options'])],
            ['loyaltyPercent', loyaltyPercent || 5]
        ];
    }

    function rowsToConfig(data) {
        if (data.length < 2) return null;
        const config = {};
        for (let i = 1; i < data.length; i++) {
            if (data[i] && data[i][0]) config[data[i][0]] = data[i][1] || '';
        }
        return {
            stock: {
                balls: parseInt(config.balls) || 0,
                ballsMax: parseInt(config.ballsMax) || 10000,
                grenades: parseInt(config.grenades) || 0,
                grenadesMax: parseInt(config.grenadesMax) || 500
            },
            salaryRules: {
                instructor: {
                    shiftRate: parseFloat(config.instructor_shiftRate) || 0,
                    bonusPercent: parseFloat(config.instructor_bonusPercent) || 0,
                    bonusSources: (() => { try { return JSON.parse(config.instructor_bonusSources || '[]'); } catch { return ['services', 'optionsForGame', 'options']; } })()
                },
                senior_instructor: {
                    shiftRate: parseFloat(config.senior_instructor_shiftRate) || 2000,
                    bonusPercent: parseFloat(config.senior_instructor_bonusPercent) || 7,
                    bonusSources: (() => { try { return JSON.parse(config.senior_instructor_bonusSources || '[]'); } catch { return ['services', 'optionsForGame', 'options']; } })()
                },
                admin: {
                    shiftRate: parseFloat(config.admin_shiftRate) || 0,
                    bonusPercent: parseFloat(config.admin_bonusPercent) || 0,
                    bonusSources: (() => { try { return JSON.parse(config.admin_bonusSources || '[]'); } catch { return ['services', 'optionsForGame', 'options']; } })()
                }
            },
            loyaltyPercent: parseInt(config.loyaltyPercent) || 5
        };
    }

    // --- FULL SYNC ---
    async function fullSync() {
        if (!isConnected()) {
            showToast('Google Таблицы не подключены');
            return null;
        }

        updateStatus('syncing');

        try {
            // Ensure all required sheets exist
            await ensureSheets(['services', 'options for game', 'options', 'crm_employees', 'crm_clients', 'crm_events', 'crm_shifts', 'crm_config']);

            // --- PULL: Read tariffs from existing sheets (services, options for game, options) ---
            const [servicesData, optForGameData, optData] = await Promise.all([
                readSheet('services'),
                readSheet('options for game'),
                readSheet('options')
            ]);

            // Import tariffs from Google Sheets
            if (servicesData.length > 1 || optForGameData.length > 1 || optData.length > 1) {
                const importedTariffs = rowsToTariffs(servicesData, optForGameData, optData);
                if (importedTariffs.length > 0) {
                    DB.set('tariffs', importedTariffs);
                }
            }

            // --- Read CRM data from sheets ---
            const [empData, clientData, eventData, shiftData, configData] = await Promise.all([
                readSheet('crm_employees'),
                readSheet('crm_clients'),
                readSheet('crm_events'),
                readSheet('crm_shifts'),
                readSheet('crm_config')
            ]);

            // Import CRM data (sheets -> local, only if sheets have data)
            const importedEmp = rowsToEmployees(empData);
            const importedClients = rowsToClients(clientData);
            const importedEvents = rowsToEvents(eventData);
            const importedShifts = rowsToShifts(shiftData);
            const importedConfig = rowsToConfig(configData);

            if (importedEmp) DB.set('employees', importedEmp);
            if (importedClients) DB.set('clients', importedClients);
            if (importedEvents) DB.set('events', importedEvents);
            if (importedShifts) DB.set('shifts', importedShifts);
            if (importedConfig) {
                DB.set('stock', importedConfig.stock);
                DB.set('salaryRules', importedConfig.salaryRules);
                DB.set('loyaltyPercent', importedConfig.loyaltyPercent);
            }

            // --- PUSH: Write CRM data back to sheets ---
            await pushAllData();

            updateStatus('connected');
            showToast('Google Таблицы синхронизированы');
            return true;

        } catch (err) {
            console.error('GSheetsSync error:', err);
            updateStatus('error');
            showToast('Ошибка синхронизации с Google Таблицами');
            return null;
        }
    }

    // --- PUSH all CRM data to sheets ---
    async function pushAllData() {
        if (!isConnected()) return;

        try {
            const tariffs = DB.get('tariffs', []);
            const employees = DB.get('employees', []);
            const clients = DB.get('clients', []);
            const events = DB.get('events', []);
            const shifts = DB.get('shifts', []);
            const stock = DB.get('stock', {});
            const salaryRules = DB.get('salaryRules', {});
            const loyaltyPercent = DB.get('loyaltyPercent', 5);

            await ensureSheets(['services', 'options for game', 'options', 'crm_employees', 'crm_clients', 'crm_events', 'crm_shifts', 'crm_config']);

            await Promise.all([
                writeSheet('services', tariffsServicesToRows(tariffs)),
                writeSheet('options for game', tariffsOptionsForGameToRows(tariffs)),
                writeSheet('options', tariffsOptionsToRows(tariffs)),
                writeSheet('crm_employees', employeesToRows(employees)),
                writeSheet('crm_clients', clientsToRows(clients)),
                writeSheet('crm_events', eventsToRows(events)),
                writeSheet('crm_shifts', shiftsToRows(shifts)),
                writeSheet('crm_config', configToRows(stock, salaryRules, loyaltyPercent))
            ]);

        } catch (err) {
            console.error('GSheetsSync push error:', err);
        }
    }

    // --- Quick push (after single data change) ---
    async function pushSection(section) {
        if (!isConnected() || !getAutoSync()) return;

        try {
            await ensureSheets(['services', 'options for game', 'options', 'crm_employees', 'crm_clients', 'crm_events', 'crm_shifts', 'crm_config']);

            switch (section) {
                case 'tariffs': {
                    const tariffs = DB.get('tariffs', []);
                    await Promise.all([
                        writeSheet('services', tariffsServicesToRows(tariffs)),
                        writeSheet('options for game', tariffsOptionsForGameToRows(tariffs)),
                        writeSheet('options', tariffsOptionsToRows(tariffs))
                    ]);
                    break;
                }
                case 'employees':
                    await writeSheet('crm_employees', employeesToRows(DB.get('employees', [])));
                    break;
                case 'clients':
                    await writeSheet('crm_clients', clientsToRows(DB.get('clients', [])));
                    break;
                case 'events':
                    await writeSheet('crm_events', eventsToRows(DB.get('events', [])));
                    break;
                case 'shifts':
                    await writeSheet('crm_shifts', shiftsToRows(DB.get('shifts', [])));
                    break;
                case 'config': {
                    const stock = DB.get('stock', {});
                    const salaryRules = DB.get('salaryRules', {});
                    const loyaltyPercent = DB.get('loyaltyPercent', 5);
                    await writeSheet('crm_config', configToRows(stock, salaryRules, loyaltyPercent));
                    break;
                }
            }
        } catch (err) {
            console.error('GSheetsSync push section error:', err);
        }
    }

    // --- PUBLIC CSV IMPORT (no OAuth needed, spreadsheet must be published to web) ---
    function parseCSV(text) {
        const rows = [];
        let inQuote = false, field = '', record = [];
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === '"') {
                if (inQuote && text[i + 1] === '"') { field += '"'; i++; }
                else inQuote = !inQuote;
            } else if (ch === ',' && !inQuote) {
                record.push(field); field = '';
            } else if ((ch === '\n' || ch === '\r') && !inQuote) {
                if (field || record.length > 0) { record.push(field); rows.push(record); record = []; field = ''; }
            } else {
                field += ch;
            }
        }
        if (field || record.length > 0) { record.push(field); rows.push(record); }
        return rows.filter(r => r[0] && r[0] !== '');
    }

    async function importFromPublicCSV() {
        const ssId = getSpreadsheetId();
        if (!ssId) { showToast('Введите Spreadsheet ID в Настройках'); return null; }

        updateStatus('syncing');
        const baseUrl = `https://docs.google.com/spreadsheets/d/${ssId}/gviz/tq?tqx=out:csv&sheet=`;

        try {
            const [servResp, ofgResp, optResp] = await Promise.all([
                fetch(baseUrl + encodeURIComponent('services')),
                fetch(baseUrl + encodeURIComponent('options for game')),
                fetch(baseUrl + encodeURIComponent('options'))
            ]);

            if (!servResp.ok && servResp.status === 401) {
                updateStatus('disconnected');
                showToast('Таблица не опубликована. Опубликуйте через Файл → Опубликовать в интернете, или подключите Google аккаунт.');
                return null;
            }

            const [servText, ofgText, optText] = await Promise.all([
                servResp.text(), ofgResp.text(), optResp.text()
            ]);

            const servRows = parseCSV(servText);
            const ofgRows = parseCSV(ofgText);
            const optRows = parseCSV(optText);

            if (servRows.length > 1 || ofgRows.length > 1 || optRows.length > 1) {
                const importedTariffs = rowsToTariffs(servRows, ofgRows, optRows);
                if (importedTariffs.length > 0) {
                    DB.set('tariffs', importedTariffs);
                    updateStatus('connected');
                    showToast(`Импортировано ${importedTariffs.length} тарифов из Google Таблицы`);
                    return importedTariffs;
                }
            }

            updateStatus('disconnected');
            showToast('Таблица пуста или недоступна');
            return null;

        } catch (err) {
            console.error('CSV import error:', err);
            updateStatus('error');
            showToast('Ошибка импорта из Google Таблицы: ' + (err.message || err));
            return null;
        }
    }

    // --- Get scope string (for OAuth) ---
    function getScope() {
        return SCOPES;
    }

    return {
        init,
        isConnected,
        fullSync,
        pushAllData,
        pushSection,
        updateStatus,
        getSpreadsheetId,
        setSpreadsheetId,
        getScope,
        getAutoSync,
        importFromPublicCSV
    };
})();
