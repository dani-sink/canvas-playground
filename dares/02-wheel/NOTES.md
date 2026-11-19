## 02 – wheel
Arrow keys drive the square. Smooth while held, diagonals work, wraps on all four edges.

### The goal
Ditch the auto-glide. Arrow keys move the square, continuously while held, stopping on release, diagonal when two keys are down.

### How it went

**1. First try: listeners + a big if/else chain.**
I already had the right idea of tracking keys in `keysPressed`. But I called `moveInDirection()` *from inside the keydown listener*, with a chain that checked the 4 diagonals first and then the 4 straight directions. Releasing a key called `stopMovement()`.
Movement worked... mostly.

**2. Bump: going right (or down), the square teleported back near the right side.**
Instead of reappearing on the left, it got thrown back to the right. Logged `x` across two frames and saw a ping-pong:
- Frame 1: the right-edge wrap puts x at about -29 (correct, just off the left edge).
- Frame 2: my left-edge check was `x <= 0`... and -29 is ≤ 0, so it immediately wrapped it BACK to the right.

Two problems hiding in there:
- My left limit was wrong. The square is still partly visible all the way down to `-squareSide`, not 0.
- My left formula didn't keep the overshoot. Plugging in `x = 0` showed it snapping.
→ *When something teleports, `console.log` it and follow the number frame by frame. Plug real numbers into every formula.*

**3. Bump: hold Up, tap Right → the square stopped going up.**
`stopMovement` had `if (!ArrowDown || !ArrowUp) deltaY = 0`. With `||`, releasing ANY key killed vertical movement as long as Down wasn't held. I meant "neither is held", which needs both conditions true (AND).

**4. Second try: a `moving` flag.**
Moved the decision into the loop: if `moving`, call `moveInDirection()`, else `stopMovement()`. Fixed the `||` with nested ifs. Widened the limits to `-squareSide` and `canvasWidth + squareSide`.

**5. Bump: hold Right, tap Left, release Left → the square kept going LEFT.**
Releasing Left set `moving = false`, even though Right was still held. And the deltas from the Left press were just *remembered*, never recalculated. So I had two "truths" (`moving` and `keysPressed`) that disagreed.
The question that fixed it: *if I only had `keysPressed`, could I work out the deltas from scratch every frame?* Yes. So I deleted `moving` and `stopMovement`, and called `moveInDirection()` every frame.
→ *ONE source of truth. Anything derived from it should be recalculated, not remembered.*

**6. Bump: the wrap had a blind spot.**
My right limit `canvasWidth + squareSide` was too far. The square is fully gone at `canvasWidth`, so for 30px it was invisible but hadn't wrapped yet. And I'd gone back to *resetting* (`x = -squareSide`) instead of carrying the overshoot (already knew better from 01!). Fixed: right limit = `canvasWidth`, subtract a full lap.

**7. Bump: leaving left didn't mirror leaving right.**
Right-edge wrap: subtract a full lap. Left-edge wrap: `x = canvasWidth + x`, which only adds the canvas width, not a full lap. Plugging in `x = -30.25` gave 369.75, fully on screen → snap. Fixed: add `canvasWidth + squareSide`. Now all four edges move exactly one lap and keep the overshoot.
→ *Wraps should be symmetric. If one side subtracts a lap, the other side adds the same lap.*

**8. Bump: opposite keys were decided by line order.**
With Left + Right held, my if/else chain hit `ArrowLeft` first and stopped. Right never got checked. Up beat Down the same way. Up + Left + Right went up-right (Left ignored). Nothing I'd *decided*, just whichever line came first.
Switched to: reset both deltas, then four separate `if`s with `=`. But now Right won, because its line overwrote Left's. Still line order, just flipped.
→ *If the order of my lines decides the behavior, I haven't actually made a decision.*

**9. Fix: add instead of overwrite.**
`deltaX += -speed` for Left, `deltaX += speed` for Right. Both held → they cancel to 0. Now I can reorder the lines and nothing changes.
→ *Accumulate pushes (`+=`) instead of overwriting (`=`). Same idea later for gravity + wind + input.*

**10. Then: no ifs at all.**
Booleans become 0/1 in arithmetic, so:
`deltaX = (ArrowRight - ArrowLeft) * speed`
The `(Right - Left)` part is the DIRECTION (-1, 0, or 1). `speed` is the MAGNITUDE. Nine branches → two lines.

✅ Held keys, release, diagonals, opposite keys cancel, all four edges wrap smoothly.

### Big takeaways
- Listeners record, the loop decides. Moving inside `keydown` stutters (OS key-repeat delay).
- One source of truth, recalculated every frame. Remembered state drifts.
- Trace numbers when things teleport. Plug real values into formulas.
- Pick behavior on purpose. Don't let line order choose for me.
- Direction × magnitude is a really clean way to think about movement.

### Still bugging me
- ~~Diagonal feels faster than straight~~ → fixed in 03 (normalize)
- ~~Same speed on 60Hz and 144Hz screens~~ → fixed in 04 (delta time)
- (Found later: `e.preventDefault()` here blocked EVERY key, including F5/Ctrl+R → fixed in 04 by only blocking arrow keys.)
