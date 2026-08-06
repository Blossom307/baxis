/**
 * BAXIS PROTOCOL — TRANSACTIONS ENGINE (`transactions.js`)
 * Real PostgreSQL Queries, BaseScan Explorer Links & CSV Receipt Exporter
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
    },

    debounce(fn, delay = 100) {
      let timer;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    }
  };

  /* ==========================================================================
     1. TOAST NOTIFICATION SYSTEM
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

    show({ title, message, type = 'info', duration = 4000 }) {
      const toast = document.createElement('div');
      toast.className = `toast-card toast-${type}`;
      toast.style.cssText = `
        pointer-events: auto;
        min-width: 300px;
        max-width: 420px;
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

      const icons = { success: '✓', info: 'ℹ', rust: '⚠' };
      const colors = { success: '#10B981', info: '#3B82F6', rust: '#EF4444' };

      toast.innerHTML = `
        <span style="color: ${colors[type] || colors.info}; font-weight: 700; font-size: 16px;">${icons[type] || 'ℹ'}</span>
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 2px;">${title}</div>
          <div style="font-size: 12px; color: #9CA3AF;">${message}</div>
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
     3. REAL TRANSACTIONS ENGINE & BASESCAN LINK BUILDER
     ========================================================================== */
  class TransactionsApp {
    constructor() {
      this.toast = new ToastManager();
      this.sidebar = new SidebarManager();
      this.tableBody = document.getElementById('transactions-table-body');
      this.searchInput = document.getElementById('tx-search');
      this.exportBtn = document.getElementById('btn-export-tx');
      
      this.rawTransactions = [];
      this.activeFilter = 'all';

      this.init();
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

    async init() {
      await this.loadAuthenticatedUser();
      await this.fetchUserTransactions();
      this.bindFilterTabs();
      this.bindSearchAndExport();
    }

    async loadAuthenticatedUser() {
      const supabase = this.getSupabase();
      if (!supabase) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          window.location.href = 'auth.html';
          return;
        }

        const user = session.user;
        const displayName = user.user_metadata?.full_name || user.email.split('@')[0];
        const initials = displayName.substring(0, 2).toUpperCase();

        const nameEl = document.getElementById('sidebar-user-name');
        if (nameEl) nameEl.textContent = displayName;

        const avatarEl = document.getElementById('sidebar-user-avatar');
        if (avatarEl) avatarEl.textContent = initials;

        const topbarAvatar = document.getElementById('topbar-avatar-initials');
        if (topbarAvatar) topbarAvatar.textContent = initials;

        const dropdownName = document.getElementById('dropdown-prof-name');
        if (dropdownName) dropdownName.textContent = displayName;

        const dropdownEmail = document.getElementById('dropdown-prof-email');
        if (dropdownEmail) dropdownEmail.textContent = user.email;

      } catch (err) {
        console.error('Session load error:', err);
      }
    }

    async fetchUserTransactions() {
      const supabase = this.getSupabase();
      if (!supabase) return;

      this.renderTableSkeletons();

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const userId = session.user.id;

        // Fetch escrows that have confirmed deposit_tx_hash or release_tx_hash
        const { data, error } = await supabase
          .from('escrows')
          .select('*')
          .or(`creator_id.eq.${userId},client_id.eq.${userId},freelancer_id.eq.${userId}`)
          .order('updated_at', { ascending: false });

        if (error) throw error;

        if (data && data.length > 0) {
          this.rawTransactions = data.filter(e => e.deposit_tx_hash || e.release_tx_hash);
          this.applyFiltersAndRender();
        } else {
          this.renderEmptyState();
          this.calculateMetrics([]);
        }
      } catch (err) {
        console.error('Transactions fetch error:', err);
        this.renderEmptyState();
        this.calculateMetrics([]);
      }
    }

    renderTableSkeletons() {
      if (!this.tableBody) return;
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="padding: 1.5rem 1rem;">
            <div style="height: 20px; background: rgba(255,255,255,0.06); border-radius: 4px; margin-bottom: 8px;"></div>
            <div style="height: 20px; background: rgba(255,255,255,0.06); border-radius: 4px;"></div>
          </td>
        </tr>
      `;
    }

    renderEmptyState() {
      if (!this.tableBody) return;
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="padding: 3rem 1rem; text-align: center;">
            <div style="font-size: 1.5rem; margin-bottom: 0.5rem; color: #6B6B6B;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <h3 style="font-size: 1rem; font-weight: 700; color: #FFFFFF; margin-bottom: 0.25rem;">No On-Chain Transactions Yet</h3>
            <p style="font-size: 0.875rem; color: #A0A0A0; margin-bottom: 1.25rem;">Confirmed vault deposits and releases will generate cryptographic receipts here.</p>
            <a href="create.html" class="btn btn-primary btn-sm">Create Escrow Contract</a>
          </td>
        </tr>
      `;
    }

    applyFiltersAndRender() {
      const rawQuery = this.searchInput?.value || '';
      const query = rawQuery.trim().toLowerCase();

      let filtered = this.rawTransactions.filter((tx) => {
        // Filter tabs matching
        if (this.activeFilter === 'deposit' && tx.status !== 'funds_locked' && tx.status !== 'in_review') return false;
        if (this.activeFilter === 'release' && tx.status !== 'released') return false;
        if (this.activeFilter === 'refund' && tx.status !== 'refunded') return false;

        // Search text matching
        if (query.length > 0) {
          const matchTitle = (tx.title || '').toLowerCase().includes(query);
          const matchId = (tx.id || '').toLowerCase().includes(query);
          const matchHash = ((tx.deposit_tx_hash || '') + (tx.release_tx_hash || '')).toLowerCase().includes(query);
          return matchTitle || matchId || matchHash;
        }

        return true;
      });

      if (filtered.length === 0) {
        this.renderEmptyState();
      } else {
        this.renderTransactionsTable(filtered);
      }

      this.calculateMetrics(this.rawTransactions);
    }

    renderTransactionsTable(transactions) {
      if (!this.tableBody) return;
      this.tableBody.innerHTML = '';

      transactions.forEach((tx) => {
        const tr = document.createElement('tr');
        tr.className = 'table-row';

        const txHash = tx.release_tx_hash || tx.deposit_tx_hash || '0x...';
        const truncatedHash = `${txHash.substring(0, 8)}...${txHash.substring(txHash.length - 6)}`;
        const baseScanUrl = `https://basescan.org/tx/${txHash}`;


        const formattedAmount = `$${parseFloat(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${tx.currency}`;

        const eventTagMap = {
          'funds_locked': '<span class="status-pill green">Vault Deposit</span>',
          'in_review': '<span class="status-pill info">Deposit Locked</span>',
          'released': '<span class="status-pill green">Payout Released</span>',
          'refunded': '<span class="status-pill rust">Client Refund</span>'
        };

        tr.innerHTML = `
          <td>
            <a href="${baseScanUrl}" target="_blank" rel="noopener" class="tx-hash-link" title="View on BaseScan">
              <span>${truncatedHash}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </td>
          <td>
            <div class="deal-title-group">
              <a href="escrow-details.html?id=${tx.id}" class="deal-title">${tx.title}</a>
              <span class="deal-id">#${tx.id}</span>
            </div>
          </td>
          <td><span class="amount-bold">${formattedAmount}</span></td>
          <td>${eventTagMap[tx.status] || tx.status}</td>
          <td>
            <a href="${baseScanUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-xs">BaseScan Explorer ➔</a>
          </td>
        `;

        this.tableBody.appendChild(tr);
      });
    }

    calculateMetrics(transactions) {
      let totalVolume = 0;
      transactions.forEach((tx) => {
        totalVolume += parseFloat(tx.amount) || 0;
      });

      const volumeEl = document.getElementById('tx-total-volume');
      if (volumeEl) {
        volumeEl.innerHTML = `$${totalVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span class="currency">USDC</span>`;
      }

      const countEl = document.getElementById('tx-total-count');
      if (countEl) {
        countEl.innerHTML = `${transactions.length} <span class="currency">Receipts</span>`;
      }
    }

    bindFilterTabs() {
      const tabs = document.querySelectorAll('.table-filter-tabs .tab-btn');
      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          tabs.forEach((t) => t.classList.remove('active'));
          tab.classList.add('active');
          this.activeFilter = tab.getAttribute('data-filter') || 'all';
          this.applyFiltersAndRender();
        });
      });
    }

    bindSearchAndExport() {
      if (this.searchInput) {
        this.searchInput.addEventListener(
          'input',
          System.debounce(() => this.applyFiltersAndRender(), 100)
        );
      }

      if (this.exportBtn) {
        this.exportBtn.addEventListener('click', () => {
          if (this.rawTransactions.length === 0) {
            this.toast.show({ title: 'No Receipts', message: 'No on-chain transactions available to export.', type: 'info' });
            return;
          }

          // Build CSV Receipt Content
          let csv = 'Escrow ID,Title,Amount,Currency,Status,Transaction Hash,Created At\n';
          this.rawTransactions.forEach((tx) => {
            const hash = tx.release_tx_hash || tx.deposit_tx_hash || '';
            csv += `"${tx.id}","${tx.title}",${tx.amount},"${tx.currency}","${tx.status}","${hash}","${tx.created_at}"\n`;
          });

          // Trigger File Download
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `baxis_transactions_${Date.now()}.csv`;
          a.click();

          this.toast.show({ title: 'CSV Export Complete', message: 'Transaction receipts downloaded.', type: 'success' });
        });
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    new TransactionsApp();
  });

})();