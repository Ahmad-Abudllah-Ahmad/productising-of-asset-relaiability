/**
 * NEXUS OS — Zero-Stall, Buttery-Smooth Word-by-Word Blur-Reveal & Parent Pop-Up Engine
 * - Eliminates nested GPU blur layer exhaustion so blur reveal NEVER gets stuck on scroll.
 * - Combines IntersectionObserver with a passive requestAnimationFrame scroll sweep
 *   so fast scrolling always reveals elements immediately and smoothly.
 * - Locks revealed elements into `.spark-settled` (`filter: none !important`) once complete.
 */
(function () {
  'use strict';

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  var SKIP_TAGS = {
    SCRIPT: 1,
    STYLE: 1,
    SVG: 1,
    IMG: 1,
    VIDEO: 1,
    CANVAS: 1,
    INPUT: 1,
    TEXTAREA: 1,
    SELECT: 1,
    CODE: 1,
    PRE: 1,
    NOSCRIPT: 1
  };

  var SKIP_CLASSES = [
    'w-embed',
    'navlink-hover',
    'navlink_arrow',
    'dropdown-chevron',
    'button-icon-wrapper',
    'button-icon-orange',
    'button-icon-back',
    'layout353_dynamic-heading',
    'layout353_dynamic-desc',
    'layout353_output-quote',
    'layout353_content-left',
    'layout353_nav-step'
  ];

  function shouldSkipElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (SKIP_TAGS[el.tagName]) return true;
    for (var i = 0; i < SKIP_CLASSES.length; i++) {
      if (el.classList.contains(SKIP_CLASSES[i])) return true;
    }
    return false;
  }

  /**
   * Splits text inside `el` into `<span class="spark-word">` elements.
   * For long paragraphs (> 24 words), uses single-element `.spark-blur-reveal`
   * to prevent GPU blur-texture exhaustion during fast scroll.
   */
  function splitTextIntoWords(el, customWordStepMs, forceWordSplit) {
    if (!el || el.dataset.sparkWordsSplit === '1') return;
    if (shouldSkipElement(el)) return;
    if (el.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, table, .spark-word-host')) return;

    var rawText = (el.textContent || '').trim();
    if (!rawText) return;
    var approxWords = rawText.split(/\s+/).length;

    // If paragraph has many words and isn't a heading/dropdown item, use smooth block blur-reveal
    if (!forceWordSplit && approxWords > 22) {
      el.dataset.sparkWordsSplit = '1';
      el.classList.add('spark-blur-reveal');
      return;
    }

    var wordSpans = [];

    function walkNodes(node) {
      if (node.nodeType === 3) {
        var text = node.nodeValue;
        if (!text || !text.trim()) return;
        var parts = text.split(/(\s+)/);
        var frag = document.createDocumentFragment();
        for (var i = 0; i < parts.length; i++) {
          var part = parts[i];
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(part));
          } else {
            var span = document.createElement('span');
            span.className = 'spark-word';
            span.textContent = part;
            wordSpans.push(span);
            frag.appendChild(span);
          }
        }
        if (node.parentNode) {
          node.parentNode.replaceChild(frag, node);
        }
      } else if (node.nodeType === 1 && node.tagName !== 'BR' && !shouldSkipElement(node) && !node.classList.contains('spark-word')) {
        var children = Array.prototype.slice.call(node.childNodes);
        for (var j = 0; j < children.length; j++) {
          walkNodes(children[j]);
        }
      }
    }

    var topChildren = Array.prototype.slice.call(el.childNodes);
    for (var k = 0; k < topChildren.length; k++) {
      walkNodes(topChildren[k]);
    }

    if (wordSpans.length === 0) return;

    el.dataset.sparkWordsSplit = '1';
    el.classList.add('spark-word-host');

    var totalWords = wordSpans.length;
    var stepMs = customWordStepMs || (totalWords <= 10 ? 52 : 36);

    for (var w = 0; w < totalWords; w++) {
      var wordDelay = Math.min(w * stepMs, 640);
      wordSpans[w].style.setProperty('--word-delay', wordDelay + 'ms');
    }

    el.dataset.sparkMaxWordDelay = String(Math.min(totalWords * stepMs, 640));
  }

  function markSettledAfterTransition(el) {
    if (el._sparkSettleTimer) clearTimeout(el._sparkSettleTimer);
    var baseDelay = parseInt(el.dataset.sparkDelay || '0', 10);
    var wordDelay = parseInt(el.dataset.sparkMaxWordDelay || '0', 10);
    var totalWait = 1050 + baseDelay + wordDelay;
    el._sparkSettleTimer = setTimeout(function () {
      if (el.classList.contains('spark-in-view')) {
        el.classList.add('spark-settled');
      }
    }, totalWait);
  }

  function revealElement(el) {
    if (!el.classList.contains('spark-in-view')) {
      el.classList.add('spark-in-view');
      markSettledAfterTransition(el);
    }
  }

  function resetElement(el) {
    if (el._sparkSettleTimer) clearTimeout(el._sparkSettleTimer);
    el.classList.remove('spark-in-view', 'spark-settled');
  }

  function initNavbarDropdowns() {
    var dropdowns = document.querySelectorAll('.w-dropdown');
    if (!dropdowns.length) return;

    dropdowns.forEach(function (dd) {
      var toggle = dd.querySelector('.w-dropdown-toggle');
      var list = dd.querySelector('.w-dropdown-list');
      if (!toggle || !list) return;

      var container = list.querySelector('.navbar_dropdown-container');
      if (container) {
        container.style.opacity = '1';
        container.style.visibility = 'visible';
        container.style.transform = 'none';
      }

      function openDropdown() {
        dropdowns.forEach(function (other) {
          if (other !== dd) {
            other.classList.remove('w--open', 'is-open');
            var oToggle = other.querySelector('.w-dropdown-toggle');
            var oList = other.querySelector('.w-dropdown-list');
            if (oToggle) oToggle.classList.remove('w--open', 'is-open');
            if (oList) oList.classList.remove('w--open', 'is-open');
          }
        });
        dd.classList.add('w--open', 'is-open');
        toggle.classList.add('w--open', 'is-open');
        list.classList.add('w--open', 'is-open');
      }

      function closeDropdown() {
        dd.classList.remove('w--open', 'is-open');
        toggle.classList.remove('w--open', 'is-open');
        list.classList.remove('w--open', 'is-open');
      }

      var leaveTimeout;
      dd.addEventListener('mouseenter', function () {
        if (leaveTimeout) clearTimeout(leaveTimeout);
        openDropdown();
      });

      dd.addEventListener('mouseleave', function () {
        leaveTimeout = setTimeout(function () {
          closeDropdown();
        }, 120);
      });

      toggle.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (dd.classList.contains('w--open') || dd.classList.contains('is-open')) {
          closeDropdown();
        } else {
          openDropdown();
        }
      });
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.w-dropdown')) {
        dropdowns.forEach(function (dd) {
          dd.classList.remove('w--open', 'is-open');
          var toggle = dd.querySelector('.w-dropdown-toggle');
          var list = dd.querySelector('.w-dropdown-list');
          if (toggle) toggle.classList.remove('w--open', 'is-open');
          if (list) list.classList.remove('w--open', 'is-open');
        });
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        dropdowns.forEach(function (dd) {
          dd.classList.remove('w--open', 'is-open');
          var toggle = dd.querySelector('.w-dropdown-toggle');
          var list = dd.querySelector('.w-dropdown-list');
          if (toggle) toggle.classList.remove('w--open', 'is-open');
          if (list) list.classList.remove('w--open', 'is-open');
        });
      }
    });
  }

  function initFaqAccordions() {
    var accordions = document.querySelectorAll('.faq6_accordion');
    if (!accordions.length) return;

    accordions.forEach(function (acc) {
      var question = acc.querySelector('.faq6_question');
      var answer = acc.querySelector('.faq6_answer');
      if (!question || !answer) return;

      // Force initial closed state
      answer.style.height = '0px';
      answer.style.overflow = 'hidden';

      function toggleAccordion(e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }

        var isOpen = acc.classList.contains('is-open');

        // Close other accordions for a clean, focused user experience
        accordions.forEach(function (other) {
          if (other !== acc && other.classList.contains('is-open')) {
            var otherAnswer = other.querySelector('.faq6_answer');
            if (otherAnswer) {
              otherAnswer.style.height = otherAnswer.scrollHeight + 'px';
              otherAnswer.offsetHeight; // force reflow
              otherAnswer.style.height = '0px';
            }
            other.classList.remove('is-open');
          }
        });

        if (isOpen) {
          // Collapse
          answer.style.height = answer.scrollHeight + 'px';
          answer.offsetHeight; // force reflow
          answer.style.height = '0px';
          acc.classList.remove('is-open');
        } else {
          // Expand
          acc.classList.add('is-open');
          answer.style.height = answer.scrollHeight + 'px';

          var onTransitionEnd = function (evt) {
            if (evt.propertyName === 'height' && acc.classList.contains('is-open')) {
              answer.style.height = 'auto';
            }
            answer.removeEventListener('transitionend', onTransitionEnd);
          };
          answer.addEventListener('transitionend', onTransitionEnd);
        }
      }

      // Attach click to the accordion card (ignoring clicks inside the expanded answer)
      acc.addEventListener('click', function (e) {
        if (e.target.closest('.faq6_answer')) return;
        toggleAccordion(e);
      });
    });
  }

  /**
   * Section Layout353 — Transmission Intelligence Suite 8-Module Dynamic Sticky Scroll Synchronization
   * As the user scrolls through the 8 module cards on the right, the sticky side
   * title, strategic purpose, operational quote, and stepper indicator update dynamically.
   */
  function initLayout353ModuleScroll() {
    var section = document.querySelector('.section_layout353');
    if (!section) return;

    var cards = section.querySelectorAll('.layout353_content-item');
    if (!cards.length) return;

    var titleEl = document.getElementById('layout353-dynamic-title');
    var descEl = document.getElementById('layout353-dynamic-desc');
    var kickerEl = document.getElementById('layout353-dynamic-kicker');
    var kickerEl = document.getElementById('layout353-dynamic-kicker');
    var quoteEl = document.getElementById('layout353-dynamic-quote');
    var navItems = section.querySelectorAll('.layout353_nav-step');

    var modulesData = [
      {
        num: '01',
        title: 'Asset Reliability Intelligence',
        quote: '“Tower T-104 has two verified structural findings and requires engineering review.”'
      },
      {
        num: '02',
        title: 'AI Inspection & Quality',
        quote: '“Potential displaced vibration damper detected on 220 kV span. Review image evidence and confirm asset location.”'
      },
      {
        num: '03',
        title: 'Field Operations Optimization',
        quote: '“Five maintenance tasks grouped into one planned inspection-and-repair visit along Corridor North.”'
      },
      {
        num: '04',
        title: 'Energy & Grid Performance',
        quote: '“Show high-priority findings on 220 kV corridor alongside recent thermal loading and trip events.”'
      },
      {
        num: '05',
        title: 'Supply Chain & Inventory',
        quote: '“Replacement hardware requested for three approved repair jobs; warehouse availability confirmed.”'
      },
      {
        num: '06',
        title: 'Risk & Maintenance Forecasting',
        quote: '“Projected 18% increase in conductor vibration damper fatigue across coastal segments next quarter.”'
      },
      {
        num: '07',
        title: 'Financial Intelligence',
        quote: '“Approved maintenance budgets compared against repair backlog; life-extension yields $1.4M in savings.”'
      },
      {
        num: '08',
        title: 'Workforce & Safety',
        quote: '“Repair task verified: work authorization approved, qualified high-voltage crew assigned, permits cleared.”'
      }
    ];

    var currentActiveIndex = -1;

    function updateActiveModule(index) {
      if (index === currentActiveIndex || index < 0 || index >= modulesData.length) return;
      currentActiveIndex = index;
      var data = modulesData[index];

      // Update active card class
      for (var i = 0; i < cards.length; i++) {
        if (i === index) {
          cards[i].classList.add('is-active');
        } else {
          cards[i].classList.remove('is-active');
        }
      }

      // Update active stepper item
      if (navItems.length) {
        for (var j = 0; j < navItems.length; j++) {
          if (j === index) {
            navItems[j].classList.add('is-active');
          } else {
            navItems[j].classList.remove('is-active');
          }
        }
      }

      // Smoothly cross-fade the title transition without size jumping
      if (titleEl) {
        titleEl.style.opacity = '0';
      }
      if (descEl) {
        descEl.style.opacity = '0';
        descEl.style.display = 'none';
      }
      if (kickerEl) {
        kickerEl.style.display = 'none';
      }
      if (quoteEl) {
        quoteEl.style.opacity = '0';
      }

      setTimeout(function () {
        if (titleEl) {
          titleEl.textContent = data.title;
          titleEl.style.opacity = '1';
        }
        if (descEl) {
          descEl.textContent = '';
          descEl.style.display = 'none';
        }
        if (kickerEl) {
          kickerEl.textContent = '';
          kickerEl.style.display = 'none';
        }
        if (quoteEl) {
          quoteEl.textContent = data.quote;
          quoteEl.style.opacity = '1';
        }
      }, 120);
    }

    // Initialize module 0
    updateActiveModule(0);

    // Passive scroll detection
    var ticking = false;
    function handleScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var targetLine = window.innerHeight * 0.42;
        var bestIndex = 0;
        var minDistance = Infinity;

        for (var i = 0; i < cards.length; i++) {
          var rect = cards[i].getBoundingClientRect();
          var cardCenter = rect.top + rect.height * 0.45;
          var dist = Math.abs(cardCenter - targetLine);
          if (dist < minDistance) {
            minDistance = dist;
            bestIndex = i;
          }
        }

        updateActiveModule(bestIndex);
        ticking = false;
      });
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    handleScroll();

    // Click handler on navigation stepper items
    if (navItems.length) {
      navItems.forEach(function (btn, idx) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          var targetCard = cards[idx];
          if (targetCard) {
            var yOffset = -120;
            var y = targetCard.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: y, behavior: 'smooth' });
          }
        });
      });
    }
  }

  function initSparkAnimations() {
    var docEl = document.documentElement;

    // 1. Navbar Dropdowns, FAQ Accordions & Layout353 Dynamic Scroll Sync
    initNavbarDropdowns();
    initFaqAccordions();
    initLayout353ModuleScroll();

    // 2. Headings & Key Titles (Always Word-by-Word Blur Reveal)
    var forceWordSelectors = [
      'h1', 'h2', 'h3', 'h4',
      '.home-hero-heading',
      '.logos-content p',
      '.ar-main-title',
      '.ar-client-pill-name',
      '.ar-env-tab-title',
      '.ar-panel-heading',
      '.ar-kpi-val',
      '.features_heading',
      '.heading-style-h1',
      '.heading-style-h2',
      '.heading-style-h3',
      '.heading-style-h4',
      '.footer-title',
      '.footer-headings'
    ];
    document.querySelectorAll(forceWordSelectors.join(',')).forEach(function (node) {
      if (node.closest('.navbar5_component, .w-dropdown-list, .w-slider-mask')) return;
      splitTextIntoWords(node, 48, true);
    });

    // 3. Subtitles, Descriptions & Card Copy (Word-by-Word for <= 22 words, Smooth Block Blur-Reveal for longer paragraphs)
    var copySelectors = [
      '.home-hero-text',
      '.ar-main-subtitle',
      '.ar-client-pill-tag',
      '.ar-client-pill-scope',
      '.ar-env-code',
      '.ar-env-tab-desc',
      '.ar-panel-desc',
      '.ar-feature-list li',
      '.ar-kpi-label',
      '.ar-kpi-sub',
      '.features_text',
      '.layout353_content-left p',
      '.layout353_content-item p',
      '.layout353_content-item .card-numbers',
      '.layout307_item p',
      '.cards-item p',
      '.bento_card p',
      '.features-card p',
      '.stats_item p',
      '.timeline9_item p',
      '.cta7_content p',
      '.footer_text',
      '.footer6_credit-text'
    ];
    document.querySelectorAll(copySelectors.join(',')).forEach(function (node) {
      if (node.closest('.navbar5_component, .w-dropdown-list, .w-slider-mask')) return;
      splitTextIntoWords(node, 36, false);
    });

    // 4. Buttery Pop-Up Parent Containers (No nested blur filter on parent wrappers so child text never stalls)
    var parentGroups = [
      { selector: '.hero_grid', stagger: 0 },
      { selector: '.section_logos, .home_hero-image, .header26_image-wrapper', stagger: 90 },
      { selector: '.ar-client-pill-card', stagger: 85 },
      { selector: '.ar-env-tab', stagger: 95 },
      { selector: '.ar-content-split', stagger: 0 },
      { selector: '.ar-visual-frame', stagger: 100 },
      { selector: '.ar-kpi-card, .ar-strat-card', stagger: 85 },
      { selector: '.features_grid', stagger: 0 },
      { selector: '.features_image-wrapper', stagger: 95 },
      { selector: '.layout307_item, .cards-item, .bento_card, .bento_card-small:not(.navbar), .features-card, .stats_item, .teams_card, .timeline9_item', stagger: 90 },
      { selector: '.layout353_content-item, .layout353_sticky-inner', stagger: 90 },
      { selector: '.slider-wrapper', stagger: 0 },
      { selector: '.faq6_accordion', stagger: 60 },
      { selector: '.cta7_component', stagger: 0 },
      { selector: '.footer-wrap', stagger: 0 },
      { selector: '.footer-logo', stagger: 90 }
    ];

    parentGroups.forEach(function (group) {
      var nodes = document.querySelectorAll(group.selector);
      var parentCounts = new Map();
      nodes.forEach(function (node) {
        if (node.closest('.navbar5_component, .w-dropdown-list')) return;

        node.classList.add('spark-popup-parent');
        if (group.stagger > 0 && node.parentElement) {
          var idx = parentCounts.get(node.parentElement) || 0;
          parentCounts.set(node.parentElement, idx + 1);
          var delay = Math.min(idx * group.stagger, 360);
          node.style.setProperty('--spark-delay', delay + 'ms');
          node.dataset.sparkDelay = String(delay);
        }
      });
    });

    // 5. Supporting Child Blur-Reveal Elements
    var childGroups = [
      { selector: '.home-hero_content .button-group, .home-hero_content .button-wrapper', delay: 180 },
      { selector: '.ar-subnav', delay: 60 },
      { selector: '.features_content-left .button-group, .features_grid .button-wrapper', delay: 160 },
      { selector: '.layout353_content-item .module-card_title, .layout353_content-item .module-screens_wrap, .layout353_content-item .module-caps_wrap, .layout353_content-item .module-io_box', delay: 100 },
      { selector: '.layout353_output-callout, .layout353_stepper-wrapper', delay: 120 },
      { selector: '.layout353_content-left .button-wrapper, .layout353_content-item .button-wrapper', delay: 140 },
      { selector: '.cta7_content .button-group, .cta7_content .button-wrapper', delay: 160 },
      { selector: '.footer6_top-wrapper > *', stagger: 80, baseDelay: 50 }
    ];

    childGroups.forEach(function (group) {
      var nodes = document.querySelectorAll(group.selector);
      var parentCounts = new Map();
      nodes.forEach(function (node) {
        if (node.closest('.navbar5_component, .w-dropdown-list')) return;
        if (node.classList.contains('spark-popup-parent') || node.classList.contains('spark-word-host')) return;

        node.classList.add('spark-blur-reveal');
        var delay = group.delay || 0;
        if (group.stagger && node.parentElement) {
          var idx = parentCounts.get(node.parentElement) || 0;
          parentCounts.set(node.parentElement, idx + 1);
          delay = (group.baseDelay || 0) + Math.min(idx * group.stagger, 320);
        }
        if (delay > 0) {
          node.style.setProperty('--spark-delay', delay + 'ms');
          node.dataset.sparkDelay = String(delay);
        }
      });
    });

    docEl.classList.add('spark-anim-ready');

    var pageTargets = Array.prototype.slice.call(
      document.querySelectorAll('.spark-popup-parent, .spark-blur-reveal, .spark-word-host')
    ).filter(function (el) {
      return !el.closest('.w-dropdown-list');
    });

    // Reveal elements in hidden tabs immediately so they are never stuck when shown
    document.querySelectorAll('.ar-panel:not(.is-active)').forEach(function (panel) {
      panel.querySelectorAll('.spark-popup-parent, .spark-blur-reveal, .spark-word-host').forEach(revealElement);
    });

    function sweepViewport() {
      var vh = window.innerHeight || document.documentElement.clientHeight;
      for (var i = 0; i < pageTargets.length; i++) {
        var el = pageTargets[i];
        if (el.classList.contains('spark-in-view')) continue;
        var rect = el.getBoundingClientRect();
        // If element is in or above the viewport (plus 60px lookahead below fold), reveal it immediately
        if (rect.height === 0 && rect.width === 0) continue;
        if (rect.top <= vh + 60) {
          revealElement(el);
        }
      }
    }

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting || entry.boundingClientRect.top <= (window.innerHeight + 60)) {
              revealElement(entry.target);
              observer.unobserve(entry.target);
            }
          });
        },
        {
          root: null,
          rootMargin: '0px 0px 60px 0px',
          threshold: 0.01
        }
      );

      pageTargets.forEach(function (el) {
        observer.observe(el);
      });
    }

    // Passive scroll & resize sweep guarantees ZERO stuck elements even on ultra-fast scroll
    var scrollTick = false;
    function onScrollOrResize() {
      if (!scrollTick) {
        scrollTick = true;
        requestAnimationFrame(function () {
          sweepViewport();
          scrollTick = false;
        });
      }
    }

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    requestAnimationFrame(function () {
      sweepViewport();
      setTimeout(sweepViewport, 250);
    });

    // Smoothly animate newly activated console tabs
    var consoleTabs = document.querySelectorAll('.ar-env-tab, .ar-subbtn');
    consoleTabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        requestAnimationFrame(function () {
          var activePanel = document.querySelector('.ar-panel.is-active');
          if (!activePanel) return;
          var innerAnim = activePanel.querySelectorAll('.spark-popup-parent, .spark-blur-reveal, .spark-word-host');
          innerAnim.forEach(function (el) {
            resetElement(el);
            void el.offsetWidth;
            revealElement(el);
          });
        });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSparkAnimations);
  } else {
    initSparkAnimations();
  }
})();
