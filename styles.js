// Stylesheet for the shadow roots (kept as a string so it can be injected into both roots).
window.BRF_CSS = String.raw`
:host {
  all: initial;
  --bg: #1e2023;
  --surface: #272a2e;
  --surface2: #31353a;
  --hover: rgba(255,255,255,.05);
  --text: #f2f4f5;
  --muted: #9ea2a9;
  --border: rgba(255,255,255,.09);
  --shadow: 0 8px 28px rgba(0,0,0,.45);
  --online: #00a2ff;
  --game: #02b757;
  --game-hover: #00a24d;
  --studio: #f68802;
  --offline: #6b7078;
  --danger: #e5484d;
  font-family: "Builder Sans","Gotham SSm","Gotham",-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  color: var(--text);
}
:host([data-theme="light"]) {
  --bg: #f6f7f8;
  --surface: #ffffff;
  --surface2: #eceef0;
  --hover: rgba(0,0,0,.045);
  --text: #1c1e21;
  --muted: #666b73;
  --border: rgba(0,0,0,.1);
  --shadow: 0 8px 28px rgba(0,0,0,.18);
  --offline: #9aa0a8;
}
*, *::before, *::after { box-sizing: border-box; }
button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; padding: 0; }
a { color: inherit; text-decoration: none; }
svg { display: block; flex: none; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

/* ---------- status colours ---------- */
.s-game   { --sc: var(--game); }
.s-studio { --sc: var(--studio); }
.s-online { --sc: var(--online); }
.s-offline{ --sc: var(--offline); }

.avatar { position: relative; flex: none; display: block; border-radius: 50%; background: var(--surface2); }
.avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }
.avatar .dot {
  position: absolute; right: 0; bottom: 0; width: 28%; height: 28%; min-width: 11px; min-height: 11px;
  border-radius: 50%; background: var(--sc); border: 2.5px solid var(--surface);
}
.s-game .avatar::after, .avatar.s-game::after {
  content: ""; position: absolute; inset: -3px; border-radius: 50%; border: 2px solid var(--game); pointer-events: none;
}
/* in-game friends get the green ring only, no status dot */
.avatar.s-game .dot { display: none; }

.verified { display: inline-block; vertical-align: -2px; margin-left: 4px; color: var(--online); }

.status { display: flex; align-items: center; gap: 6px; font-size: 13px; line-height: 1.25; color: var(--muted); min-width: 0; }
.status .txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1 1 auto; }
.status .txt.marq { text-overflow: clip; }
.marq-in { display: inline-block; white-space: nowrap; will-change: transform; }
.marq.roll { -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 18px), transparent); mask-image: linear-gradient(90deg, #000 calc(100% - 18px), transparent); }
.marq.roll .marq-in { animation: roll var(--t, 8s) linear infinite; animation-delay: var(--o, 0s); }
.marq-gap { display: inline-block; width: 36px; }
@keyframes roll { from { transform: translateX(0); } to { transform: translateX(var(--d, 0)); } } 82%, 100% { transform: translateX(var(--d, 0)); } }
.status.played { font-size: 12px; opacity: .85; margin-top: 2px; }
.gicon.sm { width: 16px; height: 16px; border-radius: 4px; }
.status.s-game { color: var(--game); font-weight: 600; }
.status.s-studio { color: var(--studio); font-weight: 600; }
.status.s-online { color: var(--online); font-weight: 600; }
.gicon { width: 22px; height: 22px; border-radius: 5px; object-fit: cover; background: var(--surface2); flex: none; }
.status a:hover .txt { text-decoration: underline; }

.btn-join {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 34px; padding: 0 14px; border-radius: 8px; font-size: 14px; font-weight: 700;
  background: var(--game); color: #fff; transition: background .12s, transform .08s; white-space: nowrap;
}
.btn-join:hover { background: var(--game-hover); }
.btn-join:active { transform: scale(.97); }
.btn-join.ghost { background: var(--surface2); color: var(--text); }
.btn-join.ghost:hover { background: var(--border); }

.star { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; color: var(--muted); transition: color .12s, background .12s; }
.star:hover { background: var(--hover); color: var(--text); }
.star.on { color: #ffc43d; }
.star.on svg path { fill: currentColor; }

/* =====================================================
   HOME SECTION
   ===================================================== */
.home { display: block; }
.home-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.home-head h2 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -.01em; }
.home-head .sum { font-size: 13px; color: var(--muted); display: flex; gap: 10px; flex-wrap: wrap; }
.home-head .sum b { color: var(--text); font-weight: 700; }
.home-head .sum i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--sc); margin-right: 5px; }
.home-head .spacer { flex: 1; }
.pill-btn {
  height: 32px; padding: 0 12px; border-radius: 16px; background: var(--surface); border: 1px solid var(--border);
  font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; transition: background .12s;
}
.pill-btn:hover { background: var(--surface2); }
.pill-btn .n { background: var(--danger); color: #fff; border-radius: 9px; min-width: 18px; height: 18px; font-size: 11px; line-height: 18px; text-align: center; padding: 0 5px; }
.arrow { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--surface); border: 1px solid var(--border); }
.arrow:hover { background: var(--surface2); }

.carousel {
  display: flex; align-items: flex-start; gap: 6px; overflow-x: auto; scrollbar-width: none; scroll-snap-type: x proximity;
  padding: 4px 2px 8px; margin: 0 -2px;
}
.carousel::-webkit-scrollbar { display: none; }
.card {
  position: relative; flex: 0 0 128px; width: 128px; min-width: 0; max-width: 128px; overflow: hidden; scroll-snap-align: start; border-radius: 12px; padding: 10px 4px 10px;
  display: flex; flex-direction: column; align-items: center; text-align: center; cursor: pointer;
  border: 1px solid transparent; transition: background .15s;
}
.card:hover { background: var(--surface); }
.card.has-game { flex-basis: 184px; width: 184px; max-width: 184px; background: var(--surface); border-color: var(--border); padding: 12px 10px 10px; }
.card.has-game:hover { background: var(--surface2); }
.card .star { position: absolute; top: 4px; right: 4px; opacity: 0; }
.card:hover .star, .card .star.on { opacity: 1; }
.card .avatar { width: 84px; height: 84px; margin-bottom: 8px; }
.card .name { font-weight: 700; font-size: 14px; line-height: 1.3; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card .name:hover { text-decoration: underline; }
.card .info { width: 100%; overflow: hidden; display: flex; flex-direction: column; align-items: center; gap: 2px; margin-top: 2px; min-width: 0; }
.card .status { justify-content: center; width: 100%; font-size: 12px; }
.card .status.played { font-size: 11.5px; }
.card .game { width: 100%; display: flex; align-items: center; gap: 10px; background: var(--bg); border-radius: 10px; padding: 6px; margin-top: 8px; text-align: left; min-width: 0; cursor: pointer; }
.card .game:hover { background: var(--hover); }
.card .game .gicon { width: 40px; height: 40px; border-radius: 8px; }
.card .game .g-t { display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; line-height: 1.2; }
.card .game .g-n { font-size: 13px; font-weight: 700; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
.card .game .g-l { font-size: 11.5px; color: var(--game); font-weight: 700; }
.card .btn-join { width: 100%; margin-top: 8px; }

.card.skel { pointer-events: none; }
.sk { background: linear-gradient(90deg, var(--surface2) 25%, var(--hover) 50%, var(--surface2) 75%); background-size: 200% 100%; animation: sh 1.3s infinite linear; border-radius: 8px; }
@keyframes sh { to { background-position: -200% 0; } }

.empty { padding: 28px 16px; text-align: center; color: var(--muted); font-size: 14px; background: var(--surface); border: 1px dashed var(--border); border-radius: 14px; }
.empty .btn-join { margin-top: 10px; }

/* =====================================================
   DRAWER
   ===================================================== */
.scrim { position: fixed; left: 0; right: 0; bottom: 0; top: var(--brf-top, 48px); background: rgba(0,0,0,.4); opacity: 0; pointer-events: none; transition: opacity .22s; z-index: 1100; }
.scrim.open { opacity: 1; pointer-events: auto; }
.drawer {
  position: fixed; top: var(--brf-top, 48px); right: 0; bottom: 0; width: min(420px, 100vw); background: var(--bg); color: var(--text);
  border-left: 1px solid var(--border); box-shadow: var(--shadow); z-index: 1101; display: flex; flex-direction: column;
  transform: translateX(104%); transition: transform .26s cubic-bezier(.2,.8,.2,1); visibility: hidden;
}
.drawer.open { transform: none; visibility: visible; }
.d-head { display: flex; align-items: center; gap: 8px; padding: 14px 14px 10px 18px; }
.d-head h2 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -.01em; }
.d-head .count { font-size: 14px; color: var(--muted); font-weight: 600; margin-left: 2px; }
.d-head .grow { flex: 1; }
.ibtn { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; color: var(--muted); transition: background .12s, color .12s; }
.ibtn:hover { background: var(--hover); color: var(--text); }
.ibtn.on { color: var(--game); }
.ibtn.spin svg { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.search { position: relative; margin: 0 16px 10px; }
.search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); }
.search input {
  width: 100%; height: 38px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: var(--text);
  padding: 0 12px 0 38px; font: inherit; font-size: 14px; outline: none; transition: border-color .12s, box-shadow .12s;
}
.search input::placeholder { color: var(--muted); }
.search input:focus { border-color: var(--online); box-shadow: 0 0 0 3px color-mix(in srgb, var(--online) 25%, transparent); }

.chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 16px 10px; }
.chip {
  flex: none; height: 30px; padding: 0 11px; border-radius: 15px; background: var(--surface); border: 1px solid var(--border);
  font-size: 13px; font-weight: 700; color: var(--muted); display: inline-flex; align-items: center; gap: 6px; transition: all .12s;
}
.chip:hover { color: var(--text); background: var(--surface2); }
.chip.on { background: var(--text); color: var(--bg); border-color: var(--text); }
.chip .n { font-weight: 600; opacity: .75; }
.chip .n.alert { background: var(--danger); color: #fff; opacity: 1; border-radius: 9px; min-width: 18px; padding: 0 5px; text-align: center; line-height: 18px; font-size: 11px; }

.toolbar { display: flex; align-items: center; justify-content: space-between; padding: 0 18px 8px; font-size: 12px; color: var(--muted); border-bottom: 1px solid var(--border); }
.toolbar select { background: transparent; color: var(--text); border: 0; font: inherit; font-weight: 700; font-size: 12px; cursor: pointer; outline: none; }
.toolbar select option { background: var(--surface); color: var(--text); }

.list { flex: 1; overflow-y: auto; padding: 4px 8px 16px; scrollbar-width: thin; scrollbar-color: var(--surface2) transparent; }
.sec { padding: 14px 10px 6px; font-size: 11.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); display: flex; align-items: center; gap: 8px; }
.sec i { width: 8px; height: 8px; border-radius: 50%; background: var(--sc); }
.sec .n { font-weight: 600; opacity: .7; }

.row { display: flex; align-items: center; gap: 12px; padding: 9px 10px; border-radius: 12px; transition: background .1s; }
.row:hover { background: var(--hover); }
.row .avatar { width: 52px; height: 52px; }
.row .mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.row .name { font-weight: 800; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .name a:hover { text-decoration: underline; }
.row .name small { font-weight: 400; color: var(--muted); opacity: .7; font-size: 11.5px; margin-left: 6px; }
.row .acts { display: flex; align-items: center; gap: 4px; flex: none; }
.row .star { opacity: 0; }
.row:hover .star, .row .star.on { opacity: 1; }
.row .btn-join { height: 32px; padding: 0 12px; }
.row .btn-ghost { height: 32px; padding: 0 12px; border-radius: 8px; font-size: 13px; font-weight: 700; background: var(--surface2); }
.row .btn-ghost:hover { background: var(--border); }
.row .btn-ghost.pri { background: var(--game); color: #fff; }
.row .btn-ghost.pri:hover { background: var(--game-hover); }

.msg { padding: 40px 24px; text-align: center; color: var(--muted); font-size: 14px; }
.msg h3 { margin: 12px 0 4px; font-size: 16px; color: var(--text); }
.msg svg { margin: 0 auto; opacity: .6; }
.msg .btn-join { margin-top: 12px; }

.d-foot { padding: 8px 18px; font-size: 11.5px; color: var(--muted); border-top: 1px solid var(--border); display: flex; justify-content: space-between; }
.live { display: inline-flex; align-items: center; gap: 6px; }
.live i { width: 7px; height: 7px; border-radius: 50%; background: var(--game); animation: pulse 2s infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }

/* ---------- toasts ---------- */
.toasts { position: fixed; left: 20px; bottom: 20px; display: flex; flex-direction: column; gap: 10px; z-index: 1300; pointer-events: none; }
.toast {
  pointer-events: auto; display: flex; align-items: center; gap: 12px; min-width: 280px; max-width: 380px; padding: 10px 12px;
  background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow);
  animation: tin .28s cubic-bezier(.2,.8,.2,1);
}
.toast.out { animation: tout .2s forwards; }
@keyframes tin { from { transform: translateY(14px); opacity: 0; } }
@keyframes tout { to { transform: translateY(10px); opacity: 0; } }
.toast .avatar { width: 40px; height: 40px; }
.toast .t { flex: 1; font-size: 13px; line-height: 1.3; min-width: 0; }
.toast .t b { font-weight: 800; }
.toast .btn-join { height: 30px; padding: 0 11px; font-size: 13px; }
.toast .x { color: var(--muted); }

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: .001s !important; transition-duration: .001s !important; }
}
`;
