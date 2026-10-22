(() => {
  const API_BASE = 'https://zurepick-game.onrender.com';
  const apiUrl = (url) => /^https?:\/\//i.test(url) ? url : API_BASE + url;
  const frontendRedirect = (url) => ({ '/premium': 'premium-member.html', '/admin': 'admin.html', '/login': 'login.html', '/register': 'register.html', '/': 'index.html' }[url] || url || 'index.html');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const toast = (msg) => { const t = $('#toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200); };

  async function api(url, method, body) {
    const r = await fetch(apiUrl(url), { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body || {}), credentials: 'include' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  // mobile menu
  const mb = $('[data-menu]');
  if (mb) mb.addEventListener('click', () => { const o = mb.getAttribute('aria-expanded') === 'true'; mb.setAttribute('aria-expanded', String(!o)); $('#nav').classList.toggle('open', !o); });

  // logout
  $$('[data-logout]').forEach((b) => b.addEventListener('click', async () => { try { await api('/api/logout', 'POST'); } finally { location.href = 'index.html'; } }));

  // forms
  $$('form[data-api]').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('.form-msg', f), btn = $('button[type=submit]', f);
    if (msg) msg.hidden = true;
    if (!f.checkValidity()) { f.reportValidity(); return; }
    const body = Object.fromEntries(new FormData(f));
    if (f.dataset.next) body.next = f.dataset.next;
    const label = btn.textContent; btn.disabled = true; btn.textContent = 'Please wait...';
    try {
      const out = await api(f.dataset.api, f.dataset.method || 'POST', body);
      if (out.message) toast(out.message);
      if (out.redirect) location.href = frontendRedirect(out.redirect); else if (out.reload) setTimeout(() => location.reload(), 600);
    } catch (err) {
      if (msg) { msg.textContent = err.message; msg.hidden = false; } else toast(err.message);
      btn.disabled = false; btn.textContent = label;
    }
  }));

  // tabs (progressive enhancement: links work without JS)
  const tabs = $$('.tab[data-tab]');
  tabs.forEach((t) => t.addEventListener('click', (e) => {
    e.preventDefault();
    tabs.forEach((x) => { const on = x === t; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
    $$('.panel').forEach((p) => { p.hidden = p.id !== 'panel-' + t.dataset.tab; });
    try { history.replaceState(null, '', '/?tab=' + t.dataset.tab + '#tips'); } catch {}
    applyFilter();
  }));

  // league filter
  const sel = $('#leagueFilter');
  function applyFilter() {
    if (!sel) return;
    const v = sel.value, panel = $$('.panel').find((p) => !p.hidden);
    if (!panel) return;
    let shown = 0;
    $$('.match', panel).forEach((m) => { const ok = !v || m.dataset.league === v; m.hidden = !ok; if (ok) shown++; });
    $$('.day', panel).forEach((d) => { d.hidden = !$$('.match', d).some((m) => !m.hidden); });
    const none = $('.no-match'); if (none) none.hidden = !(v && shown === 0 && $$('.match', panel).length > 0);
  }
  if (sel) sel.addEventListener('change', applyFilter);

  // The member bar is filled from the authenticated backend session, not mock HTML.
  const authNav = $('[data-auth-nav]');
  if (authNav) {
    const escNav = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    fetch(apiUrl('/api/me'), { credentials: 'include' }).then((r) => r.json()).then((me) => {
      if (!me || me.guest) return;
      authNav.innerHTML = `<span class="who" title="${escNav(me.email)}">${escNav(me.name || me.email)}</span><button class="btn ghost sm" type="button" data-logout>Log out</button>`;
      const logout = authNav.querySelector('[data-logout]');
      logout?.addEventListener('click', async () => { try { await api('/api/logout', 'POST'); } finally { location.href = 'index.html'; } });
    }).catch(() => {});
  }

  // Premium member content is never embedded in this static HTML. The backend
  // returns the picks only after checking the authenticated member's premium status.
  const premiumRoot = $('[data-premium-content]');
  if (premiumRoot) {
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const dateLabel = (iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
    const fmtRecordDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const statusLabel = (v) => ({ won: 'Won', lost: 'Lost', void: 'Void', pending: 'Pending', postponed: 'Postponed', none: 'No slip' }[v] || 'Pending');
    const statusClass = (v) => ({ won: 'won', lost: 'lost', void: 'void', pending: 'pending', postponed: 'pending', none: 'pending' }[v] || 'pending');
    const renderRecord = (record) => {
      const days = Array.isArray(record.days) ? record.days : [];
      const tiles = days.map((d) => `<li class="tile t-${esc(statusClass(d.result))}${d.isToday ? ' is-today' : ''}"><span class="t-day">${d.isToday ? 'Today' : esc(new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',timeZone:'UTC'}))}</span><span class="t-date">${esc(fmtRecordDate(d.date))}</span><span class="t-mark" aria-hidden="true">${d.result === 'won' ? 'W' : d.result === 'lost' ? 'L' : d.result === 'void' ? 'V' : '·'}</span><span class="t-odds">${d.odds ? esc(d.odds) : '—'}</span><span class="sr">${esc(dateLabel(d.date))}: ${esc(statusLabel(d.result))}${d.odds ? ', odds ' + esc(d.odds) : ''}</span></li>`).join('');
      const streak = record.run || 0;
      return `<div class="record"><div class="record-head"><h2>2 Odds, last 7 days</h2></div><ol class="tiles">${tiles}</ol><p class="record-sum"><strong>${Number(record.wins)||0} of ${Number(record.settled)||0}</strong> settled slips won, <strong>${streak}-day</strong> winning run.</p></div>`;
    };
    const renderMatch = (m) => `<article class="match is-premium" data-league="${esc(m.league_id)}"><div class="m-time">${esc(m.kickoff || '')}</div><div class="m-main"><div class="m-teams"><span>${esc(m.home)}</span><span>${esc(m.away)}</span></div></div><span class="m-league">${esc(m.league || 'Football')}</span><div class="m-tip"><span class="tip">${esc(m.tip)}</span></div><div class="m-odds">${m.odds == null ? '—' : esc(m.odds)}</div><div class="m-res"><span class="res res-${esc(statusClass(m.status))}" title="${esc(statusLabel(m.status))}"><b>${m.status === 'won' ? 'W' : m.status === 'lost' ? 'L' : m.status === 'void' ? 'V' : '·'}</b><span>${esc(statusLabel(m.status))}</span></span></div></article>`;
    const loadPremium = async () => {
      const recordHost = $('[data-premium-record]');
      const picksHost = $('[data-premium-picks]');
      if (recordHost) recordHost.innerHTML = '<p class="muted">Loading recent record…</p>';
      if (picksHost) picksHost.innerHTML = '<p class="muted">Checking membership…</p>';
      try {
        const recordRes = await fetch(apiUrl('/api/premium-record'), { credentials: 'include' });
        const recordData = await recordRes.json();
        if (recordRes.ok && recordHost) recordHost.innerHTML = renderRecord(recordData.record || {});
      } catch { if (recordHost) recordHost.innerHTML = '<p class="muted">The recent record is temporarily unavailable.</p>'; }
      try {
        const meRes = await fetch(apiUrl('/api/me'), { credentials: 'include' });
        const me = await meRes.json();
        if (!me || me.guest) {
          if (picksHost) picksHost.innerHTML = '<div class="member-bar"><div><strong>Log in to continue</strong><span>Your account is required to check premium access.</span></div><a class="btn" href="login.html?next=%2Fpremium">Log in</a></div>';
          return;
        }
        if (!me.isPremium) {
          if (picksHost) picksHost.innerHTML = '<div class="member-bar"><div><strong>Premium access is not active</strong><span>Free members can view the public record. Premium selections appear here after the admin approves your membership.</span></div><a class="btn" href="premium.html">Membership details</a></div>';
          return;
        }
        const picksRes = await fetch(apiUrl('/api/premium'), { credentials: 'include' });
        const picksData = await picksRes.json();
        if (!picksRes.ok) throw new Error(picksData.error || 'Could not load premium selections.');
        const matches = Array.isArray(picksData.matches) ? picksData.matches : [];
        const groups = new Map();
        for (const m of matches) { if (!groups.has(m.match_date)) groups.set(m.match_date, []); groups.get(m.match_date).push(m); }
        const sections = [...groups.entries()].map(([date, rows]) => `<section class="day"><h3 class="day-h">${esc(dateLabel(date))}</h3>${rows.map(renderMatch).join('')}</section>`).join('');
        const expiry = me.premium_until ? new Date(me.premium_until).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        if (picksHost) picksHost.innerHTML = `<div class="member-bar"><div><strong>Premium is active</strong><span>${expiry ? 'Ends ' + esc(expiry) : 'Your premium access is active.'}</span></div></div>${sections || '<p class="muted">No premium selections have been published yet. Please check back later.</p>'}`;
      } catch (err) {
        if (picksHost) picksHost.innerHTML = `<p class="form-msg" role="alert">${esc(err.message || 'Premium selections are temporarily unavailable.')}</p>`;
      }
    };
    loadPremium();
  }
})();
