/**
 * BAXIS PROTOCOL — ESCROW DETAILS ENGINE (`escrow-details.js`)
 * Powered by Ethers.js v6 & Supabase PostgreSQL
 */

document.documentElement.classList.add('js-enabled');

(function () {
  'use strict';

  const System = {
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
     1. TOAST NOTIFICATION SYSTEM (SVG ICONS)
     ========================================================================== */
  class ToastManager {
    constructor() {
      this.container = this.createContainer();
    }

    createContainer() {
      let container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 8px;
          pointer-events: none;
        `;
        document.body.appendChild(container);
      }
      return container;
    }

    show({ title, message, type = 'info', duration = 5000 }) {
      const toast = document.createElement('div');
      toast.className = `toast-card toast-${type}`;
      toast.style.cssText = `
        pointer-events: auto;
        min-width: 320px;
        max-width: 440px;
        background: rgba(24, 28, 36, 0.95);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        padding: 12px 16px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: flex-start;
        gap: 12px;
        color: #F3F4F6;
        font-family: var(--font-sans, sans-serif);
        font-size: 14px;
        opacity: 0;
        transform: translateY(12px);
        transition: opacity 250ms ease, transform 250ms ease;
      `;

      const icons = {
        success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
        info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
        rust: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        danger: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
      };

      toast.innerHTML = `
        <span style="display: flex; align-items: center; margin-top: 2px;">${icons[type] || icons.info}</span>
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 2px;">${title}</div>
          <div style="font-size: 12px; color: #9CA3AF; word-break: break-all;">${message}</div>
        </div>
      `;

      this.container.appendChild(toast);
      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      });

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(12px)';
        setTimeout(() => toast.remove(), 300);
      }, duration);

      System.announce(`${title}: ${message}`);
    }
  }

  /* ==========================================================================
     2. SIDEBAR & MOBILE DRAWER MANAGER
     ========================================================================== */
  class SidebarManager {
    constructor() {
      this.layout = document.getElementById('dashboard-layout');
      this.toggleBtn = document.getElementById('sidebar-collapse-toggle');
      this.mobileToggle = document.getElementById('btn-mobile-sidebar-toggle');
      this.backdrop = document.getElementById('sidebar-backdrop');
      this.init();
    }

    init() {
      if (!this.layout) return;

      if (localStorage.getItem('baxis_sidebar_collapsed') === 'true') {
        this.layout.classList.add('sidebar-collapsed');
      }

      if (this.toggleBtn) {
        this.toggleBtn.addEventListener('click', () => {
          const isCollapsed = this.layout.classList.toggle('sidebar-collapsed');
          localStorage.setItem('baxis_sidebar_collapsed', isCollapsed ? 'true' : 'false');
        });
      }

      if (this.mobileToggle) {
        this.mobileToggle.addEventListener('click', () => {
          this.layout.classList.toggle('mobile-menu-open');
        });
      }

      if (this.backdrop) {
        this.backdrop.addEventListener('click', () => {
          this.layout.classList.remove('mobile-menu-open');
        });
      }
    }
  }

  /* ==========================================================================
     3. CONTRACT TABS MANAGER
     ========================================================================== */
  class ContractTabsManager {
    constructor() {
      this.tabBtns = document.querySelectorAll('.tabs-header-bar .tab-link');
      this.tabPanels = document.querySelectorAll('.content-tabs-card .tab-panel');
      this.init();
    }

    init() {
      if (!this.tabBtns.length) return;

      this.tabBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetControls = btn.getAttribute('aria-controls');

          this.tabBtns.forEach((b) => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
          });

          this.tabPanels.forEach((panel) => {
            panel.classList.remove('active');
            panel.setAttribute('hidden', 'true');
          });

          btn.classList.add('active');
          btn.setAttribute('aria-selected', 'true');

          const activePanel = document.getElementById(targetControls);
          if (activePanel) {
            activePanel.classList.add('active');
            activePanel.removeAttribute('hidden');
          }
        });
      });
    }
  }

  /* ==========================================================================
     4. REAL SUPABASE DATA, STORAGE & ON-CHAIN ENGINE
     ========================================================================== */
  class EscrowDetailsApp {
    constructor() {
      window.appInstance = this;
      this.toast = new ToastManager();
      this.sidebar = new SidebarManager();
      this.tabs = new ContractTabsManager();
      this.approveBtn = document.getElementById('btn-approve-release');
      this.cancelBtn = document.getElementById('btn-cancel-escrow');
      this.disputeBtn = document.getElementById('btn-raise-dispute');
      this.shareBtn = document.getElementById('btn-share-contract');
      this.uploadBtn = document.getElementById('btn-upload-deliverable');

      this.escrowId = this.getEscrowIdFromURL();
      this.currentEscrow = null;

      this.init();
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

    getEscrowIdFromURL() {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('id');
    }

    setApproveBtnText(text) {
      if (!this.approveBtn) return;
      this.approveBtn.disabled = false;
      const span = this.approveBtn.querySelector('span');
      if (span) span.textContent = text;
      else this.approveBtn.textContent = text;
    }

    async init() {
      await this.fetchEscrowFromDatabase();
      await this.fetchDeliverables();
      await this.verifyOnChainContractState();
      this.bindOnChainActions();
      this.bindFileUpload();

      // REALTIME WEBSOCKET SUBSCRIPTION
      const supabase = this.getSupabase();
      if (supabase && this.escrowId) {
        supabase
          .channel(`escrow-realtime-${this.escrowId}`)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'escrows', filter: `id=eq.${this.escrowId}` }, (payload) => {
            this.currentEscrow = payload.new;
            this.renderEscrowDetails(payload.new);
          })
          .subscribe();
      }
    }

    async fetchEscrowFromDatabase() {
      const supabase = this.getSupabase();
      if (!supabase) return;

      try {
        let targetId = this.escrowId;

        if (targetId) {
          const { data } = await supabase
            .from('escrows')
            .select('*')
            .eq('id', targetId)
            .maybeSingle();

          if (data) {
            this.currentEscrow = data;
            this.renderEscrowDetails(data);
            return;
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: userDeals } = await supabase
            .from('escrows')
            .select('id')
            .or(`creator_id.eq.${session.user.id},client_id.eq.${session.user.id},freelancer_id.eq.${session.user.id}`)
            .order('created_at', { ascending: false })
            .limit(1);

            if (userDeals && userDeals.length > 0) {
              targetId = userDeals[0].id;
              this.escrowId = targetId;

              const { data } = await supabase.from('escrows').select('*').eq('id', targetId).maybeSingle();
              if (data) {
                this.currentEscrow = data;
                this.renderEscrowDetails(data);
                return;
              }
            }
        }

        this.renderEmptyVaultState();

      } catch (err) {
        console.error('Fetch escrow error:', err);
        this.renderEmptyVaultState();
      }
    }

    renderEmptyVaultState() {
      const mainContent = document.getElementById('details-main');
      if (!mainContent) return;

      mainContent.innerHTML = `
        <div style="background: var(--bg-surface-0); border: 1px solid var(--border-default); border-radius: var(--radius-xl); padding: 3.5rem 1.5rem; text-align: center; max-width: 540px; margin: 2rem auto;">
          <div style="margin-bottom: 1rem; color: var(--text-secondary); display: flex; justify-content: center;">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h1 style="font-size: 1.25rem; font-weight: 800; color: #FFFFFF; margin-bottom: 0.5rem; letter-spacing: -0.02em;">No Active Vault Selected</h1>
          <p style="font-size: 0.875rem; color: #A0A0A0; margin-bottom: 1.5rem; line-height: 1.5;">
            You don't have an active contract open. Create a new escrow agreement or select a deal from your dashboard.
          </p>
          <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
            <a href="create.html" class="btn btn-primary btn-sm">Create New Escrow</a>
            <a href="dashboard.html" class="btn btn-secondary btn-sm">Go to Dashboard</a>
          </div>
        </div>
      `;
      mainContent.style.opacity = '1';
    }

    async verifyOnChainContractState() {
      if (!window.ethereum || !this.escrowId) return;

      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const baxisContract = new ethers.Contract(BAXIS_CONTRACT_ADDRESS, BAXIS_CONTRACT_ABI, provider);
        const bytes32GigId = typeof getGigIdBytes32 === 'function' ? getGigIdBytes32(this.escrowId) : ethers.id(this.escrowId);

        const escrowStruct = await baxisContract.escrows(bytes32GigId);
        if (!escrowStruct) return;

        const statusNum = Number(escrowStruct.status);
        const supabase = this.getSupabase();

        let dbStatus = null;

        // Map On-Chain Enum to Supabase DB Status
        if (statusNum === 1 || statusNum === 2) {
          dbStatus = 'funds_locked';
        } else if (statusNum === 3) {
          dbStatus = 'released';
        } else if (statusNum === 4) {
          dbStatus = 'refunded';
        } else if (statusNum === 5) {
          dbStatus = 'disputed';
        } else if (statusNum === 6) {
          dbStatus = 'resolved';
        }

        // Auto-sync Supabase & UI if DB status is behind Blockchain truth
        if (dbStatus && this.currentEscrow && this.currentEscrow.status !== dbStatus) {
          if (supabase) {
            await supabase.from('escrows').update({ status: dbStatus }).eq('id', this.escrowId);
          }
          this.currentEscrow.status = dbStatus;
          this.renderEscrowDetails(this.currentEscrow);
        }
      } catch (err) {
        console.warn('Silent on-chain status check:', err.message);
      }
    }

    async fetchDeliverables() {
      const supabase = this.getSupabase();
      if (!supabase || !this.escrowId) return;

      try {
        const { data, error } = await supabase
          .from('deliverables')
          .select('*')
          .eq('escrow_id', this.escrowId)
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          this.renderDeliverablesList(data);
        }
      } catch (err) {
        console.error('Fetch deliverables error:', err);
      }
    }

    renderDeliverablesList(deliverables) {
      const container = document.getElementById('submitted-deliverables-container');
      if (!container) return;

      container.innerHTML = '';
      deliverables.forEach((item) => {
        const box = document.createElement('div');
        box.className = 'deliverable-item-box';
        box.style.marginBottom = '1rem';

        box.innerHTML = `
          <span class="deliverable-type-tag">Uploaded Deliverable</span>
          <h3 class="deliverable-heading">${item.title}</h3>
          <p class="deliverable-text">${item.description || 'Uploaded proof asset.'}</p>
          <a href="${item.proof_url}" target="_blank" rel="noopener" class="deliverable-link" style="display: inline-flex; align-items: center; gap: 6px;">
            <span>Download Asset / View File</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </a>
        `;
        container.appendChild(box);
      });
    }

    renderEscrowDetails(escrow) {
      window.currentEscrowVault = {
        gigId: escrow.id,
        clientId: escrow.client_id || escrow.creator_id,
        freelancerId: escrow.freelancer_id || escrow.counterparty_identifier
      };

      const mainContent = document.getElementById('details-main');
      if (mainContent) mainContent.style.opacity = '1'; 

      const titleEl = document.querySelector('.contract-title');
      if (titleEl) titleEl.textContent = escrow.title;

      const codeEl = document.querySelector('.contract-id-code');
      if (codeEl) {
        const createdDate = new Date(escrow.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        codeEl.textContent = `Contract ID: #${escrow.id} • Created ${createdDate}`;
      }

      const amountNumEl = document.querySelector('.amount-number');
      if (amountNumEl) {
        amountNumEl.textContent = `$${parseFloat(escrow.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }

      const tokenEl = document.querySelector('.amount-token');
      if (tokenEl) tokenEl.textContent = escrow.currency;

      const statusPillEl = document.querySelector('.status-pill');
      if (statusPillEl) {
        const statusMap = {
          'awaiting_deposit': 'AWAITING DEPOSIT',
          'funds_locked': 'FUNDS LOCKED IN VAULT',
          'in_review': 'IN REVIEW',
          'released': 'PAYMENT RELEASED',
          'refunded': 'REFUNDED TO CLIENT',
          'disputed': 'IN DISPUTE'
        };
        statusPillEl.textContent = statusMap[escrow.status] || escrow.status.toUpperCase();
      }

      // DETERMINISTIC CANCEL BUTTON & DOM RESET
      if (this.cancelBtn) {
        const cancelSpan = this.cancelBtn.querySelector('span') || this.cancelBtn;
        if (escrow.status === 'funds_locked') {
          this.cancelBtn.style.display = 'inline-flex';
          this.cancelBtn.disabled = false;
          if (cancelSpan) cancelSpan.textContent = 'Cancel & Refund Escrow';
        } else {
          this.cancelBtn.style.display = 'none';
        }
      }

      if (this.approveBtn) {
        if (escrow.status === 'awaiting_deposit') {
          this.setApproveBtnText(`Deposit & Lock $${escrow.amount} ${escrow.currency}`);
        } else if (escrow.status === 'funds_locked' || escrow.status === 'in_review') {
          this.setApproveBtnText(`Approve & Release $${escrow.amount} ${escrow.currency}`);
        } else if (escrow.status === 'released') {
          this.setApproveBtnText('Payment Released');
          this.approveBtn.disabled = true;
          this.approveBtn.style.background = 'var(--state-success)';
        } else if (escrow.status === 'refunded') {
          this.setApproveBtnText('Escrow Cancelled & Refunded');
          this.approveBtn.disabled = true;
        }
      }

      if (window.checkExistingDisputeOnLoad && escrow.id) {
        window.checkExistingDisputeOnLoad(escrow.id);
      }
    }

    /* ==========================================================================
       FILE UPLOAD ENGINE (SUPABASE STORAGE)
       ========================================================================== */
    bindFileUpload() {
      const fileInput = document.getElementById('deliverable-file-input');
      const dropzoneContent = document.getElementById('dropzone-content');

      if (fileInput && dropzoneContent) {
        fileInput.addEventListener('change', () => {
          if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileSizeKB = (file.size / 1024).toFixed(1);
            dropzoneContent.innerHTML = `
              <span class="file-selected-badge" style="display: inline-flex; align-items: center; gap: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                ${file.name} (${fileSizeKB} KB)
              </span>
            `;
          }
        });
      }

      if (!this.uploadBtn) return;

      this.uploadBtn.addEventListener('click', async () => {
        const supabase = this.getSupabase();
        if (!supabase) return alert('Supabase not connected!');

        const titleInput = document.getElementById('deliverable-title-input');
        const file = fileInput?.files[0];
        const title = titleInput?.value.trim() || (file ? file.name : 'Deliverable Proof');

        if (!file) {
          this.toast.show({ title: 'No File Selected', message: 'Please select a file to upload.', type: 'rust' });
          return;
        }

        this.uploadBtn.disabled = true;
        this.uploadBtn.textContent = 'Uploading File to Vault...';

        try {
          const filePath = `${this.escrowId}/${Date.now()}_${file.name}`;
          const { error: uploadError } = await supabase.storage
            .from('deliverables-vault')
            .upload(filePath, file, { cacheControl: '3600', upsert: true });

          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage.from('deliverables-vault').getPublicUrl(filePath);

          await supabase.from('deliverables').insert([{
            escrow_id: this.escrowId,
            title: title,
            proof_url: urlData.publicUrl,
            description: `File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`
          }]);

          await supabase.from('escrows').update({
            status: 'in_review',
            submitted_at: new Date()
          }).eq('id', this.escrowId);

          this.uploadBtn.disabled = false;
          this.uploadBtn.textContent = 'Upload File & Submit Proof';
          if (fileInput) fileInput.value = '';
          if (titleInput) titleInput.value = '';

          await this.fetchEscrowFromDatabase();
          await this.fetchDeliverables();

          this.toast.show({ title: 'Deliverable Uploaded!', message: 'File stored in vault and submitted for review.', type: 'success' });

        } catch (err) {
          this.uploadBtn.disabled = false;
          this.uploadBtn.textContent = 'Upload File & Submit Proof';
          alert('Upload failed: ' + err.message);
        }
      });
    }

    /* ==========================================================================
       REAL SMART CONTRACT TRANSACTION HANDLERS
       ========================================================================== */
    bindOnChainActions() {
      if (this.approveBtn) {
        this.approveBtn.addEventListener('click', async () => {
          if (!window.baxisWallet) return alert('Wallet provider not found. Check wallet.js!');

          const signer = await window.baxisWallet.connectWallet();
          if (!signer) return;

          const status = this.currentEscrow ? this.currentEscrow.status : 'awaiting_deposit';

          if (status === 'awaiting_deposit') {
            await this.executeOnChainDeposit(signer);
          } else {
            await this.executeOnChainRelease(signer);
          }
        });
      }

      if (this.cancelBtn) {
        this.cancelBtn.addEventListener('click', async () => {
          if (!window.baxisWallet) return alert('Wallet provider not found. Check wallet.js!');

          const signer = await window.baxisWallet.connectWallet();
          if (!signer) return;

          await this.executeOnChainCancel(signer);
        });
      }

      if (this.shareBtn) {
        this.shareBtn.addEventListener('click', () => {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(window.location.href).then(() => {
              this.toast.show({ title: 'Contract Link Copied', message: 'Shareable escrow URL copied to clipboard.', type: 'info' });
            });
          }
        });
      }
    }

    async executeOnChainDeposit(signer) {
      try {
        this.approveBtn.disabled = true;
        this.setApproveBtnText('Checking On-Chain Allowance...');

        const userAddr = await signer.getAddress();
        const bytes32GigId = typeof getGigIdBytes32 === 'function' ? getGigIdBytes32(this.escrowId) : ethers.id(this.escrowId);
        const amount = this.currentEscrow ? this.currentEscrow.amount : 10;
        const decimals = 6;
        const parsedAmount = ethers.parseUnits(amount.toString(), decimals);

        const fee = (parsedAmount * 300n) / 10000n;
        const totalCharge = parsedAmount + fee;

        const usdcContract = new ethers.Contract(USDC_TOKEN_ADDRESS, ERC20_ABI, signer);

        // PRE-FLIGHT USDC BALANCE CHECK
        try {
          const balance = await usdcContract.balanceOf(userAddr);
          if (balance < totalCharge) {
            const userFormatted = ethers.formatUnits(balance, decimals);
            const requiredFormatted = ethers.formatUnits(totalCharge, decimals);
            throw new Error(`Insufficient USDC balance. You have $${userFormatted} USDC, but this vault requires $${requiredFormatted} USDC.`);
          }
        } catch (balanceErr) {
          if (balanceErr.message.includes('Insufficient USDC')) throw balanceErr;
          console.warn('Silent balance check fallback:', balanceErr);
        }

        const currentAllowance = await usdcContract.allowance(userAddr, BAXIS_CONTRACT_ADDRESS);

        if (currentAllowance < totalCharge) {
          this.setApproveBtnText('1/2: Approving USDC Allowance...');
          const approveTx = await usdcContract.approve(BAXIS_CONTRACT_ADDRESS, totalCharge);
          this.setApproveBtnText('Waiting for Allowance Approval...');
          await approveTx.wait();
        }

        this.setApproveBtnText('2/2: Confirm in Wallet...');

        // STRICT REAL-MONEY EVM ADDRESS SAFEGUARD
        const freelancerAddr = this.currentEscrow?.counterparty_identifier || '';
        if (!freelancerAddr || !ethers.isAddress(freelancerAddr)) {
          throw new Error('Invalid Freelancer Wallet Address. The counterparty must be a valid 0x EVM wallet address before funding.');
        }
        if (freelancerAddr.toLowerCase() === userAddr.toLowerCase()) {
          throw new Error('You cannot create an escrow with yourself as the freelancer.');
        }

        const rawHours = this.currentEscrow?.auto_release_hours || 48;
        const timelockSeconds = Math.max(rawHours * 3600, 86400);

        // GENERATE AGREEMENT HASH (Cryptographic Proof of Title + Terms)
        const agreementHash = ethers.id(this.currentEscrow.title + (this.currentEscrow.description || ''));

        const contractInterface = new ethers.Interface(BAXIS_CONTRACT_ABI);
        const calldata = contractInterface.encodeFunctionData('fundEscrow', [
          bytes32GigId,
          freelancerAddr,
          USDC_TOKEN_ADDRESS,
          parsedAmount,
          timelockSeconds,
          agreementHash
        ]);

        const txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{
            from: userAddr,
            to: BAXIS_CONTRACT_ADDRESS,
            data: calldata
          }]
        });

        // WAIT FOR REAL ON-CHAIN BLOCKCHAIN CONFIRMATION RECEIPT
        this.setApproveBtnText('Waiting for Blockchain Confirmation...');
        const provider = new ethers.BrowserProvider(window.ethereum);
        const txReceipt = await provider.waitForTransaction(txHash);

        if (!txReceipt || txReceipt.status !== 1) {
          throw new Error('Transaction reverted on-chain. Deposit was not executed.');
        }

        this.setApproveBtnText('Updating Database...');

        const supabase = this.getSupabase();
        if (supabase) {
          await supabase.from('escrows').update({
            status: 'funds_locked',
            funded_at: new Date().toISOString(),
            deposit_tx_hash: txHash
          }).eq('id', this.escrowId);
        }

        if (this.currentEscrow) {
          this.currentEscrow.status = 'funds_locked';
        }

        this.renderEscrowDetails({
          ...this.currentEscrow,
          status: 'funds_locked'
        });

        this.toast.show({
          title: 'Funds Locked On-Chain!',
          message: `TX Hash: ${txHash.substring(0, 12)}... (Confirmed on Base)`,
          type: 'success',
          duration: 6000
        });

      } catch (err) {
        this.approveBtn.disabled = false;
        this.setApproveBtnText('Deposit & Lock Funds');
        console.error('Deposit Error:', err);

        let errorMsg = err.reason || err.message || 'Transaction failed.';
        if (err.code === -32002) {
          errorMsg = 'Wallet popup is open! Click your browser extension icon to approve.';
        }

        this.toast.show({
          title: 'Deposit Transaction Failed',
          message: errorMsg,
          type: 'rust'
        });
      }
    }

    /* ==========================================================================
       SECURED CLIENT CANCEL & UNILATERAL REFUND
       ========================================================================== */

    async executeOnChainCancel(signer) {
      try {
        if (this.cancelBtn) {
          this.cancelBtn.disabled = true;
          const span = this.cancelBtn.querySelector('span') || this.cancelBtn;
          span.textContent = 'Signing On-Chain Cancel...';
        }

        const userAddr = await signer.getAddress();
        const bytes32GigId = typeof getGigIdBytes32 === 'function' 
          ? getGigIdBytes32(this.escrowId) 
          : ethers.id(this.escrowId);

        // REUSE SIGNER PROVIDER FROM wallet.js (Prevents multi-provider collisions)
        const provider = signer.provider || new ethers.BrowserProvider(window.ethereum);
        const baxisContract = new ethers.Contract(BAXIS_CONTRACT_ADDRESS, BAXIS_CONTRACT_ABI, signer);

        // 1. PRE-FLIGHT CHECK: Verify on-chain state before firing transaction
        const onChainEscrow = await baxisContract.escrows(bytes32GigId);

        if (!onChainEscrow || onChainEscrow.client === ethers.ZeroAddress) {
          throw new Error('Escrow not found on-chain. Ensure it was successfully funded on Base first.');
        }

        if (onChainEscrow.client.toLowerCase() !== userAddr.toLowerCase()) {
          throw new Error(`Unauthorized: Your connected wallet (${userAddr.substring(0, 6)}...) is not the client for this escrow.`);
        }

        const statusNum = Number(onChainEscrow.status); // 0=NULL, 1=FUNDED, 2=SUBMITTED, 3=RELEASED, 4=REFUNDED

        if (statusNum === 4) {
          const supabase = this.getSupabase();
          if (supabase) {
            await supabase.from('escrows').update({ status: 'refunded' }).eq('id', this.escrowId);
          }
          if (this.currentEscrow) {
            this.currentEscrow.status = 'refunded';
            this.renderEscrowDetails(this.currentEscrow);
          }
          this.toast.show({
            title: 'Escrow Already Cancelled',
            message: 'This escrow was previously refunded on-chain. UI updated.',
            type: 'info'
          });
          return;
        }

        if (statusNum === 2) {
          throw new Error('Work has already been submitted by the freelancer! You cannot cancel directly now.');
        }

        if (statusNum !== 1) {
          throw new Error(`Cannot cancel: On-chain escrow status is not FUNDED (Status code: ${statusNum}).`);
        }

        // 2. SUBMIT TRANSACTION
        const tx = await baxisContract.cancelEscrow(bytes32GigId);

        const span = this.cancelBtn?.querySelector('span') || this.cancelBtn;
        if (span) span.textContent = 'Waiting for Blockchain Confirmation...';

        // 3. STATELESS RPC RECEIPT QUERY (Does not rely on Ethers event filters)
        let txReceipt = null;
        let attempts = 0;
        const maxAttempts = 30; // Check for up to 45 seconds

        while (!txReceipt && attempts < maxAttempts) {
          attempts++;
          try {
            txReceipt = await provider.getTransactionReceipt(tx.hash);
          } catch (e) {
            console.warn('Polling RPC for transaction receipt...', e);
          }
          if (!txReceipt) {
            await new Promise((resolve) => setTimeout(resolve, 1500)); // Poll every 1.5s
          }
        }

        if (!txReceipt || txReceipt.status !== 1) {
          throw new Error('Cancel transaction failed or timed out on Base Mainnet. Check your wallet history.');
        }

        // 4. UPDATE SUPABASE DATABASE & RENDER DETERMINISTIC UI
        const supabase = this.getSupabase();
        if (supabase) {
          await supabase.from('escrows').update({
            status: 'refunded',
            released_at: new Date().toISOString()
          }).eq('id', this.escrowId);
        }

        if (this.currentEscrow) {
          this.currentEscrow.status = 'refunded';
          this.renderEscrowDetails(this.currentEscrow);
        }

        this.toast.show({
          title: 'Escrow Cancelled & Refunded!',
          message: `100% of funds returned to your wallet. TX: ${tx.hash.substring(0, 12)}...`,
          type: 'success',
          duration: 6000
        });

      } catch (err) {
        if (this.currentEscrow) {
          this.renderEscrowDetails(this.currentEscrow);
        } else if (this.cancelBtn) {
          this.cancelBtn.disabled = false;
          const span = this.cancelBtn.querySelector('span') || this.cancelBtn;
          span.textContent = 'Cancel & Refund Escrow';
        }

        console.error('Cancel Failed:', err);

        let errorMsg = err.reason || err.message || 'Transaction rejected or failed.';
        if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
          errorMsg = 'Transaction was rejected in your wallet.';
        }

        this.toast.show({
          title: 'Cancellation Failed',
          message: errorMsg,
          type: 'rust'
        });
      }
    }


    async executeOnChainRelease(signer) {
      try {
        this.approveBtn.disabled = true;
        this.setApproveBtnText('Signing On-Chain Release...');

        const bytes32GigId = typeof getGigIdBytes32 === 'function' ? getGigIdBytes32(this.escrowId) : ethers.id(this.escrowId);
        const contractInterface = new ethers.Interface(BAXIS_CONTRACT_ABI);
        const calldata = contractInterface.encodeFunctionData('releaseFunds', [bytes32GigId]);

        const userAddr = await signer.getAddress();
        const txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{
            from: userAddr,
            to: BAXIS_CONTRACT_ADDRESS,
            data: calldata
          }]
        });

        this.setApproveBtnText('Waiting for Blockchain Confirmation...');
        const provider = new ethers.BrowserProvider(window.ethereum);
        const txReceipt = await provider.waitForTransaction(txHash);

        if (!txReceipt || txReceipt.status !== 1) {
          throw new Error('Release transaction reverted on-chain.');
        }

        this.setApproveBtnText('Updating Database...');

        const supabase = this.getSupabase();
        if (supabase) {
          await supabase.from('escrows').update({
            status: 'released',
            released_at: new Date().toISOString(),
            release_tx_hash: txHash
          }).eq('id', this.escrowId);
        }

        this.toast.show({
          title: 'Payment Released On-Chain!',
          message: `Settled to freelancer. TX: ${txHash.substring(0, 12)}...`,
          type: 'success',
          duration: 6000
        });

        await this.fetchEscrowFromDatabase();

      } catch (err) {
        this.approveBtn.disabled = false;
        this.setApproveBtnText('Approve & Release Payment');
        console.error('Release Failed:', err);
        this.toast.show({
          title: 'Release Transaction Failed',
          message: err.reason || err.message || 'Transaction rejected.',
          type: 'rust'
        });
      }
    }
  }

  /* ============================================================================
   * Escrow Details Page — Dispute Modal Controller & Evidence Rendering
   * ============================================================================ */
  document.addEventListener('DOMContentLoaded', () => {
    const btnRaiseDispute = document.getElementById('btn-raise-dispute');
    const modalBackdrop = document.getElementById('dispute-modal-backdrop');
    const btnCloseModal = document.getElementById('btn-close-dispute-modal');
    const btnCancelDispute = document.getElementById('btn-cancel-dispute');
    const btnSubmitDispute = document.getElementById('btn-submit-dispute');
    const fileInput = document.getElementById('dispute-modal-file-input');
    const filesContainer = document.getElementById('dispute-selected-files-container');
    const reasonInput = document.getElementById('dispute-reason-input');
    const errorBox = document.getElementById('dispute-modal-error');

    let selectedFiles = [];

    function getEscrowContext() {
      if (window.currentEscrowVault && window.currentEscrowVault.gigId) {
        return window.currentEscrowVault;
      }
      if (window.appInstance && window.appInstance.currentEscrow) {
        const e = window.appInstance.currentEscrow;
        return {
          gigId: e.id,
          clientId: e.client_id || e.creator_id || e.client,
          freelancerId: e.freelancer_id || e.counterparty_identifier || e.freelancer
        };
      }
      const urlParams = new URLSearchParams(window.location.search);
      const urlId = urlParams.get('id');
      if (urlId) {
        return { gigId: urlId, clientId: null, freelancerId: null };
      }
      return null;
    }

    function openDisputeModal() {
      if (!modalBackdrop) return;
      modalBackdrop.classList.add('active');
      modalBackdrop.setAttribute('aria-hidden', 'false');
    }

    function closeDisputeModal() {
      if (!modalBackdrop) return;
      modalBackdrop.classList.remove('active');
      modalBackdrop.setAttribute('aria-hidden', 'true');
      resetModalForm();
    }

    function resetModalForm() {
      selectedFiles = [];
      if (reasonInput) reasonInput.value = '';
      if (fileInput) fileInput.value = '';
      if (filesContainer) filesContainer.innerHTML = '';
      if (errorBox) {
        errorBox.style.display = 'none';
        errorBox.textContent = '';
      }
    }

    if (btnRaiseDispute) btnRaiseDispute.addEventListener('click', openDisputeModal);
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeDisputeModal);
    if (btnCancelDispute) btnCancelDispute.addEventListener('click', closeDisputeModal);

    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) closeDisputeModal();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const newFiles = Array.from(e.target.files);
        selectedFiles = [...selectedFiles, ...newFiles];
        renderSelectedFiles();
      });
    }

    function renderSelectedFiles() {
      if (!filesContainer) return;
      filesContainer.innerHTML = '';

      selectedFiles.forEach((file, index) => {
        const pill = document.createElement('div');
        pill.className = 'file-item-pill';
        pill.innerHTML = `
          <span style="display: inline-flex; align-items: center; gap: 6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)
          </span>
          <button type="button" class="remove-file-btn" data-index="${index}" aria-label="Remove File">&times;</button>
        `;
        filesContainer.appendChild(pill);
      });

      filesContainer.querySelectorAll('.remove-file-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const idx = parseInt(e.currentTarget.dataset.index, 10);
          selectedFiles.splice(idx, 1);
          renderSelectedFiles();
        });
      });
    }

    if (btnSubmitDispute) {
      btnSubmitDispute.addEventListener('click', async () => {
        const reason = reasonInput ? reasonInput.value.trim() : '';

        if (!reason || reason.length < 10) {
          showError('Please provide a detailed dispute reason (at least 10 characters).');
          return;
        }

        const currentEscrow = getEscrowContext();
        if (!currentEscrow || !currentEscrow.gigId) {
          showError('Escrow context missing. Please refresh or select a valid escrow.');
          return;
        }

        try {
          setSubmitLoading(true);

          let clientId = currentEscrow.clientId;
          let freelancerId = currentEscrow.freelancerId;
          
          if (!clientId || !freelancerId) {
            const supabase = window.appInstance ? window.appInstance.getSupabase() : null;
            if (supabase) {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                clientId = clientId || user.id;
                freelancerId = freelancerId || user.id;
              }
            }
          }

          const dispute = await window.disputeService.createDispute({
            gigId: currentEscrow.gigId,
            clientId: clientId || '00000000-0000-0000-0000-000000000000',
            freelancerId: freelancerId || '00000000-0000-0000-0000-000000000000',
            reason: reason,
            files: selectedFiles
          });

          if (window.ethereum && window.baxisWallet && window.appInstance) {
            try {
              const signer = await window.baxisWallet.connectWallet();
              if (signer) {
                const bytes32GigId = typeof getGigIdBytes32 === 'function' ? getGigIdBytes32(currentEscrow.gigId) : ethers.id(currentEscrow.gigId);
                const evidenceHash = ethers.id(dispute.id);
                const contractInterface = new ethers.Interface(BAXIS_CONTRACT_ABI);
                const calldata = contractInterface.encodeFunctionData('raiseDispute', [bytes32GigId, evidenceHash]);
                const userAddr = await signer.getAddress();

                await window.ethereum.request({
                  method: 'eth_sendTransaction',
                  params: [{
                    from: userAddr,
                    to: BAXIS_CONTRACT_ADDRESS,
                    data: calldata
                  }]
                });
              }
            } catch (web3Err) {
              console.warn('Web3 on-chain raiseDispute skipped/failed:', web3Err);
            }
          }

          if (window.appInstance) {
            const supabase = window.appInstance.getSupabase();
            if (supabase) {
              await supabase.from('escrows').update({ status: 'disputed' }).eq('id', currentEscrow.gigId);
            }
          }

          closeDisputeModal();
          renderInPlaceDisputeState(dispute);

        } catch (err) {
          console.error('=== DISPUTE SUBMISSION DETAILED ERROR ===', err);
          showError(err.message || 'Failed to submit dispute. Check console for details.');
        } finally {
          setSubmitLoading(false);
        }
      });
    }

    function showError(msg) {
      if (!errorBox) return;
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
    }

    function setSubmitLoading(isLoading) {
      if (!btnSubmitDispute) return;
      btnSubmitDispute.disabled = isLoading;
      const btnText = btnSubmitDispute.querySelector('.btn-text') || btnSubmitDispute;
      btnText.textContent = isLoading ? 'Submitting Dispute...' : 'Submit Dispute';
    }

    function renderInPlaceDisputeState(dispute) {
      const statusPill = document.querySelector('.status-pill');
      if (statusPill) {
        statusPill.className = 'status-pill rust';
        statusPill.textContent = 'IN DISPUTE';
      }

      const btnApprove = document.getElementById('btn-approve-release');
      if (btnApprove) btnApprove.disabled = true;
      if (btnRaiseDispute) btnRaiseDispute.disabled = true;

      const hubDesc = document.getElementById('action-hub-desc');
      if (hubDesc) {
        hubDesc.innerHTML = `<strong style="color: var(--state-error, #EF4444);">Contract Locked in Dispute.</strong> Reason: "${dispute.reason}". Awaiting Baxis Arbitrator review.`;
      }

      const auditContainer = document.getElementById('audit-timeline-container');
      if (auditContainer) {
        const row = document.createElement('div');
        row.className = 'audit-row';
        row.innerHTML = `
          <span class="audit-time">Just now</span>
          <span class="audit-event" style="color: var(--state-error, #EF4444);">Dispute Opened — Evidence Uploaded</span>
        `;
        auditContainer.prepend(row);
      }
    }

    async function checkExistingDisputeOnLoad(gigId) {
      if (!window.disputeService || !gigId) return;
      try {
        const dispute = await window.disputeService.getDisputeByGigId(gigId);
        if (dispute) {
          renderInPlaceDisputeState(dispute);
        }
      } catch (err) {
        console.warn('Could not load existing dispute state:', err);
      }
    }

    window.checkExistingDisputeOnLoad = checkExistingDisputeOnLoad;
  });

  document.addEventListener('DOMContentLoaded', () => {
    new EscrowDetailsApp();
  });

})();