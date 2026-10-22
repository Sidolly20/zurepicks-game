(() => {
  const API_BASE = 'https://zurepick-game.onrender.com';
  const apiUrl = (url) => /^https?:\/\//i.test(url) ? url : API_BASE + url;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = $('#app');
  const S = { tab: 'overview', leagues: [], tips: [], settings: {}, today: '', when: 'upcoming', cat: '', editing: null, q: '', badge: 0 };

  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3000); };
  async function api(url, method = 'GET', body) {
    const r = await fetch(apiUrl(url), { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body || {}), credentials: 'include' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { if (r.status === 401) { showLogin(); } throw new Error(d.error || 'Request failed'); }
    return d;
  }
  const act = async (fn, ok) => { try { const r = await fn(); if (ok) toast(typeof ok === 'function' ? ok(r) : ok); return true; } catch (e) { toast(e.message); return false; } };

  const fmtDate = (s) => new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const fmtDateTime = (ms) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const daysLeft = (ms) => Math.max(0, Math.ceil((ms - Date.now()) / 864e5));
  const pill = (status) => `<span class="pill ${esc(status)}">${esc(status)}</span>`;
  const GLYPH = { won: 'W', lost: 'L', void: 'V', pending: '·', none: '–' };

  /* ---------- login ---------- */
  function showLogin(msg) {
    app.innerHTML = `<div class="adm-login"><form class="auth-card stack" id="loginForm">
<h1>Admin login</h1><p class="muted">Only the site owner can open this dashboard.</p>
<label for="e">Username</label><input id="e" name="email" type="text" autocomplete="username" required>
<label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required>
<p class="form-msg" role="alert" ${msg ? '' : 'hidden'}>${esc(msg || '')}</p>
<button class="btn lg" type="submit">Log in</button></form></div>`;
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, b = Object.fromEntries(new FormData(f));
      try {
        const out = await fetch(apiUrl('/api/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ ...b, next: '/admin' }) });
        const d = await out.json();
        if (!out.ok) throw new Error(d.error);
        if (d.role !== 'admin') { await fetch(apiUrl('/api/logout'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: '{}' }); throw new Error('This account is not an admin.'); }
        boot();
      } catch (err) { const m = $('.form-msg', f); m.textContent = err.message; m.hidden = false; }
    });
  }

  /* ---------- shell ---------- */
  const TABS = [['overview', 'Overview'], ['games', 'Games'], ['odds', '2 Odds'], ['members', 'Members'], ['payments', 'Payments'], ['leagues', 'Leagues'], ['settings', 'Settings']];
  function shell() {
    app.innerHTML = `<div class="a-shell"><aside class="a-side">
<a class="brand" href="/admin"><svg class="logo" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="currentColor"/><path d="M9 10h14L13 22h10" fill="none" stroke="#0e1d2b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Admin</span></a>
<nav class="a-nav" aria-label="Admin sections">${TABS.map(([k, l]) => `<button type="button" data-tab="${k}" aria-current="${S.tab === k}">${l}${k === 'payments' && S.badge ? `<span class="dot">${S.badge}</span>` : ''}</button>`).join('')}</nav>
<div class="foot"><a href="/" target="_blank" rel="noopener">View site</a><button class="btn sm ghost" data-act="logout" type="button">Log out</button></div></aside>
<main class="a-main" id="view"></main></div>`;
  }
  function updateBadge() {
    const btn = $('button[data-tab=payments]'); if (!btn) return;
    $('.dot', btn)?.remove();
    if (S.badge) { const d = document.createElement('span'); d.className = 'dot'; d.textContent = S.badge; btn.appendChild(d); }
  }
  async function render() { shell(); const v = $('#view'); try { await VIEWS[S.tab](v); } catch (e) { v.innerHTML = `<p class="form-msg">${esc(e.message)}</p>`; } }

  /* ---------- match form + list (shared by Games and 2 Odds) ---------- */
  function matchForm(defCat) {
    const m = S.editing || {};
    const cat = m.category || defCat;
    const isCustom = m.tip && !S.tips.includes(m.tip);
    const byCountry = {};
    S.leagues.filter((l) => l.active || l.id === m.league_id).forEach((l) => (byCountry[l.country || 'Other'] ||= []).push(l));
    return `<div class="card" id="formCard"><h2>${m.id ? 'Edit game' : cat === 'premium' ? 'Add a 2 Odds pick' : 'Add a game'}</h2>
<form class="a-form" data-form="match" autocomplete="off"><input type="hidden" name="id" value="${m.id || ''}"><input type="hidden" name="fixture_id" value="${m.fixture_id || ''}">
<div class="span2"><label for="f-league">League</label><select id="f-league" name="league_id" required><option value="">Choose a league</option>${Object.entries(byCountry).map(([c, ls]) => `<optgroup label="${esc(c)}">${ls.map((l) => `<option value="${l.id}" ${m.league_id === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</optgroup>`).join('')}</select></div>
<div><label for="f-date">Match date</label><input id="f-date" name="match_date" type="date" required value="${esc(m.match_date || S.today)}"></div>
<div><label for="f-time">Kick-off</label><input id="f-time" name="kickoff" type="time" required value="${esc(m.kickoff || '15:00')}"></div>
<div><label for="f-home">Home team</label><input id="f-home" name="home" required maxlength="60" value="${esc(m.home)}"></div>
<div><label for="f-away">Away team</label><input id="f-away" name="away" required maxlength="60" value="${esc(m.away)}"></div>
<div><label for="f-tip">Tip</label><select id="f-tip" name="tip">${S.tips.map((t) => `<option ${m.tip === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}<option value="__custom" ${isCustom ? 'selected' : ''}>Custom tip...</option></select></div>
<div id="customWrap" ${isCustom ? '' : 'hidden'}><label for="f-custom">Custom tip</label><input id="f-custom" name="custom_tip" maxlength="60" value="${isCustom ? esc(m.tip) : ''}" placeholder="e.g. Home -1 handicap"></div>
<div><label for="f-odds">Odds</label><input id="f-odds" name="odds" type="number" step="0.01" min="1.01" value="${m.odds ?? ''}" placeholder="1.85"></div>
<div><label for="f-cat">Show on</label><select id="f-cat" name="category"><option value="home" ${cat === 'home' ? 'selected' : ''}>Home page (free)</option><option value="premium" ${cat === 'premium' ? 'selected' : ''}>2 Odds (premium)</option></select></div>
<div><label for="f-hs">Home score</label><input id="f-hs" name="home_score" type="number" min="0" max="99" value="${m.home_score ?? ''}"></div>
<div><label for="f-as">Away score</label><input id="f-as" name="away_score" type="number" min="0" max="99" value="${m.away_score ?? ''}"></div>
<div><label for="f-status">Result</label><select id="f-status" name="status">${['pending', 'won', 'lost', 'void', 'postponed'].map((s) => `<option value="${s}" ${(m.status || 'pending') === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></div>
<p class="hint wide">Enter both final scores and standard tips are marked won, lost or void for you. Custom tips are settled with the Result menu or the W / L / V buttons.</p>
<div class="wide actions"><button class="btn" type="submit">${m.id ? 'Save changes' : cat === 'premium' ? 'Add pick' : 'Add game'}</button>${m.id ? '<button class="btn ghost" type="button" data-act="cancel-edit">Cancel</button>' : ''}</div></form></div>`;
  }

  function fixturePicker() {
    return `<div class="card" id="fxCard"><h2>Pick from real fixtures</h2><div class="sync-line" id="fxStatus">Checking football data...</div>
<div class="toolbar"><input type="date" id="fxDate" value="${esc(S.fxDate || S.today)}" aria-label="Fixture date"><input type="search" id="fxQ" placeholder="Search team or league" aria-label="Search fixtures"></div>
<div id="fxList" class="fx-list"></div><p class="hint">Tap Use to fill the form below. Linked games are marked won or lost automatically when the match finishes.</p></div>`;
  }
  async function loadFixtures() {
    const box = $('#fxList'); if (!box) return;
    S.fxDate = $('#fxDate').value || S.today;
    try {
      const [f, st] = await Promise.all([api(`/api/admin/fixtures?date=${S.fxDate}&q=${encodeURIComponent($('#fxQ').value)}`), api('/api/admin/sync')]);
      S.fx = f.fixtures;
      const ago = st.lastOk ? Math.max(1, Math.round((Date.now() - st.lastOk) / 60000)) : 0;
      $('#fxStatus').innerHTML = !st.hasKey
        ? 'Football data is not connected yet. Add FOOTBALL_DATA_KEY in your settings (see README). You can still type games by hand.'
        : `<span>${st.error ? esc(st.error) : `Synced ${ago} min ago, ${st.fixtures} fixtures`}</span><button class="btn xs ghost" data-act="fx-sync" type="button">Sync now</button>`;
      box.innerHTML = f.fixtures.length ? f.fixtures.map((x) => {
        const live = ['IN_PLAY', 'PAUSED', 'LIVE'].includes(x.status), done = ['FINISHED', 'AWARDED'].includes(x.status);
        const tag = live ? '<span class="pill off">LIVE</span>' : done ? `<span class="pill">FT ${x.home_score}-${x.away_score}</span>` : x.status === 'POSTPONED' ? '<span class="pill pending">Postponed</span>' : '';
        return `<div class="fx-row"><span class="t">${esc(x.kickoff)}</span><div><strong>${esc(x.home)} v ${esc(x.away)}</strong> ${tag}${x.used ? ' <span class="pill on">Added</span>' : ''}<small>${esc(x.league || x.comp_name)}</small></div><button class="btn xs" data-act="fx-use" data-id="${x.id}" type="button">Use</button></div>`;
      }).join('') : `<div class="empty"><p>${st.hasKey ? 'No fixtures for this date in the leagues your free key covers.' : 'No fixtures loaded yet.'}</p></div>`;
    } catch (e) { box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; }
  }

  function matchTable(rows, { showCat = true } = {}) {
    if (!rows.length) return '<div class="empty"><p>Nothing here yet.</p></div>';
    return `<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Match</th><th>Tip</th><th>Odds</th>${showCat ? '<th>Page</th>' : ''}<th>Score</th><th>Result</th><th></th></tr></thead><tbody>${rows.map((m) => `<tr>
<td>${fmtDate(m.match_date)}<br><span class="muted">${esc(m.kickoff)}</span></td>
<td><strong>${esc(m.home)}</strong> v <strong>${esc(m.away)}</strong><br><span class="muted">${esc(m.league)}</span></td>
<td>${esc(m.tip)}</td><td>${m.odds ? Number(m.odds).toFixed(2) : ''}</td>
${showCat ? `<td>${m.category === 'premium' ? '<span class="pill premium">2 Odds</span>' : '<span class="pill">Home</span>'}</td>` : ''}
<td>${m.home_score != null ? m.home_score + ' - ' + m.away_score : ''}</td><td>${pill(m.status)}</td>
<td><div class="row-actions"><button class="btn xs ghost" data-act="res" data-id="${m.id}" data-v="won" type="button" title="Mark as won">W</button><button class="btn xs ghost" data-act="res" data-id="${m.id}" data-v="lost" type="button" title="Mark as lost">L</button><button class="btn xs ghost" data-act="res" data-id="${m.id}" data-v="void" type="button" title="Mark as void">V</button><button class="btn xs" data-act="edit" data-id="${m.id}" type="button">Edit</button><button class="btn xs danger" data-act="del" data-id="${m.id}" type="button">Delete</button></div></td></tr>`).join('')}</tbody></table></div>`;
  }
  let lastRows = [];

  function tiles(st) {
    return `<ol class="tiles">${st.days.map((d) => `<li class="tile t-${d.result}${d.isToday ? ' is-today' : ''}"><span class="t-day">${d.isToday ? 'Today' : new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}</span><span class="t-date">${new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span><span class="t-mark">${GLYPH[d.result]}</span><span class="t-odds">${d.odds ? d.odds.toFixed(2) : '&nbsp;'}</span></li>`).join('')}</ol>`;
  }

  /* ---------- views ---------- */
  const VIEWS = {
    async overview(v) {
      const o = await api('/api/admin/overview'); S.today = o.today; S.badge = o.pendingPayments;
      v.innerHTML = `<h1>Overview</h1>
<div class="stats">
<div class="stat ${o.pendingPayments ? 'alert' : ''}"><b>${o.pendingPayments}</b><span>Payments waiting</span></div>
<div class="stat"><b>${o.premiumActive}</b><span>Premium members</span></div>
<div class="stat ${o.expiringSoon ? 'alert' : ''}"><b>${o.expiringSoon}</b><span>Ending within 2 days</span></div>
<div class="stat"><b>${o.members}</b><span>Registered members</span></div>
<div class="stat"><b>${o.homeToday}</b><span>Free tips today</span></div>
<div class="stat ${o.premiumToday < 2 ? 'alert' : ''}"><b>${o.premiumToday}/${S.settings.premium_max_per_day || 2}</b><span>2 Odds picks today</span></div></div>
<div class="card"><h2>2 Odds record shown on the site</h2>${tiles(o.streak)}<p class="hint">A day counts as won when every pick on it won, and as lost when any pick lost.</p></div>
<div class="card"><h2>Quick actions</h2><div class="cta-row"><button class="btn" data-go="games" type="button">Add a game</button><button class="btn ghost" data-go="odds" type="button">Post today's 2 Odds</button><button class="btn ghost" data-go="payments" type="button">Check payments</button></div></div>`;
    },

    async games(v) {
      const q = new URLSearchParams({ when: S.when, category: S.cat });
      const d = await api('/api/admin/matches?' + q); S.today = d.today; lastRows = d.matches;
      const seg = (k, l) => `<button type="button" data-act="when" data-v="${k}" aria-pressed="${S.when === k}">${l}</button>`;
      v.innerHTML = `<h1>Games</h1>${fixturePicker()}${matchForm('home')}
<div class="toolbar"><div class="seg" role="group" aria-label="Date">${seg('today', 'Today')}${seg('tomorrow', 'Tomorrow')}${seg('upcoming', 'Upcoming')}${seg('past', 'Past')}${seg('all', 'All')}</div>
<select data-act="cat" aria-label="Page filter"><option value="">Home + 2 Odds</option><option value="home" ${S.cat === 'home' ? 'selected' : ''}>Home page only</option><option value="premium" ${S.cat === 'premium' ? 'selected' : ''}>2 Odds only</option></select></div>
${matchTable(d.matches)}<p class="hint">Today is ${fmtDate(S.today)}. Games dated after tomorrow are listed under Upcoming and move into Today and Tomorrow by themselves.</p>`;
      loadFixtures();
    },

    async odds(v) {
      const [d, o] = await Promise.all([api('/api/admin/matches?when=week&category=premium'), api('/api/admin/overview')]);
      S.today = d.today; lastRows = d.matches;
      v.innerHTML = `<h1>2 Odds</h1>
<div class="card"><h2>What visitors see (last 7 days)</h2>${tiles(o.streak)}<p class="hint">Set each pick's result below. The tiles update straight away.</p></div>
${fixturePicker()}${matchForm('premium')}
<h2>Picks from the last 7 days and upcoming</h2>${matchTable(d.matches, { showCat: false })}`;
      loadFixtures();
    },

    async members(v) {
      const d = await api('/api/admin/users?q=' + encodeURIComponent(S.q));
      const days = S.settings.premium_days || 7;
      v.innerHTML = `<h1>Members</h1><div class="toolbar"><input type="search" id="q" placeholder="Search name or email" value="${esc(S.q)}" aria-label="Search members"><span class="muted">${d.users.length} shown</span></div>
${d.users.length ? `<div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Joined</th><th></th></tr></thead><tbody>${d.users.map((u) => {
        const on = u.premium_until > d.now;
        return `<tr><td><strong>${esc(u.name)}</strong></td><td>${esc(u.email)}</td>
<td>${on ? `<span class="pill premium">Premium</span><br><span class="muted">${daysLeft(u.premium_until)} day(s) left, ends ${fmtDateTime(u.premium_until)}</span>` : u.premium_until ? '<span class="pill off">Expired</span>' : '<span class="pill">Free</span>'}</td>
<td>${fmtDateTime(u.created_at)}</td>
<td><div class="row-actions"><button class="btn xs" data-act="grant" data-id="${u.id}" data-days="${days}" type="button">${on ? 'Extend' : 'Activate'} ${days} days</button>${on ? `<button class="btn xs ghost" data-act="revoke" data-id="${u.id}" type="button">Remove premium</button>` : ''}<button class="btn xs danger" data-act="deluser" data-id="${u.id}" type="button">Delete</button></div></td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty"><p>No members yet. They appear here after they register.</p></div>'}
<p class="hint">Premium switches off by itself when the date shown passes. Nothing to do on your side.</p>`;
      const q = $('#q'); q.addEventListener('input', debounce(() => { S.q = q.value; render().then(() => { const n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 300));
    },

    async payments(v) {
      const d = await api('/api/admin/payments'); S.badge = d.payments.filter((p) => p.status === 'pending').length;
      v.innerHTML = `<h1>Payments</h1>${d.payments.length ? `<div class="tbl-wrap"><table><thead><tr><th>When</th><th>Member</th><th>Payment note</th><th>Status</th><th></th></tr></thead><tbody>${d.payments.map((p) => `<tr><td>${fmtDateTime(p.created_at)}</td><td><strong>${esc(p.name)}</strong><br><span class="muted">${esc(p.email)}</span></td><td>${esc(p.note)}</td><td>${pill(p.status === 'approved' ? 'won' : p.status === 'rejected' ? 'lost' : 'pending').replace(/>(\w+)</, `>${esc(p.status)}<`)}</td>
<td>${p.status === 'pending' ? `<div class="row-actions"><button class="btn xs" data-act="approve" data-id="${p.id}" type="button">Approve and activate</button><button class="btn xs danger" data-act="reject" data-id="${p.id}" type="button">Reject</button></div>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><p>No payment notices yet. When a member taps "I\'ve paid", it shows up here.</p></div>'}
<p class="hint">Check the money in your account first, then approve. Approving gives the member ${S.settings.premium_days || 7} days of premium.</p>`;
      updateBadge();
    },

    async leagues(v) {
      const d = await api('/api/admin/leagues'); S.leagues = d.leagues;
      v.innerHTML = `<h1>Leagues</h1><div class="card"><h2>Add a league</h2><form class="a-form" data-form="league"><div><label for="ln">League name</label><input id="ln" name="name" required maxlength="60"></div><div><label for="lc">Country or region</label><input id="lc" name="country" maxlength="40"></div><div><button class="btn" type="submit">Add league</button></div></form></div>
<div class="tbl-wrap"><table><thead><tr><th>League</th><th>Country</th><th>Status</th><th></th></tr></thead><tbody>${d.leagues.map((l) => `<tr><td><strong>${esc(l.name)}</strong></td><td>${esc(l.country)}</td><td>${l.active ? '<span class="pill on">Visible</span>' : '<span class="pill off">Hidden</span>'}</td><td><div class="row-actions"><button class="btn xs ghost" data-act="toggle-league" data-id="${l.id}" type="button">${l.active ? 'Hide' : 'Show'}</button><button class="btn xs danger" data-act="del-league" data-id="${l.id}" type="button">Delete</button></div></td></tr>`).join('')}</tbody></table></div>
<p class="hint">Every visible league appears in the Games dropdown, gets its own page on the site, and is added to the sitemap.</p>`;
    },

    async settings(v) {
      const { settings: s } = await api('/api/admin/settings'); S.settings = s;
      v.innerHTML = `<h1>Settings</h1><form class="card" data-form="settings"><div class="a-form">
<div><label for="s1">Site name</label><input id="s1" name="site_name" value="${esc(s.site_name)}" maxlength="40"></div>
<div><label for="s2">Premium price</label><input id="s2" name="price" type="number" step="0.01" min="0.5" value="${esc(s.price)}"></div>
<div><label for="s3">Currency</label><input id="s3" name="currency" value="${esc(s.currency)}" maxlength="8"></div>
<div><label for="s4">Premium length (days)</label><input id="s4" name="premium_days" type="number" min="1" max="366" value="${esc(s.premium_days)}"></div>
<div><label for="s5">Max 2 Odds picks per day</label><input id="s5" name="premium_max_per_day" type="number" min="1" max="20" value="${esc(s.premium_max_per_day)}"></div>
<div><label for="s6">Time zone</label><input id="s6" name="timezone" value="${esc(s.timezone)}" placeholder="Africa/Lagos"></div>
<div class="span2"><label for="s7">Support link (WhatsApp, Telegram...)</label><input id="s7" name="contact_link" value="${esc(s.contact_link)}" placeholder="https://wa.me/234..."></div>
<div><label for="s8">Support button text</label><input id="s8" name="contact_label" value="${esc(s.contact_label)}" maxlength="40"></div>
<div class="wide"><label for="s9">Payment instructions (shown to logged-in members on the premium page)</label><textarea id="s9" name="payment_instructions" rows="6" maxlength="1500">${esc(s.payment_instructions)}</textarea></div>
<div class="wide actions"><button class="btn" type="submit">Save settings</button></div></div></form>
<form class="card" data-form="password" autocomplete="off"><h2>Change your password</h2><div class="a-form">
<div><label for="pw1">Current password</label><input id="pw1" name="current" type="password" autocomplete="current-password" required></div>
<div><label for="pw2">New password (8+ characters)</label><input id="pw2" name="next" type="password" minlength="8" autocomplete="new-password" required></div>
<div class="actions"><button class="btn" type="submit">Change password</button></div></div><p class="hint">You stay signed in here and are signed out everywhere else.</p></form>`;
    },
  };

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ---------- events ---------- */
  app.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab],[data-act],[data-go]'); if (!t) return;
    if (t.dataset.tab) { S.tab = t.dataset.tab; S.editing = null; return render(); }
    if (t.dataset.go) { S.tab = t.dataset.go; S.editing = null; return render(); }
    const a = t.dataset.act, id = t.dataset.id;
    if (a === 'logout') { await fetch(apiUrl('/api/logout'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: '{}' }); return showLogin(); }
    if (a === 'when') { S.when = t.dataset.v; return render(); }
    if (a === 'edit') { S.editing = lastRows.find((m) => m.id == id); await render(); $('#formCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (a === 'fx-sync') { t.disabled = true; await act(() => api('/api/admin/sync', 'POST'), (r) => `Synced ${r.fixtures} fixtures`); return loadFixtures(); }
    if (a === 'fx-use') {
      const f = (S.fx || []).find((x) => x.id == id), form = $('form[data-form=match]'); if (!f || !form) return;
      form.fixture_id.value = f.id; form.league_id.value = f.league_id || ''; form.match_date.value = f.match_date; form.kickoff.value = f.kickoff; form.home.value = f.home; form.away.value = f.away;
      $('#formCard').scrollIntoView({ behavior: 'smooth', block: 'start' }); form.tip.focus(); toast('Fixture filled in. Choose the tip and odds.'); return;
    }
    if (a === 'cancel-edit') { S.editing = null; return render(); }
    if (a === 'res') { if (await act(() => api(`/api/admin/matches/${id}/result`, 'POST', { status: t.dataset.v }), 'Result saved')) render(); return; }
    if (a === 'del') { if (confirm('Delete this game? This cannot be undone.') && await act(() => api('/api/admin/matches/' + id, 'DELETE'), 'Game deleted')) render(); return; }
    if (a === 'grant') { if (await act(() => api(`/api/admin/users/${id}/premium`, 'POST', { days: Number(t.dataset.days) }), (r) => 'Premium until ' + fmtDateTime(r.premium_until))) render(); return; }
    if (a === 'revoke') { if (confirm('Remove premium from this member now?') && await act(() => api(`/api/admin/users/${id}/revoke`, 'POST'), 'Premium removed')) render(); return; }
    if (a === 'deluser') { if (confirm('Delete this member and their payment history?') && await act(() => api('/api/admin/users/' + id, 'DELETE'), 'Member deleted')) render(); return; }
    if (a === 'approve') { if (await act(() => api(`/api/admin/payments/${id}/approve`, 'POST'), (r) => `Approved. Premium active for ${r.days} days.`)) render(); return; }
    if (a === 'reject') { if (await act(() => api(`/api/admin/payments/${id}/reject`, 'POST'), 'Payment rejected')) render(); return; }
    if (a === 'toggle-league') { if (await act(() => api(`/api/admin/leagues/${id}/toggle`, 'POST'))) render(); return; }
    if (a === 'del-league') { if (confirm('Delete this league?') && await act(() => api('/api/admin/leagues/' + id, 'DELETE'), 'League deleted')) render(); return; }
  });
  app.addEventListener('change', (e) => {
    if (e.target.matches('[data-act=cat]')) { S.cat = e.target.value; render(); }
    if (e.target.id === 'fxDate') loadFixtures();
    if (e.target.id === 'f-tip') $('#customWrap').hidden = e.target.value !== '__custom';
  });
  app.addEventListener('input', debounce((e) => { if (e.target.id === 'fxQ') loadFixtures(); }, 300));
  app.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-form]'); if (!f) return;
    e.preventDefault();
    const body = Object.fromEntries(new FormData(f)), kind = f.dataset.form;
    if (kind === 'match') {
      const id = body.id; delete body.id;
      const ok = await act(() => (id ? api('/api/admin/matches/' + id, 'PUT', body) : api('/api/admin/matches', 'POST', body)), (r) => (id ? 'Changes saved' : 'Game added') + (r.status && r.status !== 'pending' ? ` (marked ${r.status})` : ''));
      if (ok) { if (S.tab === 'games') { const t = S.today, d = body.match_date; S.when = d === t ? 'today' : d === new Date(new Date(t + 'T12:00:00Z').getTime() + 864e5).toISOString().slice(0, 10) ? 'tomorrow' : d > t ? 'upcoming' : 'past'; } const keep = { league_id: Number(body.league_id), match_date: body.match_date, category: body.category }; S.editing = id ? null : null; S.keep = keep; await render(); if (!id) { const nf = $('form[data-form=match]'); if (nf) { nf.league_id.value = keep.league_id; nf.match_date.value = keep.match_date; nf.category.value = keep.category; } } }
    } else if (kind === 'league') { if (await act(() => api('/api/admin/leagues', 'POST', body), 'League added')) render(); }
    else if (kind === 'password') { if (await act(() => api('/api/account/password', 'POST', body), 'Password changed')) f.reset(); }
    else if (kind === 'settings') { if (await act(() => api('/api/admin/settings', 'PUT', body), 'Settings saved')) { S.settings = { ...S.settings, ...body }; } }
  });

  /* ---------- boot ---------- */
  async function boot() {
    try {
      const me = await fetch(apiUrl('/api/me'), { credentials: 'include' }).then((r) => r.json());
      if (me.role !== 'admin') return showLogin();
      const [l, s, o] = await Promise.all([api('/api/admin/leagues'), api('/api/admin/settings'), api('/api/admin/overview')]);
      S.leagues = l.leagues; S.tips = l.tips; S.settings = s.settings; S.today = o.today; S.badge = o.pendingPayments;
      render();
    } catch (e) { showLogin(); }
  }
  boot();
})();
