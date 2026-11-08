// Météo — version Web (iPhone, ou n'importe quel navigateur)
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);

  // ---------------- Mémoire (dans le navigateur) ----------------
  const MONTMAGNY = { nom: 'Montmagny', region: 'Québec', lat: 46.9803, lon: -70.5543 };
  const lireMem = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const ecrireMem = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let reglages = Object.assign({ temp: 'C', pluie: 'mm', neige: 'cm', vent: 'kmh', fondAnime: true, opacite: 0.45 }, lireMem('reglages', {}));
  let villes = lireMem('villes', [MONTMAGNY]);
  let choix = Math.min(lireMem('choix', 0), villes.length - 1);
  let meteo = null, derniereMaj = 0, jourOuvert = -1;

  // ---------------- Unités ----------------
  const nb = (v, d) => v.toLocaleString('fr-CA', { minimumFractionDigits: d, maximumFractionDigits: d });
  const T = (c) => Math.round(reglages.temp === 'C' ? c : c * 9 / 5 + 32) + '°';
  const ventT = (k) => reglages.vent === 'kmh' ? Math.round(k) + ' km/h' : reglages.vent === 'mph' ? Math.round(k / 1.609) + ' mi/h' : Math.round(k / 1.852) + ' nd';
  const pluieT = (mm) => reglages.pluie === 'mm' ? nb(mm, mm < 10 ? 1 : 0) + ' mm' : reglages.pluie === 'cm' ? nb(mm / 10, 1) + ' cm' : nb(mm / 25.4, 2) + ' po';
  const neigeT = (cm) => reglages.neige === 'cm' ? nb(cm, cm < 10 ? 1 : 0) + ' cm' : nb(cm / 2.54, 1) + ' po';
  const pluieArr = (mm) => mm < 0.2 ? null : reglages.pluie !== 'mm' ? '~' + pluieT(mm) : mm < 1 ? '<1 mm' : mm < 3 ? '1-3 mm' : '~' + Math.round(mm) + ' mm';
  const neigeArr = (cm) => cm < 0.1 ? null : reglages.neige !== 'cm' ? '~' + neigeT(cm) : cm < 1 ? '<1 cm' : cm < 3 ? '1-3 cm' : '~' + Math.round(cm) + ' cm';
  const quantite = (p, n) => (n >= 0.1 && n * 10 >= p) ? (neigeArr(n) && '❄ ' + neigeArr(n)) : (pluieArr(p) && '💧 ' + pluieArr(p));

  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const dateDe = (s) => new Date(s.length <= 10 ? s + 'T00:00' : s);
  const memeJour = (a, b) => a.toDateString() === b.toDateString();
  function nomJour(d, auj) {
    const dem = new Date(auj); dem.setDate(dem.getDate() + 1);
    if (memeJour(d, auj)) return "Aujourd'hui";
    if (memeJour(d, dem)) return 'Demain';
    return JOURS[d.getDay()][0].toUpperCase() + JOURS[d.getDay()].slice(1);
  }

  // ---------------- Données (modèle canadien GEM, complété au-delà de 10 jours) ----------------
  const adresse = (v, modele) => 'https://api.open-meteo.com/v1/forecast?latitude=' + v.lat + '&longitude=' + v.lon +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,pressure_msl,is_day' +
    '&hourly=temperature_2m,apparent_temperature,weather_code,precipitation_probability,rain,showers,snowfall,wind_speed_10m,wind_gusts_10m,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,rain_sum,showers_sum,snowfall_sum,sunrise,sunset' +
    '&forecast_days=16&models=' + modele + '&timezone=auto';

  async function charger(v) {
    const [gem, sec] = await Promise.all([
      fetch(adresse(v, 'gem_seamless')).then((r) => r.json()),
      fetch(adresse(v, 'best_match')).then((r) => r.json()).catch(() => null),
    ]);
    const val = (sect, nom, i, def = 0) => {
      const a = gem[sect] && gem[sect][nom]; if (a && a[i] != null) return a[i];
      const b = sec && sec[sect] && sec[sect][nom]; if (b && b[i] != null) return b[i];
      return def;
    };
    const c = gem.current;
    const actuelle = { temp: c.temperature_2m, ressenti: c.apparent_temperature, humidite: c.relative_humidity_2m, code: c.weather_code,
      vent: c.wind_speed_10m, rafales: c.wind_gusts_10m, dir: c.wind_direction_10m, nuages: c.cloud_cover, pression: c.pressure_msl,
      jour: c.is_day === 1, moment: dateDe(c.time) };
    const heures = gem.hourly.time.map((t, i) => ({ moment: dateDe(t), temp: val('hourly', 'temperature_2m', i), ressenti: val('hourly', 'apparent_temperature', i),
      code: val('hourly', 'weather_code', i, 3), prob: val('hourly', 'precipitation_probability', i),
      pluie: val('hourly', 'rain', i) + val('hourly', 'showers', i), neige: val('hourly', 'snowfall', i),
      vent: val('hourly', 'wind_speed_10m', i), rafales: val('hourly', 'wind_gusts_10m', i), jour: val('hourly', 'is_day', i, 1) === 1 }));
    const jours = gem.daily.time.slice(0, 14).map((t, i) => ({ date: dateDe(t), code: val('daily', 'weather_code', i, 3),
      max: val('daily', 'temperature_2m_max', i), min: val('daily', 'temperature_2m_min', i), prob: val('daily', 'precipitation_probability_max', i),
      pluie: val('daily', 'rain_sum', i) + val('daily', 'showers_sum', i), neige: val('daily', 'snowfall_sum', i),
      lever: gem.daily.sunrise[i], coucher: gem.daily.sunset[i], tendance: gem.daily.weather_code[i] == null }));
    let uv = null, iqa = null;
    try {
      const air = await fetch('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + v.lat + '&longitude=' + v.lon + '&current=us_aqi,uv_index&timezone=auto').then((r) => r.json());
      uv = air.current.uv_index; iqa = air.current.us_aqi;
    } catch (e) {}
    const debut = new Date(actuelle.moment); debut.setMinutes(0, 0, 0);
    return { actuelle, toutes: heures, heures: heures.filter((h) => h.moment >= debut).slice(0, 24), jours, uv, iqa };
  }

  // ---------------- Ambiance du fond ----------------
  function ambiance(m) {
    const a = m.actuelle, c = a.code;
    let ciel = 'NUAGEUX', int = 0;
    if (c <= 1) ciel = 'DEGAGE'; else if (c === 2) ciel = 'PARTIEL'; else if (c === 45 || c === 48) { ciel = 'BROUILLARD'; int = .7; }
    else if ([51, 53, 55, 56, 57].includes(c)) { ciel = 'PLUIE'; int = .2; }
    else if ([61, 66, 80].includes(c)) { ciel = 'PLUIE'; int = .4; } else if ([63, 81].includes(c)) { ciel = 'PLUIE'; int = .65; }
    else if ([65, 67, 82].includes(c)) { ciel = 'PLUIE'; int = 1; } else if ([71, 77, 85].includes(c)) { ciel = 'NEIGE'; int = .35; }
    else if (c === 73) { ciel = 'NEIGE'; int = .6; } else if ([75, 86].includes(c)) { ciel = 'NEIGE'; int = 1; }
    else if (c >= 95) { ciel = 'ORAGE'; int = c === 95 ? .75 : 1; }
    const couv = a.nuages / 100;
    return { ciel, intensite: int, nuages: ciel === 'DEGAGE' ? Math.min(couv, .15) : ciel === 'PARTIEL' ? Math.max(.3, Math.min(couv, .6)) : Math.max(couv, .8),
      vent: a.vent, versDroite: a.dir >= 180, jour: a.jour, bruine: [51, 53, 55, 56, 57].includes(c) };
  }

  // ---------------- Résumé et 4 moments de la journée ----------------
  function resume(m) {
    const a = m.actuelle, p = m.heures.slice(0, 12), morceaux = [descriptionMeteo(a.code)];
    const mouill = p.filter((h) => h.prob >= 40 && (h.pluie >= .1 || h.neige >= .1));
    if (mouill.length) {
      const n = mouill.reduce((s, h) => s + h.neige, 0), pl = mouill.reduce((s, h) => s + h.pluie, 0);
      const quoi = n >= pl / 10 ? 'neige' : 'pluie', quand = mouill[0] === p[0] ? 'en ce moment' : 'à partir de ' + mouill[0].moment.getHours() + ' h';
      const q = quoi === 'neige' ? neigeArr(n) : pluieArr(pl);
      morceaux.push(quoi + ' ' + quand + (q ? ' (' + q + " d'ici 12 h)" : ''));
    } else morceaux.push('pas de précipitations prévues dans les 12 prochaines heures');
    const raf = Math.max(...p.map((h) => h.rafales)); if (raf >= 50) morceaux.push('venteux, rafales jusqu\'à ' + ventT(raf));
    const s = morceaux.join('; '); return s[0].toUpperCase() + s.slice(1) + '.';
  }
  const poids = (c) => c >= 95 ? 9 : [66, 67, 56, 57].includes(c) ? 8 : [71, 73, 75, 77, 85, 86].includes(c) ? 7 : [61, 63, 65, 80, 81, 82].includes(c) ? 6 : [51, 53, 55].includes(c) ? 5 : c === 45 || c === 48 ? 4 : c;
  const dominant = (l) => l.reduce((b, c) => (poids(c) * 100 + c > poids(b) * 100 + b ? c : b), l[0]);
  function periodes(m, date) {
    const maint = new Date(m.actuelle.moment); maint.setMinutes(0, 0, 0);
    return [['Matin', 6, 12], ['Après-midi', 12, 18], ['Soirée', 18, 24], ['Nuit', 24, 30]].map(([nom, de, a]) => {
      const d0 = new Date(date); d0.setHours(de, 0, 0, 0); const d1 = new Date(date); d1.setHours(a, 0, 0, 0);
      const hs = m.toutes.filter((h) => h.moment >= d0 && h.moment < d1 && h.moment >= maint);
      if (!hs.length) return null;
      const mi = hs[Math.floor(hs.length / 2)];
      return { nom, code: dominant(hs.map((h) => h.code)), jour: mi.jour, temp: mi.temp, ressenti: mi.ressenti,
        prob: Math.max(...hs.map((h) => h.prob)), pluie: hs.reduce((s, h) => s + h.pluie, 0), neige: hs.reduce((s, h) => s + h.neige, 0) };
    }).filter(Boolean);
  }

  // ---------------- Affichage ----------------
  function colonne(titre, code, jour, t, sous, prob, pluie, neige) {
    const hEau = pluie >= .1 ? 4 + Math.min(pluie, 10) / 10 * 30 : 0, hNeige = neige >= .1 ? 5 + Math.min(neige, 10) / 10 * 29 : 0;
    const fond = (neige >= .1 && neige * 10 >= pluie) ? `<div class="neige" style="height:${hNeige}px"></div>` : hEau ? `<div class="eau" style="height:${hEau}px"></div>` : '';
    return `<div class="col">${fond}<div class="h">${titre}</div>${iconeMeteo(code, jour)}<div class="t">${t}</div><div class="r">${sous}</div>` +
      `<div class="p" style="color:${prob >= 10 ? 'var(--bleu-pluie)' : 'rgba(255,255,255,.4)'}">${prob} %</div><div class="q">${quantite(pluie, neige) || '&nbsp;'}</div></div>`;
  }

  function afficher() {
    const m = meteo; if (!m) return;
    const a = m.actuelle, auj = new Date(a.moment), j0 = m.jours[0];
    document.documentElement.style.setProperty('--carte', `rgba(11,18,32,${reglages.opacite})`);
    let h = `<div class="actuel">${iconeMeteo(a.code, a.jour)}<div class="temp">${T(a.temp)}</div><div class="ombre">` +
      `<div class="desc">${descriptionMeteo(a.code)}</div><div class="sous">Ressenti ${T(a.ressenti)}</div>` +
      `<div class="sous">Max ${T(j0.max)} · Min ${T(j0.min)}</div></div></div>` +
      `<div class="ligne-vent">💨 ${ventT(a.vent)} · rafales ${ventT(a.rafales)} · 💧 ${a.humidite} % · mis à jour à ${a.moment.getHours()} h ${String(a.moment.getMinutes()).padStart(2, '0')}</div>` +
      `<div class="resume">${resume(m)}</div>`;
    h += `<section class="carte"><h2>Heure par heure</h2><div class="bande">` +
      m.heures.map((x, i) => colonne(i ? x.moment.getHours() + ' h' : 'Maint.', x.code, x.jour, T(x.temp), 'Ress. ' + T(x.ressenti), x.prob, x.pluie, x.neige)).join('') + '</div></section>';
    h += `<section class="carte"><h2>14 jours <span class="note">touche un jour</span></h2>` + m.jours.map((j, i) => {
      const q = j.neige >= .2 ? '❄️ ' + neigeT(j.neige) : j.pluie >= .5 ? '💧 ' + pluieT(j.pluie) : '';
      let s = `<div class="jour" data-jour="${i}"><div class="nom">${nomJour(j.date, auj)}${j.tendance ? ' <span class="tendance">tendance</span>' : ''}<small>${q}</small></div>` +
        `${iconeMeteo(j.code, true)}<div class="prob">${j.prob >= 10 ? j.prob + ' %' : ''}</div><div class="max">${T(j.max)}</div><div class="min">${T(j.min)}</div></div>`;
      if (i === jourOuvert) s += '<div class="periodes">' + periodes(m, j.date).map((p) =>
        `<div class="periode">${p.nom}<br>${iconeMeteo(p.code, p.jour)}<b>${T(p.temp)}</b>${p.prob} %<br>${quantite(p.pluie, p.neige) || ''}</div>`).join('') + '</div>';
      return s;
    }).join('') + `<p class="note">« Tendance » : au-delà de 10 jours, d'un autre modèle, moins fiable.</p></section>`;
    const hm = (s) => { const d = dateDe(s); return d.getHours() + ' h ' + String(d.getMinutes()).padStart(2, '0'); };
    const uvT = (u) => u < 3 ? 'Faible' : u < 6 ? 'Modéré' : u < 8 ? 'Élevé' : u < 11 ? 'Très élevé' : 'Extrême';
    const airT = (q) => q <= 50 ? 'Bonne' : q <= 100 ? 'Acceptable' : q <= 150 ? 'Mauvaise (sensibles)' : 'Mauvaise';
    h += `<section class="carte"><h2>Plus d'infos</h2><div class="grille">` +
      (m.uv != null ? `<div><small>☀️ Indice UV</small><b>${Math.round(m.uv)} · ${uvT(m.uv)}</b></div>` : '') +
      (m.iqa != null ? `<div><small>🍃 Qualité de l'air</small><b>${airT(m.iqa)}</b></div>` : '') +
      `<div><small>🧭 Pression</small><b>${nb(a.pression / 10, 1)} kPa</b></div>` +
      `<div><small>🌅 Lever du soleil</small><b>${hm(j0.lever)}</b></div><div><small>🌇 Coucher du soleil</small><b>${hm(j0.coucher)}</b></div></div></section>`;
    $('#contenu').innerHTML = h;
    $('#contenu').querySelectorAll('.jour').forEach((el) => el.addEventListener('click', () => {
      const i = +el.dataset.jour; jourOuvert = jourOuvert === i ? -1 : i; afficher();
    }));
  }

  async function actualiser() {
    const v = villes[choix] || MONTMAGNY;
    $('#nom-ville').textContent = v.nom; $('#region-ville').textContent = v.region || '';
    try {
      meteo = await charger(v); derniereMaj = Date.now();
      Fond.regler(ambiance(meteo)); afficher();
    } catch (e) {
      if (!meteo) $('#contenu').innerHTML = '<div class="chargement">Impossible de charger la météo.<br>Vérifie ta connexion Internet.</div>';
    }
  }

  // Mise à jour automatique : au retour dans l'application (plus de 10 min) et aux 15 minutes
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - derniereMaj > 10 * 60000) actualiser(); });
  setInterval(() => { if (!document.hidden && Date.now() - derniereMaj > 15 * 60000) actualiser(); }, 60000);

  // ---------------- Écrans : villes et paramètres ----------------
  const ouvrir = (id) => { $(id).hidden = false; };
  document.querySelectorAll('[data-fermer]').forEach((b) => b.addEventListener('click', () => { b.closest('.ecran').hidden = true; }));

  function afficherVilles() {
    $('#liste-villes').innerHTML = villes.map((v, i) =>
      `<div class="item-ville ${i === choix ? 'choisie' : ''}" data-i="${i}"><div><b>${v.gps ? '📍 ' : ''}${v.nom}</b><small>${v.region || ''}</small></div>` +
      (villes.length > 1 ? `<span class="x" data-x="${i}">✕</span>` : '') + '</div>').join('');
    $('#liste-villes').querySelectorAll('.item-ville').forEach((el) => el.addEventListener('click', (e) => {
      const x = e.target.dataset.x;
      if (x != null) { villes.splice(+x, 1); if (choix >= villes.length) choix = villes.length - 1; }
      else { choix = +el.dataset.i; $('#ecran-villes').hidden = true; actualiser(); }
      ecrireMem('villes', villes); ecrireMem('choix', choix); afficherVilles();
    }));
  }
  $('#btn-ville').addEventListener('click', () => { afficherVilles(); ouvrir('#ecran-villes'); });
  $('#form-recherche').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('#champ-recherche').value.trim(); if (!q) return;
    $('#resultats').innerHTML = '<p class="note">Recherche…</p>';
    try {
      const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=10&language=fr&format=json').then((x) => x.json());
      const res = (r.results || []).sort((a, b) => (a.country_code !== 'CA') - (b.country_code !== 'CA'));
      $('#resultats').innerHTML = res.length ? res.map((v, i) => `<div class="item-ville" data-r="${i}"><div><b>${v.name}</b><small>${[v.admin1, v.country].filter(Boolean).join(', ')}</small></div><span>＋</span></div>`).join('')
        : '<p class="note">Aucune ville trouvée.</p>';
      $('#resultats').querySelectorAll('[data-r]').forEach((el) => el.addEventListener('click', () => {
        const v = res[+el.dataset.r];
        villes.push({ nom: v.name, region: [v.admin1, v.country].filter(Boolean).join(', '), lat: v.latitude, lon: v.longitude });
        choix = villes.length - 1; ecrireMem('villes', villes); ecrireMem('choix', choix);
        $('#resultats').innerHTML = ''; $('#ecran-villes').hidden = true; actualiser();
      }));
    } catch (err) { $('#resultats').innerHTML = '<p class="note">La recherche ne fonctionne pas pour le moment.</p>'; }
  });
  $('#btn-gps').addEventListener('click', () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => {
      villes = [{ nom: 'Ma position', region: '', lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), gps: true }].concat(villes.filter((v) => !v.gps));
      choix = 0; ecrireMem('villes', villes); ecrireMem('choix', 0); $('#ecran-villes').hidden = true; actualiser();
    }, () => alert("La position n'est pas disponible. Vérifie l'autorisation de localisation pour Safari."));
  });

  function afficherReglages() {
    const choixHtml = (titre, cle, options) => `<h3>${titre}</h3><div class="choix">` +
      options.map(([v, n]) => `<button data-cle="${cle}" data-v="${v}" class="${reglages[cle] === v ? 'oui' : ''}">${n}</button>`).join('') + '</div>';
    $('#contenu-reglages').innerHTML =
      choixHtml('🎨 Fond', 'fondAnime', [[true, 'Animé (suit la météo)'], [false, 'Couleur unie']]) +
      `<h3>🔲 Cartes : transparence (${Math.round(reglages.opacite * 100)} %)</h3><input id="opacite" type="range" min="0" max="1" step="0.05" value="${reglages.opacite}">` +
      choixHtml('🌡️ Température', 'temp', [['C', 'Celsius (°C)'], ['F', 'Fahrenheit (°F)']]) +
      choixHtml('💧 Pluie', 'pluie', [['mm', 'Millimètres'], ['cm', 'Centimètres'], ['po', 'Pouces']]) +
      choixHtml('❄️ Neige', 'neige', [['cm', 'Centimètres'], ['po', 'Pouces']]) +
      choixHtml('💨 Vent', 'vent', [['kmh', 'km/h'], ['mph', 'mi/h'], ['nd', 'Nœuds']]) +
      `<h3>📱 Installer sur l'iPhone</h3><p class="note">Dans Safari : bouton Partager (carré avec une flèche) → « Sur l'écran d'accueil ».</p>` +
      `<p class="note">Version Web 1.0</p>`;
    $('#contenu-reglages').querySelectorAll('[data-cle]').forEach((b) => b.addEventListener('click', () => {
      let v = b.dataset.v; if (v === 'true') v = true; if (v === 'false') v = false;
      reglages[b.dataset.cle] = v; ecrireMem('reglages', reglages); Fond.afficher(reglages.fondAnime); afficherReglages(); afficher();
    }));
    $('#opacite').addEventListener('input', (e) => { reglages.opacite = +e.target.value; ecrireMem('reglages', reglages); afficher();
      e.target.previousElementSibling.textContent = `🔲 Cartes : transparence (${Math.round(reglages.opacite * 100)} %)`; });
  }
  $('#btn-reglages').addEventListener('click', () => { afficherReglages(); ouvrir('#ecran-reglages'); });
  $('#btn-actualiser').addEventListener('click', actualiser);

  // ---------------- Démarrage ----------------
  Fond.afficher(reglages.fondAnime);
  actualiser();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
