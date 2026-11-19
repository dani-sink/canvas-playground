## 07 – block
A solid obstacle in the middle of the room. The square bounces off all four sides, rests against it, and slides along it smoothly.

### The problem
Walls were easy for a sneaky reason: each wall is **one line on one axis**. "Did I hit the right wall?" = `x > rightLimit`. Y doesn't matter, because the wall runs the whole height.

A box in the middle breaks that. Block spans x 150 to 250. The square can have `x = 200` ("past" the left edge) and not be touching it at all, because it's floating above it. **Being past a line ≠ hitting a box.**

Two new problems:
1. **Detection:** are two rectangles overlapping right now? Depends on both axes at once.
2. **Response:** if they are, which way do I push it out? A box has four sides. Which one did it come through?

### How it went

**1. Brainstormed the rules before coding.**
- Two rectangles collide only if they overlap on X **and** Y at the same time. A gap on either axis = not touching.
- **Does touching count?** If edges are exactly equal (both at 150), are they colliding? Matters a lot: after a push-out, the square sits *exactly* against the edge. If touching = colliding, resting on top would register a hit every frame (the 240-bounces-a-second problem from 06).
- The overlap test is a **snapshot**: it says *whether*, not *how it got there*. Detection and "which side" are separate problems.

**2. The 1D version first.**
Two segments `[a1, a2]` and `[b1, b2]` DON'T overlap when one finishes before the other starts:
`(a2 < b1) || (b2 < a1)`
But with `<`, edges exactly meeting (`a2 === b1`) → both false → "not separated" → touching **counts**. That's **closed intervals**.

**3. Open vs closed intervals.**
- Closed `[a1, a2]`: endpoints included → shared edge = overlap.
- **Half-open `[x, x + width)`**: the end isn't included → shared edge = no overlap.

Games use half-open because it matches pixels: a 30px square at x = 0 covers pixels 0–29, and pixel 30 is the first one that's NOT it. So a block starting at 30 sits right next to it.

**4. De Morgan, twice.**
First try, from the closed version:
`!((a2 < b1) || (b2 < a1))` → `(a2 >= b1) && (b2 >= a1)`
Plug in 150 vs 150: `150 >= 150` → true. Touching counts. ❌ Not what I want.

Redo from the half-open separation, where touching already = separated:
`(a2 <= b1) || (b2 <= a1)` → De Morgan → `(a2 > b1) && (b2 > a1)`
Plug in 150 vs 150: `150 > 150` → false. Touching = no collision. ✅

Reordered so I can read it: `(b1 < a2) && (a1 < b2)` → **"each one starts before the other one ends."**
→ *`<` vs `<=` is a real decision (closed vs half-open). Pick on purpose, then plug in the edge case to prove it.*
→ *Negating an `||` gives an `&&`, and each comparison flips.*

**5. Naming the segments (and two mistakes).**
Square: `[x, x + squareSide)` on X, `[y, y + squareSide)` on Y. ✅
Obstacle, first try: `canvasWidth / 2 - squareSide` with width `squareSide`. Two problems:
- **Borrowed the square's size.** Bigger square = bigger block. Different objects shouldn't share a number by accident. Gave it its own `obstacleWidth` / `obstacleHeight`.
- **Not centered.** Plugged in: 400/2 − 30 = 170 to 200. Middle = 185, not 200. To center width `w`: `(canvasWidth - w) / 2` → 150 to 250, middle 200. ✅
→ *Plug numbers into positions too, not just formulas.*

**6. Detection first, no response.**
Turned the obstacle blue while overlapping and let the square pass right through. Seeing detection work alone before adding push-out = way less confusion.
Stuff I fixed along the way:
- `clearRect` moved into the game loop. With two shapes, clearing inside the draw function would wipe the first one.
- **Draw order = layering.** I drew the square first, so it disappeared *under* the obstacle. Now square is drawn last (on top).
- **Physics was picking colors.** `moveAndCollide` set `blockColor`. Now physics just *reports a fact* (`hitObstacle`) and drawing decides what it looks like.
- Names: `segmentsOverlap` (1D) + `rectsOverlap` (2D). Obstacle object built once at the top, not every frame.
- Testing a pure function directly in the console beats trying to steer the square into a pixel-perfect spot.

**7. Which side did it come through?**
Structure: move X → overlap? → fix X → move Y → overlap? → fix Y.
- **Why it works:** last frame, no overlap. Then *only `x`* changed (y hasn't moved yet). If it overlaps now, the X move is the only possible cause.
- **Which side:** sign of `velocityX`. `+` = moving right = came in from the left. For Y, down is `+` (y grows downward), so `+` = came from above.
- Pitfall: the velocity I read must be the one that *moved* it this frame. If a wall bounce flipped it first, the sign would lie. Safe here: obstacle and walls are 120 px apart, the biggest step is 15 px.

**8. Where does it go? (wrong edge, again)**
From the left, I wanted the square's RIGHT edge on the obstacle's left edge (150), so I wrote `x = obstacleX`... but `x` is the LEFT edge. Plugged in: left at 150, right at 180, which is *inside* the obstacle.
Fix: `x = obstacleX - squareSide` → right edge at 150, touching. ✅
From the right: `x = obstacleX + obstacleWidth` (left edge on the obstacle's right edge). ✅
Same mistake as `rightLimit` in 06. **`x` is always the left edge.**
Thanks to half-open, placing it exactly touching is safe: no hit registered next frame.

**9. Reuse the wall response.**
Pulled rest-or-bounce into `restOrBounce(pos, vel, min, max)`, used by walls AND the obstacle. For the obstacle, the edge acts like a **temporary wall**: same function, shifted clamp range. One place for the hit rule = walls and obstacle can't drift apart.

**10. Bump: the square would vanish at walls.**
`restOrBounce` returned `{ newPos, newVel }`, but the caller read `nextX.pos` → `undefined` → `x = undefined` → math on it = NaN → square gone forever (the 03 NaN lesson, from a new direction).
Root cause: **two different return shapes** depending on the branch.
Fix: every collision function returns the same `{ pos, vel }`.
→ *A function should return the same shape from every branch.*

**11. Bump: blue was lying, then would've meant nothing.**
`hitObstacle` was computed from a `square` built *before* the Y fix → stale data → Y hits flashed blue, X hits didn't.
Bigger realization: rebuild it fresh and check again → after push-out the square is always exactly touching → never overlapping → **never blue**. "Are they overlapping?" stopped being a useful question once I started fixing overlaps.
Fix: set `hitObstacle = true` *at the moment of resolution*, the one place I already know a hit happened.
→ *Record events where they happen, not by re-checking afterwards.*

**12. Tests.**
- **Lean into any side:** 3 quick blue flashes (the 06 bounce chain: 150 → 90 → 54 → 32.4), then solid blue. Resting = pushing in every frame = a "hit" every frame.
- **Slide along the top** holding Down + Right: blue the whole time (pushing down into it), and perfectly smooth. Half-open payoff: resting flush on top, the Y segments only *touch*, so the X step never sees an overlap.
- **Top/bottom hits pop back up/down** (velocityY flips), side hits flip velocityX. ✅
- **Exact corner:** traced it with numbers. Square at (118, 88), obstacle corner at (150, 120), moving +5 on both:
  - After X move: x overlaps, but y is still outside → no overlap → X check sees nothing.
  - After Y move: both overlap → **Y check catches it** → pushed out through the top.
  - So exact corners **always resolve on Y**, because Y moves *second*. Swap the order and the sides would win. Feels natural (like catching a ledge), and most axis-by-axis games have this exact bias.

**13. Cleanup.**
- `getSquareRect()` helper (was building the square's rectangle twice).
- Sections: world geometry → timing → movement tuning → collision tuning → colors → state → input → velocity → collision helpers → movement + collision → drawing → loop.
- `drawScene(hitObstacle)` keeps all drawing in one place. Colors are named constants.

✅ Solid on all four sides, rest-or-bounce shared with walls, smooth sliding, explainable corners.

### Big takeaways
- Rectangles collide = overlap on X **and** Y.
- Half-open intervals: touching isn't overlapping. That's what makes resting and sliding work.
- Derive conditions (De Morgan), then plug in the edge case to prove them.
- Move one axis at a time → the axis that caused the overlap tells you the side.
- `x` is the LEFT edge. Every "right side" formula needs `- size`.
- Same return shape from every branch.
- Physics reports facts, drawing decides looks.
- Record events where they happen.
- Order creates bias (Y wins corners). Know which way it leans.

### Still bugging me
- "Hit" includes resting. Fine for a color, wrong for a bounce sound. `restOrBounce` knows which one happened. Expose it?
- Thin obstacles: biggest step = `topSpeed × MAX_DT` = 15 px. A 5 px obstacle could be skipped right over in one step (tunneling).
- More than one obstacle → an array of them?
- Carried: reflect overshoot instead of clamping, clamp helper, braking on turnaround, curved diagonal slide stops, Option A friction, fixed timestep, gamepad half-tilt.
