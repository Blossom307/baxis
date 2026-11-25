/**
 * ============================================================================
 * BAXIS PROTOCOL — CENTRALIZED FRONTEND SECURITY LAYER (`js/security.js`)
 * ============================================================================
 * Updated with Netlify Pretty URL & Extensionless Route Support
 */

(function () {
  'use strict';

  class BaxisSecurity {
    constructor() {
      this.supabase = null;
      this.currentUser = null;
      this.currentProfile = null;
      this.isInitialized = false;
      this.redirectStorageKey = 'baxis_post_login_redirect';

      // Public routes (identifiers without .html or slashes)
      this.publicIdentifiers = [
        '',
        'index',
        'auth',
        'login',
        'signup',
        'about',
        'contact',
        'privacy',
        'terms',
        'security',
        'documentation',
        'docs',
        'brand-assets',
        'brand'
      ];

      this.init();
    }

    getSupabaseClient() {
      if (window.baxisSupabase && window.baxisSupabase.auth) return window.baxisSupabase;
      if (window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;
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

    getCleanPageName() {
      let path = window.location.pathname.toLowerCase().split('?')[0];
      path = path.replace(/\/$/, '');
      const rawPageName = path.substring(path.lastIndexOf('/') + 1);
      return rawPageName.replace('.html', '');
    }

    normalizeUrl(rawUrl) {
      try {
        const u = new URL(rawUrl, window.location.origin);
        const cleanPath = u.pathname.toLowerCase().replace(/\/$/, '').replace('.html', '');
        return `${u.origin}${cleanPath}${u.search}`;
      } catch {
        return rawUrl;
      }
    }

    savePendingRedirect() {
      try {
        const currentUrl = window.location.href;
        if (!currentUrl.startsWith(window.location.origin)) return;

        localStorage.setItem(this.redirectStorageKey, JSON.stringify({
          url: currentUrl,
          expiresAt: Date.now() + 30 * 60 * 1000 // Valid for 30 minutes
        }));
      } catch (e) {
        // Ignore storage restrictions
      }
    }

    getPendingRedirect() {
      try {
        const raw = localStorage.getItem(this.redirectStorageKey);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.url || !parsed.expiresAt || Date.now() > parsed.expiresAt) {
          localStorage.removeItem(this.redirectStorageKey);
          return null;
        }

        if (!parsed.url.startsWith(window.location.origin)) {
          localStorage.removeItem(this.redirectStorageKey);
          return null;
        }

        if (this.normalizeUrl(parsed.url) === this.normalizeUrl(window.location.href)) {
          localStorage.removeItem(this.redirectStorageKey);
          return null;
        }

        return parsed.url;
      } catch (e) {
        localStorage.removeItem(this.redirectStorageKey);
        return null;
      }
    }

    clearPendingRedirect() {
      try {
        localStorage.removeItem(this.redirectStorageKey);
      } catch (e) {
        // Ignore storage restrictions
      }
    }

    /**
     * Determines whether the current window path requires authentication.
     * Robust against Netlify clean URLs (/auth), trailing slashes (/auth/), and .html files (/auth.html)
     */
    isProtectedPage() {
      const cleanPageName = this.getCleanPageName();

      // Allow public Trust Card links ONLY when ?id= is present
      if (cleanPageName === 'profile') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('id') && params.get('id').trim().length > 0) {
          return false;
        }
      }

      const isPublic = this.publicIdentifiers.includes(cleanPageName);
      return !isPublic;
    }

    applyAntiFlash() {
      if (this.isProtectedPage() && document.documentElement) {
        document.documentElement.style.opacity = '0';
        document.documentElement.style.transition = 'opacity 200ms ease';
      }
    }

    revealUI() {
      if (document.documentElement) {
        document.documentElement.style.opacity = '1';
      }
    }

    async init() {
      this.applyAntiFlash();

      try {
        this.supabase = this.getSupabaseClient();

        if (!this.supabase) {
          setTimeout(() => this.init(), 100);
          return;
        }

        // Fetch active auth session
        const { data: { session }, error: sessionError } = await this.supabase.auth.getSession();

        if (sessionError) {
          console.warn('[BaxisSecurity] Session lookup warning:', sessionError.message);
        }

        if (session && session.user) {
          await this.loadUserContext(session.user);

          const isResetMode = window.location.search.includes('mode=reset') ||
                              window.location.hash.includes('type=recovery');

          const cleanPageName = this.getCleanPageName();
          const pendingUrl = !isResetMode ? this.getPendingRedirect() : null;

          // If logged in and arriving on auth/login or dashboard with a saved contract link, jump straight to it
          if (pendingUrl && (cleanPageName === 'auth' || cleanPageName === 'login' || cleanPageName === 'signup' || cleanPageName === 'dashboard')) {
            window.location.replace(pendingUrl);
            return;
          }

          // Clear saved redirect once we've arrived on the target protected page
          if (this.isProtectedPage() && cleanPageName !== 'dashboard') {
            this.clearPendingRedirect();
          }

          // If already logged in and visiting auth/login, redirect to dashboard (UNLESS RESETTING PASSWORD)
          const currentPath = window.location.pathname.toLowerCase();
          if ((currentPath.includes('auth') || currentPath.includes('login')) && !isResetMode) {
            window.location.href = 'dashboard.html';
            return;
          }
        } else if (this.isProtectedPage()) {
          this.redirectToLanding('Authentication required.');
          return;
        }

        this.subscribeToAuthState();

      } catch (err) {
        console.error('[BaxisSecurity] Initialization failed:', err);
        if (this.isProtectedPage()) {
          this.redirectToLanding('Security check failed.');
          return;
        }
      } finally {
        this.isInitialized = true;
        this.revealUI();
        this.dispatchReadyEvent();
      }
    }

    async loadUserContext(user) {
      this.currentUser = user;
      window.currentUser = user;

      try {
        const { data: profile } = await this.supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        this.currentProfile = profile || {
          id: user.id,
          email: user.email,
          created_at: user.created_at
        };

        window.currentProfile = this.currentProfile;

      } catch (err) {
        console.warn('[BaxisSecurity] Profile load error:', err);
        this.currentProfile = { id: user.id, email: user.email };
        window.currentProfile = this.currentProfile;
      }
    }

    subscribeToAuthState() {
      if (!this.supabase || !this.supabase.auth) return;

      this.supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          if (session && session.user) {
            await this.loadUserContext(session.user);
            this.dispatchReadyEvent();

            if (event === 'SIGNED_IN') {
              const isResetMode = window.location.search.includes('mode=reset') ||
                                  window.location.hash.includes('type=recovery');
              const cleanPageName = this.getCleanPageName();

              if (!isResetMode && (cleanPageName === '' || cleanPageName === 'index' || cleanPageName === 'auth' || cleanPageName === 'login' || cleanPageName === 'signup')) {
                const pendingUrl = this.getPendingRedirect();
                if (pendingUrl) {
                  window.location.replace(pendingUrl);
                }
              }
            }
          }
        } else if (event === 'SIGNED_OUT') {
          this.clearContext();
          if (this.isProtectedPage()) {
            this.redirectToLanding('Session expired.');
          }
        }
      });
    }

    clearContext() {
      this.currentUser = null;
      this.currentProfile = null;
      window.currentUser = null;
      window.currentProfile = null;
    }

    redirectToLanding(reason) {
      this.clearContext();
      this.revealUI();

      if (this.isProtectedPage()) {
        if (reason !== 'Session expired.') {
          this.savePendingRedirect();
        }
        console.info(`[BaxisSecurity] Redirecting to index.html (${reason || 'Unauthorized'})`);
        window.location.href = 'index.html';
      }
    }

    dispatchReadyEvent() {
      const event = new CustomEvent('baxis:security:ready', {
        detail: {
          user: this.currentUser,
          profile: this.currentProfile,
          isAuthenticated: !!this.currentUser
        }
      });
      window.dispatchEvent(event);
    }

    async requireAuth() {
      if (!this.isInitialized) {
        await new Promise(resolve => window.addEventListener('baxis:security:ready', resolve, { once: true }));
      }

      if (!this.currentUser) {
        this.redirectToLanding('Authentication required.');
        return false;
      }
      return true;
    }

    getCurrentUser() {
      return this.currentUser || window.currentUser || null;
    }

    getCurrentProfile() {
      return this.currentProfile || window.currentProfile || null;
    }

    isAuthenticated() {
      return !!(this.currentUser || window.currentUser);
    }
  }

  const securityInstance = new BaxisSecurity();
  window.baxisSecurity = securityInstance;

  window.requireAuth = () => securityInstance.requireAuth();
  window.getCurrentUser = () => securityInstance.getCurrentUser();
  window.getCurrentProfile = () => securityInstance.getCurrentProfile();
  window.isAuthenticated = () => securityInstance.isAuthenticated();

})();