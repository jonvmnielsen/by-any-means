# By Any Means – Grafisk retning ud fra spillets krav

*Udarbejdet af Grok Bot, 18. oktober 2026. Analyse og anbefaling, intet i koden er ændret. Hører sammen med `docs/GAME_FEEL_Grok-Bot.md`.*

## 1. Kravene, der bestemmer stilen
1. **Ragdoll**: døde zombier og mennesker skal falde troværdigt.
2. **Dismemberment**: arme, ben og hoveder skal kunne skydes og hugges af, og kun hovedet dræber rigtigt. Det skal læses tydeligt og være **voksent, men ikke splatter-pornografisk eller barnligt**.
3. **Alt kan smadres**: objekter, bygninger og køretøjer.
4. **Tydelig feedback** på alt (se GAME_FEEL).
5. **Mobil i browseren**: Three.js/WebGL2 på en mellemklasse-telefon, og på sigt hundredvis af zombier synlige ad gangen.
6. **Vores pipeline**: konceptbillede → image-to-3D (Pixal3D/TRELLIS.2 i AssetFurnace) → part-by-part i Blender (14 dele, skelet, caps, farver) → GLB. Den skal give **ensartede** resultater.
7. **Stemning**: voksen, varm og indbydende verden, hvor faren kommer fra zombier og situationer, ikke fra mørke (README → Art Style).

## 2. De fem retninger, der er sammenlignet
| # | Retning | Reference (fra vores referencesæt) |
|---|---|---|
| A | **Grounded-lignende stiliseret** (store hoveder/hænder, bløde former, mættede farver) | [Grounded](https://store.steampowered.com/app/962130) |
| B | **Stiliseret-realistisk** (realistiske proportioner, forenklede former, malet/bagt albedo, varmt lys) | [State of Decay 2](https://store.steampowered.com/app/495420), World War Z |
| C | **Low-poly Synty POLYGON** (facetter, flade farver fra én palet) | [Synty POLYGON Apocalypse](https://syntystore.com/products/polygon-apocalypse-pack) |
| D | **Sidekick/Fortnite-lignende** (chunky, rene farvefelter, store hoveder) | [Synty Sidekick Apocalypse Zombies](https://syntystore.com/products/apocalypse-zombies-sidekick-modular-characters) |
| E | **AAA-realistisk** (PBR, skulpteret anatomi, detaljerede sår) | State of Decay 3, Dead Island 2 ([FLESH](https://gameinformer.com/exclusive-interview/2023/01/30/how-dead-island-2s-flesh-system-procedurally-breaks-skin-and-bones)) |

## 3. Sammenligning (1 = dårligt, 5 = bedst for BAM)

| Kriterium | A Grounded | B Stil.-realistisk | C POLYGON | D Sidekick | E AAA |
|---|---|---|---|---|---|
| **Dismemberment læses tydeligt** | 4 | 5 | 4 | 4 | 5 |
| **Gore bliver voksen og smagfuld (ikke barnlig, ikke for meget)** | 2 – store hoveder og bløde former får afhugning til at virke komisk eller forkert, og det skaber en "tegnefilm med blod"-konflikt | **5** – blod kan være mat og mørkerødt, stumper simple, men troværdige. Det ligner SoD2 | 3 – flade farver gør gore stiliseret og distanceret. Virker, men bliver let "legetøj" | 2 – som A, endnu mere Fortnite | 4 – læses stærkt, men risikerer at blive for grafisk og kræver mere arbejde for at være smagfuldt |
| **Ragdoll-troværdighed** | 2 – overdrevne proportioner (tungt hoved, korte lemmer) ragdoller fjollet | **5** – realistiske proportioner = rigtige led og masser | 4 – proportionerne er realistiske, og facetterne er ligegyldige for fysikken | 2 – som A | 5 |
| **Ødelæggelse (fraktur)** | 4 – bløde, simple former frakturerer pænt | 4 – forenklede former og enkel albedo gør brikker billige | **5** – facetter og flade farver: brudflader ser "rigtige" ud uden ekstra textur | 4 | 2 – kræver detaljerede indre materialer, debris, mange brikker |
| **Ydelse på mobil-WebGL** | 4 | 4 | **5** – 1 palet-textur, få tris | 4 | 1 – PBR-maps (albedo+normal+ORM) ×4 hukommelse, høje tris, fill-bound |
| **Feedback læses** (silhuet, kontrast, blodaccent) | **5** | 4 | 4 | 5 | 3 – detaljestøj drukner hits på en lille skærm |
| **Produktionspris / ensartethed med vores pipeline** | 3 – image-to-3D giver realistiske former. Der skal trækkes meget for at få stiliserede proportioner | **5** – det, image-to-3D er bedst til (vores ref1/ref3 var de bedste), og part-by-part kan holde proportionerne ens | 3 – kræver en ekstra decimerings- og omfarvningsproces. Vores POLYGON-forsøg fik "plettede" farver, før de blev rettet | 3 – som A | 1 – kræver håndskulptering og teksturering i uger per figur |
| **Voksen stemning** | 3 – kan blive voksen med lys og palet, men proportionerne trækker mod "børnespil" | **5** | 3 | 2 | 5 |
| **Sum (af 40)** | 27 | **37** | 31 | 26 | 26 |

### Kort om hver
- **A Grounded-lignende**: Den bedste til **læsbarhed og varm farve**, og det var derfor, den blev valgt. Men Grounded er et spil uden gore, og stiliseringen (store hoveder og hænder) er det, der gør den barnlig. Kombineret med afhugning og headshots bliver det enten komisk eller ubehageligt. Ragdoll med tunge hoveder ser fjollet ud. **Lys, palet og læsbarhed fra Grounded er værd at beholde. Proportionerne er ikke.**
- **B Stiliseret-realistisk**: Realistiske voksne proportioner (7–7,5 hoveder høje), forenklede former uden mikrodetaljer, albedo med malede/bagte skygger og simpel belysning (Lambert/Toon-light, ingen fuld PBR). Det er **den retning, der opfylder flest krav på én gang**, og den, vores pipeline allerede leverer bedst (ref1 SoD2 og ref3 WWZ var blandt de bedste resultater).
- **C POLYGON**: Billigst at køre og bedst til ødelæggelse. Den er en **god plan B / LOD-stil** for fjerne zombier og miljø, men gore og stemning bliver mere "indie-legetøj", og den stemmer mindre med Jons ønske om høj kvalitet og "blødt, lækkert".
- **D Sidekick/Fortnite**: Kører godt og læses godt, men er den mest barnlige. Fravælges på grund af kravet om voksenhed.
- **E AAA**: Bedst til gore og stemning, men umulig i mobilbrowseren og for vores produktionskapacitet. Dead Island 2's FLESH-system kører på næste generations konsoller i 4K/60 ([AusGamers](https://www.ausgamers.com/features/read/3641999)). Fravælges som retning. **Principperne** (våbenafhængige sår, lag) kan godt bruges billigt.

## 4. Anbefaling: **"Varm stiliseret realisme"** (B med Grounded-lys)

> **Proportioner og former fra State of Decay / WWZ, lys, palet og læsbarhed fra Grounded.**

Det betyder:
- **Figurer**: realistiske voksne proportioner (ikke store hoveder), tydelige silhuetter, store sekundære former (folder, lommer, hår i totter) og **ingen mikrodetaljer** i geometrien. Detaljer males eller bages ind i albedo.
- **Lys**: varmt dagslys, bløde skygger, ACES-tonemapping (bruges allerede). Natten er blålig, men ikke kulsort.
- **Farver**: varme jord-, træ- og grønne toner i verden. Zombier i dæmpet blegt grå-gult/oliven med varierende hudfarve. **Blod er den eneste mættede røde accent** (README-princippet) og er mat, mørkerødt (`#7A0F0C`–`#A3201A`), aldrig neonrødt.
- **Gore**: troværdigt men kontrolleret: stumper med cap (kød + knoglering), blodstråle i kort tid, pøl og decals. **Ingen indvolde eller organer**. Gore-skyder i indstillinger (fuld/reduceret).
- **Fjernt/horde**: skift til C-lignende low-poly LOD og impostors (de skal ses fra afstand, så facetter kan ikke ses). Det giver os POLYGON's ydelse, hvor den betyder mest.

**Hvorfor ikke ren Grounded?** Spillet er bygget omkring drab, afhugning og konsekvenser. Med Grounded-proportioner ville vi kæmpe mod stilen hver gang, en arm flyver af. Med stiliseret realisme arbejder stilen **med** os: ragdolls ser rigtige ud, gore er voksent, image-to-3D leverer det naturligt, og det varme lys holder verden indbydende. Grounded-retningen fra README bevares i lys, farve og læsbarhed, så **det er en justering, ikke et skift**: kun proportionerne og graden af stilisering ændres.

## 5. Konkrete asset-specs

### 5.1 Trekantbudgetter (LOD0 / LOD1 / LOD2)
| Asset-type | LOD0 desktop | LOD0 mobil | LOD1 | LOD2 / fjernt |
|---|---|---|---|---|
| Spiller | 15–20k | 10–12k | 5k | – |
| NPC / militær / raider | 10–14k | 7–9k | 3,5k | 800 |
| Zombie (standard) | 8–12k | 6–8,5k (vores `_lo` ligger på ~8,5k) | 3k | 600–800 / impostor |
| Horde-zombie (>40 m) | – | – | – | 300–600, instanced, ingen dismemberment |
| Dyr, lille (kanin, fugl) | 2–3k | 1,5k | 600 | – |
| Dyr, stort (hjort, ulv, bjørn) | 6–9k | 4–6k | 2k | 500 |
| Skydevåben (i hånden) | 3–6k | 2–3k | 800 | 200 (på jorden) |
| Nærkampsvåben / værktøj | 1–2k | 0,8–1,5k | 400 | 150 |
| Mad, små ting | 200–800 | 200–600 | 150 | – |
| Props (kasser, tønder, møbler) | 500–2k | 400–1,5k | 300 | 100 |
| Køretøj | 15–25k | 8–12k | 4k | 1k |
| Bygningsmodul (væg, gulv, tag) | 200–2k | samme | 150–500 | merged/batched |
| Træ | 3–5k | 1,5–3k | 800 | billboard |

**Ramme for scenen på mobil**: ≤ 300–500k synlige trekanter, ≤ 100–150 draw calls ([three.js-præstationsråd](https://masterallarts.com/learn/threejs-from-zero/09-performance-instancing-lod/), [BatchedMesh](https://threejs.org/docs/pages/BatchedMesh.html), [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)). Figurer = **2 draw calls** (krop + caps), som vi allerede har.

### 5.2 Teksturer og materialer
- **Én albedo-textur per figur** (1024² desktop, 512² mobil), med malede/bagte AO og skygger. **Ingen normal- eller ORM-maps** på figurer (sparer 2/3 af texturhukommelsen). Eventuel normalmap kun på spillerens våben.
- **Fælles zombie-atlas** (2048² med 4 kropsvarianter), plus variation via `tint`-uniform og vertex-farver (findes: per-zombie tint) → mange forskellige zombier med få teksturer.
- **Fælles gore-atlas** 512²: kødcap, knoglering, sår-maske, blodspray, decal-sprites. Deles af alle figurer.
- **Miljø**: trim-sheets/palet-atlas 1024–2048² per biom. Props deler atlas → `BatchedMesh`/merge.
- **Komprimering**: KTX2/Basis ([KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html)) og meshopt-komprimeret geometri ([meshoptimizer/gltfpack](https://github.com/zeux/meshoptimizer)). Mål: < 2 MB per figur-GLB på mobil.
- **Shading**: `MeshLambertMaterial`/simpel custom shader (som nu) med rim-lys til læsbarhed. PBR (`MeshStandardMaterial`) kun til få hero-props.

### 5.3 Palet (udgangspunkt)
| Rolle | Farver |
|---|---|
| Verden, varm | skovgrøn `#4F6B3A`, mos `#7C8C4A`, jord `#7A5A3C`, træ `#9A6B43`, sten `#8C877C`, himmel `#9CC3D9` |
| Lys | sol `#FFE2B0`, skygge-tone `#4A5A6E` (blålig, ikke sort) |
| Zombier | hud `#A8A27E`, `#8F8F7A`, `#B59C86`, `#7C8070`, tøj i dæmpede jordfarver |
| Mennesker/NPC | naturlige hudtoner, tøj med én stærkere accent per fraktion (militær oliven `#5B6236`, raiders rust `#8A4B2A`, overlevende teal `#3E6E73`) |
| Accent/feedback | blod `#7A0F0C`–`#A3201A`, zombieøjne `#E8C547`, interaktion `#F2D16B`, fare `#D9472B`, gyldig `#7FCB6A` |

### 5.4 Opdeling i dele (dismemberment)
- **14 dele som nu** (`torso, head, upperarm_L/R, forearm_L/R, hand_L/R, thigh_L/R, shin_L/R, foot_L/R`), **ét skelet** og merged til én SkinnedMesh med en part-id per vertex og en part-maske i shaderen. Det er samme idé som Valves ellipsoid-maske ([L4D2-paper](https://valvearchive.com/Presentations/GDC%202010/Vlachos-GDC10-Left4Dead2Wounds.pdf)), men med faste dele, som er billigere og mere ensartede.
- **Snitpunkter med cap**: hals, skulder ×2, albue ×2, hofte ×2, knæ ×2 (+ evt. talje til halv krop senere). Hver cap: kød-disk + knoglering fra gore-atlasset, 40–120 tris, placeret på snitfladen og vægtet 100 % til forælder-knoglen (så den skjules, indtil delen er skåret af).
- **Afskåret del**: CPU-skinnes én gang til en statisk mesh med egen cap (findes: `severPart`), og får simpel fysik/ragdoll-lite.
- **Pipeline-regel**: part-by-part laver opdeling, caps, skelet og vægte **automatisk** efter samme skabelon på alle humanoider. Image-to-3D giver kun formen.
- **Maks. knogler**: ≤ 30 per figur (mobil-uniform-grænser og CPU-skinning af afskårne dele).

### 5.5 Destruktion
- **Forud-frakturerede** varianter laves offline i Blender (Cell Fracture-addon) med **5–12 brikker** og ét fælles "indre" materiale (træ-, beton- og metal-indre i miljøatlasset). Gemmes i samme GLB som `intact` + `damaged` + `broken_*`.
- **Skadetrin**: intakt → revnet (texture-/decal-swap) → fraktureret. Brikker får fysik i 3–6 s, fryser og fader.
- **Simple former hjælper**: jo færre detaljer, des pænere bliver en Voronoi-brudflade, og des billigere er brikkerne. Det er en stærk grund til at holde miljøet forenklet.
- **Bygningsmoduler** er selve brikkerne (væg, vindue, tag): ødelæggelse = fjern/fraktur af ét modul, plus en støtte-tjek à la [Valheim](https://valheim.weirdgloop.org/w/Building_stability).

## 6. Tekniske løsninger i Three.js

### 6.1 Ragdoll
| Bibliotek | Fordele | Ulemper |
|---|---|---|
| **cannon-es** ([repo](https://github.com/pmndrs/cannon-es), [ragdoll-demo](https://pmndrs.github.io/cannon-es/examples/ragdoll)) | Ren JavaScript, nem at komme i gang med. `ConeTwistConstraint` med vinkelgrænser til nakke, skuldre, hofter og knæ findes i deres officielle ragdoll-eksempel. | Langsommere ved mange legemer. Vedligeholdes sjældnere. |
| **Rapier** (`@dimforge/rapier3d-compat`, [joints-guide](https://rapier.rs/docs/user_guides/javascript/joints)) | WASM, klart hurtigere og stabil, og kan også bruges til køretøjer og destruktion. | WASM-download (~1–2 MB). Efter vores læsning eksponerer JS-API'et ikke vinkelgrænser for sfæriske led, så led skal bygges med revolute/generic-led eller begrænses manuelt. |

**Anbefaling**: Start med **ragdoll-lite**: ved død laves ~10 kapsellegemer (bækken, bryst, hoved, over-/underarme, lår, skinneben) og knoglerne kopieres fra legemerne. **Maks. 3–4 aktive ragdolls** på mobil. Efter 2–3 s i hvile fryses liget til en statisk pose og legemerne frigives. Prototype i **cannon-es** (vinkelgrænser ud af boksen). Skift til **Rapier**, når fysik også skal bruges til køretøjer og mange brikker. Fjerne zombier (>25 m) bruger kun et dødsklip.

### 6.2 Dismemberment
Allerede implementeret på den rigtige måde for mobil: part-maske i shaderen + forhåndslavede caps + CPU-skinnet afskåret del. **Næste skridt**: blodstråle-emitter på cap-knoglen, sår-punkter i shaderen (op til 4 uniforms per zombie, L4D2-princip), våbenafhængige sår (økse = snit og høj chance for lem, kølle = knusning, hagl = flere små sår), og gameplay-konsekvenser (ingen ben → kravler).

### 6.3 Destruktion
- **Primært**: forud-frakturerede GLB'er (se 5.5): **ingen runtime-pris** ud over fysik.
- **Runtime-fraktur til særlige ting**: [three-pinata](https://github.com/dgreenheck/three-pinata) (Voronoi-fraktur i Three.js, ≥ r158, fungerer med vores r169) eller Three.js' `ConvexObjectBreaker` ([eksempel](https://threejs.org/examples/physics_ammo_break.html)). Kun til få hero-objekter, ikke til massen.

### 6.4 Decals
- **Verden**: instanced quads i ringbuffer (findes for blod), justeret til overfladens normal, ét atlas → 1 draw call.
- **Statiske hero-flader**: `DecalGeometry` ([docs](https://threejs.org/docs/pages/DecalGeometry.html)) i begrænset antal (CPU-tung).
- **På figurer**: shader-sår (ikke DecalGeometry på SkinnedMesh).

## 7. Hvad det betyder for pipelinen
1. **Referencetrin** (allerede i "Nyt asset"): referencer vælges inden for B-retningen (SoD2/WWZ-proportioner, varmt lys).
2. **Konceptbillede** i stilen: realistiske proportioner, forenklede former, varm palet, neutralt lys.
3. **Image-to-3D** (Pixal3D/TRELLIS.2 – MIT) giver formen.
4. **Part-by-part i Blender**: retopologi/decimering til budget, 14-dels opdeling med caps fra skabelonen, skelet, bagning af albedo + AO til 1024²/512², palet-justering mod 5.3, LOD1/LOD2 med automatisk decimering, `intact/damaged/broken` til props.
5. **Automatisk kvalitetstjek**: trekantbudget, textur-størrelse, antal knogler, ingen svævende dele, caps til stede, palet inden for tolerance → først derefter vises det i editoren.

## 8. Åbne spørgsmål til Jon
- Er justeringen (Grounded-lys og palet, men realistiske proportioner) i orden, eller skal vi teste A og B side om side på samme zombie i spillet først?
- Gore-niveau som standard: fuld (lemmer, blod, stumper) eller reduceret med valg i indstillinger?
- Skal fjerne horder være low-poly (C) fra start, eller skal vi først se, hvor langt B kan skaleres?
