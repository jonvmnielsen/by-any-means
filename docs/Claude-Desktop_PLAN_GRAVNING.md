# Plan: gravning, tunneller og underjordiske baser

Skrevet af Claude-Desktop 24/10.

## Hvad virker nu
- Med en skovl kan du grave huller ned i terrænet, 0,35 m pr. gang og højst 3 m dybt.
- Højdekortet og terrænets modeller sænkes sammen, så du og zombierne kan gå ned i hullet.

## Hvorfor tunneller kræver mere
- Terrænet er et højdekort: ét tal (højden) for hver meter.
- Et højdekort kan ikke have et loft. Derfor kan der ikke være hulrum under jorden, altså ingen tunnel og intet rum med jord ovenover.

## Løsningen: voxel-terræn i de områder, hvor man graver
- **Hvad det er:** jorden bliver delt i små terninger, fx 0,5 m.
- **Hvordan det tegnes:** terningerne tegnes som en glat overflade (marching cubes).
  - Man kan grave i alle retninger, også vandret ind i en skrænt og ned under jorden.
  - Ståltrapper, døre og vægge fra byggesystemet kan sættes ind i hulrummene.
- **Hvor det bruges:** kun i de felter, hvor nogen har gravet (fx 32 × 32 m). Resten af verden bliver som nu, så hastigheden ikke falder.
- **Hvad der skal laves:**
  1. Voxel-felter med marching cubes, bygget i baggrunden (Web Worker).
  2. Kollision og fodfæste for voxel-felterne.
  3. Grave- og fyldeværktøj: skovl, hakke og jord i inventaret.
  4. At gemme de ændrede felter.
  5. Lys under jorden: mørke, lommelygte og lamper.
  6. At zombierne kan følge dig ned, hvis de kan finde vej.
- **Omfang:** en stor opgave. Det er realistisk at lave det i et par runder.
