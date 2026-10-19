/*
 * Prayer time calculator — runs fully in the browser, no API needed.
 * Based on the well-known astronomical formulas published by PrayTimes.org.
 *
 *   PrayTimes.compute(date, { lat, lng, elevation }, settings) -> { fajr: Date, sunrise: Date, ... }
 *
 * Returned values are real Date objects (UTC instants), so they can be shown in
 * any time zone with Intl.DateTimeFormat({ timeZone }).
 */
(function (global) {
  'use strict';

  // fajr / isha: angle in degrees, or a string like '90 min' (minutes after maghrib)
  var METHODS = {
    MWL:       { name: 'Muslim World League',               fajr: 18,   isha: 17 },
    ISNA:      { name: 'ISNA (North America)',              fajr: 15,   isha: 15 },
    Egypt:     { name: 'Egyptian General Authority',        fajr: 19.5, isha: 17.5 },
    Makkah:    { name: 'Umm al-Qura, Makkah',               fajr: 18.5, isha: '90 min' },
    Karachi:   { name: 'University of Islamic Sciences, Karachi', fajr: 18, isha: 18 },
    Algeria:   { name: 'Algeria (Ministry of Religious Affairs)', fajr: 18, isha: 17 },
    Morocco:   { name: 'Morocco (Habous)',                  fajr: 19,   isha: 17 },
    Tunisia:   { name: 'Tunisia',                            fajr: 18,   isha: 18 },
    France:    { name: 'France (UOIF, 12°)',                fajr: 12,   isha: 12 },
    Paris:     { name: 'Grande Mosquée de Paris',           fajr: 18,   isha: 18 },
    Turkey:    { name: 'Diyanet (Turkey)',                  fajr: 18,   isha: 17 },
    Gulf:      { name: 'Gulf region',                        fajr: 19.5, isha: '90 min' },
    Dubai:     { name: 'Dubai (UAE)',                        fajr: 18.2, isha: 18.2 },
    Kuwait:    { name: 'Kuwait',                             fajr: 18,   isha: 17.5 },
    Qatar:     { name: 'Qatar',                              fajr: 18,   isha: '90 min' },
    Singapore: { name: 'Singapore / Malaysia / Indonesia',   fajr: 20,   isha: 18 },
    Tehran:    { name: 'Institute of Geophysics, Tehran',    fajr: 17.7, isha: 14, maghrib: 4.5, midnight: 'Jafari' },
    Jafari:    { name: 'Shia Ithna-Ashari (Jafari)',         fajr: 16,   isha: 14, maghrib: 4 }
  };

  // Country (ISO 3166 alpha-2) -> usual local method. Used by the "Auto" option.
  var COUNTRY_METHOD = {
    DZ: 'Algeria', MA: 'Morocco', TN: 'Tunisia', LY: 'Egypt', EG: 'Egypt', SD: 'Egypt',
    SA: 'Makkah', YE: 'Makkah', BH: 'Gulf', OM: 'Gulf', AE: 'Dubai', KW: 'Kuwait', QA: 'Qatar',
    JO: 'MWL', PS: 'MWL', LB: 'MWL', SY: 'Egypt', IQ: 'MWL', IR: 'Tehran',
    TR: 'Turkey', AZ: 'Turkey', PK: 'Karachi', IN: 'Karachi', BD: 'Karachi', AF: 'Karachi',
    MY: 'Singapore', SG: 'Singapore', ID: 'Singapore', BN: 'Singapore',
    US: 'ISNA', CA: 'ISNA', MX: 'ISNA', FR: 'Paris', BE: 'MWL', GB: 'MWL', DE: 'MWL', NL: 'MWL'
  };

  var rad = function (d) { return d * Math.PI / 180; };
  var deg = function (r) { return r * 180 / Math.PI; };
  var sin = function (d) { return Math.sin(rad(d)); };
  var cos = function (d) { return Math.cos(rad(d)); };
  var tan = function (d) { return Math.tan(rad(d)); };
  var arcsin = function (x) { return deg(Math.asin(x)); };
  var arccos = function (x) { return deg(Math.acos(x)); };
  var arctan2 = function (y, x) { return deg(Math.atan2(y, x)); };
  var arccot = function (x) { return deg(Math.atan(1 / x)); };
  var fix = function (a, b) { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };
  var fixAngle = function (a) { return fix(a, 360); };
  var fixHour = function (a) { return fix(a, 24); };
  var isMin = function (v) { return typeof v === 'string' && v.indexOf('min') > -1; };
  var num = function (v) { return parseFloat(v) || 0; };

  function julian(year, month, day) {
    if (month <= 2) { year -= 1; month += 12; }
    var A = Math.floor(year / 100);
    var B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
  }

  function sunPosition(jd) {
    var D = jd - 2451545.0;
    var g = fixAngle(357.529 + 0.98560028 * D);
    var q = fixAngle(280.459 + 0.98564736 * D);
    var L = fixAngle(q + 1.915 * sin(g) + 0.020 * sin(2 * g));
    var e = 23.439 - 0.00000036 * D;
    var RA = arctan2(cos(e) * sin(L), cos(L)) / 15;
    return { declination: arcsin(sin(e) * sin(L)), equation: q / 15 - fixHour(RA) };
  }

  /**
   * date      : { year, month (1-12), day } — the LOCAL calendar day at the location
   * coords    : { lat, lng, elevation }
   * settings  : { method, asr: 'standard'|'hanafi', highLat: 'AngleBased'|'NightMiddle'|'OneSeventh'|'None',
   *               adjust: { fajr: +min, dhuhr: +min, ... } }
   */
  function compute(date, coords, settings) {
    settings = settings || {};
    var m = METHODS[settings.method] || METHODS.MWL;
    var p = {
      imsak: '10 min', fajr: m.fajr, dhuhr: '0 min', maghrib: m.maghrib != null ? m.maghrib : '0 min',
      isha: m.isha, asrFactor: settings.asr === 'hanafi' ? 2 : 1, highLat: settings.highLat || 'AngleBased'
    };
    var lat = coords.lat, lng = coords.lng, elv = coords.elevation || 0;
    var jDate = julian(date.year, date.month, date.day) - lng / (15 * 24);

    function midDay(t) { return fixHour(12 - sunPosition(jDate + t).equation); }
    function sunAngleTime(angle, t, ccw) {
      var decl = sunPosition(jDate + t).declination;
      var noon = midDay(t);
      var v = arccos((-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15;
      return noon + (ccw ? -v : v);
    }
    function asrTime(factor, t) {
      var decl = sunPosition(jDate + t).declination;
      return sunAngleTime(-arccot(factor + tan(Math.abs(lat - decl))), t);
    }
    var riseSet = 0.833 + 0.0347 * Math.sqrt(elv);

    // first guesses (hours), refined once
    var t = { imsak: 5, fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, maghrib: 18, isha: 18 };
    for (var i = 0; i < 2; i++) {
      var d = {}; for (var k in t) d[k] = t[k] / 24;
      t = {
        imsak:   sunAngleTime(num(p.imsak), d.imsak, true),
        fajr:    sunAngleTime(num(p.fajr), d.fajr, true),
        sunrise: sunAngleTime(riseSet, d.sunrise, true),
        dhuhr:   midDay(d.dhuhr),
        asr:     asrTime(p.asrFactor, d.asr),
        sunset:  sunAngleTime(riseSet, d.sunset),
        maghrib: sunAngleTime(num(p.maghrib), d.maghrib),
        isha:    sunAngleTime(num(p.isha), d.isha)
      };
    }

    // local solar time -> UTC hours of that calendar day
    for (var k2 in t) t[k2] += -lng / 15;

    // high latitude safety net (summer nights where twilight never ends)
    if (p.highLat !== 'None') {
      var night = fixHour(t.sunrise - t.sunset);
      var portion = function (angle) {
        var f = p.highLat === 'NightMiddle' ? 1 / 2 : p.highLat === 'OneSeventh' ? 1 / 7 : angle / 60;
        return f * night;
      };
      var adj = function (time, base, angle, ccw) {
        var por = portion(angle);
        var diff = ccw ? fixHour(base - time) : fixHour(time - base);
        return (isNaN(time) || diff > por) ? base + (ccw ? -por : por) : time;
      };
      t.imsak = adj(t.imsak, t.sunrise, isMin(p.imsak) ? num(p.fajr) : num(p.imsak), true);
      t.fajr = adj(t.fajr, t.sunrise, num(p.fajr), true);
      if (!isMin(p.isha)) t.isha = adj(t.isha, t.sunset, num(p.isha));
      if (!isMin(p.maghrib)) t.maghrib = adj(t.maghrib, t.sunset, num(p.maghrib));
    }
    if (isMin(p.imsak)) t.imsak = t.fajr - num(p.imsak) / 60;
    if (isMin(p.maghrib)) t.maghrib = t.sunset + num(p.maghrib) / 60;
    if (isMin(p.isha)) t.isha = t.maghrib + num(p.isha) / 60;
    t.dhuhr += num(p.dhuhr) / 60;

    // Umm al-Qura: isha is 120 min after maghrib during Ramadan
    if (settings.method === 'Makkah' && settings.ramadan) t.isha = t.maghrib + 2;

    var adjust = settings.adjust || {};
    var base = Date.UTC(date.year, date.month - 1, date.day);
    var out = {};
    for (var k3 in t) {
      var mins = Math.round(t[k3] * 60 + (adjust[k3] || 0));
      out[k3] = isNaN(mins) ? null : new Date(base + mins * 60000);
    }
    return out;
  }

  // Direction of the Kaaba in degrees from true north (clockwise).
  function qibla(lat, lng) {
    var kLat = 21.422487, kLng = 39.826206;
    var dL = rad(kLng - lng);
    var b = Math.atan2(Math.sin(dL), Math.cos(rad(lat)) * Math.tan(rad(kLat)) - Math.sin(rad(lat)) * Math.cos(dL));
    return (deg(b) + 360) % 360;
  }

  // Great-circle distance to Makkah in km.
  function distanceToKaaba(lat, lng) {
    var R = 6371, kLat = 21.422487, kLng = 39.826206;
    var a = Math.pow(Math.sin(rad(kLat - lat) / 2), 2) +
      Math.cos(rad(lat)) * Math.cos(rad(kLat)) * Math.pow(Math.sin(rad(kLng - lng) / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  global.PrayTimes = {
    METHODS: METHODS,
    COUNTRY_METHOD: COUNTRY_METHOD,
    compute: compute,
    qibla: qibla,
    distanceToKaaba: distanceToKaaba
  };
})(window);
