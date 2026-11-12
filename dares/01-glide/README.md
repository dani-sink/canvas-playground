## 01 – glide

A square slides left to right and loops forever.

**What clicked:**

- Animation is basically a flipbook: wipe the canvas → move the object logically → draw it → repeat with `requestAnimationFrame`. If I forget the wipe, I get a smear instead of a square.
- My first try was `x++ % width`. It looked fine on screen, but `x` itself just kept growing forever. The screen was lying about where the square really was. Keep `x` in the real range so it actually means something.
- Start the wrap at `-size`, not `0`, so the square slides in from off-screen instead of popping in fully formed.
- `x === 400` only works if I land exactly on 400. With speed 3 or 0.7 I skip right over it and the square flies off forever. Use `>=`.
- Give numbers names (`canvasWidth`, `squareSide`). Then changing the size means editing one line, not hunting through the code.
- When wrapping, don't just reset to the start. Carry over the extra distance: `x = -size + (x - width)`. Resetting forgets how far past the edge I went; subtracting a full lap keeps it. Matters more at high speeds.

**Still bugging me:**

- ~~Split moving and drawing into separate steps~~ → done in 02
- Make speed the same on 60Hz and 144Hz screens.
