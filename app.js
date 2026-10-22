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
      if (/\/premium\.html$/.test(location.pathname)) { location.replace('premium-member.html'); return; }
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
    const fmtDT = (t) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const steps = (active) => `<ol class="steps">${['Pay', 'Send notice', 'Admin approves', 'Picks unlock'].map((l, i) => `<li class="${i < active ? 'done' : i === active ? 'now' : ''}"><i>${i < active ? '✓' : i + 1}</i><span>${l}</span></li>`).join('')}</ol>`;
    async function renderMembership(host, me) {
      let m;
      try { m = await api('/api/membership', 'GET'); }
      catch { host.innerHTML = '<p class="form-msg" role="alert">Membership details are temporarily unavailable. Please refresh the page.</p>'; return; }
      const p = m.payment;
      const price = `${Number(m.price).toLocaleString('en-US')} ${esc(m.currency)}`;
      const contact = /^https:\/\//i.test(m.contact_link || '') ? `<a class="btn ghost" href="${esc(m.contact_link)}" target="_blank" rel="noopener">${esc(m.contact_label || 'Contact support')}</a>` : '';
      if (p && p.status === 'pending') {
        host.innerHTML = `<div class="mship"><div class="mship-hero is-pending"><span class="chip live"><b></b>Pending approval</span><h2>We have your payment notice</h2><p>An admin is checking it now. Your premium picks unlock automatically as soon as it is approved. You can leave this page and come back.</p>${steps(2)}</div>
<div class="mship-card"><h3>What you sent</h3><dl class="kv"><div><dt>Sent</dt><dd>${esc(fmtDT(p.created_at))}</dd></div><div><dt>Details</dt><dd>${esc(p.note)}</dd></div><div><dt>Plan</dt><dd>${price} for ${Number(m.days)} days</dd></div></dl><div class="cta-row"><button class="btn" type="button" data-refresh>Check status</button>${contact}</div></div></div>`;
        host.querySelector('[data-refresh]').addEventListener('click', (e) => { e.currentTarget.disabled = true; e.currentTarget.textContent = 'Checking…'; loadPremium(); });
        return;
      }
      const expired = me.premium_until && me.premium_until < Date.now();
      const banner = p && p.status === 'rejected'
        ? '<div class="mship-note warn"><strong>Your last payment notice could not be confirmed.</strong> Check the reference and amount below, then send it again, or contact support.</div>'
        : expired ? `<div class="mship-note warn"><strong>Your premium ended on ${esc(new Date(me.premium_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}.</strong> Renew below to keep receiving the daily slip.</div>` : '';
      host.innerHTML = `<div class="mship"><div class="mship-hero"><span class="chip">Premium</span><h2>Unlock 2 Odds daily</h2><p>Two selections every day. Pay once, send us the details, and your access starts when an admin confirms it.</p><div class="price"><b>${price}</b><span>for ${Number(m.days)} days</span></div>${steps(0)}</div>
${banner}
<div class="mship-grid">
<section class="mship-card"><span class="num">1</span><h3>Make your payment</h3><p class="muted">Send <strong>${price}</strong> using the details below.</p><div class="pay-box"><pre>${esc(m.instructions)}</pre><button class="btn ghost sm" type="button" data-copy>Copy details</button></div></section>
<section class="mship-card"><span class="num">2</span><h3>Tell us you have paid</h3><form class="mform" novalidate>
<label>Payment reference<input name="ref" maxlength="70" required placeholder="Transaction ID, receipt number or last 4 digits"></label>
<label>Name you paid with<input name="payer" maxlength="60" required placeholder="Name on the account or wallet"></label>
<label><span>Amount sent <em>(optional)</em></span><input name="amount" maxlength="20" inputmode="decimal" placeholder="${Number(m.price)} ${esc(m.currency)}"></label>
<label class="check"><input type="checkbox" name="ok" required> <span>I have completed the payment above.</span></label>
<p class="form-msg" hidden role="alert"></p>
<button class="btn lg" type="submit">I have made payment</button>
<p class="fine">After you send this, your account shows <strong>Pending approval</strong> until an admin confirms. ${contact ? 'Need to send a receipt screenshot? Use the support button below.' : ''}</p>${contact ? `<div class="cta-row">${contact}</div>` : ''}</form></section>
</div></div>`;
      host.querySelector('[data-copy]').addEventListener('click', async (e) => { try { await navigator.clipboard.writeText(m.instructions); e.currentTarget.textContent = 'Copied ✓'; } catch { toast('Select the text and copy it manually.'); } });
      const f = host.querySelector('.mform'), msg = f.querySelector('.form-msg');
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); msg.hidden = true;
        if (!f.checkValidity()) { f.reportValidity(); return; }
        const d = Object.fromEntries(new FormData(f));
        const note = `Ref: ${d.ref.trim()} | Paid by: ${d.payer.trim()}${d.amount.trim() ? ' | Amount: ' + d.amount.trim() : ''}`.slice(0, 200);
        const b = f.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Sending…';
        try { const out = await api('/api/payments', 'POST', { note }); toast(out.message || 'Payment notice sent.'); loadPremium(); }
        catch (err) { msg.textContent = err.message; msg.hidden = false; b.disabled = false; b.textContent = 'I have made payment'; }
      });
    }
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
        if (!me.isPremium) { if (picksHost) await renderMembership(picksHost, me); return; }
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
