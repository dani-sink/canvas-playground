# Canvas Playground

Vanilla JS + HTML5 canvas, no frameworks or libraries.

## 01 - glide

**Goal:** a square glides left to right and wraps forever.

**Learned:**

- Animation is a flipbook : clear → update → draw, repeated with `requestAnimationFrame`.
- Forget to clear canvas and you get a smeared shaped over the canvas.
- `x++ % width` looked right on screen, but `x` grew forever. State should tell the truth, so keep position bounded.
- Wrap from `-size`, where `size` is the dimension of the square, not `0`, so the square slides in instead of snapping.
- `x === 400` only works if the step lands exactly on 400. Speeds like 3 or 0.7 skip past it, so use `>=`.
- Name the magic numbers (`canvasWidth`, `squareSide`) so one change updates everything.
- Wrapping without losing distance: `x = -size + (x - width)` carries the overshoot over.

**Still open:**

- Split update and draw into separate steps.
- Same speed on 60Hz and 144Hz screens.
