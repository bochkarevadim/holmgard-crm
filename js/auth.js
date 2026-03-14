/* ============================
   HOLMGARD PARK CRM — FIREBASE AUTH
   ============================ */

var FirebaseAuth = (function() {
    'use strict';

    // Firebase Configuration
    const firebaseConfig = {
        apiKey: "AIzaSyAMKxzR0Dq9cdEltLQ4ekn1IMl5pCKzYjY",
        authDomain: "holmgard-crm-c5680.firebaseapp.com",
        projectId: "holmgard-crm-c5680",
        storageBucket: "holmgard-crm-c5680.firebasestorage.app",
        messagingSenderId: "100243472052",
        appId: "1:100243472052:web:0c2fab368c1fdf7b58a1e1"
    };

    // Initialize Firebase
    const app = firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    // Set persistence to LOCAL (survives browser restart)
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

    // Error messages in Russian
    const ERROR_MESSAGES = {
        'auth/invalid-email': 'Некорректный email адрес',
        'auth/user-disabled': 'Аккаунт заблокирован. Обратитесь к директору',
        'auth/user-not-found': 'Аккаунт не найден',
        'auth/wrong-password': 'Неверный пароль',
        'auth/invalid-credential': 'Неверный email или пароль',
        'auth/too-many-requests': 'Слишком много попыток. Попробуйте позже',
        'auth/email-already-in-use': 'Этот email уже используется',
        'auth/weak-password': 'Пароль должен быть не менее 6 символов',
        'auth/network-request-failed': 'Ошибка сети. Проверьте интернет'
    };

    function getErrorMessage(code) {
        return ERROR_MESSAGES[code] || 'Ошибка авторизации. Попробуйте ещё раз';
    }

    // ===== AUTH STATE OBSERVER =====
    auth.onAuthStateChanged(function(user) {
        if (user) {
            // User is signed in — check if employee exists and not blocked
            const email = user.email;
            sessionStorage.setItem('hp_firebase_email', email);

            const employees = DB.get('employees', []);
            const employee = employees.find(function(e) {
                return e.email && e.email.toLowerCase() === email.toLowerCase();
            });

            if (employee && employee.blocked) {
                // Account is blocked
                showFirebaseError('Ваш аккаунт заблокирован. Обратитесь к директору');
                auth.signOut();
                return;
            }

            // Show PIN screen
            hideFirebaseLogin();
            showPinScreen();
        } else {
            // User is signed out — show Firebase login
            sessionStorage.removeItem('hp_firebase_email');
            showFirebaseLogin();
        }
    });

    // ===== UI HELPERS =====
    function showFirebaseLogin() {
        var fbScreen = document.getElementById('firebase-login-screen');
        var loginScreen = document.getElementById('login-screen');
        var appScreen = document.getElementById('app-screen');
        var empScreen = document.getElementById('employee-screen');

        if (fbScreen) fbScreen.classList.add('active');
        if (loginScreen) loginScreen.classList.remove('active');
        if (appScreen) appScreen.classList.remove('active');
        if (empScreen) empScreen.classList.remove('active');

        // Clear form
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
        // Reset pin
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
        }
    }

    function hideFirebaseError() {
        var el = document.getElementById('fb-error');
        if (el) {
            el.textContent = '';
            el.style.display = 'none';
        }
    }

    // ===== LOGIN FORM HANDLER =====
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

            // Disable button
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Вход...';
            }
            hideFirebaseError();

            auth.signInWithEmailAndPassword(email, password)
                .then(function() {
                    // onAuthStateChanged will handle the rest
                })
                .catch(function(error) {
                    showFirebaseError(getErrorMessage(error.code));
                })
                .finally(function() {
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = 'Войти';
                    }
                });
        });

        // Forgot password link
        var forgotLink = document.getElementById('fb-forgot-password');
        if (forgotLink) {
            forgotLink.addEventListener('click', function(e) {
                e.preventDefault();
                var email = document.getElementById('fb-email').value.trim();
                if (!email) {
                    showFirebaseError('Введите email для сброса пароля');
                    return;
                }
                auth.sendPasswordResetEmail(email)
                    .then(function() {
                        showFirebaseError('');
                        var el = document.getElementById('fb-error');
                        if (el) {
                            el.textContent = 'Письмо для сброса пароля отправлено на ' + email;
                            el.style.display = 'block';
                            el.style.color = '#22c55e';
                        }
                    })
                    .catch(function(error) {
                        showFirebaseError(getErrorMessage(error.code));
                    });
            });
        }
    }

    // ===== ACCOUNT MANAGEMENT (for director) =====

    // Create account using secondary app (so director doesn't get logged out)
    function createAccount(email, password) {
        return new Promise(function(resolve, reject) {
            var secondaryApp;
            try {
                secondaryApp = firebase.app('secondary');
            } catch(e) {
                secondaryApp = firebase.initializeApp(firebaseConfig, 'secondary');
            }
            var secondaryAuth = secondaryApp.auth();

            secondaryAuth.createUserWithEmailAndPassword(email, password)
                .then(function(cred) {
                    // Sign out from secondary immediately
                    return secondaryAuth.signOut().then(function() {
                        resolve(cred.user);
                    });
                })
                .catch(function(error) {
                    reject(getErrorMessage(error.code));
                });
        });
    }

    // Reset password for employee
    function resetPassword(email) {
        return auth.sendPasswordResetEmail(email)
            .then(function() { return true; })
            .catch(function(error) {
                throw getErrorMessage(error.code);
            });
    }

    // ===== INIT =====
    // Setup login form when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupLoginForm);
    } else {
        setupLoginForm();
    }

    // ===== PUBLIC API =====
    return {
        getUser: function() { return auth.currentUser; },
        getEmail: function() { return auth.currentUser ? auth.currentUser.email : null; },
        signOut: function() { return auth.signOut(); },
        createAccount: createAccount,
        resetPassword: resetPassword
    };

})();
