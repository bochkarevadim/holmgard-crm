/* ============================
   HOLMGARD PARK CRM — SUPABASE AUTH
   ============================

   Замена Firebase Auth. Публичный API совместим: FirebaseAuth.{getUser,getEmail,signOut,createAccount,resetPassword}
   Под капотом используется Supabase Auth (email+password, password reset).

   Требует:
     • <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>   — до этого файла
     • js/supabase-db.js   — создаёт window.supabaseClient и window.DB
*/

var FirebaseAuth = (function() {
    'use strict';

    // Используем тот же клиент, что и data-layer (persistSession + autoRefresh)
    var sb = window.supabaseClient;
    if (!sb) {
        console.error('[auth] window.supabaseClient не найден — supabase-db.js должен грузиться раньше supabase-auth.js');
    }

    // ─── Русские сообщения об ошибках ───────────────────────
    var ERROR_MESSAGES = {
        'invalid_credentials': 'Неверный email или пароль',
        'invalid_email': 'Некорректный email адрес',
        'user_disabled': 'Аккаунт заблокирован. Обратитесь к директору',
        'user_not_found': 'Аккаунт не найден',
        'email_not_confirmed': 'Email не подтверждён. Проверьте почту',
        'user_already_exists': 'Этот email уже используется',
        'email_address_invalid': 'Некорректный email адрес',
        'weak_password': 'Пароль должен быть не менее 6 символов',
        'over_request_rate_limit': 'Слишком много попыток. Попробуйте позже',
        'over_email_send_rate_limit': 'Слишком много писем отправлено. Попробуйте позже',
        'signup_disabled': 'Регистрация отключена',
        'network_error': 'Ошибка сети. Проверьте интернет'
    };

    function getErrorMessage(err) {
        if (!err) return 'Ошибка авторизации. Попробуйте ещё раз';
        var code = err.code || err.message || '';
        var byCode = ERROR_MESSAGES[code];
        if (byCode) return byCode;
        var msg = String(err.message || '').toLowerCase();
        if (msg.indexOf('invalid login') >= 0 || msg.indexOf('invalid credentials') >= 0) return ERROR_MESSAGES.invalid_credentials;
        if (msg.indexOf('user not found') >= 0) return ERROR_MESSAGES.user_not_found;
        if (msg.indexOf('already registered') >= 0 || msg.indexOf('already been registered') >= 0) return ERROR_MESSAGES.user_already_exists;
        if (msg.indexOf('password should be') >= 0 || msg.indexOf('weak password') >= 0) return ERROR_MESSAGES.weak_password;
        if (msg.indexOf('email') >= 0 && msg.indexOf('invalid') >= 0) return ERROR_MESSAGES.invalid_email;
        if (msg.indexOf('rate limit') >= 0 || msg.indexOf('too many') >= 0) return ERROR_MESSAGES.over_request_rate_limit;
        if (msg.indexOf('network') >= 0 || msg.indexOf('failed to fetch') >= 0) return ERROR_MESSAGES.network_error;
        return 'Ошибка авторизации. Попробуйте ещё раз';
    }

    // ─── Состояние ──────────────────────────────────────────
    var _currentUser = null;       // Supabase user
    var _currentEmail = null;
    var _lastHandledUserId = null; // защита от повторного запуска onSignIn

    // ─── UI Helpers ─────────────────────────────────────────
    function showFirebaseLogin() {
        var fbScreen = document.getElementById('firebase-login-screen');
        var loginScreen = document.getElementById('login-screen');
        var appScreen = document.getElementById('app-screen');
        var empScreen = document.getElementById('employee-screen');

        if (fbScreen) fbScreen.classList.add('active');
        if (loginScreen) loginScreen.classList.remove('active');
        if (appScreen) appScreen.classList.remove('active');
        if (empScreen) empScreen.classList.remove('active');

        var emailInput = document.getElementById('fb-email');
        var passInput = document.getElementById('fb-password');
        if (emailInput) emailInput.value = '';
        if (passInput) passInput.value = '';
        hideFirebaseError();
    }

    function hideFirebaseLogin() {
        var fbScreen = document.getElementById('firebase-login-screen');
        if (fbScreen) fbScreen.classList.remove('active');
    }

    function showPinScreen() {
        var loginScreen = document.getElementById('login-screen');
        if (loginScreen) loginScreen.classList.add('active');
        if (typeof currentPin !== 'undefined') {
            currentPin = '';
            if (typeof updatePinDots === 'function') updatePinDots();
        }
        var pinMsg = document.getElementById('pin-message');
        if (pinMsg) {
            pinMsg.textContent = 'Введите ПИН-код';
            pinMsg.className = 'pin-label';
        }
    }

    function showFirebaseError(msg) {
        var el = document.getElementById('fb-error');
        if (el) {
            el.textContent = msg;
            el.style.display = 'block';
            el.style.color = '';
        }
    }

    function hideFirebaseError() {
        var el = document.getElementById('fb-error');
        if (el) {
            el.textContent = '';
            el.style.display = 'none';
            el.style.color = '';
        }
    }

    // ─── Обработка входа ────────────────────────────────────
    async function onSignIn(user) {
        _currentUser = user;
        _currentEmail = user.email;
        sessionStorage.setItem('hp_firebase_email', user.email);

        // 1. Загрузить данные
        try {
            await DB.initFirestore();
            if (typeof DB.migrateFromLocalStorage === 'function') {
                await DB.migrateFromLocalStorage();
            }
        } catch (err) {
            console.error('Supabase init error:', err);
        }

        // 2. Инициализация приложения + миграции
        if (typeof initData === 'function') initData();
        if (typeof runDataMigrations === 'function') runDataMigrations();

        // 3. Проверка блокировки сотрудника
        var email = (user.email || '').toLowerCase();
        var employees = DB.get('employees', []);
        var employee = employees.find(function(e) {
            return e.email && e.email.toLowerCase() === email;
        });
        if (employee && employee.blocked) {
            showFirebaseError('Ваш аккаунт заблокирован. Обратитесь к директору');
            await sb.auth.signOut();
            return;
        }

        // 4. Восстановление после Google OAuth redirect
        var returningUserId = sessionStorage.getItem('hp_gcal_returning_user_id');
        var returningPage = sessionStorage.getItem('hp_gcal_pre_auth_page');
        if (returningUserId) {
            sessionStorage.removeItem('hp_gcal_returning_user_id');
            sessionStorage.removeItem('hp_gcal_pre_auth_page');
            var savedUser = employees.find(function(e) { return String(e.id) === returningUserId; });
            if (savedUser && typeof currentUser !== 'undefined') {
                currentUser = savedUser;
                hideFirebaseLogin();
                if (typeof onFirestoreReady === 'function') onFirestoreReady();
                if (savedUser.role === 'director') {
                    if (typeof showScreen === 'function') showScreen('app-screen');
                    var dirName = document.getElementById('director-name');
                    if (dirName) dirName.textContent = savedUser.firstName + ' ' + savedUser.lastName;
                    if (typeof navigateTo === 'function') navigateTo(returningPage || 'settings');
                } else {
                    if (typeof showScreen === 'function') showScreen('employee-screen');
                    if (typeof setupEmployeeScreen === 'function') setupEmployeeScreen(savedUser);
                    if (typeof empNavigateTo === 'function') empNavigateTo('emp-dashboard');
                }
                return;
            }
        }

        // 5. Уведомление о готовности данных
        if (typeof onFirestoreReady === 'function') onFirestoreReady();

        // 6. Попытка восстановить сессию (для мобильных)
        if (typeof tryRestoreSession === 'function' && tryRestoreSession()) {
            hideFirebaseLogin();
            return;
        }

        // 7. Показать PIN-экран
        hideFirebaseLogin();
        showPinScreen();
    }

    function onSignOut() {
        _currentUser = null;
        _currentEmail = null;
        _lastHandledUserId = null;
        sessionStorage.removeItem('hp_firebase_email');
        if (DB && typeof DB.teardown === 'function') DB.teardown();
        showFirebaseLogin();
    }

    // ─── Подписка на события Supabase Auth ──────────────────
    if (sb) {
        sb.auth.onAuthStateChange(function(event, session) {
            var user = session && session.user ? session.user : null;

            // SIGNED_IN / TOKEN_REFRESHED / INITIAL_SESSION — всё приводит к "пользователь есть"
            if (user) {
                // Не перезапускать onSignIn для того же пользователя (например, TOKEN_REFRESHED)
                if (_lastHandledUserId === user.id) return;
                _lastHandledUserId = user.id;
                onSignIn(user);
            } else {
                if (_lastHandledUserId === null && _currentUser === null) return;
                onSignOut();
            }
        });

        // Восстановление сессии при загрузке (если persistSession сохранил её)
        sb.auth.getSession().then(function(res) {
            var session = res && res.data ? res.data.session : null;
            if (session && session.user) {
                if (_lastHandledUserId === session.user.id) return;
                _lastHandledUserId = session.user.id;
                onSignIn(session.user);
            } else {
                // Нет сессии — но подождём 1.5с: onAuthStateChange может обновить
                // токен чуть позже (TOKEN_REFRESHED), особенно на мобильных.
                // Показываем экран входа только если за это время не залогинились.
                setTimeout(function() {
                    if (!_lastHandledUserId) showFirebaseLogin();
                }, 1500);
            }
        }).catch(function(err) {
            console.error('[auth] getSession error:', err);
            setTimeout(function() {
                if (!_lastHandledUserId) showFirebaseLogin();
            }, 1500);
        });
    }

    // ─── Форма логина ───────────────────────────────────────
    function setupLoginForm() {
        var form = document.getElementById('fb-login-form');
        if (!form) return;

        form.addEventListener('submit', function(e) {
            e.preventDefault();
            var email = document.getElementById('fb-email').value.trim();
            var password = document.getElementById('fb-password').value;
            var btn = document.getElementById('fb-login-btn');

            if (!email || !password) {
                showFirebaseError('Введите email и пароль');
                return;
            }

            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Вход...';
            }
            hideFirebaseError();

            if (!sb) {
                showFirebaseError('Ошибка инициализации. Перезагрузите страницу (F5)');
                if (btn) { btn.disabled = false; btn.textContent = 'Войти'; }
                return;
            }

            sb.auth.signInWithPassword({ email: email, password: password })
                .then(function(res) {
                    if (res.error) {
                        showFirebaseError(getErrorMessage(res.error));
                    }
                    // onAuthStateChange обработает успех
                })
                .catch(function(error) {
                    showFirebaseError(getErrorMessage(error));
                })
                .finally(function() {
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = 'Войти';
                    }
                });
        });

        var forgotLink = document.getElementById('fb-forgot-password');
        if (forgotLink) {
            forgotLink.addEventListener('click', function(e) {
                e.preventDefault();
                var email = document.getElementById('fb-email').value.trim();
                if (!email) {
                    showFirebaseError('Введите email для сброса пароля');
                    return;
                }
                sb.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin + window.location.pathname
                })
                    .then(function(res) {
                        if (res.error) {
                            showFirebaseError(getErrorMessage(res.error));
                            return;
                        }
                        var el = document.getElementById('fb-error');
                        if (el) {
                            el.textContent = 'Письмо для сброса пароля отправлено на ' + email;
                            el.style.display = 'block';
                            el.style.color = '#22c55e';
                        }
                    })
                    .catch(function(error) {
                        showFirebaseError(getErrorMessage(error));
                    });
            });
        }
    }

    // ─── Создание аккаунта (для директора) ─────────────────
    // Supabase signUp автоматически НЕ логинит нового пользователя, если email confirmation ВКЛЮЧЕН.
    // Если confirmation отключён, signUp залогинит нового пользователя и выкинет директора.
    // Поэтому используем admin API через Edge Function или сохраняем сессию директора и восстанавливаем её.
    function createAccount(email, password) {
        return new Promise(function(resolve, reject) {
            // Сохраняем текущую сессию директора
            sb.auth.getSession().then(function(sessRes) {
                var directorSession = sessRes.data ? sessRes.data.session : null;

                sb.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        // Не отправляем confirmation email при создании аккаунта директором
                        emailRedirectTo: window.location.origin + window.location.pathname
                    }
                }).then(function(res) {
                    if (res.error) {
                        reject(getErrorMessage(res.error));
                        return;
                    }
                    var newUser = res.data ? res.data.user : null;

                    // Если Supabase залогинил нового пользователя (email confirmation off) — восстановим сессию директора
                    var needRestore = res.data && res.data.session && directorSession &&
                                      res.data.session.access_token !== directorSession.access_token;
                    if (needRestore) {
                        // Блокируем обработчик onAuthStateChange чтобы он не запустил onSignIn для нового юзера
                        _lastHandledUserId = directorSession.user.id;
                        sb.auth.setSession({
                            access_token: directorSession.access_token,
                            refresh_token: directorSession.refresh_token
                        }).then(function() {
                            resolve(newUser);
                        }).catch(function(err) {
                            console.error('[auth] restore director session failed:', err);
                            resolve(newUser); // всё равно возвращаем нового юзера — директору придётся залогиниться заново
                        });
                    } else {
                        resolve(newUser);
                    }
                }).catch(function(error) {
                    reject(getErrorMessage(error));
                });
            });
        });
    }

    // ─── Сброс пароля сотрудника ───────────────────────────
    function resetPassword(email) {
        return sb.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname
        }).then(function(res) {
            if (res.error) throw getErrorMessage(res.error);
            return true;
        }).catch(function(error) {
            if (typeof error === 'string') throw error;
            throw getErrorMessage(error);
        });
    }

    // ─── Init DOM ──────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupLoginForm);
    } else {
        setupLoginForm();
    }

    // ─── Public API (совместимо с Firebase-версией) ────────
    return {
        getUser: function() { return _currentUser; },
        getEmail: function() { return _currentEmail; },
        signOut: function() {
            return sb.auth.signOut().then(function(res) {
                // onAuthStateChange сам вызовет onSignOut()
                if (res && res.error) console.error('[auth] signOut error:', res.error);
                return true;
            });
        },
        createAccount: createAccount,
        resetPassword: resetPassword
    };
})();

// Alias для ясности — тот же объект под обоими именами.
// Позволяет постепенно переводить код с FirebaseAuth.* на SupabaseAuth.* без правок в app.js.
var SupabaseAuth = FirebaseAuth;
