# By Any Means – Game feel og feedback (komplet liste)

*Udarbejdet af Grok Bot, 18. oktober 2026. Research-dokument, intet i koden er ændret.*

Formål: Alt, spilleren gør, skal have et tydeligt svar fra spillet. Dokumentet samler **alle handlinger og hændelser i BAM, der skal give feedback**. For hver af dem står der, hvilke kanaler der bruges, hvor vigtig den er, og en billig måde at lave den på i Three.js, så den kører på mobil.

---

## 1. Hvad researchen siger (kort)

| Kilde | Hovedpointe, vi bruger |
|---|---|
| Martin Jonasson & Petri Purho, *Juice It or Lose It* (GDC/Nordic Game 2012) – [GDC Vault](https://www.gdcvault.com/play/1016487/juice-it-or-lose), [video](https://www.youtube.com/watch?v=Fy0aCDmgnxg) | "Maksimalt output for minimalt input". Tweening, squash & stretch, partikler, lyd og screenshake lægges ovenpå den samme mekanik, **lag for lag**, og hvert lag kan slås til og fra. Vi laver alt feedback som små, uafhængige lag. |
| Jan Willem Nijman (Vlambeer), *The Art of Screenshake* (2013) – [video](https://www.youtube.com/watch?v=AJdEqssNZ-U), [Game Developer-referat](https://www.gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games) | 30 små tricks: større kugler, mundingsglimt, **knockback på fjenden og rekyl på spilleren**, kamerakick i modsat retning af skuddet, impact-effekter, **permanens** (lig, hylstre og blod bliver liggende), lidt camera lag og hitstop. |
| Squirrel Eiserloh, *Juicing Your Cameras With Math* (GDC 2016) – [GDC Vault](https://gdcvault.com/play/1023146/Math-for-Game-Programmers-Juicing), [video](https://www.youtube.com/watch?v=tu-Qe66AvtY) | Screenshake styres af en **trauma-værdi** (0–1), som hændelser lægger til, og som falder lineært. Rystelsen er trauma² eller trauma³ og bruger glat støj, ikke tilfældige tal. **I 3D rystes rotationen, ikke positionen** (så kameraet ikke ryger ind i vægge). |
| Masahiro Sakurai, *Stop for Big Moments!* / *Eight Hit Stop Techniques* – [video](https://www.youtube.com/watch?v=OdVkEOzdCPw) | Hitstop: begge parter fryser i nogle få frames ved et tungt slag, og den der bliver ramt ryster. Længden skaleres med skaden. |
| Valve, Alex Vlachos, *Rendering Wounds in Left 4 Dead 2* (GDC 2010) – [PDF](https://valvearchive.com/Presentations/GDC%202010/Vlachos-GDC10-Left4Dead2Wounds.pdf) | Sår og afskudte lemmer laves på GPU'en: ellipsoider skjuler pixels i shaderen, og en fælles sår-model fylder hullet. Det koster **én ekstra draw call** og ingen mesh-varianter per zombie, højst 2 aktive sår per zombie. Det minder meget om vores part-maske. |
| Left 4 Dead, AI Director og Music Director – [L4D Wiki](https://left4deadwiki.com/wiki/The_Director) | Lyd og musik varsler fare: et horn før en horde og et unikt lydsignal for hver specialfjende. Lyden **er** gameplay-feedback. |
| Dead Island 2, FLESH-systemet (Dambuster) – [Game Informer](https://gameinformer.com/exclusive-interview/2023/01/30/how-dead-island-2s-flesh-system-procedurally-breaks-skin-and-bones), [PC Gamer](https://www.pcgamer.com/dead-island-2-devs-detail-its-gruesome-procedural-violence-modelling-tech/) | Skade er **lokal og afhænger af våbnet**: kniv flænser, hammer knuser, og gentagne slag samme sted går igennem lag efter lag. Det gør hvert slag til feedback. Det er AAA-konsolteknik og kan ikke køre i en mobilbrowser, men **princippet kan vi bruge**: våbentype → forskelligt sår, og skaden bygges op synligt. |
| State of Decay 2 – [Polygon-guide](https://www.polygon.com/guides/2018/5/17/17356000/state-of-decay-2-beginners-guide-tips-inventory-resources-base/), [Steam](https://store.steampowered.com/app/495420) | **Larm vises på minikortet** som hvide ringe (gang, sprint, skud, mislykket søgning, kørsel). Sneaking er stille. Finishers (head stomp) giver en klar afslutning på en zombie. |
| Valheim – [Building stability](https://valheim.weirdgloop.org/w/Building_stability), [Trees](https://valheim.weirdgloop.org/w/Trees) | Byggedele farves fra **blå til grøn, gul og rød** efter stabilitet. Træer falder i den retning, man huggede fra, som en fysisk stamme, der kan vælte andre træer. |
| 7 Days to Die – [Structural Integrity](https://7daystodie.wiki.gg/wiki/Structural_Integrity) | Forhåndsvisningen ved placering er normal når den er stabil, gul ved belastning og rød, hvis placeringen får bygningen til at styrte sammen. Blokke viser synlig skade, før de går i stykker. |
| Rust (Facepunch) – [Devblog 73](https://rust.facepunch.com/news/devblog-73), [Combat Update](https://rust.facepunch.com/news/the-combat-update/) | Hitmarker med **egen træflyd** og en særlig headshot-lyd. Hit-notifikationen kan vises med det samme på klienten, så den ikke venter på serveren. |
| Grounded (Obsidian) – [GamesRadar-interview](https://www.gamesradar.com/obsidian-grounded-new-xbox-one-exclusive-interview/), [Steam](https://store.steampowered.com/app/962130) | Stiliseringen er valgt for at gøre **skala, skabninger og fare let læselige**. Spillet har skadetyper med svagheder, men spillerne klager over, at de ikke vises i spillet ([Obsidian-forum](https://forums.obsidian.net/topic/125697-damage-type-vulnerabilitiesweaknesses-not-particularly-intuitive/)). Lektien er: **vis det i selve feedbacken**. |
| Vibration API – [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API), [caniuse](https://caniuse.com/vibration) | `navigator.vibrate()` virker på Android Chrome og kræver, at brugeren har rørt skærmen først. **Det virker ikke på iOS Safari.** Haptik er derfor altid en ekstra bonus og må aldrig være den eneste kanal. |

**Tre regler for BAM ud fra researchen**
1. **Mindst to kanaler for alt, der er P0** (fx lyd + VFX). På iPhone er der ingen haptik, og mange mobilspillere spiller uden lyd, så det visuelle skal også kunne stå alene.
2. **Feedbacken skal være proportional.** Små ting giver lidt (en hagl-prik giver en lille puf), store ting giver meget (et headshot med haglgevær: hitstop på 60 ms, shake, lem af, lyd med bas). Får alt maksimum, forsvinder kontrasten.
3. **Permanens.** Lig, afskudte lemmer, blodpletter, hylstre, stubbe og murbrokker bliver liggende et stykke tid (med pulje og fade). Verden husker, hvad du har gjort, og det giver et voksent og konsekvent udtryk.

---

## 2. Fælles feedback-værktøjskasse (bygges én gang og bruges af alt)

Alt i listen nedenfor kaldes gennem **ét `fx.emit(type, {pos, dir, intensity, surface})`**, som slår op i en tabel (`data/feedback.json`). Så kan Jon justere styrken uden at røre koden.

| Modul | Implementering på mobil i Three.js | Pris |
|---|---|---|
| **Partikler** | Én `THREE.Points` eller `InstancedMesh` per partikeltype med en fast ringbuffer. Den findes allerede for blod (`BL = 160`, 1 draw call) og udvides til støv, gnister, splinter, sten, vand og røg. Ingen nye objekter i spillet, kun genbrug. | 1 draw call per type |
| **Decals** | Én instanced quad-mesh per atlas (blod, kuglehuller, brændemærker, fodspor), lagt på overfladens normal med en ringbuffer (fx 128). `DecalGeometry` ([docs](https://threejs.org/docs/pages/DecalGeometry.html), [eksempel](https://threejs.org/examples/webgl_decals.html)) bruges kun til sjældne store decals på statiske meshes, for den bygger ny geometri på CPU'en. | 1 draw call per atlas |
| **Sår på figurer** | En shader-maske som L4D2's: en uniform med op til 4 sårpunkter per zombie, der tegner blod/sår i fragment-shaderen. Part-masken findes allerede til afskudte lemmer. | ~0 ekstra draw calls |
| **Camera shake** | Eiserlohs trauma-model: `trauma += x`, falder 1,5/s, `shake = trauma²`. Kun rotation (yaw/pitch/roll ≤ 2–3°), glat støj (sum af sinus). Rekyl er et separat, retningsbestemt kick på pitch. **Shake-skyder i indstillinger** (tilgængelighed). | Gratis |
| **Hitstop** | Global `timeScale` sættes til 0,05 i 30–90 ms (melee og kraftige skud). Spilleren og målet fryser. Kamera og UI kører videre. | Gratis |
| **Hit-flash** | Uniform `uHitFlash` i karakter-shaderen (hvid/rød blink i 60 ms) og en lille skalapuls (squash 1.05 → 1.0). | Gratis |
| **Lyd** | Web Audio: én `AudioContext`, forudindlæste korte samples (OGG/MP3, mono, 22–44 kHz), **3–5 varianter per lyd + ±8 % tilfældig pitch**, så gentagelser ikke lyder ens. `PannerNode` til 3D-lyd for zombier. Maks. ~24 samtidige stemmer, og de svageste/fjerneste stjæles først. | Lav |
| **Haptik** | `if (navigator.vibrate) navigator.vibrate(ms)` med korte mønstre (10–40 ms). Kan slås fra. Ingen på iOS. | Gratis |
| **UI** | DOM/CSS (allerede brugt): hitmarker-kryds, retningspile ved skade, vignette, floating tekst ("+3 Wood"), skakken af ikoner. CSS-transforms, ingen layout-reflow per frame. | Lav |
| **Animation** | Additive hit-reactions (Three.js `AnimationMixer` med en kort klip, der blandes ind), og procedurale tweaks: hovedet rykker i skudretningen, og knockback i retningen (findes allerede: `z.kb`). | Lav |
| **Ragdoll** | Se STYLE_DIRECTION, afsnit 6. "Ragdoll-lite" til mobil, og maks. 3–4 aktive ad gangen. | Mellem |
| **Larm-system** | Hver feedback-hændelse har en `noise`-radius, der både **tegnes** (ringe på minikortet/kompasset som i SoD2) og **sendes til zombie-AI'en**. Feedback og gameplay hænger sammen ("Sound matters" i README). | Lav |

**Kanal-forkortelser i tabellerne:** V = VFX/partikler · L = lyd · K = kamera (shake/kick/FOV) · H = hitstop · A = animation · UI = skærm-UI · Hp = haptik (Android) · D = decal/permanens

**Prioritet:** **P0** = skal være med fra første spilbare version af systemet, ellers føles det i stykker. **P1** = næste runde, giver kvalitet. **P2** = polish.

---

## 3. Kamp

### 3.1 Skydevåben
| Hændelse | Kanaler | Pri. | Billig løsning (Three.js/mobil) |
|---|---|---|---|
| Affyring (pistol/riffel/hagl) | V, L, K, A, UI, Hp | **P0** | Mundingsglimt: 1 additiv sprite-quad + `PointLight` i 1 frame (eller en emissive pulse, hvis lys er for dyrt). Kamerakick på pitch (pistol 0,6°, hagl 2,5°) og trauma +0,1–0,3. Rekylanimation på våben/arme. Lyd med variation, og et kort "tail"-ekko i skov vs. by. Trådkorset spreder sig og trækker sig sammen igen. Vibration 15 ms. |
| Hylster kastes ud | V, L, D | P1 | Instanced hylster-mesh (12 tris), simpel fysik (tyngdekraft + ét hop), "tink"-lyd ved jordkontakt, bliver liggende 30 s. |
| Lyd fra skud = larm | UI, gameplay | **P0** | Larmring på kompas/minikort, radius per våben, zombier tiltrækkes (SoD2-princip). Lyddæmper = mindre ring. |
| Kugle rammer miljø | V, L, D | **P0** | Gnister/støv efter overflade (træ = splinter, sten = støv, metal = gnister + "ping", vand = sprøjt), kuglehul-decal fra pulje. Raycast giver normal og materiale-tag. |
| Kugle rammer zombie (krop) | V, L, A, UI, D | **P0** | Blodpuf i treffets retning (findes), hit-flash i shaderen, additiv hit-reaction, knockback. **Hitmarker** (hvidt kryds, 120 ms) og en tør "thwack"-lyd, der er forskellig fra miljøtræf (Rust-princip). Sår-punkt i shaderen. |
| Headshot | V, L, K, H, UI, Hp | **P0** | Større blodsky + knoglesplinter, kort hitstop (40 ms), **rødt hitmarker + særlig headshot-lyd**, hovedet rykker bagud. Ved drab: kraftig, kort lyd og trauma +0,25. |
| Lem skudt af (arm/ben) | V, L, A, D, gameplay | **P0** | `severPart()` findes: CPU-skinnet del + cap. Tilføj: blodstråle fra stumpen i 0,6 s (partikel-emitter på knoglen), lemmet kastes i skudretningen og bliver liggende, blodpøl-decal. **Gameplay-svar:** uden ben kravler zombien (crawler-klip findes), uden arm kan den ikke gribe. Det er den bedste feedback, fordi den ændrer fjenden. |
| Hoved skudt af / drab | V, L, K, H, A | **P0** | Som headshot + skjul hovedet via part-masken, nakke-cap, og kroppen falder i ragdoll. Det er den eneste rigtige død (README: "Head damage is required to fully kill"). Det skal derfor være tydeligt: lyd + hitstop + krop der kollapser. |
| Skud mod en zombie, der ikke dør (krop) | UI, A | **P0** | Spilleren skal kunne se, at kropsskud ikke dræber: zombien vakler, men rejser sig. Lille gråt hitmarker i stedet for et rødt. Det lærer spilleren at sigte efter hovedet uden tekst. |
| Gennemskud / flere mål | V, UI | P2 | Ekstra blodpuf på bagsiden, hitmarker med "x2". |
| Tomt magasin (klik) | L, UI, A | **P0** | Tørt klik-lyd, ammo-tallet blinker rødt, våbnet rykker ikke. |
| Genladning | L, A, UI | **P0** | Animation + 2–3 lydtrin (magasin ud, ind, ladegreb), ring-timer omkring ammo-ikonet. "Genladning færdig" med et lille klik. |
| Lav ammo | UI, L | P1 | Ammo-tal skifter til gul/rød, lavere klikkende lyd på de sidste 3 skud. |
| Sigte (ADS) | K, UI | P1 | FOV-tween 70 → 55 (150 ms), vignet, trådkors strammes. |
| Våbenskift | A, L, UI | P1 | Kort ned/op-animation, holster-lyd, hotbar-slot pulser. |
| Våben går i stykker / klemmer | L, UI, A | P2 | Metalknas, ikon revner. |
| Eksplosion (gastank, bil, granat) | V, L, K, H, D, Hp | P1 | Kugle-flash (additiv, skaleret) + røg-sprites fra pulje, trauma 0,8, kort hitstop, lyd med bas + forsinket ekko efter afstand, brændemærke-decal, lemmer i radius (sever på flere dele), ragdoll udad. Vibration 60 ms. |

### 3.2 Nærkamp
| Hændelse | Kanaler | Pri. | Billig løsning |
|---|---|---|---|
| Sving (luft) | L, A | **P0** | "Whoosh"-lyd, der matcher våbenets vægt. Antecipation (lille optræk) i animationen. |
| Slag rammer zombie | V, L, H, K, A, UI, Hp | **P0** | **Hitstop 50–80 ms** (Sakurai), blod/støv, hit-flash, knockback, trauma +0,15, tung "thud". Vibration 20 ms. Våbentype bestemmer sår (FLESH-princip i lille skala): økse/machete = snit og chance for at skære et lem af, kølle = knusning/hovedet rykker voldsomt, kniv = lille sår. |
| Afskåret lem med økse | V, L, H, A, D | **P0** | Som afskudt lem, men hitstop 90 ms og en dybere lyd. |
| Slag rammer miljø / blokeres | V, L, A | P1 | Gnister/splinter, våbnet preller af (rekyl-animation), "klonk". Ingen hitstop. |
| Skub/spark (afstand) | A, L, K | P1 | Zombien snubler (stagger-klip), lille trauma. |
| Finisher / stamp på hovedet (liggende zombie) | A, L, K, H, V | P1 | Kontekst-knap; kort animation, hitstop, knas. SoD2-princip. |
| Kritisk / backstab | UI, L, H | P2 | Ekstra lydlag, længere hitstop. |
| Tom stamina (kan ikke slå) | UI, A, L | **P0** | Stamina-bjælke blinker rødt, langsomt og tungt sving, træt åndedræt. |

### 3.3 Zombier og fjender
| Hændelse | Kanaler | Pri. | Billig løsning |
|---|---|---|---|
| Zombie opdager dig | L, A, UI | **P0** | Snerren/skrig (3D-lyd), hovedet drejer, lille rød "!" eller pil i kanten af skærmen, hvis den er uden for synsfeltet. |
| Zombie i nærheden, ude af syne | L, UI | **P0** | 3D-positioneret stønnen (PannerNode), kompas-markering ved høj nærhed. Lyden er den første advarsel (L4D). |
| Zombie angriber (optræk) | A, L | **P0** | Tydelig antecipation 0,3–0,45 s (findes: `z.stateT > 0.45`) og en særlig lyd, så spilleren kan nå at reagere eller undvige. |
| Zombie dør (ikke-hoved) / falder | A, V, L, D | **P0** | Ragdoll-lite eller dødsklip med fald i retning af slaget, støv ved jordkontakt, blodpøl-decal, liget bliver liggende (permanens). |
| Zombie kravler (benløs) | A, L | P1 | Crawler-klip findes; slæbelyd. |
| Horde på vej | L, UI, K | P1 | L4D-horn/lav rumlen, afstandsretning på kompasset, svag konstant trauma 0,05, mens den er tæt på. |
| Specialzombie / boss | L, UI | P2 | Unik lydsignatur per type (L4D). |
| Menneskelige fjender (raiders/militær) skyder | V, L, UI | P1 | Tracere (linjesegment-pulje), mundingsglimt i det fjerne, retningspil ved nærmiss ("whizz"-lyd forbi øret). |

### 3.4 Spilleren bliver ramt / tilstand
| Hændelse | Kanaler | Pri. | Billig løsning |
|---|---|---|---|
| Spiller ramt | UI, L, K, A, Hp, V | **P0** | Rød vignette-blink (findes: `#hurt`), **retningspil mod angriberen**, trauma +0,3, smertelyd, flinch-animation (findes), vibration 30 ms. |
| Lavt liv (<25 %) | UI, L, K | **P0** | Pulserende rød/desatureret kant (CSS), hjerteslag-lyd (langsom loop), let desaturering af scenen (uniform i tonemapping, eller CSS-filter på canvas som fallback). |
| Blødning / infektion | UI, V | P1 | Ikon + dryp-decals efter spilleren, langsom puls i vignetten. |
| Heling / bandage | UI, L, A | P1 | Grøn puls på helbredsbjælken, bandage-lyd, kort animation. |
| Død | A, K, UI, L | **P0** | Slowmotion 0,3× i 1 s, kameraet trækker op og ud, lyd forsvinder (lowpass-filter), "Du døde"-skærm. |
| Grebet af zombie | A, UI, K, Hp | P1 | Knap-mashing/swipe-prompt, rystelse, vibrationsmønster. |
| Faldskade | K, L, UI | P1 | Hårdt landingskick, knogleknas, vignette. |
| Sult/tørst/udmattelse | UI | P1 | Ikon skifter farve, mave-knurrelyd én gang. |

---

## 4. Bevægelse
| Hændelse | Kanaler | Pri. | Billig løsning |
|---|---|---|---|
| Gå | L, A | **P0** | Fodtrin synkroniseret med animationen (events ved fod-ned), lyd efter underlag (græs/grus/træ/asfalt/vand) via materiale-tag i terrænet. Svag larmring. |
| Løbe/sprinte | L, A, K, UI | **P0** | Hurtigere trin, åndedræt, FOV +4°, let kamera-bob, stamina-bjælke vises/tømmes, større larmring. |
| Snige | L, UI, A | **P0** | Dæmpede trin, krum animation, **ingen/lille larmring** og en "skjult"-indikator (øjeikon). Det er SoD2's tydeligste feedback. |
| Hoppe | A, L | P1 | Optræk (squash), hop-lyd/stønnen. |
| Lande | A, L, K, V | P1 | Squash og kamera-dip efter faldhøjde, støvpuf, landingslyd. |
| Svømme / gå i vand | V, L, A | P1 | Ring-decal på vandoverfladen (instanced), plask, ændret animation. Lowpass på lyden under vand. |
| Kollidere med væg/objekt | A, L | P2 | Lille stop-bump, ingen lyd for små stød. |
| Udmattet stamina | UI, L, A | **P0** | Bjælken blinker, tungt åndedræt, langsommere tempo. |
| Kørsel (senere) | L, K, V, Hp | P1 | Motorlyd med pitch efter omdrejninger, støv/grus-partikler, trauma ved påkørsel. Zombier, der bliver kørt ned, får ragdoll + dunk. |

---

## 5. Indsamling og crafting
| Hændelse | Kanaler | Pri. | Billig løsning |
|---|---|---|---|
| Hug i træ | V, L, A, K, Hp | **P0** | Findes delvist (`shake(n)`): stammen ryster, splint-partikler, hak-lyd, lille trauma, vibration 15 ms. Tilføj: **hak-decal**/synlig kile, der vokser per hug (træet viser fremskridt). |
| Træ vælter | A, L, K, V | **P0** | Findes delvist (fald + stub). Tilføj: knagelyd → "Tømmer!"-fald i retning fra spilleren (Valheim), stort dunk + trauma afhængigt af afstand, blade/støvsky ved jordkontakt. Stammen kan skade zombier, der står i vejen (feedback + gameplay). |
| Hug i sten/mine | V, L, A, K | **P0** | Gnister + stenstøv, hård "klink"-lyd, revne-decal, der vokser. Stenen skifter til en mindre mesh i trin (2–3 forud-lavede trin). |
| Ressource falder / dukker op | V, A, L | **P0** | Ressourcen "popper" ud med en bue og et hop (tween), lille glimt. |
| Saml op (ting/ressource) | UI, L, A, V | **P0** | Genstanden flyver mod spilleren og skrumper (tween 0,2 s), "pling"-lyd per kategori, **"+3 Træ"-tekst** og hotbar-ikonet pulser. |
| Prompt om at bruge/samle | UI | **P0** | Kontekstknap (findes: E/Use), objektet får en outline/rim-glød (billig: lysere emissive i shaderen, ingen postprocess). |
| Rygsæk/lootcontainer åbnet | L, A, UI | **P0** | Lynlås/låg-lyd, panel glider ind, tomme slots er tydeligt tomme. |
| Mislykket søgning / tomt | UI, L | P1 | "Tom"-tekst og en kort lyd. |
| **Fuld inventory** | UI, L, Hp | **P0** | Rødt blink på vægt/slot-ikonet, "Fuld"-lyd (dumpt bump), genstanden bliver liggende og hopper. Aldrig bare lydløs fejl. |
| For tung (overvægt) | UI, A | P1 | Vægten er rød, langsommere gang, tungere fodtrin. |
| Crafting startet | UI, L, A | P1 | Progress-ring, arbejdslyd (hamre/save). |
| **Crafting færdig** | UI, L, V | **P0** | "Ding" + nyt ikon flyver til inventory, glimt. |
| Mangler materialer | UI, L | **P0** | Manglende materialer bliver røde i opskriften, opskriften ryster vandret, kort fejl-lyd. |
| Mad/drik indtaget | L, UI, A | P1 | Spise-/drikkelyd, bjælken fyldes op med tween. |
| Ny opskrift låst op | UI, L | P2 | Banner + lyd. |

---

## 6. Byggeri og ødelæggelse
| Hændelse | Kanaler | Pri. | Billig løsning |
|---|---|---|---|
| Byggetilstand / forhåndsvisning | V, UI | **P0** | Gennemsigtig "ghost"-mesh (samme geometri, én transparent materiale), grøn = gyldig. |
| **Snapper på plads** | A, L, V, Hp | **P0** | Ghost hopper til snap-punktet med en kort tween (50 ms), "klik"-lyd og vibration 10 ms. Det er den vigtigste byggefeedback. |
| **Ugyldig placering** | V, UI, L | **P0** | Ghost bliver rød, en kort tekst om årsagen ("Ikke plads", "Mangler støtte"), dumpt fejl-bump ved forsøg. |
| Stabilitet | V, UI | P1 | Valheim/7DTD-farver: blå/grøn → gul → rød på ghost og på dele, når man sigter med byggeværktøjet. |
| Placeret | A, L, V | **P0** | Delen "popper" (skala 0,9 → 1,05 → 1,0), byggelyd efter materiale, støvpuf. |
| Rive ned / demontere | A, L, V, UI | P1 | Delen falder fra hinanden i brikker, "+Træ" returneres. |
| **Ødelægge objekt (slag/skud/eksplosion)** | V, L, K, D | **P0** | Skade-trin: intakt → revnet (decal/texture-swap) → **forud-fraktureret** udgave med 5–12 brikker (lavet i Blender) med simpel fysik, splinter/støv-partikler og en lyd efter materiale. Brikkerne forsvinder (fade/synker) efter 10–20 s. Se STYLE_DIRECTION, afsnit 6. |
| Bygning styrter sammen | V, L, K | P1 | Kæde af brikker, støvsky, stort trauma, rumlen. |
| Zombier banker på basen / dør | L, V, A, UI | **P0** | Dunk-lyde på væggen, væggen ryster, splinter, HP-ikon på væggen, når man er tæt på, og en advarsel om, hvor basen bliver angrebet. |
| Dør/port åbnes/lukkes | L, A | P1 | Animation + lyd (og lav larmring). |
| Fælde udløses | V, L, UI | P1 | Klik + effekten (spidser/fjeder), hitmarker, hvis den rammer. |

---

## 7. Verden
| Hændelse | Kanaler | Pri. | Billig løsning |
|---|---|---|---|
| Dag/nat-overgang | V, L, UI | P1 | Tween af lysfarve/intensitet og tågefarve (allerede uniforms). Fuglekor om morgenen, cikader/ugler om natten, en tone, når natten falder på (natten er farligere). |
| Vejr (regn, vind, tåge) | V, L | P2 | Regn: én instanced streg-mesh om kameraet (300–800 streger), regnlyd i lag. Vind: vertex-sway i træernes shader og vindsus. |
| Zombie-lydbillede | L | **P0** | Ambient stønnen i det fjerne (afstand → lowpass), tættere = tydeligere. Lyd viser trussel (L4D). |
| Musik/stemning | L | P1 | Lagdelt musik: ro → spænding (zombier tæt på) → kamp (2–3 stems, der fades ind efter trusselsniveau, à la L4D Music Director). |
| Område ryddet / zombie-tæller falder | UI, L | **P0** | Tælleren tikker ned med en lille animation, og "Området er ryddet" vises med et banner og et lydstik (findes som tekst). Det er spillets hovedmål og skal fejres. |
| Begivenhed (helikopterstyrt, konvoj) | L, UI, K | P2 | Fjern lyd, retningsmarkør, en lille rystelse ved store nedslag. |
| Telefonbesked | UI, L, Hp | P1 | Vibrationslyd/surr, notifikation i hjørnet, vibration 2× 40 ms. |
| Dyr | L, A, V | P1 | Dyr flygter ved larm (feedback på din larm), lyde. Ved jagt: ramt = blod + flugt-animation. |

---

## 8. UI og system
| Hændelse | Kanaler | Pri. | Billig løsning |
|---|---|---|---|
| Knaptryk (alle touch-knapper) | UI, L, Hp | **P0** | Knappen trykkes ned (CSS scale 0,92), kort klik, vibration 8 ms. Det svarer på hvert tryk, også når handlingen er umulig. |
| Handling ikke mulig | UI, L | **P0** | Kort vandret ryst på knappen + dumpt lyd + kort tekst. Aldrig ingenting. |
| Hotbar-valg | UI, L | **P0** | Slot lyser op og skaleres, våbnets navn vises kort. |
| Inventory åbn/luk | UI, L | P1 | Slide-tween + lyd. |
| Træk og slip i inventory | UI, L | P1 | Genstanden følger fingeren, slots lyser, hvor den kan lægges, og slip giver en lyd. |
| Gem/indlæs | UI | P1 | Diskret "Gemt"-ikon. |
| Indstillinger for feedback | UI | **P0** | Skydere for shake, vibration og gore-niveau (fuld/reduceret). Tilgængelighed og voksent valg. |
| Ydelse | System | **P0** | Alle effekter har et budget (partikler, decals, lyde, ragdolls) og en "lav"-profil på svage mobiler (`renderer.info.render.calls` bruges til at overvåge). |

---

## 9. Top 10 P0 – rækkefølge for implementering
1. **Skud affyres**: mundingsglimt, rekyl/kamerakick, lyd med variation, larmring.
2. **Træf på zombie**: blodpuf, hit-flash, hitmarker + træflyd, knockback, hit-reaction.
3. **Headshot og rigtigt drab**: rødt hitmarker, headshot-lyd, hitstop 40 ms, hovedet rykker/flyver af, kroppen kollapser.
4. **Afskudte/afhuggede lemmer med gameplay-svar**: blodstråle fra stumpen, lemmet bliver liggende, zombien kravler/kan ikke gribe.
5. **Nærkampsslag rammer**: hitstop 50–80 ms, trauma, tung lyd, våbenafhængigt sår, vibration.
6. **Spilleren bliver ramt**: rød vignette, retningspil, shake, smertelyd, flinch, vibration. Og **lavt liv**: puls, hjerteslag, desaturering.
7. **Zombie opdager/angriber**: 3D-snerren, tydelig antecipation før angreb, kantpil uden for synsfeltet.
8. **Hug i træ og træ vælter**: hak der vokser, ryst, "Tømmer!"-fald i retning, dunk + støv + shake.
9. **Saml op og fuld inventory**: genstand flyver ind, "+3 Træ", pling, og ved fuld inventory et rødt blink og en lyd, mens genstanden bliver liggende.
10. **Byggeri: snap, ugyldig placering og placeret**: ghost-tween + klik + vibration, rød ghost med årsag, pop-skala + støv.

(Lige under top 10, og også P0: fodtrin efter underlag, snigning med lydindikator, genladning/tomt magasin, ødelæggelse af objekter, zombie-tæller/område ryddet, knaptryk-svar.)

---

## 10. Status i koden i dag (by-any-means, commit `e6e9aea`)
Det findes allerede: puljede blodpartikler (1 draw call), instanced blod-decals, zombie-knockback og hit-reaction-klip, rød vignette, når spilleren rammes, afskudte lemmer med cap (`severPart`), crawler-klip, træer der ryster/vælter/efterlader stub, E/Use-knap. **Det mangler**: skydevåben, lyd overhovedet, camera shake/hitstop, hitmarker, haptik, larmring, partikler for andet end blod, ragdoll (kun "ragdoll-lite" via klip), ødelæggelse af objekter og byggefeedback.
