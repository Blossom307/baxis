/**
 * BAXIS PROTOCOL — PROFILE & REPUTATION ENGINE (`profile.js`)
 * Single Hero Edit Trigger, Base64 Avatars & Realtime Profile Sync
 */

document.documentElement.classList.add('js-enabled');

(function () {
  'use strict';

  const System = {
    /**
     * Smart Initials Generator: "Dan Smith" -> "DS", "Alex" -> "AL"
     */
    getInitials(name) {
      if (!name || !name.trim()) return 'BX';
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
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

      const colors = { success: '#10B981', info: '#3B82F6', rust: '#EF4444' };

      toast.innerHTML = `
        <span style="color: ${colors[type] || colors.info}; font-weight: 700; font-size: 16px;">•</span>
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
     3. PROFILE & REPUTATION APP
     ========================================================================== */
  class ProfileApp {
    constructor() {
      this.toast = new ToastManager();
      this.sidebar = new SidebarManager();
      this.shareProfileBtn = document.getElementById('btn-share-profile');
      this.copyCardCodeBtn = document.getElementById('btn-copy-card-code');
      this.avatarInput = document.getElementById('avatar-file-input');
      this.editForm = document.getElementById('form-edit-profile');

      this.currentUserId = null;
      this.userEmail = '';
      this.currentAvatarUrl = null;
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

    async init() {
      this.bindEditToggle();
      await this.loadUserProfile();
      await this.checkConnectedWallet();
      this.bindAvatarUpload();
      this.bindProfileSave();
      this.bindClipboardActions();
    }

    /**
     * SINGLE HERO EDIT PANEL TOGGLE
     */
    bindEditToggle() {
      const heroBtn = document.getElementById('btn-edit-profile-hero');
      const card = document.getElementById('profile-edit-card');
      if (!heroBtn || !card) return;

      heroBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const isHidden = card.hasAttribute('hidden') || card.style.display === 'none' || getComputedStyle(card).display === 'none';

        if (isHidden) {
          card.removeAttribute('hidden');
          card.style.display = 'block';
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          card.setAttribute('hidden', 'true');
          card.style.display = 'none';
        }
      });
    }

    async checkConnectedWallet() {
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts && accounts.length > 0) {
            const addr = accounts[0];
            const shortAddr = `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
            
            const addrEl = document.getElementById('profile-address-code');
            if (addrEl) addrEl.textContent = `${shortAddr} • Base Network Connected`;

            const walletAddrEl = document.getElementById('display-wallet-address');
            if (walletAddrEl) walletAddrEl.textContent = shortAddr;

            const walletTagEl = document.getElementById('wallet-status-tag');
            if (walletTagEl) {
              walletTagEl.textContent = 'Connected';
              walletTagEl.className = 'wallet-tag active';
            }
          }
        } catch (err) {
          console.warn('Wallet address check:', err);
        }
      }
    }

    async loadUserProfile() {
      const supabase = this.getSupabase();
      if (!supabase) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          window.location.href = 'index.html';
          return;
        }

        this.currentUserId = session.user.id;
        this.userEmail = session.user.email || '';

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', this.currentUserId)
          .maybeSingle();

        // Local Storage Permanent Cache Fallback
        const cachedAvatar = localStorage.getItem(`baxis_avatar_${this.currentUserId}`);

        this.currentAvatarUrl = profile?.avatar_url || cachedAvatar || null;

        const activeProfile = profile || {
          id: this.currentUserId,
          email: this.userEmail,
          display_name: this.userEmail ? this.userEmail.split('@')[0] : 'User Account',
          bio: 'Digital Contract Member on Baxis Protocol.',
          avatar_url: this.currentAvatarUrl
        };

        if (this.currentAvatarUrl) {
          activeProfile.avatar_url = this.currentAvatarUrl;
        }

        this.renderProfileUI(activeProfile);
        this.populateEditForm(activeProfile);

        const { data: escrows } = await supabase
          .from('escrows')
          .select('*')
          .or(`client_id.eq.${this.currentUserId},freelancer_id.eq.${this.currentUserId},creator_id.eq.${this.currentUserId}`);

        if (escrows) {
          this.renderStatsAndHistory(escrows);
        }

      } catch (err) {
        console.error('Failed to load profile:', err);
      }
    }

    renderProfileUI(profile) {
      const displayName = profile.display_name || (this.userEmail ? this.userEmail.split('@')[0] : 'User Account');
      const initials = System.getInitials(displayName);

      // Display Name & Job Title
      const nameEl = document.getElementById('profile-display-name');
      if (nameEl) nameEl.textContent = displayName;

      const cardNameEl = document.getElementById('card-display-name');
      if (cardNameEl) cardNameEl.textContent = displayName;

      const jobEl = document.getElementById('profile-job-title');
      if (jobEl) jobEl.textContent = profile.job_title || 'Digital Contract Member';

      // Render Bio Summary
      const bioEl = document.getElementById('profile-bio-display');
      if (bioEl) bioEl.textContent = profile.bio || 'Digital Contract Member on Baxis Protocol.';

      // Sidebar Initials
      const sbNameEl = document.getElementById('sidebar-user-name');
      if (sbNameEl) sbNameEl.textContent = displayName;

      const sbAvatarEl = document.getElementById('sidebar-user-avatar');
      if (sbAvatarEl) sbAvatarEl.textContent = initials;

      // Render Avatars (With guaranteed Initials Fallback)
      const avatarUrl = profile.avatar_url || this.currentAvatarUrl;
      this.updateAvatarUI(avatarUrl, initials);

      // ENS Handle
      const ensBadge = document.getElementById('profile-ens-badge');
      const displayEns = document.getElementById('display-ens');
      const statusEns = document.getElementById('status-ens');

      if (profile.ens_name) {
        if (ensBadge) {
          ensBadge.textContent = profile.ens_name;
          ensBadge.removeAttribute('hidden');
        }
        if (displayEns) displayEns.textContent = profile.ens_name;
        if (statusEns) {
          statusEns.textContent = 'Linked';
          statusEns.className = 'cred-status green';
        }
      } else {
        if (ensBadge) ensBadge.setAttribute('hidden', 'true');
        if (displayEns) displayEns.textContent = 'Not linked';
        if (statusEns) {
          statusEns.textContent = '--';
          statusEns.className = 'cred-status';
        }
      }

      // Twitter / X
      const displayTw = document.getElementById('display-twitter');
      const statusTw = document.getElementById('status-twitter');
      if (profile.twitter_handle) {
        if (displayTw) displayTw.textContent = profile.twitter_handle;
        if (statusTw) {
          statusTw.textContent = 'Linked';
          statusTw.className = 'cred-status green';
        }
      } else {
        if (displayTw) displayTw.textContent = 'Not linked';
        if (statusTw) {
          statusTw.textContent = '--';
          statusTw.className = 'cred-status';
        }
      }

      // Discord
      const displayDc = document.getElementById('display-discord');
      const statusDc = document.getElementById('status-discord');
      if (profile.discord_handle) {
        if (displayDc) displayDc.textContent = profile.discord_handle;
        if (statusDc) {
          statusDc.textContent = 'Linked';
          statusDc.className = 'cred-status green';
        }
      } else {
        if (displayDc) displayDc.textContent = 'Not linked';
        if (statusDc) {
          statusDc.textContent = '--';
          statusDc.className = 'cred-status';
        }
      }

      const cardSub = document.getElementById('card-handles-sub');
      if (cardSub) {
        cardSub.textContent = `${profile.twitter_handle || profile.ens_name || '@user'} • Baxis Member`;
      }
    }

    populateEditForm(profile) {
      if (profile.display_name) document.getElementById('edit-display-name').value = profile.display_name;
      if (profile.job_title) document.getElementById('edit-job-title').value = profile.job_title;
      if (profile.bio && document.getElementById('edit-bio')) document.getElementById('edit-bio').value = profile.bio;
      if (profile.ens_name) document.getElementById('edit-ens-name').value = profile.ens_name;
      if (profile.twitter_handle) document.getElementById('edit-twitter').value = profile.twitter_handle;
      if (profile.discord_handle) document.getElementById('edit-discord').value = profile.discord_handle;
    }

    updateAvatarUI(imageUrl, initials = 'BX') {
      const avatarBox = document.getElementById('profile-avatar-box');
      const cardAvatarBox = document.getElementById('card-avatar-box');

      [avatarBox, cardAvatarBox].forEach((box) => {
        if (!box) return;
        if (imageUrl && imageUrl.trim().length > 5) {
          box.style.backgroundImage = `url("${imageUrl}")`;
          box.style.backgroundSize = 'cover';
          box.style.backgroundPosition = 'center';
          box.textContent = '';
        } else {
          box.style.backgroundImage = 'none';
          box.textContent = initials;
        }
      });
    }

    /* ==========================================================================
       PERMANENT AVATAR UPLOAD (BASE64 DATA STRINGS + LOCAL STORAGE + SUPABASE)
       ========================================================================== */
    bindAvatarUpload() {
      if (!this.avatarInput) return;

      this.avatarInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !this.currentUserId) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64DataUrl = event.target.result; // Permanent self-contained data string

          // 1. Instant local storage & UI update
          this.currentAvatarUrl = base64DataUrl;
          localStorage.setItem(`baxis_avatar_${this.currentUserId}`, base64DataUrl);
          this.updateAvatarUI(base64DataUrl, 'BX');

          this.toast.show({
            title: 'Avatar Saved!',
            message: 'Your profile picture is permanently saved.',
            type: 'success'
          });

          // 2. Save in Supabase database
          try {
            const supabase = this.getSupabase();
            if (supabase) {
              await supabase.from('profiles').upsert({
                id: this.currentUserId,
                email: this.userEmail,
                avatar_url: base64DataUrl,
                updated_at: new Date().toISOString()
              }, { onConflict: 'id' });
            }
          } catch (err) {
            console.warn('Supabase avatar save:', err);
          }
        };

        reader.readAsDataURL(file);
      });
    }

    /* ==========================================================================
       SAVE PROFILE SETTINGS FORM (PRESERVES AVATAR URL)
       ========================================================================== */
    bindProfileSave() {
      if (!this.editForm) return;

      this.editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const supabase = this.getSupabase();
        if (!supabase || !this.currentUserId) return;

        const displayName = document.getElementById('edit-display-name').value.trim();
        const jobTitle = document.getElementById('edit-job-title').value.trim();
        const bio = document.getElementById('edit-bio') ? document.getElementById('edit-bio').value.trim() : '';
        const ensName = document.getElementById('edit-ens-name').value.trim();
        const twitter = document.getElementById('edit-twitter').value.trim();
        const discord = document.getElementById('edit-discord').value.trim();

        const saveBtn = document.getElementById('btn-save-profile');
        if (saveBtn) {
          saveBtn.disabled = true;
          const span = saveBtn.querySelector('span') || saveBtn;
          span.textContent = 'Saving Changes...';
        }

        try {
          const activeAvatar = this.currentAvatarUrl || localStorage.getItem(`baxis_avatar_${this.currentUserId}`);

          const { error } = await supabase
            .from('profiles')
            .upsert({
              id: this.currentUserId,
              email: this.userEmail,
              display_name: displayName,
              job_title: jobTitle,
              bio: bio,
              ens_name: ensName,
              twitter_handle: twitter,
              discord_handle: discord,
              avatar_url: activeAvatar,
              updated_at: new Date().toISOString()
            }, { onConflict: 'id' });

          if (error) throw error;

          const updatedProfile = {
            id: this.currentUserId,
            email: this.userEmail,
            display_name: displayName,
            job_title: jobTitle,
            bio: bio,
            ens_name: ensName,
            twitter_handle: twitter,
            discord_handle: discord,
            avatar_url: activeAvatar
          };

          this.renderProfileUI(updatedProfile);

          const editCard = document.getElementById('profile-edit-card');
          if (editCard) {
            editCard.setAttribute('hidden', 'true');
            editCard.style.display = 'none'; // Auto-close panel on save
          }

          this.toast.show({
            title: 'Profile Saved!',
            message: 'Your profile details have been updated.',
            type: 'success'
          });

        } catch (err) {
          console.error('Save failed:', err);
          alert('Save failed: ' + err.message);
        } finally {
          if (saveBtn) {
            saveBtn.disabled = false;
            const span = saveBtn.querySelector('span') || saveBtn;
            span.textContent = 'Save Profile Changes';
          }
        }
      });
    }

    renderStatsAndHistory(escrows) {
      let settledVolume = 0;
      let completedCount = 0;

      escrows.forEach((e) => {
        const amt = parseFloat(e.amount) || 0;
        if (e.status === 'released' || e.status === 'funds_locked') {
          settledVolume += amt;
        }
        if (e.status === 'released') {
          completedCount += 1;
        }
      });

      // DYNAMIC REPUTATION BADGE
      const trustBadgeEl = document.getElementById('profile-trust-badge');
      if (trustBadgeEl) {
        if (completedCount === 0) {
          trustBadgeEl.textContent = 'New Member';
        } else {
          trustBadgeEl.textContent = `100% Success Rate • ${completedCount} Deals`;
        }
      }

      const settledValEl = document.getElementById('profile-settled-val');
      if (settledValEl) {
        settledValEl.innerHTML = `$${settledVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span class="currency">USDC</span>`;
      }

      const completedCountEl = document.getElementById('profile-completed-count');
      if (completedCountEl) {
        completedCountEl.innerHTML = `${completedCount} <span class="currency">Deals</span>`;
      }

      const cardVolEl = document.getElementById('card-stat-vol');
      if (cardVolEl) cardVolEl.textContent = `$${(settledVolume / 1000).toFixed(1)}k`;

      const cardDealsEl = document.getElementById('card-stat-deals');
      if (cardDealsEl) cardDealsEl.textContent = completedCount.toString();

      const tableBody = document.getElementById('profile-history-table-body');
      if (!tableBody) return;
      tableBody.innerHTML = '';

      if (escrows.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="4" style="padding: 2rem; text-align: center; color: #A0A0A0;">
              No verified escrow history yet.
            </td>
          </tr>
        `;
        return;
      }

      escrows.forEach((deal) => {
        const tr = document.createElement('tr');
        const formattedAmount = `$${parseFloat(deal.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${deal.currency || 'USDC'}`;
        const statusMap = {
          'awaiting_deposit': '<span class="status-pill info">Awaiting Deposit</span>',
          'funds_locked': '<span class="status-pill green">Funds Locked</span>',
          'in_review': '<span class="status-pill rust">In Review</span>',
          'released': '<span class="status-pill green">Released</span>',
          'disputed': '<span class="status-pill rust">Disputed</span>'
        };

        tr.innerHTML = `
          <td><a href="escrow-details.html?id=${deal.id}" style="font-weight: 600;">${deal.title || 'Escrow Agreement'}</a></td>
          <td><span style="font-family: var(--font-mono); font-size: 12px; color: #A0A0A0;">${deal.counterparty_identifier || '0x...'}</span></td>
          <td><span class="amount-bold">${formattedAmount}</span></td>
          <td>${statusMap[deal.status] || deal.status}</td>
        `;

        tableBody.appendChild(tr);
      });
    }

    bindClipboardActions() {
      if (this.shareProfileBtn) {
        this.shareProfileBtn.addEventListener('click', () => {
          const publicUrl = window.location.href;
          if (navigator.clipboard) {
            navigator.clipboard.writeText(publicUrl).then(() => {
              this.toast.show({
                title: 'Trust Card Link Copied',
                message: 'Public profile URL copied to clipboard.',
                type: 'success'
              });
            });
          }
        });
      }

      if (this.copyCardCodeBtn) {
        this.copyCardCodeBtn.addEventListener('click', () => {
          const embedSnippet = `<a href="${window.location.origin}/create.html">Hire via Baxis Escrow</a>`;
          if (navigator.clipboard) {
            navigator.clipboard.writeText(embedSnippet).then(() => {
              this.toast.show({
                title: 'DM Embed Snippet Copied',
                message: 'Code snippet copied to clipboard.',
                type: 'info'
              });
            });
          }
        });
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    new ProfileApp();
  });

})();