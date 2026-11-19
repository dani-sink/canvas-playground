## 10 – feel
Air control, coyote time, jump buffer, variable jump height. The physics was already correct; this dare is about what the player *meant*.

### The problem
After 09 the physics was right, but right isn't the same as good. Four things felt off:
1. **Braking in midair.** Release Right mid-jump → the square slows hard, like it's sliding on the floor. Nothing in the air pushes back that much.
2. **The ledge betrayal.** Run off a ledge, press Up a split second late → already falling → no jump. Felt like I pressed in time.
3. **The swallowed jump.** Press Up a split second *before* landing → the press happens in the air → nothing. Then I land and just stand there.
4. **Every jump is the same.** Light tap or long hold, always the full 100 px. No small hop.

None of these are physics bugs. They're gaps between what the **player meant** and what the **game did**. Good platformers close them on purpose, often by bending the rules a little in the player's favor.

### How it went

**1. Air control.**
Split `acceleration` and `friction` into ground and air versions, picked with `isGrounded` (last frame's, same as the jump):
- `groundAcceleration = 400`, `airAcceleration = 260` → still steerable in the air, just less sharp.
- `groundFriction = 300`, `airFriction = 60` → from 150 px/s, the ground stops you in 37.5 px, the air would let you coast ~187 px. Momentum carries through jumps.

Passed `friction` into `updateAxisVelocity` as a parameter so it stays pure.
Bump: `restThresholdX` was still derived from `acceleration`, which I'd just renamed → would've been a `ReferenceError` the moment the file loaded. Derived it from `groundAcceleration`: the threshold protects against the most speed one frame of pushing can add, and ground is the stronger push.

**2. How to measure "how long ago"?**
Coyote time and the buffer both need it. Two options:
- **Timestamps:** remember *when* (from `requestAnimationFrame`), compare with now. That's **real time**: keeps ticking while I'm on another tab.
- **Timers:** start at 0.1, subtract `dt` every frame. That's **game time**: `dt` is capped and stops while the tab is hidden.

Picked timers. Time the game didn't experience shouldn't count.

**3. Coyote time, and a condition that blocked itself.**
`coyoteTimer` refills to 0.1 while grounded, counts down in the air. A jump uses it up (`= 0`) so there's no double jump.
First version: `if (justPressedUp && isGrounded && coyoteTimer > 0)`. Traced the actual coyote case (ran off a ledge, pressed 0.05 s later): `isGrounded` is **false** → no jump. The `isGrounded` check blocked the exact case the feature exists for. And `coyoteTimer > 0` already covers grounded (it's full every frame on the ground) AND "just left." Removed it.
→ *A redundant condition isn't always harmless. Sometimes it cancels the feature.*

**4. Jump buffer: the same pattern, in the other direction.**
Coyote remembers "I *was* on the ground." The buffer remembers "I *pressed* jump."
- Refilled from an **event** (`justPressedUp`), not a state. So holding Up through a landing never refills it → no auto-jump.
- Jump condition: `jumpBufferTimer > 0 && coyoteTimer > 0` = "pressed recently" AND "allowed to jump."
- A jump uses up **both** timers: the buffer so the same press can't fire twice, coyote so there's no second jump in the air.
- `justPressedUp` disappeared from the condition: the buffer IS "just pressed," stretched over 0.1 s.

Bump: I started the buffer at `0.1`. That's the game booting up as if Up had *just been pressed*. Didn't show (the square spawns in the air, falls ~0.3 s, the fake press expires), but spawn it on the floor and it jumps by itself on frame 2. Fix: start at 0.
→ *A timer's starting value should describe the world at startup. At startup, nothing has happened.*

**5. Variable jump height.**
"Just released" = `!ArrowUp && wasUpHeld` (mirror of just pressed). If released while **rising** (`velocityY < 0`), multiply the upward speed by 0.5.
Only while rising: cutting a *fall* would make the square float like a parachute every time I let go.
Predicted tap: 500 × 0.5 = 250 px/s → 250² / 2500 = **25 px**.
Measured: tap **29.6 px**, full hold **101.1 px**.
Why the tap was higher: the prediction assumed release at the exact instant of launch. A real tap lasts a few frames. At ~13 ms held, the square rises ~6 px at full speed first, then the cut leaves ~242 px/s → ~23.5 px more. Total ≈ 29.5. Matches.
And taps came out "about the same, not exactly": each tap is a slightly different length. That's the feature: hold time → jump height, smoothly.

**6. Bump: the buffered tap was a coin flip.**
Tap Up just before landing → sometimes a big jump, sometimes a small hop.
- **Released after landing:** the buffered jump fires while I'm still holding, then I let go while rising → cut → small hop.
- **Released before landing:** the release happens while *falling* → no cut (correct, no parachute) → that release event is used up. Then I land, the buffer fires with Up no longer held, and there's no release left to detect → **full jump**.

Same intention, a few ms apart, opposite results.
Fix: when a jump starts, check the **state**, not just the event. Up not held right now → start pre-cut: `velocityY = ArrowUp ? -jumpSpeed : -jumpSpeed * jumpCutMultiplier`. No double cut either: a jump that starts pre-cut has no later "just released" frame.
→ *An event can happen before the thing it's meant to affect. When it matters, check the current state too.*

**7. Tests.**
- Coyote: press just after leaving a ledge → jumps ✅. Half a second later → no jump ✅. Two quick presses from the floor → one jump ✅.
- Buffer: press just before landing → jumps on landing ✅. Way before → no jump ✅. Hold through landing → no auto-jump ✅.
- Variable height: tap ≈ 29.6 px, hold ≈ 101 px ✅. Buffered tap → consistent small hop ✅.
- Tab switch at the peak: the square froze in midair, then fell normally when I came back, and a quick tap before landing still gave a small hop. Game time stopped, so the timers stopped too ✅.

**8. Cleanup.**
- Timers moved from "recomputed every frame" to "**remembered** between frames." Counting down across frames is literally what a timer does.
- Naming: tuning values are camelCase (`coyoteTime`, `jumpBufferTime`, `jumpCutMultiplier`), `MAX_DT` stays UPPER_CASE as an engine/safety limit. One convention, written at the top.
- `updateVelocity` regrouped: horizontal → input events → timers → jump or gravity. Stale comments fixed ("only if grounded", "air friction parked").

✅ Air control, coyote time, jump buffer, variable jump height, all tested, including the edge cases.

### Recap, in my words
We put all of this in to bridge the gap between strict computer physics and human reaction timing, so the game feels fair, snappy, and responsive instead of frustrating.

**Coyote time (forgiveness after leaving a ledge).**
In a strict game loop, the exact millisecond the square leaves the platform, `isGrounded` flips to false. People almost always press jump a split second late when running at full speed toward a ledge, so the input would be ignored and you'd just fall. Coyote time keeps an invisible stopwatch running for about 0.1 s after you leave a ledge. While it still has time left, the game lets you jump as if you were still on the ground.
*Trivia: named after Wile E. Coyote hovering in mid-air for a moment before realizing he ran off a cliff.*

**Jump buffer (forgiveness before touching the ground).**
When falling toward the ground, people anticipate the landing and press jump slightly before touching down. In a strict loop, pressing even one frame early does nothing, so you land on the floor and just stand there. The buffer is a short-term memory: pressing jump in mid-air starts a 0.1 s countdown that remembers you asked. If the square lands before it runs out, the jump fires the moment you land.

**Why the jump logic lives in `updateVelocity`.**
Not because of the location itself: that's where the jump velocity gets decided, *before* the square moves, using last frame's `isGrounded`. Together, the pieces solve five playability problems:
1. **No "eaten" inputs.** Press a hair too early or too late, and the jump still works.
2. **No accidental double-firing.** Zeroing both timers the moment a jump launches means one press = one jump.
3. **Expressive height control.** Two signals: the **release event** (a normal jump cut mid-air) and the **held state at launch** (a buffered tap). Together they let you choose between quick, low hops and full, high jumps with natural muscle memory.
4. **Ground feel vs air feel.** Switching acceleration (in `updateAcceleration`) and friction (in `updateVelocity`) on `isGrounded` keeps running on solid ground tight and snappy, while mid-air movement stays smooth and controllable.
5. **Game time, not real time.** The timers count `dt`, so switching tabs freezes the square *and* the windows. Nothing expires while the game isn't running.

### Big takeaways
- Correct physics ≠ good feel. Bend the rules toward what the player meant.
- Timers that count `dt` = game time. Timestamps = real time.
- A jump should use up every window that allowed it.
- Refill from a state (coyote) vs. from an event (buffer): it decides whether holding a key counts.
- Initial values describe the world at startup.
- Events can happen before what they affect. Check the state too.
- Redundant conditions can quietly block the feature they sit in.

### Still bugging me
- **Sub-steps** so tunneling can't happen at any speed (instead of leaning on MAX_DT).
- **Fixed timestep:** jump height still shifts slightly with frame rate.
- **Input intents:** `updateVelocity` still reads the keyboard. The input step could produce `accelX`, `jumpPressed`, `jumpHeld`, and physics just applies them.
- Rare: start a pre-cut jump, press + release Up again while rising → cut again (quarter speed). Harmless, maybe even intended.
- Carried: first-come hit report, corner correction, hit vs. rest, overshoot reflection, clamp helper, braking on turnaround.
