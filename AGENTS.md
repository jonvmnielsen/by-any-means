# AGENTS.md – By Any Means (BAM)

Instruktioner til alle AI-agenter (Claude Code, Claude Desktop, Grok-Bot, Cursor, Codex …). Jon ejer projektet; tal dansk med ham, kort og uden teknisk jargon.

## Arbejdsdeling og repos (Jon, 24/10 – tilføjet af Grok-Bot)
Jon har besluttet tre repos med hver sin rolle (+ et test-repo):

| Repo | Rolle | Hvem skriver |
|---|---|---|
| `asset-forge` (privat) | **Kun værktøjer og pipeline** (forge, layers, part-by-part, gates, MCP). Færdige assets hører ikke hjemme her; `output/` er arbejdsområde. | Grok-Bot (primær), andre AI'er til værktøjer |
| `game-assets` (privat) | **Det eneste asset-bibliotek**: gratis pakker + alt vi selv laver i `library/<kategori>/<stil>/<skaber>/<asset>/v<N>/` med `meta.json`. Kasseret → `Discarded/` (slettes aldrig uden Jon). Se `LIBRARY.md`. | Grok-Bot ejer `library/`; Claude lægger nye assets i `incoming/` |
| `by-any-means` (offentlig) | **Spillet.** Bygges af Claude og henter kun **godkendte** (`status: approved`) assets fra `game-assets`. | Claude |
| `bam-style-lab` (privat) | **Tests**: stilarter side om side, kandidater, animationer. Rører aldrig spillet. | Grok-Bot (+ alle til tests) |

- Når et asset er færdigt i asset-forge, **kopieres** det ind i `game-assets/library/` som ny version (status `candidate`). Jon godkender → `approved` → spillet må bruge det.
- Intet slettes eller overskrives uden Jon. Ingen force-push.

## For dette repo (spillet)
- Spillet bygges af **Claude**. Grok-Bot leverer assets via biblioteket og kan gennemgå ændringer, når assets lægges ind.
- Brug kun assets med `status: "approved"` fra `game-assets/library/` (eller godkendte gratis pakker fra `game-assets/web/` via `tools/sync.mjs`). Notér bibliotekets commit for hver asset (fx i `assets.lock.json`).
- Producér ikke nye assets direkte i spillet. Nye eller ændrede assets laves i asset-forge og lægges i biblioteket først.
- Stil-eksperimenter og tests hører hjemme i `bam-style-lab`, ikke her.
- Spillet skal forblive mobilvenligt (Three.js i browseren, GitHub Pages).
- Commit-beskeder starter med agentens navn (fx `Claude-Code: …`). Intet slettes eller overskrives uden Jon.
