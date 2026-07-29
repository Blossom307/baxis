/**
 * BAXIS PROTOCOL — DEAL BUILDER ENGINE (`create.js`)
 * Powered by Supabase PostgreSQL Database
 */

document.documentElement.classList.add('js-enabled');

(function () {
  'use strict';

  const System = {
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
     1. LIVE DM PREVIEW MANAGER
     ========================================================================== */
  class DealBuilderLivePreview {
    constructor() {
      this.titleInput = document.getElementById('deal-title');
      this.counterpartyInput = document.getElementById('counterparty-id');
      this.amountInput = document.getElementById('deal-amount');
      this.tokenSelect = document.getElementById('deal-token');
      this.networkSelect = document.getElementById('deal-network');
      this.timelockSelect = document.getElementById('auto-release-timelock');
      this.roleRadios = document.querySelectorAll('input[name="user-role"]');

      this.previewTitle = document.getElementById('preview-title');
      this.previewAmount = document.getElementById('preview-amount');
      this.previewNetwork = document.getElementById('preview-network');
      this.previewClientName = document.getElementById('preview-client-name');
      this.previewTalentName = document.getElementById('preview-talent-name');
      this.previewStatusText = document.getElementById('preview-status-text');

      this.init();
    }

    init() {
      const updateHandler = () => this.updatePreview();

      if (this.titleInput) this.titleInput.addEventListener('input', System.debounce(updateHandler, 50));
      if (this.counterpartyInput) this.counterpartyInput.addEventListener('input', System.debounce(updateHandler, 50));
      if (this.amountInput) this.amountInput.addEventListener('input', System.debounce(updateHandler, 50));
      if (this.tokenSelect) this.tokenSelect.addEventListener('change', updateHandler);
      if (this.networkSelect) this.networkSelect.addEventListener('change', updateHandler);
      if (this.timelockSelect) this.timelockSelect.addEventListener('change', updateHandler);

      this.roleRadios.forEach((radio) => radio.addEventListener('change', updateHandler));
      this.updatePreview();
    }

    getSelectedRole() {
      let role = 'client';
      this.roleRadios.forEach((r) => { if (r.checked) role = r.value; });
      return role;
    }

    formatCurrency(val, token) {
      if (!val || isNaN(val) || parseFloat(val) <= 0) return `$0.00 ${token}`;
      return `$${parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${token}`;
    }

    updatePreview() {
      const title = this.titleInput?.value.trim() || 'Brand Identity & Website Design';
      const counterparty = this.counterpartyInput?.value.trim();
      const rawAmount = this.amountInput?.value;
      const token = this.tokenSelect?.value || 'USDC';
      const network = this.networkSelect?.value || 'Base';
      const timelock = this.timelockSelect?.value || '48';
      const userRole = this.getSelectedRole();

      if (this.previewTitle) this.previewTitle.textContent = title;
      if (this.previewAmount) this.previewAmount.textContent = this.formatCurrency(rawAmount, token);
      if (this.previewNetwork) this.previewNetwork.textContent = network;

      if (userRole === 'client') {
        if (this.previewClientName) this.previewClientName.textContent = 'You (Client)';
        if (this.previewTalentName) this.previewTalentName.textContent = counterparty || 'Counterparty pending';
      } else {
        if (this.previewTalentName) this.previewTalentName.textContent = 'You (Freelancer)';
        if (this.previewClientName) this.previewClientName.textContent = counterparty || 'Client pending';
      }

      if (this.previewStatusText) {
        this.previewStatusText.textContent = `Ready to Lock Funds • ${timelock}h Auto-Release`;
      }
    }
  }

  /* ==========================================================================
     2. FORM VALIDATION
     ========================================================================== */
  class FormValidator {
    static validateTitle(title) {
      return title && title.trim().length >= 3 
        ? { isValid: true, error: '' } 
        : { isValid: false, error: 'Agreement title must be at least 3 characters.' };
    }

    static validateCounterparty(id) {
      return id && id.trim() 
        ? { isValid: true, error: '' } 
        : { isValid: false, error: 'Counterparty email, ENS, or wallet address is required.' };
    }

    static validateAmount(amount) {
      return amount && !isNaN(amount) && parseFloat(amount) > 0 
        ? { isValid: true, error: '' } 
        : { isValid: false, error: 'Enter a valid payment amount.' };
    }
  }

  /* ==========================================================================
     3. MAIN APP & REAL SUPABASE INSERTION
     ========================================================================== */
  class DealBuilderApp {
    constructor() {
      this.preview = new DealBuilderLivePreview();
      this.form = document.getElementById('form-create-escrow');
      this.submitBtn = document.getElementById('btn-generate-escrow');

      this.init();
    }

    init() {
      this.bindFormSubmission();
    }

    getSupabase() {
      if (window.baxisSupabase) return window.baxisSupabase;
      if (window.supabase) {
        window.baxisSupabase = window.supabase.createClient(
          'https://sytnwsuqoeqlwybkkhhj.supabase.co',
          'sb_publishable_Qtiz_CfMKreLNiDHgVjYag_nFulAMjt'
        );
        return window.baxisSupabase;
      }
      return null;
    }

    showFieldError(inputId, errorMsg) {
      const input = document.getElementById(inputId);
      const errSpan = document.getElementById(`err-${inputId}`);
      if (input) input.classList.add('is-invalid');
      if (errSpan) errSpan.textContent = errorMsg;
    }

    clearFieldError(inputId) {
      const input = document.getElementById(inputId);
      const errSpan = document.getElementById(`err-${inputId}`);
      if (input) input.classList.remove('is-invalid');
      if (errSpan) errSpan.textContent = '';
    }

    bindFormSubmission() {
      if (!this.form) return;

      this.form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const supabase = this.getSupabase();
        if (!supabase) {
          alert('Error: Supabase JS library not loaded. Make sure script tags are in create.html!');
          return;
        }

        const titleVal = document.getElementById('deal-title').value;
        const descVal = document.getElementById('deal-description').value;
        const counterpartyVal = document.getElementById('counterparty-id').value;
        const amountVal = document.getElementById('deal-amount').value;
        const tokenVal = document.getElementById('deal-token').value;
        const networkVal = document.getElementById('deal-network').value;
        const timelockVal = document.getElementById('auto-release-timelock').value;
        
        let roleVal = 'client';
        document.querySelectorAll('input[name="user-role"]').forEach((r) => { if (r.checked) roleVal = r.value; });

        // Validation
        const titleRes = FormValidator.validateTitle(titleVal);
        const cpRes = FormValidator.validateCounterparty(counterpartyVal);
        const amountRes = FormValidator.validateAmount(amountVal);

        if (!titleRes.isValid) this.showFieldError('deal-title', titleRes.error);
        if (!cpRes.isValid) this.showFieldError('counterparty-id', cpRes.error);
        if (!amountRes.isValid) this.showFieldError('deal-amount', amountRes.error);

        if (!titleRes.isValid || !cpRes.isValid || !amountRes.isValid) return;

        this.setButtonLoading(true);

        try {
          let currentUserId = null;
          const { data: { session } } = await supabase.auth.getSession();
          if (session) currentUserId = session.user.id;

          const escrowPayload = {
            title: titleVal.trim(),
            description: descVal.trim(),
            counterparty_identifier: counterpartyVal.trim(),
            creator_role: roleVal,
            amount: parseFloat(amountVal),
            currency: tokenVal,
            network: networkVal,
            auto_release_hours: parseInt(timelockVal, 10),
            creator_id: currentUserId,
            client_id: roleVal === 'client' ? currentUserId : null,
            freelancer_id: roleVal === 'freelancer' ? currentUserId : null,
            status: 'awaiting_deposit'
          };

          const { data, error } = await supabase
            .from('escrows')
            .insert([escrowPayload])
            .select('id')
            .single();

          if (error) {
            console.error('Supabase Error:', error);
            throw error;
          }

          const newEscrowCode = data.id;

          // Validation in escrow creation form submission:
           const counterpartyInput = document.getElementById('counterparty-input').value.trim();
           const isEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(counterpartyInput);

          if (!isEvmAddress) {
           alert('Please enter a valid 0x EVM Wallet Address for the freelancer (e.g. 0x71C...3A9).');
          return;
           }

          // Log activity event
          await supabase.from('activity_logs').insert([{
            escrow_id: newEscrowCode,
            actor_id: currentUserId,
            event_type: 'created',
            description: `Escrow Agreement ${newEscrowCode} created for $${amountVal} ${tokenVal}`
          }]);

          // Redirect to Escrow Details page
          window.location.href = `escrow-details.html?id=${newEscrowCode}`;

        } catch (error) {
          this.setButtonLoading(false);
          alert('Database Save Failed: ' + (error.message || 'Error writing to PostgreSQL'));
        }
      });
    }

    setButtonLoading(isLoading) {
      if (!this.submitBtn) return;
      const text = this.submitBtn.querySelector('span');
      if (isLoading) {
        this.submitBtn.disabled = true;
        if (text) text.textContent = 'Saving Agreement to Database...';
      } else {
        this.submitBtn.disabled = false;
        if (text) text.textContent = 'Generate Escrow Agreement Link';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    new DealBuilderApp();
  });

})();