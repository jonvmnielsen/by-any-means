# BAM – spilsystemer (web v4)

Skrevet af Claude-Desktop 23/10. Jons beslutninger 23/10:
- inventar som tern-net;
- sult, tørst og udholdenhed (ingen søvn);
- når du dør, bliver alt på liget;
- første runde: loot, inventar, skydevåben, heling, gemt spil og kørsel.

Koden ligger i:
- `web/Claude-Desktop_bam_web_v4/`: `items.js` (data), `inv.js` (inventar-UI) og `game.js` (resten).

## Sprog
- Spillet er på engelsk (Jon 23/10): menuer, inventar, genstande, steder og beskeder. Dokumentationen er på dansk. Den danske tekst fra før ligger i `web/Claude-Desktop_bam_web_v4/_dansk_backup_2310/`.
- Bandage: +20 HP og stopper blødning (Jon 23/10). Fuldt helbred er 100 HP.

## Genstande (`items.js`)
- Hver genstand har:
  - navn;
  - størrelse i tern (b × h);
  - kategori;
  - ikon (`icons/<id>.png`);
  - 3D-model (`model`: node i `pack_bam_items.json` eller `pack_items.json`).
  - Derudover en eller flere af: `gun`, `melee`, `mag`, `use`, `gear`, `stack`, `fuel`.
- **Begge slags assets bruges.**
  - Vores genstande har egne modeller og ikoner.
  - SD-genstandene (id `sd_...`) har deres egne modeller og ikoner, men opfører sig som den genstand, de "ligner" (`like`). Eksempel: `sd_ammo_9mm` tæller som `ammo_pistol`, `sd_ammo_magazine` som `mag_rifle`.
  - Den, du ikke kan lide, fjernes fra `items.js` og loot-tabellerne.
- **Instans:**
  - `{ id, n (antal i stakken), r (skud i et magasin eller i et våben med magasinrør), m (skud i magasinet, der sidder i våbnet; null = intet magasin), fuel (liter), g (net for grej med plads) }`.
  - En rygsæk, vest eller et bælte har sit eget net og tager indholdet med sig.
- **Loot-tabeller (`LOOT`):**
  - formatet er `[id, vægt, min, maks]`;
  - antal træk afhænger af beholderens størrelse, og der er 18 % chance for at den er tom;
  - "liv før" bestemmer lommerne på lig: `life_civil` og `life_soldier`.
  - Tabelnavnene kommer fra assets' `container.loot_table`.

## Inventar (`inv.js`)
- Pladser: primærvåben, sidevåben, nærkamp, hoved, vest, bælte og rygsæk.
- Net:
  - lommer 5×2;
  - vest 3×2;
  - brystrig 4×3;
  - bælte 4×1;
  - rygsæk 6×5 (SD-rygsæk 5×5).
- Højre side viser det, der er åbent: en beholder, et lig eller "Jorden".
- Træk og slip virker med mus og finger:
  - stakke lægges sammen;
  - et magasin trukket på et våben skiftes ind;
  - patroner trukket på et magasin eller et haglgevær lades;
  - en ting trukket på en rygsæk lægges i den;
  - en ting trukket uden for begge kolonner smides på jorden.
- Tryk på en ting viser dens handlinger:
  - Brug/Spis/Drik;
  - Tag på eller Tag af;
  - Lad, Tag magasinet ud;
  - Fyld eller Tøm magasinet;
  - Del, Tag/Læg i, Smid.
- Dobbeltklik flytter en ting til den anden side.

## Gennemsøgning og loot i verdenen
- **Beholdere:** 648 stk., fra `data/containers.json` (bygget af assets' json).
  - Hver har søgetid, størrelse og loot-tabel. Indholdet trækkes første gang med et frø fra beholderens id og gemmes.
  - Søgetider: skuffe/kasse ca. 1 s, skab 2 s, militærkasse 2-2,5 s, container 6 s, lig 3 s.
- **Mens du søger**, står du stille og kan blive angrebet. Går du, afbrydes det.
- **Loot på jorden:** SD-placeringerne (`world.json → loot`) og alt, du smider, ligger i bunker med en gul ring.
  - En bunke med én ting samles op med E.
  - Våben og grej går direkte i en tom plads, og et våben kommer i hånden, hvis hænderne er tomme.

## Lig
- **Zombier** har det, man kan se på dem:
  - soldater: vest/brystrig (med magasiner), bælte, hylster (60 % pistol), rygsæk (med indhold), hjelm og riffel på ryggen;
  - SD-zombier: fx har betjenten pistol og 9 mm, og lægen førstehjælpskasse;
  - plus lommer efter deres liv før.
  - Når du tager en synlig ting, forsvinder den fra liget.
- **Ligene** fryses efter 4 sekunder og bliver liggende (også i det gemte spil).
- **Dør du**, ligger alt dit grej på dit lig der, hvor du døde. Du starter forfra ved spawn med tomme lommer.

## Skydevåben og nærkamp
- **Vores våben:**
  - stormgevær M4 (30, auto);
  - pistol 9 mm (15);
  - haglgevær (6 i magasinrøret, 8 hagl);
  - jagtriffel .308 (magasin 5, zoom ×3).
- **SD-våben:** pistol, revolver (6, patron for patron), maskinpistol (magasin 30 × 9 mm), haglgevær, jagtriffel (patron for patron) og automatriffel (+ sand).
- **Skud:**
  - skud går fra kameraets midte;
  - spredning: hoftefyring er bred, sigte (højreklik) smal, og at gå øger den;
  - hovedskud gør skade ×2,2.
- **Lad (R):**
  - sætter det fyldigste magasin i; det gamle lægges tilbage i dets plads;
  - våben med magasinrør lades en patron ad gangen, og et skud afbryder.
- **Støj:** zombier inden for 45-90 m (efter våben) hører skuddet og jager dig i 25 sekunder.
- **Nærkamp:**
  - næver 34;
  - kølle/bat 45-55, machete 60, økse 55, fældeøkse/brandøkse 85, kniv 40.
  - Hvert slag koster udholdenhed.
- **Våbenskift:** 1, 2 og 3 vælger våben, X næver, Q skifter. Primærvåbnet hænger på ryggen, når det ikke er i hånden.

## Behov og heling
- **Mad:**
  - falder fra 100 til 0 på 40 minutter.
- **Væske:**
  - falder på 25 minutter, hurtigere når du spurter.
- **Ved 0 i mad eller væske** mister du 0,25 helbred i sekundet.
- **Er begge over 60** og du ikke bløder, heler du langsomt (0,08/s).
- **Udholdenhed:**
  - spurt koster 14/s, hop 10 og slag 6;
  - genvindes efter 0,8 s pause;
  - ved 0 er du forpustet og kan ikke spurte, før den er oppe på 25.
- **Blødning:**
  - et zombieslag giver 30 % chance for blødning, som koster 0,5 helbred/s;
  - stoppes af bandage, forbinding eller førstehjælpskasse.
- **Helbred:**
  - piller: +20 over 20 s;
  - førstehjælpskasse: +60;
  - adrenalin-pen: +35 og fuld udholdenhed.
- **Hjelm og vest** tager 10-15 % og 30 % af zombieskaden.

## Kørsel
- **Køretøjer:** E ved en humvee, jeep, lastbil, pickup, varevogn eller SD-bil.
- **Styring:**
  - W/S: gas, bremse og bak;
  - A/D: styr;
  - mellemrum: håndbremse;
  - E: stig ud.
- **Fart:** op til 80 km/t (lastbil 60).
- **Bilen:**
  - følger terrænet;
  - støder mod bygninger og andre biler (et hårdt sammenstød koster helbred);
  - kører zombier ned.
- **Benzin:**
  - hver bil har 3-25 l, og forbruget er overdrevet (ca. 2 l/km), så benzin betyder noget;
  - en dunk ("Hæld på bilen") fylder op.
- **Teknik:**
  - bilerne er instanser i deres InstancedMesh; når de kører, skrives deres matricer om;
  - de er taget ud af de faste kollisionsceller og kolliderer som kasser.
  - SD-bilerne er modelleret med fronten mod -X, vores mod +X.

## Gemt spil
- **Gemmes:** i browseren (`localStorage`, nøglen `bam_save_v1`), hvert 10. sekund når noget er ændret, og når siden skjules eller lukkes.
- **Indhold:**
  - spilleren (sted, helbred, behov, inventar);
  - gennemsøgte beholdere;
  - døde zombier med deres net;
  - bunker på jorden;
  - dine lig;
  - bilernes sted og benzin;
  - opstillede miniguns.
- Start viser "Fortsæt" og "Nyt spil".
- Gemt spil hører til én browser på én maskine.

## Runde 24/10 (Jons fejlliste)
- **Døre:**
  - E åbner og lukker døren, og den svinger væk fra dig;
  - en lukket dør stopper både dig og zombierne;
  - åbne døre gemmes.
- **Dukke:** når du dukker, fylder du kun ca. 0,9 m i højden og kan komme under lave ting. Du kan ikke rejse dig, hvis der ikke er plads.
- **Klatre:** Mellemrum foran noget, der er 0,5-2,1 m højt med plads ovenpå (en bil, en mur eller en kasse), klatrer op på det. Du kan stå på biltage.
- **Loot på jorden:** ligger altid oven på terrænet, og modellen hviler på jorden.
- **Tekster:**
  - "E · saml op" og lignende står under sigtekornet midt på skærmen;
  - tooltip på ting i inventaret vises med det samme.
- **Handlinger:**
  - bandage, mad, søgning osv. viser en bjælke med navn og sekunder tilbage;
  - bjælken ses også, når inventaret er åbent.
- **Fodtrin:** lyden kommer, når en fod rammer jorden i animationen. Det bliver målt ud fra animationerne, når spillet starter.
- **Kollision:** træstammer, sten og stubbe har en radius målt ud fra selve modellen, og den gælder for både dig og zombierne.
- **Bil:**
  - bilen har 100 % liv;
  - zombier, der angriber, mens du sidder i bilen, skader bilen og ikke dig;
  - sammenstød og påkørsler slider også på bilen;
  - en ødelagt bil kan ikke starte;
  - bilen kan ikke køre ud på mere end 0,55 m vand.
- **Inventar:**
  - ting kan lægges frit, også i det samme net;
  - de kan drejes 90° med "Turn", og under træk med R, højreklik eller rullehjulet;
  - automatisk placering prøver også den drejede retning.
- **Våben i hånden:**
  - geværet og pistolen sidder i hånden, som sigte-animationen holder dem, i alle animationer;
  - når du dukker med et gevær, bruges gevær-dukke-animationerne.
- **Rygsæk:** følger nu kun den øverste del af ryggen. Før svævede den ud fra kroppen, når man lænede sig.
- **Biler i bygninger:** biler og vrag, der er placeret inde i en mur, flyttes ud, når spillet starter.
- **Gravning:**
  - med en skovl graver E (eller "Dig" i inventaret) et hul foran dig, 0,35 m pr. gang og højst 3 m dybt;
  - man kan ikke grave på veje, i vand eller indenfor;
  - hullerne gemmes.

## Tilføjelser (nye assets uden at røre koden)
- `data/addons.json` lister ekstra pakker (`packs: [{file, lod}]`) og layouts (`layouts: [...]`).
- Et layout kan indeholde:
  - `placements` (som `world.json`);
  - `clear` (felter hvor træer, planter og græs fjernes);
  - `areas`, `area_names`, `npc_spawns`, `items`, `loot` og `containers`.
- Værktøj: `tools/web/Claude-Desktop_addon_import.mjs <asset-mappe> <spilmappe> <navn>`.
  - Det pakker GLB'erne, laver layoutet ud fra mappens `layout.json` og beholdere ud fra assets' json, og registrerer det hele.
  - Det overskriver aldrig.

## Taster
- **Bevægelse:**
  - WASD: gå;
  - Shift: spurt;
  - C: duk;
  - V: gå langsomt;
  - mellemrum: hop.
- **Kamp:**
  - klik/F: skyd eller slå;
  - højreklik: sigt;
  - R: lad;
  - 1/2/3/X/Q: våben.
- **Handlinger:**
  - E: gennemsøg, saml op, kør eller pak minigun ned;
  - I/Tab: inventar;
  - B: stil minigun op.
- **Andet:**
  - H: horde (test);
  - M: kort;
  - N: lyd.
- **Telefon:** venstre tommel går; knapperne er Brug, Våben, Taske, Sigt, Skyd/Slå, Lad, Spurt, Duk, Hop og Horde.

## Ikke med endnu
- Tøj kan bæres, men ikke tages på.
- Ingen stand eller slid på ting.
- Ingen døgnrytme.
- Lommelygte og kikkert har ingen funktion endnu.
- Tunneller og underjordiske baser kræver et voxel-terræn (se `docs/Claude-Desktop_PLAN_GRAVNING.md`).
- Lig med lange frakker kan strække sig mærkeligt. Det skyldes vægtningen i modellerne, som skal rettes i de nye figurer.
- Bilerne har ingen skade.
- Zombier genopstår ikke.
