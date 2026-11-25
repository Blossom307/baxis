/**
 * BAXIS PROTOCOL — PROFILE & REPUTATION ENGINE (`profile.js`)
 * Public Trust Cards, Dynamic Ownership Detection & Verified Escrow Ledger
 */

document.documentElement.classList.add('js-enabled');

(function () {
  'use strict';

  const System = {
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
     3. PROFILE & REPUTATION ENGINE
     ========================================================================== */
  class ProfileApp {
    constructor() {
      this.toast = new ToastManager();
      this.sidebar = new SidebarManager();

      this.shareProfileBtn = document.getElementById('btn-share-profile');
      this.avatarInput = document.getElementById('avatar-file-input');
      this.editForm = document.getElementById('form-edit-profile');
      this.heroEditBtn = document.getElementById('btn-edit-profile-hero');
      this.editCard = document.getElementById('profile-edit-card');

      this.targetProfileId = null;
      this.currentLoggedInId = null;
      this.isOwner = false;
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
      const canContinue = await this.resolveTargetUser();
      if (!canContinue) return;

      this.configurePermissionsUI();
      this.bindEditToggle();
      await this.loadTargetProfile();
      await this.checkConnectedWallet();
      this.bindAvatarUpload();
      this.bindProfileSave();
      this.bindClipboardActions();
    }

    /**
     * Determines whether we are loading the user's own profile OR a shared public profile
     */
    async resolveTargetUser() {
      const supabase = this.getSupabase();

      // 1. Check for ?id= in URL
      const urlParams = new URLSearchParams(window.location.search);
      const urlUserId = urlParams.get('id')?.trim() || '';

      // 2. Check for active login session
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        const session = data?.session;
        if (session && session.user) {
          this.currentLoggedInId = session.user.id;
          this.userEmail = session.user.email || '';
        }
      }

      if (urlUserId) {
        // Someone clicked a shared link (e.g. profile.html?id=...)
        this.targetProfileId = urlUserId;
        this.isOwner = (this.currentLoggedInId === urlUserId);
        return true;
      } else if (this.currentLoggedInId) {
        // Logged-in user viewing their own default profile
        this.targetProfileId = this.currentLoggedInId;
        this.isOwner = true;
        return true;
      } else {
        // Not logged in and no user ID was provided in URL -> Redirect to home/login
        window.location.href = 'index.html';
        return false;
      }
    }

    /**
     * Hides edit controls if viewing someone else's public Trust Card
     */
    configurePermissionsUI() {
      if (!this.isOwner) {
        if (this.heroEditBtn) this.heroEditBtn.style.display = 'none';
        if (this.editCard) this.editCard.style.display = 'none';

        if (this.avatarInput) {
          this.avatarInput.disabled = true;
        }
        const avatarLabel = document.querySelector('label[for="avatar-file-input"]');
        if (avatarLabel) avatarLabel.style.display = 'none';

        const addrEl = document.getElementById('profile-address-code');
        if (addrEl) addrEl.textContent = 'Baxis Protocol • Public Trust Card';

        const walletCard = document.getElementById('display-wallet-address')?.closest('.profile-card');
        if (walletCard) walletCard.style.display = 'none';
      }

      if (!this.currentLoggedInId) {
        const sidebarNav = document.querySelector('.sidebar-nav');
        if (sidebarNav) {
          sidebarNav.innerHTML = `
            <span class="sidebar-section-title">Baxis Protocol</span>
            <ul class="nav-list">
              <li class="nav-item">
                <a href="index.html" class="nav-link">
                  <span class="nav-label">Sign In / Get Started</span>
                </a>
              </li>
            </ul>
          `;
        }

        const sidebarFooter = document.querySelector('.sidebar-user-footer');
        if (sidebarFooter) sidebarFooter.style.display = 'none';

        const mobileHud = document.querySelector('.mobile-bottom-hud');
        if (mobileHud) mobileHud.style.display = 'none';
      }
    }

    bindEditToggle() {
      if (!this.heroEditBtn || !this.editCard || !this.isOwner) return;

      this.heroEditBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const isHidden = this.editCard.hasAttribute('hidden') || this.editCard.style.display === 'none';

        if (isHidden) {
          this.editCard.removeAttribute('hidden');
          this.editCard.style.display = 'block';
          this.editCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          this.editCard.setAttribute('hidden', 'true');
          this.editCard.style.display = 'none';
        }
      });
    }

    async checkConnectedWallet() {
      if (window.ethereum && this.isOwner) {
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
          console.warn('Wallet check error:', err);
        }
      }
    }

    async loadTargetProfile() {
      const supabase = this.getSupabase();
      if (!supabase || !this.targetProfileId) return;

      try {
        // Query target profile by ID (Works for public guests without login!)
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', this.targetProfileId)
          .maybeSingle();

        // Cached avatar fallback if owner
        const cachedAvatar = this.isOwner ? localStorage.getItem(`baxis_avatar_${this.targetProfileId}`) : null;
        this.currentAvatarUrl = profile?.avatar_url || cachedAvatar || null;

        const activeProfile = profile || {
          id: this.targetProfileId,
          email: '',
          display_name: 'Member Account',
          job_title: 'Digital Contract Member',
          bio: 'Digital Contract Member on Baxis Protocol.',
          avatar_url: this.currentAvatarUrl
        };

        this.renderProfileUI(activeProfile);

        if (this.isOwner) {
          this.populateEditForm(activeProfile);
        }

        // Fetch verified escrow history for this user
        const { data: escrows } = await supabase
          .from('escrows')
          .select('*')
          .or(`client_id.eq.${this.targetProfileId},freelancer_id.eq.${this.targetProfileId},creator_id.eq.${this.targetProfileId}`);

        if (escrows) {
          this.renderStatsAndHistory(escrows);
        }

      } catch (err) {
        console.error('Failed to load profile:', err);
      }
    }

    renderProfileUI(profile) {
      const displayName = profile.display_name || 'Member Account';
      const initials = System.getInitials(displayName);

      // Name & Job
      const nameEl = document.getElementById('profile-display-name');
      if (nameEl) nameEl.textContent = displayName;

      const cardNameEl = document.getElementById('card-display-name');
      if (cardNameEl) cardNameEl.textContent = displayName;

      const jobEl = document.getElementById('profile-job-title');
      if (jobEl) jobEl.textContent = profile.job_title || 'Digital Contract Member';

      // Bio
      const bioEl = document.getElementById('profile-bio-display');
      if (bioEl) bioEl.textContent = profile.bio || 'Digital Contract Member on Baxis Protocol.';

      // Sidebar (if logged in)
      if (this.isOwner) {
        const sbNameEl = document.getElementById('sidebar-user-name');
        if (sbNameEl) sbNameEl.textContent = displayName;

        const sbAvatarEl = document.getElementById('sidebar-user-avatar');
        if (sbAvatarEl) sbAvatarEl.textContent = initials;
      }

      // Avatars
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
        cardSub.textContent = `${profile.twitter_handle || profile.ens_name || '@member'} • Baxis Verified`;
      }
    }

    populateEditForm(profile) {
      if (profile.display_name && document.getElementById('edit-display-name')) {
        document.getElementById('edit-display-name').value = profile.display_name;
      }
      if (profile.job_title && document.getElementById('edit-job-title')) {
        document.getElementById('edit-job-title').value = profile.job_title;
      }
      if (profile.bio && document.getElementById('edit-bio')) {
        document.getElementById('edit-bio').value = profile.bio;
      }
      if (profile.ens_name && document.getElementById('edit-ens-name')) {
        document.getElementById('edit-ens-name').value = profile.ens_name;
      }
      if (profile.twitter_handle && document.getElementById('edit-twitter')) {
        document.getElementById('edit-twitter').value = profile.twitter_handle;
      }
      if (profile.discord_handle && document.getElementById('edit-discord')) {
        document.getElementById('edit-discord').value = profile.discord_handle;
      }
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

    bindAvatarUpload() {
      if (!this.avatarInput || !this.isOwner) return;

      this.avatarInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !this.currentLoggedInId) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64DataUrl = event.target.result;

          this.currentAvatarUrl = base64DataUrl;
          localStorage.setItem(`baxis_avatar_${this.currentLoggedInId}`, base64DataUrl);
          this.updateAvatarUI(base64DataUrl, 'BX');

          this.toast.show({
            title: 'Avatar Updated',
            message: 'Your profile image has been saved.',
            type: 'success'
          });

          try {
            const supabase = this.getSupabase();
            if (supabase) {
              await supabase.from('profiles').upsert({
                id: this.currentLoggedInId,
                avatar_url: base64DataUrl,
                updated_at: new Date().toISOString()
              }, { onConflict: 'id' });
            }
          } catch (err) {
            console.warn('Avatar save error:', err);
          }
        };

        reader.readAsDataURL(file);
      });
    }

    bindProfileSave() {
      if (!this.editForm || !this.isOwner) return;

      this.editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const supabase = this.getSupabase();
        if (!supabase || !this.currentLoggedInId) return;

        const displayName = document.getElementById('edit-display-name')?.value.trim() || '';
        const jobTitle = document.getElementById('edit-job-title')?.value.trim() || '';
        const bio = document.getElementById('edit-bio')?.value.trim() || '';
        const ensName = document.getElementById('edit-ens-name')?.value.trim() || '';
        const twitter = document.getElementById('edit-twitter')?.value.trim() || '';
        const discord = document.getElementById('edit-discord')?.value.trim() || '';

        const saveBtn = document.getElementById('btn-save-profile');
        if (saveBtn) {
          saveBtn.disabled = true;
          const span = saveBtn.querySelector('span') || saveBtn;
          span.textContent = 'Saving Changes...';
        }

        try {
          const activeAvatar = this.currentAvatarUrl || localStorage.getItem(`baxis_avatar_${this.currentLoggedInId}`);

          const { error } = await supabase
            .from('profiles')
            .upsert({
              id: this.currentLoggedInId,
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
            id: this.currentLoggedInId,
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

          if (this.editCard) {
            this.editCard.setAttribute('hidden', 'true');
            this.editCard.style.display = 'none';
          }

          this.toast.show({
            title: 'Profile Updated',
            message: 'Your profile changes are live.',
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

      const trustBadgeEl = document.getElementById('profile-trust-badge');
      if (trustBadgeEl) {
        if (completedCount === 0) {
          trustBadgeEl.textContent = 'Verified Member';
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
              No completed escrow transactions recorded yet.
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

        const titleCell = this.isOwner
          ? `<a href="escrow-details.html?id=${deal.id}" style="font-weight: 600;">${deal.title || 'Escrow Agreement'}</a>`
          : `<span style="font-weight: 600;">${deal.title || 'Escrow Agreement'}</span>`;

        tr.innerHTML = `
          <td>${titleCell}</td>
          <td><span style="font-family: var(--font-mono); font-size: 12px; color: #A0A0A0;">${deal.counterparty_identifier || '0x...'}</span></td>
          <td><span class="amount-bold">${formattedAmount}</span></td>
          <td>${statusMap[deal.status] || deal.status}</td>
        `;

        tableBody.appendChild(tr);
      });
    }

    bindClipboardActions() {
      if (!this.shareProfileBtn) return;

      this.shareProfileBtn.addEventListener('click', () => {
        if (!this.targetProfileId) return;

        const publicUrl = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(this.targetProfileId)}`;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(publicUrl).then(() => {
            this.toast.show({
              title: 'Trust Card Link Copied!',
              message: 'Permanent public link copied to clipboard.',
              type: 'success'
            });
          }).catch(() => {
            this.toast.show({
              title: 'Copy Failed',
              message: 'Please copy the URL from your browser address bar.',
              type: 'rust'
            });
          });
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    new ProfileApp();
  });
})();