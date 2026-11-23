/**
 * BAXIS PROTOCOL — DEAL BUILDER ENGINE (`create.js`)
 * Powered by Supabase PostgreSQL Database
 */

document.documentElement.classList.add('js-enabled');

(function () {
  'use strict';

  const System = {
    debounce(fn, delay = 50) {
      let timer;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    }
  };

  /* ==========================================================================
     1. LIVE PREVIEW & FINANCIAL LEDGER ENGINE
     ========================================================================== */
  class DealBuilderLivePreview {
    constructor() {
      // Form Inputs
      this.roleRadios = document.querySelectorAll('input[name="creator-role"]');
      this.titleInput = document.getElementById('deal-title');
      this.counterpartyInput = document.getElementById('counterparty-id');
      this.amountInput = document.getElementById('deal-amount');
      this.tokenSelect = document.getElementById('deal-token');
      this.networkSelect = document.getElementById('deal-network');
      this.timelockSelect = document.getElementById('auto-release-timelock');

      // Adaptive Dynamic Labels & Hints
      this.lblCounterparty = document.getElementById('lbl-counterparty-id');
      this.hintCounterparty = document.getElementById('hint-counterparty-id');
      this.btnGenerateText = document.getElementById('btn-generate-text');

      // Financial Ledger Breakdown Elements
      this.ledgerSubtotal = document.getElementById('ledger-subtotal');
      this.ledgerFee = document.getElementById('ledger-fee');
      this.ledgerTotal = document.getElementById('ledger-total');
      this.ledgerFreelancerPayout = document.getElementById('ledger-freelancer-payout');

      // DM Share Card Elements
      this.previewTitle = document.getElementById('preview-title');
      this.previewAmount = document.getElementById('preview-amount');
      this.previewNetwork = document.getElementById('preview-network');
      this.previewClientName = document.getElementById('preview-client-name');
      this.previewTalentName = document.getElementById('preview-talent-name');
      this.previewStatusText = document.getElementById('preview-status-text');

      this.init();
    }

    init() {
      const updateHandler = () => this.updateAll();

      this.roleRadios.forEach(radio => {
        radio.addEventListener('change', () => {
          this.handleRoleChange();
          this.updateAll();
        });
      });

      if (this.titleInput) this.titleInput.addEventListener('input', System.debounce(updateHandler, 40));
      if (this.counterpartyInput) this.counterpartyInput.addEventListener('input', System.debounce(updateHandler, 40));
      if (this.amountInput) this.amountInput.addEventListener('input', System.debounce(updateHandler, 40));
      if (this.tokenSelect) this.tokenSelect.addEventListener('change', updateHandler);
      if (this.networkSelect) this.networkSelect.addEventListener('change', updateHandler);
      if (this.timelockSelect) this.timelockSelect.addEventListener('change', updateHandler);

      this.handleRoleChange();
      this.updateAll();
    }

    getCurrentRole() {
      const checked = document.querySelector('input[name="creator-role"]:checked');
      return checked ? checked.value : 'client';
    }

    handleRoleChange() {
      const isClient = this.getCurrentRole() === 'client';

      if (this.lblCounterparty) {
        this.lblCounterparty.innerHTML = isClient 
          ? 'Freelancer Payout Wallet Address <span class="req">*</span>' 
          : 'Client Wallet Address <span class="field-optional">(Optional)</span>';
      }

      if (this.hintCounterparty) {
        this.hintCounterparty.textContent = isClient
          ? 'The wallet address that will receive the unlocked payout upon approved delivery.'
          : 'Leave blank if sending via DM. The client will connect their wallet to fund the escrow.';
      }

      if (this.btnGenerateText) {
        this.btnGenerateText.textContent = isClient
          ? 'Create Agreement & Prepare Escrow'
          : 'Generate Payment Request Link';
      }
    }

    formatCurrency(val, token) {
      const num = parseFloat(val);
      if (!val || isNaN(num) || num <= 0) return `$0.00 ${token}`;
      return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${token}`;
    }

    updateAll() {
      const role = this.getCurrentRole();
      
      // Fixed: Defaults cleanly to "Agreement Title" instead of the hardcoded brand identity text
      const title = this.titleInput?.value.trim() || 'Agreement Title';
      const counterparty = this.counterpartyInput?.value.trim() || '';
      const rawAmount = parseFloat(this.amountInput?.value) || 0;
      const token = this.tokenSelect?.value || 'USDC';
      const network = this.networkSelect?.value || 'Base';
      const timelock = this.timelockSelect?.value || '48';

      // 3% Baxis Protection Fee calculation
      const fee = rawAmount > 0 ? rawAmount * 0.03 : 0;
      const totalDeposit = rawAmount + fee;

      // Update Settlement Ledger
      if (this.ledgerSubtotal) this.ledgerSubtotal.textContent = this.formatCurrency(rawAmount, token);
      if (this.ledgerFee) this.ledgerFee.textContent = this.formatCurrency(fee, token);
      if (this.ledgerTotal) this.ledgerTotal.textContent = this.formatCurrency(totalDeposit, token);
      if (this.ledgerFreelancerPayout) this.ledgerFreelancerPayout.textContent = this.formatCurrency(rawAmount, token);

      // Shorten 0x address for visual cleanliness
      let displayCounterparty = counterparty;
      if (counterparty && counterparty.startsWith('0x') && counterparty.length === 42) {
        displayCounterparty = `${counterparty.substring(0, 6)}...${counterparty.substring(38)}`;
      }

      // Update Live DM Share Preview Card
      if (this.previewTitle) this.previewTitle.textContent = title;
      if (this.previewAmount) this.previewAmount.textContent = this.formatCurrency(rawAmount, token);
      if (this.previewNetwork) this.previewNetwork.textContent = network;

      if (role === 'client') {
        if (this.previewClientName) this.previewClientName.textContent = 'You (Client)';
        if (this.previewTalentName) this.previewTalentName.textContent = displayCounterparty || 'Pending Freelancer';
        if (this.previewStatusText) this.previewStatusText.textContent = `Awaiting Deposit • ${timelock}h Review Window`;
      } else {
        if (this.previewClientName) this.previewClientName.textContent = displayCounterparty || 'Pending Client';
        if (this.previewTalentName) this.previewTalentName.textContent = 'You (Freelancer)';
        if (this.previewStatusText) this.previewStatusText.textContent = `Payment Request • ${timelock}h Review Window`;
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

    static validateCounterparty(id, isClientRole) {
      // Optional for Freelancers creating open payment links
      if (!isClientRole && (!id || !id.trim())) {
        return { isValid: true, error: '' };
      }

      if (!id || !id.trim()) {
        return { isValid: false, error: 'Wallet address is required.' };
      }

      const clean = id.trim();
      const isEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(clean);
      const isEns = /\.eth$/i.test(clean);

      return isEvmAddress || isEns
        ? { isValid: true, error: '' }
        : { isValid: false, error: 'Enter a valid 0x address (0x...) or ENS (.eth).' };
    }

    static validateAmount(amount) {
      return amount && !isNaN(amount) && parseFloat(amount) > 0
        ? { isValid: true, error: '' }
        : { isValid: false, error: 'Enter a valid payment amount.' };
    }
  }

  /* ==========================================================================
     3. MAIN APP & SUPABASE INTEGRATION
     ========================================================================== */
  class DealBuilderApp {
    constructor() {
      this.preview = new DealBuilderLivePreview();
      this.form = document.getElementById('form-create-escrow');
      this.submitBtn = document.getElementById('btn-generate-escrow');

      this.init();
    }

    init() {
      this.bindSidebarMobileToggle();
      this.bindFormSubmission();
    }

    bindSidebarMobileToggle() {
      const toggleBtn = document.getElementById('btn-mobile-sidebar-toggle');
      const backdrop = document.getElementById('sidebar-backdrop');
      const layout = document.getElementById('dashboard-layout');

      if (toggleBtn && layout) {
        toggleBtn.addEventListener('click', () => layout.classList.toggle('mobile-menu-open'));
      }
      if (backdrop && layout) {
        backdrop.addEventListener('click', () => layout.classList.remove('mobile-menu-open'));
      }
    }

    getSupabase() {
      if (window.baxisSupabase) return window.baxisSupabase;
      if (window.supabaseClient) return window.supabaseClient;
      if (window.supabase && window.supabase.auth) return window.supabase;
      if (window.supabase && typeof window.supabase.createClient === 'function') {
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
          alert('Database connection unavailable. Please check your network connection.');
          return;
        }

        const roleChecked = document.querySelector('input[name="creator-role"]:checked');
        const creatorRole = roleChecked ? roleChecked.value : 'client';
        const isClient = creatorRole === 'client';

        const titleVal = document.getElementById('deal-title')?.value || '';
        const descVal = document.getElementById('deal-description')?.value || '';
        const counterpartyVal = document.getElementById('counterparty-id')?.value || '';
        const amountVal = document.getElementById('deal-amount')?.value || '';
        const tokenVal = document.getElementById('deal-token')?.value || 'USDC';
        const networkVal = document.getElementById('deal-network')?.value || 'Base';
        const timelockVal = document.getElementById('auto-release-timelock')?.value || '48';

        // Clear previous errors
        this.clearFieldError('deal-title');
        this.clearFieldError('counterparty-id');
        this.clearFieldError('deal-amount');

        // Validation
        const titleRes = FormValidator.validateTitle(titleVal);
        const cpRes = FormValidator.validateCounterparty(counterpartyVal, isClient);
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
            creator_role: creatorRole,
            amount: parseFloat(amountVal),
            currency: tokenVal,
            network: networkVal,
            auto_release_hours: parseInt(timelockVal, 10),
            creator_id: currentUserId,
            client_id: isClient ? currentUserId : null,
            freelancer_id: !isClient ? currentUserId : null,
            status: 'awaiting_deposit'
          };

          const { data, error } = await supabase
            .from('escrows')
            .insert([escrowPayload])
            .select('id')
            .single();

          if (error) {
            console.error('Supabase Insert Error:', error);
            throw error;
          }

          const newEscrowId = data.id;

          // Activity Audit Log
          await supabase.from('activity_logs').insert([{
            escrow_id: newEscrowId,
            actor_id: currentUserId,
            event_type: 'created',
            description: `Escrow Agreement ${newEscrowId} created (${creatorRole}) for $${amountVal} ${tokenVal}`
          }]);

          // Redirect to details page
          window.location.href = `escrow-details.html?id=${newEscrowId}`;

        } catch (error) {
          this.setButtonLoading(false);
          alert('Failed to create escrow agreement: ' + (error.message || 'Database error'));
        }
      });
    }

    setButtonLoading(isLoading) {
      if (!this.submitBtn) return;
      const textSpan = document.getElementById('btn-generate-text') || this.submitBtn.querySelector('span');
      const spinner = this.submitBtn.querySelector('.btn-spinner');

      if (isLoading) {
        this.submitBtn.disabled = true;
        if (textSpan) textSpan.textContent = 'Creating Agreement...';
        if (spinner) spinner.hidden = false;
      } else {
        this.submitBtn.disabled = false;
        if (spinner) spinner.hidden = true;
        this.preview.handleRoleChange();
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    new DealBuilderApp();
  });
})();