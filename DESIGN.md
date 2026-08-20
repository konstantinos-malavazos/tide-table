# Tide Table — how to make this engaging

Everything below is grounded in measurements from `test.mjs` and the tuning harnesses used to build v3. Where a number appears, it came from running the real game over 200–600 generated maps.

## Where the game stands after v3

| what the player does | survey value | coastline % |
|---|---|---|
| nothing | 0% | 62.3 (free) |
| 6 anchors walking the coast | 18.9% | 67.5 |
| 12 anchors walking the coast | 32.8% | 73.1 |
| 6 coast anchors + both anomalies | 46.1% | 77.5 |
| perfect knowledge of the coastline, anomalies unknown | — | 83.4 (ceiling) |
| perfect knowledge of everything | 100% | 100 |

Two things this table says. First, the design intent now holds: **finding the anomalies with 8 anchors beats brute-forcing the coast with 12.** That is the decision the game is supposed to be about, and it finally pays. Second, there is still real headroom — 22% of the scored band is anomaly-corrupted, and the smooth fit gives up another 10 points against its own ceiling.

## The central problem: the hunt is blind

A random probe into the interior gains about **+1.5% per 2 anchors**. Anomalies occupy ~13 cells out of 480, so blind probing is a lottery. The player has no way to reason about where to look, which means the most interesting decision in the game is currently resolved by luck.

Everything in the "high impact" section below exists to fix that.

---

## High impact

### 1. A tide gauge — make the hunt deductive

Show the true total count of water cells (an instrument reading, not a spoiler). The player's live prediction has its own count. If the truth says 210 water cells and your prediction only accounts for 197, **there is a lake out there you have not found** — and you know roughly how big it is.

This single readout converts blind probing into a search with a stopping rule, and it gives the endgame its tension: *do I spend my last two anchors hunting the discrepancy, or bank the efficiency bonus?* It is about three lines of code and it is the highest-value change on this list.

A second instrument, a **column sounding** that reports how many water cells a given column contains, narrows the search to a column without giving away the row. Sell it at a higher anchor cost and you have a genuine tool economy.

### 2. Don't tell the player how many anomalies there are

Currently it is always exactly 2, and the README says so. Randomise it 0–4 and keep it secret. Combined with the tide gauge, "is there a third one?" becomes the question the whole endgame turns on. Right now the player just counts to two and stops.

### 3. Seeded dailies and a share string

The RNG is already deterministic (`mulberry32`) — only the seed selection uses `Math.random`. Exposing `?seed=` is a few lines. Then:

- A daily coastline everyone plays, derived from the date.
- A spoiler-free share string, the mechanic that made Wordle spread:

```
Tide Table #214   8⚓  54%
🟦🟦🟨🟩🟦🟦🟨🟩
```

This is the highest retention-per-line-of-code item in the repository. Nothing else here makes anyone come back tomorrow.

### 4. Show the model where it is unsure

The fit already computes a corroboration weight per column (`conf` in `fitSea`). Render weakly-supported columns with a fade or hatch. The player can then *see* which stretch of coast their next anchor should go to, which turns the board itself into the strategy layer instead of leaving placement to intuition. Nearly free — the number is already there.

### 5. Make the reveal a moment

Right now the truth appears instantly and a number changes. Stage it: the coastline settles first, then the anomalies pop, then the errors light up. Give the anomalies names on reveal ("Bitter Lake", "Cape Nettle"). This is the part people screenshot, and it currently reads like a form validation result.

---

## Medium impact

### 6. Commit before reveal

The live preview means the player never actually commits — they watch a machine interpolate and then press a button. Add an explicit lock-in beat before the reveal. Better still, let them **paint over the model's guess** first: the model proposes, the player disposes. Scoring your own brushstrokes is a different emotion from scoring an algorithm's, and it makes the title verb ("predict") something the player does rather than something done for them.

### 7. Instruments and a run structure

Five coastlines in a row with an escalating budget, unlocking tools as you go: single probe → column sounding → 3×3 sonar sweep (wide but blurred). Different information *shapes* create real decisions; a uniform anchor budget only creates a quantity decision.

### 8. Par, not just points

The harness can run a reference bot over the current seed in milliseconds. Show "par: 6 anchors, 45%" on the board. Beating a named opponent motivates far better than an abstract score does, and it makes a bad map feel like a hard hole rather than a broken game.

---

## Lower priority, still worth doing

- **Mobile/touch layout.** 30 × 20px cells = 600px; it is cramped and there is no touch affordance for "remove anchor".
- **Difficulty curve.** Grid size, anchor budget, and coastline waviness are all single constants. Expose them as Calm / Standard / Broken Coast.
- **WFC for anomaly generation.** The original plan, and it still fits: local adjacency is bad at reconstructing a smooth coast but genuinely good at growing plausible irregular blobs. Use it to plant features, not to predict them.
- **High-score persistence** in `localStorage`, per difficulty.

---

## Known weaknesses in the current model

Honest accounting of what v3 did not fix:

- **Detection is ~74%, not 100%.** An anomaly anchor near the edge of its blob barely contradicts the fit, so it is correctly not flagged — but the player has no way to tell a missed detection from a mis-click. When an anomaly anchor is *not* flagged it still costs about −1.3 points of accuracy, the old failure mode in miniature.
- **The smooth fit reaches 73% against an 83% ceiling** with a full 12-anchor coastal survey. Sand localises the sea level only to ±0.9 rows, so there is an intrinsic floor, but not a 10-point one. A proper spline or a Gaussian-process fit with a periodic kernel would close much of it.
- **The scored band is generous.** Off-by-one-tier still earns 0.4, which is why a blind guess scores 62%. Baseline-relative scoring papers over this; tightening the band would make the underlying numbers mean more.
- **`ANCHOR_COST` is tuned, not derived.** At 0.04 the efficiency bonus rewards a lean survey without making a zero-anchor run viable, but the whole curve shifts if the grid or budget changes.
