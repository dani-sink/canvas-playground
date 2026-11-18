// =============================================================================
// 08 – room: many obstacles, described as DATA, handled by one loop
// Frame order: input → velocity → move & collide → draw
// =============================================================================

// Grab the canvas and its 2D drawing context. All drawing goes through ctx.
const canvas = document.getElementById("my-canvas");
const ctx = canvas.getContext("2d");

// -----------------------------------------------------------------------------
// World geometry (px). Everything here depends only on constants → computed once.
// -----------------------------------------------------------------------------

const canvasWidth = canvas.width;
const canvasHeight = canvas.height;
const squareSide = 30;

// Walls: limits for the square's TOP-LEFT corner so the WHOLE square stays visible.
// x is the square's LEFT edge, so on the far side subtract its size.
const leftLimit = 0;
const rightLimit = canvasWidth - squareSide;
const topLimit = 0;
const bottomLimit = canvasHeight - squareSide;

// -----------------------------------------------------------------------------
// Level: the room is DATA, not code.
// Each obstacle stores ONE form: { x, y, width, height } (top-left + size).
// The start/end form for overlap tests is derived on demand with getBounds(),
// so the two forms can never disagree.
// Adding a box = adding one line here. No logic changes.
// `name` is only a debug label (e.g. console.log(obstacle.name)); no logic uses it.
// Obstacles are identified by the object itself, so duplicate names are harmless.
// -----------------------------------------------------------------------------

const obstacleList = [
  // Wide and flat. 60 px gap below it, so the square can pass underneath.
  { name: "Platform", x: 40, y: 220, width: 160, height: 20 },

  // Tall.
  { name: "Pillar", x: 120, y: 40, width: 30, height: 120 },

  // Corridor: gap = right.x - (left.x + left.width).
  //   x: 290 → 30 px gap = exactly the square's size. Fits on paper (touching isn't
  //            overlapping), but in practice x would have to be EXACTLY 260.000;
  //            any tiny offset clips a corner and the Y check lands it on top.
  //   x: 289 → 29 px gap. Doesn't fit, stops cleanly (no jitter).
  { name: "Corridor left", x: 220, y: 60, width: 40, height: 80 },
  { name: "Corridor right", x: 289, y: 60, width: 40, height: 80 },

  // Two tiles touching at x = 290, no gap. The square glides across the seam:
  // resting flush on top, Y segments only touch, so the X step never blocks.
  { name: "Tile A", x: 230, y: 200, width: 60, height: 20 },
  { name: "Tile B", x: 290, y: 200, width: 60, height: 20 },

  // 10 px from the left wall: a gap the square (30 px) can't enter.
  { name: "Box", x: 10, y: 100, width: 40, height: 60 },
];

// -----------------------------------------------------------------------------
// Timing
// -----------------------------------------------------------------------------

// Largest frame time (in seconds) we trust. A bigger dt is probably a
// tab switch or a freeze, not real gameplay, so it gets cut down to this.
// It's a safety limit, not a smoothness limit.
// Note: restThreshold below depends on this. Changing it changes that too.
const MAX_DT = 0.1;

// -----------------------------------------------------------------------------
// Movement tuning
// -----------------------------------------------------------------------------

// Max speed in px/s, in ANY direction. Enforced on the whole velocity
// arrow (not per axis), so diagonals can't go faster.
const topSpeed = 150;

// px/s² — how many px/s the square GAINS per second while a key is held.
// 400 means 0 → 150 px/s in about 0.375 s.
const acceleration = 400;

// px/s² — how many px/s the square LOSES per second on an axis with no input.
// Constant slowdown, applied only when not pushing on that axis.
// Also why bounces die fast: after a 90 px/s bounce, friction stops it in ~13 px.
const friction = 300;

// -----------------------------------------------------------------------------
// Collision tuning (shared by walls AND every obstacle)
// -----------------------------------------------------------------------------

// No unit (a fraction). How much speed survives a hit.
// 0 = dead stop, 1 = perfect bounce, 0.6 = comes back at 60% speed.
// Leaning into a surface at top speed: 150 → 90 → 54 → 32.4 → rest (3 bounces).
const bounciness = 0.6;

// px/s — hits slower than this REST against the surface instead of bouncing.
// Must be above the most speed ONE frame of pushing can add (acceleration × MAX_DT
// = 40 px/s), or leaning on a wall becomes 240 invisible bounces per second.
// Derived, not typed in, so it follows if acceleration or MAX_DT change.
// × 1.1 = safety margin, since floats near the boundary can land on either side.
const restThreshold = acceleration * MAX_DT * 1.1;

// -----------------------------------------------------------------------------
// Colors
// -----------------------------------------------------------------------------

const squareColor = "red";
const obstacleColor = "green";
const obstacleHitColor = "blue";

// -----------------------------------------------------------------------------
// Physical state: REMEMBERED between frames
// Nothing outside the game knows these, so these variables ARE the truth.
// -----------------------------------------------------------------------------

// Square's top-left corner (px). y grows downward.
let x = 0;
let y = 0;

// How fast the square is moving right now (px/s). Carries over between
// frames, which is what gives the square weight (inertia).
let velocityX = 0;
let velocityY = 0;

// -----------------------------------------------------------------------------
// Per-frame values: RECOMPUTED every frame, never trusted from last frame
// -----------------------------------------------------------------------------

// Push from the player this frame (px/s²). Built fresh from keysPressed.
let accelX = 0;
let accelY = 0;

// Timestamp of the previous frame (ms). Lives outside gameLoop() so it
// survives between frames. Undefined until the very first frame.
let lastTime;

// =============================================================================
// Input
// =============================================================================

// The ONE source of truth for input. Listeners write it; the loop reads it.
const keysPressed = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
};

// Listeners ONLY record state. Moving the square here would stutter,
// because the OS waits a moment before repeating a held key.
window.addEventListener("keydown", (e) => {
  if (e.key in keysPressed) {
    // Only block arrow keys (stops page scrolling).
    // Every other key, like F5 or Ctrl+R, still works.
    e.preventDefault();
    keysPressed[e.key] = true;
  }
});

window.addEventListener("keyup", (e) => {
  if (e.key in keysPressed) {
    keysPressed[e.key] = false;
  }
});

// If the window loses focus, any keyup that happens elsewhere never reaches
// this page, and a key would look "held" forever. So assume nothing is held.
// Wrong "released" fixes itself (key-repeat re-sends keydown);
// wrong "held" never does.
// blur > visibilitychange: clicking into DevTools fires blur without hiding the page.
function resetAllKeys() {
  for (const key in keysPressed) keysPressed[key] = false;
}

window.addEventListener("blur", resetAllKeys);

// Turn held keys into a push (acceleration), equally strong in all 8 directions.
// The direction decides WHERE the push points; `acceleration` decides HOW HARD.
function updateAcceleration() {
  const { ArrowDown, ArrowUp, ArrowLeft, ArrowRight } = keysPressed;

  // Raw input direction: each component is -1, 0, or 1.
  // Problem: a diagonal like (1, 1) has length √2 ≈ 1.41, not 1.
  const inputX = ArrowRight - ArrowLeft;
  const inputY = ArrowDown - ArrowUp;

  // The input arrow's length (Pythagoras).
  const inputLength = Math.sqrt(inputX * inputX + inputY * inputY);

  // Default to "no push".
  let dirX = 0;
  let dirY = 0;

  // Normalize: divide by the length so the arrow keeps its direction but has length 1.
  // Guard: with no keys held the length is 0, and 0 / 0 = NaN.
  // Once NaN gets into x or y, the square is gone for good.
  if (inputLength > 0) {
    dirX = inputX / inputLength;
    dirY = inputY / inputLength;
  }

  // Unit direction × strength. Units: (no unit) × px/s² = px/s².
  accelX = dirX * acceleration;
  accelY = dirY * acceleration;
}

// =============================================================================
// Velocity: push, friction, speed cap
// =============================================================================

// One axis of velocity. Takes the current velocity and push, returns the new velocity.
// Touches no globals, so the same function works for X and Y
// (no more mirrored copies to get out of sync).
//   - Pushing on this axis → speed up: velocity += accel × dt  (px/s² × s = px/s)
//   - Not pushing          → friction slows it toward 0, never past it.
function updateAxisVelocity(velocity, accel, deltaTime) {
  if (accel === 0) {
    // Which way is it moving? (+1 or -1). At rest (0) we pick +1;
    // the clamp below immediately puts it back to 0, so it stays still.
    const motionDir = velocity >= 0 ? 1 : -1;

    // Friction always pushes AGAINST the motion.
    const frictionAccel = -motionDir * friction;
    velocity += frictionAccel * deltaTime;

    // Did friction flip the sign, or land exactly on 0? Then it's stopped.
    // Without this, a near-zero velocity overshoots back and forth (jitter).
    if (Math.sign(velocity) !== motionDir) {
      velocity = 0;
    }
  } else {
    velocity += accel * deltaTime;
  }

  return velocity;
}

// Update the velocity COMPLETELY (push, friction, speed cap) before
// anything uses it to move. Otherwise the square moves at an unchecked speed.
function updateVelocity(deltaTime) {
  velocityX = updateAxisVelocity(velocityX, accelX, deltaTime);
  velocityY = updateAxisVelocity(velocityY, accelY, deltaTime);

  // Cap the WHOLE arrow, not each axis. Capping each axis separately
  // lets a diagonal reach topSpeed × √2 ≈ 212 px/s (the 03 bug, back again).
  // No zero guard needed: speed > topSpeed means speed > 0.
  const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
  if (speed > topSpeed) {
    // Same normalize trick as 03: keep the direction, set the length to topSpeed.
    velocityX = (velocityX / speed) * topSpeed;
    velocityY = (velocityY / speed) * topSpeed;
  }
}

// =============================================================================
// Collision helpers (pure: values in, values out)
// =============================================================================

// Do two 1D segments overlap? Half-open intervals: [a1, a2) and [b1, b2).
// Read it as: "each one starts before the other one ends."
// Touching (a2 === b1) is NOT overlapping, so a square resting flush against
// an obstacle doesn't count as inside it, and can slide along it smoothly.
// (Derived from "separated" = (a2 <= b1) || (b2 <= a1), then De Morgan.)
function segmentsOverlap(a1, a2, b1, b2) {
  return b1 < a2 && a1 < b2;
}

// Two rectangles overlap only if they overlap on X AND on Y at the same time.
// A gap on either axis = not touching (e.g. floating above an obstacle).
function rectsOverlap(a, b) {
  return (
    segmentsOverlap(a.xStart, a.xEnd, b.xStart, b.xEnd) &&
    segmentsOverlap(a.yStart, a.yEnd, b.yStart, b.yEnd)
  );
}

// Turn { x, y, width, height } into half-open intervals on each axis.
// One function for the square AND every obstacle: they're all rectangles.
// Extra fields (like `name`) are ignored by the destructuring.
// No default for height: a missing height should show up as a bug (NaN → never
// overlaps), not silently turn a box into a square.
function getBounds({ x, y, width, height }) {
  return {
    xStart: x,
    xEnd: x + width,
    yStart: y,
    yEnd: y + height,
  };
}

// The shared hit response, for walls AND obstacles. Answers both questions:
//   1. WHERE is it?      → clamp pos into [minLimit, maxLimit].
//   2. HOW is it moving? → slow hit (< restThreshold): rest → 0.
//                          real hit: flip direction, lose energy → bounce.
// Clamping throws away the overshoot. At these speeds that's a fraction of a pixel.
function restOrBounce(pos, vel, minLimit, maxLimit) {
  vel = Math.abs(vel) < restThreshold ? 0 : -vel * bounciness;

  // Clamp: Math.max(low, Math.min(high, value)) forces value into [low, high].
  pos = Math.max(minLimit, Math.min(maxLimit, pos));

  return { pos, vel };
}

// Push the square out of ONE obstacle on ONE axis, after that axis's move
// caused an overlap. The obstacle's face acts as a temporary wall:
// reuse restOrBounce with a shifted range.
//   - Moving + (right/down) → came in through the obstacle's START face.
//     Square's FAR edge goes on that face: pos = obstaclePos - size.
//     (pos is the square's NEAR edge, so subtract its size. Same idea as rightLimit.)
//   - Moving − (left/up)    → came in through the obstacle's END face.
//     Square's NEAR edge goes on that face: pos = obstaclePos + obstacleSize.
//
// Only ONE end of the clamp matters (the face it came through), but a clamp
// needs two. outerMin / outerMax fill the other end with "no limit on this side":
// the wall limit, which the square is already inside (walls were checked first),
// so it never triggers. -Infinity / Infinity would work the same way.
//
// Velocity 0 can't cause an overlap (nothing moved), so leave it alone.
function resolveObstacleCollision(
  pos,
  vel,
  size,
  obstaclePos,
  obstacleSize,
  outerMin,
  outerMax,
) {
  if (vel > 0) {
    const obstacleStartLimit = obstaclePos - size;
    return restOrBounce(pos, vel, outerMin, obstacleStartLimit);
  }

  if (vel < 0) {
    const obstacleEndLimit = obstaclePos + obstacleSize;
    return restOrBounce(pos, vel, obstacleEndLimit, outerMax);
  }

  return { pos, vel };
}

// =============================================================================
// Movement + collision
// =============================================================================

// One axis: move, then check that axis's walls.
// Returns BOTH new position and velocity as one object { pos, vel }.
// Every collision function returns this SAME shape. Two different shapes
// once meant reading .pos → undefined → NaN → square gone.
function moveAndCollideAxis(pos, vel, minLimit, maxLimit, deltaTime) {
  // Units: px/s × s = px.
  pos += vel * deltaTime;

  if (pos < minLimit || pos > maxLimit) {
    ({ pos, vel } = restOrBounce(pos, vel, minLimit, maxLimit));
  }

  return { pos, vel };
}

// Move ONE AXIS AT A TIME, checking every obstacle after each:
//   move X → walls → each obstacle: overlap? → fix X
//   move Y → walls → each obstacle: overlap? → fix Y
//
// Why one axis at a time: last frame the square wasn't overlapping. If only x
// changed and now it overlaps, the X move caused it, so we know which face it
// came through (sign of velocityX). Same for Y.
//
// Many obstacles: the square's bounds are rebuilt for EVERY obstacle check,
// so after being pushed out of box A, box B is checked against the corrected
// position, not one that no longer exists.
//
// Corners: if both axes cross into an obstacle in the same frame, the X move
// alone doesn't overlap yet (y isn't inside). The Y check completes it, so
// exact-corner hits resolve on the top/bottom. Y wins because it moves SECOND.
//
// Walls before obstacles is safe: for a wall bounce to flip the velocity right
// before an obstacle check reads it, the square would have to hit the wall AND
// overlap a box in the same step, i.e. sit in a gap smaller than itself.
// (Tested with a box 10 px from the wall: nothing odd.)
//
// Returns { hitObstacles }: a Set of the obstacle OBJECTS touched or pressed into
// this frame. Includes RESTING against one (pushing in every frame), not just
// bounces. First come, first served: across a seam, the first box pushes the
// square out, so the second box only touches and isn't recorded.
function moveAndCollide(deltaTime) {
  const hitObstacles = new Set();

  // One axis of movement + collision, shared by X and Y.
  // The call sites pass in only what DIFFERS between the axes:
  //   minLimit / maxLimit           → that axis's walls
  //   getObstaclePos / getObstacleSize → which obstacle fields to read
  //   makeSquare(pos)               → the square's rectangle, with THIS axis taken
  //                                   from the fresh local `pos` and the OTHER axis
  //                                   from the global (read when called, so in the
  //                                   Y pass it already sees the updated x)
  function stepAxis({
    pos,
    vel,
    minLimit,
    maxLimit,
    getObstaclePos,
    getObstacleSize,
    makeSquare,
  }) {
    ({ pos, vel } = moveAndCollideAxis(
      pos,
      vel,
      minLimit,
      maxLimit,
      deltaTime,
    ));

    for (const obstacle of obstacleList) {
      const squareBounds = getBounds(makeSquare(pos));

      if (rectsOverlap(squareBounds, getBounds(obstacle))) {
        hitObstacles.add(obstacle);
        ({ pos, vel } = resolveObstacleCollision(
          pos,
          vel,
          squareSide,
          getObstaclePos(obstacle),
          getObstacleSize(obstacle),
          minLimit,
          maxLimit,
        ));
      }
    }

    return { pos, vel };
  }

  // --- X axis ---
  ({ pos: x, vel: velocityX } = stepAxis({
    pos: x,
    vel: velocityX,
    minLimit: leftLimit,
    maxLimit: rightLimit,
    getObstaclePos: (obs) => obs.x,
    getObstacleSize: (obs) => obs.width,
    makeSquare: (pos) => ({ x: pos, y, width: squareSide, height: squareSide }),
  }));

  // --- Y axis ---
  ({ pos: y, vel: velocityY } = stepAxis({
    pos: y,
    vel: velocityY,
    minLimit: topLimit,
    maxLimit: bottomLimit,
    getObstaclePos: (obs) => obs.y,
    getObstacleSize: (obs) => obs.height,
    makeSquare: (pos) => ({ x, y: pos, width: squareSide, height: squareSide }),
  }));

  return { hitObstacles };
}

// =============================================================================
// Drawing (no game logic in here)
// =============================================================================

function drawShape(posX, posY, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(posX, posY, width, height);
}

// Draw one full frame. Physics reports FACTS (the Set of hit obstacles);
// drawing decides what they LOOK like. Drawing only READS: nothing is written
// back into obstacleList, so level data never mixes with per-frame state.
// Draw order = layering: later shapes go on top, so the square is drawn last.
function drawScene(hitObstacles) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  for (const obstacle of obstacleList) {
    const color = hitObstacles.has(obstacle) ? obstacleHitColor : obstacleColor;
    drawShape(obstacle.x, obstacle.y, obstacle.width, obstacle.height, color);
  }

  drawShape(x, y, squareSide, squareSide, squareColor);
}

// =============================================================================
// Game loop
// =============================================================================

// Fixed order every frame: input → velocity → move & collide → draw.
// Each step finishes before the next one reads its result.
// timestamp: ms since the page loaded, passed in by requestAnimationFrame.
function gameLoop(timestamp) {
  // First frame has no previous timestamp, so dt = 0 (no jump at startup).
  if (lastTime === undefined) {
    lastTime = timestamp;
  }

  // dt = how long THIS frame took, in seconds (ms / 1000).
  // Capped at MAX_DT: browsers pause this loop in hidden tabs, so the first
  // frame back can claim several seconds passed and teleport the square.
  const deltaTime = Math.min((timestamp - lastTime) / 1000, MAX_DT);
  lastTime = timestamp;

  updateAcceleration();
  updateVelocity(deltaTime);
  const { hitObstacles } = moveAndCollide(deltaTime);
  drawScene(hitObstacles);

  // Ask the browser to call gameLoop() again before the next screen repaint.
  requestAnimationFrame(gameLoop);
}

// Kick off the loop.
requestAnimationFrame(gameLoop);
