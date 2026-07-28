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

      if (isSignIn) {
        this.viewSignIn.removeAttribute('hidden');
        this.viewSignUp.setAttribute('hidden', 'true');
        document.getElementById('signin-email')?.focus();
      } else {
        this.viewSignUp.removeAttribute('hidden');
        this.viewSignIn.setAttribute('hidden', 'true');
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
      btn.style.background = 'var(--emerald)';
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
      this.supabase = window.baxisSupabase;
      this.init();
    }

    init() {
      this.checkActiveSession();
      this.bindFormSubmissions();
    }

    async checkActiveSession() {
      if (!this.supabase) return;
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session) {
        // Already logged in, redirect to dashboard
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
          if (!this.supabase) throw new Error('Supabase client not initialized in supabase.js');

          const { data, error } = await this.supabase.auth.signInWithPassword({
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
          if (!this.supabase) throw new Error('Supabase client not initialized in supabase.js');

          const { data, error } = await this.supabase.auth.signUp({
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

  document.addEventListener('DOMContentLoaded', () => {
    new AuthApp();
  });

})();