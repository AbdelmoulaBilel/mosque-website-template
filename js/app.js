/* Mosque template — page logic. Content lives in config.js and i18n.js. */
(function () {
  'use strict';

  var S = window.SITE, I = window.I18N, PT = window.PrayTimes;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('mosque.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('mosque.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var PRAYERS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  var SALAH = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

  /* ---------------- state ---------------- */
  var mosqueLoc = {
    name: S.location.city, lat: S.location.lat, lng: S.location.lng,
    elevation: S.location.elevation || 0, tz: S.location.timezone, source: 'mosque'
  };
  var state = {
    lang: urlLang() || store.get('lang', null) || pickLang(),
    loc: store.get('loc', null) || mosqueLoc,
    method: store.get('method', 'default'),
    asr: store.get('asr', S.prayer.asr || 'standard'),
    h24: store.get('h24', S.prayer.use24h !== false),
    notify: store.get('notify', false),
    today: null,       // { ymd, times }
    lastFired: null
  };

  function urlLang() { var m = /[?&]lang=(en|fr|ar)/.exec(location.search); return m ? m[1] : null; }
  function pickLang() {
    var nav = (navigator.language || 'en').slice(0, 2);
    return I[S.defaultLanguage] ? S.defaultLanguage : (I[nav] ? nav : 'en');
  }

  /* ---------------- i18n ---------------- */
  function locale() { return state.lang === 'ar' ? 'ar-u-nu-latn' : state.lang === 'fr' ? 'fr-FR' : 'en-GB'; }
  function L(obj) { return obj == null ? '' : (typeof obj === 'string' ? obj : (obj[state.lang] || obj.en || '')); }
  function t(key, vars) {
    var s = (I[state.lang] && I[state.lang][key]) || I.en[key] || '';
    vars = vars || {};
    if (vars.name == null) vars.name = L(S.name);
    return s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] != null ? vars[k] : ''; });
  }
  function prayerName(k) {
    if (k === 'dhuhr' && isFriday()) return t('p.jumuah');
    return t('p.' + k);
  }

  function applyLanguage() {
    var html = document.documentElement;
    html.lang = state.lang;
    html.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    $$('[data-i18n]').forEach(function (el) { var v = t(el.getAttribute('data-i18n')); if (v) el.textContent = v; });
    $$('[data-i18n-aria]').forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    $$('[data-i18n-ph]').forEach(function (el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    $$('[data-site]').forEach(function (el) { el.textContent = L(S[el.getAttribute('data-site')]); });
    $$('[data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === state.lang)); });
    document.title = t('meta.title');
    var md = $('meta[name="description"]'); if (md) md.setAttribute('content', t('meta.desc'));
    // the Arabic verse is already shown — in Arabic mode the translation line only names the surah
    fillContact();
    fillMethodSelect();
    renderProgramme();
    renderEvents();
    renderAll();
  }

  /* ---------------- time helpers ---------------- */
  function ymdIn(date, tz) {
    var p = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
    return { year: +p.year, month: +p.month, day: +p.day };
  }
  function tzOffsetMs(date, tz) {
    var p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
    return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(date.getTime() / 1000) * 1000;
  }
  // "2026-11-14T18:30" in a given zone -> Date
  function zoned(str, tz) {
    var m = str.match(/(\d+)-(\d+)-(\d+)(?:T(\d+):(\d+))?/);
    var guess = Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    var off = tzOffsetMs(new Date(guess), tz);
    return new Date(guess - off);
  }
  function fmtTime(d, tz) {
    if (!d) return '--:--';
    return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', hour12: !state.h24, timeZone: tz || state.loc.tz }).format(d);
  }
  function hm(str) { var m = String(str).split(':'); return { h: +m[0], m: +m[1] }; }
  function fmtHM(str) { // "13:30" -> localised
    var x = hm(str), d = new Date(Date.UTC(2000, 0, 1, x.h, x.m));
    return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', hour12: !state.h24, timeZone: 'UTC' }).format(d);
  }
  function addMin(d, m) { return d ? new Date(d.getTime() + m * 60000) : null; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function countdown(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60);
  }
  function isFriday() {
    var y = ymdIn(new Date(), state.loc.tz);
    return new Date(Date.UTC(y.year, y.month - 1, y.day)).getUTCDay() === 5;
  }
  function addDays(ymd, n) {
    var d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + n));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }
  function ymdDate(ymd) { return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12)); }

  /* ---------------- prayer calculation ---------------- */
  function effectiveMethod(loc) {
    loc = loc || state.loc;
    if (state.method && state.method !== 'default') return state.method;
    if (loc.source === 'mosque') return S.prayer.method === 'Auto' ? (PT.COUNTRY_METHOD[loc.country] || 'MWL') : S.prayer.method;
    return PT.COUNTRY_METHOD[(loc.country || '').toUpperCase()] || 'MWL';
  }
  function timesFor(ymd, loc) {
    loc = loc || state.loc;
    var isMosque = loc.source === 'mosque';
    return PT.compute(ymd, { lat: loc.lat, lng: loc.lng, elevation: loc.elevation || 0 }, {
      method: effectiveMethod(loc),
      asr: state.asr,
      highLat: S.prayer.highLatitude,
      adjust: isMosque ? S.prayer.adjust : null,
      ramadan: isRamadan(ymd)
    });
  }
  function isRamadan(ymd) {
    try {
      var m = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric' }).format(ymdDate(addDays(ymd, S.prayer.hijriOffset || 0)));
      return parseInt(m, 10) === 9;
    } catch (e) { return false; }
  }
  function hijri(ymd, short) {
    try {
      return new Intl.DateTimeFormat(locale(), {
        day: 'numeric', month: short ? 'short' : 'long', year: short ? undefined : 'numeric', calendar: 'islamic-umalqura', timeZone: 'UTC'
      }).format(ymdDate(addDays(ymd, S.prayer.hijriOffset || 0)));
    } catch (e) { return ''; }
  }
  function gregorian(ymd) {
    return new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(ymdDate(ymd));
  }

  function refreshToday() {
    var ymd = ymdIn(new Date(), state.loc.tz);
    var key = ymd.year + '-' + ymd.month + '-' + ymd.day + '|' + state.loc.lat + ',' + state.loc.lng + '|' + effectiveMethod() + state.asr;
    if (state.today && state.today.key === key) return false;
    state.today = { key: key, ymd: ymd, times: timesFor(ymd), tomorrow: timesFor(addDays(ymd, 1)) };
    return true;
  }

  function nextPrayer(now) {
    var tt = state.today.times;
    for (var i = 0; i < SALAH.length; i++) {
      if (tt[SALAH[i]] && tt[SALAH[i]] > now) return { key: SALAH[i], at: tt[SALAH[i]] };
    }
    return { key: 'fajr', at: state.today.tomorrow.fajr, tomorrow: true };
  }
  function currentPrayer(now) {
    var tt = state.today.times, cur = null;
    SALAH.forEach(function (k) { if (tt[k] && tt[k] <= now) cur = k; });
    if (cur === 'fajr' && tt.sunrise && now >= tt.sunrise) cur = null; // between sunrise and dhuhr: no prayer time
    return cur || (now < tt.fajr ? 'isha' : null);
  }

  /* ---------------- rendering: prayer ---------------- */
  function renderAll() {
    refreshToday();
    renderLocation();
    renderTimes();
    renderDial();
    renderQibla();
    renderFooterTimes();
    tick();
  }

  function renderLocation() {
    var isM = state.loc.source === 'mosque';
    $$('[data-loc="kind"]').forEach(function (el) { el.textContent = t(isM ? 'p.mosqueLoc' : 'p.yourLoc'); });
    $$('[data-loc="name"]').forEach(function (el) { el.textContent = state.loc.name; });
    $$('[data-loc="mosqueCity"]').forEach(function (el) { el.textContent = S.location.city.split(',')[0]; });
    $('#resetLocation').hidden = isM;
    $('[data-date="greg"]').textContent = gregorian(state.today.ymd);
    $('[data-date="hijri"]').textContent = hijri(state.today.ymd);
    var m = PT.METHODS[effectiveMethod()];
    $('#methodNote').textContent = t('p.note', { method: m ? m.name : effectiveMethod() });
    $('#methodSel').value = state.method;
    $('#asrSel').value = state.asr;
    $('#fmtSel').value = state.h24 ? '24' : '12';
  }

  function renderTimes() {
    var tt = state.today.times, isM = state.loc.source === 'mosque';
    var html = PRAYERS.map(function (k) {
      var iq = isM && S.prayer.iqama[k] != null ? fmtTime(addMin(tt[k], S.prayer.iqama[k])) : '';
      return '<li class="time" data-key="' + k + '">' +
        '<span class="time__name">' + prayerName(k) + '</span>' +
        '<span class="time__ar" lang="ar">' + I.ar['p.' + (k === 'dhuhr' && isFriday() ? 'jumuah' : k)] + '</span>' +
        '<strong class="time__at">' + fmtTime(tt[k]) + '</strong>' +
        (iq ? '<span class="time__iqama">' + t('p.iqama') + ' ' + iq + '</span>' : '<span class="time__iqama">&nbsp;</span>') +
        '</li>';
    }).join('');
    $('#times').innerHTML = html;
    $('[data-jumuah="khutbah"]').textContent = fmtHM(S.prayer.jumuah.khutbah);
    $('[data-jumuah="prayer"]').textContent = fmtHM(S.prayer.jumuah.prayer);
  }

  function renderFooterTimes() {
    var mYmd = ymdIn(new Date(), mosqueLoc.tz), tt = timesFor(mYmd, mosqueLoc);
    $('#footerTimes').innerHTML = SALAH.map(function (k) {
      return '<li><span>' + t('p.' + k) + '</span><strong>' + fmtTime(tt[k], mosqueLoc.tz) + '</strong></li>';
    }).join('');
  }

  /* 24-hour dial: midnight at the bottom, noon at the top, morning on the left */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function hoursIn(d) {
    var p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: state.loc.tz, hourCycle: 'h23', hour: 'numeric', minute: 'numeric' }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return (+p.hour % 24) + p.minute / 60;
  }
  var C = 170, R = 118;
  function pt(h, r) { var a = h / 24 * Math.PI * 2; return [C - r * Math.sin(a), C + r * Math.cos(a)]; }
  function arc(h1, h2, r) {
    var a = pt(h1, r), b = pt(h2, r), span = ((h2 - h1) % 24 + 24) % 24;
    return 'M' + a[0].toFixed(2) + ' ' + a[1].toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + (span > 12 ? 1 : 0) + ' 1 ' + b[0].toFixed(2) + ' ' + b[1].toFixed(2);
  }
  function renderDial() {
    var tt = state.today.times, svg = $('#dial');
    var H = {}; PRAYERS.forEach(function (k) { H[k] = tt[k] ? hoursIn(tt[k]) : null; });
    var s = '';
    s += '<defs><linearGradient id="dayGrad" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e7b75a"/><stop offset="1" stop-color="#f6d58f"/></linearGradient></defs>';
    s += '<circle cx="' + C + '" cy="' + C + '" r="' + R + '" class="dial__night"/>';
    // hour ticks
    for (var h = 0; h < 24; h++) {
      var a = pt(h, R - 18), b = pt(h, R - (h % 6 === 0 ? 28 : 22));
      s += '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '" class="dial__tick' + (h % 6 === 0 ? ' dial__tick--major' : '') + '"/>';
    }
    if (H.fajr != null && H.sunrise != null) s += '<path d="' + arc(H.fajr, H.sunrise, R) + '" class="dial__twilight"/>';
    if (H.sunrise != null && H.maghrib != null) s += '<path d="' + arc(H.sunrise, H.maghrib, R) + '" class="dial__day"/>';
    if (H.maghrib != null && H.isha != null) s += '<path d="' + arc(H.maghrib, H.isha, R) + '" class="dial__twilight"/>';
    PRAYERS.forEach(function (k) {
      if (H[k] == null) return;
      var p = pt(H[k], R), l = pt(H[k], R + 26);
      var anchor = Math.abs(l[0] - C) < 12 ? 'middle' : (l[0] < C ? 'end' : 'start');
      s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="6" class="dial__dot" data-key="' + k + '"/>';
      s += '<text x="' + l[0] + '" y="' + (l[1] + 4) + '" text-anchor="' + anchor + '" class="dial__label" data-key="' + k + '">' + prayerName(k) + '</text>';
    });
    s += '<g id="dialHand"><line x1="' + C + '" y1="' + C + '" x2="' + C + '" y2="' + (C + R - 8) + '" class="dial__hand"/><circle cx="' + C + '" cy="' + (C + R) + '" r="9" class="dial__sun"/></g>';
    s += '<circle cx="' + C + '" cy="' + C + '" r="62" class="dial__face"/>';
    s += '<text x="' + C + '" y="' + (C - 6) + '" text-anchor="middle" class="dial__clock" id="dialClock">--:--</text>';
    s += '<text x="' + C + '" y="' + (C + 20) + '" text-anchor="middle" class="dial__sub" id="dialSub"></text>';
    svg.innerHTML = s;
  }

  var lastMinute = -1;
  function tick() {
    if (!state.today) return;
    if (refreshToday()) { renderTimes(); renderDial(); renderLocation(); renderFooterTimes(); }
    var now = new Date(), nx = nextPrayer(now), cur = currentPrayer(now);
    var name = prayerName(nx.key), cd = countdown(nx.at - now);
    $$('[data-next="name"]').forEach(function (el) { el.textContent = name; });
    $$('[data-next="countdown"]').forEach(function (el) { el.textContent = cd; });
    $$('[data-next="time"]').forEach(function (el) { el.textContent = fmtTime(nx.at); });
    var justStarted = cur && state.today.times[cur] && now - state.today.times[cur] < 15 * 60000;
    $('[data-next="label"]').textContent = justStarted ? t('p.now') + ' ' + prayerName(cur) + ' · ' + t('p.next') : t('p.next');
    $$('#times .time').forEach(function (li) {
      var k = li.getAttribute('data-key');
      li.classList.toggle('is-next', k === nx.key && !nx.tomorrow);
      li.classList.toggle('is-current', k === cur);
    });
    if (nx.tomorrow) { var f = $('#times .time[data-key="fajr"]'); if (f) f.classList.add('is-next'); }
    $$('#dial [data-key]').forEach(function (el) { el.classList.toggle('is-next', el.getAttribute('data-key') === nx.key); });
    // dial hand + clock (once per minute is enough)
    var h = hoursIn(now);
    if (Math.floor(h * 60) !== lastMinute) {
      lastMinute = Math.floor(h * 60);
      var hand = $('#dialHand');
      if (hand) hand.setAttribute('transform', 'rotate(' + (h / 24 * 360).toFixed(2) + ' ' + C + ' ' + C + ')');
      var clock = $('#dialClock'); if (clock) clock.textContent = fmtTime(now);
      var sub = $('#dialSub'); if (sub) sub.textContent = hijri(state.today.ymd).replace(/\s*(AH|هـ|ap\. J\.-C\.|de l’Hégire)\s*$/, '');
    }
    maybeNotify(now);
  }

  /* ---------------- reminders ---------------- */
  var audioCtx;
  function chime() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      [523.25, 659.25, 783.99].forEach(function (f, i) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t0 = audioCtx.currentTime + i * 0.35;
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
        o.connect(g).connect(audioCtx.destination); o.start(t0); o.stop(t0 + 1.5);
      });
    } catch (e) { /* no audio */ }
  }
  function maybeNotify(now) {
    if (!state.notify) return;
    SALAH.forEach(function (k) {
      var at = state.today.times[k];
      if (!at) return;
      var id = state.today.key + k;
      if (now >= at && now - at < 60000 && state.lastFired !== id) {
        state.lastFired = id;
        chime();
        if ('Notification' in window && Notification.permission === 'granted') {
          try { new Notification(L(S.shortName), { body: t('p.notifyMsg', { prayer: prayerName(k) }), icon: 'img/favicon.svg' }); } catch (e) { /* ignore */ }
        }
      }
    });
  }
  function renderNotifyBtn() {
    var b = $('#notifyBtn');
    b.setAttribute('aria-pressed', String(state.notify));
    b.querySelector('span').textContent = t(state.notify ? 'p.notifyOn' : 'p.notify');
  }

  /* ---------------- Qibla ---------------- */
  var qiblaDeg = 0;
  function renderQibla() {
    qiblaDeg = PT.qibla(state.loc.lat, state.loc.lng);
    var km = Math.round(PT.distanceToKaaba(state.loc.lat, state.loc.lng));
    $('#qiblaText').textContent = t('p.qiblaTxt', { deg: Math.round(qiblaDeg), km: km.toLocaleString(locale()) });
    $('#qiblaNeedle').setAttribute('transform', 'rotate(' + qiblaDeg.toFixed(1) + ' 60 60)');
    var ticks = '';
    for (var i = 0; i < 360; i += 30) ticks += '<line x1="60" y1="7" x2="60" y2="' + (i % 90 ? 11 : 14) + '" transform="rotate(' + i + ' 60 60)"/>';
    $('.qr-ticks').innerHTML = ticks;
  }
  function initCompass() {
    var btn = $('#compassBtn');
    if (!('DeviceOrientationEvent' in window) || !matchMedia('(pointer: coarse)').matches) return;
    btn.hidden = false;
    btn.addEventListener('click', function () {
      var start = function () {
        $('#compassHint').hidden = false;
        var handler = function (e) {
          var heading = e.webkitCompassHeading != null ? e.webkitCompassHeading : (e.absolute && e.alpha != null ? 360 - e.alpha : null);
          if (heading == null) return;
          $('#qiblaRose').style.transform = 'rotate(' + (-heading) + 'deg)';
        };
        window.addEventListener('deviceorientationabsolute', handler);
        window.addEventListener('deviceorientation', handler);
      };
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(function (r) { if (r === 'granted') start(); }).catch(function () {});
      } else start();
    });
  }

  /* ---------------- location: geolocation & search ---------------- */
  function setStatus(msg) { $('#locStatus').textContent = msg || ''; }
  function setLocation(loc) {
    state.loc = loc;
    store.set('loc', loc.source === 'mosque' ? null : loc);
    state.today = null;
    $('#cityResults').hidden = true;
    renderAll();
  }
  function useMyLocation() {
    if (!navigator.geolocation) { setStatus(t('p.locErr')); return; }
    setStatus(t('p.locating'));
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = +pos.coords.latitude.toFixed(4), lng = +pos.coords.longitude.toFixed(4);
      var loc = { name: lat + ', ' + lng, lat: lat, lng: lng, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, source: 'geo', country: '' };
      setLocation(loc);
      setStatus('');
      fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=' + lat + '&lon=' + lng + '&accept-language=' + state.lang)
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var a = j.address || {};
          var city = a.city || a.town || a.village || a.municipality || a.county || a.state;
          if (city) loc.name = city + (a.country ? ', ' + a.country : '');
          loc.country = (a.country_code || '').toUpperCase();
          setLocation(loc);
        }).catch(function () { /* keep coordinates */ });
    }, function () { setStatus(t('p.locErr')); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
  }
  var searchCtl;
  function searchCity(q) {
    if (searchCtl) searchCtl.abort();
    searchCtl = 'AbortController' in window ? new AbortController() : null;
    var list = $('#cityResults');
    return fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&format=json&language=' + state.lang + '&name=' + encodeURIComponent(q), searchCtl ? { signal: searchCtl.signal } : {})
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var res = j.results || [];
        if (!res.length) { list.innerHTML = '<li class="search__empty">' + t('p.noResult') + '</li>'; list.hidden = false; return; }
        list.innerHTML = res.map(function (c, i) {
          var sub = [c.admin1, c.country].filter(Boolean).join(', ');
          return '<li role="option" tabindex="-1" data-i="' + i + '"><strong>' + esc(c.name) + '</strong><small>' + esc(sub) + '</small></li>';
        }).join('');
        list.hidden = false;
        $$('li[data-i]', list).forEach(function (li) {
          var pick = function () {
            var c = res[+li.getAttribute('data-i')];
            $('#cityInput').value = '';
            setLocation({ name: c.name + (c.country ? ', ' + c.country : ''), lat: c.latitude, lng: c.longitude, elevation: c.elevation || 0, tz: c.timezone || 'UTC', country: c.country_code || '', source: 'search' });
          };
          li.addEventListener('click', pick);
          li.addEventListener('keydown', function (e) { if (e.key === 'Enter') pick(); });
        });
        var first = list.querySelector('li[data-i]'); if (first) first.focus();
      }).catch(function (e) { if (e.name !== 'AbortError') { list.innerHTML = '<li class="search__empty">' + t('p.locErr') + '</li>'; list.hidden = false; } });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------------- settings ---------------- */
  function fillMethodSelect() {
    var sel = $('#methodSel');
    var opts = '<option value="default">' + t('p.auto') + '</option>';
    Object.keys(PT.METHODS).forEach(function (k) { opts += '<option value="' + k + '">' + PT.METHODS[k].name + '</option>'; });
    sel.innerHTML = opts;
    sel.value = state.method;
  }

  /* ---------------- monthly timetable ---------------- */
  function openMonth() {
    var y = state.today.ymd, days = new Date(Date.UTC(y.year, y.month, 0)).getUTCDate();
    var monthName = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(ymdDate(y));
    $('#monthTitle').textContent = t('p.month') + ' — ' + monthName;
    $('#monthSub').textContent = state.loc.name + ' · ' + (PT.METHODS[effectiveMethod()] || {}).name;
    var head = '<thead><tr><th>' + t('p.date') + '</th><th>' + t('p.day') + '</th>' + PRAYERS.map(function (k) { return '<th>' + t('p.' + k) + '</th>'; }).join('') + '</tr></thead>';
    var rows = '';
    var wd = new Intl.DateTimeFormat(locale(), { weekday: 'short', timeZone: 'UTC' });
    var hj = function (ymd) { return hijri(ymd, true); };
    for (var d = 1; d <= days; d++) {
      var ymd = { year: y.year, month: y.month, day: d }, tt = timesFor(ymd);
      var today = d === y.day ? ' class="is-today"' : '';
      rows += '<tr' + today + '><td><strong>' + d + '</strong> <small>' + hj(ymd) + '</small></td><td>' + wd.format(ymdDate(ymd)) + '</td>' +
        PRAYERS.map(function (k) { return '<td>' + fmtTime(tt[k]) + '</td>'; }).join('') + '</tr>';
    }
    $('#monthTable').innerHTML = head + '<tbody>' + rows + '</tbody>';
    var dlg = $('#monthDialog');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    var cur = dlg.querySelector('.is-today'); if (cur) cur.scrollIntoView({ block: 'center' });
  }

  /* ---------------- contact, programme, events ---------------- */
  function fillContact() {
    var c = S.contact, tel = 'tel:' + c.phone.replace(/[^\d+]/g, '');
    $$('[data-contact="phone"]').forEach(function (el) { el.textContent = c.phone; });
    $$('[data-contact="email"]').forEach(function (el) { el.textContent = c.email; });
    $$('[data-contact="address"]').forEach(function (el) { el.textContent = L(c.address); });
    $$('[data-contact="tel"]').forEach(function (el) { el.href = tel; });
    $$('[data-contact="mailto"]').forEach(function (el) { el.href = 'mailto:' + c.email; });
    $$('[data-donate]').forEach(function (el) { el.href = S.donationUrl || '#contact'; if (/^https?:/.test(S.donationUrl)) { el.target = '_blank'; el.rel = 'noopener'; } });
    var wa = $('#whatsappBtn');
    if (c.whatsapp) { wa.hidden = false; wa.href = 'https://wa.me/' + c.whatsapp; }
    var lat = S.location.lat, lng = S.location.lng;
    $('#directions').href = 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng;
    var map = $('#map');
    if (!map.src) map.src = 'https://www.openstreetmap.org/export/embed.html?bbox=' + (lng - 0.012) + ',' + (lat - 0.007) + ',' + (lng + 0.012) + ',' + (lat + 0.007) + '&layer=mapnik&marker=' + lat + ',' + lng;
    var icons = { facebook: 'i-facebook', instagram: 'i-instagram', youtube: 'i-youtube', x: 'i-xsocial' };
    $('#social').innerHTML = Object.keys(icons).filter(function (k) { return S.social[k]; }).map(function (k) {
      return '<li><a href="' + esc(S.social[k]) + '" aria-label="' + k + '" target="_blank" rel="noopener"><svg><use href="#' + icons[k] + '"/></svg></a></li>';
    }).join('');
  }

  function programmeTime(p) {
    if (p.time === 'jumuah') return t('pr.jumuah', { time: fmtHM(S.prayer.jumuah.khutbah) });
    var m = /^after:(\w+)/.exec(p.time);
    if (m) {
      var tt = timesFor(ymdIn(new Date(), mosqueLoc.tz), mosqueLoc);
      return t('pr.after', { prayer: t('p.' + m[1]) }) + (tt[m[1]] ? ' · ~' + fmtTime(tt[m[1]], mosqueLoc.tz) : '');
    }
    return fmtHM(p.time);
  }
  function renderProgramme() {
    var wd = new Intl.DateTimeFormat(locale(), { weekday: 'long', timeZone: 'UTC' });
    var dayName = function (n) { return wd.format(new Date(Date.UTC(2023, 0, 1 + n))); }; // 1 Jan 2023 was a Sunday
    $('#programmeList').innerHTML = (S.programme || []).map(function (p) {
      return '<li class="prog" data-reveal>' +
        '<div class="prog__days">' + p.days.map(function (d) { return '<span>' + dayName(d) + '</span>'; }).join('') + '</div>' +
        '<div class="prog__body"><h3>' + esc(L(p.title)) + '</h3><p>' + esc(L(p.detail)) + '</p></div>' +
        '<div class="prog__time"><svg><use href="#i-clock"/></svg>' + esc(programmeTime(p)) + '</div></li>';
    }).join('');
    observeReveal();
  }

  function renderEvents() {
    var now = Date.now();
    var list = (S.events || []).map(function (e) { return { e: e, at: zoned(e.date, S.location.timezone) }; })
      .filter(function (x) { return x.at.getTime() > now; })
      .sort(function (a, b) { return a.at - b.at; });
    var box = $('#eventsList');
    if (!list.length) { box.innerHTML = '<p class="events__none">' + t('e.none') + '</p>'; return; }
    var dfmt = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: !state.h24, timeZone: S.location.timezone });
    var day = new Intl.DateTimeFormat(locale(), { day: '2-digit', timeZone: S.location.timezone });
    var mon = new Intl.DateTimeFormat(locale(), { month: 'short', timeZone: S.location.timezone });
    box.innerHTML = list.map(function (x, i) {
      return '<article class="event" data-reveal>' +
        '<div class="event__media"><img src="' + esc(x.e.image) + '" alt="" loading="lazy" width="500" height="500">' +
        '<span class="event__date"><strong>' + day.format(x.at) + '</strong>' + mon.format(x.at) + '</span></div>' +
        '<div class="event__body"><h3>' + esc(L(x.e.title)) + '</h3>' +
        '<ul class="event__meta"><li><svg><use href="#i-clock"/></svg>' + dfmt.format(x.at) + '</li><li><svg><use href="#i-pin"/></svg>' + esc(L(x.e.place)) + '</li></ul>' +
        '<div class="cd" data-at="' + x.at.getTime() + '">' +
        ['days', 'hours', 'mins', 'secs'].map(function (u) { return '<div><strong data-u="' + u + '">00</strong><span>' + t('e.' + u) + '</span></div>'; }).join('') +
        '</div><button class="btn btn--line-dark btn--sm" type="button" data-ics="' + i + '"><svg><use href="#i-calendar"/></svg>' + t('e.add') + '</button></div></article>';
    }).join('');
    $$('[data-ics]', box).forEach(function (b) {
      b.addEventListener('click', function () { downloadIcs(list[+b.getAttribute('data-ics')]); });
    });
    tickEvents();
    observeReveal();
  }
  function tickEvents() {
    $$('.cd[data-at]').forEach(function (cd) {
      var s = Math.max(0, Math.floor((+cd.getAttribute('data-at') - Date.now()) / 1000));
      var v = { days: Math.floor(s / 86400), hours: Math.floor(s % 86400 / 3600), mins: Math.floor(s % 3600 / 60), secs: s % 60 };
      Object.keys(v).forEach(function (u) { var el = cd.querySelector('[data-u="' + u + '"]'); if (el) el.textContent = pad(v[u]); });
    });
  }
  function downloadIcs(x) {
    var stamp = function (d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    var end = new Date(x.at.getTime() + 2 * 3600000);
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mosque template//EN', 'BEGIN:VEVENT',
      'UID:' + x.at.getTime() + '@mosque-template', 'DTSTAMP:' + stamp(new Date()), 'DTSTART:' + stamp(x.at), 'DTEND:' + stamp(end),
      'SUMMARY:' + L(x.e.title), 'LOCATION:' + L(x.e.place) + ' — ' + L(S.name) + ', ' + L(S.contact.address), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'event.ics';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function initForm() {
    var form = $('#contactForm'), status = $('.form__status', form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = $$('input[required], textarea[required]', form).filter(function (f) { return !f.checkValidity(); });
      $$('.is-invalid', form).forEach(function (f) { f.classList.remove('is-invalid'); });
      if (bad.length) { bad.forEach(function (f) { f.classList.add('is-invalid'); }); bad[0].focus(); return; }
      if (form._honey.value) return;
      var data = { name: form.name.value, email: form.email.value, subject: form.subject.value, message: form.message.value };
      if (!S.formEndpoint) {
        status.textContent = t('c.mailto');
        location.href = 'mailto:' + S.contact.email + '?subject=' + encodeURIComponent(data.subject) +
          '&body=' + encodeURIComponent(data.message + '\n\n— ' + data.name + ' (' + data.email + ')');
        return;
      }
      var btn = $('button[type="submit"]', form); btn.disabled = true;
      fetch(S.formEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); status.textContent = t('c.ok'); status.className = 'form__status is-ok'; form.reset(); })
        .catch(function () { status.textContent = t('c.err'); status.className = 'form__status is-err'; })
        .then(function () { btn.disabled = false; });
    });
  }

  /* ---------------- UI chrome ---------------- */
  function initNav() {
    var nav = $('#nav'), toggle = $('.nav-toggle'), backdrop = $('.nav-backdrop');
    var setOpen = function (open) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      backdrop.hidden = !open;
      document.body.classList.toggle('no-scroll', open);
      if (open) $('a', nav).focus();
    };
    toggle.addEventListener('click', function () { setOpen(!nav.classList.contains('is-open')); });
    $('.nav__close').addEventListener('click', function () { setOpen(false); toggle.focus(); });
    backdrop.addEventListener('click', function () { setOpen(false); });
    $$('a', nav).forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); toggle.focus(); } });

    // header shadow, floating pill, back-to-top, active link
    var header = $('.header'), pill = $('#nextPill'), top = $('.to-top'), hero = $('#home'), prayer = $('#prayer');
    var links = $$('.nav__list a');
    var sections = links.map(function (a) { return $(a.getAttribute('href')); });
    var onScroll = function () {
      var y = window.scrollY;
      header.classList.toggle('is-scrolled', y > 10);
      var pr = prayer.getBoundingClientRect();
      var inPrayer = pr.top < innerHeight * 0.6 && pr.bottom > innerHeight * 0.4;
      pill.classList.toggle('is-visible', y > hero.offsetHeight * 0.8 && !inPrayer);
      top.classList.toggle('is-visible', y > 900);
      var active = 0;
      sections.forEach(function (s, i) { if (s && s.getBoundingClientRect().top < 140) active = i; });
      links.forEach(function (a, i) { a.classList.toggle('is-active', i === active); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  var io;
  function observeReveal() {
    if (!('IntersectionObserver' in window) || reduceMotion) { $$('[data-reveal]').forEach(function (el) { el.classList.add('is-in'); }); return; }
    io = io || new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    $$('[data-reveal]:not(.is-in)').forEach(function (el) { io.observe(el); });
  }

  function initCounters() {
    var els = $$('[data-count]');
    var run = function (el) {
      var target = +(S.stats[el.getAttribute('data-count')] || 0), t0 = performance.now(), dur = reduceMotion ? 0 : 1600;
      var step = function (now) {
        var p = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * e).toLocaleString(locale()) + (p === 1 ? '+' : '');
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (!('IntersectionObserver' in window)) { els.forEach(run); return; }
    var o = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { run(x.target); o.unobserve(x.target); } }); }, { threshold: 0.5 });
    els.forEach(function (el) { o.observe(el); });
  }

  /* ---------------- wire up ---------------- */
  function init() {
    $('#year').textContent = new Date().getFullYear();
    $$('[data-lang]').forEach(function (b) {
      b.addEventListener('click', function () { state.lang = b.getAttribute('data-lang'); store.set('lang', state.lang); applyLanguage(); });
    });
    $('#useLocation').addEventListener('click', useMyLocation);
    $('#resetLocation').addEventListener('click', function () { setLocation(mosqueLoc); setStatus(''); });
    $('#citySearch').addEventListener('submit', function (e) { e.preventDefault(); var q = $('#cityInput').value.trim(); if (q.length > 1) searchCity(q); });
    document.addEventListener('click', function (e) { if (!e.target.closest('#citySearch')) $('#cityResults').hidden = true; });
    $('#methodSel').addEventListener('change', function (e) { state.method = e.target.value; store.set('method', state.method); state.today = null; renderAll(); });
    $('#asrSel').addEventListener('change', function (e) { state.asr = e.target.value; store.set('asr', state.asr); state.today = null; renderAll(); });
    $('#fmtSel').addEventListener('change', function (e) { state.h24 = e.target.value === '24'; store.set('h24', state.h24); lastMinute = -1; applyLanguage(); });
    $('#openMonth').addEventListener('click', openMonth);
    $('#closeMonth').addEventListener('click', function () { $('#monthDialog').close(); });
    $('#monthDialog').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.close(); });
    $('#printMonth').addEventListener('click', function () { document.body.classList.add('printing-month'); window.print(); });
    window.addEventListener('afterprint', function () { document.body.classList.remove('printing-month'); });
    $('#notifyBtn').addEventListener('click', function () {
      state.notify = !state.notify; store.set('notify', state.notify); renderNotifyBtn();
      if (state.notify) { chime(); if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }
    });

    initNav();
    initForm();
    initCompass();
    applyLanguage();
    renderNotifyBtn();
    initCounters();
    observeReveal();
    setInterval(function () { tick(); tickEvents(); }, 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastMinute = -1; tick(); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
