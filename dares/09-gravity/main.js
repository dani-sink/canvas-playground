// =============================================================================
// 09 – gravity: side view. Gravity pulls down, floors hold you up, Up = jump.
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
// The bottom wall is the floor.
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
//
// With gravity, the TOP of every box is a floor you can stand on.
// Reach check: standing on the floor, the square's top is at 270. A 100 px jump
// lifts it to ~170, so a box top must be at y ≥ ~200 to land on from the floor.
// -----------------------------------------------------------------------------

const obstacleList = [
  // Wide and flat, top at 220: reachable from the floor (needs 80 px of rise),
  // and low enough that a jump from the floor bonks its underside (240).
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
  // The square spawns above it at (0, 0) and lands on its top.
  { name: "Box", x: 10, y: 100, width: 40, height: 60 },
];

// -----------------------------------------------------------------------------
// Timing
// -----------------------------------------------------------------------------

// Largest frame time (in seconds) we trust. A bigger dt is probably a
// tab switch or a freeze, not real gameplay, so it gets cut down to this.
//
// Also the TUNNELING guard. To skip a box entirely, one step must carry the
// square from fully above it to fully below it: step > thickness + squareSide.
// Thinnest box = 20 px → limit = 50 px.
//   terminalVelocity × MAX_DT = 600 / 30 = 20 px → safe.
//   (At MAX_DT = 0.1 it was 60 px → a lag spike could fall through a platform.)
// Cost: below 30 fps the game runs in slow motion instead of teleporting.
//
// restThresholdX / restThresholdY are derived from this, so they follow it.
const MAX_DT = 1 / 30;

// -----------------------------------------------------------------------------
// Vertical tuning: gravity and jump
// -----------------------------------------------------------------------------

// The two FEEL values. Pick these; everything vertical is derived from them.
const jumpHeight = 100; // px: how high a jump rises
const timeToApex = 0.4; // s: how long it takes to get there

// px/s². Rising to the peak is the mirror of falling from it (from rest):
// h = ½·g·t²  →  g = 2h / t²  = 2·100 / 0.4² = 1250.
// (A "realistic" 9.8 m/s² with a 30 px = 1 m square would be ~294 px/s².
// Games usually go 3–4× stronger: real falls look floaty on screen.)
const gravity = (2 * jumpHeight) / timeToApex ** 2;

// px/s, a MAGNITUDE (positive). The jump applies the direction: velocityY = -jumpSpeed
// (y grows downward, so up is negative). v = g·t = 1250 · 0.4 = 500.
// Cross-check with stopping distance: v² / 2g = 500² / 2500 = 100 px. ✓
const jumpSpeed = gravity * timeToApex;

// px/s. Max FALL speed (only caps downward motion; the jump is never capped).
// Above jumpSpeed (500), so a normal jump's fall back down isn't cut short.
// Also bounds the biggest vertical step (see MAX_DT): 600 × 1/30 = 20 px.
const terminalVelocity = 600;

// -----------------------------------------------------------------------------
// Horizontal tuning: running
// -----------------------------------------------------------------------------

// px/s. Max HORIZONTAL speed. Only velocityX is capped: capping the whole arrow
// would cut the 500 px/s jump to 150, and would slow your run while falling.
const topSpeed = 150;

// px/s² — how many px/s the square GAINS per second while Left/Right is held.
// 400 means 0 → 150 px/s in about 0.375 s.
const acceleration = 400;

// px/s² — how many px/s the square LOSES per second when not pushing Left/Right.
// Horizontal only: gravity always pulls on Y, so Y never gets friction.
// Currently applies in the air too (air control/friction: parked for later).
const friction = 300;

// -----------------------------------------------------------------------------
// Collision tuning, PER AXIS (walls AND every obstacle)
// -----------------------------------------------------------------------------

// No unit (a fraction). How much speed survives a hit.
// 0 = dead stop, 1 = perfect bounce, 0.6 = comes back at 60% speed.
// Hitting a wall sideways and landing on a floor are different events:
//   X: springy walls. Leaning in at top speed: 150 → 90 → 54 → rest.
//   Y: solid floors and ceilings. Landing stops dead; a ceiling hit kills the
//      upward speed and gravity pulls you back down (head bonk).
//      (At 0.6 a landing looked like a rubber ball: 6 hops, and grounded was only
//      true for one frame per hop, so jumps would randomly fail.)
const bouncinessX = 0.6;
const bouncinessY = 0;

// px/s — hits slower than this REST against the surface instead of bouncing.
// Must be above the most speed ONE frame of the axis's strongest force can add,
// or resting against a surface turns into invisible bounces every frame.
// One shared threshold big enough for gravity would make gentle wall hits
// stop dead, so each axis gets its own, derived from its own force.
// × 1.1 = safety margin, since floats near the boundary can land on either side.
//   X: acceleration × MAX_DT × 1.1 = 400 / 30 × 1.1 ≈ 14.7 px/s
//   Y: gravity      × MAX_DT × 1.1 = 1250 / 30 × 1.1 ≈ 45.8 px/s
//      (With bouncinessY = 0 both branches give 0, so this only matters if
//      landings ever get a small bounce. Kept so that stays a one-number change.)
const restThresholdX = acceleration * MAX_DT * 1.1;
const restThresholdY = gravity * MAX_DT * 1.1;

// -----------------------------------------------------------------------------
// Colors
// -----------------------------------------------------------------------------

const squareColor = "red";
const obstacleColor = "green";
const obstacleHitColor = "blue";

// -----------------------------------------------------------------------------
// State: REMEMBERED between frames
// Nothing outside the game knows these, so these variables ARE the truth.
// -----------------------------------------------------------------------------

// Square's top-left corner (px). y grows downward. Spawns in the top-left corner
// and falls.
let x = 0;
let y = 0;

// How fast the square is moving right now (px/s). Carries over between
// frames, which is what gives the square weight (inertia).
let velocityX = 0;
let velocityY = 0;

// Was the square standing on something (floor or a box top) at the end of the
// last frame? Written by moveAndCollide, read by the jump in the NEXT frame.
// Not stale: nothing moves between the end of one frame and the start of the
// next, so "grounded at the end of last frame" = "grounded right now".
let isGrounded = false;

// Was Up HELD last frame? Needed to tell "held" (a state) from "just pressed"
// (an event): just pressed = held now AND not held last frame.
let wasUpHeld = false;

// Timestamp of the previous frame (ms). Undefined until the very first frame.
let lastTime;

// -----------------------------------------------------------------------------
// Per-frame values: RECOMPUTED every frame, never trusted from last frame
// -----------------------------------------------------------------------------

// Horizontal push from the player this frame (px/s²). Built fresh from keysPressed.
let accelX = 0;

// =============================================================================
// Input
// =============================================================================

// The ONE source of truth for input. Listeners write it; the loop reads it.
// Left/Right = run, Up = jump. Down is unused for now.
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

// Turn Left/Right into a horizontal push.
// Only one input axis now, so the direction is already -1, 0, or 1 (length 0
// or 1). The normalization from 03 isn't needed anymore.
function updateAcceleration() {
  const { ArrowLeft, ArrowRight } = keysPressed;

  // Direction: -1 (left), 0 (none or both), or 1 (right).
  const inputX = ArrowRight - ArrowLeft;

  // Direction × strength. Units: (no unit) × px/s² = px/s².
  accelX = inputX * acceleration;
}

// =============================================================================
// Velocity: push, friction, gravity, jump, speed caps
// =============================================================================

// Horizontal velocity for one frame. Takes the current velocity and push,
// returns the new velocity. Touches no globals.
//   - Pushing → speed up: velocity += accel × dt  (px/s² × s = px/s)
//   - Not pushing → friction slows it toward 0, never past it.
function updateAxisVelocity(velocity, accel, deltaTime) {
  if (accel === 0) {
    // Which way is it moving? (+1 or -1). At rest (0) we pick +1;
    // the check below immediately puts it back to 0, so it stays still.
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

// Update the velocity COMPLETELY before anything uses it to move.
// Otherwise the square moves at an unchecked speed.
function updateVelocity(deltaTime) {
  // --- Horizontal: push/friction, then clamp to ±topSpeed. ---
  velocityX = Math.max(
    -topSpeed,
    Math.min(updateAxisVelocity(velocityX, accelX, deltaTime), topSpeed),
  );

  // --- Vertical: jump OR gravity. ---
  // Jump only on the frame Up goes from released to held, and only if grounded
  // (as of the end of last frame). Holding Up = one jump, not a pogo stick.
  const { ArrowUp } = keysPressed;
  const justPressedUp = ArrowUp && !wasUpHeld;

  if (justPressedUp && isGrounded) {
    // Instant upward launch. Gravity takes over from the next frame.
    velocityY = -jumpSpeed;
  } else {
    // Gravity every frame, capped at terminal velocity (downward only).
    velocityY = Math.min(velocityY + gravity * deltaTime, terminalVelocity);
  }

  // Updated EVERY frame, in the air too, so a press made while falling
  // doesn't still look "new" after landing.
  wasUpHeld = ArrowUp;
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

// The shared hit response, for walls AND obstacles, on either axis.
// Answers both questions:
//   1. WHERE is it?      → clamp pos into [minLimit, maxLimit].
//   2. HOW is it moving? → slow hit (< restThreshold): rest → 0.
//                          real hit: flip direction, keep `bounciness` of the speed.
// The axis's restThreshold and bounciness are passed in EXPLICITLY.
// (Leaving one out once silently skipped the velocity change: the square
// "stood" on the floor while still falling at 600 px/s.)
// Clamping throws away the overshoot. At these speeds that's a fraction of a pixel.
function restOrBounce(pos, vel, minLimit, maxLimit, restThreshold, bounciness) {
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
//     On Y, this is LANDING on the box's top.
//   - Moving − (left/up)    → came in through the obstacle's END face.
//     Square's NEAR edge goes on that face: pos = obstaclePos + obstacleSize.
//     On Y, this is a HEAD BONK on the box's underside.
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
  restThreshold,
  bounciness,
) {
  if (vel > 0) {
    const obstacleStartLimit = obstaclePos - size;
    return restOrBounce(
      pos,
      vel,
      outerMin,
      obstacleStartLimit,
      restThreshold,
      bounciness,
    );
  }

  if (vel < 0) {
    const obstacleEndLimit = obstaclePos + obstacleSize;
    return restOrBounce(
      pos,
      vel,
      obstacleEndLimit,
      outerMax,
      restThreshold,
      bounciness,
    );
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
function moveAndCollideAxis(
  pos,
  vel,
  minLimit,
  maxLimit,
  deltaTime,
  restThreshold,
  bounciness,
) {
  // Units: px/s × s = px.
  pos += vel * deltaTime;

  if (pos < minLimit || pos > maxLimit) {
    ({ pos, vel } = restOrBounce(
      pos,
      vel,
      minLimit,
      maxLimit,
      restThreshold,
      bounciness,
    ));
  }

  return { pos, vel };
}

// Move ONE AXIS AT A TIME, checking every obstacle after each:
//   move X → walls → each obstacle: overlap? → fix X
//   move Y → walls → each obstacle: overlap? → fix Y (and detect landing)
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
//
// Grounded: recomputed here every frame. True only when the Y pass pushed the
// square UP out of something (the floor or a box top). Ceiling bonks push it
// down, side hits are on X, so neither counts. Resting on a floor counts every
// frame: gravity nudges it in, the clamp pushes it back up.
//
// Returns { hitObstacles }: a Set of the obstacle OBJECTS touched or pressed into
// this frame. Includes RESTING on one (pressing in every frame), not just hits.
// First come, first served: across a seam, the first box pushes the square out,
// so the second box only touches and isn't recorded.
function moveAndCollide(deltaTime) {
  const hitObstacles = new Set();
  isGrounded = false;

  // One axis of movement + collision, shared by X and Y.
  // The call sites pass in only what DIFFERS between the axes:
  //   minLimit / maxLimit              → that axis's walls
  //   restThreshold / bounciness       → how that axis responds to a hit
  //   getObstaclePos / getObstacleSize → which obstacle fields to read
  //   makeSquare(pos)                  → the square's rectangle, with THIS axis
  //                                      from the fresh local `pos` and the OTHER
  //                                      axis from the global (read when called,
  //                                      so in the Y pass it sees the updated x)
  //   onLanded (optional, Y only)      → called when pushed UP out of something
  function stepAxis({
    pos,
    vel,
    minLimit,
    maxLimit,
    restThreshold,
    bounciness,
    getObstaclePos,
    getObstacleSize,
    makeSquare,
    onLanded,
  }) {
    // Where the square would end up with nothing in the way.
    const intendedPos = pos + vel * deltaTime;

    ({ pos, vel } = moveAndCollideAxis(
      pos,
      vel,
      minLimit,
      maxLimit,
      deltaTime,
      restThreshold,
      bounciness,
    ));

    // Ended up ABOVE where it was heading → a wall pushed it up → the floor.
    if (pos < intendedPos && onLanded) {
      onLanded();
    }

    for (const obstacle of obstacleList) {
      const squareBounds = getBounds(makeSquare(pos));

      if (rectsOverlap(squareBounds, getBounds(obstacle))) {
        hitObstacles.add(obstacle);

        const posBeforeResolve = pos;

        ({ pos, vel } = resolveObstacleCollision(
          pos,
          vel,
          squareSide,
          getObstaclePos(obstacle),
          getObstacleSize(obstacle),
          minLimit,
          maxLimit,
          restThreshold,
          bounciness,
        ));

        // Pushed UP out of the box → landed on its top.
        if (pos < posBeforeResolve && onLanded) {
          onLanded();
        }
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
    restThreshold: restThresholdX,
    bounciness: bouncinessX,
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
    restThreshold: restThresholdY,
    bounciness: bouncinessY,
    getObstaclePos: (obs) => obs.y,
    getObstacleSize: (obs) => obs.height,
    makeSquare: (pos) => ({ x, y: pos, width: squareSide, height: squareSide }),
    onLanded: () => {
      isGrounded = true;
    },
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
// The jump (in updateVelocity) reads isGrounded from the END of last frame's
// moveAndCollide, since this frame's collisions haven't run yet.
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
