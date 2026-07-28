/**
 * BAXIS PROTOCOL — PROFILE & REPUTATION ENGINE (`profile.js`)
 * Handles Bio Summaries, Profile Edits, Avatar Uploads & Realtime Updates
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
      await this.loadUserProfile();
      await this.checkConnectedWallet();
      this.bindAvatarUpload();
      this.bindProfileSave();
      this.bindClipboardActions();
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

        const activeProfile = profile || {
          id: this.currentUserId,
          email: this.userEmail,
          display_name: this.userEmail ? this.userEmail.split('@')[0] : 'User Account',
          bio: 'Digital Contract Member on Baxis Protocol.'
        };

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
      const initials = displayName.substring(0, 2).toUpperCase();

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

      // Avatars
      const avatarBox = document.getElementById('profile-avatar-box');
      const cardAvatarBox = document.getElementById('card-avatar-box');

      if (profile.avatar_url) {
        if (avatarBox) {
          avatarBox.style.backgroundImage = `url('${profile.avatar_url}')`;
          avatarBox.style.backgroundSize = 'cover';
          avatarBox.style.backgroundPosition = 'center';
          avatarBox.textContent = '';
        }
        if (cardAvatarBox) {
          cardAvatarBox.style.backgroundImage = `url('${profile.avatar_url}')`;
          cardAvatarBox.style.backgroundSize = 'cover';
          cardAvatarBox.style.backgroundPosition = 'center';
          cardAvatarBox.textContent = '';
        }
      } else {
        if (avatarBox) avatarBox.textContent = initials;
        if (cardAvatarBox) cardAvatarBox.textContent = initials;
      }

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

    /* ==========================================================================
       AVATAR PHOTO UPLOAD (INSTANT OPTIMISTIC PREVIEW + CANVAS COMPRESSION)
       ========================================================================== */
    async compressAvatarImage(file, maxDimension = 400, quality = 0.82) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target.result;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > maxDimension) {
                height = Math.round((height * maxDimension) / width);
                width = maxDimension;
              }
            } else {
              if (height > maxDimension) {
                width = Math.round((width * maxDimension) / height);
                height = maxDimension;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
              resolve(new File([blob], `avatar_${Date.now()}.webp`, {
                type: 'image/webp',
                lastModified: Date.now()
              }));
            }, 'image/webp', quality);
          };
        };
      });
    }

    updateAvatarUI(imageUrl) {
      const avatarBox = document.getElementById('profile-avatar-box');
      const cardAvatarBox = document.getElementById('card-avatar-box');
      if (avatarBox) {
        avatarBox.style.backgroundImage = `url('${imageUrl}')`;
        avatarBox.style.backgroundSize = 'cover';
        avatarBox.style.backgroundPosition = 'center';
        avatarBox.textContent = '';
      }
      if (cardAvatarBox) {
        cardAvatarBox.style.backgroundImage = `url('${imageUrl}')`;
        cardAvatarBox.style.backgroundSize = 'cover';
        cardAvatarBox.style.backgroundPosition = 'center';
        cardAvatarBox.textContent = '';
      }
    }

    bindAvatarUpload() {
      if (!this.avatarInput) return;

      this.avatarInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file || !this.currentUserId) return;

        // Instant optimistic preview
        const localPreviewUrl = URL.createObjectURL(file);
        this.updateAvatarUI(localPreviewUrl);

        this.toast.show({
          title: 'Saving Avatar...',
          message: 'Compressing and uploading image to vault...',
          type: 'info'
        });

        try {
          const supabase = this.getSupabase();
          if (!supabase) return;

          const compressedFile = await this.compressAvatarImage(file, 400, 0.82);
          const filePath = `avatars/${this.currentUserId}_${Date.now()}.webp`;

          const { error: uploadError } = await supabase.storage
            .from('dispute-evidence')
            .upload(filePath, compressedFile, { cacheControl: '3600', upsert: true });

          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage
            .from('dispute-evidence')
            .getPublicUrl(filePath);

          const publicAvatarUrl = urlData.publicUrl;

          await supabase
            .from('profiles')
            .upsert({
              id: this.currentUserId,
              avatar_url: publicAvatarUrl,
              updated_at: new Date().toISOString()
            }, { onConflict: 'id' });

          this.toast.show({
            title: 'Avatar Updated!',
            message: 'Your profile picture has been saved.',
            type: 'success'
          });

        } catch (err) {
          console.error('Avatar upload failed:', err);
          this.toast.show({
            title: 'Upload Failed',
            message: err.message || 'Could not upload image.',
            type: 'rust'
          });
        }
      });
    }

    /* ==========================================================================
       SAVE PROFILE SETTINGS FORM (INCLUDES BIO SUMMARY)
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
          // Pass email along with display_name, job_title, and bio
          const { error } = await supabase
            .from('profiles')
            .upsert({
              id: this.currentUserId,
              email: this.userEmail, // <--- INCLUDES EMAIL TO SATISFY DATABASE
              display_name: displayName,
              job_title: jobTitle,
              bio: bio,
              ens_name: ensName,
              twitter_handle: twitter,
              discord_handle: discord,
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
            discord_handle: discord
          };

          this.renderProfileUI(updatedProfile);

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