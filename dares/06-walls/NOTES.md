## 06 – walls
The edges are solid now. The square bounces off them, loses energy, and comes to rest.

### The problem
In 05 the edges weren't edges, they were **portals**: go off the right, come back on the left. Great for practicing movement, but my world had no boundaries and **nothing the square could actually hit**. If I asked "is the square touching a wall?", my code couldn't even answer, because walls didn't exist.

Almost every game needs solid stuff: floors, walls, arena edges. So: turn all four edges into walls the square can never pass, and make it bounce.

### What a wall hit actually means
Every hit asks TWO separate questions:
1. **Where is it?** It has to end up inside the canvas.
2. **How is it moving?** Even if I fix the position, the velocity still points into the wall, so next frame it tries to go through again.

Fixing only one of them = bugs.

### How it went

**1. New limits.**
Wrapping let the square be *partly* off screen (`-squareSide` to `canvasWidth`). Walls need it *fully* visible. `x` is the square's LEFT edge, so its right side touches the wall at `canvasWidth - squareSide`, not `canvasWidth`.
Limits: `0` to `canvasWidth - squareSide` (same for height).

**2. First try: flip the velocity.**
Past a limit → `velocityX = -velocityX`. Looked like a bounce!
But I only answered question 2. Plugging in numbers: at x = 369, moving right at 150 px/s → after the move it's *past* the wall, I flip the velocity... and nothing puts it back inside. It spends at least a frame sitting in the wall. At full speed the next frame drags it back out, so it looks fine. But creeping in slowly, or with friction getting a turn after the flip, it can get stuck in the wall.
→ *A collision has two parts: where it is AND how it's moving. Answer both.*

**3. Stop first.**
On a hit: velocity → 0, and clamp the position back inside:
`x = Math.max(leftLimit, Math.min(rightLimit, x))`
That's **clamping**, forcing a value into a range. Leaning on the wall = perfectly still: the push nudges it a hair past, the clamp puts it back, velocity resets. Nothing builds up.
Also noticed I've been doing clamp-like stuff a lot (MAX_DT cap, friction not crossing 0, this). If it shows up a third time in this exact form, it earns a `clamp()` helper.

**4. Bounce, with bounciness.**
Instead of 0: `velocityX = -velocityX * bounciness` (0.6). Bounciness has no unit, it's a fraction of speed that survives.
- 0 = dead stop
- 1 = perfect bounce
- 0.6 = comes back at 60%

**5. Bump: leaning on the wall = 240 invisible bounces per second.**
Held Right against the wall and logged `x, velocityX`:
`370 -0.69`, `370 -0.56`, `370 -0.66`...
Every frame: leftover -0.6 + push (+1.6) = +1.0 → moves 0.004 px into the wall → bounce → -0.6 → repeat.
Too tiny to see, but the game thinks it's *bouncing*, not *resting*. The moment I add a bounce sound, a particle puff, or a "landed, can jump now" check, it'd fire 240 times a second.
And `x` always read 370 because I logged *after* the clamp. The 05 "log after the fix" trap again. It was really hitting 370.004 every frame.
→ *Invisible on screen doesn't mean correct. Ask what the game THINKS is happening.*

**6. Bump: a rest threshold of 1.0 wasn't enough.**
Idea: below some speed, a hit isn't a bounce, it's resting → velocity 0.
First try: `if (Math.abs(velocityX) < 1.0)`. But leaning hits at about 1.0, right on the line → bounce, rest, bounce, rest, every other frame.
Worse: that +1.6 is `acceleration × dt`. On other screens:
- 240Hz: 400 × 0.004 = 1.6 px/s
- 60Hz: 400 × 0.0167 = 6.67 px/s
- MAX_DT: 400 × 0.1 = **40 px/s** ← worst case

So the threshold has to beat the most speed ONE frame of pushing can ever add.
→ *A threshold compared against something that scales with dt has to be frame-rate safe too.*

**7. Derived constant.**
`const restThreshold = acceleration * MAX_DT * 1.1;`
- Still a `const`: computed only from constants, so it never changes. I'm not hard-coding 40, I'm hard-coding *why* it's 40. Change acceleration → threshold follows.
- `× 1.1` margin: at exactly MAX_DT the push is exactly 40, and `40 < 40` is false → it'd bounce. Floats near a boundary can land on either side, so give it room.
- Put the margin IN the definition, not at the check. One place to change it.
- Rest *or* bounce → `if/else` (or a ternary), not "set 0 then flip it anyway."

**8. Predicted the bounces, then checked.**
Leaning on the wall at top speed (holding the key, no friction while pushing):

| Hit | Speed in | Result |
|---|---|---|
| 1 | 150 | bounce → 90 |
| 2 | 90 | bounce → 54 |
| 3 | 54 | bounce → 32.4 |
| 4 | 32.4 | < 44 → rest |

**3 bounces, then rest.** Ran it in game: 3 bounces. ✅
Let go right at impact instead: one bounce at 90, then friction takes over. Stopping distance = v² ÷ (2 × friction) = 8100 ÷ 600 ≈ 13.5 px. The room's 370 px wide, so it never reaches the other wall. **One bounce, slides to a stop.**
→ *With friction, bounces barely show. For a bouncier feel, the knob is friction (or room size), not bounciness.*
→ *Do the math first, then confirm in game. If they match, I actually understand it.*

**9. Tests.**
- All four walls: 3 bounces each when leaning ✅ (mirrored code, tested both sides)
- Corners: each axis settles on its own, one first, then the other ✅. Axes are independent, and a diagonal push is only 400 ÷ √2 ≈ 283 per axis, so one usually hits first or slower.

**10. Refactor: one function, two return values.**
- `updatePosition` was now changing *velocity* too (a bounce is a velocity change) → renamed `moveAndCollide`. Collision belongs right after moving, since you can only detect a hit after you've moved.
- X and Y blocks were identical again. Extracting it was harder than 05: a bounce changes TWO values (position + velocity), and a JS function only returns one thing.
- Solved it: return an object `{ pos, vel }`, unpack on the other side.
- Trick I learned: `({ pos: x, vel: velocityX } = moveAndCollideAxis(...))` unpacks straight into existing vars. The outer parentheses are REQUIRED, or JS reads `{` as a code block. Kept the clearer `nextX` version though.

**11. Cleanup.**
- Wall limits moved to the top as constants (they only depend on constants, same reasoning as `speed` in 04).
- Deleted an unused `rightSideLimit`.
- Renamed pairs to match: `updateVelocity` → `updateAxisVelocity`, `moveAndCollide` → `moveAndCollideAxis`.

✅ Solid walls, energy-losing bounces, real resting, all four sides + corners.

### Big takeaways
- Collisions = fix position AND velocity.
- Clamp = `Math.max(low, Math.min(high, value))`.
- Tiny, invisible behavior still matters: the game's *idea* of what's happening drives sounds, effects, and logic later.
- Thresholds need worst-case thinking, and worst case usually = MAX_DT.
- Derive constants from other constants so they stay correct when things change.
- Predict with math, then confirm in game.
- Need to return two things? Return an object.

### Still bugging me
- Overshoot: clamping throws it away. Fine at these speeds (fraction of a pixel), but could I *reflect* it back out, the way the wrap carried it forward?
- Clamp shows up in a bunch of places. Helper soon?
- Carried from 05: slow turnaround (braking?), curved diagonal slide stops, try Option A friction.
- Carried from 04/03: fixed timestep, half-tilted gamepad stick.
