/**
 * BAXIS PROTOCOL — ESCROW DETAILS ENGINE (`escrow-details.js`)
 * Powered by Ethers.js v6 & Supabase PostgreSQL
 */

document.documentElement.classList.add('js-enabled');

(function () {
  'use strict';

  /* ==========================================================================
     CONSTANTS & SHARED HELPERS
     ========================================================================== */
  const BASE_CHAIN_ID = 8453n;
  const MIN_TIMELOCK_SECONDS = 86400;       // Contract MIN_INSPECTION_WINDOW (1 day)
  const MAX_TIMELOCK_SECONDS = 90 * 86400;  // Contract MAX_INSPECTION_WINDOW (90 days)
  const FALLBACK_FEE_BPS = 300n;            // Used only if the contract's fee cannot be read (3%)

  // Minimal ABIs that mirror the verified BaxisEscrow contract (independent of BAXIS_CONTRACT_ABI)
  const WORK_ABI = [
    'function submitWork(bytes32 _gigId)',
    'function claimInspectionPayout(bytes32 _gigId)',
    'error InvalidAddress()',
    'error InvalidGigId()',
    'error InvalidAmount()',
    'error InvalidFreelancer()',
    'error InvalidTimelock()',
    'error UnsupportedToken()',
    'error EscrowAlreadyExists()',
    'error InvalidStatus()',
    'error Unauthorized()',
    'error FeeTooHigh()',
    'error InspectionPeriodNotExpired()',
    'error WorkAlreadySubmitted()',
    'error ExceedsMaxEscrowAmount()',
    'error DisputeTimeoutNotReached()',
    'error EnforcedPause()',
    'error ExpectedPause()',
    'error SafeERC20FailedOperation(address token)',
    'error OwnableUnauthorizedAccount(address account)',
    'error ReentrancyGuardReentrantCall()'
  ];

  const ESCROW_READ_ABI = [
    'function escrows(bytes32) view returns (address client, address freelancer, address token, uint256 amount, bytes32 agreementHash, uint64 createdAt, uint64 submittedAt, uint64 inspectionWindow, uint64 disputedAt, uint64 completedAt, uint8 status)'
  ];

  const GUARD_ABI = [
    'function paused() view returns (bool)',
    'function escrowExists(bytes32) view returns (bool)',
    'function isSupportedToken(address) view returns (bool)',
    'function maxEscrowAmount() view returns (uint256)'
  ];

  // Plain-language explanations for contract reverts
  const CONTRACT_ERROR_MESSAGES = {
    Unauthorized: 'This wallet is not allowed to do this. Switch to the wallet that is part of this escrow.',
    InvalidStatus: 'This escrow is not in the right state for that action (it may already be funded, submitted, released, or disputed).',
    InspectionPeriodNotExpired: 'The inspection window has not ended yet.',
    EscrowAlreadyExists: 'This escrow has already been funded on-chain.',
    ExceedsMaxEscrowAmount: 'This amount is above the current beta limit.',
    UnsupportedToken: 'This token is not supported.',
    InvalidTimelock: 'The inspection window must be between 1 and 90 days.',
    InvalidFreelancer: 'You cannot be the freelancer on your own escrow.',
    InvalidAmount: 'The amount is not valid.',
    InvalidAddress: 'A wallet address is not valid.',
    InvalidGigId: 'The escrow ID is not valid.',
    WorkAlreadySubmitted: 'Work was already submitted, so this action is no longer possible.',
    DisputeTimeoutNotReached: 'The dispute timeout has not been reached yet.',
    EnforcedPause: 'Baxis is paused right now. Please try again later.',
    SafeERC20FailedOperation: 'The USDC transfer failed. Check your USDC balance and approval.'
  };

  let errorInterface = null; // Created on first use (ethers must be loaded by then)

  // Security: escape user-written text before it goes into innerHTML
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Security: only allow https links
  function safeUrl(url) {
    if (!url) return '#';
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.protocol === 'https:' ? parsed.href : '#';
    } catch {
      return '#';
    }
  }

  // Works out who the client and freelancer ACCOUNTS are, based on who created the escrow
  function resolveParties(escrow) {
    let clientId = escrow.client_id || null;
    let freelancerId = escrow.freelancer_id || null;

    if (!clientId && escrow.creator_role === 'client') clientId = escrow.creator_id;
    if (!freelancerId && escrow.creator_role === 'freelancer') freelancerId = escrow.creator_id;

    return { clientId, freelancerId };
  }

  // Safety: refuse to read or send on the wrong network
  async function assertBaseNetwork(provider) {
    const network = await provider.getNetwork();
    if (network.chainId !== BASE_CHAIN_ID) {
      throw new Error('Wrong network. Switch your wallet to Base mainnet and try again.');
    }
  }

  // Turns a raw contract revert into { name, message }, or null if it can't be decoded
  function explainContractError(err) {
    try {
      const data = err && (err.data || (err.info && err.info.error && err.info.error.data));
      if (typeof data !== 'string') return null;
      if (!errorInterface) errorInterface = new ethers.Interface(WORK_ABI);
      const parsed = errorInterface.parseError(data);
      if (!parsed) return null;
      return { name: parsed.name, message: CONTRACT_ERROR_MESSAGES[parsed.name] || null };
    } catch {
      return null;
    }
  }

  function formatDeadline(ms) {
    return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  // In-page confirmation dialog (native confirm() can be silently blocked by the browser, which makes a button look dead)
  function confirmDialog({ title, rows = [], note = '', confirmText = 'Confirm', cancelText = 'Cancel' }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);padding:16px;';

      const card = document.createElement('div');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.style.cssText = 'width:100%;max-width:440px;background:rgba(24,28,36,0.98);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:20px;box-shadow:0 12px 32px rgba(0,0,0,0.6);color:#F3F4F6;font-family:var(--font-sans, sans-serif);font-size:14px;';

      const heading = document.createElement('div');
      heading.textContent = title;
      heading.style.cssText = 'font-size:16px;font-weight:700;margin-bottom:14px;';
      card.appendChild(heading);

      rows.forEach(([label, value, mono]) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-top:1px solid rgba(255,255,255,0.08);';
        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        labelEl.style.cssText = 'color:#9CA3AF;white-space:nowrap;';
        const valueEl = document.createElement('span');
        valueEl.textContent = value;
        valueEl.style.cssText = `text-align:right;${mono ? 'font-family:monospace;font-size:12px;word-break:break-all;' : 'font-weight:600;'}`;
        row.appendChild(labelEl);
        row.appendChild(valueEl);
        card.appendChild(row);
      });

      if (note) {
        const noteEl = document.createElement('div');
        noteEl.textContent = note;
        noteEl.style.cssText = 'margin-top:12px;font-size:12px;line-height:1.5;color:#9CA3AF;';
        card.appendChild(noteEl);
      }

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:18px;';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = cancelText;
      cancelBtn.style.cssText = 'padding:9px 16px;border-radius:999px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#F3F4F6;cursor:pointer;font:inherit;';

      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.textContent = confirmText;
      confirmBtn.style.cssText = 'padding:9px 18px;border-radius:999px;border:0;background:#FFFFFF;color:#0B0B0B;font-weight:700;cursor:pointer;font:inherit;font-weight:700;';

      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      card.appendChild(actions);
      overlay.appendChild(card);

      const onKey = (e) => { if (e.key === 'Escape') finish(false); };
      function finish(result) {
        document.removeEventListener('keydown', onKey);
        overlay.remove();
        resolve(result);
      }

      cancelBtn.addEventListener('click', () => finish(false));
      confirmBtn.addEventListener('click', () => finish(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(false); });
      document.addEventListener('keydown', onKey);

      document.body.appendChild(overlay);
      confirmBtn.focus();
    });
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
      this.onChainEscrow = null;       // Live numbers read from the contract (status, submittedAt, inspectionWindow)
      this.txInProgress = false;       // Blocks double-clicks while a transaction is running
      this.pendingChainSubmit = false; // True when a file was saved but the on-chain submission still needs to be done
      this.deadlineTimer = null;

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

    // The escrow's 32-byte on-chain ID
    getGigBytes32() {
      return typeof getGigIdBytes32 === 'function' ? getGigIdBytes32(this.escrowId) : ethers.id(this.escrowId);
    }

    setApproveBtnText(text) {
      if (!this.approveBtn) return;
      this.approveBtn.disabled = this.txInProgress; // Stays disabled while a transaction is running
      const span = this.approveBtn.querySelector('span');
      if (span) span.textContent = text;
      else this.approveBtn.textContent = text;
    }

    async init() {
      const supabase = this.getSupabase();
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) this.currentUserId = session.user.id;
      }

      await this.fetchEscrowFromDatabase();

      // First visit from the shared link: link this account to the open slot, then re-read the escrow
      try {
        if (await this.claimEscrowRole()) await this.fetchEscrowFromDatabase();
      } catch (err) {
        console.warn('Role linking skipped:', err);
      }

      // Buttons go live as soon as the escrow is on screen, before the slower network reads below
      this.bindOnChainActions();
      this.bindFileUpload();

      await this.fetchDeliverables();
      await this.verifyOnChainContractState();

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

    /**
     * Links the viewer's account to the open slot on the escrow (once), so each person gets the right role.
     * Client-created escrows wait for a freelancer; freelancer-created ones wait for a client.
     * The database also enforces this (only your own account, only if the slot is empty).
     */
    async claimEscrowRole() {
      const escrow = this.currentEscrow;
      const supabase = this.getSupabase();
      if (!supabase || !escrow || !this.currentUserId) return false;

      // Already part of this escrow
      if ([escrow.creator_id, escrow.client_id, escrow.freelancer_id].includes(this.currentUserId)) return false;

      const slot = (!escrow.freelancer_id && escrow.creator_role === 'client') ? 'freelancer_id'
                 : (!escrow.client_id && escrow.creator_role === 'freelancer') ? 'client_id'
                 : null;
      if (!slot) return false;

      const { data, error } = await supabase
        .from('escrows')
        .update({ [slot]: this.currentUserId })
        .eq('id', escrow.id)
        .is(slot, null) // Only if still empty: the first person to claim wins
        .select('id');

      if (error) {
        console.warn('Could not link account to escrow:', error);
        return false;
      }
      return Array.isArray(data) && data.length > 0;
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

    /**
     * Reads the escrow from the contract (the source of truth) and keeps the database status in sync.
     * Chain status: 1 FUNDED, 2 SUBMITTED, 3 RELEASED, 4 REFUNDED, 5 DISPUTED, 6 RESOLVED.
     */
    async verifyOnChainContractState() {
      if (!window.ethereum || !this.escrowId) return;

      try {
        const provider = new ethers.BrowserProvider(window.ethereum);

        // Only trust a read from Base mainnet (silently skip on any other network)
        const network = await provider.getNetwork();
        if (network.chainId !== BASE_CHAIN_ID) return;

        const baxisContract = new ethers.Contract(BAXIS_CONTRACT_ADDRESS, ESCROW_READ_ABI, provider);
        const escrowStruct = await baxisContract.escrows(this.getGigBytes32());
        if (!escrowStruct) return;

        const statusNum = Number(escrowStruct.status);
        this.onChainEscrow = {
          status: statusNum,
          submittedAt: Number(escrowStruct.submittedAt),
          inspectionWindow: Number(escrowStruct.inspectionWindow)
        };

        const supabase = this.getSupabase();

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

        if (dbStatus && this.currentEscrow && this.currentEscrow.status !== dbStatus) {
          if (supabase) {
            await supabase.from('escrows').update({ status: dbStatus }).eq('id', this.escrowId);
          }
          this.currentEscrow.status = dbStatus;
        }

        // Re-render with the live numbers (inspection deadline, synced status)
        if (this.currentEscrow) this.renderEscrowDetails(this.currentEscrow);
      } catch (err) {
        console.warn('Silent on-chain status check:', err.message);
      }
    }

    // When the freelancer's auto-release becomes available (ms timestamp), or null if unknown
    getInspectionDeadlineMs(escrow) {
      // Prefer the contract's own numbers
      const chain = this.onChainEscrow;
      if (chain && chain.status === 2 && chain.submittedAt > 0) {
        return (chain.submittedAt + chain.inspectionWindow) * 1000;
      }

      // Fallback: saved submission time + the escrow's inspection window
      if (escrow && escrow.submitted_at) {
        const rawHours = escrow.auto_release_hours || 48;
        const windowSeconds = Math.min(Math.max(rawHours * 3600, MIN_TIMELOCK_SECONDS), MAX_TIMELOCK_SECONDS);
        const submittedMs = new Date(escrow.submitted_at).getTime();
        if (!Number.isNaN(submittedMs)) return submittedMs + windowSeconds * 1000;
      }

      return null;
    }

    // Re-renders when the deadline passes, so the "Claim Payout" button appears without a page refresh
    scheduleDeadlineRefresh(deadlineMs) {
      clearTimeout(this.deadlineTimer);
      if (!deadlineMs) return;

      const delay = Math.min(Math.max(deadlineMs - Date.now(), 0) + 1000, 2147483647);
      this.deadlineTimer = setTimeout(() => {
        if (this.currentEscrow) this.renderEscrowDetails(this.currentEscrow);
      }, delay);
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
          <a href="${escapeHtml(safeUrl(item.proof_url))}" target="_blank" rel="noopener noreferrer" class="deliverable-link" style="display: inline-flex; align-items: center; gap: 6px;">
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
      // ACCURATE ROLE DETERMINATION (account IDs, never wallet addresses)
      const { clientId, freelancerId } = resolveParties(escrow);

      window.currentEscrowVault = {
        gigId: escrow.id,
        clientId,
        freelancerId
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
        'disputed': 'IN DISPUTE',
        'resolved': 'DISPUTE RESOLVED'
      };

      if (statusPillText) statusPillText.textContent = statusMap[escrow.status] || String(escrow.status || '').toUpperCase();

      if (this.cancelBtn) {
        this.cancelBtn.style.display = 'none';
      }

      const isClient = !!this.currentUserId && this.currentUserId === clientId;
      const isFreelancer = !!this.currentUserId && this.currentUserId === freelancerId;
      const isFunded = escrow.status === 'funds_locked' || escrow.status === 'in_review';

      // HIDE FILE UPLOAD DROPZONE FOR CLIENTS (ONLY FREELANCER SEES FILE DROPZONE)
      const uploadCard = document.querySelector('.deliverable-upload-card');
      if (uploadCard) {
        if (isFreelancer && isFunded) {
          uploadCard.style.display = 'block'; // Freelancer sees upload box!
        } else {
          uploadCard.style.display = 'none';  // Hidden for Client & Spectators!
        }
      }

      // Only the client or freelancer can dispute, and only while funds are locked
      if (this.disputeBtn) {
        const canDispute = (isClient || isFreelancer) && isFunded;
        this.disputeBtn.style.display = canDispute ? '' : 'none';
      }

      // Explain the inspection window to both parties once work is submitted
      const hubDesc = document.getElementById('action-hub-desc');
      const deadlineMs = escrow.status === 'in_review' ? this.getInspectionDeadlineMs(escrow) : null;
      if (hubDesc && escrow.status === 'in_review' && (isClient || isFreelancer)) {
        const when = deadlineMs ? formatDeadline(deadlineMs) : 'the end of the inspection window';
        hubDesc.textContent = isClient
          ? `Work has been submitted. Approve the release, or raise a dispute before ${when}. After that, the freelancer can claim the payout automatically.`
          : `Work submitted. You can claim the payout after ${when}, unless the client approves it or raises a dispute first.`;
      }

      if (this.approveBtn) {
        this.approveBtn.style.background = '';
        this.approveBtn.style.display = '';

        if (escrow.status === 'awaiting_deposit') {
          if (isClient) {
            this.setApproveBtnText(`Deposit & Lock $${escrow.amount} ${escrow.currency}`);
            this.approveBtn.style.display = 'inline-flex';
          } else {
            this.setApproveBtnText('Awaiting Client Deposit');
            this.approveBtn.disabled = true;
          }
        } else if (isFunded) {
          if (isClient) {
            this.setApproveBtnText(`Approve & Release $${escrow.amount} ${escrow.currency}`);
            this.approveBtn.style.display = 'inline-flex';
          } else if (isFreelancer && escrow.status === 'in_review') {
            // Auto-release: the freelancer can claim once the inspection window has ended
            if (!deadlineMs || Date.now() >= deadlineMs) {
              this.setApproveBtnText(`Claim Payout $${escrow.amount} ${escrow.currency}`);
              this.approveBtn.style.display = 'inline-flex';
            } else {
              this.setApproveBtnText(`Payout Available ${formatDeadline(deadlineMs)}`);
              this.approveBtn.disabled = true;
              this.approveBtn.style.background = 'var(--state-success)';
              this.scheduleDeadlineRefresh(deadlineMs);
            }
          } else {
            this.setApproveBtnText('Funds Secured in Vault');
            this.approveBtn.disabled = true;
            this.approveBtn.style.background = 'var(--state-success)';
          }
        } else if (escrow.status === 'released') {
          this.setApproveBtnText('Payment Released');
          this.approveBtn.disabled = true;
          this.approveBtn.style.display = 'inline-flex';
          this.approveBtn.style.background = 'var(--state-success)';
        } else if (escrow.status === 'refunded') {
          this.setApproveBtnText('Escrow Cancelled & Refunded');
          this.approveBtn.disabled = true;
        } else if (escrow.status === 'disputed') {
          this.approveBtn.disabled = true;
          this.approveBtn.style.display = 'none'; // No release while the contract is frozen in dispute
        } else if (escrow.status === 'resolved') {
          this.setApproveBtnText('Dispute Settled by Arbitrator');
          this.approveBtn.disabled = true;
          this.approveBtn.style.display = 'inline-flex';
        }
      }

      // Show dispute details only once the contract has confirmed the dispute (or it is resolved)
      if (window.checkExistingDisputeOnLoad && escrow.id) {
        window.checkExistingDisputeOnLoad(escrow.id, escrow.status);
      }
    }

    /* ==========================================================================
       FILE UPLOAD ENGINE (SUPABASE STORAGE) + ON-CHAIN WORK SUBMISSION
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
                ${escapeHtml(file.name)} (${fileSizeKB} KB)
              </span>
            `;
          }
        });
      }

      if (!this.uploadBtn) return;

      const defaultUploadText = 'Upload File & Submit Proof';

      this.uploadBtn.addEventListener('click', async () => {
        if (this.txInProgress) return;

        const supabase = this.getSupabase();
        if (!supabase) return alert('Supabase not connected!');

        // Only the freelancer on this escrow can submit work, and only while funds are locked
        const escrow = this.currentEscrow;
        const { freelancerId } = escrow ? resolveParties(escrow) : {};
        if (!escrow || (escrow.status !== 'funds_locked' && escrow.status !== 'in_review')) {
          this.toast.show({ title: 'Not Ready Yet', message: 'Work can only be submitted after the client has locked the funds.', type: 'rust' });
          return;
        }
        if (!this.currentUserId || this.currentUserId !== freelancerId) {
          this.toast.show({ title: 'Freelancer Only', message: 'Only the freelancer on this escrow can submit work.', type: 'rust' });
          return;
        }

        const titleInput = document.getElementById('deliverable-title-input');
        const file = fileInput?.files[0];
        const title = titleInput?.value.trim() || (file ? file.name : 'Deliverable Proof');

        // If the file is already saved and only the on-chain step is left, no new file is needed
        const retryOnly = this.pendingChainSubmit;
        if (!file && !retryOnly) {
          this.toast.show({ title: 'No File Selected', message: 'Please select a file to upload.', type: 'rust' });
          return;
        }

        this.txInProgress = true;
        this.uploadBtn.disabled = true;

        try {
          // STEP 1: save the proof file and its record
          if (!retryOnly) {
            this.uploadBtn.textContent = 'Uploading File to Vault...';

            // Storage-safe file name (the original name is kept in the description)
            const safeName = file.name.replace(/[^\w.\-]+/g, '_');
            const filePath = `${this.escrowId}/${Date.now()}_${safeName}`;

            const { error: uploadError } = await supabase.storage
              .from('deliverables-vault')
              .upload(filePath, file, { cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage.from('deliverables-vault').getPublicUrl(filePath);

            // Stored as plain text: it is escaped when displayed, so don't escape it here too
            const { error: insertError } = await supabase.from('deliverables').insert([{
              escrow_id: this.escrowId,
              title: title,
              proof_url: urlData.publicUrl,
              description: `File: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
            }]);

            if (insertError) throw insertError;

            if (fileInput) fileInput.value = '';
            if (titleInput) titleInput.value = '';
          }

          // STEP 2: submit the work on-chain (starts the inspection window).
          // Only needed the first time; extra files after that are just more proof.
          if (escrow.status === 'funds_locked') {
            this.uploadBtn.textContent = 'Confirm Submission in Wallet...';
            try {
              if (!window.baxisWallet) throw new Error('Wallet provider not found. Check wallet.js!');
              const signer = await window.baxisWallet.connectWallet();
              if (!signer) throw new Error('Wallet connection was cancelled.');

              await this.executeOnChainSubmitWork(signer);
              this.pendingChainSubmit = false;
            } catch (chainErr) {
              console.error('On-chain submission failed:', chainErr);

              if (chainErr.contractError === 'InvalidStatus') {
                // The contract already moved on (e.g. work was already submitted): sync and stop retrying
                this.pendingChainSubmit = false;
                await this.verifyOnChainContractState();
              } else {
                this.pendingChainSubmit = true;
              }

              this.toast.show({
                title: 'File Saved, Submission Not Completed',
                message: `${chainErr.message || 'The on-chain submission did not complete.'} Click the button again to retry.`,
                type: 'rust',
                duration: 9000
              });
              return;
            }
          }

          await this.fetchEscrowFromDatabase();
          await this.fetchDeliverables();
          await this.verifyOnChainContractState();

          this.toast.show({ title: 'Work Submitted!', message: 'Proof saved and submitted on-chain. The inspection window has started.', type: 'success', duration: 6000 });

        } catch (err) {
          alert('Upload failed: ' + err.message);
        } finally {
          this.txInProgress = false;
          this.uploadBtn.disabled = false;
          this.uploadBtn.textContent = this.pendingChainSubmit ? 'Retry On-Chain Submission' : defaultUploadText;
        }
      });
    }

    /* ==========================================================================
       REAL SMART CONTRACT TRANSACTION HANDLERS
       ========================================================================== */
    bindOnChainActions() {
      if (this.approveBtn) {
        this.approveBtn.addEventListener('click', async () => {
          if (this.txInProgress) return; // A transaction is already running
          if (!window.baxisWallet) return alert('Wallet provider not found. Check wallet.js!');

          // Decide what this click means BEFORE opening the wallet
          const escrow = this.currentEscrow;
          const status = escrow ? escrow.status : 'awaiting_deposit';
          const { clientId, freelancerId } = escrow ? resolveParties(escrow) : {};
          const isFreelancerOnly = !!this.currentUserId && this.currentUserId === freelancerId && this.currentUserId !== clientId;

          let action = null;
          if (status === 'awaiting_deposit') action = 'deposit';
          else if (status === 'in_review' && isFreelancerOnly) action = 'claim';
          else if (status === 'funds_locked' || status === 'in_review') action = 'release';
          if (!action) return;

          const signer = await window.baxisWallet.connectWallet();
          if (!signer) return;

          if (action === 'deposit') await this.executeOnChainDeposit(signer);
          else if (action === 'claim') await this.executeOnChainClaim(signer);
          else await this.executeOnChainRelease(signer);
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

    // Reads the live platform fee from the contract (falls back to 3% if it can't be read)
    async readPlatformFeeBps(provider) {
      try {
        const feeContract = new ethers.Contract(
          BAXIS_CONTRACT_ADDRESS,
          ['function platformFeeBps() view returns (uint256)'],
          provider
        );
        return await feeContract.platformFeeBps();
      } catch (err) {
        console.warn('Could not read platform fee, using default:', err.message);
        return FALLBACK_FEE_BPS;
      }
    }

    // Free checks BEFORE the user pays gas for an approval that could never lead to a deposit
    async preflightDepositChecks(provider, bytes32GigId, parsedAmount) {
      const fail = (message) => {
        const error = new Error(message);
        error.isPreflight = true;
        return error;
      };

      try {
        const guard = new ethers.Contract(BAXIS_CONTRACT_ADDRESS, GUARD_ABI, provider);
        const [isPaused, alreadyFunded, tokenSupported, maxAmount] = await Promise.all([
          guard.paused(),
          guard.escrowExists(bytes32GigId),
          guard.isSupportedToken(USDC_TOKEN_ADDRESS),
          guard.maxEscrowAmount()
        ]);

        if (isPaused) throw fail(CONTRACT_ERROR_MESSAGES.EnforcedPause);
        if (alreadyFunded) throw fail('This escrow is already funded on-chain. Please refresh the page.');
        if (!tokenSupported) throw fail(CONTRACT_ERROR_MESSAGES.UnsupportedToken);
        if (maxAmount > 0n && parsedAmount > maxAmount) {
          throw fail(`${CONTRACT_ERROR_MESSAGES.ExceedsMaxEscrowAmount} (limit: $${ethers.formatUnits(maxAmount, 6)} USDC)`);
        }
      } catch (err) {
        if (err.isPreflight) throw err;
        console.warn('Pre-flight checks skipped:', err.message); // If the reads fail, the dry run later still protects the user
      }
    }

    // Asks the contract "would this work?" without sending anything (no gas spent).
    // Only blocks when the contract's own error is recognised; if the check is inconclusive
    // (for example a node that is a block behind), the wallet decides, exactly as it did before.
    async dryRunTransaction(provider, from, data, fallbackMessage, hints = {}) {
      try {
        await provider.call({ from, to: BAXIS_CONTRACT_ADDRESS, data });
      } catch (simErr) {
        const info = explainContractError(simErr);
        if (!info) {
          console.warn('Dry run inconclusive, letting the wallet decide:', simErr);
          return;
        }

        console.warn('Dry run rejected by the contract:', info.name);
        const error = new Error(hints[info.name] || info.message || fallbackMessage);
        error.contractError = info.name;
        throw error;
      }
    }

    // Saves status fields to the database after a confirmed transaction; warns (never silently fails) if it can't
    async saveEscrowUpdate(fields, label) {
      const supabase = this.getSupabase();
      if (!supabase) return true;

      const { error } = await supabase.from('escrows').update(fields).eq('id', this.escrowId);
      if (error) {
        console.error(`${label} confirmed on-chain, but the database update failed:`, error);
        this.toast.show({
          title: `${label} Confirmed, Status Not Saved`,
          message: 'The transaction is confirmed on-chain, but the page status could not be saved. Please refresh.',
          type: 'rust',
          duration: 8000
        });
        return false;
      }
      return true;
    }

    // Tells the freelancer which wallet to connect (the one the client entered when funding)
    freelancerWalletHint() {
      const addr = this.currentEscrow && this.currentEscrow.counterparty_identifier;
      return addr && ethers.isAddress(addr)
        ? `Connect the freelancer wallet for this escrow: ${addr}`
        : 'Connect the wallet the client entered as the freelancer address.';
    }

    async executeOnChainDeposit(signer) {
      try {
        this.txInProgress = true;
        this.approveBtn.disabled = true;
        this.setApproveBtnText('Checking On-Chain Allowance...');

        if (!this.currentEscrow) {
          throw new Error('Escrow details are not loaded yet. Please refresh the page and try again.');
        }

        const provider = new ethers.BrowserProvider(window.ethereum);
        await assertBaseNetwork(provider);

        const userAddr = await signer.getAddress();
        const bytes32GigId = this.getGigBytes32();
        const amount = this.currentEscrow.amount;
        const decimals = 6;
        const parsedAmount = ethers.parseUnits(amount.toString(), decimals);

        const feeBps = await this.readPlatformFeeBps(provider);
        const fee = (parsedAmount * feeBps) / 10000n;
        const totalCharge = parsedAmount + fee;

        // Free contract checks first (paused, already funded, token support, beta cap)
        await this.preflightDepositChecks(provider, bytes32GigId, parsedAmount);

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

        // STRICT REAL-MONEY EVM ADDRESS SAFEGUARD (checked BEFORE asking for any approval)
        const freelancerAddr = this.currentEscrow.counterparty_identifier || '';
        if (!freelancerAddr || !ethers.isAddress(freelancerAddr)) {
          throw new Error('Invalid Freelancer Wallet Address. The counterparty must be a valid 0x EVM wallet address before funding.');
        }
        if (freelancerAddr.toLowerCase() === userAddr.toLowerCase()) {
          throw new Error('You cannot create an escrow with yourself as the freelancer.');
        }

        // Show exactly where the money goes before any wallet pop-up
        const confirmed = await confirmDialog({
          title: `Lock $${ethers.formatUnits(parsedAmount, decimals)} USDC in escrow?`,
          rows: [
            ['Escrow amount', `$${ethers.formatUnits(parsedAmount, decimals)} USDC`],
            [`Protection fee (${Number(feeBps) / 100}%)`, `$${ethers.formatUnits(fee, decimals)} USDC`],
            ['Total you pay', `$${ethers.formatUnits(totalCharge, decimals)} USDC`],
            ['Freelancer wallet', freelancerAddr, true]
          ],
          note: 'The funds stay in the contract until you approve the work or a dispute is resolved. Check the freelancer wallet carefully.',
          confirmText: 'Lock Funds'
        });
        if (!confirmed) {
          this.txInProgress = false;
          this.setApproveBtnText(`Deposit & Lock $${amount} ${this.currentEscrow.currency}`);
          return;
        }

        const currentAllowance = await usdcContract.allowance(userAddr, BAXIS_CONTRACT_ADDRESS);

        if (currentAllowance < totalCharge) {
          this.setApproveBtnText('1/2: Approving USDC Allowance...');
          const approveTx = await usdcContract.approve(BAXIS_CONTRACT_ADDRESS, totalCharge); // Exact amount only, never unlimited
          this.setApproveBtnText('Waiting for Allowance Approval...');
          await approveTx.wait();

          // Right after a block, the node can lag by a moment: wait until it can see the new allowance
          for (let attempt = 0; attempt < 8; attempt++) {
            const latestAllowance = await usdcContract.allowance(userAddr, BAXIS_CONTRACT_ADDRESS);
            if (latestAllowance >= totalCharge) break;
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }

        this.setApproveBtnText('2/2: Confirm in Wallet...');

        // Keep the window inside the contract's allowed range (1 to 90 days)
        const rawHours = this.currentEscrow.auto_release_hours || 48;
        const timelockSeconds = Math.min(Math.max(rawHours * 3600, MIN_TIMELOCK_SECONDS), MAX_TIMELOCK_SECONDS);

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

        // Dry run: the contract rejects bad input BEFORE we send (no gas spent)
        await this.dryRunTransaction(
          provider, userAddr, calldata,
          'The contract would reject this deposit. Check the amount, the freelancer wallet address, and that this escrow has not already been funded.'
        );

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
        const txReceipt = await provider.waitForTransaction(txHash);

        if (!txReceipt || txReceipt.status !== 1) {
          throw new Error('Transaction reverted on-chain. Deposit was not executed.');
        }

        this.setApproveBtnText('Updating Database...');

        await this.saveEscrowUpdate({
          status: 'funds_locked',
          funded_at: new Date().toISOString(),
          deposit_tx_hash: txHash
        }, 'Deposit');

        this.currentEscrow.status = 'funds_locked';
        this.txInProgress = false;

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

        await this.verifyOnChainContractState();

      } catch (err) {
        this.txInProgress = false;
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
      } finally {
        this.txInProgress = false;
      }
    }

    async executeOnChainRelease(signer) {
      try {
        this.txInProgress = true;
        this.approveBtn.disabled = true;
        this.setApproveBtnText('Signing On-Chain Release...');

        const provider = new ethers.BrowserProvider(window.ethereum);
        await assertBaseNetwork(provider);

        const contractInterface = new ethers.Interface(BAXIS_CONTRACT_ABI);
        const calldata = contractInterface.encodeFunctionData('releaseFunds', [this.getGigBytes32()]);

        const userAddr = await signer.getAddress();

        // Dry run: the contract rejects wrong wallet / wrong state BEFORE we send (no gas spent)
        await this.dryRunTransaction(
          provider, userAddr, calldata,
          'The contract would reject this release. Make sure you are using the client wallet that funded this escrow.',
          { Unauthorized: 'This wallet did not fund this escrow. Connect the client wallet that made the deposit.' }
        );

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
          throw new Error('Release transaction reverted on-chain.');
        }

        this.setApproveBtnText('Updating Database...');

        await this.saveEscrowUpdate({
          status: 'released',
          released_at: new Date().toISOString(),
          release_tx_hash: txHash
        }, 'Release');

        this.toast.show({
          title: 'Payment Released On-Chain!',
          message: `Settled to freelancer. TX: ${txHash.substring(0, 12)}...`,
          type: 'success',
          duration: 6000
        });

        this.txInProgress = false;
        await this.fetchEscrowFromDatabase();
        await this.verifyOnChainContractState();

      } catch (err) {
        this.txInProgress = false;
        this.approveBtn.disabled = false;
        this.setApproveBtnText('Approve & Release Payment');
        console.error('Release Failed:', err);
        this.toast.show({
          title: 'Release Transaction Failed',
          message: err.reason || err.message || 'Transaction rejected.',
          type: 'rust'
        });
      } finally {
        this.txInProgress = false;
      }
    }

    /**
     * FREELANCER: submits the work on-chain, which starts the inspection window.
     * Returns the transaction hash. Throws (with `contractError` set when known) if it can't complete.
     */
    async executeOnChainSubmitWork(signer) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await assertBaseNetwork(provider);

      const userAddr = await signer.getAddress();
      const calldata = new ethers.Interface(WORK_ABI).encodeFunctionData('submitWork', [this.getGigBytes32()]);

      await this.dryRunTransaction(
        provider, userAddr, calldata,
        'The contract would reject this submission. Make sure the funds are locked and you are using the freelancer wallet.',
        { Unauthorized: `This wallet is not the freelancer wallet for this escrow. ${this.freelancerWalletHint()}` }
      );

      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: userAddr, to: BAXIS_CONTRACT_ADDRESS, data: calldata }]
      });

      this.uploadBtn.textContent = 'Waiting for Blockchain Confirmation...';
      const receipt = await provider.waitForTransaction(txHash);
      if (!receipt || receipt.status !== 1) {
        throw new Error('The on-chain submission reverted.');
      }

      await this.saveEscrowUpdate({
        status: 'in_review',
        submitted_at: new Date().toISOString()
      }, 'Submission');

      return txHash;
    }

    /**
     * FREELANCER: claims the payout after the inspection window ends (auto-release).
     */
    async executeOnChainClaim(signer) {
      try {
        this.txInProgress = true;
        this.approveBtn.disabled = true;
        this.setApproveBtnText('Checking Payout...');

        const provider = new ethers.BrowserProvider(window.ethereum);
        await assertBaseNetwork(provider);

        const userAddr = await signer.getAddress();
        const calldata = new ethers.Interface(WORK_ABI).encodeFunctionData('claimInspectionPayout', [this.getGigBytes32()]);

        await this.dryRunTransaction(
          provider, userAddr, calldata,
          'The contract would reject this payout claim. The inspection window may not have ended, or the escrow may have changed.',
          { Unauthorized: `This wallet is not the freelancer wallet for this escrow. ${this.freelancerWalletHint()}` }
        );

        this.setApproveBtnText('Confirm in Wallet...');
        const txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{ from: userAddr, to: BAXIS_CONTRACT_ADDRESS, data: calldata }]
        });

        this.setApproveBtnText('Waiting for Blockchain Confirmation...');
        const receipt = await provider.waitForTransaction(txHash);
        if (!receipt || receipt.status !== 1) {
          throw new Error('The payout claim reverted on-chain.');
        }

        this.setApproveBtnText('Updating Database...');

        await this.saveEscrowUpdate({
          status: 'released',
          released_at: new Date().toISOString(),
          release_tx_hash: txHash
        }, 'Payout');

        this.toast.show({
          title: 'Payout Claimed!',
          message: `Sent to your wallet. TX: ${txHash.substring(0, 12)}...`,
          type: 'success',
          duration: 6000
        });

        this.txInProgress = false;
        await this.fetchEscrowFromDatabase();
        await this.verifyOnChainContractState();

      } catch (err) {
        this.txInProgress = false;
        console.error('Payout claim failed:', err);
        if (this.currentEscrow) this.renderEscrowDetails(this.currentEscrow); // Restores the correct button text and state
        this.toast.show({
          title: 'Payout Claim Failed',
          message: err.reason || err.message || 'Transaction rejected.',
          type: 'rust'
        });
      } finally {
        this.txInProgress = false;
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
        const { clientId, freelancerId } = resolveParties(e);
        return { gigId: e.id, clientId, freelancerId };
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

        const app = window.appInstance;

        try {
          setSubmitLoading(true);

          // Only the client or freelancer can dispute, and only while the funds are locked
          if (app && app.currentEscrow) {
            const parties = resolveParties(app.currentEscrow);
            if (!app.currentUserId || (app.currentUserId !== parties.clientId && app.currentUserId !== parties.freelancerId)) {
              throw new Error('Only the client or the freelancer on this escrow can raise a dispute.');
            }
            if (!['funds_locked', 'in_review'].includes(app.currentEscrow.status)) {
              throw new Error('A dispute can only be raised while the funds are locked in the vault.');
            }
          }

          // Check the wallet and the contract BEFORE saving anything,
          // so a failed attempt does not leave a dispute record behind
          if (!window.ethereum || !window.baxisWallet) {
            throw new Error('Connect your wallet to raise a dispute on-chain.');
          }

          const signer = await window.baxisWallet.connectWallet();
          if (!signer) throw new Error('Wallet connection was cancelled.');

          const provider = new ethers.BrowserProvider(window.ethereum);
          await assertBaseNetwork(provider);

          const bytes32GigId = typeof getGigIdBytes32 === 'function' ? getGigIdBytes32(currentEscrow.gigId) : ethers.id(currentEscrow.gigId);
          const contractInterface = new ethers.Interface(BAXIS_CONTRACT_ABI);
          const userAddr = await signer.getAddress();

          if (app) {
            await app.dryRunTransaction(
              provider, userAddr,
              contractInterface.encodeFunctionData('raiseDispute', [bytes32GigId, ethers.id('dry-run')]),
              'The contract would reject this dispute. The funds must be locked, and you must use the client or freelancer wallet.',
              { Unauthorized: 'This wallet is not the client or freelancer wallet on this escrow.' }
            );
          }

          let clientId = currentEscrow.clientId;
          let freelancerId = currentEscrow.freelancerId;

          if (!clientId || !freelancerId) {
            const supabase = app ? app.getSupabase() : null;
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

          // The dispute only counts once the contract confirms it
          const evidenceHash = ethers.id(dispute.id);
          const calldata = contractInterface.encodeFunctionData('raiseDispute', [bytes32GigId, evidenceHash]);

          const txHash = await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [{ from: userAddr, to: BAXIS_CONTRACT_ADDRESS, data: calldata }]
          });

          const receipt = await provider.waitForTransaction(txHash);
          if (!receipt || receipt.status !== 1) {
            throw new Error('The on-chain dispute transaction failed.');
          }

          if (app) {
            const supabase = app.getSupabase();
            if (supabase) {
              const { error: statusError } = await supabase.from('escrows').update({ status: 'disputed' }).eq('id', currentEscrow.gigId);
              if (statusError) console.warn('Dispute confirmed on-chain, but the status update failed:', statusError);
              else if (app.currentEscrow) app.currentEscrow.status = 'disputed';
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
          hubDesc.innerHTML = `<strong style="color: #10B981;">Dispute Resolved by Baxis Arbitrator.</strong> ${payoutInfo}Notes: "${escapeHtml(dispute.resolution_notes || 'Case closed.')}"`;
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
          btnApprove.style.display = 'none'; // HIDE RELEASE BUTTON DURING DISPUTE
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
          hubDesc.innerHTML = `<strong style="color: #EF4444;">Contract Locked in Dispute.</strong> Reason: "${escapeHtml(dispute.reason)}". Awaiting Baxis Arbitrator review.`;
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

    // An open dispute is only shown once the contract has confirmed it (escrow status "disputed"),
    // so a dispute whose on-chain step failed never appears as "Under Review". Resolved disputes always show.
    async function checkExistingDisputeOnLoad(gigId, escrowStatus) {
      if (!window.disputeService || !gigId) return;
      try {
        const dispute = await window.disputeService.getDisputeByGigId(gigId);
        if (!dispute) return;

        const isResolved = dispute.status && dispute.status.startsWith('RESOLVED');
        if (isResolved || escrowStatus === 'disputed') {
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