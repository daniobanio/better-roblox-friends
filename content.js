/* Better Roblox Friends – content script */
(() => {
  'use strict';
  if (window.__brfLoaded) return;
  window.__brfLoaded = true;

  const CSS = window.BRF_CSS || '';

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = (d, size = 18, extra = '') =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
  const I = {
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 16),
    star: svg('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', 17),
    bell: svg('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
    bellOff: svg('<path d="M6 8a6 6 0 0 1 9-5.2M18 8c0 3 .6 5 1.4 6.4M3 16s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0M3 3l18 18"/>'),
    play: svg('<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>', 14),
    left: svg('<path d="M15 5l-7 7 7 7"/>', 16),
    right: svg('<path d="M9 5l7 7-7 7"/>', 16),
    users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.8"/><path d="M17 14c3 0 4.8 2 4.8 5"/>', 40),
    verified: svg('<path d="M12 2l2.4 2 3.1-.3.9 3 2.7 1.6-1 3 1 3-2.7 1.6-.9 3-3.1-.3L12 22l-2.4-2-3.1.3-.9-3L2.9 15.7l1-3-1-3 2.7-1.6.9-3 3.1.3z" fill="currentColor" stroke="none"/><path d="M8.5 12l2.5 2.5 4.5-5" stroke="#fff" stroke-width="2.2"/>', 14, 'class="verified"'),
  };

  const timeAgo = (ms) => {
    if (!ms) return 'a while ago';
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    const mo = Math.floor(d / 30);
    return mo < 12 ? `${mo}mo ago` : 'over a year ago';
  };
  const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

  const store = {
    async get(keys) { try { return await chrome.storage.sync.get(keys); } catch { return {}; } },
    async set(obj) { try { await chrome.storage.sync.set(obj); } catch { /* ignore */ } },
    async getLocal(keys) { try { return await chrome.storage.local.get(keys); } catch { return {}; } },
    async setLocal(obj) { try { await chrome.storage.local.set(obj); } catch { /* ignore */ } },
  };

  /* ------------------------------------------------------------------ */
  /* data: the background worker owns tracking; engine.js is the fallback */
  /* ------------------------------------------------------------------ */
  const metaUserId = () => {
    const m = document.querySelector('meta[name="user-data"]');
    return m ? Number(m.dataset.userid) || null : null;
  };

  const send = (msg) => new Promise((resolve) => {
    try { chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; resolve(r); }); } catch { resolve(null); }
  });

  /* ------------------------------------------------------------------ */
  /* state                                                               */
  /* ------------------------------------------------------------------ */
  const S = {
    me: null,
    friends: [],
    requests: [],
    filter: 'all',   // all | game | online | offline | favs | requests
    sort: 'status',  // status | name | recent
    query: '',
    favs: new Set(),
    notify: true,
    loading: true,
    error: null,
    updatedAt: 0,
    open: false,
    busy: new Set(), // request ids being processed
  };
  let refreshing = false;
  let prevState = null; // Map id -> state key for in-page toasts

  const STATE_RANK = { game: 0, studio: 1, online: 2, offline: 3 };

  function applySnapshot(snap) {
    const friends = snap.friends || [];
    if (prevState && S.notify) {
      for (const f of friends) {
        if (!S.favs.has(f.id)) continue;
        const before = prevState.get(f.id);
        if (before === f.state || before === undefined) continue;
        if (f.state === 'game' && f.game) toast(f, `is now playing <b>${esc(f.game.name || 'an experience')}</b>`, true);
        else if (f.state === 'online' && before === 'offline') toast(f, 'just came online', false);
      }
    }
    prevState = new Map(friends.map((f) => [f.id, f.state]));
    S.friends = friends;
    S.requests = snap.requests || [];
    S.me = snap.me || S.me;
    S.updatedAt = snap.updatedAt || S.updatedAt;
    S.error = snap.error && !friends.length ? snap.error : null;
  }

  async function refresh({ force = false } = {}) {
    if (refreshing) return;
    refreshing = true;
    setSpin(true);
    let snap = null;
    const r = await send({ type: 'snapshot', maxAge: force ? 0 : 15000, force });
    if (r && r.ok && r.snapshot && !(r.snapshot.error && !r.snapshot.friends.length)) snap = r.snapshot;
    if (!snap && window.BRFEngine) {
      // background worker unavailable or failed: fetch directly from the page
      const out = await BRFEngine.refresh({ force, me: metaUserId() });
      snap = out.snapshot;
    }
    if (snap) applySnapshot(snap); else if (!S.friends.length) S.error = 'network';
    S.loading = false;
    refreshing = false;
    setSpin(false);
    renderAll();
  }

  async function respondRequest(id, accept) {
    S.busy.add(id); renderList();
    let r = await send({ type: 'respond', id, accept });
    if (!(r && r.ok) && window.BRFEngine) { try { await BRFEngine.respond(id, accept); r = { ok: true }; } catch { r = null; } }
    S.busy.delete(id);
    if (r && r.ok) { S.requests = S.requests.filter((x) => x.id !== id); if (accept) refresh({ force: true }); }
    renderAll();
  }

  /* ------------------------------------------------------------------ */
  /* derived data                                                        */
  /* ------------------------------------------------------------------ */
  function sortFriends(list, mode, pinFavs = true) {
    const byName = (a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
    const fav = (a, b) => (S.favs.has(b.id) ? 1 : 0) - (S.favs.has(a.id) ? 1 : 0);
    return [...list].sort((a, b) => {
      const f = pinFavs ? fav(a, b) : 0; if (f) return f;
      if (mode === 'name') return byName(a, b);
      if (mode === 'recent') {
        const ao = a.state !== 'offline' ? Infinity : a.lastOnline;
        const bo = b.state !== 'offline' ? Infinity : b.lastOnline;
        return bo - ao || byName(a, b);
      }
      const r = STATE_RANK[a.state] - STATE_RANK[b.state];
      if (r) return r;
      if (a.state === 'offline') return b.lastOnline - a.lastOnline || byName(a, b);
      return byName(a, b);
    });
  }

  function counts() {
    const c = { all: S.friends.length, game: 0, online: 0, offline: 0, favs: 0 };
    for (const f of S.friends) {
      if (f.state === 'game') c.game++;
      if (f.state !== 'offline') c.online++; else c.offline++;
      if (S.favs.has(f.id)) c.favs++;
    }
    return c;
  }

  function visibleFriends() {
    let list = S.friends;
    const q = S.query.trim().toLowerCase();
    if (q) list = list.filter((f) => f.displayName.toLowerCase().includes(q) || f.name.toLowerCase().includes(q) || (f.game?.name || '').toLowerCase().includes(q));
    if (S.filter === 'game') list = list.filter((f) => f.state === 'game');
    else if (S.filter === 'online') list = list.filter((f) => f.state !== 'offline');
    else if (S.filter === 'offline') list = list.filter((f) => f.state === 'offline');
    else if (S.filter === 'favs') list = list.filter((f) => S.favs.has(f.id));
    return sortFriends(list, S.sort);
  }

  const profileUrl = (id) => `/users/${id}/profile`;
  const gameUrl = (g) => (g && (g.rootPlaceId || g.placeId) ? `/games/${g.rootPlaceId || g.placeId}` : null);
  function joinInfo(f) {
    if (f.state !== 'game' || !f.game) return null;
    const g = f.game;
    if (g.placeId && g.gameId) return { href: `roblox://experiences/start?placeId=${g.placeId}&gameInstanceId=${g.gameId}`, label: 'Join', join: true };
    const u = gameUrl(g);
    return u ? { href: u, label: 'View', join: false } : null;
  }

  /* ------------------------------------------------------------------ */
  /* markup                                                              */
  /* ------------------------------------------------------------------ */
  const avatarHtml = (f, cls = '') =>
    `<a class="avatar s-${f.state || 'offline'} ${cls}" href="${profileUrl(f.id)}" aria-label="${esc(f.displayName)}">${f.avatar ? `<img src="${esc(f.avatar)}" alt="" loading="lazy">` : ''}${f.state ? '<span class="dot"></span>' : ''}</a>`;

  const statusLine = (f) => {
    if (f.state === 'game') {
      const g = f.game; const u = gameUrl(g);
      const label = g.name ? `Playing ${esc(g.name)}` : 'In an experience';
      return `<div class="status s-game">${g.icon ? `<img class="gicon" src="${esc(g.icon)}" alt="">` : ''}${u ? `<a class="txt marq" href="${u}" title="${esc(g.name)}"><span class="marq-in">${label}</span></a>` : `<span class="txt marq"><span class="marq-in">${label}</span></span>`}</div>`;
    }
    if (f.state === 'studio') return `<div class="status s-studio"><span class="txt">${f.game?.name ? `Creating ${esc(f.game.name)}` : 'In Roblox Studio'}</span></div>`;
    if (f.state === 'online') return '<div class="status s-online"><span class="txt">Online</span></div>';
    const lg = f.lastGame;
    return `<div class="status s-offline"><span class="txt marq"><span class="marq-in">${f.lastOnline ? `Last online ${timeAgo(f.lastOnline)}` : 'Offline'}</span></span></div>` +
      (lg && lg.name ? `<div class="status s-offline played">${lg.icon ? `<img class="gicon sm" src="${esc(lg.icon)}" alt="">` : ''}<span class="txt marq" title="${esc(lg.name)}"><span class="marq-in">Last played ${esc(lg.name)}</span></span></div>` : '');
  };

  const starBtn = (f) => `<button class="star ${S.favs.has(f.id) ? 'on' : ''}" data-act="fav" data-id="${f.id}" title="${S.favs.has(f.id) ? 'Remove from favorites' : 'Add to favorites'}">${I.star}</button>`;

  function joinBtn(f, compact) {
    const j = joinInfo(f);
    if (!j) return '';
    return `<a class="btn-join ${j.join ? '' : 'ghost'}" ${j.join ? 'data-join="1"' : ''} href="${esc(j.href)}">${j.join ? I.play : ''}${j.label}</a>`;
  }

  function rowHtml(f) {
    return `<div class="row s-${f.state}">
      ${avatarHtml(f)}
      <div class="mid">
        <div class="name"><a href="${profileUrl(f.id)}">${esc(f.displayName)}</a>${f.verified ? I.verified : ''}${f.name ? `<small>@${esc(f.name)}</small>` : ''}</div>
        ${statusLine(f)}
      </div>
      <div class="acts">${starBtn(f)}${joinBtn(f)}</div>
    </div>`;
  }

  function requestRowHtml(r) {
    const busy = S.busy.has(r.id);
    const shown = r.displayName || r.name || 'Roblox user';
    return `<div class="row">
      ${avatarHtml({ ...r, state: null })}
      <div class="mid">
        <div class="name"><a href="${profileUrl(r.id)}">${esc(shown)}</a>${r.verified ? I.verified : ''}</div>
        <div class="status"><span class="txt">${r.name ? `@${esc(r.name)} · ` : ''}wants to be friends</span></div>
      </div>
      <div class="acts">
        <button class="btn-ghost pri" data-act="accept" data-id="${r.id}" ${busy ? 'disabled' : ''}>Accept</button>
        <button class="btn-ghost" data-act="decline" data-id="${r.id}" ${busy ? 'disabled' : ''}>Decline</button>
      </div>
    </div>`;
  }

  const SECTION = {
    fav: ['Favorites', 'game'],
    game: ['In experience', 'game'],
    studio: ['In Studio', 'studio'],
    online: ['Online', 'online'],
    offline: ['Offline', 'offline'],
  };

  function listHtml() {
    if (S.loading && !S.friends.length) {
      return Array.from({ length: 7 }, () => '<div class="row"><div class="avatar sk" style="width:52px;height:52px"></div><div class="mid"><div class="sk" style="height:14px;width:55%"></div><div class="sk" style="height:12px;width:35%;margin-top:6px"></div></div></div>').join('');
    }
    if (S.error && !S.friends.length) {
      return S.error === 'auth'
        ? `<div class="msg">${I.users}<h3>Log in to see your friends</h3>Sign in to Roblox and your friends will show up here.</div>`
        : `<div class="msg">${I.users}<h3>Couldn't load friends</h3>Roblox didn't respond. Check your connection and try again.<br><button class="btn-join" data-act="refresh">Retry</button></div>`;
    }
    if (S.filter === 'requests') {
      return S.requests.length ? S.requests.map(requestRowHtml).join('') : `<div class="msg">${I.users}<h3>No pending requests</h3>Friend requests you receive will appear here.</div>`;
    }
    const list = visibleFriends();
    if (!list.length) {
      const why = S.query ? `Nothing matches “${esc(S.query)}”.` : S.filter === 'favs' ? 'Tap the star on a friend to pin them here.' : S.filter === 'game' ? 'None of your friends are in an experience right now.' : 'No friends to show.';
      return `<div class="msg">${I.users}<h3>No friends found</h3>${why}</div>`;
    }
    if (S.sort !== 'status') return list.map(rowHtml).join('');
    let out = ''; let last = '';
    const per = {};
    for (const f of list) { const k = S.favs.has(f.id) ? 'fav' : f.state; per[k] = (per[k] || 0) + 1; }
    for (const f of list) {
      const k = S.favs.has(f.id) ? 'fav' : f.state;
      if (k !== last) { last = k; out += `<div class="sec s-${SECTION[k][1]}"><i></i>${SECTION[k][0]} <span class="n">${per[k]}</span></div>`; }
      out += rowHtml(f);
    }
    return out;
  }

  function chipsHtml() {
    const c = counts();
    const chip = (v, label, n, alert) => `<button class="chip ${S.filter === v ? 'on' : ''}" data-act="filter" data-v="${v}">${label}${n !== undefined ? ` <span class="n ${alert ? 'alert' : ''}">${n}</span>` : ''}</button>`;
    return chip('all', 'All', c.all) + chip('game', 'In-game', c.game) + chip('online', 'Online', c.online) + chip('offline', 'Offline', c.offline) + chip('favs', '★ Favorites', c.favs) +
      chip('requests', 'Requests', S.requests.length || undefined, true);
  }

  /* ------------------------------------------------------------------ */
  /* home section                                                        */
  /* ------------------------------------------------------------------ */
  function cardHtml(f) {
    const j = joinInfo(f);
    let info;
    if (f.state === 'game') {
      const g = f.game; const u = gameUrl(g);
      info = `<a class="game" ${u ? `href="${u}"` : ''} title="${esc(g.name)}">${g.icon ? `<img class="gicon" src="${esc(g.icon)}" alt="">` : '<span class="gicon"></span>'}<span class="g-t"><span class="g-n">${esc(g.name || 'An experience')}</span><span class="g-l">Playing now</span></span></a>`;
    } else info = statusLine(f);
    const action = j ? `<a class="btn-join ${j.join ? '' : 'ghost'}" ${j.join ? 'data-join="1"' : ''} href="${esc(j.href)}">${j.join ? I.play : ''}${j.join ? 'Join' : 'View game'}</a>` : '';
    return `<div class="card s-${f.state} ${f.state === 'game' ? 'has-game' : ''}" data-href="${profileUrl(f.id)}">
      ${starBtn(f)}
      ${avatarHtml(f)}
      <a class="name" href="${profileUrl(f.id)}" title="${esc(f.displayName)}">${esc(f.displayName)}</a>
      <div class="info">${info}</div>
      ${action}
    </div>`;
  }

  function homeHtml() {
    const c = counts();
    const head = `<div class="home-head">
      <h2>Friends</h2>
      <div class="sum">
        ${c.game ? `<span class="s-game"><i></i><b>${c.game}</b> in-game</span>` : ''}
        <span class="s-online"><i></i><b>${c.online}</b> online</span>
        <span>${c.all} total</span>
      </div>
      <div class="spacer"></div>
      ${S.requests.length ? `<button class="pill-btn" data-act="open-requests">Requests <span class="n">${S.requests.length}</span></button>` : ''}
      <button class="pill-btn" data-act="open">${I.users.replace(/width="40" height="40"/, 'width="16" height="16"')} See all</button>
      <button class="arrow" data-act="scroll-l" aria-label="Scroll left">${I.left}</button>
      <button class="arrow" data-act="scroll-r" aria-label="Scroll right">${I.right}</button>
    </div>`;
    let body;
    if (S.loading && !S.friends.length) {
      body = `<div class="carousel">${Array.from({ length: 8 }, () => '<div class="card skel"><div class="avatar sk" style="width:84px;height:84px;margin-bottom:10px"></div><div class="sk" style="height:14px;width:70%;margin-bottom:8px"></div><div class="sk" style="height:12px;width:45%;margin-bottom:14px"></div><div class="sk" style="height:56px;width:100%;margin-bottom:10px"></div><div class="sk" style="height:34px;width:100%"></div></div>').join('')}</div>`;
    } else if (S.error && !S.friends.length) {
      body = S.error === 'auth' ? '<div class="empty">Log in to see your friends.</div>'
        : '<div class="empty">Couldn\'t load your friends right now.<br><button class="btn-join" data-act="refresh">Retry</button></div>';
    } else if (!S.friends.length) {
      body = '<div class="empty">No friends yet. Find people on Roblox and they\'ll show up here.</div>';
    } else {
      const list = sortFriends(S.friends, 'status', false).slice(0, 40);
      body = `<div class="carousel">${list.map(cardHtml).join('')}</div>`;
    }
    return `<div class="home">${head}${body}</div>`;
  }

  /* ------------------------------------------------------------------ */
  /* DOM: overlay (drawer + toasts) and home host                        */
  /* ------------------------------------------------------------------ */
  let overlayHost, overlay, homeHost, homeRoot, navItem;

  function mkRoot(host) {
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);
    return root;
  }

  function buildOverlay() {
    overlayHost = document.createElement('div');
    overlayHost.id = 'brf-overlay-host';
    overlay = mkRoot(overlayHost);
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="scrim" data-act="close"></div>
      <aside class="drawer" role="dialog" aria-label="Friends" aria-hidden="true">
        <div class="d-head">
          <h2>Friends</h2><span class="count"></span><span class="grow"></span>
          <button class="ibtn bell" data-act="notify" title="Notify me when favorites come online"></button>
          <button class="ibtn" data-act="refresh" title="Refresh">${I.refresh}</button>
          <button class="ibtn" data-act="close" title="Close (Esc)">${I.close}</button>
        </div>
        <div class="search">${I.search}<input type="search" placeholder="Search friends or games" aria-label="Search friends" autocomplete="off" spellcheck="false"></div>
        <div class="chips"></div>
        <div class="toolbar"><span class="summary"></span>
          <label>Sort: <select aria-label="Sort friends">
            <option value="status">Status</option><option value="recent">Last online</option><option value="name">Name</option>
          </select></label>
        </div>
        <div class="list"></div>
        <div class="d-foot"><span class="live"><i></i>Live</span><span class="upd"></span></div>
      </aside>
      <div class="toasts"></div>`;
    while (wrap.firstChild) overlay.appendChild(wrap.firstChild);
    document.body.appendChild(overlayHost);

    overlay.addEventListener('click', onClick);
    const input = overlay.querySelector('.search input');
    input.addEventListener('input', () => { S.query = input.value; renderList(); });
    const sel = overlay.querySelector('select');
    sel.value = S.sort;
    sel.addEventListener('change', () => { S.sort = sel.value; store.set({ brf_sort: S.sort }); renderList(); });
    updateBell();
  }

  const $o = (s) => overlay.querySelector(s);

  function onClick(e) {
    const join = e.target.closest('[data-join]');
    if (join) { const card = join.closest('.row, .card'); const nm = card?.querySelector('.name')?.textContent || 'friend'; toast(null, `Launching Roblox to join <b>${esc(nm.replace(/@.*/, '').trim())}</b>…`, false); return; }
    const el = e.target.closest('[data-act]');
    if (!el) {
      const card = e.target.closest('.card[data-href]');
      if (card && !e.target.closest('a, button')) location.href = card.dataset.href;
      return;
    }
    const act = el.dataset.act;
    const id = Number(el.dataset.id);
    switch (act) {
      case 'open': openDrawer(); break;
      case 'open-requests': S.filter = 'requests'; openDrawer(); break;
      case 'close': closeDrawer(); break;
      case 'refresh': refresh({ force: true }); break;
      case 'filter': S.filter = el.dataset.v; store.set({ brf_filter: S.filter }); renderAll(); break;
      case 'fav': e.preventDefault(); toggleFav(id); break;
      case 'accept': respondRequest(id, true); break;
      case 'decline': respondRequest(id, false); break;
      case 'notify': S.notify = !S.notify; store.set({ brf_notify: S.notify }); updateBell(); break;
      case 'scroll-l': case 'scroll-r': {
        const c = homeRoot.querySelector('.carousel');
        if (c) c.scrollBy({ left: (act === 'scroll-l' ? -1 : 1) * c.clientWidth * 0.8, behavior: 'smooth' });
        break;
      }
    }
  }

  function toggleFav(id) {
    if (S.favs.has(id)) S.favs.delete(id); else S.favs.add(id);
    store.set({ brf_favs: [...S.favs] });
    renderAll();
  }

  function updateBell() {
    const b = $o('.bell');
    if (!b) return;
    b.innerHTML = S.notify ? I.bell : I.bellOff;
    b.classList.toggle('on', S.notify);
    b.title = S.notify ? 'Favorite alerts on — click to mute' : 'Favorite alerts muted — click to enable';
  }

  function setSpin(on) { const b = overlay && overlay.querySelector('[data-act="refresh"].ibtn'); if (b) b.classList.toggle('spin', on); }

  function navBottom() {
    const h = document.querySelector('#header, .rbx-header, header.navbar-fixed-top');
    const r = h ? h.getBoundingClientRect() : null;
    return Math.max(0, Math.round(r ? r.bottom : 48));
  }

  function openDrawer() {
    if (!overlay) return;
    overlayHost.style.setProperty('--brf-top', navBottom() + 'px');
    applyTheme();
    S.open = true; renderNav();
    $o('.scrim').classList.add('open');
    const d = $o('.drawer'); d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
    renderAll();
    if (Date.now() - S.updatedAt > 15000) refresh();
    if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => $o('.search input').focus({ preventScroll: true }), 260);
  }
  function closeDrawer() {
    S.open = false; renderNav();
    $o('.scrim').classList.remove('open');
    const d = $o('.drawer'); d.classList.remove('open'); d.setAttribute('aria-hidden', 'true');
  }

  /* toasts */
  function toast(f, html, withJoin) {
    if (!overlay) return;
    const t = document.createElement('div');
    t.className = 'toast';
    const j = f && withJoin ? joinInfo(f) : null;
    t.innerHTML = `${f ? avatarHtml(f) : ''}<div class="t">${f ? `<b>${esc(f.displayName)}</b> ` : ''}${html}</div>${j && j.join ? `<a class="btn-join" data-join="1" href="${esc(j.href)}">${I.play}Join</a>` : ''}<button class="ibtn x" data-x aria-label="Dismiss">${I.close}</button>`;
    const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 220); };
    t.querySelector('[data-x]').addEventListener('click', kill);
    $o('.toasts').appendChild(t);
    setTimeout(kill, f ? 9000 : 3500);
  }

  /* ------------------------------------------------------------------ */
  /* rendering                                                           */
  /* ------------------------------------------------------------------ */
  function detectTheme() {
    const b = document.body;
    if (b.classList.contains('dark-theme')) return 'dark';
    if (b.classList.contains('light-theme')) return 'light';
    const m = getComputedStyle(b).backgroundColor.match(/[\d.]+/g);
    if (m && m.length >= 3 && !(m.length === 4 && Number(m[3]) === 0)) {
      const lum = 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2];
      return lum < 140 ? 'dark' : 'light';
    }
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function applyTheme() {
    const t = detectTheme();
    if (overlayHost) overlayHost.dataset.theme = t;
    if (homeHost) homeHost.dataset.theme = t;
  }

  let lastListHtml = '';
  function renderList() {
    if (!overlay) return;
    const list = $o('.list');
    const html = listHtml();
    if (html !== lastListHtml) {
      const top = list.scrollTop;
      list.innerHTML = html; lastListHtml = html;
      list.scrollTop = top;
      applyMarquee(list);
    }
    const c = counts();
    $o('.count').textContent = S.friends.length ? `· ${c.online} online` : '';
    const n = S.filter === 'requests' ? S.requests.length : visibleFriends().length;
    $o('.summary').textContent = S.filter === 'requests' ? `${n} pending` : `${n} friend${n === 1 ? '' : 's'}`;
    $o('.upd').textContent = S.updatedAt ? `Updated ${timeAgo(S.updatedAt)}` : '';
  }

  function applyMarquee(scope) {
    requestAnimationFrame(() => {
      scope.querySelectorAll('.marq').forEach((el) => {
        const inner = el.firstElementChild; if (!inner) return;
        if (inner.dataset.text === undefined) inner.dataset.text = inner.textContent;
        const text = inner.dataset.text;
        inner.textContent = text; el.classList.remove('roll');
        if (inner.scrollWidth - el.clientWidth <= 2) return;
        // seamless loop: two copies separated by a gap, slide by exactly one copy + gap
        inner.textContent = '';
        const a = document.createElement('span'); a.textContent = text;
        const g = document.createElement('span'); g.className = 'marq-gap';
        const b = document.createElement('span'); b.textContent = text;
        inner.append(a, g, b);
        const dist = a.getBoundingClientRect().width + 36;
        el.style.setProperty('--d', `-${dist}px`);
        const dur = Math.max(6, dist / 32);
        el.style.setProperty('--t', `${dur.toFixed(3)}s`);
        // keep phase continuous across re-renders (no restart snap)
        el.style.setProperty('--o', `-${((performance.now() / 1000) % dur).toFixed(3)}s`);
        el.classList.add('roll');
      });
    });
  }

  function renderAll() {
    applyTheme();
    if (overlay) { $o('.chips').innerHTML = chipsHtml(); renderList(); }
    renderHome();
    renderNav();
  }

  let lastHomeHtml = '';
  function renderHome() {
    if (!homeRoot) return;
    const sc = homeRoot.querySelector('.carousel');
    const left = sc ? sc.scrollLeft : 0;
    const wrapEl = homeRoot.querySelector('.wrap') || (() => { const d = document.createElement('div'); d.className = 'wrap'; homeRoot.appendChild(d); return d; })();
    const hh = homeHtml();
    if (hh === lastHomeHtml) return;
    lastHomeHtml = hh;
    wrapEl.innerHTML = hh;
    const sc2 = homeRoot.querySelector('.carousel');
    if (sc2) sc2.scrollLeft = left;
    applyMarquee(homeRoot);
  }

  /* ------------------------------------------------------------------ */
  /* page integration                                                    */
  /* ------------------------------------------------------------------ */
  const isHome = () => /^\/([a-z]{2}(-[a-z]+)?\/)?home\/?$/i.test(location.pathname);
  const pageStart = Date.now();

  function nativeCarousel() {
    const el = document.querySelector('.friend-carousel-container, .friends-carousel-container, #friends-carousel-container, [class*="friend-carousel"]');
    if (!el) return null;
    let top = el;
    while (top.parentElement && top.parentElement.matches('[class*="friend-carousel"], [class*="friends-carousel"]')) top = top.parentElement;
    return top;
  }

  function ensureHome() {
    if (!isHome()) {
      if (homeHost) { homeHost.remove(); homeHost = homeRoot = null; }
      return;
    }
    const native = nativeCarousel();
    if (native) native.setAttribute('data-brf-hide', '');
    if (homeHost && !homeHost.isConnected) { homeHost = homeRoot = null; }
    if (!homeHost) {
      const fallback = document.querySelector('#HomeContainer, .home-container, #content .content');
      if (!native && !(fallback && Date.now() - pageStart > 2500)) return;
      homeHost = document.createElement('div');
      homeHost.id = 'brf-home-host';
      homeRoot = mkRoot(homeHost);
      lastHomeHtml = '';
      homeRoot.addEventListener('click', onClick);
      if (native) native.before(homeHost);
      else fallback.prepend(homeHost);
      renderAll();
    } else if (native && homeHost.nextElementSibling !== native && native.parentElement) {
      native.before(homeHost);
    }
  }

  function ensureNavButton() {
    // hide the original left-nav entry
    // (Roblox's current left nav has no #nav-friends id, so match the link itself)
    document.querySelectorAll('a#nav-friends, a[href*="/users/friends"], a[href*="/friends"]').forEach((a) => {
      if (a.closest('#brf-overlay-host, .brf-nav-item') || a.closest('[data-brf-hide]')) return;
      if (a.id !== 'nav-friends' && !(isFriendsHref(a.getAttribute('href')) && /^friends/i.test(a.textContent.trim()))) return;
      (a.closest('li') || a).setAttribute('data-brf-hide', '');
    });

    if (navItem && navItem.isConnected) return;
    const n = document.querySelector('#navbar-notifications, #navbar-stream, [aria-label="Notifications"], [data-testid*="otification"]');
    if (!n) return;
    const container = n.closest('li') || n.parentElement;
    if (!container || !container.parentElement) return;
    navItem = document.createElement(container.tagName.toLowerCase() === 'li' ? 'li' : 'div');
    navItem.className = container.className + ' brf-nav-item';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'brf-nav-btn';
    btn.className = (n.tagName === 'BUTTON' ? n.className : '') + ' brf-nav-btn';
    btn.setAttribute('aria-label', 'Friends');
    btn.title = 'Friends';
    btn.innerHTML = I.users.replace(/width="40" height="40"/, 'width="26" height="26"') + '<span class="brf-nav-badges"></span>';
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); S.open ? closeDrawer() : openDrawer(); });
    navItem.appendChild(btn);
    container.before(navItem);
    renderNav();
  }

  function renderNav() {
    const box = navItem && navItem.querySelector('.brf-nav-badges');
    if (!box) return;
    const c = counts();
    box.innerHTML = S.requests.length ? `<span class="brf-nav-badge brf-req" title="Friend requests">${S.requests.length}</span>`
      : c.online ? `<span class="brf-nav-badge brf-online" title="Friends online">${c.online}</span>` : '';
    navItem.querySelector('button').classList.toggle('brf-active', S.open);
  }

  function isFriendsHref(href) {
    if (!href) return false;
    let u; try { u = new URL(href, location.origin); } catch { return false; }
    if (!/(^|\.)roblox\.com$/.test(u.hostname) || u.hostname.startsWith('create.')) return false;
    const m = u.pathname.match(/^\/(?:[a-z]{2}(?:-[a-z]+)?\/)?users\/(?:(\d+)\/)?friends\/?$/i);
    if (!m) return false;
    if (!m[1]) return true;
    const me = S.me || metaUserId();
    return !!me && Number(m[1]) === me;
  }

  function onDocClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target instanceof Element ? e.target.closest('a') : null;
    if (!a) return;
    if (a.id === 'nav-friends' || isFriendsHref(a.getAttribute('href'))) {
      e.preventDefault();
      e.stopPropagation();
      S.open ? closeDrawer() : openDrawer();
    }
  }

  /* ------------------------------------------------------------------ */
  /* boot                                                                */
  /* ------------------------------------------------------------------ */
  async function init() {
    if (!document.body) return;
    // The standalone Friends page is replaced by the drawer on /home.
    if (isFriendsHref(location.href)) {
      try { sessionStorage.setItem('brf_open', '1'); } catch { /* ignore */ }
      location.replace('/home');
      return;
    }
    const saved = await store.get(['brf_favs', 'brf_sort', 'brf_filter', 'brf_notify']);
    if (Array.isArray(saved.brf_favs)) S.favs = new Set(saved.brf_favs);
    if (saved.brf_sort) S.sort = saved.brf_sort;
    if (saved.brf_filter && saved.brf_filter !== 'requests') S.filter = saved.brf_filter;
    if (typeof saved.brf_notify === 'boolean') S.notify = saved.brf_notify;

    buildOverlay();
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.open) closeDrawer(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - S.updatedAt > 20000) refresh(); });

    renderAll();
    setInterval(() => { ensureHome(); ensureNavButton(); }, 700);
    ensureHome();
    ensureNavButton();

    const first = await send({ type: 'snapshot', maxAge: 24 * 3600e3 });
    if (first && first.ok && first.snapshot && first.snapshot.friends && first.snapshot.friends.length) {
      applySnapshot(first.snapshot); prevState = null; S.loading = false; renderAll(); // instant paint from cache
    }
    await refresh();
    try { if (sessionStorage.getItem('brf_open')) { sessionStorage.removeItem('brf_open'); openDrawer(); } } catch { /* ignore */ }

    const loop = () => {
      setTimeout(() => { if (!document.hidden) refresh(); loop(); }, S.open ? 30000 : 60000);
    };
    loop();
    setInterval(() => { if (S.open && !document.hidden) renderList(); }, 15000); // keep "x ago" fresh
  }

  init();
})();
