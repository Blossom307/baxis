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

    /**
     * Determines whether the current window path requires authentication.
     * Robust against Netlify clean URLs (/auth), trailing slashes (/auth/), and .html files (/auth.html)
     */
    isProtectedPage() {
      // 1. Clean path (remove query params, trailing slashes, and .html)
      let path = window.location.pathname.toLowerCase().split('?')[0];
      path = path.replace(/\/$/, ''); // Remove trailing slash if present

      // 2. Extract page identifier
      const rawPageName = path.substring(path.lastIndexOf('/') + 1);
      const cleanPageName = rawPageName.replace('.html', '');

      // 3. Check against public identifiers
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
          
          // Check if user is in password recovery mode
          const isResetMode = window.location.search.includes('mode=reset') || 
                              window.location.hash.includes('type=recovery');

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