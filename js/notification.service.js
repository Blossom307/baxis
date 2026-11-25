/**
 * ============================================================================
 * BAXIS PROTOCOL — REAL-TIME NOTIFICATION SERVICE (`js/notifications.service.js`)
 * Compact Preview Panel (Latest 5 Items) + Relative Time + Unified Event Router
 * ============================================================================
 */

class NotificationService {
  constructor() {
    this.currentUserId = null;
    this.notifications = [];
    this.unreadCount = 0;
    this.isOpen = false;
    this.init();
  }

  getClient() {
    if (window.baxisSupabase && window.baxisSupabase.auth) return window.baxisSupabase;
    if (window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;
    if (window.supabase && window.supabase.auth) return window.supabase;
    return null;
  }

  formatRelativeTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async init() {
    document.addEventListener('DOMContentLoaded', async () => {
      const supabase = this.getClient();
      if (!supabase) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      this.currentUserId = session.user.id;

      this.injectBellUI();
      await this.loadNotifications();
      this.subscribeRealtime();
    });
  }

  injectBellUI() {
    const topbarActions = document.querySelector('.topbar-actions');
    if (!topbarActions) return;

    // Remove legacy static bell if present to eliminate duplicate icons
    const legacyBell = document.getElementById('btn-notifications-toggle');
    if (legacyBell) {
      const legacyWrapper = legacyBell.closest('.dropdown-wrapper') || legacyBell;
      legacyWrapper.remove();
    }

    if (document.getElementById('bx-bell-wrapper')) return;

    // Create Unified Bell Wrapper
    const bellWrapper = document.createElement('div');
    bellWrapper.id = 'bx-bell-wrapper';
    bellWrapper.className = 'bx-bell-wrapper';

    // Create Bell Trigger Button
    const btnBell = document.createElement('button');
    btnBell.type = 'button';
    btnBell.id = 'bx-btn-bell-toggle';
    btnBell.className = 'bx-bell-btn';
    btnBell.setAttribute('aria-label', 'Notifications');
    btnBell.setAttribute('aria-expanded', 'false');
    btnBell.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      <span id="bx-bell-unread-badge" class="bx-bell-badge" style="display: none;"></span>
    `;

    // Create Notification Panel
    const dropdown = document.createElement('div');
    dropdown.id = 'bx-notif-dropdown-menu';
    dropdown.className = 'bx-notif-dropdown';
    dropdown.setAttribute('role', 'region');
    dropdown.setAttribute('aria-label', 'Notifications Preview');

    dropdown.innerHTML = `
      <div class="bx-notif-header">
        <div class="bx-notif-header-left">
          <span class="bx-notif-title">Notifications</span>
          <span id="bx-notif-unread-count-pill" class="bx-notif-pill" style="display: none;">0 new</span>
        </div>
        <button type="button" id="bx-btn-mark-all-read" class="bx-notif-action-btn">Mark all read</button>
      </div>

      <div id="bx-notif-scroll-box" class="bx-notif-list" role="list">
        <div id="bx-notif-empty-state" class="bx-notif-empty">Loading notifications...</div>
      </div>

      <div class="bx-notif-footer">
        <a href="dashboard.html#activity-feed-section" id="bx-notif-view-all" class="bx-notif-view-all-link">
          <span>View all activity</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </a>
      </div>
    `;

    bellWrapper.appendChild(btnBell);
    bellWrapper.appendChild(dropdown);
    topbarActions.prepend(bellWrapper);

    // Toggle Dropdown on Bell Click
    btnBell.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Close on Click Outside
    document.addEventListener('click', (e) => {
      if (!bellWrapper.contains(e.target)) {
        this.closeDropdown();
      }
    });

    // Close on Escape Key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.closeDropdown();
      }
    });

    // Mark All as Read Button Handler
    const markReadBtn = document.getElementById('bx-btn-mark-all-read');
    if (markReadBtn) {
      markReadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.markAllAsRead();
      });
    }

    // View All Activity Handler (smooth scroll if already on dashboard)
    const viewAllLink = document.getElementById('bx-notif-view-all');
    if (viewAllLink) {
      viewAllLink.addEventListener('click', (e) => {
        this.closeDropdown();
        if (window.location.pathname.endsWith('dashboard.html') || window.location.pathname === '/') {
          const feedSection = document.querySelector('.activity-feed-section') || document.getElementById('activity-feed-section');
          if (feedSection) {
            e.preventDefault();
            feedSection.scrollIntoView({ behavior: 'smooth' });
          }
        }
      });
    }
  }

  toggleDropdown() {
    this.isOpen ? this.closeDropdown() : this.openDropdown();
  }

  openDropdown() {
    const dropdown = document.getElementById('bx-notif-dropdown-menu');
    const btnBell = document.getElementById('bx-btn-bell-toggle');
    if (!dropdown || !btnBell) return;

    dropdown.classList.add('is-open');
    btnBell.setAttribute('aria-expanded', 'true');
    btnBell.classList.add('is-active');
    this.isOpen = true;
  }

  closeDropdown() {
    const dropdown = document.getElementById('bx-notif-dropdown-menu');
    const btnBell = document.getElementById('bx-btn-bell-toggle');
    if (!dropdown || !btnBell) return;

    dropdown.classList.remove('is-open');
    btnBell.setAttribute('aria-expanded', 'false');
    btnBell.classList.remove('is-active');
    this.isOpen = false;
  }

  async loadNotifications() {
    const supabase = this.getClient();
    if (!supabase || !this.currentUserId) return;

    try {
      // 1. Fetch only the latest 5 records for the preview panel
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', this.currentUserId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!error && data) {
        this.notifications = data;
      }

      // 2. Fetch total unread count across all user notifications
      const { count, error: countErr } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', this.currentUserId)
        .eq('is_read', false);

      if (!countErr && typeof count === 'number') {
        this.unreadCount = count;
      } else {
        this.unreadCount = this.notifications.filter(n => !n.is_read).length;
      }

      this.renderNotifications();
    } catch (err) {
      console.warn('[NotificationService] Failed to load notifications:', err);
    }
  }

  renderNotifications() {
    const badge = document.getElementById('bx-bell-unread-badge');
    const pill = document.getElementById('bx-notif-unread-count-pill');
    const container = document.getElementById('bx-notif-scroll-box');
    if (!container) return;

    // Update Bell Icon Unread Indicator
    if (badge) {
      if (this.unreadCount > 0) {
        badge.style.display = 'block';
      } else {
        badge.style.display = 'none';
      }
    }

    // Update Dropdown Header Unread Counter Pill
    if (pill) {
      if (this.unreadCount > 0) {
        pill.textContent = `${this.unreadCount} new`;
        pill.style.display = 'inline-block';
      } else {
        pill.style.display = 'none';
      }
    }

    // Empty State
    if (this.notifications.length === 0) {
      container.innerHTML = `
        <div class="bx-notif-empty">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6B6B6B" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <span>No notifications yet</span>
        </div>
      `;
      return;
    }

    // Render Preview Items (Capped to 5)
    container.innerHTML = '';
    const displayList = this.notifications.slice(0, 5);

    displayList.forEach((n) => {
      const a = document.createElement('a');
      a.className = `bx-notif-item ${!n.is_read ? 'unread' : 'read'}`;
      a.href = n.link && n.link.trim() !== '' ? n.link : '#';
      a.setAttribute('role', 'listitem');

      const relativeTime = this.formatRelativeTime(n.created_at);

      a.innerHTML = `
        <div class="bx-notif-status-col">
          ${!n.is_read ? '<span class="bx-notif-unread-dot" title="Unread"></span>' : '<span class="bx-notif-dot-placeholder"></span>'}
        </div>
        <div class="bx-notif-body">
          <div class="bx-notif-row">
            <span class="bx-notif-item-title">${this.escapeHtml(n.title || 'Notification')}</span>
            <span class="bx-notif-item-time">${relativeTime}</span>
          </div>
          <p class="bx-notif-item-msg">${this.escapeHtml(n.message || '')}</p>
        </div>
      `;

      // Safe Click Router
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        
        // Mark as read in local state and database
        await this.markAsRead(n.id);

        // Navigate safely if destination exists
        const destination = n.link && n.link.trim() !== '' && n.link !== '#' ? n.link : null;
        if (destination) {
          this.closeDropdown();
          window.location.href = destination;
        } else {
          this.closeDropdown();
        }
      });

      container.appendChild(a);
    });
  }

  async markAsRead(id) {
    const item = this.notifications.find(n => n.id === id);
    if (item && !item.is_read) {
      item.is_read = true;
      if (this.unreadCount > 0) this.unreadCount--;
      this.renderNotifications();

      const supabase = this.getClient();
      if (supabase) {
        try {
          await supabase.from('notifications').update({ is_read: true }).eq('id', id);
        } catch (err) {
          console.warn('[NotificationService] Mark read error:', err);
        }
      }
    }
  }

  async markAllAsRead() {
    if (this.unreadCount === 0) return;

    this.unreadCount = 0;
    this.notifications.forEach(n => n.is_read = true);
    this.renderNotifications();

    const supabase = this.getClient();
    if (supabase && this.currentUserId) {
      try {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', this.currentUserId)
          .eq('is_read', false);
      } catch (err) {
        console.warn('[NotificationService] Mark all read error:', err);
      }
    }
  }

  subscribeRealtime() {
    const supabase = this.getClient();
    if (!supabase || !this.currentUserId) return;

    supabase
      .channel(`user-notifications-${this.currentUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${this.currentUserId}`
      }, (payload) => {
        this.notifications.unshift(payload.new);
        if (this.notifications.length > 5) {
          this.notifications.pop(); // Keep exactly 5 in preview memory
        }
        this.unreadCount++;
        this.renderNotifications();
      })
      .subscribe();
  }
}

window.notificationService = new NotificationService();