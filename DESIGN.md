# Tide Table — how to make this engaging

Everything below is grounded in measurements from `test.mjs` and the tuning harnesses used to build v3. Where a number appears, it came from running the real game over 200–600 generated maps.

## Where the game stands after v3

| what the player does | survey value | coastline % |
|---|---|---|
| nothing | 0% | 62.3 (free) |
| 6 anchors walking the coast | 18.9% | 67.5 |
| 12 anchors walking the coast | 32.8% | 73.1 |
| 6 coast anchors + both anomalies | 46.1% | 77.5 |
| 6 coast anchors + gauge-guided probing (v4) | 25.3% | 72.2 |
| perfect knowledge of the coastline, anomalies unknown | — | 83.4 (ceiling) |
| perfect knowledge of everything | 100% | 100 |

Two things this table says. First, the design intent now holds: **finding the anomalies with 8 anchors beats brute-forcing the coast with 12.** That is the decision the game is supposed to be about, and it finally pays. Second, there is still real headroom — 22% of the scored band is anomaly-corrupted, and the smooth fit gives up another 10 points against its own ceiling.

## The central problem was that the hunt was blind — v4 fixes the information, not the economy

A random probe into the interior gained about **+1.5% per 2 anchors**. Anomalies occupy ~13 cells out of 480, so blind probing was a lottery, and the most interesting decision in the game was resolved by luck.

### 1. A tide gauge — make the hunt deductive ✅ shipped in v4, with corrections

**The spec in this document was wrong, twice over.** It called for showing the true total count of water cells and said it was "about three lines of code and the highest-value change on this list". Measured, it is neither.

- A water tally is swamped by the error in the player's own coastline fit, which runs to **±30 cells** against an anomaly worth 20.
- A lake adds water and a headland removes it, so across a map they **cancel**: median net contribution −2 cells.
- Worse, a *global* reading — of any quantity — turns out to be worth nothing at all. It tells you something is out there but never where, so you still probe blind, and the reading almost never clears, so it fails even as a stopping rule. End to end it scored **245 points against 249 for not probing at all**.

What works, and what shipped: count the cells that **no smooth coastline can explain** — exactly the anomaly footprint, since everything else on the map is a smooth coast by construction — and report it **per sector** so it localises. That quantity is invariant to where the coastline sits, which is the property a water or sand tally lacks. Candidates measured along the way, for the record:

| gauge | reads 0 on a complete survey? | usable? |
|---|---|---|
| water tally | no, ±30 noise | no — and the two anomaly types cancel |
| sand tally | no, ±30 noise | no |
| water runs per column | yes | misses headlands (51% / 20% discrimination) |
| tile transitions | no, biased by coast waviness | no |
| detached features (topological) | yes | patches often merge with the sea, so it will not clear |
| **unexplained cells, by sector** | **yes** | **shipped** |

Result: gauge-guided probing scores **263** against **240** for blind probing and **249** for not probing. It turns probing from a losing move into a winning one and beats blind probing outright — but only beats *not probing* by ~6%, because the efficiency bonus taxes away most of what the extra anchors buy. **The bottleneck has moved from information to economy** — see item 1b.

A **column sounding** that narrows the search to a single column without giving away the row remains worth building as a costed second instrument.

### 1b. Score the hunt ✅ shipped in v5 — and the anchor bonus was the wrong lever

This document previously called for retuning `ANCHOR_COST`. That cannot work, and the reason is worth writing down: the bonus multiplies every strategy by the same factor for the same spend, so **it can never rescue a strategy that is worse at equal spend**. Measured, gauge-guided hunting was exactly that — 24.4% survey value for 10.1 anchors against 29.3% for ten anchors spent walking the coast. Probes that miss teach you nothing, while a coast anchor always improves the fit. No value of the multiplier changes that ordering.

What does work is paying for what the hunt actually achieves. 60% of the score is now how much of the tide gauge your chart closes, with invented exceptions subtracted. Hunting now beats grinding the coastline at the same budget by **+18 points (95% CI ±16, paired over 800 maps)**.

The weight is tuned to a narrow window: below 0.55 hunting is not significantly better than grinding; above 0.60 a *perfect* hunt stops being the best available play, which would be worse than the problem. It sits at 0.60.

The gauge also now corroborates the model directly. A lone surprising anchor normally needs a neighbour to agree before an exception is carved, because it could just be a coast running high — but where the instrument independently reports something unexplained, one anchor is enough. Detection rose from 74% to 80%, and false exceptions in clear sectors fell.

### 1c. Place exceptions from the instrument ✅ shipped in v6

A patch centred on the anchor put itself wherever the anchor happened to land, which closed only ~36% of the gauge even when the anchor sat exactly on an anomaly's centre. Enlarging it was strictly worse (34% → 11% at radius 2.4, since over-charting is penalised) — the problem was placement, not size.

The gauge already knows the horizontal shape, so the patch now takes its column from the profile's centroid and its radius from the area, and only the row from the anchor. Two details mattered more than the geometry:

- **Centroid, not midpoint; area, not width.** A run's edge column is only clipped by the blob, and a column holding one cell is not a column holding six. Using the midpoint and the span cost about 3 points of coastline accuracy.
- **Split merged runs.** On ~47% of maps both anomalies share one unbroken run of columns. Swallowing both into one blob puts a patch between them that matches neither; grouping anchors into features and giving each only the columns nearer to it fixes it.

Result: closure 36% → 52%, and 32% → 52% for the realistic case of anchoring off centre. Because the hunt term now earns more, `HUNT_WEIGHT` came *down* from 0.60 to 0.45 while the margin over grinding stayed significant (+21 pts, 95% CI ±14) — leaving more of the score on the coastline, which is the better place for it.

### 2. Don't tell the player how many anomalies there are ✅ shipped in v7

Maps now hold 0–4 anomalies, weighted toward 2, and the count is never shown. One consequence had to be handled: a map that hides nothing was scoring the hunt term at 100% for free, so doing nothing earned points. On such a map the hunt is simply not part of the score and the coastline carries all of it.

### 2b. Vertical localisation — investigated and rejected

DESIGN.md listed this as the main thing limiting the hunt, on the premise that a patch's row is poorly estimated. Measured over 3,022 anomalies, that premise is wrong:

| row estimate | mean error (rows) |
|---|---|
| the anchor's own row | **0.74** |
| geometry (blob height + coast level) | 1.68 |
| best blend of the two | 0.73 |

The anchor is already accurate to well under a cell, and the geometric estimator is more than twice as bad — blending it in buys nothing. Detection is not the culprit either: an anchor on an anomaly's exact centre is flagged 74% of the time against 72% for one anywhere in the blob. The residual centre-vs-edge gap is simply the irreducible cost of a sub-cell row error on a radius-3 blob, and the player's lever for it already exists — a second anchor on the same feature lifts the coastline gain from +3.24 to +3.87. No change shipped.

Currently it is always exactly 2, and the README says so. Randomise it 0–4 and keep it secret. Combined with the tide gauge, "is there a third one?" becomes the question the whole endgame turns on. Right now the player just counts to two and stops.

### 3. Seeded dailies and a share string ✅ shipped in v7

The RNG is already deterministic (`mulberry32`) — only the seed selection uses `Math.random`. Exposing `?seed=` is a few lines. Then:

- A daily coastline everyone plays, derived from the date.
- A spoiler-free share string, the mechanic that made Wordle spread:

```
Tide Table #214   8⚓  54%
🟦🟦🟨🟩🟦🟦🟨🟩
```

This is the highest retention-per-line-of-code item in the repository. Nothing else here makes anyone come back tomorrow.

### 4. Show the model where it is unsure ✅ shipped in v7

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
- **Vertical placement is the anchor's job and stays that way.** See 2b: the anchor's row is already accurate to 0.74 rows, better than any estimator built from the gauge, so the remaining centre-vs-edge gap is not recoverable from the information on hand.
- **Scores are not comparable across maps.** A map hiding nothing is scored purely on coastline; a map hiding four is mostly a hunt. With dailies this matters less — everyone plays the same map — but a global leaderboard would need per-seed normalisation.
- **The gauge's own reading can mislead in one direction.** A correct find whose patch is larger than the true anomaly reads as over-charted; the display only flags it past a 6-cell margin to avoid punishing good play, which means small phantom exceptions go unreported.
- **`ANCHOR_COST` is tuned, not derived.** At 0.04 the efficiency bonus rewards a lean survey without making a zero-anchor run viable, but the whole curve shifts if the grid or budget changes.
