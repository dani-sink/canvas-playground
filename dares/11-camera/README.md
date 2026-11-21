## 11 – camera

The world is 2000 px wide now (5 screens), and a camera follows the square through it.

### The problem

Since Dare 1, **the canvas was the whole universe**:

- walls at `canvasWidth - squareSide` and `canvasHeight - squareSide`
- every obstacle's `x`/`y` was a position _on the canvas_
- `drawShape(x, y, ...)` drew at exactly the square's position

There was never a difference between **where something is** and **where it appears**. A box at `x: 290` was 290 px from the left of the world AND of the screen, because they were the same thing. That capped the level at 400 × 300 px: one room.

### What changed

Two coordinate systems:

|            | Meaning                   | Used by                         |
| ---------- | ------------------------- | ------------------------------- |
| **World**  | where things actually are | physics, collisions, level data |
| **Screen** | where things get drawn    | drawing only                    |

A **camera** connects them: `cameraX` = the world x shown at the screen's left edge.
**screen x = world x − cameraX.** A box at world 850 with the camera at 700 shows at screen 150.
The rule: **physics never knows the camera exists.**

### How it went

**1. Which constants mean "screen" and which mean "world"?**
Sorting rule: if the square can never go past it → **world**. If it's about what fits in the view or gets cleared → **screen**.

- `leftLimit`, `topLimit`: still 0. They never used the canvas size, and the world starts at 0 too.
- `rightLimit` → `worldWidth - squareSide`.
- `bottomLimit` → `worldHeight - squareSide`. Same number (300 = 300), different _meaning_. Matters the day the world gets taller.
- `clearRect` → screen. Correction to how I first put it: `clearRect` doesn't decide _which part of the world_ is shown, it just wipes the canvas's pixels. Choosing the slice is the camera's job.

Test before drawing anything: ran right, the square left the screen at ~370 (nothing follows it yet), logged `x`: kept going and stopped at **1570** (1600 − 30 at the time). The physics lived in the bigger world before I could see it.
The tiny dip right before 1570 in the log was the tail of a wall-bounce chain. There are more bounces than in 06 now, because `restThresholdX` dropped to ~14.7 px/s when MAX_DT went to 1/30 in 09: 150 → 90 → 54 → 32 → 19 → ~12 < 14.7 → rest. Derived constants still following their inputs.

**2. A longer level = more data.**
The 08 payoff: the room is a list, so a bigger level is just more entries in `obstacleList`. No logic changes. Positions are world coordinates (x up to the world width); where they show up on screen isn't my problem anymore.
Built 5 zones (later stretched the world to 2000):

1. the original test room
2. a staircase to a high ledge
3. a split route: high road vs. a low tunnel
4. a stepping-stone climb
5. a tight squeeze and a summit to the goal

Ran the reach math (100 px rise, ~0.8 s airtime, up to 150 px/s) on every jump. Most check out. Rough spots I'm leaving for later (the dare is about the camera, not level design):

- **Tunnel entrance:** standing on Mid Block, the square overlaps the Tunnel Ceiling's height, so you can't walk in. You have to drop down a 30 px slot (exact fit, like the 08 corridor) while holding Right.
- **Low world ceiling:** the world is only 300 px tall, so jumps from high platforms bonk the top wall.
- **Catwalk → Stone 2:** a 170 px gap, ~15 px more than a full jump covers, even with coyote time.
- **Squeeze bypass:** you can hop onto Squeeze Top from Midway Rest (+14 px) and skip it.
- **Squeeze entrance:** a 4 px tall window. Sliding down the face gets in at 240 Hz (~1.4 px per frame) but can skip the window at 60 Hz (~5.7 px per frame). **The same level can be passable on my screen and not on a laptop.** That's the fixed-timestep problem showing up in level design.
- **Squeeze exit needs coyote time:** only 4 px of headroom inside, so the only way up is walking off the end and jumping within 0.1 s.
- **Summit Step 2** overhangs the Goal by 10 px with 10 px of space under it.

**3. Something to see the camera move against.**
With a plain background and the square centered, a moving camera looks exactly like a frozen one. Added a **world ruler**: a line every 100 px with its world x as a label. Doubles as a debugging ruler.

- Not in `obstacleList`: the square doesn't collide with it. It gets its own draw function, called first.
- Bump: `for (let i = 0; i <= worldWidth; x += 100)`. The condition checked `i`, but the update changed `x`, the **square's** x. `i` never changed → infinite loop → frozen page. And it would've thrown the square across the world. Fix: ONE variable for declare/check/update, named so it can't be confused (`lineX`).
- 1 px lines at integer x sit _between_ two pixel columns and blur. Drawing at `lineX + 0.5` puts them on a pixel's center.
- Wanted **parallax** (layers moving slower for depth: `screenX = worldX − cameraX × factor`). It needs the camera first, so it's saved for later.

**4. Draw through the camera with `translate`.**
Instead of subtracting `cameraX` in every draw call, shift the whole coordinate system: `ctx.translate(-cameraX, 0)`, then draw everything in plain world coordinates.

- **`clearRect` goes BEFORE the translate.** After it, `(0, 0, 400, 300)` means world 0–400, which is off screen once the camera moves, so the visible part would never be cleared → smears.
- **`save()` / `restore()` around it.** `translate` _adds_ to the current transform, so without restoring, the shift would pile up every frame.

Tested with a hand-set camera before making it follow: `cameraX = 0`, `400`, `1200`. The screenshots matched the data exactly (Step 1 half-visible at the left at 400, the Goal reaching the right edge at 1200).
Side note: ruler labels get covered by boxes (700 by Floor Block, 1500 by the Goal). That's draw order doing its job; labels could get their own pass on top later.

**5. Make it follow.**
First formula: `cameraX = x - (canvasWidth * 0.5 - squareSide)`. Checked with x = 785 → camera 615 → square's center on screen at **185**, not 200. Off by half a square.
Worked it out in two steps instead:

- square's center in the world: `x + squareSide / 2`
- want it at screen `canvasWidth / 2`, and screen = world − cameraX → **`cameraX = center − canvasWidth / 2`**
- check: 785 → center 800 → camera 600 → center on screen at 200 ✅

Named it `targetCameraX`: where the camera _wants_ to be. Matters later if smoothing gets added.

- **Edges:** at x = 0 the target goes negative → the screen would show the void left of the world. Clamp to **`[0, worldWidth − canvasWidth]`**, written as a formula so it follows the sizes (it became 1600 automatically when I made the world 2000).
- **Where in the loop:** after `moveAndCollide`, before `drawScene`. Before the move, the camera would frame where the square _was_: one frame's movement off center (0.6 px at 240 Hz, 2.5 px at 60 Hz), changing with speed → the square would twitch against the center.

Tests: stays centered ✅, stops at both world ends while the square keeps running to the wall ✅, stays level during jumps (x only) ✅, `cameraX` appears only in `updateCamera` and `drawScene`, never in physics ✅.

**6. Bump: shimmer.**
Running slowly, the ruler lines flickered between crisp and blurry.
Cause: `cameraX` is fractional (412.37...), so `translate(-412.37)` shifts the world by a fraction of a pixel. The `+0.5` trick only works if the shift underneath is whole. As the fraction changes, lines alternate between landing on pixels and between them.
Fix: **round, but only for display.**

- Not the stored `cameraX`: with smoothing later, rounding stored state would eat the small catch-up steps (same reason I never round `x`: moving 0.6 px per frame, rounded every frame, goes nowhere).
- At the draw: `ctx.translate(-Math.round(cameraX), 0)`.
- The square too: `Math.round(x)` in `drawShape` (it covers any future moving thing; obstacles are already whole numbers).

You might expect the two separate roundings to make the square wobble ±1 px against the center. They don't: while following, `x − cameraX` is always exactly **185**, a whole number, and shifting by a whole number never changes how something rounds.
One more catch: `Math.round` rounds .5 **up**, so `Math.round(-412.5)` = −412 but `-Math.round(412.5)` = −413. Using `Math.round(-cameraX)` would round the camera _opposite_ to `Math.round(x)` at exact .5 fractions → 1 px nudge. Use `-Math.round(cameraX)`.
→ _State stays exact; rounding is a display decision._

**7. Tab switch.**
No jump, flicker, or lag. Makes sense: the camera has no memory yet. It's recomputed from the square's position every frame, and the square can't teleport (MAX_DT cap). Worth re-testing if smoothing gives the camera memory.

**8. Cleanup.**

- Split "World geometry" into **Screen** (canvas: clearing, camera math) and **World** (level: walls, obstacles).
- Wall comment: the square stays inside the _world_, not "visible."
- `cameraX` moved out of "remembered" with a comment: it's recomputed every frame for now.
- New **Camera** section between movement and drawing, matching the loop order (input → velocity → move & collide → **camera** → draw).
- Comments on `drawShape` (display-only rounding), the ruler, and each step of `drawScene`.
- Level rough spots marked with `NOTE` comments in the data.

✅ 2000 px world, ruler, translate-based camera that follows and clamps, crisp drawing, physics untouched.

### Big takeaways

- **World vs. screen:** where something IS vs. where it's DRAWN. Physics only knows the first.
- A camera is just a number: `screen = world − camera`.
- `translate` moves the coordinate system so draw calls don't change. `save`/`restore` keeps it from stacking; clear _before_ translating.
- Derive camera limits from sizes, same as walls.
- Order: the camera frames _this_ frame's final position.
- Round for display, never the stored state. And `-Math.round(a)` ≠ `Math.round(-a)` at .5.
- Test a new system with fixed inputs first (hand-set `cameraX`), then hook it up.

### Still bugging me

- **Camera feel:** smoothing (careful: "10% per frame" = the 05 friction trap), dead zone, **parallax** background.
- **Level design pass:** tunnel entrance, low world ceiling, Catwalk → Stone 2 gap, squeeze bypass / frame-rate-dependent entrance / coyote-only exit, Summit Step 2 overhang.
- **Culling:** every frame draws all obstacles and ruler lines, even off screen. Fine now, wasteful for big levels.
- Ruler labels hidden under boxes (draw labels in a pass on top?).
- Vertical camera once the world gets taller than the screen.
- Carried: sub-steps, fixed timestep, input intents, first-come hit report, corner correction, hit vs. rest, braking on turnaround.
