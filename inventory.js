// By Any Means - inventory, backpack tiers, hotbar + inventory UI, localStorage save.
// Data-driven: ITEMS (stack sizes, weight, tags) is shared with crafting/building later (see data/recipes.json).
const svg = (body, bg = '#3b2f22') => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g stroke="#1b140d" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`);
export const ITEMS = {
  wood: { name: 'Wood', stack: 30, w: 1.0, tags: ['material', 'fuel'], icon: svg('<rect x="8" y="22" width="44" height="16" rx="8" fill="#9a6a3c" transform="rotate(-18 32 32)"/><ellipse cx="50" cy="24" rx="6" ry="8" fill="#e2c08a" transform="rotate(-18 32 32)"/><rect x="12" y="34" width="40" height="14" rx="7" fill="#7d5430" transform="rotate(10 32 40)"/>') },
  stone: { name: 'Stone', stack: 30, w: 1.5, tags: ['material'], icon: svg('<path d="M10 44 L18 22 L34 14 L52 24 L56 42 L40 52 L20 52 Z" fill="#9ea0a0"/><path d="M18 22 L30 32 L52 24 M30 32 L40 52" fill="none" stroke-width="2.5"/>') },
  fiber: { name: 'Plant Fiber', stack: 40, w: 0.2, tags: ['material'], icon: svg('<path d="M20 56 C22 36 18 22 12 8 M30 56 C30 34 32 20 30 6 M40 56 C40 38 46 24 54 12" fill="none" stroke="#1b140d" stroke-width="7"/><path d="M20 56 C22 36 18 22 12 8 M30 56 C30 34 32 20 30 6 M40 56 C40 38 46 24 54 12" fill="none" stroke="#a7c35a" stroke-width="3.5"/>') },
  sticks: { name: 'Sticks', stack: 30, w: 0.3, tags: ['material', 'fuel'], icon: svg('<path d="M12 50 L50 12 M16 30 L52 44 M28 54 L36 10" stroke="#1b140d" stroke-width="8"/><path d="M12 50 L50 12 M16 30 L52 44 M28 54 L36 10" stroke="#b07a45" stroke-width="4"/>') },
  berries: { name: 'Berries', stack: 20, w: 0.1, tags: ['food'], food: 6, icon: svg('<circle cx="24" cy="38" r="11" fill="#b2233a"/><circle cx="40" cy="40" r="10" fill="#c22d45"/><circle cx="33" cy="25" r="10" fill="#9e1d33"/><path d="M33 15 C36 8 44 6 48 8" fill="none" stroke="#3f6b27" stroke-width="4"/>') },
  cloth: { name: 'Cloth', stack: 20, w: 0.2, tags: ['material'], icon: svg('<path d="M10 16 L50 10 L54 46 L14 54 Z" fill="#c9b68c"/><path d="M14 26 L50 20 M16 38 L52 32" fill="none" stroke-width="2.5"/>') },
  backpack_canvas: { name: 'Canvas Backpack', stack: 1, w: 1.0, tags: ['backpack'], tier: 1, icon: svg('<rect x="14" y="16" width="36" height="40" rx="9" fill="#5f7a4a"/><rect x="20" y="34" width="24" height="14" rx="4" fill="#4c6239"/><path d="M24 16 C24 6 40 6 40 16" fill="none"/>') },
  backpack_hide: { name: 'Hide Backpack', stack: 1, w: 1.2, tags: ['backpack'], tier: 2, icon: svg('<rect x="12" y="14" width="40" height="44" rx="11" fill="#8a5a36"/><path d="M12 28 C24 22 40 22 52 28" fill="#d2b07c"/><path d="M22 14 C22 4 42 4 42 14" fill="none"/>') },
};
export const TIERS = [{ name: 'No backpack', slots: 6 }, { name: 'Canvas backpack', slots: 12 }, { name: 'Hide backpack', slots: 18 }];
export const HOTBAR = 6, MAX_SLOTS = 18, SAVE_KEY = 'bam_inv_v1';

export class Inventory {
  constructor() { this.slots = Array(MAX_SLOTS).fill(null); this.tier = 0; this.sel = 0; this.looted = []; this.onChange = () => {}; this.load(); }
  get size() { return TIERS[this.tier].slots; }
  count(id) { return this.slots.slice(0, this.size).reduce((n, s) => n + (s && s.id === id ? s.n : 0), 0); }
  weight() { return this.slots.reduce((w, s) => w + (s ? ITEMS[s.id].w * s.n : 0), 0); }
  add(id, n) { const st = ITEMS[id].stack;
    for (let i = 0; i < this.size && n > 0; i++) { const s = this.slots[i]; if (s && s.id === id && s.n < st) { const k = Math.min(n, st - s.n); s.n += k; n -= k; } }
    for (let i = 0; i < this.size && n > 0; i++) if (!this.slots[i]) { const k = Math.min(n, st); this.slots[i] = { id, n: k }; n -= k; }
    this.changed(); return n; } // leftover
  remove(id, n) { for (let i = this.size - 1; i >= 0 && n > 0; i--) { const s = this.slots[i]; if (s && s.id === id) { const k = Math.min(n, s.n); s.n -= k; n -= k; if (!s.n) this.slots[i] = null; } } this.changed(); return n === 0; }
  has(req) { return Object.entries(req).every(([id, n]) => this.count(id) >= n); } // for crafting: {wood:3, fiber:2}
  equipBackpack(tier) { if (tier <= this.tier) return false; this.tier = tier; this.changed(); return true; }
  swap(a, b) { [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]]; this.changed(); }
  changed() { this.save(); this.onChange(); }
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ slots: this.slots, tier: this.tier, looted: this.looted })); } catch (e) {} }
  load() { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (d) { this.slots = d.slots.concat(Array(MAX_SLOTS).fill(null)).slice(0, MAX_SLOTS); this.tier = d.tier | 0; this.looted = d.looted || []; } } catch (e) {} }
  reset() { localStorage.removeItem(SAVE_KEY); this.slots = Array(MAX_SLOTS).fill(null); this.tier = 0; this.looted = []; this.changed(); }
}

// ---------- UI ----------
const css = `
#hotbar{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:25}
.slot{width:52px;height:52px;border-radius:10px;background:rgba(40,30,20,.72);border:2px solid rgba(240,220,170,.35);position:relative;box-sizing:border-box;touch-action:none}
.slot img{position:absolute;inset:5px;width:38px;height:38px;pointer-events:none;filter:drop-shadow(0 2px 0 rgba(0,0,0,.35))}
.slot b{position:absolute;right:4px;bottom:1px;color:#fff;font:700 13px system-ui;text-shadow:0 1px 2px #000;pointer-events:none}
.slot.sel{border-color:#ffd25a;box-shadow:0 0 0 2px rgba(255,210,90,.35)}
.slot.locked{opacity:.28;background:repeating-linear-gradient(45deg,rgba(0,0,0,.4) 0 6px,rgba(60,45,30,.4) 6px 12px)}
#invPanel{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(10,8,5,.55);z-index:40;touch-action:none}
#invPanel .box{background:linear-gradient(#5b4630,#3e2f20);border:3px solid #241a10;border-radius:16px;padding:14px 16px;color:#f3e6c8;font:14px system-ui;box-shadow:0 10px 30px rgba(0,0,0,.5);max-width:94vw}
#invPanel h3{margin:0 0 8px;font-size:18px;display:flex;justify-content:space-between;align-items:center;gap:16px}
#invPanel .grid{display:grid;grid-template-columns:repeat(6,52px);gap:6px}
#invPanel .meta{margin-top:8px;font-size:12px;opacity:.85;display:flex;justify-content:space-between;gap:12px}
#invPanel .close{background:#7a2f22;color:#fff;border:2px solid #241a10;border-radius:8px;padding:2px 10px;font:700 14px system-ui}
.hudbtn{position:fixed;z-index:26;width:58px;height:58px;border-radius:50%;background:rgba(40,30,20,.7);border:2px solid rgba(240,220,170,.5);color:#ffe7a8;font:800 18px system-ui;display:flex;align-items:center;justify-content:center;touch-action:none;user-select:none}
#btnUse{right:44px;bottom:168px}#btnBag{right:12px;top:12px;width:48px;height:48px;font-size:22px}
#prompt{position:fixed;left:50%;top:58%;transform:translateX(-50%);color:#fff;font:600 14px system-ui;background:rgba(0,0,0,.45);padding:4px 10px;border-radius:8px;z-index:12;display:none;pointer-events:none}
.pop{position:fixed;left:50%;top:44%;transform:translateX(-50%);color:#ffe28a;font:800 22px system-ui;text-shadow:0 2px 3px #000;z-index:30;pointer-events:none;transition:transform 1.1s ease-out,opacity 1.1s ease-in;display:flex;align-items:center;gap:6px}
.pop img{width:28px;height:28px}
@media (max-width:700px){.slot{width:44px;height:44px}.slot img{inset:4px;width:32px;height:32px}#invPanel .grid{grid-template-columns:repeat(6,44px)}#hotbar{bottom:8px}}
`;
export function buildUI(inv, { onUse, isTouch }) {
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const hb = document.createElement('div'); hb.id = 'hotbar'; document.body.appendChild(hb);
  const panel = document.createElement('div'); panel.id = 'invPanel'; panel.innerHTML = `<div class="box"><h3><span>Inventory</span><button class="close">✕</button></h3><div class="grid"></div><div class="meta"><span class="tier"></span><span class="wt"></span></div></div>`; document.body.appendChild(panel);
  const grid = panel.querySelector('.grid');
  const use = document.createElement('div'); use.className = 'hudbtn'; use.id = 'btnUse'; use.textContent = 'E'; if (!isTouch) use.style.display = 'none'; document.body.appendChild(use);
  const bag = document.createElement('div'); bag.className = 'hudbtn'; bag.id = 'btnBag'; bag.textContent = '🎒'; document.body.appendChild(bag);
  const prompt = document.createElement('div'); prompt.id = 'prompt'; document.body.appendChild(prompt);
  let pick = -1;
  const slotEl = (i) => { const s = inv.slots[i], d = document.createElement('div'); d.className = 'slot' + (i >= inv.size ? ' locked' : '') + (i === inv.sel && i < HOTBAR ? ' sel' : '') + (i === pick ? ' sel' : '');
    if (s) d.innerHTML = `<img src="${ITEMS[s.id].icon}"><b>${s.n > 1 ? s.n : ''}</b>`; d.title = s ? ITEMS[s.id].name : '';
    d.addEventListener('pointerdown', e => { e.stopPropagation(); if (i >= inv.size) return;
      if (panel.style.display === 'flex') { if (pick < 0) { if (inv.slots[i]) pick = i; } else { inv.swap(pick, i); pick = -1; } render(); }
      else { inv.sel = i; render(); } });
    return d; };
  function render() {
    hb.innerHTML = ''; for (let i = 0; i < HOTBAR; i++) hb.appendChild(slotEl(i));
    grid.innerHTML = ''; for (let i = 0; i < 18; i++) grid.appendChild(slotEl(i));
    panel.querySelector('.tier').textContent = `${TIERS[inv.tier].name} · ${inv.slots.slice(0, inv.size).filter(Boolean).length}/${inv.size} slots`;
    panel.querySelector('.wt').textContent = `Weight ${inv.weight().toFixed(1)} kg`;
  }
  inv.onChange = render; render();
  const toggle = (v) => { panel.style.display = (v ?? panel.style.display !== 'flex') ? 'flex' : 'none'; pick = -1; render(); };
  panel.querySelector('.close').addEventListener('pointerdown', e => { e.stopPropagation(); toggle(false); });
  panel.addEventListener('pointerdown', e => { if (e.target === panel) toggle(false); });
  bag.addEventListener('pointerdown', e => { e.stopPropagation(); toggle(); });
  use.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); onUse(); });
  addEventListener('keydown', e => { const k = e.key.toLowerCase();
    if (k === 'tab' || k === 'i') { e.preventDefault(); toggle(); }
    if (k === 'escape') toggle(false);
    if (/^[1-6]$/.test(k)) { inv.sel = +k - 1; render(); } });
  return {
    open: () => panel.style.display === 'flex', toggle,
    prompt: (t) => { prompt.style.display = t ? 'block' : 'none'; if (t) prompt.textContent = t; use.style.opacity = t ? 1 : 0.45; },
    pop: (id, n, text) => { const p = document.createElement('div'); p.className = 'pop'; p.innerHTML = id ? `<img src="${ITEMS[id].icon}">+${n} ${ITEMS[id].name}` : text; document.body.appendChild(p);
      requestAnimationFrame(() => { p.style.transform = 'translate(-50%,-60px)'; p.style.opacity = 0; }); setTimeout(() => p.remove(), 1200); },
  };
}
