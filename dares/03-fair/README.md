## 03 – fair

Diagonals don't cheat anymore. The square moves at the same speed in all 8 directions.

**What clicked:**

- Holding Up + Right gives the direction `(1, 1)`. Draw the triangle: its length is √2 ≈ 1.41, not 1. So diagonals were about 41% faster. Sneaky.
- How long an arrow is: `Math.sqrt(vx*vx + vy*vy)`. It's just Pythagoras.
- Fix: **normalize**. Divide the direction by its own length so it always comes out as length 1, then multiply by `speed`. Direction says _where_, speed says _how fast_. Keep them separate.
- After normalizing, a diagonal is about `(0.707, 0.707)`. Each part is smaller, but the total length is 1.
- No keys held = `(0, 0)` = length 0. Dividing by it gives `0 / 0 = NaN`, and NaN spreads: once it gets into `x`, the square is gone forever. Always check `length > 0` before dividing.
- My distance log printed `0.24999999999999997` instead of `0.25` on diagonals. That's floating-point rounding, not my math. Don't compare floats with `===`.

**Still bugging me:**

- Gamepad sticks can be half-tilted (short arrow, slow walk). Normalizing would force that up to full speed. Maybe only shrink arrows that are _too long_?
- Make speed the same on 60Hz and 144Hz screens (still open since 01).
