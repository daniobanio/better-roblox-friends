/* Better Roblox Friends – data engine.
 * Shared by the background service worker (always-on tracking) and the content script (fallback).
 * Fetches friends + presence, tracks last-seen / last-played, and returns a ready-to-render snapshot. */
(function (root) {
  'use strict';
  if (root.BRFEngine) return;

  const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  const toState = (t) => (t === 2 ? 'game' : t === 3 ? 'studio' : t === 1 ? 'online' : 'offline');
  const ls = {
    get: (k) => { try { return chrome.storage.local.get(k); } catch { return Promise.resolve({}); } },
    set: (o) => { try { return chrome.storage.local.set(o); } catch { return Promise.resolve(); } },
  };

  const mem = {
    loaded: false,
    csrf: null,
    me: null,
    cache: { names: {}, avatars: {}, icons: {}, friendList: null, friendListAt: 0 },
    lastGame: {},
    lastSeen: {},
    prev: {},
    snapshot: null,
    dirty: false,
  };

  async function load() {
    if (mem.loaded) return;
    const d = await ls.get(['brf_cache', 'brf_lastgame', 'brf_lastseen', 'brf_prev', 'brf_snapshot']);
    if (d.brf_cache) mem.cache = { ...mem.cache, ...d.brf_cache };
    mem.lastGame = d.brf_lastgame || {};
    mem.lastSeen = d.brf_lastseen || {};
    mem.prev = d.brf_prev || {};
    mem.snapshot = d.brf_snapshot || null;
    mem.loaded = true;
  }

  async function api(url, { method = 'GET', body } = {}) {
    const go = () => fetch(url, {
      method,
      credentials: 'include',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(mem.csrf && method !== 'GET' ? { 'X-CSRF-TOKEN': mem.csrf } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let res = await go();
    if (res.status === 403 && method !== 'GET') {
      const t = res.headers.get('x-csrf-token');
      if (t) { mem.csrf = t; res = await go(); }
    }
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
    return res.status === 204 ? null : res.json();
  }

  async function ensureAvatars(ids) {
    const need = [...new Set(ids)].filter((id) => !mem.cache.avatars[id]);
    for (const c of chunk(need, 100)) {
      try {
        const r = await api(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${c.join(',')}&size=150x150&format=Png&isCircular=false`);
        for (const d of r.data || []) if (d.imageUrl) { mem.cache.avatars[d.targetId] = d.imageUrl; mem.dirty = true; }
      } catch { /* non-critical */ }
    }
  }
  async function ensureIcons(universeIds) {
    const need = [...new Set(universeIds)].filter((id) => id && !mem.cache.icons[id]);
    for (const c of chunk(need, 100)) {
      try {
        const r = await api(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${c.join(',')}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`);
        for (const d of r.data || []) if (d.imageUrl) { mem.cache.icons[d.targetId] = d.imageUrl; mem.dirty = true; }
      } catch { /* non-critical */ }
    }
  }
  async function ensureNames(list) {
    for (const f of list) if (f.name && f.displayName && !mem.cache.names[f.id]) {
      mem.cache.names[f.id] = { name: f.name, displayName: f.displayName, verified: !!f.hasVerifiedBadge }; mem.dirty = true;
    }
    const need = list.map((f) => f.id).filter((id) => !mem.cache.names[id]);
    for (const c of chunk(need, 100)) {
      try {
        const r = await api('https://users.roblox.com/v1/users', { method: 'POST', body: { userIds: c, excludeBannedUsers: false } });
        for (const u of r.data || []) { mem.cache.names[u.id] = { name: u.name, displayName: u.displayName || u.name, verified: !!u.hasVerifiedBadge }; mem.dirty = true; }
      } catch { /* blank names */ }
    }
  }

  async function fetchRequests() {
    try {
      const r = await api('https://friends.roblox.com/v1/my/friends/requests?limit=100&sortOrder=Desc');
      const raw = (r.data || []).map((x) => ({ ...x, id: x.id || x.userId || (x.friendRequest && x.friendRequest.senderId) })).filter((x) => x.id);
      // Roblox's requests endpoint no longer returns names, so look them up by ID like the friends list does.
      await ensureNames(raw);
      const ids = raw.map((x) => x.id);
      await ensureAvatars(ids);
      return raw.map((x) => {
        const n = mem.cache.names[x.id] || {};
        const name = n.name || x.name || '';
        return {
          id: x.id,
          name,
          displayName: n.displayName || x.displayName || name,
          verified: n.verified !== undefined ? !!n.verified : !!x.hasVerifiedBadge,
          avatar: mem.cache.avatars[x.id] || '',
        };
      });
    } catch {
      return mem.snapshot ? mem.snapshot.requests || [] : [];
    }
  }

  let inflight = null;
  function refresh(opts = {}) {
    if (!inflight) inflight = run(opts).finally(() => { inflight = null; });
    return inflight;
  }

  async function run({ force = false, me = null } = {}) {
    await load();
    try {
      mem.me = mem.me || me || (await api('https://users.roblox.com/v1/users/authenticated')).id;
      const c = mem.cache;
      if (force || !c.friendList || Date.now() - c.friendListAt > 5 * 60e3) {
        const r = await api(`https://friends.roblox.com/v1/users/${mem.me}/friends`);
        c.friendList = (r.data || []).filter((f) => !f.isDeleted && !f.isBanned).map((f) => ({ id: f.id, name: f.name, displayName: f.displayName, hasVerifiedBadge: f.hasVerifiedBadge }));
        c.friendListAt = Date.now(); mem.dirty = true;
      }
      const list = c.friendList;
      const ids = list.map((f) => f.id);

      const presence = new Map();
      for (const ch of chunk(ids, 100)) {
        const r = await api('https://presence.roblox.com/v1/presence/users', { method: 'POST', body: { userIds: ch } });
        for (const p of r.userPresences || []) presence.set(p.userId, p);
      }
      await ensureNames(list);
      await ensureAvatars(ids);

      // Roblox's own last-online timestamps (only reachable from the background worker – the site blocks it via CORS)
      const offIds = ids.filter((id) => toState((presence.get(id) || {}).userPresenceType) === 'offline');
      const lastOnlineMap = new Map();
      for (const ch of chunk(offIds, 100)) {
        try {
          const r = await api('https://presence.roblox.com/v1/presence/last-online', { method: 'POST', body: { userIds: ch } });
          const arr = r.lastOnlineTimestamps || Object.values(r).find((v) => Array.isArray(v)) || [];
          for (const x of arr) { const t = Date.parse(x.lastOnline); if (t) lastOnlineMap.set(x.userId, t); }
        } catch { /* local tracking covers it */ }
      }

      // remember the last experience each friend was seen in
      let lgChanged = false;
      for (const p of presence.values()) {
        if (p.userPresenceType === 2 && (p.lastLocation || p.rootPlaceId)) {
          const prev = mem.lastGame[p.userId];
          const pid = p.rootPlaceId || p.placeId || null;
          if (!prev || prev.name !== p.lastLocation || prev.placeId !== pid || Date.now() - prev.at > 5 * 60e3) {
            mem.lastGame[p.userId] = { name: p.lastLocation || '', placeId: pid, universeId: p.universeId || null, at: Date.now() };
            lgChanged = true;
          }
        }
      }
      await ensureIcons([...presence.values()].map((p) => p.universeId).concat(offIds.map((id) => (mem.lastGame[id] || {}).universeId)));

      const now = Date.now();
      const transitions = [];
      const friends = list.map((f) => {
        const p = presence.get(f.id) || {};
        const state = toState(p.userPresenceType);
        const nm = c.names[f.id] || {};
        const before = mem.prev[f.id];

        // local last-seen: stamp while online; on the transition to offline that stamp is "just now"
        if (state !== 'offline') mem.lastSeen[f.id] = now;
        let lastOnline = Math.max(lastOnlineMap.get(f.id) || 0, p.lastOnline ? Date.parse(p.lastOnline) || 0 : 0, mem.lastSeen[f.id] || 0);

        const lg = state === 'offline' ? mem.lastGame[f.id] : null;
        const friend = {
          id: f.id,
          name: nm.name || f.name || '',
          displayName: nm.displayName || f.displayName || nm.name || f.name || '',
          verified: !!(nm.verified || f.hasVerifiedBadge),
          state,
          lastOnline,
          lastGame: lg ? { ...lg, icon: c.icons[lg.universeId] || '' } : null,
          avatar: c.avatars[f.id] || '',
          game: state === 'game' || state === 'studio'
            ? { name: p.lastLocation || '', placeId: p.placeId || null, rootPlaceId: p.rootPlaceId || null, gameId: p.gameId || null, universeId: p.universeId || null, icon: c.icons[p.universeId] || '' }
            : null,
        };
        if (before && before !== state) transitions.push({ friend, before });
        return friend;
      });

      mem.prev = Object.fromEntries(friends.map((f) => [f.id, f.state]));
      const requests = await fetchRequests();
      mem.snapshot = { friends, requests, updatedAt: now, me: mem.me, error: null };

      const writes = { brf_lastseen: mem.lastSeen, brf_prev: mem.prev, brf_snapshot: mem.snapshot };
      if (lgChanged) writes.brf_lastgame = mem.lastGame;
      if (mem.dirty) { writes.brf_cache = mem.cache; mem.dirty = false; }
      await ls.set(writes);
      return { snapshot: mem.snapshot, transitions };
    } catch (e) {
      const error = e && (e.status === 401 || e.status === 403) ? 'auth' : 'network';
      return { snapshot: { ...(mem.snapshot || { friends: [], requests: [], updatedAt: 0 }), error }, transitions: [] };
    }
  }

  async function respond(id, accept) {
    await load();
    await api(`https://friends.roblox.com/v1/users/${id}/${accept ? 'accept' : 'decline'}-friend-request`, { method: 'POST' });
    if (accept) mem.cache.friendListAt = 0;
    if (mem.snapshot) mem.snapshot.requests = (mem.snapshot.requests || []).filter((r) => r.id !== id);
    return true;
  }

  async function cached() { await load(); return mem.snapshot; }

  root.BRFEngine = { refresh, respond, cached };
})(typeof self !== 'undefined' ? self : window);
