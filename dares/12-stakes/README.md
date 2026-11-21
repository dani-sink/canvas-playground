# 12 — Stakes

Up to now the square couldn't lose and couldn't win. You just wandered around. This dare adds consequences: **spikes** send you back to the start, a **flag** wins the game, and the loop now knows which of those situations it's in.

## The problem

Every obstacle did the same thing: block you. A platformer needs at least two more kinds of thing:

- things you **touch** and something happens: hazards and the goal. These are _triggers_.
- a **game state**, so the loop knows whether it's simulating, paused on a death, or showing a win.

And "back to the start" sounds like `x = 0; y = 0`, but every remembered variable is part of a life. Any one I forget leaks into the next life.

## Bumps

1. **The level data had its own bugs.** The first typed level had a goal _platform_ typed as `goal` (you'd fall through it), and spikes buried inside the tunnel floor, so they could never be touched. Fix: a redesigned level with explicit `type` on every obstacle, plus a magenta `warnColor` for unknown types, so a typo shows up on screen.

2. **Spikes were walls, then ghosts.** Skipping non-solids in `stepAxis` made the square pass straight through spikes with nothing happening. So I commented the skip out to get hazards into `hitObstacles`... and the spikes became solid again. I could stand on them, and `isGrounded` went true on them. Death only fired because the push-out happened to record the overlap, at in-between positions mid-move.
   Fix: keep the skip, so solids stay in the collision loop, and add a **separate trigger check after `moveAndCollide`** on the final position. That's my own answer to "when do we decide?": after the square has finished moving this frame.

3. **The dead/won screen was "frozen" only by accident.** `drawScene` ran only in `playing`. The canvas just kept its last picture, so nothing new could be drawn on top, like the death message. Fix: draw every frame in every state. That needs `hitObstacles` outside the branch, so it became a top-level `let`: dead and won frames reuse the last playing frame's highlights, which is exactly what a frozen world should show. It started as `null`, which only worked because the first frame is always `playing`, so now it starts as an empty `Set`.

4. **The death pause had its number in two places.** The pause length was typed in two spots, and the reset was done twice (in `updateDeathTimer` _and_ in `resetGame`). Fix: a constant `deathPauseTime` plus a countdown `deathTimer`, same pattern as `coyoteTime` / `coyoteTimer`. `resetGame` is the one place that resets.

5. **Respawn reset was incomplete, and my tests couldn't see it.** I only reset position, velocity and camera. Stale `isGrounded` / `coyoteTimer`: walk into the Ledge spikes while **grounded**, respawn in mid-air, and the first frame reads "grounded" → coyote refills → **jump in mid-air**. Two things hid it:
   - the spawn falls ~70 px onto Box (0.33 s), longer than the 0.1 s buffer, so leftover timers ran out in the air
   - my `console.log(isGrounded)` sat _after_ `moveAndCollide`, so it printed the fresh value, not the stale one that `updateAcceleration` / `updateVelocity` had just used

   And all my deaths were mid-air, where `isGrounded` was already false.
   Fix: use the "REMEMBERED" section as a checklist. For each variable: reset it, or it's recomputed every frame anyway, or it must NOT reset (`lastTime` = the clock, `keysPressed` = the real keyboard).

6. **`wasUpHeld` was a design question, not a zero.** Resetting it to `false` "for safety" is the _unsafe_ option: holding Up through the death → first frame sees "just pressed" → buffer fills → a grounded spawn would jump by itself. Fix: `wasUpHeld = keysPressed.ArrowUp`. Right after a respawn, "was it held last frame?" has no answer, so use the keyboard as it is now. Held counts as held, not as a new press. Side effect: a press made _during_ the death pause doesn't carry into the new life, which is what I want.

7. **One wrong frame on respawn.** The respawn happens inside the `dead` branch, after that frame's camera update... and there was none in that branch. So on that frame the camera still showed the pit, the overlay was gone, and the square was off screen at world x = 0. My first fix put `updateCamera()` in the dead branch _before_ `updateDeathTimer`: still framing the old x. Same bug as "camera before move" in dare 11. Fix: **one `updateCamera()` per frame, after the state branch, right before drawing.** Whatever moved `x` (physics, respawn, someday checkpoints), the camera follows before anything is drawn. The restart button never had this problem, because its click lands between frames.

8. **Small one:** `drawEndScreen` placed text vertically with `canvasWidth * 0.38`. It only looked right because the canvas is nearly square. Now x uses width and y uses height.

## Tests I ran

- every hazard kind (floor spikes, Ledge spikes, pit) → dead ✓
- win → Restart → die: full pause ✓
- Space / Enter mid-run after clicking Restart → nothing (hidden button loses focus) ✓
- switch tabs during the pause → it waits (game time + `MAX_DT`) ✓
- hold Up through a death / press Up just before / die mid-air vs grounded ✓

## Takeaways

- **Solids vs triggers.** Solids act _during_ the move (push out). Triggers act _after_ it (report). Mixing them gives you standable spikes.
- **State machine = which steps run.** Drawing runs in every state; only the simulation stops. Input listeners keep running regardless, because they live outside the loop.
- **A reset is a checklist, not a guess.** The checklist is the remembered-state section. "Recomputed every frame" and "must not reset" are real answers too.
- **Test the dangerous case, and measure the right moment.** A log placed after the value gets recomputed proves nothing about the stale read. A forgiving spawn hides timer bugs.
- **Camera = derived view.** Compute it right before drawing, after everything that can move the square.
- **Tunneling applies to triggers too.** Same rule: step > thickness + squareSide. 12 px spikes are safe at 20 px max steps.

## Still bugging me

- Every death sends me all the way back. Checkpoints?
- Death is automatic but winning needs a click. Maybe an R key for both, inside the canvas?
- The death "animation" is a freeze. No flash, no particles, nothing.
- The spawn is in mid-air on purpose (well, by accident). If it ever moves onto the ground, the respawn tests must run again.
- `console.warn` for unknown types would print every frame.
- `hitObstacles` is the name of a top-level variable, a local in `moveAndCollide`, _and_ `drawScene`'s parameter. It works, but three things share one name.
- If a hazard and the goal overlapped, list order would decide. Not possible in this level, but it's a silent rule.
- Level design is still "playable, not polished". A level editor is still parked for later.
