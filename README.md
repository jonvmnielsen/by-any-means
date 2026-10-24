# By Any Means

**Survive. Clear the area. By any means necessary.**

Mobile-first browser zombie survival game. The goal is simple: survive and eradicate every zombie in a massive open world.

Play in your mobile browser (or desktop). No install required.

## Core Loop
- Start at a campsite by a lake, off-grid in the forest outside the city.
- Receive disturbing phone messages about something terrible happening in the city.
- First zombies appear. Survival begins.
- Gather resources, build a base, explore, ally with or fight other survivors, clear zones.
- Ultimate goal: reduce the global zombie counter to zero.

## Design Pillars
- **Simple systems, deep world**: Space-based inventory (bigger backpack = more slots), gear-driven power, limited leveling. No complex skill trees, magic, or special abilities.
- **Destructible everything**: Objects, buildings, vehicles can be damaged/destroyed.
- **Sound matters**: Zombies react to noise. Use it for traps or avoid it.
- **Dismemberment**: Shoot arms, legs, or head. Head (or critical) damage is required to fully kill.
- **Base building is core**: Recruit NPCs, defend against hordes (tower-defense style moments), expand.
- **Massive scale**: Designed for a huge map with hundreds of thousands of zombies and many NPCs (streaming / LOD later). Starts small and playable.
- **English language**.

## Art Style
**Direction**: Grounded-inspired — stylized, warm, clear and readable. Not horror, not dark, not blocky Minecraft-style, and not heavy realism.

- **Lighting**: Clear daylight, soft shadows, warm (golden/sunlit) tones. Avoid harsh contrast and heavy dark fog.
- **Colors**: Warm earth, wood, and green tones with clear readability. Blood and gore act as strong red accents against the brighter world, not the overall mood.
- **Models**: Organic stylized low-poly (Asset Forge style). Distinct silhouettes, not hard geometric primitives or Lego blocks. Modular where possible for dismemberment and destruction.
- **Atmosphere**: Adult (violence, blood, consequences) but the world itself stays bright and inviting. Danger comes from the zombies and situations, not from darkness.
- **Asset strategy**: Produce as much as possible ourselves via Asset Forge. Supplement with free/CC0 packs from game-assets (KayKit, Quaternius, Poly Haven etc.), adapted to the style (recolored, warmer lighting). No purchased asset packs.

## Starting Location
Campsite in the forest next to a lake, some distance from the "million city".

## Map Vision (to be built out)
1. Large city (main zombie concentration)
2. Large airport
3. Large military base
4. Rivers from mountains through the city into a large lake
5. Lakes (one large primary + smaller)
6. Secret laboratory / laboratories
7. Small towns and villages
8. Beach
9. Harbor
10. Military outposts
11. Hospital
12. Supermarkets
13. Skyscrapers
14. Farms (small and large)
15. Wildlife / animals
16. Large forests
17. Old mines
18. Resource-rich locations
19. Large quarry
20. Weapons depot

## Systems to Build
- Player movement (mobile-friendly first/third person)
- Inventory (slot-based, stackable items except weapons)
- Weapons & shooting with hit locations
- Zombie AI (sound attraction, hordes)
- Base building & NPC recruitment
- Vehicles (civilian + military)
- Crafting
- Events (helicopter crash, plane crash, convoys, wandering hordes, military clashes, raids, raiders)
- Zombie counters (global + per zone)
- Destructibility

## Current Status (24 Oct 2026)
The game is the former **BAM web v4** (built by Claude, moved here from `asset-forge/web/Claude-Desktop_bam_web_v4` on Jon's decision 24/10). The first prototype (campsite by the lake) is kept untouched in `prototype/`.

What works now (details in `docs/GAME_SYSTEMS.md`):
- 640 × 640 m world: town, filling station, farm, lake, forest, military base, outposts, roadside; 82 zombies plus hordes
- Grid inventory (pockets, vest, belt, backpack with their own grids; turn items 90°), searchable containers, loot on the ground, corpses that keep their gear
- Guns with real magazines and reloading, melee, minigun rig; noise draws zombies
- Food, water, stamina, bleeding and healing; timed actions with a progress bar
- Driving (fuel, car damage, zombies attack the car), doors, crouching under things, climbing onto things, digging with a shovel
- Save game in the browser

## Play
- Online: GitHub Pages for this repo (https://jonvmnielsen.github.io/by-any-means/).
- Locally: `python -m http.server 8000` in this folder, then open http://localhost:8000 (the data files must be served, not opened from disk).
- Keys: WASD move, Shift sprint, C crouch, Space jump/climb, E use, I/Tab inventory, R reload, 1/2/3 weapons, M map. Phones get touch controls.

## Repository layout
| Path | What |
|---|---|
| `index.html`, `game.js`, `inv.js`, `items.js` | the game (three.js r170, no build step) |
| `data/` | world layout, heightmap, model packs (glTF JSON with embedded buffers), containers, item models |
| `chars/`, `gear/` | rigged characters and wearable gear |
| `icons/`, `sfx/` | inventory icons, sound bank |
| `assets.lock.json` | which library asset (path + commit) every model in the game comes from |
| `tools/` | add-on import, item pack builder, headless game test |
| `docs/` | game systems, style direction, game feel, plans and ideas |
| `prototype/` | the first prototype, kept as it was |

## Assets
Only assets from `game-assets/library/` are used. The workflow (Jon marks assets in the asset overview → library status → game) is described in `docs/ASSET_WORKFLOW.md`.
