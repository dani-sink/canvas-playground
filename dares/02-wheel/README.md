## 02 – wheel

Arrow keys move the square now. Holding works, diagonals work, wraps on every side.

**What clicked:**

- Don't move stuff inside `keydown`. The OS has a delay before key-repeat kicks in, so it feels like there is some lag. Instead, just remember which keys are down (`keysPressed`) and let the loop move the square every frame.
- Have ONE place that knows the truth. I had a `moving` flag + old deltas hanging around, and they got out of sync with the actual keys (hold Right, tap Left → square kept going left forever). The fix: throw away the old deltas and recalculate them from `keysPressed` every single frame.
- When something teleports weirdly, `console.log(x)` and follow it for a couple frames. Turned out my right-edge wrap put x at like -28, and then the left-edge check grabbed it next frame and threw it back right right. Kind of like ping-pong.
- The square is (partly) visible anywhere from `-size` to `width`. My limits have to be exactly that. Too far out = it disappears for a bit before coming back. Too close in = it pops/snaps.
- Wrapping left and right should mirror each other: going off left → add a full lap, going off right → subtract a full lap. Plug in an actual number to sanity-check.
- My first if/else chain let line order decide what happens when opposite keys are held (Left always beat Right). Bad. I should decide that intentionally.
- Use `+=` so each key adds its own push. Left + Right = they cancel out = no movement. Makes sense
- `true` is 1 and `false` is 0 in math, so `(Right - Left) * speed` does it all in one line. The first part is the direction (-1, 0, 1), `speed` is the magnitude (how fast in that direction).

**Still bugging me:**

- Diagonal feels faster than straight. Something about the `(1, 1)` arrow being longer than `(1, 0)`?
- Make speed the same on 60Hz and 144Hz screens (still open from 01).
