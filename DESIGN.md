# Design notes

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

## Open: can the coastline come back?

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

Unmeasured, and needed before building: how a careless player scores (only perfect play has been measured), whether a larger ping budget collapses it, and whether restricting pings to the map edges — sonar cast from a ship — makes the geometry more legible.

## Backlog

- Reef has no dailies, no seeds surfaced in the UI, no share string, no score history. `?seed=` works but nothing exposes it.
- No mobile layout pass. The board is 12 x 38px = 456px, which fits a phone, but this has not been tested on a real device.
- No difficulty settings. Board size, reef count, and ping budget are all constants at the top of the script.
