/* Better Roblox Friends – background service worker.
 * Keeps friend presence tracked even when no Roblox tab is open, and sends desktop
 * notifications when favorites come online or start playing. */
importScripts('engine.js');

const ALARM = 'brf-poll';
const ROBLOX_TAB = 'https://www.roblox.com/';

/* Requests made by the extension should look like they come from roblox.com
   (Roblox validates Origin on POSTs and the last-online endpoint). */
async function setupRules() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: [{
        id: 1,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'Origin', operation: 'set', value: 'https://www.roblox.com' },
            { header: 'Referer', operation: 'set', value: 'https://www.roblox.com/' },
          ],
        },
        condition: {
          requestDomains: ['roblox.com'],
          initiatorDomains: [chrome.runtime.id],
          resourceTypes: ['xmlhttprequest'],
        },
      }],
    });
  } catch (e) { console.warn('BRF: header rule failed', e); }
}

async function schedule() {
  const a = await chrome.alarms.get(ALARM);
  if (!a) chrome.alarms.create(ALARM, { delayInMinutes: 0.5, periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(() => { setupRules(); schedule(); poll(); });
chrome.runtime.onStartup.addListener(() => { setupRules(); schedule(); poll(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) poll(); });
setupRules();
schedule();

/* ---------------- polling + notifications ---------------- */
async function robloxTabFocused() {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs.some((t) => t.url && t.url.startsWith(ROBLOX_TAB));
  } catch { return false; }
}

async function toDataUrl(url) {
  try {
    const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return `data:image/png;base64,${btoa(bin)}`;
  } catch { return chrome.runtime.getURL('icons/icon128.png'); }
}

async function notify(friend, kind) {
  const icon = friend.avatar ? await toDataUrl(friend.avatar) : chrome.runtime.getURL('icons/icon128.png');
  const g = friend.game;
  const placeId = kind === 'game' && g ? (g.rootPlaceId || g.placeId || '') : '';
  chrome.notifications.create(`brf|${friend.id}|${placeId}|${Date.now()}`, {
    type: 'basic',
    iconUrl: icon,
    title: kind === 'game' ? `${friend.displayName} is playing` : `${friend.displayName} is online`,
    message: kind === 'game' ? (g && g.name) || 'an experience' : 'Just came online on Roblox',
    contextMessage: 'Better Roblox Friends',
    priority: 1,
  });
}

let pollP = null;
function poll(opts = {}) {
  if (!pollP) pollP = doPoll(opts).finally(() => { pollP = null; });
  return pollP;
}
async function doPoll({ force = false } = {}) {
  {
    const { snapshot, transitions } = await BRFEngine.refresh({ force });
    const cfg = await chrome.storage.sync.get(['brf_favs', 'brf_notify']);
    const favs = new Set(cfg.brf_favs || []);
    if (cfg.brf_notify !== false && favs.size && !snapshot.error && transitions.length && !(await robloxTabFocused())) {
      for (const { friend, before } of transitions) {
        if (!favs.has(friend.id)) continue;
        if (friend.state === 'game') notify(friend, 'game');
        else if (friend.state === 'online' && before === 'offline') notify(friend, 'online');
      }
    }
    return snapshot;
  }
}

chrome.notifications.onClicked.addListener((id) => {
  if (!id.startsWith('brf|')) return;
  const [, userId, placeId] = id.split('|');
  chrome.tabs.create({ url: placeId ? `https://www.roblox.com/games/${placeId}` : `https://www.roblox.com/users/${userId}/profile` });
  chrome.notifications.clear(id);
});

/* ---------------- messages from the page ---------------- */
chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  (async () => {
    if (msg.type === 'snapshot') {
      const cached = await BRFEngine.cached();
      if (cached && !cached.error && Date.now() - cached.updatedAt < (msg.maxAge ?? 15000)) return { ok: true, snapshot: cached };
      const snap = (await poll({ force: !!msg.force })) || (await BRFEngine.cached());
      return { ok: !!snap, snapshot: snap };
    }
    if (msg.type === 'respond') {
      await BRFEngine.respond(msg.id, msg.accept);
      return { ok: true };
    }
    return { ok: false };
  })().then(send, () => send({ ok: false }));
  return true;
});
