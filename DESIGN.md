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
| 6 coast anchors + both anomalies, then a careful brush (v8) | — | 76.2 |
| 6 coast anchors + both anomalies, then an overconfident brush (v8) | — | 71.7 |
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

### 6. Commit before reveal ✅ shipped in v8 — and it found a hole in the scoring

Play is now `survey → chart → reveal`. Locking the survey freezes the anchors and turns the model's coastline from a live readout into a proposal; the player paints over it with a three-tile brush and locks that in. Strokes are stored apart from the proposal, so a stroke that agrees with the model is not a stroke — which makes "paint nothing and score exactly what the model scored" exact, and testable.

The brush is a real decision in both directions. Paired over 400 maps on top of a survey that anchored every anomaly:

| what the player paints | points vs not painting |
|---|---|
| a careful ring, radius 2, around each flagged anomaly | **+38 (95% CI ±6)** |
| an overconfident ring, radius 3 | **−143 (±11)** |
| the truth (the ceiling) | +643 (±15) |
| nothing | 0, exactly |

That spread is the point: the model's patch is good enough that timid painting gains little and greedy painting is punished, so the interesting play is judging *how far* your one anchor's evidence reaches.

#### What painting exposed: the hunt term was counting, not looking

Handing the player a brush turned a latent scoring flaw into the dominant strategy. The hunt term counted, per sector, how many cells your chart carved as exceptions against how many were hidden there — and never asked whether they were in the right place. So: spend nothing, lock in the blind guess, then paint exactly the number of cells the gauge reports into the sector it reports them in, at a row chosen with no information whatsoever.

Paired over 800 maps, `HUNT_WEIGHT` 0.45 throughout:

| strategy | counting hunt | positional hunt | counting pts | positional pts |
|---|---|---|---|---|
| survey the coast, anchor every anomaly | 53% | 57% | 486 | 505 |
| grind 11 anchors along the coast | 60% | 24% | 457 | 306 |
| paint the gauge's own reading, 0 anchors | 99% | 3% | **593** | 23 |

The exploit beat honest play by **+106 points (95% CI ±18)**. And the second row shows the flaw was never really about painting: walking the coast carves ~48 exception cells incidentally, only half of them on a real anomaly, and the counting term paid for all of them — so the term written to reward hunting was scoring a pure grind *above* a survey that found everything.

The hunt is now scored the way the coastline half already was: lift above the blind guess, same tiered credit, measured over the cells the anomalies actually occupy, minus 0.25 per invented exception cell (a measured cell can never count as invented). Candidates measured before settling on it:

| definition | lazy | grind | honest | exploit |
|---|---|---|---|---|
| counting, per sector (v5–v7) | 0% | 60% | 53% | 99% |
| positional, must carve *and* match, full penalty | 0% | 0% | 13% | 0% |
| positional, tile match only, full penalty | 7% | 3% | 19% | 0% |
| lift over the blind guess on the footprint, no invention penalty | 0% | 34% | 68% | 9% |
| lift over the blind guess, penalty 0.5 | 0% | 14% | 40% | 1% |
| **shipped: lift over the blind guess, penalty 0.25, charged only where the stroke is also wrong** | **0%** | **24%** | **57%** | **3%** |

The full-penalty variants are unusable: every patch spills a sand fringe, so honest play scores 13%. Taking the penalty off entirely leaves the exploit worth 9%, about 60 points for nothing. At 0.25 the exploit is worth 23 points and the ordering `honest > grind > exploit > lazy` — which the counting term got backwards — holds.

One detail in the last row earns its length. An exception is charged as invented only where the stroke is also *wrong*. Your smooth coast is an estimate of the true one, so a stroke that departs from it and lands on the truth is a coastline correction, not a phantom anomaly; charging those cost a pixel-perfect chart 0.165 of the hunt term and made painting the truth *lose* points on some maps. A cell you measured is excluded for the same reason.

**`HUNT_WEIGHT` stays at 0.45.** It was re-swept from 0.35 to 0.75 after the change and no value rescues probing — the best it reaches is +14 (±14) at 0.65, still not significant (see 6b) — while moving it only takes score off the coastline, where v6 deliberately put it.

The tide gauge itself stays a pure count, deliberately. A gauge that reported placement would hand the player, for free, the one thing anchors are for. The share string is written after the reveal and so does report placement.

### 6b. Gauge-guided probing does not beat grinding — withdrawing the v5 claim

v5 reported that scoring the hunt made gauge-guided probing the winning line by **+18 points (95% CI ±16)**. That margin was an artifact of the counting term: it paid grinding and probing alike for incidental exception cells, and happened to pay the prober a little more. Under the positional term, paired over 800 maps at an 11-anchor budget:

| comparison | result |
|---|---|
| finding the anomalies vs grinding the coast | **+207 (95% CI ±14)** |
| gauge-guided probing vs grinding the coast | −7 (±11) |

So the design intent holds, and more strongly than before — *finding* anomalies is worth ~207 points against grinding, where the counting term scored the same comparison at +29. What does not hold is that *searching* pays. The cause is measured, not guessed: the gauge localises to a sector of 6 columns × 16 rows, an anomaly is ~13 cells, and the prober lands on a hidden cell **16% of the time** (218 hits in 1,335 probes) — barely better than a uniform draw inside the sector. A probe is worth about a sixth of a find, which is roughly what the anchor costs.

Variants measured, none of which clear grinding: 4 coast + 7 probes (−10 ±13), 7 + 4 (−29 ±9), 7 + 4 with corroboration on a hit (−36 ±9), 9 + 3 (+1 ±7). Corroborating a hit makes it *worse*, because the second anchor is spent before the first is known to have landed.

This is the anchor-bonus lesson from v5 in a new costume, and the same answer applies: **a global constant cannot rescue a strategy that is worse at equal spend.** The fix is a finer instrument — item 7's column sounding — which is now the highest-value item in this document.

### 7. Instruments and a run structure — the column sounding is now the top item

Five coastlines in a row with an escalating budget, unlocking tools as you go: single probe → column sounding → 3×3 sonar sweep (wide but blurred). Different information *shapes* create real decisions; a uniform anchor budget only creates a quantity decision.

6b promoted the **column sounding** from a nice-to-have to the thing the economy is waiting on. A sounding that names the column but not the row would cut the search space from a 6×16 sector to a 1×16 strip — from a 16% hit rate to something near 80% — which is the difference between a probe being worth a sixth of a find and being worth most of one. Cost it against an anchor and the hunt becomes a real purchase rather than a lottery ticket. Measure the hit rate before tuning the price.

### 8. Par, not just points

The harness can run a reference bot over the current seed in milliseconds. Show "par: 6 anchors, 45%" on the board. Beating a named opponent motivates far better than an abstract score does, and it makes a bad map feel like a hard hole rather than a broken game.

---

## Lower priority, still worth doing

- **Mobile/touch layout.** 30 × 20px cells = 600px; it is cramped, there is no touch affordance for "remove anchor", and since v8 painting needs a drag that touch does not deliver.
- **Difficulty curve.** Grid size, anchor budget, and coastline waviness are all single constants. Expose them as Calm / Standard / Broken Coast.
- **WFC for anomaly generation.** The original plan, and it still fits: local adjacency is bad at reconstructing a smooth coast but genuinely good at growing plausible irregular blobs. Use it to plant features, not to predict them.
- **High-score persistence** in `localStorage`, per difficulty.
- **An undo stack for the brush.** There is a per-cell revert and a reset-all, but no step-back, and a mis-drag currently costs the whole stroke.

---

## Known weaknesses in the current model

Honest accounting of what v3 did not fix:

- **Detection is ~74%, not 100%.** An anomaly anchor near the edge of its blob barely contradicts the fit, so it is correctly not flagged — but the player has no way to tell a missed detection from a mis-click. When an anomaly anchor is *not* flagged it still costs about −1.3 points of accuracy, the old failure mode in miniature.
- **The smooth fit reaches 73% against an 83% ceiling** with a full 12-anchor coastal survey. Sand localises the sea level only to ±0.9 rows, so there is an intrinsic floor, but not a 10-point one. A proper spline or a Gaussian-process fit with a periodic kernel would close much of it.
- **The scored band is generous.** Off-by-one-tier still earns 0.4, which is why a blind guess scores 62%. Baseline-relative scoring papers over this; tightening the band would make the underlying numbers mean more.
- **Vertical placement is the anchor's job and stays that way.** See 2b: the anchor's row is already accurate to 0.74 rows, better than any estimator built from the gauge, so the remaining centre-vs-edge gap is not recoverable from the information on hand.
- **Scores are not comparable across maps.** A map hiding nothing is scored purely on coastline; a map hiding four is mostly a hunt. With dailies this matters less — everyone plays the same map — but a global leaderboard would need per-seed normalisation.
- **The gauge's own reading can mislead in one direction.** A correct find whose patch is larger than the true anomaly reads as over-charted; the display only flags it past a 6-cell margin to avoid punishing good play, which means small phantom exceptions go unreported.
- **The gauge now says less than the score knows, on purpose.** Since v8 the gauge counts and the score looks. A player can close every reading and still score badly on the hunt, because the gauge never claimed the exception was in the right place. This is the honest trade — a positional gauge would give away what anchors are for — but it is a real teaching problem, and the current mitigation is one line of label text.
- **Searching for anomalies is break-even; only finding them pays.** See 6b. The gauge points at a sector too coarse to aim inside, so a probe hits 16% of the time. Until the column sounding exists, the strongest line of play is a good coastal survey plus luck, which is not the game this document is trying to build.
- **Painting is a mouse gesture.** Strokes are drag-driven (`mousedown` + `mouseenter`), and drag does not work under touch, so on a phone the chart phase degrades to one click per cell. This is now the sharpest edge of the mobile problem below, not a separate one.
- **`ANCHOR_COST` is tuned, not derived.** At 0.04 the efficiency bonus rewards a lean survey without making a zero-anchor run viable, but the whole curve shifts if the grid or budget changes.
