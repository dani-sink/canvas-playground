## 04 – steady

Speed is now pixels per _second_, not per frame. The square moves the same on any screen.

### The problem

`speed` was in pixels per frame. Faster screen = more frames = faster square. The game literally ran at a different speed on different monitors.

### How it went

**1. Measure the time between frames.**
`requestAnimationFrame` hands `draw` a timestamp (in ms). One timestamp alone tells me nothing, but subtracting the previous one gives me how long this frame took → `dt`.

- The old timestamp has to live _outside_ `draw` (`lastTime`), or it gets forgotten every frame.
- First frame has no "previous" → I just set `lastTime = timestamp`, so dt = 0. No weird jump at startup.

**2. Bump: "I get about 4 ms."**
1000 ms ÷ 4 ms ≈ 250 → closest real monitor rate is 240Hz. Averaged 100 frames: 240.097 fps. Confirmed.
Plot twist: my old `speed = 0.25` only felt right because of my 240Hz screen (0.25 × 240 = 60 px/s). On a normal 60Hz laptop that's 15 px/s, 4x slower. That's the exact bug this dare is about.
→ _fps = 1000 ÷ frame time. Average a bunch of frames, single ones wobble._

**3. Get the math right with units.**
I first thought px/frame × frames/s = px/s. True, but backwards from what I need. I already have px/s and want "how far this frame":
(px / s) × **s** = px → `speed * dt`, with dt in seconds (`/ 1000`).
And use each frame's _real_ dt, not average fps. A slow frame just moves further to catch up.
→ _Let the units do the thinking. If they cancel to what I want, the formula's right._

✅ Stopwatch test: holding Right crosses 400px in about 4 s at speed 100.

**4. Bump: switched tabs, came back, square ran right forever.**
Not a time bug at all! I let go of the key while on the other tab, so my page never got the `keyup`. It still thought Right was held.
Fix: when the window loses focus (`blur`), reset all keys to false.
Why "not held" is the right guess:

- Wrong guess "released" (key actually still down) → key-repeat sends a new `keydown` → fixes itself.
- Wrong guess "held" (key actually up) → square runs away forever, nothing ever fixes it.
  Also: `blur` beats `visibilitychange`. Clicking into DevTools fires blur but doesn't hide the page.
  → _When I can't know the truth, pick the wrong guess that's cheap and fixes itself._

**5. Bump: the jump was hiding.**
My key fix accidentally covered up a second bug: no keys held = nothing moves = nothing to see. So I turned off `blur` and only logged weird frames (`if (dt > 0.1) console.log(...)`). Logging every frame would spam 240 lines a second.
Result: **4.35 seconds in a single frame.**
Why: browsers _pause_ the game loop in hidden tabs. The first frame back covers the whole time I was gone.
4.35 s × 100 px/s = 435 px in ONE step. One full lap is 430 px (400 + 30), so the square went all the way around and landed almost where it started. Looked like nothing happened. Super sneaky.
→ _A fix that hides a bug doesn't mean the bug is gone. Turn the fix off and look underneath._

**6. Stuff I got confused about (and cleared up):**

- _"So the position gets less precise the longer I'm away?"_ Nope, the math is exact. The problem is it gets there in **one jump**: looks like a teleport, and it skips everything in between (a wall in the way would get ignored).
- _"Is 0.1 s the limit for smooth movement?"_ No, 0.1 s = 10 fps, which is choppy. It's a **safety limit**: which frames do I believe? Normal frames pass through untouched; fake giant ones get cut down.
- _"But 10 fps feels awful."_ Right, but the cap doesn't cause that. It only kicks in when the game was already frozen. Smoothness comes from the real frame rate, which the cap can't change.

**7. The fix: cap dt.**
`Math.min(dt, MAX_DT)` with `MAX_DT = 0.1`. Now leaving the tab basically pauses the game.
Trade-off: a really slow computer (under 10 fps) would play in slow-mo instead of teleporting. Slow-mo is playable, teleporting isn't.
0.1 is a good default. Go lower (0.03–0.05) once there are fast things and collisions.

**8. Cleanup pass.**

- Declared `MAX_DT`... then kept typing `0.1` anyway. Swapped it in.
- `speed` had wandered inside `draw` → moved it back up top with the other settings. Constants don't need to be recreated 240 times a second.
- `speed` comment said "along each axis", which hasn't been true since normalizing in 03. Wrong comments are worse than none.
- `deltaTime === MAX_DT` is fine even though it's a float: `Math.min` hands back one of its inputs untouched, it doesn't compute a new number.
- `preventDefault` only for arrow keys now, so F5 / Ctrl+R work again.

✅ Final tab-switch test: logs the cap, no jump, no stuck key.

### Big takeaways

- Movement = speed × time, and time comes from real timestamps, not frame counts.
- Test the weird cases on purpose (tab switch, focus loss). That's where both bugs were.
- Check units. Pick safe guesses. Don't trust a frame that claims seconds went by.

### Still bugging me

- Big steps can still skip through things. Apparently a "fixed timestep" is the real fix for physics. Later.
- Half-tilted gamepad stick vs. normalizing (still open from 03).
