# Design notes

> **This project is dead.** It is kept as a record of what was tried and why it
> failed. Nothing here is a plan for future work.
>
> Short version: a coastline-prediction game was built over nine versions and
> turned out not to be a game — the player's choices barely changed the score.
> Four redesigns failed the same way. A replacement puzzle (Reef) works but is
> derivative. The one transferable lesson is at the end, under
> "The test to run before building anything".

Everything here is grounded in measurements. Where a number appears, it came from running the real thing over many boards.

The house rules that produced the good results, kept from the previous project:

- **Measure before building, and measure after.** Most of the changes that shipped were different from what was planned, because the measurement contradicted the plan.
- **Use paired comparisons and report a confidence interval.** Board-to-board variance is several times most effects.
- **Write balance properties into the tests**, not just correctness ones.
- **Say when a previous claim was wrong.** This file does that repeatedly. Keep it that way.

---

## The one question that matters

**Does thinking beat not thinking?**

If the best strategy is a fixed pattern, there is no game, however good the graphics and however clear the tutorial. That question went unasked for six versions of the previous project and it is the only reason this one exists.

For Reef, at the full ten pings, over 24 boards:

| how you play | reefs found (of 4) |
|---|---|
| thinking about each ping | **3.96** |
| a sensible fixed pattern | 2.88 |
| pinging at random | 2.33 |

Thinking beats a pattern by a whole reef. Good play narrows the board to a single consistent answer on 19 of 24 boards. Four pings finds 2.00 reefs, ten finds 4.00, so the budget bites at every point.

Crucially, **where to ping next depends on what the last ping said.** That is the adaptive decision the previous game never had.

## Why the probe is "distance to the nearest reef"

The obvious probe is a count: how many reefs within radius 2. It was measured and discarded.

| probe | candidate placements left after 8 probes |
|---|---|
| count within radius 1 | 530 |
| count within radius 2 | 53 |
| **distance to the nearest reef** | **4** |

Counting is information-starved: a count over a 5x5 box carries about 2.3 bits, and the space of placements is about 21.7 bits, so eight probes cannot close it. Distance-to-nearest carries more and, more importantly, it eliminates territory: everything closer than the reading is empty for certain. That elimination is what a person can actually reason with.

## Two things the measurements corrected

- **Ring crossings.** The tutorial claimed that after two pings the rings would cross and reveal a reef. Measured: over a full ten-ping game every board ends up with squares sitting on two or more rings (200 of 200, mean best agreement 2.96), but almost never after only two. The rule is now stated once and the live hint calls it out when it actually happens.
- **Pinging a reef directly** reads 0, which is a find. The first version would not let you mark that square, so you could find a reef and be unable to score it.

## What was here before, and why it was replaced

The repository held a coastline-prediction game through nine versions. You spent up to twelve survey anchors on a hidden coast, a robust curve fit reconstructed it, and you were scored on accuracy plus an anomaly hunt. It is in the git history up to `9b478d0`.

A great deal of careful work went into it: a robust leave-one-out fit that rejected contradicted anchors, local anomaly patches placed from an instrument's column profile, a tide gauge that counted cells no smooth coast could explain, seeded dailies, a share string, visible model uncertainty, a commit-then-paint loop, par, and a coach line.

None of it mattered, because of this:

| anchors spent | 3 | 4 | 6 | 8 | 12 |
|---|---|---|---|---|---|
| points | 245 | 286 | 267 | 291 | 303 |

**Four times the spend for six percent more points, inside the noise.** The one decision the game asked for had almost no consequence. The best strategy was to spread five or six anchors along the coast and stop, which is a fixed pattern learnable in one sentence. The anomaly hunt, which was supposed to supply the real decision, was break-even against simply surveying more coast and landed about one probe in six.

The structural cause: a measurement told you the coast height in one column and nothing about any other column. Nothing chained. The only work between measurements was fitting a smooth curve, which a machine does better than a person, so the algorithm was always the protagonist and the player was feeding it.

**The evidence was in the test output the whole time.** A flat accuracy ladder printed on every run and was read as "no regression" rather than "the budget does not matter". Three rounds of legibility work went into explaining a game that had nothing to explain. The lesson is the ordering: establish that thinking beats not thinking *first*, and only then spend effort on tutorials, scoring polish, and prose.

## Four ways the coastline failed, and the one test that would have caught them

The owner liked the coastline premise and found Reef too close to Minesweeper. Both fair. Four designs were built and measured to bring the coast back. All four failed, and they failed the same way: **the player's decisions did not change the outcome.**

### 1. Coastline + tile probes (the original game, v1-v9)

A probe told you the tile you stood on. Spending twelve anchors scored 303 points against 286 for four. The smooth fit between measurements did the work, and a machine interpolates better than a person.

### 2. Coastline + distance probes

A ping reports how far the water's edge is. Solved exactly by DP over columns with a bitmask for touched rings.

| pings | consistent coastlines left | columns exactly right |
|---|---|---|
| 5 | 25,700 | 8.1 of 16 |
| 8 | 1,170 | 10.9 of 16 |
| 11 | 192 | 13.2 of 16 |

Placement mattered twelve to one against random pings, but it never collapses. Perfect play still leaves 192 possibilities.

### 3. Coastline + sonar rays

A ray cast sideways or diagonally eliminates a whole line of water and pins one point of coast, which is shape reconstruction from silhouettes rather than neighbourhood counting. On candidate count it looked like a triumph: 816 consistent coastlines from smart casting against 478,800 from random, a 586-fold gap.

On the coastline you would actually *draw*, it evaporated:

| rays | smart | systematic fan | random |
|---|---|---|---|
| 12 | 7.7 of 18 | 7.1 | 8.4 |
| 16 | 10.0 of 18 | 11.2 | 9.2 |

No consistent ordering; the gaps sit inside the noise at n=30. **Narrowing the possibility space did not produce a better drawing.** This was nearly written up as a success on the strength of the candidate count alone, which is the same error as reading the old game's flat accuracy ladder as "no regression".

There is also a hard limit: rays come from the water, so a bay behind a headland is occluded and unknowable at any budget.

### 4. Sail it instead of mapping it

Change the verb. The coast is visible; the depth is not. Cross west to east, a cell passable when depth + tide >= draft, each turn spent either moving or sounding ahead, against a falling tide.

| draft | dash (never sounds) | careful (24 soundings) | pilot |
|---|---|---|---|
| 4 | 92% | 92% | 91% |
| 6 | 61% | 62% | 57% |
| 7 | 34% | 35% | 32% |

**Sounding twenty-four times performs identically to never sounding.** Whether you get across is a property of the map. At shallow drafts a route nearly always exists, so charging blind works; at deep drafts none exists, so nothing works. There is no band between where information changes the outcome.

### What the four have in common

A hidden-information game has skill in it only when **the answer is hard to guess without probing, and the probes can actually resolve it.** Reef sits in that window: four reefs among 96 cells is high entropy, distance-to-nearest is informative, and naming exact cells requires all of it.

Every coastline design fails one side or the other. A coastline is smooth, which is precisely what makes it look like a real coast, and smooth means low entropy, so a few points plus interpolation gets most of the way. The premise fights the puzzle. Anomalies were bolted onto v3 as a source of entropy and did work when found (+207 points), but could not be found reliably; that was the same wall in a costume.

### The test to run before building anything

**Simulate a thinking policy and a naive one, and check the thinking one wins.** No UI, no tutorial, no scoring, no prose until that gap exists. It takes under an hour and it would have killed all four of these before a line of interface was written. It is the only measurement in this repository that has ever mattered.

## Superseded: the earlier write-up of design 2

The owner liked the idea of reconstructing a hidden coastline and disliked that Reef is close to Minesweeper. Both are fair. So the question is whether the coastline can be rebuilt on a probe that actually chains.

The natural candidate: keep the hidden coastline, but a ping reports **how far the water's edge is** rather than what tile you are standing on. Same eliminate-and-intersect engine as Reef, but the thing you are finding is a connected curve, so each reading constrains its neighbours too.

Measured on a 16x10 grid, coastline as one cell per column stepping at most one row at a time, solved exactly by dynamic programming over columns with a bitmask for which rings have been touched:

| pings | consistent coastlines left | columns exactly right |
|---|---|---|
| 5 | 25,700 | 8.1 of 16 |
| 8 | 1,170 | 10.9 of 16 |
| 11 | **192** | **13.2 of 16** |

With pings placed at random rather than well, 11 pings leaves 2,238 coastlines instead of 192. So placement matters by roughly twelve to one, which is the property the old game lacked.

But it does not collapse. Perfect play still leaves 192 possibilities and gets 13 of 16 columns. Whether that is a good game or a frustrating one is unresolved:

- **For it:** partial credit suits a curve better than Reef's binary found-or-missed, and "how close did you get" is a natural score for a coastline. The skill gradient is real.
- **Against it:** a puzzle that never resolves may feel unsatisfying, and the endgame is guessing between near-identical curves rather than deducing.

All three of those unknowns were then measured and are reported above. The careless player scores about as well as the careful one, a larger budget does not collapse it, and edge-cast sonar makes things worse rather than better. This section is kept only because the earlier version of this file recommended the idea, and the record should show the recommendation and its refutation together.

## Backlog

- Reef has no dailies, no seeds surfaced in the UI, no share string, no score history. `?seed=` works but nothing exposes it.
- No mobile layout pass. The board is 12 x 38px = 456px, which fits a phone, but this has not been tested on a real device.
- No difficulty settings. Board size, reef count, and ping budget are all constants at the top of the script.
