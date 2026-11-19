## 08 – room
Seven obstacles, one loop. The room is a list of data; collision and drawing don't care how many boxes there are.

### The problem
In 07 my obstacle wasn't *an* obstacle, it was **THE** obstacle, wired in by name:
- four constants (`obstacleX`, `obstacleY`, `obstacleWidth`, `obstacleHeight`) + an `obstacle` object
- `moveAndCollide` named it twice (once per axis)
- `drawScene` drew exactly one

A second box = copy all of that (`obstacle2X`...). Mirrored copies, the #1 bug source in this whole playground. And 200 boxes? Impossible.

Root cause: **the level was written INTO the code.** Changing the room meant editing logic.

### What changed
Split **data** (what's in the room) from **code** (how things collide and get drawn):
- The room = an array of obstacle objects.
- Collision and drawing loop over it.
- Adding a box = adding one line. Zero logic changes.

### How it went

**1. One stored form, the other derived.**
Each box used to exist in two forms: `x/y/width/height` and `xStart/xEnd/yStart/yEnd`. Storing both for every box = they can disagree.
Store `{ x, y, width, height }` only, derive the bounds when needed. Same single-source-of-truth idea from 02, but for data.

**2. One `getBounds`, not two.**
I was about to write `getObstacleRect(box)` next to `getSquareRect()`. Same job, different name = a mirrored copy at the *function* level. The square is a rectangle too.
→ `getBounds({ x, y, width, height })`. Destructuring in the params ignores extra fields like `name`.
Tried `height = width` as a default (handy for the square). Trade-off: forget `height` on a box and it silently becomes a square, no error. Dropped the default and pass `height` explicitly.
→ *Convenience defaults can hide mistakes.*

**3. Order: data → drawing → collision.**
Build the list first, loop the drawing (visual proof the data is right before any physics), then loop collision. Then delete the old `obstacleX/obstacle` constants entirely, otherwise some code keeps quietly using them = two sources of truth.

**4. A room with test cases built in.**
Platform (wide/flat), Pillar (tall), two corridor boxes with a gap, two tiles touching at x = 290 (a seam), later a box 10 px from the left wall.
Prediction for a 30 px corridor: should fit, because touching isn't overlapping.

**5. First working version: right, but messy.**
Two `forEach` loops (X and Y). Accidentally got the key question right: the square's bounds are rebuilt **inside** the loop, so after being pushed out of box A, box B is checked against the *corrected* position. (Building them once before the loop would check B against a position that no longer exists.)
But:
- **Drawing was writing game state.** `drawScene` rebuilt `obstacleList` every frame with a `hasCollided` flag. Breaks "drawing has no logic," mixes **level data** with **per-frame state**, and the hand-copied `map` would silently drop any field I add later. 240 times a second.
- **Identified boxes by `name`.** Two boxes named "Tile" → hit one, both turn blue. The object already IS its own identity.
- `findIndex(...) === -1` = a long way to write `!includes(...)`.
- An `obs` copy object for no reason (`getBounds` already ignores extra fields).
- X and Y loops = ~30 lines each, mirror copies.

**6. Bump: refactored into one function, broke it twice.**
`processAxis` with a `Set` of obstacle objects + a tiny `getObstacleSpan` accessor (the only thing that differed between axes was *which fields to read*). Nice design... but:
- **Stale globals.** Inside the function, the moved position lived in the local `pos`, but bounds were built from the global `x`/`y`, which weren't assigned until AFTER the function returned. So checks used the position *before* the move, and box B never saw box A's push-out. Moving code into a function changed **which variables it could see**.
- **Missing height.** `getBounds({ x, y, width: squareSide })` with no default anymore → `y + undefined` = NaN → every comparison false → nothing would ever collide.

**7. Three working designs, compared.**
1. **Two loops:** correct (reads globals directly), but ~60 lines; the X/Y differences are a few words buried in identical code.
2. **String keys** (`"x"`, `"width"`): one loop, but `axis === "x" ? pos : x` ternaries inside, and typos fail silently.
3. **Named params + `makeSquare`:** one loop; the call sites show *exactly* how X and Y differ. ← kept this one.

How `makeSquare` works: `(pos) => ({ x: pos, y, ... })` reads the global `y` **when it's called**, not when the arrow function is created. A closure captures the *variable*, not a snapshot. So in the Y pass, it sees the x that the X pass just updated.
→ *Readable = I can see what MATTERS fast. For two axes sharing one algorithm, what matters is how they differ.*

**8. Drawing only reads.**
`drawScene` just asks `hitObstacles.has(obstacle)` while drawing. No `map`, no `hasCollided`, `obstacleList` became `const`. Physics returns the `Set` directly (no `[...set]` conversion).

**9. Tests (and two of my predictions were wrong).**
- **Seam:** glides across. ✅ Half-open payoff again. But only Tile A turned blue while crossing. **First come, first served:** A pushes the square out, then B is checked with fresh bounds, only touches, and isn't recorded. Physics correct, hit *report* incomplete.
- **30 px corridor:** doesn't fit! Mathematically it does (`[260, 290)` only touches both walls), but `x` would have to be **exactly 260.000**. At 259.99 it clips the left box's corner → Y check catches it (Y wins corners) → lands on top. And the "lean on a wall and slide in" idea doesn't work: that wall's face is *inside* the gap.
  → *A gap exactly the player's size fits on paper but not in practice.* Real games either make gaps bigger, or use **corner correction** (nudge the player sideways when the overlap is tiny).
- **29 px corridor:** doesn't fit, stops cleanly, no jitter. ✅
- **Box 10 px from a wall:** nothing weird. The worry was "a wall bounce flips the velocity right before an obstacle check reads it." That needs a wall hit AND a box overlap in the same step, meaning the square is touching both, meaning a gap smaller than itself, which it can't be in. **So walls-then-obstacles is safe, just not for the reason the 07 comment gave.**
  → *Tests decide, not predictions.*

**10. What `wallMin` / `wallMax` actually meant.**
A clamp needs two ends, but an obstacle push-out only cares about one (the face it came through). The other end was filled with the wall limit, a value that never triggers since walls were checked first. So really it means **"no limit on this side."** Renamed to `outerMin` / `outerMax`. `-Infinity` / `Infinity` would work the same.

**11. Cleanup.**
Level moved to a plain `const obstacleList = [...]` near the top, one box per line, with the test notes next to them. Comments updated (no more "the obstacle", corrected wall-safety reasoning).

✅ Room as data, one collision loop for any number of boxes, per-box hit report, all edge cases tested.

### Big takeaways
- Separate data from logic: the level should be editable without touching code.
- Store one form, derive the rest.
- One function per *job*, not per *thing* (square and boxes are all rectangles).
- Moving code into a function can change which variables it sees. Watch locals vs globals.
- Closures read the variable when called, not when created.
- Identify things by the object itself, not a name.
- Drawing only reads.
- Exact fits don't happen with continuous movement.
- Test your assumptions. One of mine turned out right for a different reason.

### Still bugging me
- Hit report is first come, first served. Should "touching B after A pushed me out" count?
- Corner correction so near-exact gaps are enterable.
- Carried: hit vs rest (bounce sound shouldn't fire every frame), thin obstacles / tunneling (15 px max step), overshoot reflection, clamp helper, braking on turnaround, curved diagonal slide stops, Option A friction, fixed timestep, gamepad half-tilt.
