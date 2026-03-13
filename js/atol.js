/**
 * ATOL Online Integration Module — HOLMGARD PARK CRM
 * Облачная фискализация чеков через ATOL Online API v4
 *
 * Использует Cloudflare Worker как CORS-прокси.
 * Паттерн аналогичен gsheets.js / gcal.js.
 */

const AtolOnline = (() => {
    'use strict';

    // --- Config keys (localStorage, prefix hp_) ---
    const KEYS = {
        login:          'atol_login',
        password:       'atol_password',
        groupCode:      'atol_group_code',
        inn:            'atol_inn',
        paymentAddress: 'atol_payment_address',
        companyEmail:   'atol_company_email',
        sno:            'atol_sno',
        proxyUrl:       'atol_proxy_url',
        receipts:       'atol_receipts'
    };
    const TOKEN_KEY = 'hp_atol_token';
    const TOKEN_EXPIRY_KEY = 'hp_atol_token_expiry';
    const TOKEN_LIFETIME = 24 * 60 * 60 * 1000; // 24 hours

    // SNO types
    const SNO_OPTIONS = [
        { value: 'osn',                label: 'ОСН (общая)' },
        { value: 'usn_income',         label: 'УСН Доход' },
        { value: 'usn_income_outcome', label: 'УСН Доход-Расход' },
        { value: 'envd',               label: 'ЕНВД' },
        { value: 'esn',                label: 'ЕСН' },
        { value: 'patent',             label: 'Патент' }
    ];

    // Payment types ATOL
    const PAYMENT_TYPES = {
        cash: 1,        // Наличные
        card: 2,        // Безналичные (карта)
        transfer: 2,    // Безналичные (перевод)
        qr: 2           // Безналичные (QR)
    };

    let config = {};

    // --- Helpers ---
    function getLS(key) {
        try {
            const v = localStorage.getItem('hp_' + key);
            return v ? JSON.parse(v) : null;
        } catch { return null; }
    }

    function setLS(key, val) {
        localStorage.setItem('hp_' + key, JSON.stringify(val));
    }

    function formatTimestamp(date) {
        const d = date || new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    // --- Init ---
    function init() {
        config = {
            login:          getLS(KEYS.login) || '',
            password:       getLS(KEYS.password) || '',
            groupCode:      getLS(KEYS.groupCode) || '',
            inn:            getLS(KEYS.inn) || '',
            paymentAddress: getLS(KEYS.paymentAddress) || '',
            companyEmail:   getLS(KEYS.companyEmail) || '',
            sno:            getLS(KEYS.sno) || 'usn_income',
            proxyUrl:       getLS(KEYS.proxyUrl) || ''
        };
        updateStatusUI();
        console.log('AtolOnline: init, configured =', isConfigured());
    }

    function saveConfig(cfg) {
        Object.keys(cfg).forEach(k => {
            if (KEYS[k]) {
                config[k] = cfg[k];
                setLS(KEYS[k], cfg[k]);
            }
        });
    }

    function isConfigured() {
        return !!(config.login && config.password && config.groupCode &&
                  config.inn && config.proxyUrl);
    }

    function isConnected() {
        if (!isConfigured()) return false;
        const token = sessionStorage.getItem(TOKEN_KEY);
        const expiry = parseInt(sessionStorage.getItem(TOKEN_EXPIRY_KEY) || '0');
        return !!(token && Date.now() < expiry);
    }

    // --- Status UI ---
    function updateStatusUI(state) {
        const dot = document.getElementById('atol-status-dot');
        const label = document.getElementById('atol-status-label');
        const btnConnect = document.getElementById('btn-connect-atol');
        if (!dot || !label) return;

        if (!state) {
            if (isConnected()) state = 'connected';
            else if (isConfigured()) state = 'configured';
            else state = 'none';
        }

        dot.className = 'gcal-status-dot gcal-status-' + (state === 'configured' ? 'error' : state === 'connected' ? 'connected' : 'none');
        const labels = {
            connected:  'Подключено',
            configured: 'Настроено (нет токена)',
            error:      'Ошибка',
            none:       'Не настроено'
        };
        label.textContent = labels[state] || state;

        if (btnConnect) {
            btnConnect.textContent = isConnected() ? 'Переподключить' : 'Подключить';
        }
    }

    // --- API calls ---
    async function apiCall(path, method = 'POST', body = null, token = null) {
        if (!config.proxyUrl) throw new Error('URL прокси не указан');

        const url = config.proxyUrl.replace(/\/+$/, '') + path;
        const headers = { 'Content-Type': 'application/json; charset=utf-8' };
        if (token) headers['Token'] = token;

        const opts = { method, headers };
        if (body && method === 'POST') opts.body = JSON.stringify(body);

        const resp = await fetch(url, opts);
        const data = await resp.json();

        if (!resp.ok && !data.uuid) {
            throw { status: resp.status, message: data.error?.text || data.error?.message || JSON.stringify(data), data };
        }
        return data;
    }

    // --- Auth ---
    async function getToken() {
        if (!config.login || !config.password) {
            throw new Error('Логин и пароль ATOL не указаны');
        }

        const data = await apiCall('/v4/getToken', 'POST', {
            login: config.login,
            pass: config.password
        });

        if (data.error) {
            updateStatusUI('error');
            throw new Error('ATOL Auth error: ' + (data.error.text || JSON.stringify(data.error)));
        }

        const token = data.token;
        sessionStorage.setItem(TOKEN_KEY, token);
        sessionStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + TOKEN_LIFETIME));

        updateStatusUI('connected');
        console.log('AtolOnline: token received');
        return token;
    }

    async function ensureToken() {
        if (isConnected()) {
            return sessionStorage.getItem(TOKEN_KEY);
        }
        return await getToken();
    }

    async function disconnect() {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
        updateStatusUI('configured');
    }

    // --- Receipt operations ---
    async function sell(receipt) {
        const token = await ensureToken();
        const data = await apiCall(`/v4/${config.groupCode}/sell`, 'POST', receipt, token);
        saveReceipt('sell', receipt, data);
        return data;
    }

    async function sellRefund(receipt) {
        const token = await ensureToken();
        const data = await apiCall(`/v4/${config.groupCode}/sell_refund`, 'POST', receipt, token);
        saveReceipt('sell_refund', receipt, data);
        return data;
    }

    async function sellCorrection(receipt) {
        const token = await ensureToken();
        const data = await apiCall(`/v4/${config.groupCode}/sell_correction`, 'POST', receipt, token);
        saveReceipt('sell_correction', receipt, data);
        return data;
    }

    // --- Status polling ---
    async function getStatus(uuid) {
        const token = await ensureToken();
        return await apiCall(`/v4/${config.groupCode}/report/${uuid}`, 'GET', null, token);
    }

    async function pollStatus(uuid, maxWait = 60000) {
        const start = Date.now();
        while (Date.now() - start < maxWait) {
            try {
                const data = await getStatus(uuid);
                if (data.status === 'done' || data.status === 'fail') {
                    updateReceiptStatus(uuid, data);
                    return data;
                }
            } catch (e) {
                console.warn('AtolOnline: poll error', e);
            }
            await new Promise(r => setTimeout(r, 3000)); // poll every 3 sec
        }
        return { status: 'timeout', uuid };
    }

    // --- Receipt builders ---
    function buildReceipt(event, clientEmail) {
        const items = [];
        const allTariffs = typeof DB !== 'undefined' ? DB.get('tariffs', []) : [];

        // Main service
        const tariff = allTariffs.find(t => t.id === event.tariffId);
        if (tariff) {
            const price = parseFloat(tariff.base_price || tariff.price || 0);
            const qty = event.participants || 1;
            items.push({
                name: tariff.name + ' (' + qty + ' чел)',
                price: price,
                quantity: qty,
                sum: +(price * qty).toFixed(2),
                payment_method: 'full_payment',
                payment_object: 'service',
                vat: { type: 'none' }
            });
        }

        // Selected options
        if (event.selectedOptions && event.selectedOptions.length > 0) {
            event.selectedOptions.forEach(optId => {
                const opt = allTariffs.find(t => t.id === optId);
                if (opt) {
                    const optPrice = parseFloat(opt.base_price || opt.price || 0);
                    const isPerPlayer = opt.unit === 'чел' || opt.sheetCategory === 'optionsForGame';
                    const qty = isPerPlayer ? (event.participants || 1) : 1;
                    items.push({
                        name: opt.name,
                        price: optPrice,
                        quantity: qty,
                        sum: +(optPrice * qty).toFixed(2),
                        payment_method: 'full_payment',
                        payment_object: 'service',
                        vat: { type: 'none' }
                    });
                }
            });
        }

        // If no items from tariffs, use event price directly
        if (items.length === 0 && event.price) {
            items.push({
                name: event.title || 'Услуга',
                price: parseFloat(event.price),
                quantity: 1,
                sum: parseFloat(event.price),
                payment_method: 'full_payment',
                payment_object: 'service',
                vat: { type: 'none' }
            });
        }

        const total = items.reduce((s, i) => s + i.sum, 0);

        // Apply discount
        const discount = event.discount || 0;
        const finalTotal = +(total * (1 - discount / 100)).toFixed(2);
        if (discount > 0 && items.length > 0) {
            // Distribute discount proportionally
            const ratio = finalTotal / total;
            items.forEach(item => {
                item.sum = +(item.sum * ratio).toFixed(2);
                item.price = +(item.sum / item.quantity).toFixed(2);
            });
        }

        // Payments
        const payments = buildPayments(event.paymentDetails, finalTotal);

        return {
            external_id: 'evt_' + event.id + '_' + Date.now(),
            timestamp: formatTimestamp(new Date()),
            receipt: {
                client: {
                    email: clientEmail || undefined
                },
                company: {
                    email: config.companyEmail || 'holmgardpark@gmail.com',
                    sno: config.sno || 'usn_income',
                    inn: config.inn,
                    payment_address: config.paymentAddress || 'https://holmgardpark.ru'
                },
                items: items,
                payments: payments,
                total: finalTotal
            }
        };
    }

    function buildRefund(event, clientEmail) {
        // Build same receipt as sell, but for refund
        const receipt = buildReceipt(event, clientEmail);
        receipt.external_id = 'ref_' + event.id + '_' + Date.now();
        return receipt;
    }

    function buildCorrectionReceipt(correctionData) {
        return {
            external_id: 'cor_' + Date.now(),
            timestamp: formatTimestamp(new Date()),
            correction: {
                company: {
                    sno: config.sno || 'usn_income',
                    inn: config.inn,
                    payment_address: config.paymentAddress
                },
                correction_info: {
                    type: correctionData.type || 'self', // self | instruction
                    base_date: correctionData.baseDate,
                    base_number: correctionData.baseNumber || '',
                    base_name: correctionData.description || 'Коррекция'
                },
                payments: [
                    { type: correctionData.paymentType || 1, sum: correctionData.amount }
                ],
                vats: [
                    { type: 'none', sum: correctionData.amount }
                ]
            }
        };
    }

    function buildPayments(paymentDetails, total) {
        if (!paymentDetails) return [{ type: 1, sum: total }];

        const method = paymentDetails.method;
        if (method === 'combo' && paymentDetails.combo) {
            const payments = [];
            const c = paymentDetails.combo;
            if (c.cash > 0) payments.push({ type: 1, sum: +c.cash.toFixed(2) });
            const nonCash = (c.card || 0) + (c.transfer || 0) + (c.qr || 0);
            if (nonCash > 0) payments.push({ type: 2, sum: +nonCash.toFixed(2) });
            return payments.length > 0 ? payments : [{ type: 1, sum: total }];
        }

        const type = PAYMENT_TYPES[method] || 1;
        return [{ type, sum: total }];
    }

    // --- Receipt storage ---
    function getReceipts() {
        return getLS(KEYS.receipts) || [];
    }

    function saveReceipt(type, receipt, response) {
        const receipts = getReceipts();
        receipts.push({
            uuid: response.uuid,
            type: type,
            externalId: receipt.external_id,
            amount: receipt.receipt?.total || receipt.correction?.payments?.[0]?.sum || 0,
            status: response.status || 'wait',
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString('ru-RU'),
            time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            eventId: null, // set by caller
            payload: null
        });
        setLS(KEYS.receipts, receipts);

        // Also trigger gsheets sync
        if (typeof DB !== 'undefined') {
            DB.set('atol_receipts', receipts);
        }
    }

    function updateReceiptStatus(uuid, statusData) {
        const receipts = getReceipts();
        const idx = receipts.findIndex(r => r.uuid === uuid);
        if (idx >= 0) {
            receipts[idx].status = statusData.status;
            if (statusData.payload) {
                receipts[idx].payload = {
                    fiscalDocumentNumber: statusData.payload?.fiscal_document_number,
                    fiscalDocumentAttribute: statusData.payload?.fiscal_document_attribute,
                    fnNumber: statusData.payload?.fn_number,
                    ofdUrl: statusData.payload?.ofd_receipt_url || null,
                    total: statusData.payload?.total
                };
            }
            setLS(KEYS.receipts, receipts);
            if (typeof DB !== 'undefined') {
                DB.set('atol_receipts', receipts);
            }
        }
    }

    function setReceiptEventId(uuid, eventId) {
        const receipts = getReceipts();
        const idx = receipts.findIndex(r => r.uuid === uuid);
        if (idx >= 0) {
            receipts[idx].eventId = eventId;
            setLS(KEYS.receipts, receipts);
        }
    }

    // --- Test receipt ---
    async function sendTestReceipt() {
        const testReceipt = {
            external_id: 'test_' + Date.now(),
            timestamp: formatTimestamp(new Date()),
            receipt: {
                client: { email: config.companyEmail || 'test@test.ru' },
                company: {
                    email: config.companyEmail || 'test@test.ru',
                    sno: config.sno || 'usn_income',
                    inn: config.inn,
                    payment_address: config.paymentAddress || 'test'
                },
                items: [{
                    name: 'Тестовый чек',
                    price: 1.00,
                    quantity: 1,
                    sum: 1.00,
                    payment_method: 'full_payment',
                    payment_object: 'service',
                    vat: { type: 'none' }
                }],
                payments: [{ type: 1, sum: 1.00 }],
                total: 1.00
            }
        };

        const result = await sell(testReceipt);
        return result;
    }

    // --- Public API ---
    return {
        init,
        saveConfig,
        isConfigured,
        isConnected,
        getToken,
        ensureToken,
        disconnect,
        sell,
        sellRefund,
        sellCorrection,
        getStatus,
        pollStatus,
        buildReceipt,
        buildRefund,
        buildCorrectionReceipt,
        setReceiptEventId,
        getReceipts,
        updateStatusUI,
        sendTestReceipt,
        SNO_OPTIONS,
        KEYS
    };
})();
