/**
 * ============================================================================
 * BAXIS PROTOCOL — CENTRALIZED FRONTEND SECURITY LAYER (`js/security.js`)
 * ============================================================================
 * 
 * Responsibilities:
 * 1. Session Validation & Route Protection (Redirects unauthenticated users to index.html)
 * 2. Anti-UI-Flashing (Prevents protected pages from rendering before auth resolves)
 * 3. User & Profile Context Management (Exposes window.currentUser & window.currentProfile)
 * 4. Real-Time Auth State Subscriptions (Handles token refreshes & logouts instantly)
 * 5. Reusable Security Helpers (requireAuth, getCurrentUser, getCurrentProfile, isAuthenticated)
 * 
 * Security Philosophy:
 * Frontend JavaScript security provides user navigation protection and smooth UX.
 * Real data authorization is strictly enforced by PostgreSQL Row Level Security (RLS)
 * and Solidity smart contract permissions.
 * ============================================================================
 */

(function () {
  'use strict';

  class BaxisSecurity {
    constructor() {
      this.supabase = null;
      this.currentUser = null;
      this.currentProfile = null;
      this.isInitialized = false;

      // Define public vs protected page routes
      this.publicPages = [
        '/',
        '/index.html',
        '/auth.html',
        '/login.html',
        '/signup.html',
        '/about.html',
        '/contact.html',
        '/privacy.html',
        '/terms.html',
        '/security.html',
        '/documentation.html',
        '/docs.html',
        '/brand-assets.html',
        '/brand.html'
      ];

      // Initialize immediately on script load
      this.init();
    }

    /**
     * Safely retrieves the active Supabase client instance from global memory
     */
    getSupabaseClient() {
      if (window.baxisSupabase && window.baxisSupabase.auth) return window.baxisSupabase;
      if (window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;
      if (window.supabase && window.supabase.auth) return window.supabase;

      // Fallback: Initialize from global Supabase JS SDK if not attached yet
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
     * Determines whether the current window path requires an authenticated session
     */
    isProtectedPage() {
      const path = window.location.pathname.toLowerCase();
      const pageName = path.substring(path.lastIndexOf('/') + 1) || 'index.html';

      // Check if pageName matches any item in the public routes list
      const isPublic = this.publicPages.some(publicRoute => {
        const cleanRoute = publicRoute.replace('/', '').toLowerCase();
        return pageName === cleanRoute || (pageName === '' && cleanRoute === 'index.html');
      });

      return !isPublic;
    }

    /**
     * Prevents protected pages from flashing sensitive UI before auth validation resolves
     */
    applyAntiFlash() {
      if (this.isProtectedPage() && document.documentElement) {
        document.documentElement.style.opacity = '0';
        document.documentElement.style.transition = 'opacity 200ms ease';
      }
    }

    /**
     * Smoothly reveals the document after security checks pass
     */
    revealUI() {
      if (document.documentElement) {
        document.documentElement.style.opacity = '1';
      }
    }

    /**
     * Main Security Layer Initialization
     */
    async init() {
      this.applyAntiFlash();

      try {
        this.supabase = this.getSupabaseClient();

        if (!this.supabase) {
          // If Supabase SDK isn't ready, retry in 100ms
          setTimeout(() => this.init(), 100);
          return;
        }

        // 1. Fetch current authenticated session
        const { data: { session }, error: sessionError } = await this.supabase.auth.getSession();

        if (sessionError) {
          console.warn('[BaxisSecurity] Session lookup warning:', sessionError.message);
        }

        // 2. Route Protection & User Context Population
        if (session && session.user) {
          await this.loadUserContext(session.user);
        } else if (this.isProtectedPage()) {
          this.redirectToLanding('Authentication required.');
          return;
        }

        // 3. Listen for real-time auth events (Sign in, Sign out, Token Refresh)
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

    /**
     * Loads user authentication and profile data into global state
     */
    async loadUserContext(user) {
      this.currentUser = user;
      window.currentUser = user;

      try {
        // Fetch profile record from Supabase 'profiles' table
        const { data: profile, error } = await this.supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          console.warn('[BaxisSecurity] Profile fetch error:', error.message);
        }

        // Set global single source of truth for user profile
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

    /**
     * Listens for Supabase authentication state changes
     */
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

    /**
     * Clears cached user variables from memory
     */
    clearContext() {
      this.currentUser = null;
      this.currentProfile = null;
      window.currentUser = null;
      window.currentProfile = null;
    }

    /**
     * Safely redirects unauthenticated users to the landing page
     */
    redirectToLanding(reason) {
      this.clearContext();
      this.revealUI();

      const currentPath = window.location.pathname.toLowerCase();
      if (currentPath !== '/index.html' && currentPath !== '/') {
        console.info(`[BaxisSecurity] Redirecting to index.html (${reason || 'Unauthorized'})`);
        window.location.href = 'index.html';
      }
    }

    /**
     * Dispatches custom DOM event when security initialization completes
     */
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

    // =========================================================================
    // REUSABLE PUBLIC SECURITY HELPERS
    // =========================================================================

    /**
     * Ensures user is authenticated before executing a protected function/action
     */
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

    /**
     * Get the authenticated user object
     */
    getCurrentUser() {
      return this.currentUser || window.currentUser || null;
    }

    /**
     * Get the current user's profile object
     */
    getCurrentProfile() {
      return this.currentProfile || window.currentProfile || null;
    }

    /**
     * Check if an active session is loaded
     */
    isAuthenticated() {
      return !!(this.currentUser || window.currentUser);
    }
  }

  // 1. Instantiate Security Manager Singleton
  const securityInstance = new BaxisSecurity();
  window.baxisSecurity = securityInstance;

  // 2. Expose Reusable Helper Functions Globally for Easy Access
  window.requireAuth = () => securityInstance.requireAuth();
  window.getCurrentUser = () => securityInstance.getCurrentUser();
  window.getCurrentProfile = () => securityInstance.getCurrentProfile();
  window.isAuthenticated = () => securityInstance.isAuthenticated();

})();