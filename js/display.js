/* Mosque TV display. Reads js/config.js, js/i18n.js and js/praytimes.js. */
(function () {
  'use strict';
  var S = window.SITE, I = window.I18N, PT = window.PrayTimes;
  var $ = function (id) { return document.getElementById(id); };
  var m = /[?&]lang=(en|fr|ar)/.exec(location.search);
  var lang = m ? m[1] : (I[S.defaultLanguage] ? S.defaultLanguage : 'en');
  var tz = S.location.timezone, h24 = S.prayer.use24h !== false;
  var locale = lang === 'ar' ? 'ar-u-nu-latn' : lang === 'fr' ? 'fr-FR' : 'en-GB';
  var ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  var SALAH = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  var L = function (o) { return o == null ? '' : typeof o === 'string' ? o : (o[lang] || o.en || ''); };
  var t = function (k, v) { var s = (I[lang] && I[lang][k]) || I.en[k] || ''; v = v || {}; return s.replace(/\{(\w+)\}/g, function (_, x) { return v[x] != null ? v[x] : L(S.name); }); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var fmt = function (d, sec) { return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: sec ? '2-digit' : undefined, hour12: !h24, timeZone: tz }).format(d); };
  function ymd(d) { var p = {}; new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; }); return { year: +p.year, month: +p.month, day: +p.day }; }
  function noon(y) { return new Date(Date.UTC(y.year, y.month - 1, y.day, 12)); }
  function next(y) { var d = new Date(Date.UTC(y.year, y.month - 1, y.day + 1)); return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }; }
  function cd(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60); }
  // "13:30" on a given local day -> Date
  function at(y, hm) {
    var x = hm.split(':'), guess = Date.UTC(y.year, y.month - 1, y.day, +x[0], +x[1]);
    var p = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(guess)).forEach(function (q) { p[q.type] = q.value; });
    return new Date(guess - (Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute) - guess));
  }
  function compute(y) {
    return PT.compute(y, { lat: S.location.lat, lng: S.location.lng, elevation: S.location.elevation || 0 },
      { method: S.prayer.method === 'Auto' ? 'MWL' : S.prayer.method, asr: S.prayer.asr, highLat: S.prayer.highLatitude, adjust: S.prayer.adjust });
  }

  var day, times, iqama, isFri;
  function build() {
    day = ymd(new Date()); times = compute(day);
    isFri = noon(day).getUTCDay() === 5;
    iqama = {};
    SALAH.forEach(function (k) { iqama[k] = times[k] ? new Date(times[k].getTime() + (S.prayer.iqama[k] || 0) * 60000) : null; });
    if (isFri && S.prayer.jumuah) iqama.dhuhr = at(day, S.prayer.jumuah.prayer);
    $('name').textContent = L(S.name);
    $('greg').textContent = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(noon(day));
    var hd = noon(day); hd.setUTCDate(hd.getUTCDate() + (S.prayer.hijriOffset || 0));
    try { $('hijri').textContent = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', calendar: 'islamic-umalqura', timeZone: 'UTC' }).format(hd); } catch (e) { /* old browser */ }
    $('row').innerHTML = ORDER.map(function (k) {
      var key = k === 'dhuhr' && isFri ? 'jumuah' : k;
      return '<li class="p' + (k === 'sunrise' ? ' p--sun' : '') + '" data-k="' + k + '"><span class="p__name">' + t('p.' + key) + '</span>' +
        '<span class="p__ar" lang="ar">' + I.ar['p.' + key] + '</span><span class="p__time">' + fmt(times[k]) + '</span>' +
        '<span class="p__iq">' + (iqama[k] ? t('p.iqama') + ' ' + fmt(iqama[k]) : '&nbsp;') + '</span></li>';
    }).join('');
    $('jumuah').textContent = t('p.jumuah') + ' · ' + t('p.khutbah') + ' ' + fmt(at(day, S.prayer.jumuah.khutbah)) + ' · ' + t('p.prayer') + ' ' + fmt(at(day, S.prayer.jumuah.prayer));
  }

  function tick() {
    var now = new Date(), y = ymd(now);
    if (!day || y.day !== day.day) build();
    $('clock').textContent = fmt(now, false);
    var label, name, target, iq = false;
    // 1) between adhan and iqama -> iqama countdown; 2) 10 min after iqama -> prayer in progress; 3) next adhan
    SALAH.forEach(function (k) {
      if (!label && times[k] && now >= times[k] && now < iqama[k]) { label = t('disp.iqamaIn'); name = k; target = iqama[k]; iq = true; }
      else if (!label && iqama[k] && now >= iqama[k] && now - iqama[k] < 10 * 60000) { label = t('disp.inPrayer'); name = k; target = null; }
    });
    if (!label) {
      label = t('p.next');
      for (var i = 0; i < SALAH.length; i++) if (times[SALAH[i]] > now) { name = SALAH[i]; target = times[name]; break; }
      if (!name) { name = 'fajr'; target = compute(next(day)).fajr; }
    }
    var shown = name === 'dhuhr' && isFri ? 'jumuah' : name;
    $('statusLabel').textContent = label;
    $('statusName').textContent = t('p.' + shown);
    $('statusCd').textContent = target ? cd(target - now) : '';
    $('statusCd').hidden = !target;
    document.querySelector('.status').classList.toggle('is-iqama', iq);
    Array.prototype.forEach.call(document.querySelectorAll('.p'), function (li) { li.classList.toggle('is-next', li.getAttribute('data-k') === name); });
  }

  // rotating announcements / verses at the bottom
  var msgs = (S.announcements || []).map(L).filter(Boolean), mi = 0, tk = $('ticker');
  function rotate() {
    if (!msgs.length) return;
    tk.classList.add('is-fading');
    setTimeout(function () { tk.textContent = msgs[mi % msgs.length]; mi++; tk.classList.remove('is-fading'); }, 800);
  }

  $('fs').addEventListener('click', function () { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(function () {}); });
  build(); tick(); rotate();
  setInterval(tick, 1000);
  setInterval(rotate, 12000);
  setTimeout(function () { location.reload(); }, 6 * 3600 * 1000); // pick up config changes on screens left on all day
})();
