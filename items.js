// BAM items, loot tables and the grid inventory model (Claude-Desktop 23/10).
// Item instance: { id, n (stack count), r (rounds in a magazine / in a weapon with an internal tube), m (rounds in the magazine loaded
// in a weapon, null = no magazine), fuel (litres in a jerrycan) }. Grid: { w, h, items: [{ it, x, y }] }, sizes in cells.

export const ITEMS = {
  // ---- firearms. slot: primary / sidearm. mag: magazine item id (null = internal tube loaded round by round)
  rifle: { name: 'M4 Carbine', w: 4, h: 2, cat: 'gun', icon: 'rifle', gun: { slot: 'primary', ammo: 'ammo_rifle', mag: 'mag_rifle', cap: 30, dmg: 34, rpm: 700, auto: true,
    spread: 0.022, aimSpread: 0.005, range: 260, snd: 'rifle', anim: 'Rifle', reload: 2.2, model: 'Claude-Desktop_gun_assault_rifle_v4_s1_LOD0', socket: 'socket_hand_r_gun', recoil: 0.012 } },
  pistol: { name: 'Pistol 9 mm', w: 2, h: 1, cat: 'gun', icon: 'pistol', gun: { slot: 'sidearm', ammo: 'ammo_pistol', mag: 'mag_pistol', cap: 15, dmg: 26, rpm: 380, auto: false,
    spread: 0.03, aimSpread: 0.009, range: 90, snd: 'pistol', anim: 'Pistol', reload: 1.6, model: 'Claude-Desktop_gun_pistol_v4_s1_LOD0', socket: 'socket_hand_r_pistol', recoil: 0.02 } },
  shotgun: { name: 'Shotgun', w: 4, h: 1, cat: 'gun', icon: 'shotgun', gun: { slot: 'primary', ammo: 'ammo_shotgun', mag: null, cap: 6, dmg: 14, pellets: 8, rpm: 70, auto: false,
    spread: 0.06, aimSpread: 0.045, range: 45, snd: 'shotgun', anim: 'Shotgun', reload: 0.55, model: 'Claude-Desktop_gun_shotgun_v4_s1_LOD0', socket: 'socket_hand_r_gun', recoil: 0.05 } },
  sniper: { name: 'Hunting Rifle .308', w: 5, h: 1, cat: 'gun', icon: 'sniper', gun: { slot: 'primary', ammo: 'ammo_sniper', mag: 'mag_sniper', cap: 5, dmg: 120, rpm: 45, auto: false,
    spread: 0.03, aimSpread: 0.0008, range: 600, snd: 'sniper', anim: 'Rifle', reload: 2.6, model: 'Claude-Desktop_gun_sniper_v4b_s1_LOD0', socket: 'socket_hand_r_gun', recoil: 0.04, zoom: 3 } },
  // ---- melee (the hands do 34)
  bat: { name: 'Baseball Bat', w: 3, h: 1, cat: 'melee', icon: 'bat', melee: { dmg: 50, time: 0.75, reach: 1.9, model: 'Claude-Desktop_gear_bat_v3_s1_LOD0' } },
  club: { name: 'Club', w: 3, h: 1, cat: 'melee', icon: 'club', melee: { dmg: 45, time: 0.7, reach: 1.85, model: 'Claude-Desktop_gear_club_v3_s1_LOD0' } },
  machete: { name: 'Machete', w: 3, h: 1, cat: 'melee', icon: 'machete', melee: { dmg: 60, time: 0.65, reach: 1.85, model: 'Claude-Desktop_gear_machete_v3_s1_LOD0' } },
  hatchet: { name: 'Hatchet', w: 2, h: 1, cat: 'melee', icon: 'hatchet', melee: { dmg: 55, time: 0.7, reach: 1.7, model: 'Claude-Desktop_gear_hatchet_v3b_s1_LOD0' } },
  felling_axe: { name: 'Felling Axe', w: 4, h: 1, cat: 'melee', icon: 'felling_axe', melee: { dmg: 85, time: 1.1, reach: 2.0, model: 'Claude-Desktop_gear_felling_axe_v3_s1_LOD0' } },
  hammer: { name: 'Hammer', w: 2, h: 1, cat: 'melee', icon: 'hammer', melee: { dmg: 40, time: 0.6, reach: 1.7, model: 'Claude-Desktop_gear_hammer_v3_s1_LOD0' } },
  shovel: { name: 'Shovel', w: 4, h: 1, cat: 'melee', icon: 'shovel', melee: { dmg: 50, time: 0.9, reach: 2.0, model: 'Claude-Desktop_gear_shovel_v3_s1_LOD0' }, use: { dig: true, time: 2.2, verb: 'Dig' } },
  // ---- ammunition and magazines (counted exactly)
  ammo_pistol: { name: '9 mm Rounds', w: 1, h: 1, cat: 'ammo', icon: 'ammo_pistol', stack: 50 },
  ammo_rifle: { name: '5.56 mm Rounds', w: 1, h: 1, cat: 'ammo', icon: 'ammo_rifle', stack: 60 },
  ammo_shotgun: { name: 'Shotgun Shells', w: 1, h: 1, cat: 'ammo', icon: 'ammo_shotgun', stack: 24 },
  ammo_sniper: { name: '.308 Rounds', w: 1, h: 1, cat: 'ammo', icon: 'ammo_sniper', stack: 20 },
  mag_rifle: { name: '5.56 mm Magazine', w: 1, h: 2, cat: 'mag', icon: 'mag_rifle', mag: { ammo: 'ammo_rifle', cap: 30 } },
  mag_pistol: { name: '9 mm Magazine', w: 1, h: 1, cat: 'mag', icon: 'mag_pistol', mag: { ammo: 'ammo_pistol', cap: 15 } },
  mag_sniper: { name: '.308 Magazine', w: 1, h: 1, cat: 'mag', icon: 'mag_sniper', mag: { ammo: 'ammo_sniper', cap: 5 } },
  mag_smg: { name: '9 mm Magazine (30)', w: 1, h: 2, cat: 'mag', icon: 'mag_smg', mag: { ammo: 'ammo_pistol', cap: 30 } },
  // ---- medical. use: time (s), hp, heal over time (hot), stops bleeding
  bandage: { name: 'Bandage', w: 1, h: 1, cat: 'med', icon: 'bandage', stack: 4, use: { time: 3, hp: 20, bleed: true, verb: 'Use' } },
  pills: { name: 'Painkillers', w: 1, h: 1, cat: 'med', icon: 'pills', stack: 3, use: { time: 1.5, hot: 20, verb: 'Take' } },
  medkit: { name: 'First Aid Kit', w: 2, h: 2, cat: 'med', icon: 'medkit', use: { time: 8, hp: 60, bleed: true, verb: 'Use' } },
  // ---- food and drink (food / water in % of the bar)
  can_beans: { name: 'Canned Beans', w: 1, h: 1, cat: 'food', icon: 'can_beans', use: { time: 4, food: 32, water: 4, verb: 'Eat' } },
  can_fish: { name: 'Canned Mackerel', w: 1, h: 1, cat: 'food', icon: 'can_fish', use: { time: 4, food: 35, verb: 'Eat' } },
  can_peach: { name: 'Canned Peaches', w: 1, h: 1, cat: 'food', icon: 'can_peach', use: { time: 4, food: 20, water: 15, verb: 'Eat' } },
  can_tomato: { name: 'Canned Tomatoes', w: 1, h: 1, cat: 'food', icon: 'can_tomato', use: { time: 4, food: 22, water: 10, verb: 'Eat' } },
  berries: { name: 'Blueberries', w: 1, h: 1, cat: 'food', icon: 'berries', stack: 5, use: { time: 1.5, food: 7, water: 3, verb: 'Eat' } },
  mre: { name: 'MRE', w: 1, h: 2, cat: 'food', icon: 'mre', use: { time: 6, food: 55, water: -5, verb: 'Eat' } },
  chocolate: { name: 'Chocolate Bar', w: 1, h: 1, cat: 'food', icon: 'chocolate', stack: 3, use: { time: 2, food: 14, verb: 'Eat' } },
  bottle: { name: 'Water Bottle', w: 1, h: 2, cat: 'drink', icon: 'bottle', use: { time: 3, water: 45, verb: 'Drink' } },
  soda: { name: 'Soda', w: 1, h: 1, cat: 'drink', icon: 'soda', stack: 2, use: { time: 2, water: 25, food: 4, verb: 'Drink' } },
  food_crate: { name: 'Food Crate', w: 3, h: 2, cat: 'food', icon: 'food_crate', use: { time: 3, unpack: ['can_beans', 'can_fish', 'can_peach', 'can_tomato'], verb: 'Unpack' } },
  // ---- equipment you wear (grid = extra storage it gives, armor = share of zombie damage it stops)
  helmet: { name: 'Kevlar Helmet', w: 2, h: 2, cat: 'gear', icon: 'helmet', gear: { slot: 'head', armor: 0.1, show: 'helmet' } },
  vest: { name: 'Plate Carrier', w: 3, h: 3, cat: 'gear', icon: 'vest', gear: { slot: 'vest', armor: 0.3, grid: [3, 2], show: 'vest' } },
  chestrig: { name: 'Chest Rig', w: 3, h: 3, cat: 'gear', icon: 'chestrig', gear: { slot: 'vest', armor: 0, grid: [4, 3], show: 'chestrig' } },
  belt: { name: 'Pistol Belt', w: 3, h: 1, cat: 'gear', icon: 'belt', gear: { slot: 'belt', grid: [4, 1], show: 'belt' } },
  backpack: { name: 'Backpack', w: 4, h: 4, cat: 'gear', icon: 'backpack', gear: { slot: 'pack', grid: [6, 5], show: 'pack' } },
  // ---- clothes (can be carried; wearing comes later)
  jacket: { name: 'Jacket', w: 2, h: 2, cat: 'clothes', icon: 'jacket' },
  hoodie: { name: 'Hoodie', w: 2, h: 2, cat: 'clothes', icon: 'hoodie' },
  trousers: { name: 'Trousers', w: 2, h: 2, cat: 'clothes', icon: 'trousers' },
  boots: { name: 'Boots', w: 2, h: 2, cat: 'clothes', icon: 'boots' },
  // ---- tools, resources, misc
  flashlight: { name: 'Flashlight', w: 2, h: 1, cat: 'tool', icon: 'flashlight' },
  batteries: { name: 'Batteries', w: 1, h: 1, cat: 'misc', icon: 'batteries', stack: 4 },
  radio: { name: 'Radio', w: 1, h: 2, cat: 'misc', icon: 'radio' },
  book: { name: 'Book', w: 1, h: 2, cat: 'misc', icon: 'book' },
  scrap: { name: 'Scrap', w: 1, h: 1, cat: 'misc', icon: 'scrap', stack: 10 },
  stone: { name: 'Stone', w: 1, h: 1, cat: 'misc', icon: 'stone', stack: 10 },
  firewood: { name: 'Firewood', w: 2, h: 2, cat: 'misc', icon: 'firewood' },
  log: { name: 'Log', w: 4, h: 1, cat: 'misc', icon: 'log' },
  jerrycan: { name: 'Jerrycan', w: 3, h: 3, cat: 'fuel', icon: 'jerrycan', fuel: 20, use: { time: 3, refuel: true, verb: 'Fuel vehicle' } },
};
// ---- SurrounDead-style items (Jon's SD branch). 'like' copies the behaviour of one of ours; icon + world model are their own.
const SD = {
  sd_gun_pistol: ['pistol', { name: 'Pistol (SD)', gun: { dmg: 30 } }],
  sd_gun_revolver: ['pistol', { name: 'Revolver', gun: { mag: null, cap: 6, dmg: 70, rpm: 110, recoil: 0.04, reload: 0.45 } }],
  sd_gun_smg: ['rifle', { name: 'SMG', w: 3, h: 2, gun: { slot: 'primary', ammo: 'ammo_pistol', mag: 'mag_smg', cap: 30, dmg: 22, rpm: 800, spread: 0.035, aimSpread: 0.012, range: 70, snd: 'pistol', recoil: 0.008 } }],
  sd_gun_shotgun: ['shotgun', { name: 'Shotgun (SD)' }],
  sd_gun_hunting_rifle: ['sniper', { name: 'Hunting Rifle (SD)', gun: { mag: null, cap: 5, dmg: 120, anim: 'Rifle', reload: 0.6 } }],
  sd_gun_assault_rifle: ['rifle', { name: 'Assault Rifle' }],
  sd_gun_assault_rifle_tan: ['rifle', { name: 'Assault Rifle (Tan)' }],
  sd_melee_bat: ['bat', { name: 'Nail Bat', melee: { dmg: 55 } }],
  sd_melee_fire_axe: ['felling_axe', { name: 'Fire Axe', melee: { dmg: 85, time: 0.95 } }],
  sd_melee_machete: ['machete', { name: 'Machete (SD)' }],
  sd_melee_crowbar: ['club', { name: 'Crowbar', melee: { dmg: 45, time: 0.65 } }],
  sd_melee_knife: ['hatchet', { name: 'Combat Knife', w: 2, h: 1, melee: { dmg: 40, time: 0.45, reach: 1.5 } }],
  sd_ammo_9mm: ['ammo_pistol', { name: '9 mm Rounds (SD)' }],
  sd_ammo_shells: ['ammo_shotgun', { name: 'Shotgun Shells (SD)' }],
  sd_ammo_308: ['ammo_sniper', { name: '.308 Rounds (SD)' }],
  sd_ammo_magazine: ['mag_rifle', { name: '5.56 Magazine (SD)' }],
  sd_ammo_can: [null, { name: 'Ammo Can', w: 2, h: 2, cat: 'misc', use: { time: 2, unpackN: [['ammo_rifle', 60], ['ammo_rifle', 30]], verb: 'Open' } }],
  sd_med_bandage: ['bandage', { name: 'Field Dressing' }],
  sd_med_pills: ['pills', { name: 'Painkillers (SD)' }],
  sd_med_injector: [null, { name: 'Adrenaline Pen', w: 1, h: 1, cat: 'med', use: { time: 1, hp: 35, stam: 100, verb: 'Use' } }],
  sd_med_splint: [null, { name: 'Splint', w: 2, h: 1, cat: 'med', use: { time: 5, hp: 8, verb: 'Use' } }],
  sd_med_kit: ['medkit', { name: 'First Aid Kit (SD)' }],
  sd_gear_helmet: ['helmet', { name: 'Helmet (SD)', gear: { armor: 0.15 } }],
  sd_gear_plate_carrier: ['vest', { name: 'Plate Carrier (SD)' }],
  sd_gear_backpack: ['backpack', { name: 'Backpack (SD)', gear: { grid: [5, 5] } }],
  sd_gear_flashlight: ['flashlight', { name: 'Flashlight (SD)' }],
  sd_gear_radio: ['radio', { name: 'Walkie-Talkie' }],
  sd_gear_canteen: [null, { name: 'Canteen', w: 1, h: 2, cat: 'drink', use: { time: 3, water: 40, verb: 'Drink' } }],
  sd_gear_gasmask: [null, { name: 'Gas Mask', w: 2, h: 2, cat: 'misc' }],
  sd_gear_binoculars: [null, { name: 'Binoculars', w: 2, h: 1, cat: 'tool' }],
  sd_food_can_beans: ['can_beans', { name: 'Canned Beans (SD)' }],
  sd_food_can_soup: [null, { name: 'Canned Soup', w: 1, h: 1, cat: 'food', use: { time: 4, food: 25, water: 15, verb: 'Eat' } }],
  sd_food_water: ['bottle', { name: 'Water Bottle (SD)' }],
  sd_food_mre: ['mre', { name: 'MRE (SD)' }],
  sd_minigun_case: [null, { name: 'Minigun Case', w: 4, h: 3, cat: 'deploy', use: { time: 0, deploy: 'minigun', verb: 'Deploy' } }],
};
for (const [id, [like, o]] of Object.entries(SD)) {
  const base = like ? ITEMS[like] : {}; const d = { ...base, ...o, icon: id, model: 'Claude-Desktop_' + id.replace('sd_', 'SD_'), sd: true, kind: like || id };
  for (const k of ['gun', 'melee', 'gear', 'use', 'mag']) if (base[k] || o[k]) d[k] = { ...(base[k] || {}), ...(o[k] || {}) };
  if (d.melee) delete d.melee.model; if (d.gun) delete d.gun.model;
  ITEMS[id] = d;
}
for (const [id, d] of Object.entries(ITEMS)) { d.id = id; d.stack = d.stack || 1; if (!d.model) d.model = 'Claude-Desktop_item_' + id; if (!d.kind) d.kind = id; }   // kind: SD items count as the item they are like (ammo, magazines)
export const SD_ID = (key) => 'sd_' + key.replace('Claude-Desktop_', '').replace(/^SD_/, '');

// ---- loot tables: [item id, weight, min count, max count]
export const LOOT = {
  generic: [['scrap', 4, 1, 4], ['batteries', 2, 1, 4], ['book', 1, 1, 1], ['chocolate', 2, 1, 2], ['bottle', 2, 1, 1], ['flashlight', 1, 1, 1], ['jacket', 1, 1, 1], ['soda', 1, 1, 2], ['hammer', 0.5, 1, 1]],
  bedroom: [['jacket', 2, 1, 1], ['hoodie', 2, 1, 1], ['trousers', 2, 1, 1], ['book', 2, 1, 1], ['pills', 2, 1, 2], ['batteries', 1, 1, 4], ['flashlight', 1, 1, 1], ['ammo_pistol', 0.6, 5, 15], ['pistol', 0.15, 1, 1], ['chocolate', 1, 1, 2]],
  books: [['book', 6, 1, 1], ['batteries', 1, 1, 2], ['radio', 0.5, 1, 1]],
  register: [['chocolate', 4, 1, 3], ['batteries', 3, 1, 4], ['soda', 2, 1, 2], ['pills', 1, 1, 2], ['ammo_pistol', 0.3, 4, 12]],
  office: [['batteries', 3, 1, 4], ['book', 2, 1, 1], ['radio', 1, 1, 1], ['pills', 1, 1, 2], ['chocolate', 1, 1, 2], ['flashlight', 1, 1, 1]],
  drinks: [['soda', 6, 1, 2], ['bottle', 4, 1, 1]],
  fridge: [['soda', 3, 1, 2], ['bottle', 3, 1, 1], ['can_peach', 1, 1, 1], ['can_tomato', 1, 1, 1], ['berries', 1, 1, 3]],
  kitchen: [['can_beans', 3, 1, 1], ['can_fish', 3, 1, 1], ['can_peach', 2, 1, 1], ['can_tomato', 2, 1, 1], ['bottle', 2, 1, 1], ['soda', 1, 1, 2], ['machete', 0.3, 1, 1], ['scrap', 1, 1, 2]],
  bathroom: [['pills', 4, 1, 2], ['bandage', 4, 1, 3], ['medkit', 0.4, 1, 1]],
  living: [['batteries', 2, 1, 4], ['book', 2, 1, 1], ['chocolate', 2, 1, 2], ['soda', 1, 1, 1], ['radio', 0.6, 1, 1], ['ammo_pistol', 0.3, 3, 10], ['bat', 0.4, 1, 1]],
  shop_food: [['can_beans', 4, 1, 1], ['can_fish', 4, 1, 1], ['can_peach', 3, 1, 1], ['can_tomato', 3, 1, 1], ['chocolate', 3, 1, 3], ['soda', 3, 1, 2], ['bottle', 3, 1, 1], ['food_crate', 0.5, 1, 1]],
  clothes: [['jacket', 3, 1, 1], ['hoodie', 3, 1, 1], ['trousers', 3, 1, 1], ['boots', 2, 1, 1], ['backpack', 0.6, 1, 1], ['belt', 0.3, 1, 1]],
  tools: [['hammer', 3, 1, 1], ['hatchet', 2, 1, 1], ['shovel', 1, 1, 1], ['felling_axe', 0.8, 1, 1], ['flashlight', 2, 1, 1], ['batteries', 2, 1, 4], ['scrap', 3, 1, 5], ['machete', 1, 1, 1]],
  locker: [['jacket', 2, 1, 1], ['hoodie', 2, 1, 1], ['boots', 1, 1, 1], ['bat', 1, 1, 1], ['flashlight', 1, 1, 1], ['chocolate', 2, 1, 2], ['pills', 1, 1, 2], ['bandage', 1, 1, 2], ['backpack', 0.4, 1, 1], ['ammo_pistol', 0.4, 4, 12]],
  farm: [['berries', 3, 1, 5], ['hatchet', 1, 1, 1], ['shovel', 2, 1, 1], ['felling_axe', 1, 1, 1], ['scrap', 2, 1, 4], ['firewood', 2, 1, 1], ['ammo_shotgun', 1, 3, 10], ['shotgun', 0.3, 1, 1], ['jerrycan', 0.6, 1, 1]],
  fuel: [['jerrycan', 6, 1, 1], ['scrap', 1, 1, 2]],
  electronics: [['radio', 4, 1, 1], ['batteries', 4, 1, 4], ['flashlight', 2, 1, 1]],
  ammo: [['ammo_rifle', 5, 15, 60], ['ammo_pistol', 3, 10, 40], ['ammo_shotgun', 1, 5, 18], ['ammo_sniper', 1, 5, 15], ['mag_rifle', 2, 1, 1], ['mag_pistol', 1, 1, 1]],
  weapons_military: [['rifle', 5, 1, 1], ['pistol', 3, 1, 1], ['sniper', 1, 1, 1], ['shotgun', 1, 1, 1], ['mag_rifle', 4, 1, 2], ['mag_pistol', 2, 1, 2], ['mag_sniper', 1, 1, 1]],
  military_personal: [['mre', 3, 1, 1], ['bandage', 3, 1, 2], ['bottle', 2, 1, 1], ['mag_rifle', 2, 1, 1], ['ammo_rifle', 2, 10, 30], ['ammo_pistol', 1, 8, 20], ['hoodie', 1, 1, 1], ['boots', 1, 1, 1], ['flashlight', 1, 1, 1], ['helmet', 0.4, 1, 1], ['chestrig', 0.3, 1, 1], ['belt', 0.5, 1, 1]],
  military_light: [['mre', 3, 1, 1], ['bottle', 2, 1, 1], ['bandage', 2, 1, 2], ['ammo_rifle', 2, 10, 30], ['mag_rifle', 1, 1, 1], ['jerrycan', 1, 1, 1], ['medkit', 0.5, 1, 1]],
  military: [['mre', 3, 1, 1], ['ammo_rifle', 3, 15, 45], ['mag_rifle', 3, 1, 2], ['bandage', 2, 1, 3], ['medkit', 1, 1, 1], ['bottle', 2, 1, 1], ['rifle', 0.8, 1, 1], ['helmet', 0.6, 1, 1], ['vest', 0.4, 1, 1], ['chestrig', 0.5, 1, 1], ['backpack', 0.5, 1, 1], ['jerrycan', 0.8, 1, 1], ['ammo_sniper', 0.5, 5, 10]],
  military_supply: [['mre', 4, 1, 2], ['bottle', 3, 1, 1], ['ammo_rifle', 4, 30, 60], ['ammo_pistol', 2, 15, 40], ['mag_rifle', 3, 1, 2], ['medkit', 1, 1, 1], ['bandage', 2, 1, 4], ['helmet', 1, 1, 1], ['vest', 0.8, 1, 1], ['chestrig', 1, 1, 1], ['backpack', 1, 1, 1], ['belt', 1, 1, 1], ['jerrycan', 1, 1, 1], ['rifle', 0.5, 1, 1], ['ammo_sniper', 0.6, 5, 15]],
  // ---- pockets by former life (zombies keep theirs)
  life_civil: [['chocolate', 3, 1, 1], ['batteries', 2, 1, 2], ['pills', 1, 1, 1], ['bandage', 1, 1, 1], ['soda', 1, 1, 1], ['ammo_pistol', 0.4, 2, 9], ['flashlight', 0.5, 1, 1]],
  life_soldier: [['mag_rifle', 4, 1, 1], ['ammo_rifle', 2, 4, 20], ['bandage', 3, 1, 2], ['mre', 2, 1, 1], ['mag_pistol', 1, 1, 1], ['ammo_pistol', 1, 3, 12]],
};

// ---- seeded random (mulberry32) and string hash
export function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// a new item instance; loose magazines and found guns get a random part-full load
export function make(id, n = 1, R = Math.random) {
  const d = ITEMS[id]; const it = { id, n: Math.min(n, d.stack) };
  if (d.mag) it.r = Math.floor(R() * (d.mag.cap + 1));
  if (d.gun) { if (d.gun.mag) it.m = R() < 0.6 ? Math.floor(R() * (d.gun.cap + 1)) : null; else it.r = Math.floor(R() * (d.gun.cap + 1)); }
  if (d.fuel) it.fuel = Math.round(4 + R() * (d.fuel - 4));
  return it;
}

// ---- grids
export const SLOT_GRID = { 1: [2, 1], 2: [2, 2], 3: [3, 2], 4: [4, 2], 6: [4, 3], 8: [4, 4], 10: [5, 4], 16: [8, 4], 20: [8, 5] };
export function gridForSlots(s) { if (SLOT_GRID[s]) return SLOT_GRID[s]; const w = Math.min(8, Math.max(2, Math.ceil(Math.sqrt(s * 2) * 1.2))); return [w, Math.ceil((s * 2) / w)]; }
export function newGrid(w, h) { return { w, h, items: [] }; }
// an entry can lie turned 90° (e.r): then its width and height swap
export function dims(e) { const d = ITEMS[e.it.id]; return e.r ? [d.h, d.w] : [d.w, d.h]; }
export function fits(g, w, h, x, y, ignore) {
  if (x < 0 || y < 0 || x + w > g.w || y + h > g.h) return false;
  for (const e of g.items) { if (e === ignore) continue; const [ew, eh] = dims(e); if (x < e.x + ew && e.x < x + w && y < e.y + eh && e.y < y + h) return false; }
  return true;
}
export function findSpot(g, id) { const d = ITEMS[id];
  for (let y = 0; y <= g.h - d.h; y++) for (let x = 0; x <= g.w - d.w; x++) if (fits(g, d.w, d.h, x, y)) return [x, y, false];
  if (d.w !== d.h) for (let y = 0; y <= g.h - d.w; y++) for (let x = 0; x <= g.w - d.h; x++) if (fits(g, d.h, d.w, x, y)) return [x, y, true];   // turned
  return null; }
// add to a grid: tops up stacks first, then free spots; returns what did not fit (null = all in)
export function addToGrid(g, it) {
  const d = ITEMS[it.id];
  if (d.stack > 1) for (const e of g.items) if (e.it.id === it.id && e.it.n < d.stack) { const k = Math.min(it.n, d.stack - e.it.n); e.it.n += k; it.n -= k; if (!it.n) return null; }
  while (it.n > 0) { const s = findSpot(g, it.id); if (!s) return it; const take = Math.min(it.n, d.stack); const part = { ...it, n: take }; const e = { it: part, x: s[0], y: s[1] }; if (s[2]) e.r = true; g.items.push(e); it.n -= take; }
  return null;
}
export const kindOf = (id) => (ITEMS[id] ? ITEMS[id].kind : id);
export function count(grids, kind) { let c = 0; for (const g of grids) for (const e of g.items) if (kindOf(e.it.id) === kind) c += e.it.n; return c; }
export function take(grids, id, n) {       // removes up to n of id across grids, returns how many were taken
  let got = 0; for (const g of grids) for (const e of [...g.items]) { if (got >= n) break; if (kindOf(e.it.id) !== id) continue; const k = Math.min(n - got, e.it.n); e.it.n -= k; got += k; if (!e.it.n) g.items.splice(g.items.indexOf(e), 1); }
  return got;
}

// fill a grid from a loot table; the roll count scales with the size of the grid
export function rollInto(g, table, R, extra = 0) {
  const T = LOOT[table] || LOOT.generic; const tot = T.reduce((a, t) => a + t[1], 0);
  const cells = g.w * g.h; const rolls = Math.max(0, Math.round((0.25 + R() * 0.6) * Math.sqrt(cells) * 1.2) + extra - (R() < 0.18 ? 9 : 0));
  for (let k = 0; k < rolls; k++) { let p = R() * tot; let t = T[0]; for (const e of T) { p -= e[1]; if (p <= 0) { t = e; break; } }
    const n = t[2] + Math.floor(R() * (t[3] - t[2] + 1)); const it = make(t[0], n, R); addToGrid(g, it); }
  return g;
}
export function describe(it) {
  const d = ITEMS[it.id]; const parts = [];
  if (d.stack > 1) parts.push(`${it.n} pcs`);
  if (d.mag) parts.push(`${it.r}/${d.mag.cap} rounds`);
  if (d.gun) parts.push(d.gun.mag ? (it.m == null ? 'no magazine' : `magazine ${it.m}/${d.gun.cap}`) : `${it.r}/${d.gun.cap} in the tube`);
  if (d.fuel) parts.push(`${it.fuel} l`);
  if (d.use) { const u = d.use; const b = []; if (u.food > 0) b.push(`food +${u.food}`); if (u.water > 0) b.push(`water +${u.water}`); if (u.hp) b.push(`health +${u.hp}`); if (u.hot) b.push(`health +${u.hot} over time`); if (u.bleed) b.push('stops bleeding'); if (b.length) parts.push(b.join(', ')); }
  if (d.gear) { if (d.gear.armor) parts.push(`protects ${Math.round(d.gear.armor * 100)} %`); if (d.gear.grid) parts.push(`space ${d.gear.grid[0]}×${d.gear.grid[1]}`); }
  if (d.melee) parts.push(`damage ${d.melee.dmg}`);
  if (d.gun) parts.push(`damage ${d.gun.dmg}${d.gun.pellets ? ' × ' + d.gun.pellets : ''}`);
  if (d.cat === 'clothes') parts.push('cannot be worn yet');
  return parts.join(' · ');
}
