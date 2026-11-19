## 09 – gravity

Side view now. Gravity pulls the square down, box tops are floors, Up is a jump.

### The problem

Everything up to 08 was **top-down**: looking down at the floor from above. Up and Down were normal directions like Left and Right. Nothing ever fell. "Platform" and "Tiles" were platforms in name only; to the square they were just boxes to bump from any side.

Turn the camera sideways and **down becomes special**:

- Things fall. A constant pull, every frame, keys or not.
- Floors hold you up. Box tops become places to _stand_.
- Up isn't a direction you hold. It's a **jump**: one push up, gravity does the rest.

And a jump needs something my code couldn't answer: **is the square standing on something right now?** No jumping in midair.

### How it went

**1. What is gravity, in my world?**
It's an acceleration, so **px/s²**, same unit as `acceleration` and `friction`. Same pattern: `velocity += gravity × dt`.
Real gravity is 9.8 **m**/s², but my world is in pixels. If the 30 px square were a 1 m crate: 9.8 × 30 ≈ 294 px/s². Games usually go 3–4× stronger, because realistic falls look floaty on screen.

**2. Don't guess it, derive it.**
Instead of picking `g`, pick two things I can _feel_: **jump height** (100 px) and **time to the top** (0.4 s).

- Rising to the peak is the mirror of falling from it (from rest), so: h = ½·g·t² → **g = 2h / t² = 2·100 / 0.4² = 1250 px/s²**
- Launch speed: **v = g·t = 1250 × 0.4 = 500 px/s** (upward = negative, since y grows down)
- Cross-check with the stopping-distance formula from 06: v² / 2g = 250000 / 2500 = **100 px** ✓

`jumpHeight` and `timeToApex` are the knobs; `gravity` and `jumpSpeed` are derived. Change a feel value, everything stays consistent.

**3. Two old constants clashed with the new numbers.**

- **Top speed (150) capped the WHOLE velocity arrow.** A 500 px/s jump would get cut to 150 on frame one. Fix: cap **horizontal only**. Going up: never capped. Going down: optional **terminal velocity**.
- **The 03 normalization became pointless.** Only Left/Right push now, so the input direction is already -1, 0, or 1. Up is a jump, not a push.

**4. Bump: one rest threshold isn't enough anymore.**
The old threshold (400 × 0.1 × 1.1 = 44 px/s) was built for the most speed one frame of _pushing_ could add. But gravity is stronger: at MAX_DT = 0.1, one frame of gravity adds **125 px/s**. A square standing on the floor during a lag spike would count as a _bounce_, and grounded would flicker off (= jump randomly fails).
Raising it to 137.5 for both axes? Then gentle _wall_ hits under 137.5 would stop dead instead of bouncing.
Fix: **one threshold per axis, each derived from that axis's force.**

- `restThresholdX = acceleration × MAX_DT × 1.1`
- `restThresholdY = gravity × MAX_DT × 1.1`

**5. Bump: tunneling (and Claude corrected its own rule).**
I wanted terminal velocity around 600–750, above the 500 of a normal jump's fall, so normal jumps never hit the cap.
But with MAX_DT = 0.1, 600 × 0.1 = **60 px in one step**. Collision only checks where the square _ends up_. The real rule for skipping a box: the step has to carry the square from **fully above** to **fully below**, so step > **box thickness + square size** = 20 + 30 = **50 px**. 60 > 50 → a lag spike could drop it straight through a platform.
(Claude's first version of this rule forgot the square's own size. That also means the "5 px wall" thought experiment from 07 was wrong: it needed a 35 px step, not 15.)
Options:

- Lower terminal velocity → would have to go **under 500**, cutting into normal jumps. I first liked this ("fix logic, not data"), but it makes the game feel worse to cover a lag spike.
- **Lower MAX_DT to 1/30** → 600 / 30 = **20 px** max step. Lots of margin. Cost: below 30 fps the game goes slow-mo (the 04 trade-off). Thresholds update automatically since they're derived. ← picked this
- Split big moves into small sub-steps → the real logic fix, works for anything. Bigger job, saved for later.

**6. First implementation, three bugs.**

- `restThresholdY` was defined... and never used. `restOrBounce` still compared everything to the X one. → Pass the threshold in from each call site.
- The cap still computed `speed = √(vx² + vy²)`, so while falling fast `speed` was huge and **velocityX got scaled down**. Running off a ledge = slowing down sideways. → Clamp `velocityX` alone to ±topSpeed.
- `jumpSpeed` was stored negative, and the jump did `-jumpSpeed` → **+500 = down**. → Store the _magnitude_ (positive), apply the direction where the jump happens.

**7. Detecting "grounded".**
Compare where the square _would_ have gone (`intendedPos`) with where it _ended up_. If it ended up **above** that (`pos < intendedPos`), something pushed it **up** → it landed. Same check after each obstacle push-out.

- Ceiling bonks push it _down_ → don't count. ✓
- Side hits happen on X, which never gets the callback → don't count. ✓
- Resting on the floor: gravity nudges it in every frame, the clamp pushes it back up → **true every frame**. ✓
  Done with an `onLanded` callback passed only on the Y call site.

**8. Reading the log: 6 hops on every landing.**
Logged `isGrounded` every frame after a fall: runs of `false` (air time) with single `true`s (contact frames), then thousands of `true`.
Air time of a hop = 2v / g, so I could read the bounce speeds right out of the frame counts:

| Air frames  | Launch speed                       | Predicted (× 0.6) |
| ----------- | ---------------------------------- | ----------------- |
| 166         | first drop, hits at 600 (terminal) |                   |
| 136         | ≈ 354                              | 360 ✓             |
| 81          | ≈ 211                              | 216 ✓             |
| 47          | ≈ 122                              | 130 ✓             |
| 27          | ≈ 70                               | 78 ✓              |
| 15          | ≈ 39                               | 47 ✓              |
| 5941 `true` | rest (28 < threshold)              | ✓                 |

Why 6 hops and not the 2 we predicted? We predicted with 137.5 (MAX_DT 0.1), but I'd changed MAX_DT to 1/30 → threshold became 1250/30 × 1.1 ≈ **45.8**. The derived constant updated itself, exactly as designed.
→ _A log isn't noise. With the right formula, frame counts are measurements._

**9. Should landing bounce? No.**
Six hops looks like a rubber ball, and grounded was only `true` for one frame per hop, so jumping during the hops would need frame-perfect timing.
Wall hits and floor landings are different events → **per-axis bounciness**: `bouncinessX = 0.6` (springy walls), `bouncinessY = 0` (solid floors, and ceilings become clean head bonks).

**10. Bump: "no threshold" silently meant "don't touch velocity".**
First try: the Y call site passed no threshold, and `restOrBounce` did `if (restThreshold) { ...change vel... }`. Undefined → skipped → velocity **unchanged**. The square _stood_ on the floor while `velocityY` stayed at **600**. The clamp hid it. Consequences: walking off a ledge = instant full-speed drop; hitting a ceiling = sticking to it until gravity ate the jump.
Fix: pass `bounciness` **explicitly** too. `-vel × 0` = exactly the 0 I wanted.
→ _A missing parameter shouldn't secretly switch behavior. Same lesson as the `height = width` default in 08._

**11. Ordering puzzle: grounded comes too late.**
The jump has to set velocity _before_ moving, but `isGrounded` is only known _after_ `moveAndCollide`. So the jump uses **last frame's** value. And that isn't stale: nothing moves between the end of one frame and the start of the next, so "grounded at the end of last frame" = "grounded right now."
`isGrounded` moved to the **remembered** state, next to `x` and `velocityX`: remembered between frames, recomputed once per frame by physics.

**12. Jump height: measured ~101 px, not 100.**
Logged `y` around the peak: from 270 to ~169. The extra ~1 px comes from moving in **steps**: each frame moves at the velocity from the start of that frame, so it slightly overshoots the smooth curve. Error ≈ v × dt / 2 = 500 × 0.004 / 2 ≈ 1 px at 240 Hz. At 60 Hz it's ~4 px. So jump height still depends a tiny bit on frame rate. Fixed timestep would fix it (still on the list).

**13. Bump: pogo stick.**
Holding Up = jumping forever. `keysPressed.ArrowUp` means **held** (a state), but a jump wants **just pressed** (an event).
Two ways:

- **A.** Compare with last frame: `justPressed = held now && !held last frame`. ← picked this
- **B.** Record the press in the `keydown` listener and "use it up" in the loop. Needs `e.repeat` to ignore OS key-repeat. Also means a press _before_ landing jumps on landing.
  What real games do: engines give you **A** ("pressed this frame"), and good platformers add a short **jump buffer** (~0.1 s) and **coyote time** (still jump ~0.1 s after walking off a ledge) on top. Both = remember _when_ something happened.
  `wasUpHeld` updates **every frame**, in the air too, or a press made while falling would still look "new" after landing.

**14. Tests.**

1. Hold Up → exactly one jump ✅
2. Run off the Platform, press Up while falling → no midair jump ✅
3. Jump into the Platform's underside → head bonk, falls back ✅
4. Fall running vs. standing → same fall speed (horizontal-only cap) ✅
5. Land on the Platform and tiles → grounded steady, can jump from them ✅

**15. Cleanup.**

- Had moved the Platform to y = 120 while experimenting. Out of reach: from the floor you need 180 px of rise, the jump does ~100. Back to y = 220 (needs 80, and the underside is low enough to bonk). Rest of the room uncommented.
- `isGrounded` was both a global AND returned from `moveAndCollide`. Nothing read the return → removed. One source of truth.
- `wasUpPressed` → `wasUpHeld` ("pressed" now means the one-frame event).
- Tuning split into vertical (gravity/jump) and horizontal (running) sections; comments updated everywhere ("any direction" cap, "8 directions", etc.).

✅ Gravity, solid landings, head bonks, horizontal-only cap, tunneling-safe terminal velocity, steady grounded check, one jump per press.

### Big takeaways

- Pick what you can _feel_ (height, time), derive the physics.
- Old assumptions break when the world changes: the arrow cap, the normalization, the single threshold.
- Each axis can need its own rules (thresholds, bounciness, caps).
- Tunneling rule: max step < thinnest box + square size.
- A log of true/false can be a measurement.
- Explicit parameters beat "missing = special behavior."
- Use last frame's facts when this frame's aren't computed yet, and check whether they're really stale.
- State vs. event: held ≠ just pressed.

### Still bugging me

- **Air control:** floor friction applies mid-jump (release Right in the air = brakes). Air friction / air acceleration when `!isGrounded`.
- **Jump buffer + coyote time** (timestamps).
- **Sub-steps** so tunneling is impossible at any speed, instead of leaning on MAX_DT.
- **Fixed timestep:** jump height varies slightly with frame rate.
- `updateVelocity` reads the keyboard for the jump. Input step could produce intents (`accelX`, `wantsJump`) and physics just applies them.
- Carried: first-come hit report, corner correction, hit vs. rest, overshoot reflection, clamp helper, braking on turnaround.
