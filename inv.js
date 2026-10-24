// BAM inventory: the player's equipment + grids, the open container / corpse / ground pile, and the drag-and-drop UI (mouse and touch).
// Claude-Desktop 23/10. Data model in items.js. A location is { g, e } (an entry in a grid) or { slot } (an equipment slot).
import { ITEMS, newGrid, fits, addToGrid, describe, take, count, kindOf, dims } from './items.js';

export const SLOTS = [['primary', 'Primary'], ['sidearm', 'Sidearm'], ['melee', 'Melee'], ['head', 'Head'], ['vest', 'Vest'], ['belt', 'Belt'], ['pack', 'Backpack']];
export function newInventory() { return { pockets: newGrid(5, 2), eq: { primary: null, sidearm: null, melee: null, head: null, vest: null, belt: null, pack: null } }; }
// gear that holds things carries its own grid, so a backpack keeps its contents wherever it goes
export function withGrid(it) { const d = ITEMS[it.id]; if (d.gear && d.gear.grid && !it.g) it.g = newGrid(d.gear.grid[0], d.gear.grid[1]); return it; }
export function slotFor(id) { const d = ITEMS[id]; if (d.gun) return d.gun.slot; if (d.melee) return 'melee'; if (d.gear) return d.gear.slot; return null; }
export function playerGrids(inv) {
  const out = [{ title: 'Pockets', g: inv.pockets }];
  for (const s of ['vest', 'belt', 'pack']) { const it = inv.eq[s]; if (it && it.g) out.push({ title: ITEMS[it.id].name, g: it.g, owner: it }); }
  return out;
}
const gridsOf = (inv) => playerGrids(inv).map((x) => x.g);
// does grid g sit inside item it (directly or deeper)? used to stop a backpack being put into itself
function inside(g, it) { if (!it || !it.g) return false; if (it.g === g) return true; return it.g.items.some((e) => inside(g, e.it)); }

export function makeInvUI(G) {
  // G: { inv, other() -> {title, g} | null, ground() -> {title, g}, onChange(kind), use(loc), sfx(name), toast(text), busy() }
  const $ = (id) => document.getElementById(id);
  const root = $('inv'), eqEl = $('inv-eq'), myEl = $('inv-grids'), otEl = $('inv-other-grid'), otTitle = $('inv-other-title'), info = $('inv-info');
  let sel = null, C = 44;
  const cellSize = () => { const w = Math.min(innerWidth, 1200); C = w < 560 ? 30 : w < 900 ? 36 : 44; root.style.setProperty('--c', C + 'px'); };

  const itemOf = (loc) => (loc.slot ? G.inv.eq[loc.slot] : loc.e.it);
  function removeLoc(loc) { if (loc.slot) G.inv.eq[loc.slot] = null; else { const i = loc.g.items.indexOf(loc.e); if (i >= 0) loc.g.items.splice(i, 1); } }
  function isMine(g) { return gridsOf(G.inv).includes(g); }
  function otherGrid() { const o = G.other(); return o ? o.g : G.ground().g; }
  function changed(kind = 'inv') { G.onChange(kind); render(); }

  // ---------------------------------------------------------------- operations
  function placeAt(loc, g, x, y, r = false) {
    const it = itemOf(loc); const d = ITEMS[it.id]; const w = r ? d.h : d.w, h = r ? d.w : d.h;
    if (inside(g, it)) { G.toast('It cannot go inside itself'); return false; }
    if (!loc.slot && loc.g === g) { if (!fits(g, w, h, x, y, loc.e)) return false; loc.e.x = x; loc.e.y = y; if (r) loc.e.r = true; else delete loc.e.r; return true; }
    if (!fits(g, w, h, x, y)) return false;
    removeLoc(loc); const e = { it, x, y }; if (r) e.r = true; g.items.push(e); if (loc.slot) G.onChange('equip'); return true;
  }
  // turn an item 90° where it lies (or at the first spot where the turned item fits)
  function rotate(loc) {
    if (loc.slot) return; const d = ITEMS[loc.e.it.id]; if (d.w === d.h) { G.toast('Turning it changes nothing'); return; } const r = !loc.e.r; const w = r ? d.h : d.w, h = r ? d.w : d.h;
    if (fits(loc.g, w, h, loc.e.x, loc.e.y, loc.e)) { loc.e.r = r; G.sfx('item_pickup'); changed(); return; }
    for (let y = 0; y <= loc.g.h - h; y++) for (let x = 0; x <= loc.g.w - w; x++) if (fits(loc.g, w, h, x, y, loc.e)) { loc.e.x = x; loc.e.y = y; loc.e.r = r; G.sfx('item_pickup'); changed(); return; }
    G.toast('There is no room to turn it');
  }
  function addAnywhere(it, grids) { for (const g of grids) { if (inside(g, it)) continue; const rest = addToGrid(g, it); if (!rest) return null; it = rest; } return it; }
  function quickMove(loc) {
    const it = itemOf(loc); const fromMine = loc.slot || isMine(loc.g);
    const targets = fromMine ? [otherGrid()] : gridsOf(G.inv);
    removeLoc(loc); const copy = { ...it }; const rest = addAnywhere(copy, targets);
    if (rest) { // put back what did not fit
      if (loc.slot) { if (rest.n === it.n) G.inv.eq[loc.slot] = it; else addAnywhere(rest, [otherGrid()]); }
      else { const back = addToGrid(loc.g, rest); if (back) loc.g.items.push({ it: back, x: loc.e.x, y: loc.e.y }); }
      G.toast('There is no room');
    } else G.sfx('item_pickup');
    if (loc.slot) G.onChange('equip');
    sel = null; changed();
  }
  function equip(loc, slot) {
    const it = itemOf(loc); slot = slot || slotFor(it.id); if (!slot || slotFor(it.id) !== slot) return false;
    if (loc.slot === slot) return false;
    const old = G.inv.eq[slot]; const srcGrid = loc.slot ? null : loc.g; const at = loc.slot ? null : [loc.e.x, loc.e.y];
    removeLoc(loc); withGrid(it); G.inv.eq[slot] = it;
    if (old) { // the old one goes where the new one was, else anywhere on you, else on the ground
      let ok = false; const od = ITEMS[old.id];
      if (srcGrid && !inside(srcGrid, old) && fits(srcGrid, od.w, od.h, at[0], at[1])) { srcGrid.items.push({ it: old, x: at[0], y: at[1] }); ok = true; }
      if (!ok && srcGrid && !inside(srcGrid, old)) ok = !addToGrid(srcGrid, { ...old });
      if (!ok) ok = !addAnywhere({ ...old }, gridsOf(G.inv).filter((g) => !inside(g, old)));
      if (!ok) addAnywhere({ ...old }, [G.ground().g]);
    }
    G.sfx('item_pickup'); G.onChange('equip'); sel = { slot }; changed(); return true;
  }
  function unequip(slot) {
    const it = G.inv.eq[slot]; if (!it) return; G.inv.eq[slot] = null;
    const rest = addAnywhere({ ...it }, gridsOf(G.inv).filter((g) => !inside(g, it)));
    if (rest) { addAnywhere(rest, [otherGrid()]); G.toast('Dropped on the ground – no room'); }
    G.onChange('equip'); sel = null; changed();
  }
  // combine a dragged item onto another one: stacks, magazine into gun, cartridges into magazine or shotgun
  function combine(src, dst) {
    const a = itemOf(src), b = itemOf(dst); const da = ITEMS[a.id], db = ITEMS[b.id];
    if (a === b) return false;
    if (a.id === b.id && da.stack > 1) { const k = Math.min(a.n, da.stack - b.n); if (k <= 0) return false; b.n += k; a.n -= k; if (!a.n) removeLoc(src); return true; }
    if (da.mag && db.gun && db.gun.mag === da.kind) { // swap magazines
      const old = b.m; b.m = a.r; removeLoc(src);
      if (old != null) { const m = { id: a.id, n: 1, r: old }; const g = src.slot ? null : src.g; if (!(g && !addToGrid(g, m))) addAnywhere(m, [...gridsOf(G.inv), otherGrid()]); }
      G.sfx('rifle_mag_in'); return true;
    }
    if (da.cat === 'ammo' && db.mag && db.mag.ammo === da.kind) { const k = Math.min(a.n, db.mag.cap - b.r); if (k <= 0) return false; b.r += k; a.n -= k; if (!a.n) removeLoc(src); G.sfx('shotgun_shell_in'); return true; }
    if (da.cat === 'ammo' && db.gun && !db.gun.mag && db.gun.ammo === da.kind) { const k = Math.min(a.n, db.gun.cap - b.r); if (k <= 0) return false; b.r += k; a.n -= k; if (!a.n) removeLoc(src); G.sfx('shotgun_shell_in'); return true; }
    if (db.g && !inside(db.g, a)) { const rest = addToGrid(db.g, { ...a }); if (rest && rest.n === a.n) return false; removeLoc(src); if (rest) addAnywhere(rest, [src.slot ? otherGrid() : src.g]); return true; }
    return false;
  }
  // magazine / gun actions that pull cartridges from what you carry
  function fillMag(it) { const d = ITEMS[it.id]; const need = d.mag.cap - it.r; const got = take(gridsOf(G.inv), d.mag.ammo, need); it.r += got; if (!got) G.toast('No matching ammo'); else G.sfx('shotgun_shell_in'); changed(); }
  function emptyMag(it) { const d = ITEMS[it.id]; if (!it.r) return; const rest = addAnywhere({ id: d.mag.ammo, n: it.r }, gridsOf(G.inv)); it.r = rest ? rest.n : 0; if (rest) G.toast('No room for all the rounds'); changed(); }
  function unloadGun(it) { const d = ITEMS[it.id];
    if (d.gun.mag) { if (it.m == null) return; const m = { id: d.gun.mag, n: 1, r: it.m }; it.m = null; if (addAnywhere(m, gridsOf(G.inv))) addAnywhere(m, [otherGrid()]); G.sfx('rifle_mag_out'); }
    else { if (!it.r) return; const rest = addAnywhere({ id: d.gun.ammo, n: it.r }, gridsOf(G.inv)); it.r = rest ? rest.n : 0; G.sfx('shotgun_shell_in'); }
    changed(); }
  function loadGun(it) { const d = ITEMS[it.id];
    if (d.gun.mag) { let best = null; for (const g of gridsOf(G.inv)) for (const e of g.items) if (kindOf(e.it.id) === d.gun.mag && (!best || e.it.r > best.e.it.r)) best = { g, e };
      if (!best) { G.toast('No matching magazine'); return; } combine(best, findLoc(it)); }
    else { const got = take(gridsOf(G.inv), d.gun.ammo, d.gun.cap - it.r); it.r += got; if (!got) G.toast('No matching ammo'); else G.sfx('shotgun_shell_in'); }
    changed(); }
  function split(loc) { const it = itemOf(loc); if (it.n < 2) return; const k = Math.floor(it.n / 2); const g = loc.g; const part = { ...it, n: k };
    const s = (() => { const d = ITEMS[it.id]; for (let y = 0; y <= g.h - d.h; y++) for (let x = 0; x <= g.w - d.w; x++) if (fits(g, d.w, d.h, x, y)) return [x, y]; return null; })();
    if (!s) { G.toast('There is no room'); return; } it.n -= k; g.items.push({ it: part, x: s[0], y: s[1] }); changed(); }
  function findLoc(it) { for (const [s] of SLOTS) if (G.inv.eq[s] === it) return { slot: s };
    for (const g of [...gridsOf(G.inv), otherGrid()]) for (const e of g.items) if (e.it === it) return { g, e }; return null; }
  function dropToGround(loc) { const it = itemOf(loc); removeLoc(loc); const rest = addAnywhere({ ...it }, [G.ground().g]); if (rest) { addAnywhere(rest, gridsOf(G.inv)); G.toast('No room on the ground here'); } if (loc.slot) G.onChange('equip'); sel = null; changed('ground'); }

  // ---------------------------------------------------------------- rendering
  function itemEl(it, loc, inSlot) {
    const d = ITEMS[it.id]; const el = document.createElement('div'); el.className = 'it' + (sel && sameLoc(sel, loc) ? ' sel' : '') + ' c-' + d.cat;
    const rot = !inSlot && loc.e.r;
    if (!inSlot) { const [w, h] = dims(loc.e); el.style.left = loc.e.x * C + 'px'; el.style.top = loc.e.y * C + 'px'; el.style.width = w * C + 'px'; el.style.height = h * C + 'px'; }
    const img = document.createElement('img'); img.src = 'icons/' + d.icon + '.png'; img.alt = d.name; img.draggable = false;
    if (rot) { img.className = 'rot'; img.style.width = d.w * C + 'px'; img.style.height = d.h * C + 'px'; } el.appendChild(img);
    let badge = ''; if (d.stack > 1) badge = String(it.n); else if (d.mag) badge = String(it.r); else if (d.gun) badge = d.gun.mag ? (it.m == null ? '–' : String(it.m)) : String(it.r); else if (d.fuel) badge = it.fuel + ' l';
    else if (it.g && it.g.items.length) badge = '•';
    if (badge) { const b = document.createElement('b'); b.textContent = badge; el.appendChild(b); }
    el.addEventListener('pointerenter', (ev) => { if (!drag) showTip(it, ev); }); el.addEventListener('pointermove', (ev) => { if (!drag) moveTip(ev); }); el.addEventListener('pointerleave', hideTip);
    bindDrag(el, loc); return el;
  }
  // hover tooltip: shows at once (the browser's own title tooltip waits a second or two)
  const tip = $('tip');
  function showTip(it, ev) { if (!tip || ev.pointerType === 'touch') return; const d = ITEMS[it.id]; tip.innerHTML = ''; const b = document.createElement('b'); b.textContent = d.name; tip.appendChild(b);
    const t = describe(it); if (t) { const s = document.createElement('span'); s.textContent = t; tip.appendChild(s); } tip.hidden = false; moveTip(ev); }
  function moveTip(ev) { if (!tip || tip.hidden) return; const r = tip.getBoundingClientRect(); let x = ev.clientX + 16, y = ev.clientY + 18; if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 12; if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 12; tip.style.left = x + 'px'; tip.style.top = y + 'px'; }
  function hideTip() { if (tip) tip.hidden = true; }
  function sameLoc(a, b) { return a && b && (a.slot ? a.slot === b.slot : a.e === b.e); }
  function gridEl(g, title) {
    const wrap = document.createElement('div'); wrap.className = 'gwrap'; if (title) { const h = document.createElement('h3'); h.textContent = title; wrap.appendChild(h); }
    const el = document.createElement('div'); el.className = 'grid'; el.style.width = g.w * C + 'px'; el.style.height = g.h * C + 'px'; el._g = g;
    for (const e of g.items) el.appendChild(itemEl(e.it, { g, e }));
    wrap.appendChild(el); return wrap;
  }
  function render() {
    if (root.hidden) return; cellSize(); hideTip();
    eqEl.textContent = '';
    for (const [s, label] of SLOTS) { const box = document.createElement('div'); box.className = 'slot s-' + s; box._slot = s;
      const l = document.createElement('span'); l.textContent = label; box.appendChild(l);
      const it = G.inv.eq[s]; if (it) box.appendChild(itemEl(it, { slot: s }, true)); eqEl.appendChild(box); }
    myEl.textContent = ''; for (const pg of playerGrids(G.inv)) myEl.appendChild(gridEl(pg.g, pg.title));
    const o = G.other() || G.ground(); otTitle.textContent = o.title; otEl.textContent = ''; otEl.appendChild(gridEl(o.g));
    renderInfo();
  }
  function btn(label, fn, primary) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (primary) b.className = 'primary'; b.addEventListener('click', fn); return b; }
  function renderInfo() {
    info.textContent = ''; const loc = sel && (sel.slot ? (G.inv.eq[sel.slot] ? sel : null) : (sel.g.items.includes(sel.e) ? sel : null)); sel = loc;
    if (!loc) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'Drag items between the grids. Tap an item to see what you can do with it. Double-click moves it to the other side.'; info.appendChild(p); return; }
    const it = itemOf(loc), d = ITEMS[it.id]; const h = document.createElement('h3'); h.textContent = d.name; const p = document.createElement('p'); p.textContent = describe(it);
    const row = document.createElement('div'); row.className = 'acts';
    const mine = loc.slot || isMine(loc.g);
    if (d.use && (mine || d.use.deploy)) row.appendChild(btn(d.use.verb, () => { G.use(loc); }, true));
    if (slotFor(it.id)) row.appendChild(loc.slot ? btn('Take off', () => unequip(loc.slot)) : btn(d.gun ? 'Hold' : 'Put on', () => equip(loc), !d.use));
    if (d.gun) { if (d.gun.mag ? it.m == null : it.r < d.gun.cap) row.appendChild(btn('Load', () => loadGun(it))); if (d.gun.mag ? it.m != null : it.r > 0) row.appendChild(btn(d.gun.mag ? 'Remove magazine' : 'Unload', () => unloadGun(it))); }
    if (d.mag) { if (it.r < d.mag.cap && count(gridsOf(G.inv), d.mag.ammo)) row.appendChild(btn('Fill magazine', () => fillMag(it))); if (it.r) row.appendChild(btn('Empty magazine', () => emptyMag(it))); }
    if (!loc.slot && d.stack > 1 && it.n > 1) row.appendChild(btn('Split', () => split(loc)));
    if (!loc.slot && d.w !== d.h) row.appendChild(btn('Turn', () => rotate(loc)));
    row.appendChild(btn(mine ? (G.other() ? 'Put in ' + G.other().title.toLowerCase() : 'Drop on the ground') : 'Take', () => quickMove(loc)));
    if (mine && G.other()) row.appendChild(btn('Drop', () => dropToGround(loc)));
    info.append(h, p, row);
  }

  // ---------------------------------------------------------------- drag and drop (pointer events: mouse, pen, touch)
  let drag = null; const ghost = document.createElement('div'); ghost.className = 'ghost'; ghost.hidden = true; document.body.appendChild(ghost);
  const shade = document.createElement('div'); shade.className = 'shade'; shade.hidden = true;
  let lastTap = { t: 0, loc: null };
  function bindDrag(el, loc) {
    el.addEventListener('pointerdown', (ev) => {
      if (ev.button > 0) return; ev.preventDefault(); const r = el.getBoundingClientRect();
      drag = { loc, el, x0: ev.clientX, y0: ev.clientY, ox: ev.clientX - r.left, oy: ev.clientY - r.top, moved: false, id: ev.pointerId };
      try { el.setPointerCapture(ev.pointerId); } catch (_) {}
    });
    el.addEventListener('pointermove', (ev) => { if (!drag || drag.el !== el) return; if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 7) return;
      if (!drag.moved) { drag.moved = true; hideTip(); drag.r = !loc.slot && !!loc.e.r; ghostShape(); const d = ITEMS[itemOf(loc).id];
        if (drag.r) { const t = drag.ox; drag.ox = drag.oy; drag.oy = t; }
        if (loc.slot) { drag.ox = Math.min(drag.ox, C / 2); drag.oy = Math.min(drag.oy, C / 2); } ghost.hidden = false; el.classList.add('dragging'); }
      drag.cx = ev.clientX; drag.cy = ev.clientY; ghost.style.transform = `translate(${ev.clientX - drag.ox}px, ${ev.clientY - drag.oy}px)`; preview(ev); });
    const end = (ev) => { if (!drag || drag.el !== el) return; const dd = drag; drag = null; ghost.hidden = true; shade.hidden = true; el.classList.remove('dragging');
      if (!dd.moved) { const now = performance.now(); if (lastTap.loc && sameLoc(lastTap.loc, loc) && now - lastTap.t < 330) { lastTap = { t: 0, loc: null }; quickMove(loc); return; }
        lastTap = { t: now, loc }; sel = loc; renderInfo(); render(); return; }
      if (ev.type === 'pointercancel') { render(); return; }
      dropAt(dd, ev.clientX, ev.clientY); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
  function ghostShape() { const d = ITEMS[itemOf(drag.loc).id]; const w = drag.r ? d.h : d.w, h = drag.r ? d.w : d.h; ghost.innerHTML = ''; const img = drag.el.querySelector('img').cloneNode(); img.className = drag.r ? 'rot' : ''; img.style.width = d.w * C + 'px'; img.style.height = d.h * C + 'px';
    ghost.appendChild(img); ghost.style.width = w * C + 'px'; ghost.style.height = h * C + 'px'; }
  function turnDrag() { if (!drag || !drag.moved || drag.loc.slot && false) return; const d = ITEMS[itemOf(drag.loc).id]; if (d.w === d.h) return; drag.r = !drag.r; const t = drag.ox; drag.ox = drag.oy; drag.oy = t;
    drag.ox = Math.min(drag.ox, (drag.r ? d.h : d.w) * C - 4); drag.oy = Math.min(drag.oy, (drag.r ? d.w : d.h) * C - 4); ghostShape();
    ghost.style.transform = `translate(${drag.cx - drag.ox}px, ${drag.cy - drag.oy}px)`; preview({ clientX: drag.cx, clientY: drag.cy }); }
  addEventListener('keydown', (ev) => { if (drag && drag.moved && (ev.code === 'KeyR' || ev.code === 'Space')) { ev.preventDefault(); ev.stopPropagation(); turnDrag(); } }, true);
  addEventListener('contextmenu', (ev) => { if (drag && drag.moved) { ev.preventDefault(); turnDrag(); } });
  addEventListener('wheel', (ev) => { if (drag && drag.moved) turnDrag(); }, { passive: true });
  function targetAt(x, y) { const els = document.elementsFromPoint(x, y); let item = null, grid = null, slot = null, outside = true;
    for (const e of els) { if (e === ghost || ghost.contains(e)) continue; if (!item && e.classList.contains('it') && e !== drag.el) item = e; if (!grid && e._g) grid = e; if (!slot && e._slot) slot = e;
      if (e.id === 'inv-me' || e.id === 'inv-other' || e.id === 'inv-info') outside = false; }
    return { item, grid, slot, outside }; }
  function cellFor(gridEl, x, y) { const r = gridEl.getBoundingClientRect(); return [Math.round((x - drag.ox - r.left) / C), Math.round((y - drag.oy - r.top) / C)]; }
  function preview(ev) { const t = targetAt(ev.clientX, ev.clientY); shade.hidden = true; if (!t.grid) return; const [cx, cy] = cellFor(t.grid, ev.clientX, ev.clientY); const it = itemOf(drag.loc), d = ITEMS[it.id];
    if (t.item && !(t.item.parentElement === t.grid && !canCombine(t.item))) return;
    const w = drag.r ? d.h : d.w, h = drag.r ? d.w : d.h;
    const ok = fits(t.grid._g, w, h, cx, cy, drag.loc.slot ? null : drag.loc.g === t.grid._g ? drag.loc.e : null) && !inside(t.grid._g, it);
    t.grid.appendChild(shade); shade.hidden = false; shade.className = 'shade ' + (ok ? 'ok' : 'no'); Object.assign(shade.style, { left: cx * C + 'px', top: cy * C + 'px', width: w * C + 'px', height: h * C + 'px' }); }
  // would dropping onto this item do something (stack, load, put inside)? otherwise the drop just places the item on the cells
  function canCombine(itEl) { const dst = locOfEl(itEl); if (!dst) return false; const a = itemOf(drag.loc), b = itemOf(dst); if (a === b) return false; const da = ITEMS[a.id], db = ITEMS[b.id];
    return (a.id === b.id && da.stack > 1 && b.n < da.stack) || (da.mag && db.gun && db.gun.mag === da.kind) || (da.cat === 'ammo' && ((db.mag && db.mag.ammo === da.kind) || (db.gun && !db.gun.mag && db.gun.ammo === da.kind))) || (!!db.g && !inside(db.g, a)); }
  function locOfEl(el) { const g = el.parentElement && el.parentElement._g; if (g) { const i = [...el.parentElement.querySelectorAll(':scope > .it')].indexOf(el); return { g, e: g.items[i] }; }
    const s = el.parentElement && el.parentElement._slot; return s ? { slot: s } : null; }
  function dropAt(dd, x, y) {
    drag = dd;   // targetAt / cellFor read the drag state (it used to be cleared before the drop, so every drop onto a grid failed)
    try { dropOnto(dd, x, y); } finally { drag = null; }
  }
  function dropOnto(dd, x, y) {
    const t = targetAt(x, y); let ok = false;
    if (t.item) { const dst = locOfEl(t.item); if (dst) ok = combine(dd.loc, dst); if (!ok && dst && dst.slot) ok = equip(dd.loc, dst.slot); }
    if (!ok && t.slot) ok = equip(dd.loc, t.slot._slot);
    if (!ok && t.grid) { const [cx, cy] = cellFor(t.grid, x, y); ok = placeAt(dd.loc, t.grid._g, cx, cy, !!dd.r); if (ok) G.sfx('item_pickup'); }   // free placement, also next to or partly over other items' cells
    if (!ok && t.outside && !t.grid && (dd.loc.slot || isMine(dd.loc.g))) { dropToGround(dd.loc); return; }
    if (!ok && (t.item || t.grid || t.slot)) G.toast('It does not fit there');
    changed();
  }

  return {
    open() { root.hidden = false; document.body.classList.add('inv-open'); sel = null; render(); },
    close() { root.hidden = true; document.body.classList.remove('inv-open'); hideTip(); sel = null; },
    get isOpen() { return !root.hidden; },
    render, unequip, equip, loadGun, findLoc, addAnywhere, rotate,
  };
}
