/* ANC /live — "A night ignites": scroll-scrubbed 3D globe + legible content acts. */
(function () {
  'use strict';
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
  var $ = function (id) { return document.getElementById(id); };

  var MAP = window.__ANC_MAP__ || [];
  var TON = window.__ANC_TONIGHT__ || { events: 0, states: 0, venues: 0 };
  var EX = window.__ANC_EXTRA__ || { monthly: [], markets: [], slate: [] };

  /* ---- clock ---- */
  function tick() {
    var d = new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' });
    var el = $('clock'); if (el) el.textContent = d;
  }
  tick(); setInterval(tick, 1000);

  /* ---- count-up + reveals ---- */
  function countUp(el) {
    var target = parseInt((el.getAttribute('data-count') || '0').replace(/[^0-9]/g, ''), 10) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    var dur = 1400, start = performance.now();
    function step(now) {
      var p = Math.min(1, (now - start) / dur), e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = Math.round(target * e).toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      en.target.querySelectorAll && en.target.querySelectorAll('[data-count]').forEach(countUp);
      if (en.target.hasAttribute && en.target.hasAttribute('data-count')) countUp(en.target);
      io.unobserve(en.target);
    });
  }, { threshold: 0.18, rootMargin: '-6% 0px' });
  document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });

  /* ---- bars (monthly) ---- */
  (function () {
    var wrap = $('bars'); if (!wrap || !EX.monthly.length) return;
    var max = Math.max.apply(null, EX.monthly.map(function (m) { return m.events; }).concat([1]));
    EX.monthly.forEach(function (m) {
      var col = document.createElement('div'); col.className = 'b';
      var bar = document.createElement('div'); bar.className = 'bar' + (m.events === max ? ' peak' : '');
      bar.setAttribute('data-h', Math.max(3, Math.round(m.events / max * 100)));
      var lab = document.createElement('div'); lab.className = 'bl'; lab.textContent = m.mon;
      col.appendChild(bar); col.appendChild(lab); wrap.appendChild(col);
    });
    var bio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        wrap.querySelectorAll('.bar').forEach(function (b, i) {
          setTimeout(function () { b.style.height = b.getAttribute('data-h') + '%'; }, i * 45);
        });
        bio.disconnect();
      });
    }, { threshold: 0.3 });
    bio.observe(wrap);
  })();

  /* ---- markets ---- */
  (function () {
    var wrap = $('markets'); if (!wrap || !EX.markets.length) return;
    var max = Math.max.apply(null, EX.markets.map(function (m) { return m.events; }).concat([1]));
    EX.markets.forEach(function (m, i) {
      var row = document.createElement('div'); row.className = 'row';
      row.innerHTML = '<div class="nm">' + m.name + '</div><div class="track"><div class="fill' +
        (i === 0 ? ' peak' : '') + '" data-w="' + Math.round(m.events / max * 100) + '"></div></div><div class="v">' + m.events + '</div>';
      wrap.appendChild(row);
    });
    var mio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        wrap.querySelectorAll('.fill').forEach(function (f, i) {
          setTimeout(function () { f.style.width = f.getAttribute('data-w') + '%'; }, i * 70);
        });
        mio.disconnect();
      });
    }, { threshold: 0.25 });
    mio.observe(wrap);
  })();

  /* ---- slate ---- */
  (function () {
    var wrap = $('slate'); if (!wrap) return;
    if (!EX.slate.length) { wrap.innerHTML = '<div class="ev"><div class="nm">A quiet night — no events scheduled.</div></div>'; return; }
    EX.slate.forEach(function (ev) {
      var d = document.createElement('div'); d.className = 'ev';
      d.innerHTML = '<div class="t"><div class="tm">' + ev.t + '</div><div class="tg">' +
        (ev.live ? 'Live event' : 'Coverage') + '</div></div><div><div class="nm">' +
        ev.s + '</div><div class="vn">' + (ev.v || 'ANC venue') + '</div></div>';
      wrap.appendChild(d);
    });
  })();

  /* ============ GLOBE STORY ============ */
  var live = MAP.filter(function (p) { return p.live && isFinite(p.lat) && isFinite(p.lng); })
    .sort(function (a, b) { return a.lng - b.lng; }); // west -> east sweep
  var dormant = MAP.filter(function (p) { return !p.live && isFinite(p.lat) && isFinite(p.lng); });

  var world = null, ready = false, lastCount = -1;
  function initGlobe() {
    if (!window.Globe) { return setTimeout(initGlobe, 120); }
    var el = $('globe'); if (!el) return;
    world = Globe()(el)
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true).atmosphereColor('#0A52EF').atmosphereAltitude(0.26)
      .pointLat('lat').pointLng('lng').pointAltitude('alt')
      .pointColor(function (p) { return p.live ? '#03B8FF' : 'rgba(120,132,200,0.55)'; })
      .pointRadius(function (p) { return p.live ? 0.32 : 0.12; })
      .pointsTransitionDuration(0);
    try {
      var m = world.globeMaterial();
      m.color && m.color.set('#0A1026');
      if (m.emissive) { m.emissive.set('#06163a'); m.emissiveIntensity = 0.35; }
    } catch (e) {}
    world.pointOfView({ lat: 41, lng: -98, altitude: 0.7 }, 0);
    var c = world.controls();
    if (c) { c.enableZoom = true; c.autoRotate = false; c.autoRotateSpeed = 0.5; }

    fetch('/globe/countries.geojson').then(function (r) { return r.json(); }).then(function (cs) {
      var isUS = function (f) { var p = f.properties || {}; return p.ISO_A2 === 'US' || p.ADM0_A3 === 'USA' || p.NAME === 'United States of America'; };
      world.polygonsData(cs.features)
        .polygonCapColor(function (f) { return isUS(f) ? 'rgba(10,82,239,0.40)' : 'rgba(40,58,134,0.28)'; })
        .polygonSideColor(function () { return 'rgba(10,82,239,0.10)'; })
        .polygonStrokeColor(function (f) { return isUS(f) ? 'rgba(3,184,255,0.6)' : 'rgba(60,80,150,0.4)'; })
        .polygonAltitude(0.006);
    }).catch(function () {});

    ready = true;
    apply(progress());
  }

  function progress() {
    var story = $('story'); if (!story) return 0;
    var top = story.offsetTop, h = story.offsetHeight - window.innerHeight;
    return clamp((window.scrollY - top) / Math.max(1, h), 0, 1);
  }

  function show(id, on) { var e = $(id); if (e) e.classList[on ? 'add' : 'remove']('show'); }

  function apply(p) {
    if (!ready || !world) return;
    // camera: zoomed US -> pull back into globe
    var alt = p < 0.5 ? lerp(0.7, 1.05, p / 0.5) : lerp(1.05, 2.5, (p - 0.5) / 0.5);
    var lat = lerp(41, 18, ease(p));
    var lng = -98 + p * 26;
    if (p < 0.999) world.pointOfView({ lat: lat, lng: lng, altitude: alt }, 0);

    // ignite venues
    var igP = ease(clamp((p - 0.06) / 0.44, 0, 1));
    var count = Math.round(igP * live.length);
    if (count !== lastCount) {
      lastCount = count;
      var shown = live.slice(0, count).map(function (q) { return { lat: q.lat, lng: q.lng, live: true, alt: 0.14 }; });
      // first light appears at very start
      if (count === 0 && p > 0.005) shown = [{ lat: live[0] ? live[0].lat : 40.7, lng: live[0] ? live[0].lng : -74, live: true, alt: 0.14 }];
      var bg = dormant.map(function (q) { return { lat: q.lat, lng: q.lng, live: false, alt: 0.005 }; });
      world.pointsData(shown.concat(bg));
    }

    // ticker
    var tk = $('ticker'); if (tk) tk.textContent = Math.round(igP * TON.events).toLocaleString();
    var ts = $('t-states'), tv = $('t-venues');
    if (ts) ts.textContent = TON.states; if (tv) tv.textContent = TON.venues;

    // captions
    show('cap1', p < 0.12);
    show('cap2', p >= 0.1 && p < 0.52);
    show('cap3', p >= 0.52 && p < 0.82);
    show('cap4', p >= 0.82);
    var cue = $('cue'); if (cue) cue.style.opacity = p > 0.04 ? '0' : '1';

    // free the globe after the story
    var c = world.controls();
    if (c) c.autoRotate = p >= 0.92;
  }

  var dirty = true;
  window.addEventListener('scroll', function () { dirty = true; updateProg(); }, { passive: true });
  window.addEventListener('resize', function () { dirty = true; if (world) world.width(innerWidth) && world.height(innerHeight); });
  function loop() { if (dirty) { dirty = false; apply(progress()); } requestAnimationFrame(loop); }
  requestAnimationFrame(loop);

  function updateProg() {
    var doc = document.documentElement;
    var sp = window.scrollY / Math.max(1, (doc.scrollHeight - window.innerHeight));
    var pr = $('prog'); if (pr) pr.style.width = (sp * 100) + '%';
  }
  updateProg();

  initGlobe();
})();
