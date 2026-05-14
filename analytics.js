(function () {
  const POSTHOG_API_KEY = 'phc_qH8QkgpsTkRxK4mwizSW3tBKsbrxhRTxwUyVoZynE8jk';
  const POSTHOG_HOST = 'https://eu.i.posthog.com';

  const mode = document.body.dataset.wopaMode || 'unknown';

  function loadPostHog(projectKey, options) {
    (function (t, e) {
      var o, n, p, r;
      e.__SV || (window.posthog = e, e._i = [], e.init = function (i, s, a) {
        function g(t, e) {
          var o = e.split('.');
          if (o.length === 2) {
            t = t[o[0]];
            e = o[1];
          }
          t[e] = function () {
            t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
          };
        }
        p = t.createElement('script');
        p.type = 'text/javascript';
        p.crossOrigin = 'anonymous';
        p.async = true;
        p.src = s.api_host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js';
        r = t.getElementsByTagName('script')[0];
        r.parentNode.insertBefore(p, r);
        var u = e;
        if (a !== undefined) {
          u = e[a] = [];
        } else {
          a = 'posthog';
        }
        u.people = u.people || [];
        u.toString = function (t) {
          var e = 'posthog';
          if (a !== 'posthog') e += '.' + a;
          if (!t) e += ' (stub)';
          return e;
        };
        u.people.toString = function () {
          return u.toString(1) + '.people (stub)';
        };
        o = 'init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug'.split(' ');
        for (n = 0; n < o.length; n++) g(u, o[n]);
        e._i.push([i, s, a]);
      }, e.__SV = 1);
    })(document, window.posthog || []);

    window.posthog.init(projectKey, options);
  }

  function baseProperties(extra) {
    return Object.assign({
      mode,
      page_title: document.title,
      path: window.location.pathname,
      hash: window.location.hash || '',
      referrer: document.referrer || ''
    }, extra || {});
  }

  function capture(eventName, properties) {
    if (!window.posthog || typeof window.posthog.capture !== 'function') return;
    window.posthog.capture(eventName, baseProperties(properties));
  }

  function getLinkLocation(link) {
    if (link.closest('nav')) return 'nav';
    if (link.closest('.hero-actions')) return 'hero';
    if (link.closest('.cta-actions')) return 'final_cta';
    if (link.closest('.footer-links')) return 'footer';
    if (link.closest('.mode-switch')) return 'mode_switch';
    return 'page';
  }

  function getLinkType(link, url) {
    if (link.closest('.mode-switch')) return 'mode_switch';
    if (link.classList.contains('btn-primary') || link.classList.contains('btn-outline') || link.classList.contains('btn-ghost') || link.classList.contains('nav-cta')) return 'cta';
    if (url && url.origin !== window.location.origin) return 'outbound';
    if (link.hash) return 'anchor';
    return 'link';
  }

  function trackLinks() {
    document.querySelectorAll('a[href]').forEach((link) => {
      link.addEventListener('click', () => {
        const rawHref = link.getAttribute('href') || '';
        const url = rawHref && rawHref !== '#' ? new URL(rawHref, window.location.href) : null;
        const location = getLinkLocation(link);
        const linkType = getLinkType(link, url);
        const properties = {
          label: link.textContent.trim().replace(/\s+/g, ' '),
          href: rawHref,
          destination_host: url ? url.hostname : '',
          destination_path: url ? url.pathname : '',
          location,
          link_type: linkType
        };

        capture('wopa_link_clicked', properties);

        if (linkType === 'cta') {
          capture('wopa_cta_clicked', properties);
        }

        if (linkType === 'mode_switch') {
          capture('wopa_mode_switched', Object.assign({}, properties, {
            target_mode: properties.label.toLowerCase()
          }));
        }

        if (url && url.origin !== window.location.origin) {
          capture('wopa_outbound_link_clicked', properties);
        }
      });
    });
  }

  function trackSectionViews() {
    if (!('IntersectionObserver' in window)) return;

    const seenSections = new Set();
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const sectionName = entry.target.id || entry.target.dataset.analyticsSection;
        if (!sectionName || seenSections.has(sectionName)) return;
        seenSections.add(sectionName);
        capture('wopa_section_viewed', {
          section: sectionName,
          visible_ratio: Number(entry.intersectionRatio.toFixed(2))
        });
        sectionObserver.unobserve(entry.target);
      });
    }, {
      threshold: 0.35
    });

    document.querySelectorAll('section[id], .cta-section').forEach((section) => {
      if (section.classList.contains('cta-section')) {
        section.dataset.analyticsSection = 'final_cta';
      }
      sectionObserver.observe(section);
    });
  }

  function trackScrollDepth() {
    const milestones = [25, 50, 75, 100];
    const reached = new Set();

    function checkDepth() {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const depth = Math.min(100, Math.round((window.scrollY / scrollable) * 100));

      milestones.forEach((milestone) => {
        if (depth >= milestone && !reached.has(milestone)) {
          reached.add(milestone);
          capture('wopa_scroll_depth_reached', {
            depth_percent: milestone
          });
        }
      });

      if (reached.size === milestones.length) {
        window.removeEventListener('scroll', checkDepth);
      }
    }

    window.addEventListener('scroll', checkDepth, { passive: true });
    checkDepth();
  }

  loadPostHog(POSTHOG_API_KEY, {
    api_host: POSTHOG_HOST,
    defaults: '2026-01-30',
    capture_pageview: true
  });

  capture('wopa_page_viewed', {
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight
  });

  trackLinks();
  trackSectionViews();
  trackScrollDepth();
})();
