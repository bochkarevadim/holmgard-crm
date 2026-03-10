/* ============================
   HOLMGARD PARK CRM — APP
   ============================ */

// ===== HELPERS =====
function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDuration(min) {
    if (!min) return '—';
    if (min < 60) return min + ' мин';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} ч ${m} мин` : `${h} ч`;
}

// ===== DATA LAYER =====
const DB = {
    get(key, fallback = null) {
        try {
            const d = localStorage.getItem('hp_' + key);
            return d ? JSON.parse(d) : fallback;
        } catch { return fallback; }
    },
    set(key, val) {
        localStorage.setItem('hp_' + key, JSON.stringify(val));
    },
    remove(key) {
        localStorage.removeItem('hp_' + key);
    }
};

// ===== INITIAL DATA =====
function initData() {
    if (!DB.get('initialized')) {
        DB.set('employees', [
            {
                id: 1, firstName: 'Вадим', lastName: 'Бочкарёв', role: 'director',
                pin: '1111', phone: '+7 (900) 111-11-11', dob: '1985-06-15',
                passport: '', bank: '', paid: 100000
            },
            {
                id: 2, firstName: 'Анна', lastName: 'Смирнова', role: 'admin',
                pin: '2222', phone: '+7 (900) 222-22-22', dob: '1992-03-20',
                passport: '', bank: '', paid: 60000
            },
            {
                id: 3, firstName: 'Максим', lastName: 'Волков', role: 'instructor',
                pin: '3333', phone: '+7 (900) 333-33-33', dob: '1995-09-10',
                passport: '', bank: '', paid: 30000
            },
            {
                id: 4, firstName: 'Дмитрий', lastName: 'Козлов', role: 'instructor',
                pin: '4444', phone: '+7 (900) 444-44-44', dob: '1998-12-05',
                passport: '', bank: '', paid: 50000
            }
        ]);

        const today = todayLocal();
        DB.set('events', [
            { id: 1, title: 'Корпоратив «Альфа-Банк»', date: today, time: '10:00', duration: 120, type: 'corporate', occasion: 'corporate', playerAge: '25-45', participants: 25, instructor: 3, notes: 'VIP клиент', price: 75000, status: 'confirmed', prepayment: 30000, prepaymentDate: '2026-03-01', selectedOptions: [], discount: 0 },
            { id: 2, title: 'День рождения Артёма', date: today, time: '14:00', duration: 90, type: 'birthday', occasion: 'birthday', playerAge: '10-14', participants: 12, instructor: 4, notes: 'Заказан торт', price: 24000, status: 'confirmed', prepayment: 10000, prepaymentDate: '2026-03-03', selectedOptions: [5, 7], discount: 0 },
            { id: 3, title: 'Пейнтбол для друзей', date: today, time: '17:00', duration: 60, type: 'paintball', occasion: 'friends', playerAge: '18-30', participants: 8, instructor: 3, notes: '', price: 16000, status: 'pending', prepayment: 0, prepaymentDate: '', selectedOptions: [5], discount: 10 }
        ]);

        DB.set('clients', [
            { id: 1, firstName: 'Алексей', lastName: 'Петров', phone: '+7 (916) 555-12-34', email: 'petrov@mail.ru', dob: '1990-04-12', notes: 'Постоянный клиент', groldiks: 1250, totalSpent: 45000, visits: [
                { date: '2026-02-15', game: 'Пейнтбол', amount: 3500 },
                { date: '2026-01-20', game: 'Лазертаг', amount: 2800 }
            ]},
            { id: 2, firstName: 'Мария', lastName: 'Иванова', phone: '+7 (926) 777-88-99', email: '', dob: '', notes: '', groldiks: 480, totalSpent: 12000, visits: [
                { date: '2026-03-01', game: 'Квест', amount: 4000 }
            ]},
            { id: 3, firstName: 'Сергей', lastName: 'Николаев', phone: '+7 (905) 123-45-67', email: 'serg@gmail.com', dob: '1988-11-30', notes: 'Приводит друзей', groldiks: 3200, totalSpent: 87000, visits: [
                { date: '2026-03-03', game: 'Корпоратив', amount: 15000 },
                { date: '2026-02-10', game: 'Пейнтбол', amount: 5000 }
            ]}
        ]);

        DB.set('shifts', []);
        DB.set('salaryRules', {
            instructor: { shiftRate: 1500, bonusPercent: 5 },
            admin: { shiftRate: 0, bonusPercent: 5 }
        });
        DB.set('stock', { balls: 4500, ballsMax: 10000, grenades: 120, grenadesMax: 500 });
        DB.set('loyaltyPercent', 5);
        DB.set('finances', {
            income: 847000, expense: 312000, cash: 125000,
            shifts: [
                { date: '2026-03-05', employee: 'Анна Смирнова', start: '09:00', end: '18:00', hours: 9 },
                { date: '2026-03-04', employee: 'Максим Волков', start: '10:00', end: '19:00', hours: 9 },
            ],
            receipts: [
                { id: 'R-001', date: '2026-03-05', time: '10:45', amount: 75000, type: 'Корпоратив', status: 'Оплачен' },
                { id: 'R-002', date: '2026-03-05', time: '14:30', amount: 24000, type: 'День рождения', status: 'Оплачен' },
                { id: 'R-003', date: '2026-03-04', time: '16:00', amount: 16000, type: 'Пейнтбол', status: 'Возврат' },
            ],
            orders: [
                { id: 'O-001', date: '2026-03-05', client: 'Алексей Петров', service: 'Пейнтбол', amount: 3500, status: 'Завершён' },
                { id: 'O-002', date: '2026-03-05', client: 'ООО Альфа-Банк', service: 'Корпоратив', amount: 75000, status: 'В процессе' },
            ],
            cashOps: [
                { date: '2026-03-05', time: '09:00', type: 'Внесение', amount: 50000, note: 'Размен' },
                { date: '2026-03-05', time: '18:00', type: 'Изъятие', amount: 30000, note: 'Инкассация' },
            ]
        });
        DB.set('documents', [
            { id: 1, type: 'incoming', date: '2026-03-03', item: 'Пейнтбольные шары', qty: 5000, amount: 25000, comment: 'Поставщик: ПейнтПро' },
            { id: 2, type: 'writeoff', date: '2026-03-04', item: 'Гранаты дымовые', qty: 20, amount: 4000, comment: 'Бракованная партия' },
            { id: 3, type: 'inventory', date: '2026-03-01', item: 'Общая инвентаризация', qty: 0, amount: 0, comment: 'Результаты совпали с учётом' },
        ]);

        DB.set('tariffs', [
            { id: 1, category: 'services', name: 'Пейнтбол классический', price: 1500, unit: 'чел', duration: 60, minPeople: 6, description: 'Классическая игра в пейнтбол. Включает: маска, маркер, 100 шаров' },
            { id: 2, category: 'services', name: 'Пейнтбол LOW IMPACT', price: 1200, unit: 'чел', duration: 60, minPeople: 4, description: 'Мягкие калиберные шары. Идеально для детей и новичков' },
            { id: 3, category: 'services', name: 'Лазертаг', price: 1000, unit: 'чел', duration: 60, minPeople: 4, description: 'Лазерные бои на открытой площадке или в закрытом помещении' },
            { id: 4, category: 'services', name: 'Квест', price: 3000, unit: 'команда', duration: 60, minPeople: 2, description: 'Квест-комната с различными сценариями' },
            { id: 5, category: 'optionsForGame', name: 'Граната пейнтбольная', price: 300, unit: 'шт', duration: 0, minPeople: 0, description: 'Пейнтбольная граната для игры' },
            { id: 6, category: 'optionsForGame', name: 'Дымовая шашка', price: 500, unit: 'шт', duration: 0, minPeople: 0, description: 'Цветной дым для тактических задач' },
            { id: 7, category: 'options', name: 'Беседка', price: 2000, unit: 'аренда', duration: 120, minPeople: 0, description: 'Крытая беседка на 20 человек' },
            { id: 8, category: 'options', name: 'Банкетный зал', price: 5000, unit: 'аренда', duration: 180, minPeople: 0, description: 'Зал на 40 человек с посудой' },
            { id: 9, category: 'options', name: 'Фото/видеосъёмка', price: 3000, unit: 'услуга', duration: 0, minPeople: 0, description: 'Профессиональная съёмка мероприятия' },
        ]);

        DB.set('accentColor', '#FFD600');
        DB.set('initialized', true);
    }

    // Data migration: ensure tariffs exist (for upgrades from older versions)
    if (DB.get('tariffs', []).length === 0) {
        DB.set('tariffs', [
            { id: 1, category: 'services', name: 'Пейнтбол классический', price: 1500, unit: 'чел', duration: 60, minPeople: 6, description: 'Классическая игра в пейнтбол. Включает: маска, маркер, 100 шаров' },
            { id: 2, category: 'services', name: 'Пейнтбол LOW IMPACT', price: 1200, unit: 'чел', duration: 60, minPeople: 4, description: 'Мягкие калиберные шары. Идеально для детей и новичков' },
            { id: 3, category: 'services', name: 'Лазертаг', price: 1000, unit: 'чел', duration: 60, minPeople: 4, description: 'Лазерные бои на открытой площадке' },
            { id: 4, category: 'services', name: 'Квест', price: 3000, unit: 'команда', duration: 60, minPeople: 2, description: 'Квест-комната с различными сценариями' },
            { id: 5, category: 'optionsForGame', name: 'Граната пейнтбольная', price: 300, unit: 'шт', duration: 0, minPeople: 0, description: 'Пейнтбольная граната для игры' },
            { id: 6, category: 'optionsForGame', name: 'Дымовая шашка', price: 500, unit: 'шт', duration: 0, minPeople: 0, description: 'Цветной дым для тактических задач' },
            { id: 7, category: 'options', name: 'Беседка', price: 2000, unit: 'аренда', duration: 120, minPeople: 0, description: 'Крытая беседка на 20 человек' },
            { id: 8, category: 'options', name: 'Банкетный зал', price: 5000, unit: 'аренда', duration: 180, minPeople: 0, description: 'Зал на 40 человек с посудой' },
            { id: 9, category: 'options', name: 'Фото/видеосъёмка', price: 3000, unit: 'услуга', duration: 0, minPeople: 0, description: 'Профессиональная съёмка мероприятия' },
        ]);
    }
}

// ===== STATE =====
let currentUser = null;
let currentPin = '';
let calendarDate = new Date();
let empCalendarDate = new Date();
let selectedCalDay = null;
let empSelectedCalDay = null;
let revenueChart = null;
let servicesChart = null;
let shiftTimerInterval = null;
let pendingShiftRole = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    initData();
    initPinPad();
    initNavigation();
    initEmployeeNavigation();
    initEmployees();
    initSchedule();
    initFinances();
    initDocuments();
    initClients();
    initSettings();
    initEmployeeScreen();
    updateDate();
    applyAccentColor(DB.get('accentColor', '#FFD600'));
    GCalSync.init();
});

// ===== PIN PAD =====
function initPinPad() {
    document.querySelectorAll('.pin-btn[data-digit]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentPin.length >= 4) return;
            currentPin += btn.dataset.digit;
            updatePinDots();
            if (currentPin.length === 4) {
                setTimeout(() => attemptLogin(), 200);
            }
        });
    });

    document.getElementById('pin-backspace').addEventListener('click', () => {
        currentPin = currentPin.slice(0, -1);
        updatePinDots();
        document.getElementById('pin-message').textContent = 'Введите ПИН-код';
        document.getElementById('pin-message').className = 'pin-label';
    });

    document.addEventListener('keydown', (e) => {
        if (!document.getElementById('login-screen').classList.contains('active')) return;
        if (e.key >= '0' && e.key <= '9' && currentPin.length < 4) {
            currentPin += e.key;
            updatePinDots();
            if (currentPin.length === 4) setTimeout(() => attemptLogin(), 200);
        }
        if (e.key === 'Backspace') {
            currentPin = currentPin.slice(0, -1);
            updatePinDots();
        }
    });
}

function updatePinDots() {
    document.querySelectorAll('.pin-dot').forEach((dot, i) => {
        dot.classList.toggle('filled', i < currentPin.length);
        dot.classList.remove('error');
    });
}

function attemptLogin() {
    const employees = DB.get('employees', []);
    const user = employees.find(e => e.pin === currentPin);

    if (user) {
        currentUser = user;
        showToast(`Добро пожаловать, ${user.firstName}!`);
        if (user.role === 'director') {
            showScreen('app-screen');
            document.getElementById('director-name').textContent = user.firstName + ' ' + user.lastName;
            navigateTo('dashboard');
        } else {
            showScreen('employee-screen');
            setupEmployeeScreen(user);
            empNavigateTo('emp-dashboard');
        }
    } else {
        document.querySelectorAll('.pin-dot').forEach(d => d.classList.add('error'));
        document.getElementById('pin-message').textContent = 'Неверный ПИН-код';
        document.getElementById('pin-message').className = 'pin-label error';
        setTimeout(() => {
            currentPin = '';
            updatePinDots();
        }, 800);
        return;
    }
    currentPin = '';
    updatePinDots();
}

// ===== SCREENS =====
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function logout() {
    currentUser = null;
    currentPin = '';
    if (shiftTimerInterval) { clearInterval(shiftTimerInterval); shiftTimerInterval = null; }
    updatePinDots();
    showScreen('login-screen');
    document.getElementById('pin-message').textContent = 'Введите ПИН-код';
    document.getElementById('pin-message').className = 'pin-label';
}

// ===== EMPLOYEE SCREEN SETUP =====
function setupEmployeeScreen(user) {
    document.getElementById('emp-user-name').textContent = user.firstName + ' ' + user.lastName;
    document.getElementById('emp-dash-name').textContent = user.firstName + ' ' + user.lastName;
    const empDate = document.getElementById('emp-top-bar-date');
    if (empDate) {
        empDate.textContent = new Date().toLocaleDateString('ru-RU', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    }
    loadEmployeeDashboard();
}

function loadEmployeeDashboard() {
    if (!currentUser) return;
    const todayStr = todayLocal();
    const shifts = DB.get('shifts', []);
    const todayShift = shifts.find(s => s.date === todayStr && s.employeeId === currentUser.id);

    const btnStart = document.getElementById('emp-btn-start-work');
    const btnFinish = document.getElementById('emp-btn-finish-work');
    const btnDone = document.getElementById('emp-btn-shift-done');
    const shiftInfo = document.getElementById('emp-shift-info');
    const shiftStatus = document.getElementById('emp-shift-status');
    const statusText = document.getElementById('emp-shift-status-text');
    const shiftBadge = document.getElementById('emp-shift-badge');
    const selectedEventsDiv = document.getElementById('emp-selected-events');
    const roleText = document.getElementById('emp-dash-role');

    btnStart.style.display = 'none';
    btnFinish.style.display = 'none';
    btnDone.style.display = 'none';
    shiftInfo.style.display = 'none';
    selectedEventsDiv.style.display = 'none';
    shiftBadge.style.display = 'none';
    document.getElementById('emp-earnings-row').style.display = 'none';
    document.getElementById('emp-earnings-detail').style.display = 'none';

    if (todayShift) {
        const shiftRoleName = todayShift.shiftRole === 'admin' ? 'Администратор' : 'Инструктор';
        roleText.textContent = shiftRoleName;
        shiftInfo.style.display = 'block';
        document.getElementById('emp-shift-start-time').textContent = todayShift.startTime;

        if (todayShift.endTime) {
            // Shift ended
            document.getElementById('emp-shift-end-row').style.display = 'flex';
            document.getElementById('emp-shift-end-time').textContent = todayShift.endTime;
            btnDone.style.display = 'flex';
            shiftStatus.className = 'shift-status ended';
            statusText.textContent = 'Смена завершена';
            shiftBadge.style.display = 'none';

            if (todayShift.earnings) {
                document.getElementById('emp-earnings-row').style.display = 'flex';
                document.getElementById('emp-shift-earnings').textContent = formatMoney(todayShift.earnings.total);
                document.getElementById('emp-earnings-detail').style.display = 'block';
                document.getElementById('emp-earn-base').textContent = formatMoney(todayShift.earnings.base);
                document.getElementById('emp-earn-bonus').textContent = formatMoney(todayShift.earnings.bonus);
            }
            if (shiftTimerInterval) { clearInterval(shiftTimerInterval); shiftTimerInterval = null; }
        } else {
            // On shift
            document.getElementById('emp-shift-end-row').style.display = 'none';
            btnFinish.style.display = 'flex';
            shiftStatus.className = 'shift-status active';
            statusText.textContent = 'На смене';
            shiftBadge.style.display = 'flex';
            document.getElementById('emp-shift-badge-text').textContent = shiftRoleName;
            startShiftTimer(todayShift.startTime);

            // Show selected events
            if (todayShift.selectedEvents && todayShift.selectedEvents.length > 0) {
                selectedEventsDiv.style.display = 'block';
                const events = DB.get('events', []);
                document.getElementById('emp-selected-events-list').innerHTML = todayShift.selectedEvents.map(eid => {
                    const evt = events.find(e => String(e.id) === String(eid));
                    return evt ? `<span class="emp-selected-event-chip">${evt.time} — ${evt.title}</span>` : '';
                }).join('');
            }
        }
    } else {
        roleText.textContent = 'Должность не выбрана';
        btnStart.style.display = 'flex';
        shiftStatus.className = 'shift-status';
        statusText.textContent = 'Смена не начата';
    }

    // Quick stats
    const events = DB.get('events', []).filter(e => e.date === todayStr);
    document.getElementById('emp-events-today-count').textContent = events.length;
    document.getElementById('emp-events-today-preview').innerHTML = events.length === 0
        ? '<p class="empty-state">Нет мероприятий</p>'
        : events.slice(0, 3).map(e => `
            <div class="list-item">
                <span class="material-icons-round">event</span>
                <div class="list-item-info">
                    <strong>${e.title}</strong>
                    <span>${e.time} · ${e.players || e.participants || 0} чел.</span>
                </div>
            </div>
        `).join('');

    // My events count
    const myEvents = todayShift && todayShift.selectedEvents
        ? events.filter(e => todayShift.selectedEvents.includes(e.id))
        : [];
    document.getElementById('emp-my-events-count').textContent = myEvents.length;
    document.getElementById('emp-my-events-preview').innerHTML = myEvents.length === 0
        ? '<p class="empty-state">Не выбраны</p>'
        : myEvents.map(e => `
            <div class="list-item">
                <span class="material-icons-round">assignment_ind</span>
                <div class="list-item-info">
                    <strong>${e.title}</strong>
                    <span>${e.time} · ${formatMoney(e.price)}</span>
                </div>
            </div>
        `).join('');
}

function startShiftTimer(startTimeStr) {
    if (shiftTimerInterval) clearInterval(shiftTimerInterval);
    const updateTimer = () => {
        const now = new Date();
        const [h, m] = startTimeStr.split(':').map(Number);
        const start = new Date(now);
        start.setHours(h, m, 0, 0);
        const diff = now - start;
        if (diff < 0) {
            document.getElementById('emp-shift-timer').textContent = '0:00';
            return;
        }
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        document.getElementById('emp-shift-timer').textContent = `${hours}:${String(mins).padStart(2, '0')}`;
        document.getElementById('emp-shift-timer-label').textContent = 'часов на смене';
    };
    updateTimer();
    shiftTimerInterval = setInterval(updateTimer, 30000);
}

// ===== EMPLOYEE SCREEN INIT =====
function initEmployeeScreen() {
    // START WORK button
    document.getElementById('emp-btn-start-work').addEventListener('click', () => {
        openModal('modal-role-select');
    });

    // Role selection
    document.querySelectorAll('.role-card').forEach(card => {
        card.addEventListener('click', () => {
            pendingShiftRole = card.dataset.shiftRole;
            closeModal('modal-role-select');
            showEventSelectionModal();
        });
    });
    document.getElementById('modal-role-close').addEventListener('click', () => closeModal('modal-role-select'));

    // Event selection modal
    document.getElementById('modal-event-select-close').addEventListener('click', () => closeModal('modal-event-select'));
    document.getElementById('btn-skip-events').addEventListener('click', () => {
        startShift([]);
    });
    document.getElementById('btn-confirm-events').addEventListener('click', () => {
        const selected = [];
        document.querySelectorAll('.event-select-item.selected').forEach(item => {
            selected.push(parseInt(item.dataset.eventId));
        });
        startShift(selected);
    });

    // FINISH WORK button
    document.getElementById('emp-btn-finish-work').addEventListener('click', () => {
        const todayStr = todayLocal();
        const now = new Date();
        const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const shifts = DB.get('shifts', []);
        const idx = shifts.findIndex(s => s.date === todayStr && s.employeeId === currentUser.id && !s.endTime);
        if (idx >= 0) {
            shifts[idx].endTime = timeStr;
            const earnings = calculateShiftEarnings(shifts[idx]);
            shifts[idx].earnings = earnings;
            DB.set('shifts', shifts);
            showToast(`Смена завершена! Заработок: ${formatMoney(earnings.total)}`);
        }
        loadEmployeeDashboard();
    });

    // Shift done button (just a visual indicator, no action needed)
    document.getElementById('emp-btn-shift-done').addEventListener('click', () => {});

    // Logout
    document.getElementById('emp-logout').addEventListener('click', logout);

    // Employee booking
    const empBtnAdd = document.getElementById('emp-btn-add-booking');
    if (empBtnAdd) empBtnAdd.addEventListener('click', () => openEventModal());

    const empSyncGcal = document.getElementById('emp-btn-sync-gcal');
    if (empSyncGcal) empSyncGcal.addEventListener('click', async () => {
        if (!GCalSync.isConnected()) {
            showToast('Google Calendar не подключён. Настройте в Настройках директора.');
            return;
        }
        const result = await GCalSync.fullSync();
        if (result) {
            renderEmpCalendar();
            loadEmployeeEvents();
        }
    });

    // Employee calendar
    const empCalPrev = document.getElementById('emp-cal-prev');
    const empCalNext = document.getElementById('emp-cal-next');
    if (empCalPrev) empCalPrev.addEventListener('click', () => {
        empCalendarDate.setMonth(empCalendarDate.getMonth() - 1);
        renderEmpCalendar();
    });
    if (empCalNext) empCalNext.addEventListener('click', () => {
        empCalendarDate.setMonth(empCalendarDate.getMonth() + 1);
        renderEmpCalendar();
    });

    // Tariff tabs
    document.querySelectorAll('.tariff-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tariff-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadTariffs(tab.dataset.tariffTab);
        });
    });

    // Payment modal
    document.getElementById('modal-payment-close').addEventListener('click', () => closeModal('modal-payment'));
    document.getElementById('btn-cancel-payment').addEventListener('click', () => closeModal('modal-payment'));

    // Combo payment toggle
    document.querySelectorAll('input[name="payment-method"]').forEach(radio => {
        radio.addEventListener('change', () => {
            document.getElementById('combo-payment-fields').style.display =
                radio.value === 'combo' && radio.checked ? 'block' : 'none';
        });
    });

    document.getElementById('btn-complete-payment').addEventListener('click', completeEventPayment);

    // Draggable dashboard cards
    initDashboardDragDrop();
}

function showEventSelectionModal() {
    const todayStr = todayLocal();
    const events = DB.get('events', []).filter(e => e.date === todayStr && e.status !== 'cancelled');
    const list = document.getElementById('event-select-list');

    if (events.length === 0) {
        list.innerHTML = '<p class="empty-state">Нет мероприятий на сегодня</p>';
    } else {
        list.innerHTML = events.map(e => `
            <div class="event-select-item" data-event-id="${e.id}">
                <div class="event-select-checkbox">
                    <span class="material-icons-round">check</span>
                </div>
                <div class="event-select-info">
                    <strong>${e.title}</strong>
                    <span>${e.time} · ${e.players || e.participants || 0} чел. · ${getEventTypeName(e.type)}</span>
                </div>
                <span class="event-select-price">${formatMoney(e.price)}</span>
            </div>
        `).join('');

        // Toggle selection
        list.querySelectorAll('.event-select-item').forEach(item => {
            item.addEventListener('click', () => {
                item.classList.toggle('selected');
            });
        });
    }

    openModal('modal-event-select');
}

function startShift(selectedEventIds) {
    closeModal('modal-event-select');
    const todayStr = todayLocal();
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    const shift = {
        id: Date.now(),
        employeeId: currentUser.id,
        employeeName: currentUser.firstName + ' ' + currentUser.lastName,
        employeeRole: currentUser.role,
        shiftRole: pendingShiftRole,
        date: todayStr,
        startTime: timeStr,
        endTime: null,
        selectedEvents: selectedEventIds,
        earnings: null
    };

    const shifts = DB.get('shifts', []);
    shifts.push(shift);
    DB.set('shifts', shifts);

    pendingShiftRole = null;
    loadEmployeeDashboard();
    showToast('Смена начата! Хорошего рабочего дня!');
}

// ===== SALARY CALCULATION =====
function calculateShiftEarnings(shift) {
    const rules = DB.get('salaryRules', {
        instructor: { shiftRate: 1500, bonusPercent: 5 },
        admin: { shiftRate: 0, bonusPercent: 5 }
    });

    const role = shift.shiftRole || shift.employeeRole;
    let base = 0;
    let bonus = 0;
    let bonusDetail = '';

    if (role === 'instructor') {
        const rule = rules.instructor || { shiftRate: 1500, bonusPercent: 5 };
        base = rule.shiftRate || 0;

        // Bonus from selected events
        const events = DB.get('events', []);
        const selectedEvents = (shift.selectedEvents || []).map(id => events.find(e => String(e.id) === String(id))).filter(Boolean);
        const eventsRevenue = selectedEvents.reduce((sum, e) => sum + (e.price || 0), 0);
        bonus = Math.round(eventsRevenue * (rule.bonusPercent || 0) / 100);
        bonusDetail = `${rule.bonusPercent}% от ${formatMoney(eventsRevenue)} (${selectedEvents.length} мероп.)`;

    } else if (role === 'admin') {
        const rule = rules.admin || { shiftRate: 0, bonusPercent: 5 };
        base = rule.shiftRate || 0;

        // Bonus from ALL revenue on this date
        const events = DB.get('events', []).filter(e => e.date === shift.date);
        const dayRevenue = events.reduce((sum, e) => sum + (e.price || 0), 0);
        bonus = Math.round(dayRevenue * (rule.bonusPercent || 0) / 100);
        bonusDetail = `${rule.bonusPercent}% от ${formatMoney(dayRevenue)} (вся выручка)`;
    }

    return { base, bonus, total: base + bonus, bonusDetail };
}

function getEmployeeMonthEarnings(employeeId) {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const shifts = DB.get('shifts', []).filter(s =>
        s.employeeId === employeeId &&
        s.date.startsWith(monthStr) &&
        s.endTime &&
        s.earnings
    );

    const totalEarned = shifts.reduce((sum, s) => sum + (s.earnings?.total || 0), 0);
    return { shifts, totalEarned, shiftCount: shifts.length };
}

// ===== EMPLOYEE NAVIGATION =====
function initEmployeeNavigation() {
    document.querySelectorAll('[data-emp-page]').forEach(item => {
        item.addEventListener('click', () => {
            empNavigateTo(item.dataset.empPage);
        });
    });

    document.getElementById('emp-btn-hamburger').addEventListener('click', () => {
        document.getElementById('emp-sidebar').classList.toggle('open');
    });

    document.querySelector('#employee-screen .main-content').addEventListener('click', (e) => {
        if (!e.target.closest('#emp-btn-hamburger')) {
            document.getElementById('emp-sidebar').classList.remove('open');
        }
    });
}

function empNavigateTo(page) {
    document.querySelectorAll('#employee-screen .nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`[data-emp-page="${page}"]`);
    if (navItem) navItem.classList.add('active');

    document.querySelectorAll('#employee-screen .page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById('emp-page-' + page.replace('emp-', ''));
    if (pageEl) pageEl.classList.add('active');

    const titles = {
        'emp-dashboard': 'Главная',
        'emp-events': 'Мероприятия',
        'emp-booking': 'Бронирование',
        'emp-salary': 'Зарплата',
        'emp-tariffs': 'Тарифы'
    };
    document.getElementById('emp-page-title').textContent = titles[page] || 'Главная';

    if (page === 'emp-dashboard') loadEmployeeDashboard();
    if (page === 'emp-events') loadEmployeeEvents();
    if (page === 'emp-booking') renderEmpCalendar();
    if (page === 'emp-salary') loadEmployeeSalary();
    if (page === 'emp-tariffs') loadTariffs('services');

    document.getElementById('emp-sidebar').classList.remove('open');
}

// ===== EMPLOYEE EVENTS PAGE =====
function loadEmployeeEvents() {
    const todayStr = todayLocal();
    const events = DB.get('events', []).filter(e => e.date === todayStr);
    const employees = DB.get('employees', []);
    const list = document.getElementById('emp-events-list');

    if (events.length === 0) {
        list.innerHTML = '<p class="empty-state">Нет мероприятий на сегодня</p>';
        return;
    }

    list.innerHTML = events.map(e => {
        const instructor = employees.find(emp => emp.id === e.instructor);
        const instructorName = instructor ? instructor.firstName + ' ' + instructor.lastName : '—';
        const statusClass = 'status-' + (e.status || 'pending');
        const statusName = getStatusName(e.status);
        const isCompleted = e.status === 'completed';

        return `
            <div class="emp-event-card">
                <div class="emp-event-time">${e.time}</div>
                <div class="emp-event-info">
                    <strong>${e.title}</strong>
                    <span>${e.players || e.participants || 0} чел. · ${formatDuration(e.duration)} · ${instructorName} · ${formatMoney(e.price)}</span>
                </div>
                <span class="emp-event-status ${statusClass}">${statusName}</span>
                <div class="emp-event-actions">
                    <button class="btn-secondary btn-sm" onclick="openEventModal('${e.id}')">
                        <span class="material-icons-round" style="font-size:16px">visibility</span>
                        Подробнее
                    </button>
                    ${!isCompleted ? `
                    <button class="btn-primary btn-sm" onclick="openPaymentModal('${e.id}')">
                        <span class="material-icons-round" style="font-size:16px">done_all</span>
                        Выполнить
                    </button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ===== PAYMENT COMPLETION =====
let currentPaymentEventId = null;

function openPaymentModal(eventId) {
    currentPaymentEventId = eventId;
    const events = DB.get('events', []);
    const evt = events.find(e => String(e.id) === String(eventId));
    if (!evt) return;

    document.getElementById('payment-event-info').innerHTML = `
        <strong>${evt.title}</strong>
        <span>${evt.time} · ${evt.players || evt.participants || 0} чел. · ${getEventTypeName(evt.type)}</span>
        <div class="payment-amount">${formatMoney(evt.price)}</div>
    `;

    // Reset payment form
    document.querySelector('input[name="payment-method"][value="cash"]').checked = true;
    document.getElementById('combo-payment-fields').style.display = 'none';
    document.getElementById('combo-cash').value = '';
    document.getElementById('combo-card').value = '';
    document.getElementById('combo-transfer').value = '';
    document.getElementById('combo-qr').value = '';

    openModal('modal-payment');
}

function completeEventPayment() {
    if (!currentPaymentEventId) return;
    const events = DB.get('events', []);
    const idx = events.findIndex(e => String(e.id) === String(currentPaymentEventId));
    if (idx < 0) return;

    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
    let paymentDetails = { method: paymentMethod };

    if (paymentMethod === 'combo') {
        paymentDetails.combo = {
            cash: parseFloat(document.getElementById('combo-cash').value) || 0,
            card: parseFloat(document.getElementById('combo-card').value) || 0,
            transfer: parseFloat(document.getElementById('combo-transfer').value) || 0,
            qr: parseFloat(document.getElementById('combo-qr').value) || 0,
        };
    }

    events[idx].status = 'completed';
    events[idx].paymentDetails = paymentDetails;
    events[idx].completedAt = new Date().toISOString();
    events[idx].completedBy = currentUser ? currentUser.id : null;
    DB.set('events', events);

    closeModal('modal-payment');
    currentPaymentEventId = null;
    showToast('Заказ выполнен! Сверьте чек в SIGMA ATOL');

    // Reload current page
    if (document.getElementById('emp-page-events').classList.contains('active')) {
        loadEmployeeEvents();
    }
}

// ===== EMPLOYEE SALARY PAGE =====
function loadEmployeeSalary() {
    if (!currentUser) return;
    const monthData = getEmployeeMonthEarnings(currentUser.id);
    const paid = currentUser.paid || 0;
    const debt = Math.max(0, monthData.totalEarned - paid);

    document.getElementById('emp-sal-earned').textContent = formatMoney(monthData.totalEarned);
    document.getElementById('emp-sal-paid').textContent = formatMoney(paid);
    document.getElementById('emp-sal-debt').textContent = formatMoney(debt);

    const tbody = document.getElementById('emp-salary-table-body');
    if (monthData.shifts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Нет завершённых смен в этом месяце</td></tr>';
    } else {
        tbody.innerHTML = monthData.shifts.map(s => {
            const roleName = s.shiftRole === 'admin' ? 'Админ' : 'Инструктор';
            return `
                <tr>
                    <td>${s.date}</td>
                    <td>${roleName}</td>
                    <td>${s.startTime}</td>
                    <td>${s.endTime}</td>
                    <td>${formatMoney(s.earnings?.base || 0)}</td>
                    <td style="color:var(--green)">${formatMoney(s.earnings?.bonus || 0)}</td>
                    <td style="color:var(--accent);font-weight:700">${formatMoney(s.earnings?.total || 0)}</td>
                </tr>
            `;
        }).join('');
    }
}

// ===== EMPLOYEE BOOKING (Calendar) =====
function renderEmpCalendar() {
    const year = empCalendarDate.getFullYear();
    const month = empCalendarDate.getMonth();
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    document.getElementById('emp-cal-month-title').textContent = monthNames[month] + ' ' + year;

    const firstDay = new Date(year, month, 1);
    let startDay = firstDay.getDay();
    if (startDay === 0) startDay = 7;
    startDay--;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const events = DB.get('events', []);
    const todayStr = todayLocal();

    let cells = '';
    for (let i = startDay - 1; i >= 0; i--) {
        cells += `<div class="cal-day other-month">${daysInPrevMonth - i}</div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = dateStr === todayStr;
        const hasEvents = events.some(e => e.date === dateStr);
        const isSelected = empSelectedCalDay === dateStr;
        let classes = 'cal-day';
        if (isToday) classes += ' today';
        if (hasEvents) classes += ' has-events';
        if (isSelected) classes += ' selected';
        cells += `<div class="${classes}" data-date="${dateStr}" onclick="selectEmpCalDay('${dateStr}')">${d}</div>`;
    }
    const totalCells = startDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
        cells += `<div class="cal-day other-month">${i}</div>`;
    }

    document.getElementById('emp-calendar-cells').innerHTML = cells;
    if (!empSelectedCalDay) selectEmpCalDay(todayStr);
    else selectEmpCalDay(empSelectedCalDay);
}

function selectEmpCalDay(dateStr) {
    empSelectedCalDay = dateStr;
    document.querySelectorAll('#emp-calendar-cells .cal-day').forEach(d => d.classList.remove('selected'));
    const el = document.querySelector(`#emp-calendar-cells .cal-day[data-date="${dateStr}"]`);
    if (el) el.classList.add('selected');

    const events = DB.get('events', []).filter(e => e.date === dateStr);
    const dateFormatted = new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('emp-day-events-title').textContent = 'Мероприятия — ' + dateFormatted;

    const list = document.getElementById('emp-day-events-list');
    if (events.length === 0) {
        list.innerHTML = '<p class="empty-state">Нет мероприятий в этот день</p>';
    } else {
        list.innerHTML = events.map(e => `
            <div class="event-card" onclick="openEventModal('${e.id}')">
                <div class="event-time">${e.time}</div>
                <div class="event-info">
                    <strong>${e.title}</strong>
                    <span>${e.players || e.participants || 0} чел. · ${formatDuration(e.duration)}${e.instructor ? ' · ' + getInstructorName(e.instructor) : ''}</span>
                </div>
                <span class="event-type-badge">${getEventTypeName(e.type)}</span>
            </div>
        `).join('');
    }
}

// ===== TARIFFS PAGE =====
function loadTariffs(category = 'services') {
    const tariffs = DB.get('tariffs', []).filter(t => t.category === category);
    const grid = document.getElementById('emp-tariffs-grid');

    if (tariffs.length === 0) {
        grid.innerHTML = '<p class="empty-state">Нет тарифов в этой категории</p>';
        return;
    }

    grid.innerHTML = tariffs.map(t => `
        <div class="tariff-card">
            <div class="tariff-card-header">
                <h3>${t.name}</h3>
                <div class="tariff-price">${formatMoney(t.price)} <span class="tariff-unit">/ ${t.unit}</span></div>
            </div>
            <p class="tariff-description">${t.description || '—'}</p>
            <div class="tariff-meta">
                ${t.duration ? `<span><span class="material-icons-round">timer</span> ${t.duration} мин</span>` : ''}
                ${t.minPeople ? `<span><span class="material-icons-round">group</span> от ${t.minPeople} чел.</span>` : ''}
            </div>
        </div>
    `).join('');
}

// ===== DASHBOARD DRAG & DROP =====
function initDashboardDragDrop() {
    const grid = document.getElementById('emp-dash-grid');
    if (!grid) return;

    let draggedCard = null;

    grid.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.emp-dash-draggable');
        if (!card) return;
        draggedCard = card;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    grid.addEventListener('dragend', (e) => {
        const card = e.target.closest('.emp-dash-draggable');
        if (card) card.classList.remove('dragging');
        grid.querySelectorAll('.emp-dash-draggable').forEach(c => c.classList.remove('drag-over'));
        draggedCard = null;
    });

    grid.addEventListener('dragover', (e) => {
        e.preventDefault();
        const card = e.target.closest('.emp-dash-draggable');
        if (card && card !== draggedCard) {
            grid.querySelectorAll('.emp-dash-draggable').forEach(c => c.classList.remove('drag-over'));
            card.classList.add('drag-over');
        }
    });

    grid.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetCard = e.target.closest('.emp-dash-draggable');
        if (targetCard && draggedCard && targetCard !== draggedCard) {
            const cards = [...grid.children];
            const draggedIdx = cards.indexOf(draggedCard);
            const targetIdx = cards.indexOf(targetCard);
            if (draggedIdx < targetIdx) {
                grid.insertBefore(draggedCard, targetCard.nextSibling);
            } else {
                grid.insertBefore(draggedCard, targetCard);
            }
            // Save order
            const order = [...grid.querySelectorAll('.emp-dash-draggable')].map(c => c.dataset.cardId);
            DB.set('empDashOrder', order);
        }
        grid.querySelectorAll('.emp-dash-draggable').forEach(c => c.classList.remove('drag-over'));
    });

    // Restore order
    const savedOrder = DB.get('empDashOrder', null);
    if (savedOrder) {
        savedOrder.forEach(cardId => {
            const card = grid.querySelector(`[data-card-id="${cardId}"]`);
            if (card) grid.appendChild(card);
        });
    }
}

// ===== DIRECTOR NAVIGATION & LOGOUT =====
document.getElementById('director-logout').addEventListener('click', logout);

function initNavigation() {
    document.querySelectorAll('#app-screen .nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            if (page) navigateTo(page);
        });
    });

    document.getElementById('btn-hamburger').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    document.querySelector('#app-screen .main-content').addEventListener('click', (e) => {
        if (!e.target.closest('#btn-hamburger')) {
            document.getElementById('sidebar').classList.remove('open');
        }
    });
}

function navigateTo(page) {
    document.querySelectorAll('#app-screen .nav-item').forEach(n => n.classList.remove('active'));
    const navEl = document.querySelector(`#app-screen .nav-item[data-page="${page}"]`);
    if (navEl) navEl.classList.add('active');

    document.querySelectorAll('#app-screen .page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');

    const titles = {
        dashboard: 'Главная',
        employees: 'Сотрудники',
        schedule: 'Расписание',
        finances: 'Финансы',
        documents: 'Документы',
        clients: 'Клиенты',
        settings: 'Настройки'
    };
    document.getElementById('page-title').textContent = titles[page] || page;

    if (page === 'dashboard') loadDashboard();
    if (page === 'employees') loadEmployees();
    if (page === 'schedule') renderCalendar();
    if (page === 'finances') loadFinances();
    if (page === 'documents') loadDocuments();
    if (page === 'clients') loadClients();

    document.getElementById('sidebar').classList.remove('open');
}

// ===== DASHBOARD =====
function loadDashboard() {
    loadRevenue();
    loadEventsToday();
    loadOnShift();
    loadServiceRating();
    loadEmployeeRating();
    loadStock();
}

function loadRevenue() {
    const fin = DB.get('finances', {});
    document.getElementById('revenue-current').textContent = formatMoney(fin.income || 0);

    const change = Math.round(((fin.income || 0) / 720000 - 1) * 100);
    const changeEl = document.getElementById('revenue-change');
    changeEl.textContent = (change >= 0 ? '+' : '') + change + '%';
    changeEl.className = 'revenue-change' + (change < 0 ? ' negative' : '');

    const ctx = document.getElementById('revenueChart');
    if (revenueChart) revenueChart.destroy();

    const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн'];
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [
                {
                    label: '2026', data: [420000, 580000, 847000, 0, 0, 0],
                    borderColor: accent, backgroundColor: accent + '20',
                    fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: accent,
                },
                {
                    label: '2025', data: [380000, 490000, 720000, 650000, 810000, 920000],
                    borderColor: '#5A5A6E', backgroundColor: 'transparent',
                    borderDash: [5, 5], tension: 0.4, pointRadius: 0,
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#8E8EA0', font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } } },
            scales: {
                x: { ticks: { color: '#5A5A6E' }, grid: { color: '#1A1A24' } },
                y: { ticks: { color: '#5A5A6E', callback: v => (v / 1000) + 'K' }, grid: { color: '#1A1A24' } }
            }
        }
    });
}

function loadEventsToday() {
    const todayStr = todayLocal();
    const events = DB.get('events', []).filter(e => e.date === todayStr);
    document.getElementById('events-today').textContent = events.length;

    const list = document.getElementById('events-today-list');
    list.innerHTML = events.length === 0
        ? '<p class="empty-state">Нет мероприятий</p>'
        : events.map(e => `
            <div class="list-item">
                <span class="material-icons-round">event</span>
                <div class="list-item-info">
                    <strong>${e.title}</strong>
                    <span>${e.time} · ${e.players || e.participants || 0} чел.</span>
                </div>
                <span class="list-item-badge badge-blue">${getEventTypeName(e.type)}</span>
            </div>
        `).join('');
}

function loadOnShift() {
    const todayStr = todayLocal();
    const shifts = DB.get('shifts', []).filter(s => s.date === todayStr);
    const list = document.getElementById('on-shift-list');

    if (shifts.length === 0) {
        list.innerHTML = '<p class="empty-state">Никто ещё не вышел на смену</p>';
        return;
    }

    list.innerHTML = shifts.map(s => {
        const roleName = s.shiftRole === 'admin' ? 'Администратор' : 'Инструктор';
        const badge = s.endTime
            ? `<span class="list-item-badge badge-orange">${s.startTime} – ${s.endTime}</span>`
            : `<span class="list-item-badge badge-green">${s.startTime} – …</span>`;
        return `
            <div class="list-item">
                <span class="material-icons-round">person</span>
                <div class="list-item-info">
                    <strong>${s.employeeName}</strong>
                    <span>${roleName}</span>
                </div>
                ${badge}
            </div>
        `;
    }).join('');
}

function loadServiceRating() {
    const ctx = document.getElementById('servicesChart');
    if (servicesChart) servicesChart.destroy();

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    servicesChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Пейнтбол', 'Лазертаг', 'Квесты', 'Корпоративы', 'Дни рождения'],
            datasets: [{
                data: [35, 25, 15, 15, 10],
                backgroundColor: [accent, '#448AFF', '#00E676', '#FF9100', '#E040FB'],
                borderWidth: 0,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: { legend: { position: 'right', labels: { color: '#8E8EA0', font: { size: 11 }, padding: 12, usePointStyle: true, pointStyle: 'circle' } } }
        }
    });
}

function loadEmployeeRating() {
    const employees = DB.get('employees', []).filter(e => e.role !== 'director');
    const list = document.getElementById('employee-rating-list');
    const ratings = employees.map(e => ({
        name: e.firstName + ' ' + e.lastName,
        score: Math.floor(Math.random() * 20 + 80)
    })).sort((a, b) => b.score - a.score);

    list.innerHTML = ratings.map((r, i) => `
        <div class="rating-item">
            <div class="rating-pos">${i + 1}</div>
            <div class="rating-name">${r.name}</div>
            <div class="rating-score">${r.score}%</div>
        </div>
    `).join('');
}

function loadStock() {
    const stock = DB.get('stock', { balls: 0, ballsMax: 10000, grenades: 0, grenadesMax: 500 });
    document.getElementById('stock-balls').textContent = stock.balls.toLocaleString('ru-RU');
    document.getElementById('stock-grenades').textContent = stock.grenades.toLocaleString('ru-RU');
    document.getElementById('stock-balls-bar').style.width = Math.min(100, (stock.balls / stock.ballsMax * 100)) + '%';
    document.getElementById('stock-grenades-bar').style.width = Math.min(100, (stock.grenades / stock.grenadesMax * 100)) + '%';
}

document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadDashboard();
    });
});

// ===== EMPLOYEES =====
function initEmployees() {
    document.getElementById('btn-add-employee').addEventListener('click', () => openEmployeeModal());
    document.getElementById('modal-employee-close').addEventListener('click', () => closeModal('modal-employee'));
    document.getElementById('btn-cancel-employee').addEventListener('click', () => closeModal('modal-employee'));
    document.getElementById('employee-form').addEventListener('submit', saveEmployee);
}

function loadEmployees() {
    const employees = DB.get('employees', []);
    let totalEarned = 0, totalPaid = 0;
    const empData = employees.map(e => {
        const monthData = getEmployeeMonthEarnings(e.id);
        const earned = monthData.totalEarned;
        const paid = e.paid || 0;
        totalEarned += earned;
        totalPaid += paid;
        return { ...e, earned, shiftCount: monthData.shiftCount, debt: Math.max(0, earned - paid) };
    });

    document.getElementById('salary-total').textContent = formatMoney(totalEarned);
    document.getElementById('salary-paid').textContent = formatMoney(totalPaid);
    document.getElementById('salary-debt').textContent = formatMoney(Math.max(0, totalEarned - totalPaid));

    const tbody = document.getElementById('employees-table-body');
    tbody.innerHTML = empData.map(e => `
        <tr>
            <td><strong>${e.firstName} ${e.lastName}</strong></td>
            <td>${getRoleName(e.role)}</td>
            <td>${e.phone || '—'}</td>
            <td><code>${e.pin}</code></td>
            <td>${e.shiftCount}</td>
            <td>${formatMoney(e.earned)}</td>
            <td>${formatMoney(e.paid || 0)}</td>
            <td><span style="color:${e.debt > 0 ? 'var(--red)' : 'var(--green)'};font-weight:700">${formatMoney(e.debt)}</span></td>
            <td>
                <button class="btn-action" onclick="openEmployeeModal('${e.id}')" title="Редактировать">
                    <span class="material-icons-round">edit</span>
                </button>
                <button class="btn-action danger" onclick="deleteEmployee('${e.id}')" title="Удалить">
                    <span class="material-icons-round">delete</span>
                </button>
            </td>
        </tr>
    `).join('');
}

function openEmployeeModal(id = null) {
    const form = document.getElementById('employee-form');
    form.reset();
    document.getElementById('emp-id').value = '';
    document.getElementById('emp-shifts-history').style.display = 'none';

    if (id) {
        const emp = DB.get('employees', []).find(e => String(e.id) === String(id));
        if (!emp) return;
        document.getElementById('modal-employee-title').textContent = 'Редактировать сотрудника';
        document.getElementById('emp-id').value = emp.id;
        document.getElementById('emp-first-name').value = emp.firstName;
        document.getElementById('emp-last-name').value = emp.lastName;
        document.getElementById('emp-role').value = emp.role;
        document.getElementById('emp-pin').value = emp.pin;
        document.getElementById('emp-dob').value = emp.dob || '';
        document.getElementById('emp-phone').value = emp.phone || '';
        document.getElementById('emp-passport').value = emp.passport || '';
        document.getElementById('emp-bank').value = emp.bank || '';
        document.getElementById('emp-paid').value = emp.paid || '';

        const monthData = getEmployeeMonthEarnings(emp.id);
        if (monthData.shifts.length > 0 || emp.role !== 'director') {
            document.getElementById('emp-shifts-history').style.display = 'block';
            const listEl = document.getElementById('emp-shifts-list');
            if (monthData.shifts.length === 0) {
                listEl.innerHTML = '<p class="empty-state" style="padding:8px">Нет завершённых смен в этом месяце</p>';
            } else {
                listEl.innerHTML = monthData.shifts.map(s => `
                    <div class="emp-shift-item">
                        <span class="shift-date">${s.date.slice(5)}</span>
                        <span class="shift-hours">${s.startTime} – ${s.endTime}</span>
                        <span class="shift-base">${formatMoney(s.earnings?.base || 0)}</span>
                        <span class="shift-bonus-val">+${formatMoney(s.earnings?.bonus || 0)}</span>
                        <span class="shift-total">${formatMoney(s.earnings?.total || 0)}</span>
                    </div>
                `).join('');
            }
            document.getElementById('emp-total-earned').textContent = formatMoney(monthData.totalEarned);
        }
    } else {
        document.getElementById('modal-employee-title').textContent = 'Новый сотрудник';
    }

    openModal('modal-employee');
}

function saveEmployee(e) {
    e.preventDefault();
    const employees = DB.get('employees', []);
    const id = document.getElementById('emp-id').value;

    const data = {
        firstName: document.getElementById('emp-first-name').value.trim(),
        lastName: document.getElementById('emp-last-name').value.trim(),
        role: document.getElementById('emp-role').value,
        pin: document.getElementById('emp-pin').value.trim(),
        dob: document.getElementById('emp-dob').value,
        phone: document.getElementById('emp-phone').value.trim(),
        passport: document.getElementById('emp-passport').value.trim(),
        bank: document.getElementById('emp-bank').value.trim(),
        paid: parseFloat(document.getElementById('emp-paid').value) || 0,
    };

    const pinConflict = employees.find(e => e.pin === data.pin && String(e.id) !== id);
    if (pinConflict) {
        showToast('Этот ПИН-код уже используется!', 'error');
        return;
    }

    if (id) {
        const idx = employees.findIndex(e => e.id === parseInt(id));
        if (idx >= 0) employees[idx] = { ...employees[idx], ...data };
    } else {
        data.id = Date.now();
        employees.push(data);
    }

    DB.set('employees', employees);
    closeModal('modal-employee');
    loadEmployees();
    showToast('Сотрудник сохранён');
}

function deleteEmployee(id) {
    showConfirm('Удалить сотрудника?', 'Все данные сотрудника будут удалены', () => {
        let employees = DB.get('employees', []);
        employees = employees.filter(e => e.id !== id);
        DB.set('employees', employees);
        loadEmployees();
        showToast('Сотрудник удалён');
    });
}

// ===== SCHEDULE =====
function initSchedule() {
    document.getElementById('btn-add-event').addEventListener('click', () => openEventModal());
    document.getElementById('modal-event-close').addEventListener('click', () => closeModal('modal-event'));
    document.getElementById('btn-cancel-event').addEventListener('click', () => closeModal('modal-event'));
    document.getElementById('event-form').addEventListener('submit', saveEvent);

    document.getElementById('cal-prev').addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        renderCalendar();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() + 1);
        renderCalendar();
    });

    document.getElementById('btn-sync-gcal').addEventListener('click', async () => {
        if (!GCalSync.isConnected()) {
            showToast('Google Calendar не подключён. Настройте в Настройках.');
            return;
        }
        const result = await GCalSync.fullSync();
        if (result) renderCalendar();
    });
}

function renderCalendar() {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    document.getElementById('cal-month-title').textContent = monthNames[month] + ' ' + year;

    const firstDay = new Date(year, month, 1);
    let startDay = firstDay.getDay();
    if (startDay === 0) startDay = 7;
    startDay--;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const events = DB.get('events', []);
    const todayStr = todayLocal();

    let cells = '';
    for (let i = startDay - 1; i >= 0; i--) {
        cells += `<div class="cal-day other-month">${daysInPrevMonth - i}</div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = dateStr === todayStr;
        const hasEvents = events.some(e => e.date === dateStr);
        const isSelected = selectedCalDay === dateStr;
        let classes = 'cal-day';
        if (isToday) classes += ' today';
        if (hasEvents) classes += ' has-events';
        if (isSelected) classes += ' selected';
        cells += `<div class="${classes}" data-date="${dateStr}" onclick="selectCalDay('${dateStr}')">${d}</div>`;
    }
    const totalCells = startDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
        cells += `<div class="cal-day other-month">${i}</div>`;
    }

    document.getElementById('calendar-cells').innerHTML = cells;
    if (!selectedCalDay) selectCalDay(todayStr);
    else selectCalDay(selectedCalDay);
}

function selectCalDay(dateStr) {
    selectedCalDay = dateStr;
    document.querySelectorAll('#calendar-cells .cal-day').forEach(d => d.classList.remove('selected'));
    const el = document.querySelector(`#calendar-cells .cal-day[data-date="${dateStr}"]`);
    if (el) el.classList.add('selected');

    const events = DB.get('events', []).filter(e => e.date === dateStr);
    const dateFormatted = new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('day-events-title').textContent = 'Мероприятия — ' + dateFormatted;

    const list = document.getElementById('day-events-list');
    if (events.length === 0) {
        list.innerHTML = '<p class="empty-state">Нет мероприятий в этот день</p>';
    } else {
        list.innerHTML = events.map(e => `
            <div class="event-card" onclick="openEventModal('${e.id}')">
                <div class="event-time">${e.time}</div>
                <div class="event-info">
                    <strong>${e.title}</strong>
                    <span>${e.players || e.participants || 0} чел. · ${formatDuration(e.duration)}${e.instructor ? ' · ' + getInstructorName(e.instructor) : ''}</span>
                </div>
                <span class="event-type-badge">${getEventTypeName(e.type)}</span>
            </div>
        `).join('');
    }
}

function openEventModal(id = null) {
    const form = document.getElementById('event-form');
    form.reset();
    document.getElementById('evt-id').value = '';
    document.getElementById('btn-delete-event').style.display = 'none';

    // Populate instructor select
    const instructors = DB.get('employees', []).filter(e => e.role === 'instructor' || e.role === 'admin');
    const sel = document.getElementById('evt-instructor');
    sel.innerHTML = '<option value="">— Выберите —</option>' +
        instructors.map(i => `<option value="${i.id}">${i.firstName} ${i.lastName}</option>`).join('');

    // Populate tariff select
    const tariffs = DB.get('tariffs', []).filter(t => t.category === 'services');
    const tariffSel = document.getElementById('evt-tariff');
    tariffSel.innerHTML = '<option value="">— Выберите тариф —</option>' +
        tariffs.map(t => `<option value="${t.id}">${t.name} — ${formatMoney(t.price)}/${t.unit}</option>`).join('');

    // Populate options checkboxes
    const allOptions = DB.get('tariffs', []).filter(t => t.category === 'optionsForGame' || t.category === 'options');
    document.getElementById('evt-options-list').innerHTML = allOptions.map(o => `
        <label class="option-checkbox">
            <input type="checkbox" value="${o.id}">
            ${o.name} (${formatMoney(o.price)})
        </label>
    `).join('');

    if (id) {
        const evt = DB.get('events', []).find(e => String(e.id) === String(id));
        if (!evt) return;
        document.getElementById('modal-event-title').textContent = 'Редактировать мероприятие';
        document.getElementById('evt-id').value = evt.id;
        document.getElementById('evt-title').value = evt.title;
        document.getElementById('evt-date').value = evt.date;
        document.getElementById('evt-time').value = evt.time;
        document.getElementById('evt-duration').value = evt.duration;
        document.getElementById('evt-type').value = evt.type;
        document.getElementById('evt-occasion').value = evt.occasion || '';
        document.getElementById('evt-player-age').value = evt.playerAge || '';
        document.getElementById('evt-tariff').value = evt.tariffId || '';
        document.getElementById('evt-participants').value = evt.participants;
        document.getElementById('evt-instructor').value = evt.instructor || '';
        document.getElementById('evt-notes').value = evt.notes || '';
        document.getElementById('evt-price').value = evt.price || '';
        document.getElementById('evt-discount').value = evt.discount || '';
        document.getElementById('evt-status').value = evt.status || 'pending';
        document.getElementById('evt-prepayment').value = evt.prepayment || '';
        document.getElementById('evt-prepayment-date').value = evt.prepaymentDate || '';

        // Check selected options
        if (evt.selectedOptions) {
            document.querySelectorAll('#evt-options-list input[type="checkbox"]').forEach(cb => {
                cb.checked = evt.selectedOptions.includes(parseInt(cb.value));
            });
        }

        document.getElementById('btn-delete-event').style.display = 'inline-flex';
    } else {
        document.getElementById('modal-event-title').textContent = 'Новое мероприятие';
        if (selectedCalDay) document.getElementById('evt-date').value = selectedCalDay;
        else if (empSelectedCalDay) document.getElementById('evt-date').value = empSelectedCalDay;
    }

    openModal('modal-event');
}

function saveEvent(e) {
    e.preventDefault();
    const events = DB.get('events', []);
    const id = document.getElementById('evt-id').value;

    const selectedOptions = [];
    document.querySelectorAll('#evt-options-list input[type="checkbox"]:checked').forEach(cb => {
        selectedOptions.push(parseInt(cb.value));
    });

    const data = {
        title: document.getElementById('evt-title').value.trim(),
        date: document.getElementById('evt-date').value,
        time: document.getElementById('evt-time').value,
        duration: parseInt(document.getElementById('evt-duration').value) || 60,
        type: document.getElementById('evt-type').value,
        occasion: document.getElementById('evt-occasion').value,
        playerAge: document.getElementById('evt-player-age').value.trim(),
        tariffId: parseInt(document.getElementById('evt-tariff').value) || null,
        participants: parseInt(document.getElementById('evt-participants').value) || 0,
        instructor: parseInt(document.getElementById('evt-instructor').value) || null,
        notes: document.getElementById('evt-notes').value.trim(),
        price: parseFloat(document.getElementById('evt-price').value) || 0,
        discount: parseFloat(document.getElementById('evt-discount').value) || 0,
        status: document.getElementById('evt-status').value || 'pending',
        prepayment: parseFloat(document.getElementById('evt-prepayment').value) || 0,
        prepaymentDate: document.getElementById('evt-prepayment-date').value,
        selectedOptions: selectedOptions,
    };

    if (id) {
        const idx = events.findIndex(e => e.id === parseInt(id));
        if (idx >= 0) events[idx] = { ...events[idx], ...data };
    } else {
        data.id = Date.now();
        events.push(data);
    }

    DB.set('events', events);
    closeModal('modal-event');
    if (document.getElementById('page-schedule').classList.contains('active')) renderCalendar();
    if (document.getElementById('emp-page-booking').classList.contains('active')) renderEmpCalendar();
    if (document.getElementById('emp-page-events').classList.contains('active')) loadEmployeeEvents();
    showToast('Мероприятие сохранено');

    // Push to Google Calendar
    const savedEvent = id ? events.find(ev => ev.id === parseInt(id)) : events[events.length - 1];
    if (savedEvent && GCalSync.isConnected()) {
        GCalSync.pushEvent(savedEvent);
    }
}

document.getElementById('btn-delete-event').addEventListener('click', () => {
    const id = parseInt(document.getElementById('evt-id').value);
    showConfirm('Удалить мероприятие?', 'Это действие нельзя отменить', () => {
        let events = DB.get('events', []);
        events = events.filter(e => e.id !== id);
        DB.set('events', events);
        closeModal('modal-event');
        if (document.getElementById('page-schedule').classList.contains('active')) renderCalendar();
        if (document.getElementById('emp-page-booking').classList.contains('active')) renderEmpCalendar();
        showToast('Мероприятие удалено');
        // Delete from Google Calendar
        if (GCalSync.isConnected()) GCalSync.deleteEvent(id);
    });
});

// ===== FINANCES =====
function initFinances() {
    document.querySelectorAll('.fin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.fin-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadFinances(tab.dataset.fin);
        });
    });
}

function loadFinances(tab = 'shifts') {
    const fin = DB.get('finances', {});
    document.getElementById('fin-income').textContent = formatMoney(fin.income || 0);
    document.getElementById('fin-expense').textContent = formatMoney(fin.expense || 0);
    document.getElementById('fin-balance').textContent = formatMoney((fin.income || 0) - (fin.expense || 0));
    document.getElementById('fin-cash').textContent = formatMoney(fin.cash || 0);

    const thead = document.getElementById('fin-table-head');
    const tbody = document.getElementById('fin-table-body');

    switch (tab) {
        case 'shifts':
            thead.innerHTML = '<tr><th>Дата</th><th>Сотрудник</th><th>Начало</th><th>Конец</th><th>Часы</th></tr>';
            tbody.innerHTML = (fin.shifts || []).map(s => `
                <tr><td>${s.date}</td><td>${s.employee}</td><td>${s.start}</td><td>${s.end}</td><td>${s.hours}ч</td></tr>
            `).join('') || '<tr><td colspan="5" class="empty-state">Нет данных</td></tr>';
            break;
        case 'receipts':
            thead.innerHTML = '<tr><th>№</th><th>Дата</th><th>Время</th><th>Сумма</th><th>Тип</th><th>Статус</th></tr>';
            tbody.innerHTML = (fin.receipts || []).map(r => `
                <tr><td>${r.id}</td><td>${r.date}</td><td>${r.time}</td><td>${formatMoney(r.amount)}</td><td>${r.type}</td>
                <td><span class="list-item-badge ${r.status === 'Оплачен' ? 'badge-green' : 'badge-red'}">${r.status}</span></td></tr>
            `).join('') || '<tr><td colspan="6" class="empty-state">Нет данных</td></tr>';
            break;
        case 'orders':
            thead.innerHTML = '<tr><th>№</th><th>Дата</th><th>Клиент</th><th>Услуга</th><th>Сумма</th><th>Статус</th></tr>';
            tbody.innerHTML = (fin.orders || []).map(o => `
                <tr><td>${o.id}</td><td>${o.date}</td><td>${o.client}</td><td>${o.service}</td><td>${formatMoney(o.amount)}</td>
                <td><span class="list-item-badge ${o.status === 'Завершён' ? 'badge-green' : 'badge-blue'}">${o.status}</span></td></tr>
            `).join('') || '<tr><td colspan="6" class="empty-state">Нет данных</td></tr>';
            break;
        case 'cashops':
            thead.innerHTML = '<tr><th>Дата</th><th>Время</th><th>Тип</th><th>Сумма</th><th>Примечание</th></tr>';
            tbody.innerHTML = (fin.cashOps || []).map(c => `
                <tr><td>${c.date}</td><td>${c.time}</td>
                <td><span class="list-item-badge ${c.type === 'Внесение' ? 'badge-green' : 'badge-orange'}">${c.type}</span></td>
                <td>${formatMoney(c.amount)}</td><td>${c.note}</td></tr>
            `).join('') || '<tr><td colspan="5" class="empty-state">Нет данных</td></tr>';
            break;
    }
}

// ===== DOCUMENTS =====
function initDocuments() {
    document.querySelectorAll('.doc-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.doc-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadDocuments(tab.dataset.doc);
        });
    });
    document.getElementById('btn-add-document').addEventListener('click', () => openDocumentModal());
    document.getElementById('modal-document-close').addEventListener('click', () => closeModal('modal-document'));
    document.getElementById('btn-cancel-document').addEventListener('click', () => closeModal('modal-document'));
    document.getElementById('document-form').addEventListener('submit', saveDocument);
}

function loadDocuments(tab = 'incoming') {
    const docs = DB.get('documents', []).filter(d => d.type === tab);
    const thead = document.getElementById('doc-table-head');
    const tbody = document.getElementById('doc-table-body');

    thead.innerHTML = '<tr><th>Дата</th><th>Наименование</th><th>Кол-во</th><th>Сумма</th><th>Комментарий</th><th>Действия</th></tr>';
    tbody.innerHTML = docs.map(d => `
        <tr>
            <td>${d.date}</td><td>${d.item}</td><td>${d.qty}</td><td>${formatMoney(d.amount)}</td><td>${d.comment || '—'}</td>
            <td>
                <button class="btn-action" onclick="openDocumentModal('${d.id}')" title="Редактировать">
                    <span class="material-icons-round">edit</span>
                </button>
                <button class="btn-action danger" onclick="deleteDocument('${d.id}')" title="Удалить">
                    <span class="material-icons-round">delete</span>
                </button>
            </td>
        </tr>
    `).join('') || `<tr><td colspan="6" class="empty-state">Нет документов</td></tr>`;
}

function openDocumentModal(id = null) {
    const form = document.getElementById('document-form');
    form.reset();
    document.getElementById('doc-id').value = '';
    if (id) {
        const doc = DB.get('documents', []).find(d => String(d.id) === String(id));
        if (!doc) return;
        document.getElementById('modal-document-title').textContent = 'Редактировать документ';
        document.getElementById('doc-id').value = doc.id;
        document.getElementById('doc-type').value = doc.type;
        document.getElementById('doc-date').value = doc.date;
        document.getElementById('doc-item').value = doc.item;
        document.getElementById('doc-qty').value = doc.qty;
        document.getElementById('doc-amount').value = doc.amount;
        document.getElementById('doc-comment').value = doc.comment || '';
    } else {
        document.getElementById('modal-document-title').textContent = 'Новый документ';
        document.getElementById('doc-date').value = todayLocal();
    }
    openModal('modal-document');
}

function saveDocument(e) {
    e.preventDefault();
    const docs = DB.get('documents', []);
    const id = document.getElementById('doc-id').value;
    const data = {
        type: document.getElementById('doc-type').value,
        date: document.getElementById('doc-date').value,
        item: document.getElementById('doc-item').value.trim(),
        qty: parseInt(document.getElementById('doc-qty').value) || 0,
        amount: parseFloat(document.getElementById('doc-amount').value) || 0,
        comment: document.getElementById('doc-comment').value.trim(),
    };
    if (id) {
        const idx = docs.findIndex(d => d.id === parseInt(id));
        if (idx >= 0) docs[idx] = { ...docs[idx], ...data };
    } else {
        data.id = Date.now();
        docs.push(data);
    }
    DB.set('documents', docs);
    closeModal('modal-document');
    loadDocuments(data.type);
    showToast('Документ сохранён');
}

function deleteDocument(id) {
    showConfirm('Удалить документ?', 'Это действие нельзя отменить', () => {
        let docs = DB.get('documents', []);
        docs = docs.filter(d => d.id !== id);
        DB.set('documents', docs);
        loadDocuments();
        showToast('Документ удалён');
    });
}

// ===== CLIENTS =====
function initClients() {
    document.getElementById('btn-add-client').addEventListener('click', () => openClientModal());
    document.getElementById('modal-client-close').addEventListener('click', () => closeModal('modal-client'));
    document.getElementById('btn-cancel-client').addEventListener('click', () => closeModal('modal-client'));
    document.getElementById('client-form').addEventListener('submit', saveClient);

    document.getElementById('client-search').addEventListener('input', (e) => {
        loadClients(e.target.value);
    });

    document.getElementById('btn-loyalty-settings').addEventListener('click', () => {
        const pct = DB.get('loyaltyPercent', 5);
        document.getElementById('loyalty-range').value = pct;
        document.getElementById('loyalty-range-value').textContent = pct + '%';
        document.getElementById('loyalty-example').textContent = Math.round(1000 * pct / 100);
        openModal('modal-loyalty');
    });
    document.getElementById('modal-loyalty-close').addEventListener('click', () => closeModal('modal-loyalty'));
    document.getElementById('loyalty-range').addEventListener('input', (e) => {
        const v = e.target.value;
        document.getElementById('loyalty-range-value').textContent = v + '%';
        document.getElementById('loyalty-example').textContent = Math.round(1000 * v / 100);
    });
    document.getElementById('btn-save-loyalty').addEventListener('click', () => {
        const pct = parseInt(document.getElementById('loyalty-range').value);
        DB.set('loyaltyPercent', pct);
        document.getElementById('loyalty-percent').textContent = pct;
        closeModal('modal-loyalty');
        showToast('Процент начисления обновлён: ' + pct + '%');
    });

    document.getElementById('btn-add-groldiks').addEventListener('click', () => {
        const clientId = parseInt(document.getElementById('client-id').value);
        const amount = parseInt(document.getElementById('client-groldik-change').value) || 0;
        if (amount <= 0) return;
        const clients = DB.get('clients', []);
        const client = clients.find(c => String(c.id) === String(clientId));
        if (client) {
            client.groldiks = (client.groldiks || 0) + amount;
            DB.set('clients', clients);
            document.getElementById('client-groldiks').textContent = client.groldiks;
            document.getElementById('client-groldik-change').value = '';
            showToast(`+${amount} Грольдиков начислено`);
        }
    });

    document.getElementById('btn-spend-groldiks').addEventListener('click', () => {
        const clientId = parseInt(document.getElementById('client-id').value);
        const amount = parseInt(document.getElementById('client-groldik-change').value) || 0;
        if (amount <= 0) return;
        const clients = DB.get('clients', []);
        const client = clients.find(c => String(c.id) === String(clientId));
        if (client) {
            if (amount > (client.groldiks || 0)) {
                showToast('Недостаточно Грольдиков', 'error');
                return;
            }
            client.groldiks = (client.groldiks || 0) - amount;
            DB.set('clients', clients);
            document.getElementById('client-groldiks').textContent = client.groldiks;
            document.getElementById('client-groldik-change').value = '';
            showToast(`-${amount} Грольдиков списано`);
        }
    });
}

function loadClients(search = '') {
    const pct = DB.get('loyaltyPercent', 5);
    document.getElementById('loyalty-percent').textContent = pct;

    let clients = DB.get('clients', []);
    if (search) {
        const q = search.toLowerCase();
        clients = clients.filter(c =>
            (c.firstName + ' ' + c.lastName).toLowerCase().includes(q) ||
            (c.phone || '').includes(q)
        );
    }

    const tbody = document.getElementById('clients-table-body');
    tbody.innerHTML = clients.map(c => `
        <tr>
            <td><strong>${c.firstName} ${c.lastName || ''}</strong></td>
            <td>${c.phone || '—'}</td>
            <td>${c.visits && c.visits.length ? c.visits[0].date : '—'}</td>
            <td>${c.visits ? c.visits.map(v => v.game).join(', ') : '—'}</td>
            <td>${formatMoney(c.totalSpent || 0)}</td>
            <td><span style="color:var(--accent);font-weight:700">${c.groldiks || 0} G</span></td>
            <td>
                <button class="btn-action" onclick="openClientModal('${c.id}')" title="Подробнее">
                    <span class="material-icons-round">edit</span>
                </button>
                <button class="btn-action danger" onclick="deleteClient('${c.id}')" title="Удалить">
                    <span class="material-icons-round">delete</span>
                </button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="7" class="empty-state">Клиенты не найдены</td></tr>';
}

function openClientModal(id = null) {
    const form = document.getElementById('client-form');
    form.reset();
    document.getElementById('client-id').value = '';
    document.getElementById('client-history').style.display = 'none';
    document.getElementById('client-loyalty-card').style.display = 'none';

    if (id) {
        const client = DB.get('clients', []).find(c => String(c.id) === String(id));
        if (!client) return;
        document.getElementById('modal-client-title').textContent = client.firstName + ' ' + (client.lastName || '');
        document.getElementById('client-id').value = client.id;
        document.getElementById('client-first-name').value = client.firstName;
        document.getElementById('client-last-name').value = client.lastName || '';
        document.getElementById('client-phone').value = client.phone || '';
        document.getElementById('client-email').value = client.email || '';
        document.getElementById('client-dob').value = client.dob || '';
        document.getElementById('client-notes').value = client.notes || '';

        if (client.visits && client.visits.length) {
            document.getElementById('client-history').style.display = 'block';
            document.getElementById('client-history-list').innerHTML = client.visits.map(v => `
                <div class="list-item">
                    <span class="material-icons-round">sports_esports</span>
                    <div class="list-item-info">
                        <strong>${v.game}</strong>
                        <span>${v.date}</span>
                    </div>
                    <span>${formatMoney(v.amount)}</span>
                </div>
            `).join('');
        }

        document.getElementById('client-loyalty-card').style.display = 'block';
        document.getElementById('client-groldiks').textContent = client.groldiks || 0;
    } else {
        document.getElementById('modal-client-title').textContent = 'Новый клиент';
    }

    openModal('modal-client');
}

function saveClient(e) {
    e.preventDefault();
    const clients = DB.get('clients', []);
    const id = document.getElementById('client-id').value;
    const data = {
        firstName: document.getElementById('client-first-name').value.trim(),
        lastName: document.getElementById('client-last-name').value.trim(),
        phone: document.getElementById('client-phone').value.trim(),
        email: document.getElementById('client-email').value.trim(),
        dob: document.getElementById('client-dob').value,
        notes: document.getElementById('client-notes').value.trim(),
    };
    if (id) {
        const idx = clients.findIndex(c => c.id === parseInt(id));
        if (idx >= 0) clients[idx] = { ...clients[idx], ...data };
    } else {
        data.id = Date.now();
        data.groldiks = 0;
        data.totalSpent = 0;
        data.visits = [];
        clients.push(data);
    }
    DB.set('clients', clients);
    closeModal('modal-client');
    loadClients();
    showToast('Клиент сохранён');
}

function deleteClient(id) {
    showConfirm('Удалить клиента?', 'Все данные клиента будут удалены', () => {
        let clients = DB.get('clients', []);
        clients = clients.filter(c => c.id !== id);
        DB.set('clients', clients);
        loadClients();
        showToast('Клиент удалён');
    });
}

// ===== SETTINGS =====
function initSettings() {
    const rules = DB.get('salaryRules', {
        instructor: { shiftRate: 1500, bonusPercent: 5 },
        admin: { shiftRate: 0, bonusPercent: 5 }
    });
    document.getElementById('rule-instructor-rate').value = rules.instructor?.shiftRate ?? 1500;
    document.getElementById('rule-instructor-bonus').value = rules.instructor?.bonusPercent ?? 5;
    document.getElementById('rule-admin-rate').value = rules.admin?.shiftRate ?? 0;
    document.getElementById('rule-admin-bonus').value = rules.admin?.bonusPercent ?? 5;

    document.getElementById('btn-save-salary-rules').addEventListener('click', () => {
        const newRules = {
            instructor: {
                shiftRate: parseFloat(document.getElementById('rule-instructor-rate').value) || 0,
                bonusPercent: parseFloat(document.getElementById('rule-instructor-bonus').value) || 0
            },
            admin: {
                shiftRate: parseFloat(document.getElementById('rule-admin-rate').value) || 0,
                bonusPercent: parseFloat(document.getElementById('rule-admin-bonus').value) || 0
            }
        };
        DB.set('salaryRules', newRules);
        showToast('Правила начисления зарплаты сохранены');
    });

    const stock = DB.get('stock', { balls: 0, ballsMax: 10000, grenades: 0, grenadesMax: 500 });
    document.getElementById('set-balls').value = stock.balls;
    document.getElementById('set-balls-max').value = stock.ballsMax;
    document.getElementById('set-grenades').value = stock.grenades;
    document.getElementById('set-grenades-max').value = stock.grenadesMax;

    document.getElementById('btn-save-stock').addEventListener('click', () => {
        const newStock = {
            balls: parseInt(document.getElementById('set-balls').value) || 0,
            ballsMax: parseInt(document.getElementById('set-balls-max').value) || 10000,
            grenades: parseInt(document.getElementById('set-grenades').value) || 0,
            grenadesMax: parseInt(document.getElementById('set-grenades-max').value) || 500,
        };
        DB.set('stock', newStock);
        loadStock();
        showToast('Данные склада обновлены');
    });

    document.querySelectorAll('.color-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-opt').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const color = btn.dataset.color;
            DB.set('accentColor', color);
            applyAccentColor(color);
            showToast('Цвет обновлён');
        });
    });

    document.getElementById('btn-reset-data').addEventListener('click', () => {
        showConfirm('Сбросить все данные?', 'Все данные будут удалены без возможности восстановления', () => {
            Object.keys(localStorage).filter(k => k.startsWith('hp_')).forEach(k => localStorage.removeItem(k));
            initData();
            showToast('Данные сброшены');
            setTimeout(() => location.reload(), 500);
        });
    });

    // Google Calendar settings
    const gcalClientIdInput = document.getElementById('gcal-client-id');
    const gcalCalendarIdInput = document.getElementById('gcal-calendar-id');
    if (gcalClientIdInput) {
        gcalClientIdInput.value = localStorage.getItem('hp_gcal_client_id') || '';
        gcalClientIdInput.addEventListener('change', () => {
            localStorage.setItem('hp_gcal_client_id', gcalClientIdInput.value.trim());
            GCalSync.reinitGis();
            GCalSync.init();
        });
    }
    if (gcalCalendarIdInput) {
        gcalCalendarIdInput.value = localStorage.getItem('hp_gcal_calendar_id') || 'primary';
        gcalCalendarIdInput.addEventListener('change', () => {
            localStorage.setItem('hp_gcal_calendar_id', gcalCalendarIdInput.value.trim() || 'primary');
        });
    }
    document.getElementById('btn-connect-gcal').addEventListener('click', () => {
        if (GCalSync.isConnected()) {
            GCalSync.disconnect();
        } else {
            GCalSync.authorize();
        }
    });
    const gsheetsBtn = document.getElementById('btn-connect-gsheets');
    if (gsheetsBtn) gsheetsBtn.addEventListener('click', () => {
        showToast('Интеграция с Google Таблицами будет доступна после подключения API');
    });
    document.getElementById('btn-connect-sigma').addEventListener('click', () => {
        showToast('Интеграция с SIGMA ATOL будет доступна после подключения API');
    });
}

function applyAccentColor(color) {
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-dim', color + '25');
    document.documentElement.style.setProperty('--accent-glow', color + '4D');
    if (document.querySelector('.page#page-dashboard.active')) loadDashboard();
}

// ===== HELPERS =====
function formatMoney(n) {
    return new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
}

function getRoleName(role) {
    const names = { director: 'Директор', admin: 'Администратор', instructor: 'Инструктор' };
    return names[role] || role;
}

function getEventTypeName(type) {
    const names = { paintball: 'Пейнтбол', laser: 'Лазертаг', quest: 'Квест', corporate: 'Корпоратив', birthday: 'День рождения', other: 'Другое' };
    return names[type] || type;
}

function getStatusName(status) {
    const names = { pending: 'Ожидает', confirmed: 'Подтверждено', completed: 'Выполнено', cancelled: 'Отменено' };
    return names[status] || status || 'Ожидает';
}

function getInstructorName(id) {
    const emp = DB.get('employees', []).find(e => String(e.id) === String(id));
    return emp ? emp.firstName + ' ' + emp.lastName : '—';
}

function updateDate() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('ru-RU', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    const topBarDate = document.getElementById('top-bar-date');
    if (topBarDate) topBarDate.textContent = dateStr;
}

// ===== MODALS =====
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
});

// ===== TOAST =====
let toastTimer = null;
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toast-icon');
    const msg = document.getElementById('toast-message');
    msg.textContent = message;
    icon.textContent = type === 'error' ? 'error' : 'check_circle';
    icon.style.color = type === 'error' ? 'var(--red)' : 'var(--green)';
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===== CONFIRM DIALOG =====
let confirmCallback = null;
function showConfirm(title, message, callback) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    confirmCallback = callback;
    openModal('modal-confirm');
}

document.getElementById('confirm-ok').addEventListener('click', () => {
    closeModal('modal-confirm');
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
});
document.getElementById('confirm-cancel').addEventListener('click', () => {
    closeModal('modal-confirm');
    confirmCallback = null;
});
