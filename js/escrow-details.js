/**
 * BAXIS PROTOCOL — ESCROW DETAILS ENGINE (`escrow-details.js`)
 * Powered by Ethers.js v6 & Supabase PostgreSQL
 */

document.documentElement.classList.add('js-enabled');

(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.protocol === 'https:' ? parsed.href : '#';
    } catch {
      return '#';
    }
  }

  function shortenAddress(addr) {
    if (!addr || addr.length < 12) return addr || 'Pending...';
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  }

  function getInitials(name, fallback = 'BX') {
    if (!name || !name.trim()) return fallback;
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

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
          <div style="font-weight: 600; margin-bottom: 2px;">${escapeHtml(title)}</div>
          <div style="font-size: 12px; color: #9CA3AF; word-break: break-all;">${escapeHtml(message)}</div>
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
     4. REAL SUPABASE DATA, STORAGE & ROLE-AWARE ON-CHAIN ENGINE
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
      this.currentUserId = null;
      this.inspectionDeadline = 0;
      this.isInspectionExpired = false;
      this.onChainFreelancer = '';
      this.onChainClient = '';
      this.connectedAddress = '';

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

    resolveUserRoles(escrow = this.currentEscrow) {
      if (!escrow) return { isClient: false, isFreelancer: false };

      let clientId = escrow.client_id;
      let freelancerId = escrow.freelancer_id;

      if (!clientId && escrow.creator_role === 'client') clientId = escrow.creator_id;
      if (!freelancerId && escrow.creator_role === 'freelancer') freelancerId = escrow.creator_id;

      let isFreelancer = Boolean(this.currentUserId && this.currentUserId === freelancerId);

      // Fallback for client-created escrows where freelancer_id is null: match by connected/profile wallet
      if (!isFreelancer && !freelancerId && this.currentUserId && this.currentUserId !== clientId) {
        const expectedWallet = (this.onChainFreelancer || (escrow.creator_role === 'client' ? escrow.counterparty_identifier : '') || '').toLowerCase();
        const userWallet = (this.connectedAddress || window.baxisWallet?.userAddress || window.currentProfile?.wallet_address || '').toLowerCase();
        if (expectedWallet && userWallet && expectedWallet === userWallet) {
          isFreelancer = true;
        }
      }

      const isClient = this.currentUserId
        ? (this.currentUserId === clientId || (!clientId && !isFreelancer))
        : !isFreelancer;

      return { isClient, isFreelancer };
    }

    isFreelancerUser(escrow = this.currentEscrow) {
      return this.resolveUserRoles(escrow).isFreelancer;
    }

    getRemainingReviewLabel(escrow) {
      let deadlineSec = this.inspectionDeadline;
      if (!deadlineSec && escrow?.submitted_at) {
        const submittedSec = Math.floor(new Date(escrow.submitted_at).getTime() / 1000);
        const windowSec = Math.max((escrow.auto_release_hours || 48) * 3600, 86400);
        deadlineSec = submittedSec + windowSec;
      }

      if (!deadlineSec) return 'In Review';

      const remainingSec = deadlineSec - Math.floor(Date.now() / 1000);
      if (remainingSec <= 0) return 'Expired';
      if (remainingSec >= 3600) return `${Math.ceil(remainingSec / 3600)}h`;
      return `${Math.max(1, Math.ceil(remainingSec / 60))}m`;
    }

    updateLifecycleStepper(escrow) {
      const stepper = document.getElementById('escrow-stepper-bar');
      if (!stepper) return;

      const nodes = stepper.querySelectorAll('.step-node');
      const lines = stepper.querySelectorAll('.step-line');
      let completedSteps = 1;

      if (escrow.status === 'funds_locked' || escrow.status === 'refunded') {
        completedSteps = 2;
      } else if (escrow.status === 'in_review') {
        completedSteps = 3;
      } else if (escrow.status === 'disputed') {
        completedSteps = escrow.submitted_at ? 3 : 2;
      } else if (escrow.status === 'released' || escrow.status === 'resolved') {
        completedSteps = 4;
      }

      nodes.forEach((node, idx) => {
        node.classList.toggle('completed', idx < completedSteps);
      });

      lines.forEach((line, idx) => {
        line.classList.toggle('completed', idx < completedSteps - 1);
      });
    }

    renderTermsAndMeta(escrow, { isClient, isFreelancer }) {
      const networkTag = document.getElementById('detail-network-tag');
      if (networkTag) networkTag.textContent = `${escrow.network || 'Base'} Network`;

      const vaultAddrEl = document.getElementById('detail-vault-address');
      if (vaultAddrEl && typeof BAXIS_CONTRACT_ADDRESS !== 'undefined') {
        vaultAddrEl.textContent = shortenAddress(BAXIS_CONTRACT_ADDRESS);
        vaultAddrEl.title = BAXIS_CONTRACT_ADDRESS;
      }

      const termsList = document.getElementById('terms-spec-list');
      if (termsList) {
        const hours = escrow.auto_release_hours || 48;
        const amountFormatted = `$${parseFloat(escrow.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${escrow.currency || 'USDC'}`;
        const scopeText = escrow.description && escrow.description.trim()
          ? escapeHtml(escrow.description.trim())
          : 'No additional deliverable notes specified.';

        termsList.innerHTML = `
          <li><strong>Scope &amp; Acceptance Criteria:</strong> ${scopeText}</li>
          <li><strong>Escrow Payout Amount:</strong> ${escapeHtml(amountFormatted)} (Client pays 3% protection fee on deposit)</li>
          <li><strong>Settlement Network:</strong> ${escapeHtml(escrow.network || 'Base')}</li>
          <li><strong>Client Review Window:</strong> ${escapeHtml(hours)} Hours after work submission before auto-release unlocks</li>
        `;
      }

      const timelockBox = document.getElementById('timelock-box');
      if (timelockBox) {
        const span = timelockBox.querySelector('span');
        if (span) {
          const hours = escrow.auto_release_hours || 48;
          if (escrow.status === 'awaiting_deposit') {
            span.textContent = `${hours}h Review Window`;
          } else if (escrow.status === 'funds_locked') {
            span.textContent = `${hours}h Auto-release after upload`;
          } else if (escrow.status === 'in_review') {
            const label = this.getRemainingReviewLabel(escrow);
            span.textContent = (this.isInspectionExpired || label === 'Expired')
              ? 'Auto-release ready to claim'
              : `Auto-release in ${label}`;
          } else if (escrow.status === 'released' || escrow.status === 'resolved') {
            span.textContent = 'Payment Settled';
          } else if (escrow.status === 'refunded') {
            span.textContent = 'Escrow Refunded';
          } else if (escrow.status === 'disputed') {
            span.textContent = 'Paused (In Dispute)';
          }
        }
      }

      const hubDesc = document.getElementById('action-hub-desc');
      if (hubDesc && escrow.status !== 'disputed' && escrow.status !== 'resolved') {
        if (escrow.status === 'awaiting_deposit') {
          hubDesc.textContent = isFreelancer
            ? 'Share this contract link with your client so they can deposit USDC and lock funds in the vault.'
            : 'Review the agreement terms below and deposit USDC into the smart contract vault to begin.';
        } else if (escrow.status === 'funds_locked') {
          hubDesc.textContent = isFreelancer
            ? 'Funds are locked in the smart contract. Upload your deliverables below to start the client review window.'
            : 'Funds are securely locked on-chain. Wait for the freelancer to submit deliverables, or release early once satisfied.';
        } else if (escrow.status === 'in_review') {
          if (isClient) {
            hubDesc.textContent = 'Deliverables have been submitted. Review the work below and release payment or raise a dispute before the timer expires.';
          } else {
            const label = this.getRemainingReviewLabel(escrow);
            hubDesc.textContent = (this.isInspectionExpired || label === 'Expired')
              ? 'The review window has expired. You can now claim your auto-released payout on-chain.'
              : `Deliverables submitted. The client has ${label} to review before auto-release unlocks.`;
          }
        } else if (escrow.status === 'released') {
          hubDesc.textContent = 'This escrow agreement is complete and funds have been transferred to the freelancer.';
        } else if (escrow.status === 'refunded') {
          hubDesc.textContent = 'This escrow agreement was cancelled and funds were returned to the client.';
        }
      }
    }

    async populatePartiesUI(escrow) {
      const supabase = this.getSupabase();

      let clientId = escrow.client_id || (escrow.creator_role === 'client' ? escrow.creator_id : null);
      let freelancerId = escrow.freelancer_id || (escrow.creator_role === 'freelancer' ? escrow.creator_id : null);

      let profileMap = {};
      const ids = [clientId, freelancerId].filter(Boolean);

      if (supabase && ids.length > 0) {
        try {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name, wallet_address')
            .in('id', ids);

          if (profiles) {
            profiles.forEach((p) => {
              profileMap[p.id] = p;
            });
          }
        } catch (err) {
          console.warn('Parties lookup warning:', err);
        }
      }

      const clientProfile = clientId ? profileMap[clientId] : null;
      const freelancerProfile = freelancerId ? profileMap[freelancerId] : null;

      const clientName = clientProfile?.display_name || (clientId ? 'Client Account' : 'Pending Client');
      const clientAddr = this.onChainClient || clientProfile?.wallet_address || (escrow.creator_role === 'freelancer' ? escrow.counterparty_identifier : '') || '';

      const freelancerName = freelancerProfile?.display_name || 'Freelancer Account';
      const freelancerAddr = this.onChainFreelancer || freelancerProfile?.wallet_address || (escrow.creator_role === 'client' ? escrow.counterparty_identifier : '') || '';

      const clNameEl = document.getElementById('detail-client-name');
      const clAvatarEl = document.getElementById('detail-client-avatar');
      const clAddrEl = document.getElementById('detail-client-addr');
      const clStatusEl = document.getElementById('detail-client-status');

      if (clNameEl) clNameEl.textContent = clientName;
      if (clAvatarEl) clAvatarEl.textContent = getInitials(clientName, 'CL');
      if (clAddrEl) clAddrEl.textContent = clientAddr ? shortenAddress(clientAddr) : 'Awaiting connection';
      if (clStatusEl) {
        const funded = escrow.status !== 'awaiting_deposit';
        clStatusEl.className = `party-status-indicator ${funded ? 'green' : 'rust'}`;
        const span = clStatusEl.querySelector('span');
        if (span) span.textContent = funded ? 'Funds Deposited' : 'Awaiting Deposit';
      }

      const flNameEl = document.getElementById('detail-freelancer-name');
      const flAvatarEl = document.getElementById('detail-freelancer-avatar');
      const flAddrEl = document.getElementById('detail-freelancer-addr');
      const flStatusEl = document.getElementById('detail-freelancer-status');

      if (flNameEl) flNameEl.textContent = freelancerName;
      if (flAvatarEl) flAvatarEl.textContent = getInitials(freelancerName, 'FL');
      if (flAddrEl) flAddrEl.textContent = freelancerAddr ? shortenAddress(freelancerAddr) : 'Awaiting wallet';
      if (flStatusEl) {
        const done = escrow.status === 'released' || escrow.status === 'in_review';
        flStatusEl.className = `party-status-indicator ${done ? 'green' : 'rust'}`;
        const span = flStatusEl.querySelector('span');
        if (span) {
          if (escrow.status === 'released') span.textContent = 'Payout Received';
          else if (escrow.status === 'in_review') span.textContent = 'Work Submitted';
          else if (escrow.status === 'funds_locked') span.textContent = 'Work in Progress';
          else span.textContent = 'Awaiting Deposit';
        }
      }
    }

    async init() {
      const supabase = this.getSupabase();
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) this.currentUserId = session.user.id;
      }

      await this.fetchEscrowFromDatabase();
      await this.fetchDeliverables();
      await this.verifyOnChainContractState();
      this.bindOnChainActions();
      this.bindFileUpload();

      // REALTIME WEBSOCKET SUBSCRIPTION
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
            this.syncBrowserUrl(targetId);
            this.renderEscrowDetails(data);
            return;
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          this.currentUserId = session.user.id;
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
              this.syncBrowserUrl(targetId);
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

    syncBrowserUrl(id) {
      if (window.history && window.history.replaceState && id) {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get('id') !== id) {
          currentUrl.searchParams.set('id', id);
          window.history.replaceState(null, '', currentUrl.toString());
        }
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
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0) {
          this.connectedAddress = accounts[0];
        }

        const provider = new ethers.BrowserProvider(window.ethereum);
        const baxisContract = new ethers.Contract(BAXIS_CONTRACT_ADDRESS, BAXIS_CONTRACT_ABI, provider);
        const bytes32GigId = typeof getGigIdBytes32 === 'function' ? getGigIdBytes32(this.escrowId) : ethers.id(this.escrowId);

        const escrowStruct = await baxisContract.escrows(bytes32GigId);
        if (!escrowStruct) return;

        const statusNum = Number(escrowStruct.status);
        if (escrowStruct.freelancer && escrowStruct.freelancer !== ethers.ZeroAddress) {
          this.onChainFreelancer = escrowStruct.freelancer;
        }
        if (escrowStruct.client && escrowStruct.client !== ethers.ZeroAddress) {
          this.onChainClient = escrowStruct.client;
        }

        const supabase = this.getSupabase();

        if (statusNum === 2) {
          this.inspectionDeadline = Number(escrowStruct.submittedAt) + Number(escrowStruct.inspectionWindow);
          try {
            this.isInspectionExpired = await baxisContract.isInspectionExpired(bytes32GigId);
          } catch {
            this.isInspectionExpired = Math.floor(Date.now() / 1000) >= this.inspectionDeadline;
          }
        } else {
          this.inspectionDeadline = 0;
          this.isInspectionExpired = false;
        }

        let dbStatus = null;
        if (statusNum === 1) {
          dbStatus = 'funds_locked';
        } else if (statusNum === 2) {
          dbStatus = 'in_review';
        } else if (statusNum === 3) {
          dbStatus = 'released';
        } else if (statusNum === 4) {
          dbStatus = 'refunded';
        } else if (statusNum === 5) {
          dbStatus = 'disputed';
        } else if (statusNum === 6) {
          dbStatus = 'resolved';
        }

        if (this.currentEscrow) {
          const statusChanged = dbStatus && this.currentEscrow.status !== dbStatus;
          if (statusChanged) {
            if (supabase) {
              await supabase.from('escrows').update({ status: dbStatus }).eq('id', this.escrowId);
            }
            this.currentEscrow.status = dbStatus;
          }
          if (statusChanged || statusNum === 2 || this.onChainFreelancer || this.onChainClient) {
            this.renderEscrowDetails(this.currentEscrow);
          }
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
          <h3 class="deliverable-heading">${escapeHtml(item.title)}</h3>
          <p class="deliverable-text">${escapeHtml(item.description || 'Uploaded proof asset.')}</p>
          <a href="${escapeHtml(safeUrl(item.proof_url))}" target="_blank" rel="noopener noreferrer" class="deliverable-download-link" style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #3B82F6; text-decoration: none; margin-top: 8px;">
            <span>Download Asset / View File</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </a>
        `;
        container.appendChild(box);
      });
    }

    /**
     * STRICT ROLE-AWARE UI RENDERER
     */
    renderEscrowDetails(escrow) {
      window.currentEscrowVault = {
        gigId: escrow.id,
        clientId: escrow.client_id || (escrow.creator_role === 'client' ? escrow.creator_id : null),
        freelancerId: escrow.freelancer_id || (escrow.creator_role === 'freelancer' ? escrow.creator_id : escrow.counterparty_identifier)
      };

      const mainContent = document.getElementById('details-main');
      if (mainContent) mainContent.style.opacity = '1';

      const titleEl = document.getElementById('detail-contract-title') || document.querySelector('.contract-title');
      if (titleEl) titleEl.textContent = escrow.title;

      const codeEl = document.getElementById('detail-contract-code') || document.querySelector('.contract-id-code');
      if (codeEl) {
        const createdDate = new Date(escrow.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        codeEl.textContent = `Contract ID: #${escrow.id} • Created ${createdDate}`;
      }

      const amountNumEl = document.getElementById('detail-amount-num') || document.querySelector('.amount-number');
      if (amountNumEl) {
        amountNumEl.textContent = `$${parseFloat(escrow.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }

      const tokenEl = document.getElementById('detail-token-symbol') || document.querySelector('.amount-token');
      if (tokenEl) tokenEl.textContent = escrow.currency;

      const statusPillText = document.getElementById('detail-status-text');

      const statusMap = {
        'awaiting_deposit': 'AWAITING DEPOSIT',
        'funds_locked': 'FUNDS LOCKED IN VAULT',
        'in_review': 'IN REVIEW',
        'released': 'PAYMENT RELEASED',
        'refunded': 'REFUNDED TO CLIENT',
        'disputed': 'IN DISPUTE'
      };

      if (statusPillText) statusPillText.textContent = statusMap[escrow.status] || escrow.status.toUpperCase();

      if (this.cancelBtn) {
        this.cancelBtn.style.display = 'none';
      }

      const roles = this.resolveUserRoles(escrow);
      const { isClient, isFreelancer } = roles;

      this.updateLifecycleStepper(escrow);
      this.renderTermsAndMeta(escrow, roles);
      this.populatePartiesUI(escrow);

      // HIDE FILE UPLOAD DROPZONE FOR CLIENTS (ONLY FREELANCER SEES FILE DROPZONE)
      const uploadCard = document.querySelector('.deliverable-upload-card');
      if (uploadCard) {
        if (isFreelancer && (escrow.status === 'funds_locked' || escrow.status === 'in_review')) {
          uploadCard.style.display = 'block';
        } else {
          uploadCard.style.display = 'none';
        }
      }

      if (this.approveBtn) {
        if (escrow.status === 'awaiting_deposit') {
          if (!isFreelancer) {
            this.setApproveBtnText(`Deposit & Lock $${escrow.amount} ${escrow.currency}`);
            this.approveBtn.disabled = false;
            this.approveBtn.style.display = 'inline-flex';
          } else {
            this.setApproveBtnText('Awaiting Client Deposit');
            this.approveBtn.disabled = true;
            this.approveBtn.style.display = 'inline-flex';
          }
        } else if (escrow.status === 'funds_locked' || escrow.status === 'in_review') {
          if (isClient) {
            this.setApproveBtnText(`Approve & Release $${escrow.amount} ${escrow.currency}`);
            this.approveBtn.disabled = false;
            this.approveBtn.style.display = 'inline-flex';
          } else if (escrow.status === 'in_review') {
            const timeLabel = this.getRemainingReviewLabel(escrow);
            if (this.isInspectionExpired || timeLabel === 'Expired') {
              this.setApproveBtnText(`Claim Auto-Released $${escrow.amount} ${escrow.currency}`);
              this.approveBtn.disabled = false;
              this.approveBtn.style.display = 'inline-flex';
              this.approveBtn.style.background = 'var(--state-success)';
            } else {
              this.setApproveBtnText(`In Review • Auto-Release in ${timeLabel}`);
              this.approveBtn.disabled = true;
              this.approveBtn.style.display = 'inline-flex';
              this.approveBtn.style.background = 'var(--state-success)';
            }
          } else {
            this.setApproveBtnText('Funds Secured in Vault');
            this.approveBtn.disabled = true;
            this.approveBtn.style.display = 'inline-flex';
            this.approveBtn.style.background = 'var(--state-success)';
          }
        } else if (escrow.status === 'released') {
          this.setApproveBtnText('Payment Released');
          this.approveBtn.disabled = true;
          this.approveBtn.style.display = 'inline-flex';
          this.approveBtn.style.background = 'var(--state-success)';
          if (this.disputeBtn) this.disputeBtn.style.display = 'none';
        } else if (escrow.status === 'refunded') {
          this.setApproveBtnText('Escrow Cancelled & Refunded');
          this.approveBtn.disabled = true;
          this.approveBtn.style.display = 'inline-flex';
          if (this.disputeBtn) this.disputeBtn.style.display = 'none';
        }
      }

      if (window.checkExistingDisputeOnLoad && escrow.id) {
        window.checkExistingDisputeOnLoad(escrow.id);
      }
    }

    /* ==========================================================================
       FILE UPLOAD ENGINE (SUPABASE STORAGE + ON-CHAIN SUBMIT WORK)
       ========================================================================== */
    bindFileUpload() {
      const fileInput = document.getElementById('deliverable-file-input');
      const dropzoneContent = document.getElementById('dropzone-content');
      const defaultDropzoneHtml = dropzoneContent ? dropzoneContent.innerHTML : '';

      if (fileInput && dropzoneContent) {
        fileInput.addEventListener('change', () => {
          if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileSizeKB = (file.size / 1024).toFixed(1);
            dropzoneContent.innerHTML = `
              <span class="file-selected-badge" style="display: inline-flex; align-items: center; gap: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                ${escapeHtml(file.name)} (${fileSizeKB} KB)
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

        if (!window.baxisWallet) {
          return alert('Wallet provider not found. Check wallet.js!');
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

          // Check on-chain status & call submitWork() if still FUNDED (starts inspection window on Base)
          const signer = await window.baxisWallet.connectWallet();
          if (!signer) {
            throw new Error('Wallet connection cancelled. Please connect your freelancer wallet to submit work on-chain.');
          }

          const provider = new ethers.BrowserProvider(window.ethereum);
          const baxisContract = new ethers.Contract(BAXIS_CONTRACT_ADDRESS, BAXIS_CONTRACT_ABI, provider);
          const bytes32GigId = typeof getGigIdBytes32 === 'function' ? getGigIdBytes32(this.escrowId) : ethers.id(this.escrowId);
          const escrowStruct = await baxisContract.escrows(bytes32GigId);
          const onChainStatus = Number(escrowStruct.status);

          if (onChainStatus === 0) {
            throw new Error('Escrow is not funded on-chain yet.');
          }

          if (onChainStatus === 1) {
            const userAddr = await signer.getAddress();
            if (escrowStruct.freelancer.toLowerCase() !== userAddr.toLowerCase()) {
              throw new Error('Switch to your freelancer payout wallet to start the on-chain review window.');
            }

            this.uploadBtn.textContent = 'Starting Review Window On-Chain...';
            const contractInterface = new ethers.Interface(BAXIS_CONTRACT_ABI);
            const calldata = contractInterface.encodeFunctionData('submitWork', [bytes32GigId]);

            const txHash = await window.ethereum.request({
              method: 'eth_sendTransaction',
              params: [{
                from: userAddr,
                to: BAXIS_CONTRACT_ADDRESS,
                data: calldata
              }]
            });

            this.uploadBtn.textContent = 'Waiting for Blockchain Confirmation...';
            const txReceipt = await provider.waitForTransaction(txHash);
            if (!txReceipt || txReceipt.status !== 1) {
              throw new Error('submitWork transaction reverted on-chain.');
            }
          }

          await supabase.from('deliverables').insert([{
            escrow_id: this.escrowId,
            title: title,
            proof_url: urlData.publicUrl,
            description: `File:${escapeHtml(file.name)} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
          }]);

          await supabase.from('escrows').update({
            status: 'in_review',
            submitted_at: new Date().toISOString()
          }).eq('id', this.escrowId);

          this.uploadBtn.disabled = false;
          this.uploadBtn.textContent = 'Upload File & Submit Proof';
          if (fileInput) fileInput.value = '';
          if (titleInput) titleInput.value = '';
          if (dropzoneContent && defaultDropzoneHtml) dropzoneContent.innerHTML = defaultDropzoneHtml;

          await this.fetchEscrowFromDatabase();
          await this.fetchDeliverables();
          await this.verifyOnChainContractState();

          this.toast.show({
            title: 'Deliverable Submitted!',
            message: 'Proof uploaded and review window started on-chain.',
            type: 'success'
          });

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
          } else if (status === 'in_review' && this.isFreelancerUser()) {
            await this.executeOnChainClaim(signer);
          } else {
            await this.executeOnChainRelease(signer);
          }
        });
      }

      // Explicit Share Link builder with guaranteed ?id= parameter
      if (this.shareBtn) {
        this.shareBtn.addEventListener('click', () => {
          const targetId = this.escrowId || this.currentEscrow?.id;
          if (!targetId) return;

          const shareUrl = `${window.location.origin}${window.location.pathname}?id=${targetId}`;
          if (navigator.clipboard) {
            navigator.clipboard.writeText(shareUrl).then(() => {
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

        // RESOLVE RECIPIENT / FREELANCER WALLET ADDRESS
        let freelancerAddr = '';

        if (this.currentEscrow?.creator_role === 'freelancer') {
          const supabase = this.getSupabase();
          const freelancerProfileId = this.currentEscrow.freelancer_id || this.currentEscrow.creator_id;
          if (supabase && freelancerProfileId) {
            const { data: creatorProfile } = await supabase
              .from('profiles')
              .select('wallet_address')
              .eq('id', freelancerProfileId)
              .maybeSingle();
            if (creatorProfile?.wallet_address && ethers.isAddress(creatorProfile.wallet_address)) {
              freelancerAddr = creatorProfile.wallet_address;
            }
          }
        } else {
          freelancerAddr = this.currentEscrow?.counterparty_identifier || '';
        }

        if (!freelancerAddr || !ethers.isAddress(freelancerAddr)) {
          throw new Error('Invalid Freelancer Wallet Address. A valid 0x recipient wallet address must be set before funding.');
        }

        if (freelancerAddr.toLowerCase() === userAddr.toLowerCase()) {
          throw new Error('You cannot fund an escrow with yourself as the freelancer.');
        }

        const rawHours = this.currentEscrow?.auto_release_hours || 48;
        const timelockSeconds = Math.max(rawHours * 3600, 86400);

        // Cryptographic terms fingerprint
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

        // WAIT FOR ON-CHAIN CONFIRMATION
        this.setApproveBtnText('Waiting for Blockchain Confirmation...');
        const provider = new ethers.BrowserProvider(window.ethereum);
        const txReceipt = await provider.waitForTransaction(txHash);

        if (!txReceipt || txReceipt.status !== 1) {
          throw new Error('Transaction reverted on-chain. Deposit was not executed.');
        }

        this.setApproveBtnText('Updating Database...');

        const supabase = this.getSupabase();
        if (supabase) {
          const updatePayload = {
            status: 'funds_locked',
            funded_at: new Date().toISOString(),
            deposit_tx_hash: txHash
          };

          // If client_id was empty, assign depositing user
          if (!this.currentEscrow.client_id && this.currentUserId) {
            updatePayload.client_id = this.currentUserId;
          }

          await supabase.from('escrows').update(updatePayload).eq('id', this.escrowId);
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

    async executeOnChainClaim(signer) {
      try {
        this.approveBtn.disabled = true;
        this.setApproveBtnText('Verifying Review Window...');

        const provider = new ethers.BrowserProvider(window.ethereum);
        const baxisContract = new ethers.Contract(BAXIS_CONTRACT_ADDRESS, BAXIS_CONTRACT_ABI, provider);
        const bytes32GigId = typeof getGigIdBytes32 === 'function' ? getGigIdBytes32(this.escrowId) : ethers.id(this.escrowId);

        const escrowStruct = await baxisContract.escrows(bytes32GigId);
        const userAddr = await signer.getAddress();

        if (escrowStruct.freelancer.toLowerCase() !== userAddr.toLowerCase()) {
          throw new Error('Switch to your freelancer payout wallet to claim this payment.');
        }

        const expired = await baxisContract.isInspectionExpired(bytes32GigId);
        if (!expired) {
          throw new Error('The client review window has not expired yet.');
        }

        this.setApproveBtnText('Signing Auto-Release Claim...');
        const contractInterface = new ethers.Interface(BAXIS_CONTRACT_ABI);
        const calldata = contractInterface.encodeFunctionData('claimInspectionPayout', [bytes32GigId]);

        const txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{
            from: userAddr,
            to: BAXIS_CONTRACT_ADDRESS,
            data: calldata
          }]
        });

        this.setApproveBtnText('Waiting for Blockchain Confirmation...');
        const txReceipt = await provider.waitForTransaction(txHash);

        if (!txReceipt || txReceipt.status !== 1) {
          throw new Error('Claim transaction reverted on-chain.');
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
          title: 'Auto-Release Claimed On-Chain!',
          message: `Funds settled to your wallet. TX: ${txHash.substring(0, 12)}...`,
          type: 'success',
          duration: 6000
        });

        await this.fetchEscrowFromDatabase();

      } catch (err) {
        console.error('Claim Failed:', err);
        this.renderEscrowDetails(this.currentEscrow);
        this.toast.show({
          title: 'Auto-Release Claim Failed',
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
            ${escapeHtml(file.name)} (${(file.size / 1024 / 1024).toFixed(2)} MB)
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

          if (!window.ethereum || !window.baxisWallet) {
            throw new Error('Connect your wallet to raise a dispute on-chain.');
          }

          const signer = await window.baxisWallet.connectWallet();
          if (!signer) throw new Error('Wallet connection was cancelled.');

          const bytes32GigId = typeof getGigIdBytes32 === 'function' ? getGigIdBytes32(currentEscrow.gigId) : ethers.id(currentEscrow.gigId);
          const evidenceHash = ethers.id(dispute.id);
          const contractInterface = new ethers.Interface(BAXIS_CONTRACT_ABI);
          const calldata = contractInterface.encodeFunctionData('raiseDispute', [bytes32GigId, evidenceHash]);
          const userAddr = await signer.getAddress();

          const txHash = await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [{ from: userAddr, to: BAXIS_CONTRACT_ADDRESS, data: calldata }]
          });

          const provider = new ethers.BrowserProvider(window.ethereum);
          const receipt = await provider.waitForTransaction(txHash);
          if (!receipt || receipt.status !== 1) {
            throw new Error('The on-chain dispute transaction failed.');
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

    /**
     * DISPUTE STATE RENDERER
     */
    function renderInPlaceDisputeState(dispute) {
      if (!dispute) return;

      const statusPillText = document.getElementById('detail-status-text');
      const statusPill = document.getElementById('detail-status-pill') || document.querySelector('.status-pill');
      const btnApprove = document.getElementById('btn-approve-release');
      const btnRaiseDispute = document.getElementById('btn-raise-dispute');
      const hubDesc = document.getElementById('action-hub-desc');
      const actionAlertText = document.getElementById('action-alert-text');

      const isResolved = dispute.status && dispute.status.startsWith('RESOLVED');

      if (isResolved) {
        if (statusPill) {
          statusPill.className = 'status-pill green';
        }
        if (statusPillText) {
          statusPillText.textContent = 'DISPUTE RESOLVED';
        }

        if (btnApprove) {
          btnApprove.disabled = true;
          btnApprove.style.display = 'inline-flex';
          btnApprove.style.background = 'var(--state-success, #10B981)';
          const span = btnApprove.querySelector('span') || btnApprove;
          span.textContent = 'Dispute Settled by Arbitrator';
        }

        if (btnRaiseDispute) {
          btnRaiseDispute.style.display = 'none';
        }

        if (actionAlertText) {
          actionAlertText.textContent = 'Contract Resolved';
        }

        if (hubDesc) {
          const payoutInfo = (dispute.freelancer_payout_amount !== undefined && dispute.client_refund_amount !== undefined)
            ? `Settlement: $${escapeHtml(dispute.freelancer_payout_amount)} USDC Freelancer / $${escapeHtml(dispute.client_refund_amount)} USDC Client. `
            : '';
          hubDesc.innerHTML = `<strong style="color: #10B981;">Dispute Resolved by Baxis Arbitrator.</strong> ${payoutInfo}Notes: "${dispute.resolution_notes || 'Case closed.'}"`;
        }

      } else {
        // ACTIVE OPEN DISPUTE
        if (statusPill) {
          statusPill.className = 'status-pill rust';
        }
        if (statusPillText) {
          statusPillText.textContent = 'IN DISPUTE';
        }

        if (btnApprove) {
          btnApprove.disabled = true;
          btnApprove.style.display = 'none';
        }

        if (btnRaiseDispute) {
          btnRaiseDispute.disabled = true;
          btnRaiseDispute.style.display = 'inline-flex';
          const span = btnRaiseDispute.querySelector('span') || btnRaiseDispute;
          span.textContent = 'Dispute Under Review';
        }

        if (actionAlertText) {
          actionAlertText.textContent = 'Contract Locked';
        }

        if (hubDesc) {
          hubDesc.innerHTML = `<strong style="color: #EF4444;">Contract Locked in Dispute.</strong> Reason: "${dispute.reason}". Awaiting Baxis Arbitrator review.`;
        }
      }

      const auditContainer = document.getElementById('audit-timeline-container');
      if (auditContainer) {
        const row = document.createElement('div');
        row.className = 'audit-row';
        row.innerHTML = `
          <span class="audit-time">Just now</span>
          <span class="audit-event" style="color: ${isResolved ? '#10B981' : '#EF4444'};">${isResolved ? 'Dispute Settled by Arbitrator' : 'Dispute Opened — Evidence Uploaded'}</span>
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