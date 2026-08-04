/**
 * BAXIS PROTOCOL — AUTHENTICATION ENGINE (`auth.js`)
 * Powered by Supabase Auth & PostgreSQL
 */

document.documentElement.classList.add('js-enabled');

(function () {
  'use strict';

  const System = {
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,

    debounce(fn, delay = 100) {
      let timer;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    },

    announce(message) {
      let announcer = document.getElementById('a11y-announcer');
      if (!announcer) {
        announcer = document.createElement('div');
        announcer.id = 'a11y-announcer';
        announcer.setAttribute('aria-live', 'polite');
        announcer.className = 'sr-only';
        announcer.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
        document.body.appendChild(announcer);
      }
      announcer.textContent = message;
    }
  };

  /* ==========================================================================
     1. VALIDATION LOGIC
     ========================================================================== */
  const ValidationEngine = {
    emailRegex: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,

    validateName(name) {
      if (!name || name.trim().length < 2) {
        return { isValid: false, error: 'Name must be at least 2 characters.' };
      }
      return { isValid: true, error: '' };
    },

    validateEmail(email) {
      if (!email || !email.trim()) {
        return { isValid: false, error: 'Email address is required.' };
      }
      if (!this.emailRegex.test(email.trim())) {
        return { isValid: false, error: 'Please enter a valid email address.' };
      }
      return { isValid: true, error: '' };
    },

    validateSignInPassword(password) {
      if (!password) {
        return { isValid: false, error: 'Password is required.' };
      }
      return { isValid: true, error: '' };
    },

    validateSignUpPassword(password) {
      if (!password) {
        return { isValid: false, error: 'Password is required.' };
      }
      if (password.length < 8) {
        return { isValid: false, error: 'Password must be at least 8 characters.' };
      }
      return { isValid: true, error: '' };
    },

    validateTerms(isChecked) {
      if (!isChecked) {
        return { isValid: false, error: 'You must accept the Terms and Privacy Policy.' };
      }
      return { isValid: true, error: '' };
    }
  };

  /* ==========================================================================
     2. PASSWORD VISIBILITY & STRENGTH METER
     ========================================================================== */
  class PasswordManager {
    constructor() {
      this.initVisibilityToggles();
      this.initStrengthMeter();
    }

    initVisibilityToggles() {
      const toggles = [
        { btnId: 'toggle-signin-password', inputId: 'signin-password' },
        { btnId: 'toggle-signup-password', inputId: 'signup-password' }
      ];

      toggles.forEach(({ btnId, inputId }) => {
        const btn = document.getElementById(btnId);
        const input = document.getElementById(inputId);

        if (btn && input) {
          btn.addEventListener('click', () => {
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';

            const eyeOpen = btn.querySelector('.eye-open');
            const eyeClosed = btn.querySelector('.eye-closed');

            if (eyeOpen && eyeClosed) {
              eyeOpen.hidden = isPassword;
              eyeClosed.hidden = !isPassword;
            }
          });
        }
      });
    }

    initStrengthMeter() {
      const signupPassInput = document.getElementById('signup-password');
      if (!signupPassInput) return;

      const bars = [
        document.getElementById('bar-1'),
        document.getElementById('bar-2'),
        document.getElementById('bar-3'),
        document.getElementById('bar-4')
      ];
      const strengthLabel = document.getElementById('strength-label');

      signupPassInput.addEventListener('input', System.debounce((e) => {
        const val = e.target.value;
        let score = 0;

        if (val.length >= 8) score += 1;
        if (/[0-9!@#$%^&*()]/.test(val)) score += 1;
        if (/[A-Z]/.test(val)) score += 1;
        if (val.length >= 12) score += 1;

        bars.forEach((bar, idx) => {
          if (!bar) return;
          bar.className = 'bar';
          if (idx < score) {
            const colors = ['weak', 'fair', 'good', 'strong'];
            bar.classList.add(colors[score - 1] || 'weak');
          }
        });

        if (strengthLabel) {
          const labels = ['Weak', 'Fair', 'Good', 'Strong'];
          strengthLabel.textContent = val.length ? `Strength: ${labels[score - 1] || 'Weak'}` : 'Password strength';
        }
      }, 50));
    }
  }

  /* ==========================================================================
     3. AUTH UI MANAGER
     ========================================================================== */
  class AuthUI {
    constructor() {
      this.layout = document.getElementById('auth-layout');
      this.tabSignIn = document.getElementById('tab-signin');
      this.tabSignUp = document.getElementById('tab-signup');
      this.viewSignIn = document.getElementById('view-signin');
      this.viewSignUp = document.getElementById('view-signup');

      this.initViewSwitcher();
    }

    initViewSwitcher() {
      if (!this.tabSignIn || !this.tabSignUp) return;
      this.tabSignIn.addEventListener('click', () => this.switchView('signin'));
      this.tabSignUp.addEventListener('click', () => this.switchView('signup'));
    }

    switchView(targetView) {
      const isSignIn = targetView === 'signin';
      if (this.layout) this.layout.setAttribute('data-view', targetView);

      this.tabSignIn.classList.toggle('active', isSignIn);
      this.tabSignUp.classList.toggle('active', !isSignIn);

      const tabSwitcher = document.getElementById('auth-tab-switcher');
      if (tabSwitcher) tabSwitcher.style.display = 'flex';

      const viewForgot = document.getElementById('view-forgot-password');
      if (viewForgot) {
        viewForgot.setAttribute('hidden', 'true');
        viewForgot.style.display = 'none';
      }

      if (isSignIn) {
        if (this.viewSignIn) {
          this.viewSignIn.removeAttribute('hidden');
          this.viewSignIn.style.display = 'block';
        }
        if (this.viewSignUp) {
          this.viewSignUp.setAttribute('hidden', 'true');
          this.viewSignUp.style.display = 'none';
        }
        document.getElementById('signin-email')?.focus();
      } else {
        if (this.viewSignUp) {
          this.viewSignUp.removeAttribute('hidden');
          this.viewSignUp.style.display = 'block';
        }
        if (this.viewSignIn) {
          this.viewSignIn.setAttribute('hidden', 'true');
          this.viewSignIn.style.display = 'none';
        }
        document.getElementById('signup-name')?.focus();
      }
      this.clearAlerts();
    }

    showFieldError(inputId, errorMsg) {
      const input = document.getElementById(inputId);
      const errorSpan = document.getElementById(`err-${inputId}`);
      if (input) input.classList.add('is-invalid');
      if (errorSpan) errorSpan.textContent = errorMsg;
    }

    clearFieldError(inputId) {
      const input = document.getElementById(inputId);
      const errorSpan = document.getElementById(`err-${inputId}`);
      if (input) input.classList.remove('is-invalid');
      if (errorSpan) errorSpan.textContent = '';
    }

    showAlert(alertId, message) {
      const alert = document.getElementById(alertId);
      const msgSpan = document.getElementById(`${alertId}-msg`);
      if (alert && msgSpan) {
        msgSpan.textContent = message;
        alert.removeAttribute('hidden');
      }
    }

    clearAlerts() {
      ['signin-alert', 'signup-alert'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.setAttribute('hidden', 'true');
      });
    }

    setButtonLoading(btnId, isLoading) {
      const btn = document.getElementById(btnId);
      if (!btn) return;

      const spinner = btn.querySelector('.btn-spinner');
      const text = btn.querySelector('.btn-text');

      if (isLoading) {
        btn.disabled = true;
        btn.classList.add('is-loading');
        if (spinner) spinner.removeAttribute('hidden');
      } else {
        btn.disabled = false;
        btn.classList.remove('is-loading');
        if (spinner) spinner.setAttribute('hidden', 'true');
      }
    }

    setButtonSuccess(btnId, successText) {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      const text = btn.querySelector('.btn-text');
      const spinner = btn.querySelector('.btn-spinner');

      if (spinner) spinner.setAttribute('hidden', 'true');
      btn.style.background = 'var(--state-success, #10B981)';
      btn.style.color = '#FFFFFF';
      if (text) text.textContent = `✓ ${successText}`;
    }
  }

  /* ==========================================================================
     4. SUPABASE REAL AUTHENTICATION ORCHESTRATOR
     ========================================================================== */
  class AuthApp {
    constructor() {
      this.ui = new AuthUI();
      this.passwordManager = new PasswordManager();
      this.init();
    }

    init() {
      this.checkActiveSession();
      this.bindFormSubmissions();
    }

    getSupabase() {
      if (window.baxisSupabase) return window.baxisSupabase;
      if (window.supabaseClient) return window.supabaseClient;
      if (window.supabase && window.supabase.auth) return window.supabase;
      return null;
    }

    async checkActiveSession() {
      const supabase = this.getSupabase();
      if (!supabase) return;
      
      const { data: { session } } = await supabase.auth.getSession();
      if (session && !window.location.search.includes('mode=reset') && !window.location.hash.includes('type=recovery')) {
        window.location.href = 'dashboard.html';
      }
    }

    bindFormSubmissions() {
      // 1. REAL SUPABASE SIGN IN
      document.getElementById('form-signin')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        this.ui.clearAlerts();

        const email = document.getElementById('signin-email').value;
        const password = document.getElementById('signin-password').value;

        const emailRes = ValidationEngine.validateEmail(email);
        const passRes = ValidationEngine.validateSignInPassword(password);

        if (!emailRes.isValid) this.ui.showFieldError('signin-email', emailRes.error);
        if (!passRes.isValid) this.ui.showFieldError('signin-password', passRes.error);

        if (!emailRes.isValid || !passRes.isValid) return;

        this.ui.setButtonLoading('btn-submit-signin', true);

        try {
          const activeClient = this.getSupabase();
          if (!activeClient) throw new Error('Supabase client not initialized.');

          const { data, error } = await activeClient.auth.signInWithPassword({
            email: email.trim(),
            password: password
          });

          if (error) throw error;

          this.ui.setButtonSuccess('btn-submit-signin', 'Authenticated!');
          System.announce('Authentication successful. Redirecting to workspace.');

          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 800);

        } catch (error) {
          this.ui.setButtonLoading('btn-submit-signin', false);
          this.ui.showAlert('signin-alert', error.message || 'Invalid email or password.');
        }
      });

      // 2. REAL SUPABASE SIGN UP
      document.getElementById('form-signup')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        this.ui.clearAlerts();

        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const terms = document.getElementById('signup-terms').checked;

        const nameRes = ValidationEngine.validateName(name);
        const emailRes = ValidationEngine.validateEmail(email);
        const passRes = ValidationEngine.validateSignUpPassword(password);
        const termsRes = ValidationEngine.validateTerms(terms);

        if (!nameRes.isValid) this.ui.showFieldError('signup-name', nameRes.error);
        if (!emailRes.isValid) this.ui.showFieldError('signup-email', emailRes.error);
        if (!passRes.isValid) this.ui.showFieldError('signup-password', passRes.error);
        if (!termsRes.isValid) this.ui.showFieldError('signup-terms', termsRes.error);

        if (!nameRes.isValid || !emailRes.isValid || !passRes.isValid || !termsRes.isValid) return;

        this.ui.setButtonLoading('btn-submit-signup', true);

        try {
          const activeClient = this.getSupabase();
          if (!activeClient) throw new Error('Supabase client not initialized.');

          const { data, error } = await activeClient.auth.signUp({
            email: email.trim(),
            password: password,
            options: {
              data: {
                full_name: name.trim()
              }
            }
          });

          if (error) throw error;

          this.ui.setButtonSuccess('btn-submit-signup', 'Account Created!');
          System.announce('Account created successfully. Redirecting to workspace.');

          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 800);

        } catch (error) {
          this.ui.setButtonLoading('btn-submit-signup', false);
          this.ui.showAlert('signup-alert', error.message || 'Registration failed.');
        }
      });
    }
  }

  /* ==========================================================================
     5. PASSWORD RECOVERY LOGIC (FORGOT & RESET PASSWORD)
     ========================================================================== */
  
  // 1. Click "Forgot Password?" -> Toggle Views
  document.addEventListener('click', (e) => {
    const target = e.target.closest('#link-forgot-password') || e.target.closest('#link-forgot-pass');
    if (target) {
      e.preventDefault();
      const viewForgot = document.getElementById('view-forgot-password');
      const viewSignIn = document.getElementById('view-signin') || document.getElementById('view-login');
      const tabSwitcher = document.getElementById('auth-tab-switcher');

      if (tabSwitcher) tabSwitcher.style.display = 'none';
      if (viewSignIn) {
        viewSignIn.setAttribute('hidden', 'true');
        viewSignIn.style.display = 'none';
      }
      if (viewForgot) {
        viewForgot.removeAttribute('hidden');
        viewForgot.style.display = 'block';
      }
    }

    const backTarget = e.target.closest('#link-back-to-login');
    if (backTarget) {
      e.preventDefault();
      const viewForgot = document.getElementById('view-forgot-password');
      const viewSignIn = document.getElementById('view-signin') || document.getElementById('view-login');
      const tabSwitcher = document.getElementById('auth-tab-switcher');

      if (tabSwitcher) tabSwitcher.style.display = 'flex';
      if (viewForgot) {
        viewForgot.setAttribute('hidden', 'true');
        viewForgot.style.display = 'none';
      }
      if (viewSignIn) {
        viewSignIn.removeAttribute('hidden');
        viewSignIn.style.display = 'block';
      }
    }
  });

  // 2. Submit "Send Recovery Link"
  document.addEventListener('submit', async (e) => {
    if (e.target && e.target.id === 'form-forgot-password') {
      e.preventDefault();
      const emailInput = document.getElementById('forgot-email');
      const email = emailInput ? emailInput.value.trim() : '';
      const alertErr = document.getElementById('alert-forgot-error');
      const alertOk = document.getElementById('alert-forgot-success');
      const btn = document.getElementById('btn-send-reset');

      if (!email) return;

      try {
        if (btn) btn.disabled = true;
        const supabase = window.baxisSupabase || window.supabaseClient || (window.supabase && window.supabase.auth ? window.supabase : null);
        if (!supabase) throw new Error('Supabase client unavailable.');

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth.html?mode=reset`
        });

        if (error) throw error;

        if (alertOk) {
          alertOk.textContent = 'Recovery link sent! Check your email inbox.';
          alertOk.style.display = 'flex';
        }
        if (alertErr) alertErr.style.display = 'none';
        e.target.reset();

      } catch (err) {
        console.error('Password reset request error:', err);
        if (alertErr) {
          const msgSpan = document.getElementById('alert-forgot-error-msg') || alertErr;
          msgSpan.textContent = err.message || 'Failed to send recovery link.';
          alertErr.style.display = 'flex';
        }
        if (alertOk) alertOk.style.display = 'none';
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    // 3. Submit "Update Password"
    if (e.target && e.target.id === 'form-new-password') {
      e.preventDefault();
      const passInput = document.getElementById('new-password-input');
      const newPassword = passInput ? passInput.value.trim() : '';
      const alertErr = document.getElementById('alert-new-pass-error');
      const btn = document.getElementById('btn-save-new-pass');

      if (!newPassword || newPassword.length < 6) {
        if (alertErr) {
          alertErr.textContent = 'Password must be at least 6 characters.';
          alertErr.style.display = 'flex';
        }
        return;
      }

      try {
        if (btn) btn.disabled = true;
        const supabase = window.baxisSupabase || window.supabaseClient || (window.supabase && window.supabase.auth ? window.supabase : null);
        if (!supabase) throw new Error('Supabase client unavailable.');

        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;

        alert('Password updated successfully! Redirecting to workspace...');
        window.location.href = 'dashboard.html';

      } catch (err) {
        console.error('Password update error:', err);
        if (alertErr) {
          alertErr.textContent = err.message || 'Failed to update password.';
          alertErr.style.display = 'flex';
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    }
  });

  // 4. Detect when user returns from clicking password recovery link in email
  document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const isResetMode = urlParams.get('mode') === 'reset' || window.location.hash.includes('type=recovery');

    if (isResetMode) {
      document.querySelectorAll('.auth-form-view').forEach(v => {
        v.setAttribute('hidden', 'true');
        v.style.display = 'none';
      });
      const tabSwitcher = document.getElementById('auth-tab-switcher');
      if (tabSwitcher) tabSwitcher.style.display = 'none';

      const viewNewPass = document.getElementById('view-new-password');
      if (viewNewPass) {
        viewNewPass.removeAttribute('hidden');
        viewNewPass.style.display = 'block';
      }
    }
  });

  /* ==========================================================================
     INIT APP
     ========================================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    new AuthApp();
  });

})();