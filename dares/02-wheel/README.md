## 02 – wheel

Arrow keys drive the square. Smooth while held, diagonals work, wraps on all four edges.

### The goal

Ditch the auto-glide. Arrow keys move the square, continuously while held, stopping on release, diagonal when two keys are down.

### How it went

**1. First try: listeners + a big if/else chain.**
I already had the right idea of tracking keys in `keysPressed`. But I called `moveInDirection()` _from inside the keydown listener_, with a chain that checked the 4 diagonals first and then the 4 straight directions. Releasing a key called `stopMovement()`.
Movement worked... mostly.

**2. Bump: going right (or down), the square teleported back near the right side.**
Instead of reappearing on the left, it got thrown back to the right. Logged `x` across two frames and saw a ping-pong:

- Frame 1: the right-edge wrap puts x at about -29 (correct, just off the left edge).
- Frame 2: my left-edge check was `x <= 0`... and -29 is ≤ 0, so it immediately wrapped it BACK to the right.

Two problems hiding in there:

- My left limit was wrong. The square is still partly visible all the way down to `-squareSide`, not 0.
- My left formula didn't keep the overshoot. Plugging in `x = 0` showed it snapping.
  → _When something teleports, `console.log` it and follow the number frame by frame. Plug real numbers into every formula._

**3. Bump: hold Up, tap Right → the square stopped going up.**
`stopMovement` had `if (!ArrowDown || !ArrowUp) deltaY = 0`. With `||`, releasing ANY key killed vertical movement as long as Down wasn't held. I meant "neither is held", which needs both conditions true (AND).

**4. Second try: a `moving` flag.**
Moved the decision into the loop: if `moving`, call `moveInDirection()`, else `stopMovement()`. Fixed the `||` with nested ifs. Widened the limits to `-squareSide` and `canvasWidth + squareSide`.

**5. Bump: hold Right, tap Left, release Left → the square kept going LEFT.**
Releasing Left set `moving = false`, even though Right was still held. And the deltas from the Left press were just _remembered_, never recalculated. So I had two "truths" (`moving` and `keysPressed`) that disagreed.
The question that fixed it: _if I only had `keysPressed`, could I work out the deltas from scratch every frame?_ Yes. So I deleted `moving` and `stopMovement`, and called `moveInDirection()` every frame.
→ _ONE source of truth. Anything derived from it should be recalculated, not remembered._

**6. Bump: the wrap had a blind spot.**
My right limit `canvasWidth + squareSide` was too far. The square is fully gone at `canvasWidth`, so for 30px it was invisible but hadn't wrapped yet. And I'd gone back to _resetting_ (`x = -squareSide`) instead of carrying the overshoot (already knew better from 01!). Fixed: right limit = `canvasWidth`, subtract a full lap.

**7. Bump: leaving left didn't mirror leaving right.**
Right-edge wrap: subtract a full lap. Left-edge wrap: `x = canvasWidth + x`, which only adds the canvas width, not a full lap. Plugging in `x = -30.25` gave 369.75, fully on screen → snap. Fixed: add `canvasWidth + squareSide`. Now all four edges move exactly one lap and keep the overshoot.
→ _Wraps should be symmetric. If one side subtracts a lap, the other side adds the same lap._

**8. Bump: opposite keys were decided by line order.**
With Left + Right held, my if/else chain hit `ArrowLeft` first and stopped. Right never got checked. Up beat Down the same way. Up + Left + Right went up-right (Left ignored). Nothing I'd _decided_, just whichever line came first.
Switched to: reset both deltas, then four separate `if`s with `=`. But now Right won, because its line
