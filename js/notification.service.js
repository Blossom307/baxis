/**
 * ============================================================================
 * BAXIS PROTOCOL — REAL-TIME NOTIFICATION SERVICE (`js/notifications.service.js`)
 * Zero-Conflict Inline Scrollbox (Guaranteed 240px Capped Height)
 * ============================================================================
 */

class NotificationService {
  constructor() {
    this.currentUserId = null;
    this.notifications = [];
    this.unreadCount = 0;
    this.init();
  }

  getClient() {
    if (window.baxisSupabase && window.baxisSupabase.auth) return window.baxisSupabase;
    if (window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;
    if (window.supabase && window.supabase.auth) return window.supabase;
    return null;
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
    if (!topbarActions || document.getElementById('bx-bell-wrapper')) return;

    // Create Bell Wrapper
    const bellWrapper = document.createElement('div');
    bellWrapper.id = 'bx-bell-wrapper';
    bellWrapper.style.cssText = 'position: relative !important; display: inline-block !important;';

    // Create Bell Button
    const btnBell = document.createElement('button');
    btnBell.type = 'button';
    btnBell.id = 'bx-btn-bell-toggle';
    btnBell.setAttribute('aria-label', 'Notifications');
    btnBell.style.cssText = `
      width: 36px !important; height: 36px !important; border-radius: 8px !important;
      background: #171717 !important; border: 1px solid #2A2A2A !important;
      color: #A0A0A0 !important; display: flex !important; align-items: center !important;
      justify-content: center !important; cursor: pointer !important; position: relative !important;
    `;
    btnBell.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      <span id="bx-bell-unread-badge" style="position: absolute !important; top: -4px !important; right: -4px !important; background: #EF4444 !important; color: #FFFFFF !important; font-family: monospace !important; font-size: 10px !important; font-weight: 700 !important; padding: 1px 5px !important; border-radius: 999px !important; border: 2px solid #090909 !important; display: none;">0</span>
    `;

    // Create Dropdown Box
    const dropdown = document.createElement('div');
    dropdown.id = 'bx-notif-dropdown-menu';
    dropdown.style.cssText = `
      position: absolute !important; top: 46px !important; right: 0 !important;
      width: 320px !important; max-width: 85vw !important; height: 320px !important;
      max-height: 320px !important; background: #111111 !important;
      border: 1px solid #2A2A2A !important; border-radius: 12px !important;
      box-shadow: 0 16px 48px rgba(0,0,0,0.95) !important; z-index: 100000 !important;
      display: none; flex-direction: column !important; overflow: hidden !important;
      box-sizing: border-box !important;
    `;

    dropdown.innerHTML = `
      <div style="padding: 12px 16px !important; border-bottom: 1px solid #1F1F1F !important; display: flex !important; align-items: center !important; justify-content: space-between !important; background: #171717 !important; height: 42px !important; box-sizing: border-box !important;">
        <span style="font-size: 13px !important; font-weight: 700 !important; color: #FFFFFF !important;">Notifications</span>
        <span id="bx-btn-mark-all-read" style="font-size: 11px !important; color: #38BDF8 !important; cursor: pointer !important; font-weight: 600 !important;">Mark all as read</span>
      </div>

      <!-- INLINE STRICT SCROLLBOX (240px HEIGHT CAP) -->
      <div id="bx-notif-scroll-box" style="display: block !important; height: 260px !important; max-height: 260px !important; min-height: 260px !important; overflow-y: auto !important; overflow-x: hidden !important; width: 100% !important; box-sizing: border-box !important; padding: 0 !important; margin: 0 !important;">
        <div id="bx-notif-empty-state" style="padding: 24px !important; text-align: center !important; color: #6B6B6B !important; font-size: 12px !important;">Loading notifications...</div>
      </div>
    `;

    bellWrapper.appendChild(btnBell);
    bellWrapper.appendChild(dropdown);
    topbarActions.prepend(bellWrapper);

    // Event listeners
    btnBell.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = dropdown.style.display === 'flex';
      dropdown.style.display = isVisible ? 'none' : 'flex';

      if (!isVisible && this.unreadCount > 0) {
        this.markAllAsRead();
      }
    });

    document.addEventListener('click', (e) => {
      if (!bellWrapper.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });

    const markReadBtn = document.getElementById('bx-btn-mark-all-read');
    if (markReadBtn) {
      markReadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.markAllAsRead();
      });
    }
  }

  async loadNotifications() {
    const supabase = this.getClient();
    if (!supabase || !this.currentUserId) return;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', this.currentUserId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      this.notifications = data;
      this.renderNotifications();
    }
  }

  renderNotifications() {
    const badge = document.getElementById('bx-bell-unread-badge');
    const container = document.getElementById('bx-notif-scroll-box');
    if (!container) return;

    this.unreadCount = this.notifications.filter(n => !n.is_read).length;

    if (badge) {
      if (this.unreadCount > 0) {
        badge.textContent = this.unreadCount > 9 ? '9+' : this.unreadCount;
        badge.style.display = 'block';
      } else {
        badge.style.display = 'none';
      }
    }

    if (this.notifications.length === 0) {
      container.innerHTML = '<div style="padding: 24px !important; text-align: center !important; color: #6B6B6B !important; font-size: 12px !important;">No notifications yet.</div>';
      return;
    }

    container.innerHTML = '';
    this.notifications.forEach(n => {
      const a = document.createElement('a');
      a.href = n.link || 'dashboard.html';
      a.style.cssText = `
        display: block !important; padding: 12px 16px !important;
        border-bottom: 1px solid #1F1F1F !important; color: #FFFFFF !important;
        text-decoration: none !important; font-size: 12px !important;
        background: ${!n.is_read ? 'rgba(239, 68, 68, 0.06)' : 'transparent'} !important;
        border-left: ${!n.is_read ? '3px solid #EF4444' : 'none'} !important;
        box-sizing: border-box !important; width: 100% !important;
      `;

      const timeAgo = new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      a.innerHTML = `
        <div style="font-weight: 700 !important; margin-bottom: 2px !important; color: #FFFFFF !important;">${n.title}</div>
        <div style="color: #A0A0A0 !important; margin-bottom: 4px !important; line-height: 1.4 !important; word-break: break-word !important;">${n.message}</div>
        <div style="font-family: monospace !important; font-size: 10px !important; color: #6B6B6B !important;">${timeAgo}</div>
      `;

      a.addEventListener('click', () => this.markAsRead(n.id));
      container.appendChild(a);
    });
  }

  async markAsRead(id) {
    const supabase = this.getClient();
    if (!supabase) return;

    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    const item = this.notifications.find(n => n.id === id);
    if (item) item.is_read = true;
    this.renderNotifications();
  }

  async markAllAsRead() {
    const badge = document.getElementById('bx-bell-unread-badge');
    if (badge) {
      badge.style.display = 'none';
      badge.textContent = '0';
    }
    this.unreadCount = 0;

    this.notifications.forEach(n => n.is_read = true);
    this.renderNotifications();

    const supabase = this.getClient();
    if (supabase && this.currentUserId) {
      try {
        await supabase.from('notifications')
          .update({ is_read: true })
          .eq('user_id', this.currentUserId);
      } catch (err) {
        console.warn('[NotificationService] Mark read error:', err);
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
        this.renderNotifications();
      })
      .subscribe();
  }
}

window.notificationService = new NotificationService();