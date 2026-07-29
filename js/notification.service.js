/**
 * ============================================================================
 * BAXIS PROTOCOL — REAL-TIME NOTIFICATION SERVICE (`js/notifications.service.js`)
 * Personalized Notifications & Instant Red-Dot Clearing on View
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

      // Inject Bell UI into topbar
      this.injectBellUI();
      
      // Load user-specific notifications & subscribe to Realtime
      await this.loadNotifications();
      this.subscribeRealtime();
    });
  }

  injectBellUI() {
    const topbarActions = document.querySelector('.topbar-actions');
    if (!topbarActions || document.getElementById('baxis-bell-wrapper')) return;

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = `
      .bell-wrapper { position: relative; display: inline-block; }
      .btn-bell {
        width: 36px; height: 36px; border-radius: 8px;
        background: var(--bg-surface-1, #171717); border: 1px solid var(--border-default, #2A2A2A);
        color: var(--text-secondary, #A0A0A0); display: flex; align-items: center; justify-content: center;
        cursor: pointer; position: relative; transition: all 150ms ease;
      }
      .btn-bell:hover { color: #FFFFFF; border-color: #404040; background: #222222; }
      .bell-badge {
        position: absolute; top: -4px; right: -4px;
        background: #EF4444; color: #FFFFFF; font-family: var(--font-mono, monospace);
        font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 999px;
        border: 2px solid #090909; display: none;
      }
      .notif-dropdown {
        position: absolute; top: 46px; right: 0; width: 340px;
        background: #111111; border: 1px solid #2A2A2A; border-radius: 12px;
        box-shadow: 0 16px 40px rgba(0,0,0,0.8); z-index: 9999;
        display: none; flex-direction: column; overflow: hidden;
      }
      .notif-dropdown.active { display: flex; }
      .notif-header {
        padding: 12px 16px; border-bottom: 1px solid #1F1F1F;
        display: flex; align-items: center; justify-content: space-between; background: #171717;
      }
      .notif-header span { font-size: 13px; font-weight: 700; color: #FFFFFF; }
      .notif-clear-btn { font-size: 11px; color: #A0A0A0; cursor: pointer; }
      .notif-clear-btn:hover { color: #FFFFFF; }
      .notif-body { max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; }
      .notif-item {
        padding: 12px 16px; border-bottom: 1px solid #1F1F1F; color: #FFFFFF;
        text-decoration: none; font-size: 12px; transition: background 150ms ease; display: block;
      }
      .notif-item:hover { background: #171717; }
      .notif-item.unread { border-left: 3px solid #EF4444; background: rgba(239, 68, 68, 0.05); }
      .notif-item-title { font-weight: 700; margin-bottom: 2px; color: #FFFFFF; }
      .notif-item-msg { color: #A0A0A0; margin-bottom: 4px; line-height: 1.4; }
      .notif-item-time { font-family: var(--font-mono, monospace); font-size: 10px; color: #6B6B6B; }
      .notif-empty { padding: 24px; text-align: center; color: #6B6B6B; font-size: 12px; }
    `;
    document.head.appendChild(style);

    // Inject HTML Markup
    const bellWrapper = document.createElement('div');
    bellWrapper.className = 'bell-wrapper';
    bellWrapper.id = 'baxis-bell-wrapper';
    bellWrapper.innerHTML = `
      <button type="button" class="btn-bell" id="btn-bell-toggle" aria-label="Notifications">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <span class="bell-badge" id="bell-unread-badge">0</span>
      </button>

      <div class="notif-dropdown" id="notif-dropdown-menu">
        <div class="notif-header">
          <span>Notifications</span>
          <span class="notif-clear-btn" id="btn-mark-all-read">Mark all as read</span>
        </div>
        <div class="notif-body" id="notif-list-container">
          <div class="notif-empty">Loading notifications...</div>
        </div>
      </div>
    `;

    topbarActions.prepend(bellWrapper);

    const toggleBtn = document.getElementById('btn-bell-toggle');
    const dropdown = document.getElementById('notif-dropdown-menu');
    const markReadBtn = document.getElementById('btn-mark-all-read');

    // OPEN DROPDOWN & INSTANTLY CLEAR RED DOT ON VIEW
    if (toggleBtn && dropdown) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = dropdown.classList.toggle('active');

        // IF OPENED AND HAS UNREAD ITEMS -> INSTANTLY CLEAR RED DOT
        if (isActive && this.unreadCount > 0) {
          this.markAllAsRead();
        }
      });

      document.addEventListener('click', (e) => {
        if (!bellWrapper.contains(e.target)) {
          dropdown.classList.remove('active');
        }
      });
    }

    if (markReadBtn) {
      markReadBtn.addEventListener('click', () => this.markAllAsRead());
    }
  }

  async loadNotifications() {
    const supabase = this.getClient();
    if (!supabase || !this.currentUserId) return;

    // QUERY STRICTLY FILTERED BY CURRENT USER ID
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', this.currentUserId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!error && data) {
      this.notifications = data;
      this.renderNotifications();
    }
  }

  renderNotifications() {
    const badge = document.getElementById('bell-unread-badge');
    const container = document.getElementById('notif-list-container');
    if (!container) return;

    this.unreadCount = this.notifications.filter(n => !n.is_read).length;

    // Update Badge Display
    if (badge) {
      if (this.unreadCount > 0) {
        badge.textContent = this.unreadCount > 9 ? '9+' : this.unreadCount;
        badge.style.display = 'block';
      } else {
        badge.style.display = 'none';
      }
    }

    if (this.notifications.length === 0) {
      container.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
      return;
    }

    container.innerHTML = '';
    this.notifications.forEach(n => {
      const a = document.createElement('a');
      a.className = `notif-item ${!n.is_read ? 'unread' : ''}`;
      a.href = n.link || 'dashboard.html';

      const timeAgo = new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      a.innerHTML = `
        <div class="notif-item-title">${n.title}</div>
        <div class="notif-item-msg">${n.message}</div>
        <div class="notif-item-time">${timeAgo}</div>
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
    // 1. INSTANTLY HIDE RED BADGE ON SCREEN (0ms latency!)
    const badge = document.getElementById('bell-unread-badge');
    if (badge) badge.style.display = 'none';
    this.unreadCount = 0;

    // 2. Remove unread red borders visually
    document.querySelectorAll('.notif-item.unread').forEach(item => {
      item.classList.remove('unread');
    });

    this.notifications.forEach(n => n.is_read = true);

    // 3. Update database in background
    const supabase = this.getClient();
    if (supabase && this.currentUserId) {
      await supabase.from('notifications')
        .update({ is_read: true })
        .eq('user_id', this.currentUserId)
        .eq('is_read', false);
    }
  }

  subscribeRealtime() {
    const supabase = this.getClient();
    if (!supabase || !this.currentUserId) return;

    // WebSockets strictly filtered by current user's UUID
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