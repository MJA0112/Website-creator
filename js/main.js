/* ==========================================================================
   Automatisieren-Digital.de — Core JS
   No dependencies. Handles: nav, scroll reveal, cookie consent (GDPR / opt-in),
   consent-gated analytics, form validation + n8n webhook submission, FAQ schema.
   ========================================================================== */
(function () {
  "use strict";

  /* ---- Central config (edit on launch) ----------------------------------
     Endpoints are wired to n8n so the static site needs no backend. */
  window.ADIGITAL = window.ADIGITAL || {};
  var CFG = Object.assign({
    n8nLeadWebhook:    "https://n8n.automatisieren-digital.de/webhook/lead",
    n8nNewsletter:     "https://n8n.automatisieren-digital.de/webhook/newsletter",
    n8nBooking:        "https://n8n.automatisieren-digital.de/webhook/booking",
    gaMeasurementId:   "G-XXXXXXXXXX",
    gtmId:             "GTM-XXXXXXX",
    metaPixelId:       "0000000000",
    linkedinPartnerId: "0000000"
  }, window.ADIGITAL);

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ====================================================================== */
  /* 1. Mobile navigation                                                   */
  /* ====================================================================== */
  function initNav() {
    var nav = $(".nav");
    if (!nav) return;
    var toggle = $(".nav__toggle", nav);
    if (!toggle) return;
    toggle.addEventListener("click", function () {
      var open = nav.getAttribute("data-open") === "true";
      nav.setAttribute("data-open", String(!open));
      toggle.setAttribute("aria-expanded", String(!open));
    });
    $$(".nav__links a", nav).forEach(function (a) {
      a.addEventListener("click", function () { nav.setAttribute("data-open", "false"); });
    });
  }

  /* ====================================================================== */
  /* 2. Scroll reveal (IntersectionObserver, reduced-motion safe)            */
  /* ====================================================================== */
  function initReveal() {
    var els = $$("[data-reveal]");
    if (!els.length) return;
    if (!("IntersectionObserver" in window) ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      els.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ====================================================================== */
  /* 3. Consent management (GDPR / TTDSG — opt-in before any tracking)       */
  /* ====================================================================== */
  var CONSENT_KEY = "adigital_consent_v1";

  function getConsent() {
    try { return JSON.parse(localStorage.getItem(CONSENT_KEY) || "null"); }
    catch (e) { return null; }
  }
  function setConsent(state) {
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(state)); } catch (e) {}
    applyConsent(state);
    pushDataLayer({ event: "consent_update", consent: state });
  }

  function applyConsent(state) {
    // Google Consent Mode v2 signals
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        ad_storage:        state.marketing ? "granted" : "denied",
        ad_user_data:      state.marketing ? "granted" : "denied",
        ad_personalization:state.marketing ? "granted" : "denied",
        analytics_storage: state.analytics ? "granted" : "denied"
      });
    }
    if (state.analytics) loadAnalytics();
    if (state.marketing) loadMarketing();
  }

  var _analyticsLoaded = false, _marketingLoaded = false;
  function loadAnalytics() {
    if (_analyticsLoaded || !CFG.gaMeasurementId || CFG.gaMeasurementId.indexOf("XXXX") > -1) return;
    _analyticsLoaded = true;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + CFG.gaMeasurementId;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", CFG.gaMeasurementId, { anonymize_ip: true });
  }
  function loadMarketing() {
    if (_marketingLoaded) return;
    _marketingLoaded = true;
    // Meta Pixel + LinkedIn Insight Tag are injected here once consent is granted.
    // Stubs left intentionally; populate IDs in CFG before go-live.
  }

  function pushDataLayer(obj) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(obj);
  }
  window.ADIGITAL.track = function (event, params) {
    pushDataLayer(Object.assign({ event: event }, params || {}));
  };

  function initConsent() {
    // Default deny until explicit choice (Consent Mode v2)
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    var existing = getConsent();
    if (!existing) {
      window.gtag("consent", "default", {
        ad_storage: "denied", ad_user_data: "denied",
        ad_personalization: "denied", analytics_storage: "denied",
        wait_for_update: 500
      });
    } else {
      applyConsent(existing);
      return;
    }

    var banner = $("#cookie-banner");
    if (!banner) return;
    setTimeout(function () { banner.classList.add("is-visible"); }, 800);

    function close() { banner.classList.remove("is-visible"); }
    var acceptAll = $("[data-consent='accept']", banner);
    var rejectAll = $("[data-consent='reject']", banner);
    var savePrefs = $("[data-consent='save']", banner);

    if (acceptAll) acceptAll.addEventListener("click", function () {
      setConsent({ necessary: true, analytics: true, marketing: true, ts: Date.now() }); close();
    });
    if (rejectAll) rejectAll.addEventListener("click", function () {
      setConsent({ necessary: true, analytics: false, marketing: false, ts: Date.now() }); close();
    });
    if (savePrefs) savePrefs.addEventListener("click", function () {
      setConsent({
        necessary: true,
        analytics: $("#consent-analytics", banner) ? $("#consent-analytics", banner).checked : false,
        marketing: $("#consent-marketing", banner) ? $("#consent-marketing", banner).checked : false,
        ts: Date.now()
      }); close();
    });
  }
  // Re-open consent settings from footer link
  window.ADIGITAL.openConsent = function () {
    var b = $("#cookie-banner"); if (b) b.classList.add("is-visible");
  };

  /* ====================================================================== */
  /* 4. Forms — validation + submit to n8n (lead, contact, newsletter…)      */
  /* ====================================================================== */
  function endpointFor(form) {
    var type = form.getAttribute("data-form") || "lead";
    if (type === "newsletter") return CFG.n8nNewsletter;
    if (type === "booking")    return CFG.n8nBooking;
    return CFG.n8nLeadWebhook;
  }

  function validateField(field) {
    var input = $("input, select, textarea", field);
    if (!input) return true;
    var ok = input.checkValidity();
    field.classList.toggle("is-invalid", !ok);
    return ok;
  }

  function initForms() {
    $$("form[data-form]").forEach(function (form) {
      var status = $(".form__status", form);
      var fields = $$(".field", form);

      fields.forEach(function (f) {
        var input = $("input, select, textarea", f);
        if (input) input.addEventListener("blur", function () { validateField(f); });
      });

      form.addEventListener("submit", function (e) {
        e.preventDefault();

        // Honeypot spam trap
        var hp = $(".honeypot input", form);
        if (hp && hp.value) return;

        var allOk = fields.map(validateField).every(Boolean);
        if (!allOk) {
          if (status) { status.className = "form__status is-error"; status.textContent = "Bitte prüfen Sie die markierten Felder."; }
          var firstBad = $(".field.is-invalid input, .field.is-invalid select, .field.is-invalid textarea", form);
          if (firstBad) firstBad.focus();
          return;
        }

        var btn = $("button[type='submit'], .btn[type='submit']", form);
        var origLabel = btn ? btn.textContent : "";
        if (btn) { btn.disabled = true; btn.textContent = "Wird gesendet …"; }

        var data = {};
        new FormData(form).forEach(function (v, k) { if (k !== "company_url") data[k] = v; });
        data.page = location.pathname;
        data.form_type = form.getAttribute("data-form");
        data.utm = Object.fromEntries(new URLSearchParams(location.search));
        data.submitted_at = new Date().toISOString();

        fetch(endpointFor(form), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        }).then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          window.ADIGITAL.track("generate_lead", { form_type: data.form_type, value: 1, currency: "EUR" });
          var redirect = form.getAttribute("data-redirect");
          if (redirect) { location.href = redirect; return; }
          if (status) { status.className = "form__status is-success"; status.textContent = "Vielen Dank! Wir melden uns innerhalb von 24 Stunden."; }
          form.reset();
        }).catch(function () {
          if (status) { status.className = "form__status is-error"; status.textContent = "Es ist ein Fehler aufgetreten. Bitte schreiben Sie an info@automatisieren-digital.de."; }
        }).finally(function () {
          if (btn) { btn.disabled = false; btn.textContent = origLabel; }
        });
      });
    });
  }

  /* ====================================================================== */
  /* 5. Blog category filter (progressive enhancement)                       */
  /* ====================================================================== */
  function initBlogFilter() {
    var chips = $$("[data-filter]");
    if (!chips.length) return;
    var cards = $$("[data-cat]");
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        var cat = chip.getAttribute("data-filter");
        chips.forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
        cards.forEach(function (card) {
          var show = cat === "all" || card.getAttribute("data-cat") === cat;
          card.style.display = show ? "" : "none";
        });
      });
    });
  }

  /* ====================================================================== */
  /* 6. Footer year                                                          */
  /* ====================================================================== */
  function initYear() {
    $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
  }

  /* ---- boot ---- */
  document.addEventListener("DOMContentLoaded", function () {
    initNav();
    initReveal();
    initConsent();
    initForms();
    initBlogFilter();
    initYear();
  });
})();
