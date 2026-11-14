## 05 – weight

The square has inertia now. It speeds up when I press, slides to a stop when I let go.

### The problem

In 04, every frame did `direction × speed × dt`. Speed was either 0 or 100, nothing in between.

- Press a key → full speed on the very first frame (0 → 100 in 0.004 s).
- Let go → 0 on the very next frame. Dead stop.

The game remembered _where_ the square was, but not _how fast it was going_. Every frame it decided the speed from scratch. That's why it moved like a mouse cursor, not like an object.

Real things have inertia: a car builds speed when you press the gas and coasts when you let go. That "takes time to speed up and slow down" is what feels like weight.

### What was missing

A second thing to remember: **velocity**.

- Before: `keys → position`
- Now: `keys → velocity → position`

Input doesn't _set_ movement anymore, it _pushes on_ the velocity. Let go and the velocity is still there, so the square keeps sliding until friction eats it.

**Wait, doesn't remembering break my rule from 02?** No:

- **Input state** (which keys are down): the real truth is the keyboard. Copying it = drift. Read fresh every frame.
- **Physical state** (position, velocity): nothing outside my game knows these. My variables ARE the truth. Remember them.

### How it went

**1. Getting the concepts straight.**

- Velocity = direction + magnitude (speed). "150 px/s" is a speed, "150 px/s toward the upper right" is a velocity. Stored as `velocityX`, `velocityY`.
- Velocity ≠ delta. Delta = px to move _this frame_ (recomputed). Velocity = px/s (carries over).
- Renamed my old `vx`/`vy` (input direction) so they don't look like velocity.

**2. Units first.**
| thing | unit |
|---|---|
| position | px |
| velocity, top speed | px/s |
| acceleration | px/s² (px/s gained _per second_) |
| dt | s |

Same trick as 04, one level up:

- 04: speed (px/s) × dt → px this frame → changes position
- 05: acceleration (px/s²) × dt → px/s this frame → changes velocity

At 400 px/s² and dt = 0.004 s, the velocity gains 1.6 px/s per frame. Climbs to 100 in a quarter second instead of jumping there.
→ _Only add things with matching units. px/s² + px/s means I forgot a `dt`._

**3. Design choices.**

- _Does friction apply while pressing?_ Option A: always (realistic, and a top speed appears naturally where push = friction). Option B: only when not pushing (arcade, three separate knobs). **Went with B.**
- _Friction as a coefficient or constant?_ Coefficient = lose a fraction of speed (smooth ease-out, but "×0.9 per frame" is frame-rate dependent, and it never truly hits 0). Constant = lose a fixed px/s every second (crisp, fewer traps). **Went with constant, 300 px/s².**
- "Not pushing" has to be decided **per axis**. Otherwise: slide up-right, release Up, keep Right → the upward slide never stops.

**4. First version.**
Acceleration builds velocity, friction slows it, clamps stop friction from overshooting past 0 (no jitter), each axis capped at `topSpeed`. Felt good!

**5. Bump: diagonals were fast again.**
My own comment said _"in any direction (diagonals included)"_... and it was lying. Each axis capped at 150 separately → both at 150 → arrow length 150 × √2 ≈ **212 px/s**. The 03 bug came back through a side door: normalizing the _push_ isn't enough once velocity builds up over time.
Fix: cap the **whole arrow**. Measure its length; if it's over `topSpeed`, shrink it back while keeping the direction (same normalize trick as 03).
Also: I'd been reusing `deltaX` to hold acceleration. Wrong name = wrong unit in my head. Renamed to `accelX`.

**6. Bump: capped it, but too late.**
My cap ran _after_ `updateXPosition`/`updateYPosition`, which had already moved the square using the uncapped speed. And my log printed the speed _after_ the cap, so it always showed a perfect 150. The log was measuring my fix, not the actual movement.
The overshoot was tiny at 240Hz (1-2 px/s), but it grows with dt, so bigger on 60Hz and worst at MAX_DT. Frame-rate dependent again.
Fix: split into two steps. `updateVelocity` does EVERYTHING to velocity (push, friction, cap). _Then_ `updatePosition` uses it.
→ _Finish computing a value before anything uses it._
→ _Log the thing I actually care about, at the moment it's used. Not after the fix._

**7. Cleanup: per-axis caps were redundant.**
If the whole arrow is ≤ 150, neither part can be > 150. Deleted 4 lines, same behavior. Fewer places for bugs to hide.

**8. Bump: extracted a helper, broke two directions.**
X and Y were now identical logic with different letters, so I pulled them into `applyAxisPhysics(velocity, accel, dt)`, which takes values in and returns the new velocity without touching globals.
But sliding left or up then releasing → instant stop. Plugging in -150: friction gives -148.8, and I'd typed `Math.max(0, …)` instead of `Math.min` → 0. Copied one mirrored branch slightly wrong.
→ _Mirrored code (left/right, +/-): test BOTH directions, every time. One working side proves nothing about the other. (Same lesson as the 02 wraps.)_

**9. One branch instead of two.**
Friction always pushes _against_ the motion, so:

- `motionDir` = +1 or -1 (which way it's moving)
- friction = `-motionDir × friction`
- After applying it, if `Math.sign(velocity) !== motionDir`, it flipped or hit 0 → clamp to 0.

One code path for both directions, so the copy bug from step 8 literally can't happen anymore. At rest (0) it picks +1, friction pushes to -1.2, sign changed → back to 0. Stays still.

**10. Renames.**
`moveInDirection` → `updateAcceleration` (it doesn't move anything now). `draw` → `gameLoop` (it does way more than draw). Raw keys = `inputX/Y`, normalized = `dirX/Y`, motion direction = `motionDir`. Grouped the file into "remembered" vs "recomputed" sections, because that split is basically the whole lesson.

✅ Speeds up, true top speed in all 8 directions, slides to a stop in all 4, same on any screen.

### Big takeaways

- Stack the pattern: acceleration → velocity → position. Each step is "per second × dt."
- Remember physical state, recompute input state.
- Cap vectors as a whole, not piece by piece.
- Order matters: finish a value before anyone reads it.
- Logs can lie if I put them in the wrong spot.
- Mirrored code breaks on one side. Test both, or write it as one path.

### Still bugging me

- Turnaround is slow: sliding right and pressing Left only pushes, there's no friction helping. Add "braking" when pushing against motion?
- Diagonal slides curve at the end: per-axis friction stops the smaller axis first. Apply friction to the whole arrow instead?
- Try Option A (coefficient friction, always on) and see if a top speed appears without the cap. Need to make the "fraction per second" frame-rate fair.
- Fixed timestep (carried from 04). Half-tilted gamepad stick (carried from 03).
