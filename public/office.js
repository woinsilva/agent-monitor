/* Agent Monitor: "Office" view.
 *
 * A pixel-art office drawn entirely in code (no image files). Every agent is an
 * employee: Claude on the left, Codex on the right, agents reported through
 * report.js (any other client) in the "other agents" room,
 * subagents as interns standing next to whoever called them. What a character is
 * doing mirrors the session state; arrivals and departures walk through the door.
 *
 *   Office.mount(element)
 *   Office.update({ tops, kidsOf, conflicts, now, onOpen })   on every state push
 *   Office.setActive(bool)                                    pauses the animation
 */
(() => {
  'use strict';

  // ------------------------------------------------------------ geometry (logical px)
  const W = 480, WALL = 58, SLOT_W = 72, SLOT_H = 70, COLS = 3, BOTTOM = 100;
  const FLOOR_TOP = WALL + 6;
  const ZONE_X = { claude: 8, codex: 256 };
  const DOOR = { x: 19, y: WALL + 3 };
  const SPEED = 48;                 // walking speed, logical px per second
  const FRAME_MS = 170;             // sprite animation step
  const MAX_INTERNS = 3;

  const C = {
    wall: '#ece6db', wallTop: '#cfc6b6', wallLow: '#ddd4c4', base: '#8c6d4f',
    frame: '#76838f', sill: '#c9c1b3',
    floorA: '#d8b78c', floorB: '#cfad82', seam: '#b9966c', plankEdge: '#c4a277',
    door: '#9a6b42', doorFrame: '#6f4a2c', mat: '#7a5c45',
    rugClaude: '#f5dccd', rugClaudeB: '#d9774b', rugCodex: '#d8e5f7', rugCodexB: '#3d7be0',
    deskTop: '#b07c4e', deskHi: '#c48f5f', deskFront: '#87582f', deskLeg: '#6e4626',
    monitor: '#2a2e35', stand: '#4b5059', key: '#d3d6db',
    chair: '#3d4452', chairHi: '#566074', chairLeg: '#2a2f39',
    pot: '#b8692a', potDark: '#8f4f1d', leafA: '#43a04e', leafB: '#2f7d3a',
    reviewA: '#e3efe6', reviewB: '#d6e8db', glass: '#9fd0e6',
    copaA: '#efe5d3', copaB: '#e6dac4',
  };
  const SKIN = ['#f2d0b1', '#e0b48f', '#c68d64', '#8d5a3b', '#f6dcc8'];
  const HAIR = ['#2b1d14', '#5a3a22', '#a0642d', '#d8b25a', '#1d1d1d', '#7a2f1f', '#a7a7a7', '#3b2a4a'];
  const SHIRT = {
    claude: [['#d9774b', '#b65c33'], ['#e58b5f', '#c06a40'], ['#c7643c', '#a14d29']],
    codex: [['#3d7be0', '#2b5fb5'], ['#5a92ea', '#3c74cc'], ['#2f68c4', '#22509b']],
    other: [['#76b900', '#558700']],
  };
  const PANTS = ['#3a3f4b', '#2d3340', '#4a4036', '#33404a'];
  const FULL = { hw: 8, hh: 8, tw: 10, th: 7, lh: 6, aw: 2, lw: 3 };
  const MINI = { hw: 6, hh: 6, tw: 8, th: 5, lh: 4, aw: 2, lw: 2 };

  // ------------------------------------------------------------ state
  let wrap, canvas, ctx, layer, svg, emptyMsg, labels;
  let H = 0, rows = 1, active = true, raf = 0, first = true;
  let frame = 0, frameAt = 0, lastT = 0;
  let bg = null, bgKey = '';
  let data = { tops: [], kidsOf: () => [], conflicts: [], now: Date.now(), onOpen: () => {} };
  const actors = new Map();
  const slots = { claude: [], codex: [], review: [] };

  const t = (k, v) => (window.I18N ? I18N.t(k, v) : k);
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  function lookFor(key, client) {
    const h = hash(key);
    const shirts = SHIRT[client] || (ZONE_X[client] ? SHIRT.claude : SHIRT.other);
    const [shirt, shirtDark] = shirts[h % shirts.length];
    return {
      seed: h % 97,
      skin: SKIN[(h >>> 3) % SKIN.length],
      hair: HAIR[(h >>> 7) % HAIR.length],
      style: !ZONE_X[client] ? 0 : (h >>> 11) % 5,
      shirt, shirtDark,
      pants: PANTS[(h >>> 15) % PANTS.length],
      cap: shirtDark,
      visor: !ZONE_X[client],
    };
  }

  // ------------------------------------------------------------ layout
  function claim(zone, key) {
    const arr = slots[zone];
    let i = arr.indexOf(key);
    if (i >= 0) return i;
    i = arr.indexOf(null);
    if (i < 0) { arr.push(key); return arr.length - 1; }
    arr[i] = key;
    return i;
  }
  function release(zone, key) {
    const arr = slots[zone];
    const i = arr.indexOf(key);
    if (i >= 0) arr[i] = null;
    while (arr.length && arr[arr.length - 1] == null) arr.pop();
  }
  const slotXY = (zone, i) => ({ x: ZONE_X[zone] + (i % COLS) * SLOT_W, y: FLOOR_TOP + Math.floor(i / COLS) * SLOT_H });
  const reviewTop = () => FLOOR_TOP + rows * SLOT_H + 6;
  const REVIEW_SEATS = [[124, 50], [98, 56], [150, 56]];

  function home(a) {
    const st = a.s.status;
    if (a.type === 'main') {
      const o = slotXY(a.zone, a.slot);
      a.seated = st === 'working' || st === 'stale';
      return a.seated ? { x: o.x + 36, y: o.y + 48 } : { x: o.x + 62, y: o.y + 61 };
    }
    if (a.type === 'intern') {
      const p = actors.get(a.parentKey);
      const o = p ? slotXY(p.zone, p.slot) : { x: DOOR.x, y: DOOR.y };
      // just behind the boss's chair, so they read as part of that desk
      const spots = [[20, 67], [52, 67], [6, 62]];
      const [dx, dy] = spots[a.j % spots.length];
      a.seated = false;
      return { x: o.x + dx, y: o.y + dy };
    }
    // other agents: seated at the round table while it exists
    const [dx, dy] = REVIEW_SEATS[a.slot % REVIEW_SEATS.length];
    a.seated = true;
    return { x: dx, y: reviewTop() + dy };
  }

  function resize() {
    const used = Math.max(slots.claude.length, slots.codex.length, 1);
    rows = Math.max(1, Math.ceil(used / COLS));
    const h = FLOOR_TOP + rows * SLOT_H + 6 + BOTTOM;
    if (h !== H) {
      H = h;
      canvas.height = H;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      bgKey = '';
      placeLabels();
    }
  }

  // ------------------------------------------------------------ public API
  function mount(el) {
    wrap = el;
    wrap.innerHTML = `<div class="office-stage"><canvas width="${W}" height="200"></canvas><svg class="office-svg" preserveAspectRatio="xMidYMid meet"></svg><div class="office-labels"></div><div class="office-layer"></div><div class="office-empty" hidden>${esc(t('o_empty'))}<br><span>${esc(t('o_empty_sub'))}</span></div></div>`;
    canvas = wrap.querySelector('canvas');
    ctx = canvas.getContext('2d');
    svg = wrap.querySelector('svg');
    layer = wrap.querySelector('.office-layer');
    labels = wrap.querySelector('.office-labels');
    emptyMsg = wrap.querySelector('.office-empty');
    layer.addEventListener('click', e => {
      const el = e.target.closest('[data-open]');
      if (el) data.onOpen(el.dataset.open);
    });
    resize();
    start();
  }

  function update(d) {
    data = d;
    const want = new Map();
    for (const s of d.tops) {
      if (s.status === 'ended') continue;
      if (!ZONE_X[s.client]) { want.set(s.key, { s, type: 'ext', zone: 'review' }); continue; }
      if (!ZONE_X[s.client]) continue;
      want.set(s.key, { s, type: 'main', zone: s.client });
      const kids = d.kidsOf(s.key).filter(k => k.status === 'working' || k.status === 'waiting' || k.status === 'stale');
      kids.slice(0, MAX_INTERNS).forEach((k, j) => want.set(k.key, { s: k, type: 'intern', zone: null, parentKey: s.key, j }));
    }
    for (const [key, w] of want) {
      let a = actors.get(key);
      if (!a || a.mode === 'out') {
        if (!a) {
          a = { key, type: w.type, zone: w.zone, parentKey: w.parentKey || null, j: w.j || 0, look: lookFor(key, w.s.client), x: DOOR.x, y: DOOR.y, mode: 'in' };
          if (w.zone) a.slot = claim(w.zone, key);
          actors.set(key, a);
        }
        a.mode = 'in';
      }
      a.s = w.s;
      a.j = w.j || 0;
      if (first) { resize(); const h = home(a); a.x = h.x; a.y = h.y; a.mode = 'here'; }
    }
    for (const [key, a] of actors) if (!want.has(key) && a.mode !== 'out') a.mode = 'out';
    first = false;
    resize();
    syncOverlay();
  }

  function setActive(on) {
    active = on;
    if (on) start();
  }

  // A plain timer rather than requestAnimationFrame: rAF stops entirely in
  // background tabs and some embedded browsers, which froze walkers mid-path.
  function start() {
    if (raf || !canvas) return;
    lastT = performance.now();
    raf = setInterval(loop, 40);
  }

  function loop() {
    if (!active) { clearInterval(raf); raf = 0; return; }
    const t = performance.now();
    const dt = Math.min(0.5, (t - lastT) / 1000);
    lastT = t;
    if (t - frameAt > FRAME_MS) { frame++; frameAt = t; }
    step(dt);
    draw();
    positionOverlay();
  }

  // ------------------------------------------------------------ movement
  function step(dt) {
    for (const [key, a] of actors) {
      const target = a.mode === 'out' ? DOOR : home(a);
      const dx = target.x - a.x, dy = target.y - a.y;
      const dist = Math.hypot(dx, dy);
      const stepLen = SPEED * dt;
      a.moving = dist > 0.5;
      if (dist <= stepLen) {
        a.x = target.x; a.y = target.y; a.moving = false;
        if (a.mode === 'out') {
          actors.delete(key);
          if (a.zone) release(a.zone, key);
          const el = layer.querySelector(`[data-actor="${CSS.escape(key)}"]`);
          if (el) el.remove();
          resize();
          continue;
        }
        if (a.mode === 'in') a.mode = 'here';
      } else {
        a.x += dx / dist * stepLen;
        a.y += dy / dist * stepLen;
        a.dirY = dy;
      }
    }
  }

  // ------------------------------------------------------------ drawing: people
  function person(x, y, L, o) {
    const d = o.mini ? MINI : FULL;
    const f = o.frame || 0;
    const back = o.facing === 'back';
    const legTop = y - d.lh;
    const ty = legTop - d.th;
    const tx = x - (d.tw >> 1);
    const top = ty - d.hh + (o.pose === 'sleep' ? 3 : 0);
    const hx = x - (d.hw >> 1);

    if (!o.noLegs) {
      const walk = o.pose === 'walk';
      const lift1 = walk && f % 2 ? 1 : 0, lift2 = walk && !(f % 2) ? 1 : 0;
      const l1 = o.mini ? x - 3 : x - 4, l2 = x + 1;
      px(l1, legTop, d.lw, d.lh - lift1, L.pants); px(l1, y - 1 - lift1, d.lw, 1, '#22262e');
      px(l2, legTop, d.lw, d.lh - lift2, L.pants); px(l2, y - 1 - lift2, d.lw, 1, '#22262e');
    }

    // torso
    px(tx, ty, d.tw, d.th, L.shirt);
    px(tx, ty + d.th - 1, d.tw, 1, L.shirtDark);
    if (!back) px(x - 1, ty, 2, 1, L.skin);

    // arms
    const armH = d.th - 2;
    const sideArms = (swing) => {
      px(tx - d.aw, ty + 1 + swing, d.aw, armH, L.shirt); px(tx - d.aw, ty + armH + 1 + swing, d.aw, 1, L.skin);
      px(tx + d.tw, ty + 1 - swing, d.aw, armH, L.shirt); px(tx + d.tw, ty + armH + 1 - swing, d.aw, 1, L.skin);
    };
    switch (o.pose) {
      case 'walk': sideArms(f % 2 ? 1 : 0); break;
      case 'raise': {
        const wave = f % 2;
        px(tx - d.aw, ty + 1, d.aw, armH, L.shirt); px(tx - d.aw, ty + armH + 1, d.aw, 1, L.skin);
        px(tx + d.tw, ty - 5, d.aw, 7, L.shirt); px(tx + d.tw + wave, ty - 7, d.aw, 2, L.skin);
        break;
      }
      case 'mug': {
        px(tx + d.tw, ty + 1, d.aw, armH, L.shirt); px(tx + d.tw, ty + armH + 1, d.aw, 1, L.skin);
        px(tx - d.aw, ty + 1, d.aw, 3, L.shirt); px(tx, ty + 3, 2, 2, L.skin);
        px(tx + 1, ty, 3, 3, '#f4f4f4'); px(tx + 4, ty + 1, 1, 1, '#f4f4f4');
        const sp = (f + L.seed) % 4;
        if (sp < 2) px(tx + 2, ty - 2 - sp, 1, 1, '#ffffff'); else px(tx + 3, ty - 1 - (sp - 2), 1, 1, '#ffffff');
        break;
      }
      case 'read': {
        px(tx - 1, ty + 1, d.aw, 4, L.shirt); px(tx + d.tw - 1, ty + 1, d.aw, 4, L.shirt);
        const pw = o.mini ? 6 : 8;
        px(x - pw / 2, ty - 1, pw, o.mini ? 4 : 6, o.tablet ? '#30343c' : '#fbfbf5');
        if (o.tablet) px(x - pw / 2 + 1, ty, pw - 2, 2, '#7fc1ff');
        else { px(x - pw / 2 + 1, ty + 1, pw - 2, 1, '#b8b8b0'); px(x - pw / 2 + 1, ty + 3, pw - 4, 1, '#b8b8b0'); }
        break;
      }
      case 'think':
        px(tx + d.tw, ty + 1, d.aw, armH, L.shirt); px(tx + d.tw, ty + armH + 1, d.aw, 1, L.skin);
        px(tx - 1, ty + 1, d.aw, 3, L.shirt); px(x - 3, ty - 2, 2, 2, L.skin);
        break;
      case 'type': {
        const k = f % 2;
        px(tx - 1, ty - 1 - k, d.aw, 4, L.shirt); px(tx + d.tw - 1, ty - 2 + k, d.aw, 4, L.shirt);
        break;
      }
      case 'readback':
        px(tx - 1, ty - 1, d.aw, 4, L.shirt); px(tx + d.tw - 1, ty - 1, d.aw, 4, L.shirt);
        px(x + 3, ty - 5, 5, 4, '#fbfbf5'); px(x + 4, ty - 4, 3, 1, '#b8b8b0');
        break;
      case 'sleep':
        px(tx - 1, ty - 1, d.tw + 2, 2, L.shirt);
        break;
      default: sideArms(0);
    }

    // head
    if (back) {
      px(hx, top, d.hw, d.hh, L.hair);
      px(hx - 1, top + 1, 1, d.hh - 3, L.hair); px(hx + d.hw, top + 1, 1, d.hh - 3, L.hair);
      px(hx - 1, top + 3, 1, 2, L.skin); px(hx + d.hw, top + 3, 1, 2, L.skin);
      px(x - 2, top + d.hh - 1, 4, 1, L.skin);
      if (L.style === 1) px(hx, top + d.hh, d.hw, 2, L.hair);
      if (L.style === 2) px(x - 2, top - 2, 4, 2, L.hair);
      if (L.style === 3) px(hx - 1, top - 1, d.hw + 2, 3, L.cap);
    } else {
      px(hx, top, d.hw, d.hh, L.skin);
      const eyeY = top + (o.mini ? 3 : 4);
      const blink = (frame + L.seed) % 29 === 0;
      if (L.visor) {
        px(hx, eyeY - 1, d.hw, 2, '#1f2a0c'); px(hx + d.hw - 3, eyeY - 1, 2, 1, '#b6ff3b');
      } else if (!blink && o.pose !== 'sleep') {
        px(hx + 2, eyeY, 1, 1, '#2a2a2a'); px(hx + d.hw - 3, eyeY, 1, 1, '#2a2a2a');
      }
      if (!o.mini) px(x - 1, top + 6, 2, 1, o.pose === 'raise' ? '#7a3b2a' : 'rgba(0,0,0,.25)');
      switch (L.style) {
        case 1: px(hx, top - 1, d.hw, 2, L.hair); px(hx - 1, top, 1, d.hh + 2, L.hair); px(hx + d.hw, top, 1, d.hh + 2, L.hair); break;
        case 2: px(hx, top - 1, d.hw, 2, L.hair); px(hx - 1, top, 1, 3, L.hair); px(hx + d.hw, top, 1, 3, L.hair); px(x - 2, top - 3, 4, 2, L.hair); break;
        case 3: px(hx - 1, top - 2, d.hw + 2, 3, L.cap); px(hx - 1, top + 1, d.hw + 3, 1, L.shirtDark); break;
        case 4: px(hx, top, d.hw, 1, L.hair); px(hx - 1, top + 1, 1, 2, L.hair); px(hx + d.hw, top + 1, 1, 2, L.hair); break;
        default: px(hx, top - 1, d.hw, 2, L.hair); px(hx - 1, top, 1, 3, L.hair); px(hx + d.hw, top, 1, 3, L.hair);
      }
    }
    return top;
  }

  // ------------------------------------------------------------ drawing: furniture
  function screen(x, y, mode, f) {
    const w = 20, h = 11;
    const bgc = { off: '#15181d', idle: '#16233d', command: '#0b0f0b', edit: '#1d2130', read: '#f3f2ec', search: '#f3f2ec', web: '#f3f2ec', agent: '#1d2130', thinking: '#1f232b', wait: '#f0a92a', mcp: '#123236', plan: '#1d2130' }[mode] || '#1d2130';
    px(x, y, w, h, bgc);
    const r = (n) => (hash(String(n)) % 1000) / 1000;
    if (mode === 'command') {
      for (let i = 0; i < 3; i++) px(x + 1, y + 1 + i * 3, 4 + Math.floor(r(f - (2 - i)) * 13), 1, '#3ee07a');
      if (f % 2) px(x + 1, y + 9, 2, 1, '#3ee07a');
    } else if (mode === 'edit' || mode === 'plan' || mode === 'agent' || mode === 'mcp') {
      const cols = mode === 'mcp' ? ['#4fd1c5', '#9ae6b4'] : ['#c792ea', '#9ece6a', '#f5a97f', '#7dcfff'];
      for (let i = 0; i < 5; i++) {
        const n = f + i;
        px(x + 1 + (n % 3 ? 2 : 0), y + 1 + i * 2, 3 + Math.floor(r(n) * 12), 1, cols[n % cols.length]);
      }
      if (mode === 'agent') { px(x + 13, y + 2, 5, 3, '#43a04e'); px(x + 13, y + 6, 5, 3, '#43a04e'); }
    } else if (mode === 'read' || mode === 'search' || mode === 'web') {
      if (mode === 'web') px(x, y, w, 2, '#5a92ea');
      for (let i = 0; i < 4; i++) px(x + 2, y + (mode === 'web' ? 3 : 2) + i * 2, 6 + Math.floor(r(i + Math.floor(f / 6)) * 10), 1, '#9a9a94');
      if (mode === 'search') px(x + 3 + (f % 10), y + 4, 4, 1, '#f5d142');
    } else if (mode === 'thinking') {
      for (let i = 0; i < 3; i++) px(x + 6 + i * 3, y + 5, 2, 2, (f % 4) === i ? '#e6e9ee' : '#555b66');
    } else if (mode === 'wait') {
      px(x + 9, y + 2, 2, 5, '#3a2a05'); px(x + 9, y + 8, 2, 2, '#3a2a05');
    } else if (mode === 'idle') {
      const t = Math.floor(f / 2);
      px(x + 2 + (t % 15), y + 2 + (Math.floor(t / 15) % 7), 2, 2, '#4f7fd1');
    }
  }

  function desk(sx, sy, mode, deco) {
    // monitor
    px(sx + 24, sy + 6, 24, 15, C.monitor);
    screen(sx + 26, sy + 8, mode, frame);
    px(sx + 34, sy + 21, 4, 2, C.stand); px(sx + 31, sy + 23, 10, 1, C.stand);
    // desk
    px(sx + 10, sy + 22, 52, 12, C.deskTop); px(sx + 10, sy + 22, 52, 1, C.deskHi);
    px(sx + 10, sy + 34, 52, 6, C.deskFront);
    px(sx + 12, sy + 40, 2, 6, C.deskLeg); px(sx + 58, sy + 40, 2, 6, C.deskLeg);
    px(sx + 28, sy + 27, 16, 3, C.key); px(sx + 47, sy + 28, 3, 2, C.key);
    if (deco % 3 === 0) { px(sx + 14, sy + 24, 3, 3, '#f4f4f4'); px(sx + 17, sy + 25, 1, 1, '#f4f4f4'); }
    if (deco % 3 === 1) { px(sx + 51, sy + 24, 7, 5, '#fbfbf5'); px(sx + 52, sy + 23, 7, 5, '#f0efe6'); }
    if (deco % 4 === 2) { px(sx + 14, sy + 23, 5, 4, C.pot); px(sx + 13, sy + 19, 7, 4, C.leafA); px(sx + 15, sy + 18, 3, 2, C.leafB); }
  }

  function chair(sx, sy) {
    px(sx + 27, sy + 40, 18, 9, C.chair); px(sx + 28, sy + 41, 16, 1, C.chairHi);
    px(sx + 35, sy + 49, 2, 3, C.chairLeg); px(sx + 30, sy + 52, 12, 1, C.chairLeg);
  }

  function plant(x, y) {
    px(x - 4, y - 6, 8, 6, C.pot); px(x - 4, y - 1, 8, 1, C.potDark);
    px(x - 6, y - 14, 12, 8, C.leafA); px(x - 3, y - 18, 6, 5, C.leafB); px(x - 8, y - 11, 3, 3, C.leafB); px(x + 5, y - 12, 3, 3, C.leafB);
  }

  function roundTable(cx, cy) {
    const widths = [20, 28, 32, 32, 28];
    widths.forEach((w, i) => px(cx - w / 2, cy + i, w, 1, i === widths.length - 1 ? '#b9b2a6' : '#e8e3da'));
    px(cx - 9, cy + 1, 6, 3, '#ffffff'); px(cx + 3, cy + 2, 6, 2, '#ffffff');
    px(cx - 1, cy + 5, 2, 7, '#8e877c'); px(cx - 6, cy + 12, 12, 1, '#8e877c');
  }

  function skyFor(h) {
    if (h >= 7 && h < 17) return ['#8fc8f2', '#bfe1f7', 'day'];
    if (h >= 17 && h < 19) return ['#f2a46b', '#f7cf8f', 'dusk'];
    if (h >= 5 && h < 7) return ['#9fb3d9', '#f2c6a0', 'dusk'];
    return ['#1d2747', '#2c3a63', 'night'];
  }

  function background() {
    const hour = new Date(data.now || Date.now()).getHours();
    const key = H + ':' + rows + ':' + hour;
    if (bg && bgKey === key) { ctx.drawImage(bg, 0, 0); return; }
    bg = bg || document.createElement('canvas');
    bg.width = W; bg.height = H;
    const real = ctx;
    ctx = bg.getContext('2d');

    // floor planks
    for (let y = WALL, r = 0; y < H; y += 8, r++) {
      px(0, y, W, 8, r % 2 ? C.floorA : C.floorB);
      px(0, y + 7, W, 1, C.plankEdge);
      for (let x = (r % 3) * 16; x < W; x += 48) px(x, y, 1, 7, C.seam);
    }
    // wall
    px(0, 0, W, WALL, C.wall); px(0, 0, W, 3, C.wallTop);
    px(0, WALL - 16, W, 13, C.wallLow); px(0, WALL - 3, W, 3, C.base);
    const [s1, s2, kind] = skyFor(hour);
    for (const x of [72, 152, 300, 380]) {
      px(x, 8, 44, 26, C.frame);
      px(x + 2, 10, 40, 11, s1); px(x + 2, 21, 40, 11, s2);
      if (kind === 'night') { px(x + 8, 13, 1, 1, '#fff'); px(x + 30, 16, 1, 1, '#fff'); px(x + 18, 24, 1, 1, '#dde'); }
      if (kind === 'day') { px(x + 8, 14, 9, 3, '#ffffff'); px(x + 10, 12, 5, 2, '#ffffff'); }
      px(x + 21, 10, 2, 22, C.frame); px(x + 2, 20, 40, 2, C.frame);
      px(x - 2, 34, 48, 3, C.sill);
    }
    // door
    px(8, 14, 23, WALL - 14, C.doorFrame); px(10, 16, 19, WALL - 16, C.door);
    px(12, 19, 15, 14, '#a97a50'); px(12, 36, 15, 14, '#a97a50'); px(25, 37, 2, 2, '#e2c35a');
    px(6, WALL, 27, 4, C.mat);
    // department rugs
    const rh = rows * SLOT_H;
    for (const [zone, fill, border] of [['claude', C.rugClaude, C.rugClaudeB], ['codex', C.rugCodex, C.rugCodexB]]) {
      const zx = ZONE_X[zone];
      px(zx - 3, FLOOR_TOP - 3, COLS * SLOT_W + 6, rh + 4, border);
      px(zx - 1, FLOOR_TOP - 1, COLS * SLOT_W + 2, rh, fill);
    }
    // aisle plants
    for (let r = 0; r < rows; r++) plant(240, FLOOR_TOP + r * SLOT_H + 46);
    // meeting room (other agents)
    const y0 = reviewTop();
    for (let y = y0, r = 0; y < H; y += 8, r++) for (let x = 8, c = 0; x < 240; x += 8, c++) px(x, y, 8, 8, (r + c) % 2 ? C.reviewA : C.reviewB);
    px(8, y0, 232, 2, C.glass); px(8, y0, 2, H - y0, C.glass); px(238, y0, 2, H - y0 - 30, C.glass);
    px(150, y0 + 6, 52, 20, '#9aa6ad'); px(151, y0 + 7, 50, 18, '#fafafa');
    plant(24, y0 + 30);
    // copa
    for (let y = y0, r = 0; y < H; y += 8, r++) for (let x = 248, c = 0; x < W; x += 8, c++) px(x, y, 8, 8, (r + c) % 2 ? C.copaA : C.copaB);
    px(256, y0 + 4, 200, 12, '#cfc7b8'); px(256, y0 + 4, 200, 2, '#e2dbcf'); px(256, y0 + 16, 200, 4, '#a89f90');
    px(430, y0 - 4, 16, 20, '#3a3a3a'); px(433, y0 + 6, 10, 6, '#262626'); px(436, y0 + 9, 4, 3, '#f4f4f4');
    px(460, y0 + 2, 14, 34, '#e4e7ea'); px(460, y0 + 18, 14, 1, '#b8bec5'); px(471, y0 + 8, 1, 6, '#9aa1a8');
    px(268, y0 + 24, 10, 6, '#bfe3f2'); px(267, y0 + 30, 12, 20, '#dfe3e6');
    px(320, y0 + 50, 70, 9, '#5b49b8'); px(318, y0 + 58, 74, 12, '#6d5acd'); px(316, y0 + 54, 5, 16, '#5b49b8'); px(389, y0 + 54, 5, 16, '#5b49b8');
    px(336, y0 + 78, 38, 5, C.deskTop); px(338, y0 + 83, 2, 6, C.deskLeg); px(370, y0 + 83, 2, 6, C.deskLeg);
    plant(456, y0 + 70);

    ctx = real;
    bgKey = key;
    ctx.drawImage(bg, 0, 0);
  }

  // ------------------------------------------------------------ frame
  function poseFor(a) {
    const s = a.s, kind = s.current && s.current.kind;
    if (a.moving) return { pose: 'walk', facing: a.dirY < 0 ? 'back' : 'front' };
    if (a.type === 'ext') {
      return s.status === 'working' ? { pose: 'read', facing: 'front', noLegs: true }
        : { pose: 'think', facing: 'front', noLegs: true };
    }
    if (a.type === 'intern') {
      if (s.status === 'waiting') return { pose: 'raise', facing: 'front' };
      return { pose: 'read', facing: 'front', tablet: true };
    }
    if (s.status === 'stale') return { pose: 'sleep', facing: 'back', noLegs: true };
    if (s.status === 'working') {
      if (kind === 'read' || kind === 'search' || kind === 'web' || kind === 'agent') return { pose: 'readback', facing: 'back', noLegs: true };
      return { pose: 'type', facing: 'back', noLegs: true, still: kind === 'thinking' || !kind };
    }
    if (s.status === 'waiting') return { pose: 'raise', facing: 'front' };
    return { pose: 'mug', facing: 'front' };
  }

  function screenMode(a) {
    if (!a) return 'off';
    const s = a.s;
    if (s.status === 'waiting') return 'wait';
    if (s.status === 'stale') return 'off';
    if (s.status !== 'working') return 'idle';
    const k = s.current && s.current.kind;
    return k === 'command' ? 'command' : k === 'edit' ? 'edit' : k === 'read' ? 'read' : k === 'search' ? 'search' : k === 'web' ? 'web'
      : k === 'agent' ? 'agent' : k === 'mcp' ? 'mcp' : k === 'plan' ? 'plan' : 'thinking';
  }

  function draw() {
    background();

    const items = [];
    // desks: every claimed slot plus empty desks to fill each row
    for (const zone of ['claude', 'codex']) {
      const n = Math.max(rows * COLS, slots[zone].length);
      for (let i = 0; i < n; i++) {
        const o = slotXY(zone, i);
        const key = slots[zone][i];
        const a = key && actors.get(key);
        const atDesk = a && a.mode === 'here' && !a.moving ? a : null;
        const deco = hash(zone + i) % 12;
        items.push({ y: o.y + 40, fn: () => desk(o.x, o.y, atDesk ? screenMode(atDesk) : 'off', deco) });
        items.push({ y: o.y + 49.5, fn: () => chair(o.x, o.y) });
      }
    }
    const y0 = reviewTop();
    items.push({ y: y0 + 58, fn: () => roundTable(124, y0 + 42) });
    // whiteboard ticks while an outside agent works
    const extWorking = [...actors.values()].some(a => a.type === 'ext' && a.s.status === 'working');
    items.push({ y: y0, fn: () => {
      for (let i = 0; i < 4; i++) {
        px(155, y0 + 10 + i * 4, 2, 2, '#9aa6ad');
        px(159, y0 + 10 + i * 4, 18 + (i * 7) % 20, 1, '#9aa6ad');
        if (extWorking ? i <= (frame >> 2) % 5 - 1 : i < 2) px(190, y0 + 10 + i * 4, 3, 2, '#43a04e');
      }
    } });
    // coffee machine light
    items.push({ y: y0, fn: () => px(442, y0 - 1, 2, 2, frame % 6 < 3 ? '#4cd964' : '#1f6b2f') });

    for (const a of actors.values()) {
      const p = poseFor(a);
      const seatedNow = a.seated && !a.moving && a.mode === 'here';
      const y = a.y;
      items.push({ y: a.type === 'ext' && seatedNow ? y0 + 45 : seatedNow ? y + 0.5 : y + 1, fn: () => {
        a.headTop = person(a.x, y, a.look, {
          pose: p.pose, facing: p.facing, mini: a.type === 'intern', tablet: p.tablet,
          noLegs: seatedNow && p.noLegs && (a.type !== 'ext' || a.slot % 3 === 0), frame: p.still ? 0 : frame + a.look.seed,
        });
      } });
    }

    items.sort((p, q) => p.y - q.y);
    for (const it of items) it.fn();

    // clock (real time)
    const now = new Date(data.now || Date.now());
    px(228, 12, 14, 14, '#5d4a3a'); px(229, 13, 12, 12, '#fbfaf5');
    const ang = (now.getHours() % 12 + now.getMinutes() / 60) / 12 * Math.PI * 2, mang = now.getMinutes() / 60 * Math.PI * 2;
    for (let i = 1; i <= 3; i++) px(235 + Math.round(Math.sin(ang) * i), 19 - Math.round(Math.cos(ang) * i), 1, 1, '#222');
    for (let i = 1; i <= 5; i++) px(235 + Math.round(Math.sin(mang) * i), 19 - Math.round(Math.cos(mang) * i), 1, 1, '#c0392b');
  }

  // ------------------------------------------------------------ HTML overlay (crisp text)
  const pct = (v, total) => (v / total * 100) + '%';

  function placeLabels() {
    if (!labels) return;
    const rh = rows * SLOT_H, y0 = reviewTop();
    labels.innerHTML = `
      <span class="ol-sign" style="left:${pct(ZONE_X.claude + 108, W)};top:${pct(FLOOR_TOP + rh - 1, H)}">${esc(t('o_claude'))}</span>
      <span class="ol-sign codex" style="left:${pct(ZONE_X.codex + 108, W)};top:${pct(FLOOR_TOP + rh - 1, H)}">${esc(t('o_codex'))}</span>
      <span class="ol-sign ext" style="left:${pct(124, W)};top:${pct(H - 4, H)}">${esc(t('o_other'))}</span>
      <span class="ol-sign copa" style="left:${pct(364, W)};top:${pct(H - 4, H)}">${esc(t('o_break'))}</span>`;
  }

  function ago(ts) {
    if (!ts) return '';
    const s = Math.max(0, Math.round(((data.now || Date.now()) - ts) / 1000));
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    return m < 60 ? m + 'min' : Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0');
  }

  function bubbleFor(a) {
    const s = a.s;
    if (a.mode === 'out') return a.type === 'intern' ? null : { cls: 'bye', text: t('o_leaving') };
    if (s.status === 'waiting') return { cls: 'wait', text: '! ' + clip(s.waitingFor || t('o_needs_you'), 46) };
    if (s.status === 'stale') return { cls: 'stale', text: t('o_stale', { ago: ago(s.lastSeen) }) };
    if (a.type === 'ext') {
      if (s.status === 'working') return { cls: 'ext', text: clip(s.prompt || t('o_working'), 40) + ' · ' + ago(s.statusSince) };
      if (s.reply) return { cls: s.failCount ? 'fail' : 'done', text: clip(s.reply, 46) };
      return null;
    }
    if (a.type === 'intern') return null;
    if (s.status === 'working') {
      const c = s.current;
      if (!c || c.kind === 'thinking') return { cls: 'think', text: t('o_thinking') };
      return { cls: 'work', text: clip(c.summary || c.tool, 46) + ' · ' + ago(c.since) };
    }
    return null;
  }

  function syncOverlay() {
    if (!layer) return;
    emptyMsg.hidden = actors.size > 0;
    for (const a of actors.values()) {
      let el = layer.querySelector(`[data-actor="${CSS.escape(a.key)}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'oa ' + a.type;
        el.dataset.actor = a.key;
        el.dataset.open = a.parentKey || a.key;
        el.innerHTML = '<div class="ob"></div><div class="otag"></div>';
        layer.appendChild(el);
      }
      const s = a.s;
      const b = bubbleFor(a);
      const bub = el.firstChild;
      const html = b ? esc(b.text) : '';
      if (bub.dataset.h !== html) { bub.innerHTML = html; bub.dataset.h = html; }
      bub.className = 'ob' + (b ? ' ' + b.cls : ' none');
      const tag = el.lastChild;
      const tagText = a.type === 'intern' ? '' : `${s.project}${s.session ? ' · ' + String(s.session).replace(new RegExp('^' + s.client + '-'), '').slice(0, 4) : ''}`;
      if (tag.textContent !== tagText) tag.textContent = tagText;
      el.title = a.type === 'intern'
        ? `${s.agentType || 'subagente'}: ${(s.current && s.current.summary) || s.status}`
        : `${s.client} · ${s.project}\n${s.prompt || ''}`;
    }
    drawConflicts();
  }

  function positionOverlay() {
    for (const el of layer.children) {
      const a = actors.get(el.dataset.actor);
      if (!a) continue;
      const head = a.headTop != null ? a.headTop : a.y - 22;
      el.style.left = pct(a.x, W);
      el.style.top = pct(head, H);
      el.style.height = pct(a.y - head, H);
      el.style.zIndex = String(Math.round(a.y));
      el.classList.toggle('edge-l', a.x < 60);
      el.classList.toggle('edge-r', a.x > W - 60);
    }
    if (data.conflicts && data.conflicts.length) drawConflicts();
  }

  function drawConflicts() {
    const lines = [];
    for (const c of data.conflicts || []) {
      const pts = c.sessions.map(x => actors.get(x.key)).filter(Boolean);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[0], b = pts[i];
        const ay = (a.headTop || a.y - 20) + 2, by = (b.headTop || b.y - 20) + 2;
        const name = String(c.path).split(/[\\/]/).pop();
        lines.push(`<line x1="${a.x}" y1="${ay}" x2="${b.x}" y2="${by}" class="oc-line"/><text x="${(a.x + b.x) / 2}" y="${(ay + by) / 2 - 3}" class="oc-text">${esc(name)}</text>`);
      }
    }
    const html = lines.join('');
    if (svg.dataset.h !== html) { svg.innerHTML = html; svg.dataset.h = html; }
  }

  window.Office = { mount, update, setActive };
})();
