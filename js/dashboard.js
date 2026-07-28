/**
 * BAXIS PROTOCOL — DASHBOARD ENGINE (`dashboard.js`)
 * Real Database Queries, Dynamic Filter Tabs, Realtime Sync & Session Management
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

      const colors = { success: '#10B981', info: '#3B82F6', rust: '#EF4444', danger: '#EF4444' };

      toast.innerHTML = `
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
     2. SIDEBAR MANAGER
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
     3. DROPDOWN OVERLAYS & NOTIFICATIONS
     ========================================================================== */
  class DropdownManager {
    constructor() {
      this.notifBtn = document.getElementById('btn-notifications-toggle');
      this.notifPanel = document.getElementById('dropdown-notifications');
      this.notifBadge = document.querySelector('.notification-badge');
      this.notifList = document.querySelector('.notification-list');

      this.profileBtn = document.getElementById('btn-profile-toggle');
      this.profilePanel = document.getElementById('dropdown-profile');
      this.init();
    }

    init() {
      if (this.notifBtn && this.notifPanel) {
        this.notifBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggle(this.notifBtn, this.notifPanel);
          this.close(this.profileBtn, this.profilePanel);
        });
      }

      if (this.profileBtn && this.profilePanel) {
        this.profileBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggle(this.profileBtn, this.profilePanel);
          this.close(this.notifBtn, this.notifPanel);
        });
      }

      document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown-wrapper')) {
          this.close(this.notifBtn, this.notifPanel);
          this.close(this.profileBtn, this.profilePanel);
        }
      });
    }

    toggle(btn, panel) {
      if (!btn || !panel) return;
      const isHidden = panel.hasAttribute('hidden');
      if (isHidden) {
        panel.removeAttribute('hidden');
        btn.setAttribute('aria-expanded', 'true');
      } else {
        panel.setAttribute('hidden', 'true');
        btn.setAttribute('aria-expanded', 'false');
      }
    }

    close(btn, panel) {
      if (btn && panel && !panel.hasAttribute('hidden')) {
        panel.setAttribute('hidden', 'true');
        btn.setAttribute('aria-expanded', 'false');
      }
    }

    renderNotifications(notifications) {
      if (!this.notifList) return;
      this.notifList.innerHTML = '';

      let unreadCount = 0;

      if (!notifications || notifications.length === 0) {
        this.notifList.innerHTML = '<li style="padding: 12px; font-size: 12px; color: #A0A0A0; text-align: center;">No notifications yet</li>';
        if (this.notifBadge) this.notifBadge.style.display = 'none';
        return;
      }

      notifications.forEach((n) => {
        if (!n.is_read) unreadCount++;

        const li = document.createElement('li');
        li.className = `notification-item ${n.is_read ? '' : 'unread'}`;

        const formattedTime = new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        li.innerHTML = `
          <div class="notif-content">
            <p class="notif-text"><strong>${n.title}</strong>: ${n.message}</p>
            <span class="notif-time">${formattedTime}</span>
          </div>
        `;

        this.notifList.appendChild(li);
      });

      if (this.notifBadge) {
        this.notifBadge.style.display = unreadCount > 0 ? 'block' : 'none';
      }
    }
  }

  /* ==========================================================================
     4. REAL SUPABASE DASHBOARD ENGINE WITH DYNAMIC FILTER TABS
     ========================================================================== */
  class DashboardApp {
    constructor() {
      this.toast = new ToastManager();
      this.sidebar = new SidebarManager();
      this.dropdowns = new DropdownManager();
      this.tableBody = document.getElementById('escrow-table-body');
      
      this.rawEscrows = [];
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
      const supabase = this.getSupabase();
      if (!supabase) return;

      this.bindFilterTabs();

      supabase.auth.onAuthStateChange(async (event, session) => {
        if (!session) {
          window.location.href = 'auth.html';
          return;
        }

        const user = session.user;
        const displayName = user.user_metadata?.full_name || user.email.split('@')[0];
        const initials = displayName.substring(0, 2).toUpperCase();

        const welcomeHeading = document.getElementById('welcome-heading');
        if (welcomeHeading) welcomeHeading.textContent = `Welcome back, ${displayName}`;

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

        await this.fetchUserEscrows(user.id);
        await this.fetchUserNotifications();
        this.bindNotificationActions();
        this.bindLogout();
      });

      // Realtime WebSocket Subscription
      supabase
        .channel('dashboard-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'escrows' }, () => {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) this.fetchUserEscrows(session.user.id);
          });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
          this.fetchUserNotifications();
        })
        .subscribe();
    }

    async fetchUserEscrows(userId) {
      const supabase = this.getSupabase();
      if (!supabase || !userId) return;

      this.renderTableSkeletons();

      try {
        const { data, error } = await supabase
          .from('escrows')
          .select('*')
          .or(`creator_id.eq.${userId},client_id.eq.${userId},freelancer_id.eq.${userId}`)
          .order('created_at', { ascending: false });

        if (error) throw error;

        this.rawEscrows = data || [];
        this.calculateMetrics(this.rawEscrows);
        this.applyTableFilter(this.activeFilter);

      } catch (err) {
        console.error('Failed to fetch escrows:', err);
        this.rawEscrows = [];
        this.applyTableFilter(this.activeFilter);
        this.calculateMetrics([]);
      }
    }

    /* BIND FILTER TABS (ALL, NEEDS ACTION, IN PROGRESS, COMPLETED) */
    bindFilterTabs() {
      const tabs = document.querySelectorAll('.table-filter-tabs .tab-btn');
      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          tabs.forEach((t) => t.classList.remove('active'));
          tab.classList.add('active');

          this.activeFilter = tab.getAttribute('data-filter') || 'all';
          this.applyTableFilter(this.activeFilter);
        });
      });
    }

    /* DYNAMIC FILTER LOGIC & CONTEXTUAL EMPTY STATES */
    applyTableFilter(filter) {
      const messages = {
        all: {
          title: 'No Active Escrow Contracts',
          desc: 'Create your first protected escrow agreement in under 60 seconds.'
        },
        attention: {
          title: 'No Actions Pending',
          desc: 'You have no escrow contracts requiring immediate review or deposit.'
        },
        progress: {
          title: 'No Contracts In Progress',
          desc: 'Active escrow vaults with locked funds will appear here.'
        },
        completed: {
          title: 'No Completed Contracts Yet',
          desc: 'Your settled transactions and released payouts will appear here.'
        }
      };

      const msg = messages[filter] || messages.all;

      if (!this.rawEscrows || this.rawEscrows.length === 0) {
        this.renderEmptyState(msg.title, msg.desc);
        return;
      }

      const filtered = this.rawEscrows.filter((deal) => {
        if (filter === 'all') return true;
        if (filter === 'attention') return deal.status === 'in_review' || deal.status === 'awaiting_deposit';
        if (filter === 'progress') return deal.status === 'funds_locked';
        if (filter === 'completed') return deal.status === 'released' || deal.status === 'refunded';
        return true;
      });

      if (filtered.length > 0) {
        this.renderEscrowTable(filtered);
      } else {
        this.renderEmptyState(msg.title, msg.desc);
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

    /* RENDER DYNAMIC EMPTY STATE (ZERO EMOJIS, 100% SVG) */
    renderEmptyState(title = 'No Active Escrow Contracts', desc = 'Create your first protected escrow agreement in under 60 seconds.') {
      if (!this.tableBody) return;
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="padding: 3.5rem 1rem; text-align: center;">
            <div style="margin-bottom: 0.75rem; color: #6B6B6B; display: flex; justify-content: center;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h3 style="font-size: 1rem; font-weight: 700; color: #FFFFFF; margin-bottom: 0.25rem;">${title}</h3>
            <p style="font-size: 0.875rem; color: #A0A0A0; margin-bottom: 1.25rem;">${desc}</p>
            <a href="create.html" class="btn btn-primary btn-sm">Create Escrow Agreement</a>
          </td>
        </tr>
      `;
    }

    renderEscrowTable(escrows) {
      if (!this.tableBody) return;
      this.tableBody.innerHTML = '';

      escrows.forEach((deal) => {
        const tr = document.createElement('tr');
        tr.className = 'table-row';

        const formattedAmount = `$${parseFloat(deal.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${deal.currency}`;
        const statusMap = {
          'awaiting_deposit': '<span class="status-pill info">Awaiting Deposit</span>',
          'funds_locked': '<span class="status-pill green">Funds Locked</span>',
          'in_review': '<span class="status-pill rust">In Review</span>',
          'released': '<span class="status-pill green">Released</span>',
          'disputed': '<span class="status-pill rust">Disputed</span>'
        };

        tr.innerHTML = `
          <td>
            <div class="deal-title-group">
              <a href="escrow-details.html?id=${deal.id}" class="deal-title">${deal.title}</a>
              <span class="deal-id">#${deal.id}</span>
            </div>
          </td>
          <td><span style="font-family: var(--font-mono); font-size: 12px; color: #A0A0A0;">${deal.counterparty_identifier}</span></td>
          <td><span class="amount-bold">${formattedAmount}</span></td>
          <td>${statusMap[deal.status] || deal.status}</td>
          <td><a href="escrow-details.html?id=${deal.id}" class="btn btn-secondary btn-xs">View Vault</a></td>
        `;

        this.tableBody.appendChild(tr);
      });
    }

    calculateMetrics(escrows) {
      let lockedTotal = 0;
      let reviewTotal = 0;
      let settledTotal = 0;
      let activeCount = 0;
      let reviewCount = 0;

      escrows.forEach((e) => {
        const amt = parseFloat(e.amount) || 0;
        if (e.status === 'funds_locked' || e.status === 'awaiting_deposit') {
          lockedTotal += amt;
          activeCount++;
        } else if (e.status === 'in_review') {
          reviewTotal += amt;
          reviewCount++;
        } else if (e.status === 'released') {
          settledTotal += amt;
        }
      });

      const elLocked = document.getElementById('metric-locked-val');
      if (elLocked) elLocked.innerHTML = `$${lockedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span class="currency">USDC</span>`;

      const elReview = document.getElementById('metric-review-val');
      if (elReview) elReview.innerHTML = `$${reviewTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span class="currency">USDC</span>`;

      const elSettled = document.getElementById('metric-settled-val');
      if (elSettled) elSettled.innerHTML = `$${settledTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span class="currency">USDC</span>`;

      const activeCountEl = document.getElementById('metric-active-count');
      if (activeCountEl) activeCountEl.textContent = `${activeCount} Active Contracts`;

      const reviewCountEl = document.getElementById('metric-review-count');
      if (reviewCountEl) reviewCountEl.textContent = `${reviewCount} Pending Review`;
    }

    async fetchUserNotifications() {
      const supabase = this.getSupabase();
      if (!supabase) return;

      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);

        if (!error && data) {
          this.dropdowns.renderNotifications(data);
        }
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      }
    }

    bindNotificationActions() {
      const markBtn = document.querySelector('.btn-text-action');
      if (markBtn) {
        markBtn.addEventListener('click', async () => {
          const supabase = this.getSupabase();
          if (supabase) {
            await supabase
              .from('notifications')
              .update({ is_read: true })
              .neq('id', '00000000-0000-0000-0000-000000000000');

            await this.fetchUserNotifications();
            this.toast.show({
              title: 'Notifications Cleared',
              message: 'All notifications marked as read.',
              type: 'info'
            });
          }
        });
      }
    }

    bindLogout() {
      const logoutBtn = document.getElementById('btn-logout');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          const supabase = this.getSupabase();
          if (supabase) {
            await supabase.auth.signOut();
            window.location.href = 'auth.html';
          }
        });
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    new DashboardApp();
  });

})();