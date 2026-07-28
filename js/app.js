/**
 * BAXIS PROTOCOL — HOMEPAGE ENGINE (`app.js`)
 * Vanilla ES6+ Modular Architecture
 * 
 * Features:
 * - Smooth Section-by-Section Scroll Reveals (`[data-reveal]`)
 * - Floating HUD Navigation & Scroll Shrink
 * - Product-First Hero Escrow State Animator (Matte Monochrome)
 * - Accessible FAQ Accordion & Metric Counters
 */

// 1. Signal to CSS that JavaScript is active
document.documentElement.classList.add('js-enabled');

(function () {
  'use strict';

  /* ==========================================================================
     1. SYSTEM UTILITIES & ACCESSIBILITY HELPER
     ========================================================================== */
  const System = {
    // Detect system reduced motion preference
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,

    // Debounce function for window resize events
    debounce(fn, delay = 150) {
      let timer;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    },

    // Throttle function for passive scroll events
    throttle(fn, limit = 50) {
      let inThrottle;
      return function (...args) {
        if (!inThrottle) {
          fn.apply(this, args);
          inThrottle = true;
          setTimeout(() => (inThrottle = false), limit);
        }
      };
    },

    // Screen reader live region announcer
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
     2. FLOATING HUD NAVIGATION MODULE
     ========================================================================== */
  class HUDNavigation {
    constructor() {
      this.header = document.getElementById('hud-header');
      this.toggleBtn = document.getElementById('hud-toggle');
      this.mobilePanel = document.getElementById('hud-mobile-panel');
      this.navLinks = document.querySelectorAll('.hud-link, .mobile-link');
      this.sections = document.querySelectorAll('section[id]');
      this.isOpen = false;

      this.init();
    }

    init() {
      if (!this.header) return;

      // Passive scroll listener for HUD shrink effect
      window.addEventListener(
        'scroll',
        System.throttle(() => this.handleScroll(), 20),
        { passive: true }
      );

      // Mobile Hamburger Navigation Toggle
      if (this.toggleBtn && this.mobilePanel) {
        this.toggleBtn.addEventListener('click', () => this.toggleMobileMenu());

        // Close menu on click outside
        document.addEventListener('click', (e) => {
          if (
            this.isOpen &&
            !this.header.contains(e.target) &&
            !this.mobilePanel.contains(e.target)
          ) {
            this.closeMobileMenu();
          }
        });

        // Close menu on Escape key
        document.addEventListener('keydown', (e) => {
          if (this.isOpen && e.key === 'Escape') {
            this.closeMobileMenu();
            this.toggleBtn.focus();
          }
        });
      }

      // Smooth Anchor Scroll Handling
      this.bindSmoothScroll();

      // Active Section Tracker
      this.initSectionTracker();
    }

    handleScroll() {
      const scrollY = window.scrollY || window.pageYOffset;
      if (scrollY > 40) {
        this.header.classList.add('hud-shrink');
      } else {
        this.header.classList.remove('hud-shrink');
      }
    }

    toggleMobileMenu() {
      this.isOpen = !this.isOpen;
      this.toggleBtn.setAttribute('aria-expanded', this.isOpen ? 'true' : 'false');
      this.mobilePanel.setAttribute('aria-hidden', this.isOpen ? 'false' : 'true');
      this.mobilePanel.classList.toggle('is-open', this.isOpen);

      document.body.style.overflow = this.isOpen ? 'hidden' : '';
      System.announce(this.isOpen ? 'Mobile navigation opened' : 'Mobile navigation closed');
    }

    closeMobileMenu() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.toggleBtn.setAttribute('aria-expanded', 'false');
      this.mobilePanel.setAttribute('aria-hidden', 'true');
      this.mobilePanel.classList.remove('is-open');
      document.body.style.overflow = '';
    }

    bindSmoothScroll() {
      document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', (e) => {
          const targetId = anchor.getAttribute('href');
          if (targetId === '#') return;

          const targetElement = document.querySelector(targetId);
          if (targetElement) {
            e.preventDefault();
            this.closeMobileMenu();

            const offset = 90; // Header height offset
            const bodyRect = document.body.getBoundingClientRect().top;
            const elementRect = targetElement.getBoundingClientRect().top;
            const targetPosition = elementRect - bodyRect - offset;

            window.scrollTo({
              top: targetPosition,
              behavior: System.prefersReducedMotion ? 'auto' : 'smooth'
            });
          }
        });
      });
    }

    initSectionTracker() {
      const observerOptions = {
        root: null,
        rootMargin: '-20% 0px -60% 0px',
        threshold: 0
      };

      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const activeId = entry.target.getAttribute('id');
            this.updateActiveLink(activeId);
          }
        });
      }, observerOptions);

      this.sections.forEach((section) => observer.observe(section));
    }

    updateActiveLink(activeId) {
      this.navLinks.forEach((link) => {
        const href = link.getAttribute('href');
        if (href === `#${activeId}`) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });
    }
  }

  /* ==========================================================================
     3. SMOOTH SCROLL REVEAL OBSERVER
     ========================================================================== */
  class ScrollObserver {
    constructor() {
      this.elements = document.querySelectorAll('[data-reveal]');
      this.init();
    }

    init() {
      if (!this.elements.length) return;

      if (System.prefersReducedMotion) {
        this.elements.forEach((el) => el.classList.add('revealed'));
        return;
      }

      const observerOptions = {
        root: null,
        rootMargin: '0px 0px -60px 0px',
        threshold: 0.1
      };

      const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            obs.unobserve(entry.target); // Reveal once
          }
        });
      }, observerOptions);

      this.elements.forEach((el) => observer.observe(el));
    }
  }

  /* ==========================================================================
     4. PRODUCT-FIRST ANIMATOR: ESCROW LIFECYCLE SIMULATOR
     ========================================================================== */
  class EscrowWorkflowAnimator {
    constructor() {
      this.cardFrame = document.querySelector('.hero-workflow-card');
      this.stepperItems = document.querySelectorAll('.workflow-stepper .step-item');
      this.stepperLines = document.querySelectorAll('.workflow-stepper .step-line');
      this.statusTag = document.querySelector('.party-status');
      this.actionNote = document.querySelector('.action-note');

      this.currentState = 3; // Start at Step 3 (In Review)
      this.init();
    }

    init() {
      if (!this.cardFrame || System.prefersReducedMotion) return;

      // Cycle escrow state every 5.5 seconds
      setInterval(() => {
        this.cycleNextState();
      }, 5500);
    }

    cycleNextState() {
      this.currentState = (this.currentState % 4) + 1;

      this.cardFrame.style.transition = 'opacity 250ms ease, transform 250ms ease';
      this.cardFrame.style.opacity = '0.9';

      setTimeout(() => {
        this.applyStateUI(this.currentState);
        this.cardFrame.style.opacity = '1';
      }, 250);
    }

    applyStateUI(state) {
      // Update Stepper Points and Connector Lines
      this.stepperItems.forEach((item, idx) => {
        item.classList.remove('completed', 'active');
        const iconSpan = item.querySelector('.step-icon');

        if (idx < state - 1) {
          item.classList.add('completed');
          if (iconSpan) iconSpan.textContent = '✓';
        } else if (idx === state - 1) {
          item.classList.add('active');
          if (iconSpan) iconSpan.textContent = (idx + 1).toString();
        } else {
          if (iconSpan) iconSpan.textContent = (idx + 1).toString();
        }
      });

      this.stepperLines.forEach((line, idx) => {
        line.classList.remove('completed', 'active');
        if (idx < state - 1) {
          line.classList.add('completed');
        } else if (idx === state - 1) {
          line.classList.add('active');
        }
      });

      // Update Copy & Status Tags for each Escrow Stage
      switch (state) {
        case 1: // Agreement Created
          if (this.statusTag) {
            this.statusTag.textContent = 'Awaiting Deposit';
            this.statusTag.className = 'party-status status-text-warning';
          }
          if (this.actionNote) {
            this.actionNote.innerHTML = 'Agreement terms initialized • Waiting for Client deposit';
          }
          break;

        case 2: // Funds Secured in Vault
          if (this.statusTag) {
            this.statusTag.textContent = '✓ $4,500.00 Locked';
            this.statusTag.className = 'party-status status-text-success';
          }
          if (this.actionNote) {
            this.actionNote.innerHTML = 'Funds locked in Vault <code>0x892...B1</code> • Work in progress';
          }
          break;

        case 3: // Work Submitted / In Review
          if (this.statusTag) {
            this.statusTag.textContent = 'Work Submitted';
            this.statusTag.className = 'party-status status-text-warning';
          }
          if (this.actionNote) {
            this.actionNote.innerHTML = 'Deliverable PR #41 submitted • Auto-release in 48h';
          }
          break;

        case 4: // Approved & Released
          if (this.statusTag) {
            this.statusTag.textContent = '✓ Payment Released';
            this.statusTag.className = 'party-status status-text-success';
          }
          if (this.actionNote) {
            this.actionNote.innerHTML = 'Transaction complete • $4,500.00 settled instantly to alex.eth';
          }
          break;
      }
    }
  }

  /* ==========================================================================
     5. ACCESSIBLE FAQ ACCORDION MODULE
     ========================================================================== */
  class FAQAccordion {
    constructor() {
      this.accordion = document.getElementById('faq-accordion');
      this.items = this.accordion ? this.accordion.querySelectorAll('.faq-item') : [];
      this.init();
    }

    init() {
      if (!this.accordion) return;

      this.items.forEach((item) => {
        const trigger = item.querySelector('.faq-trigger');
        const content = item.querySelector('.faq-content');

        if (!trigger || !content) return;

        trigger.addEventListener('click', () => {
          const isOpen = item.classList.contains('is-open');

          // Maintain single-open accordion state
          this.closeAll();

          if (!isOpen) {
            item.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
            content.removeAttribute('hidden');
          }
        });
      });
    }

    closeAll() {
      this.items.forEach((item) => {
        const trigger = item.querySelector('.faq-trigger');
        const content = item.querySelector('.faq-content');

        item.classList.remove('is-open');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        if (content) content.setAttribute('hidden', 'true');
      });
    }
  }

  /* ==========================================================================
     6. NUMBER COUNTER ANIMATOR
     ========================================================================== */
  class NumberCounters {
    constructor() {
      this.metrics = document.querySelectorAll('.hero-metrics-strip .metric-num');
      this.init();
    }

    init() {
      if (!this.metrics.length || System.prefersReducedMotion) return;

      const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.animateValue(entry.target);
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.5 });

      this.metrics.forEach((metric) => observer.observe(metric));
    }

    animateValue(element) {
      const text = element.textContent.trim();
      if (text.includes('100%')) {
        let start = 0;
        const duration = 1000;
        const stepTime = 16;
        const steps = duration / stepTime;
        const increment = 100 / steps;

        const timer = setInterval(() => {
          start += increment;
          if (start >= 100) {
            element.textContent = '100%';
            clearInterval(timer);
          } else {
            element.textContent = `${Math.floor(start)}%`;
          }
        }, stepTime);
      }
    }
  }

  /* ==========================================================================
     7. APPLICATION INITIALIZATION
     ========================================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    new HUDNavigation();
    new ScrollObserver();
    new EscrowWorkflowAnimator();
    new FAQAccordion();
    new NumberCounters();

    // Trigger initial scroll event to calculate positions
    window.dispatchEvent(new Event('scroll'));
  });

})();