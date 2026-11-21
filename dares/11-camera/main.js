// =============================================================================
// 11 – camera: a world bigger than the screen, and a camera that follows.
// Two coordinate systems:
//   WORLD  = where things are (physics, collisions, level data)
//   SCREEN = where things are drawn (the canvas)
// The camera connects them. Physics never knows the camera exists.
// Frame order: input → velocity → move & collide → camera → draw
// =============================================================================

// Grab the canvas and its 2D drawing context. All drawing goes through ctx.
const canvas = document.getElementById("my-canvas");
const ctx = canvas.getContext("2d");

// Naming: UPPER_CASE = engine/safety limit (MAX_DT). camelCase = tuning values.

// -----------------------------------------------------------------------------
// Screen (px): the canvas, i.e. the window you look through.
// Used for: clearing each frame, centering and clamping the camera.
// -----------------------------------------------------------------------------

const canvasWidth = canvas.width;
const canvasHeight = canvas.height;

// -----------------------------------------------------------------------------
// World (px): the level. Bigger than the screen; only a slice is visible.
// Everything here depends only on constants → computed once.
// -----------------------------------------------------------------------------

const worldWidth = 2000; // 5 screens wide
const worldHeight = 300; // same as the screen for now (no vertical camera yet)
const squareSide = 30;

// Walls: limits for the square's TOP-LEFT corner so the WHOLE square stays
// inside the WORLD (not the screen: most of the world is off screen).
// x is the square's LEFT edge, so on the far side subtract its size.
// The bottom wall is the floor; the top wall is a ceiling (the world is only
// 300 px tall, so jumps from high platforms can bonk it).
const leftLimit = 0;
const rightLimit = worldWidth - squareSide;
const topLimit = 0;
const bottomLimit = worldHeight - squareSide;

// -----------------------------------------------------------------------------
// Level: the room is DATA, not code. All positions are WORLD coordinates
// (x from 0 to worldWidth); where they appear on screen is the camera's job.
// Each obstacle stores ONE form: { x, y, width, height } (top-left + size).
// The start/end form for overlap tests is derived on demand with getBounds(),
// so the two forms can never disagree.
// Adding a box = adding one line here. No logic changes.
// `name` is only a debug label (e.g. console.log(obstacle.name)); no logic uses it.
// Obstacles are identified by the object itself, so duplicate names are harmless.
//
// With gravity, the TOP of every box is a floor you can stand on.
// Reach check: a full jump rises ~100 px and stays in the air ~0.8 s
// (~120 px sideways at 150 px/s). From the floor (square top at 270),
// a box top must be at y ≥ ~200 to land on it.
//
// Level design is "playable, not polished" for now. Known rough spots are
// marked with NOTE.
// -----------------------------------------------------------------------------

const obstacleList = [
  // =========================================================================
  // ZONE 1: Physics & Edge-Case Sandbox (x: 0 - 350) [Original Obstacles]
  // =========================================================================
  { name: "Platform", x: 40, y: 220, width: 160, height: 20 },
  { name: "Pillar", x: 120, y: 40, width: 30, height: 120 },

  // Tight 29 px corridor (square is 30 px, so it blocks cleanly)
  { name: "Corridor left", x: 220, y: 60, width: 40, height: 80 },
  { name: "Corridor right", x: 289, y: 60, width: 40, height: 80 },

  // Flush seam test at x = 290
  { name: "Tile A", x: 230, y: 200, width: 60, height: 20 },
  { name: "Tile B", x: 290, y: 200, width: 60, height: 20 },

  // 10 px left-wall gap test. The square spawns above it and lands on its top.
  { name: "Box", x: 10, y: 100, width: 40, height: 60 },

  // =========================================================================
  // ZONE 2: Ascending Staircase & Upper Ledge (x: 380 - 760)
  // Tests chaining jumps (+80 px per step, safely under the 100 px max rise)
  // =========================================================================
  { name: "Step 1", x: 390, y: 220, width: 90, height: 20 }, // 80 px above floor (300)
  { name: "Step 2", x: 510, y: 140, width: 90, height: 20 }, // 80 px above Step 1 (220)
  { name: "High Ledge", x: 630, y: 60, width: 130, height: 20 }, // 80 px above Step 2 (140)

  // Low floor blocker under High Ledge (requires jumping over, 80 px tall)
  { name: "Floor Block", x: 660, y: 220, width: 60, height: 80 },

  // =========================================================================
  // ZONE 3: Split Route — High Road vs. Low Tunnel (x: 800 - 1180)
  // =========================================================================
  // Lower route: Floor -> Mid Block (y: 210) -> Low Ceiling Tunnel (38 px clearance)
  // NOTE: standing on Mid Block, the square overlaps the Tunnel Ceiling's height,
  // so you can't walk in. The way in is dropping down the 30 px slot between
  // Mid Block (ends 890) and the tunnel (starts 920) while holding Right.
  { name: "Mid Block", x: 810, y: 210, width: 80, height: 90 },
  { name: "Tunnel Ceiling", x: 920, y: 182, width: 160, height: 40 }, // Bottom at y = 222
  { name: "Tunnel Floor", x: 920, y: 260, width: 160, height: 40 }, // Top at y = 260 (38 px gap)

  // Upper route: Jump from High Ledge (y: 60) across gap to Floating Island
  { name: "Floating Island", x: 830, y: 80, width: 120, height: 20 },
  { name: "Upper Catwalk", x: 1000, y: 110, width: 140, height: 20 },

  // =========================================================================
  // ZONE 4: Stepping-Stone Climb (x: 1200 - 1590)
  // =========================================================================
  // Floor recovery climb + high-route continuation
  { name: "Stepping Stone 1", x: 1200, y: 210, width: 50, height: 20 }, // 90 px above floor
  // NOTE: Upper Catwalk → Stone 2 is a 170 px gap, ~15 px more than a full jump
  // covers (even with coyote time). Reachable from Stone 1, likely not from the Catwalk.
  { name: "Stepping Stone 2", x: 1310, y: 130, width: 50, height: 20 }, // 80 px above Stone 1
  { name: "Stepping Stone 3", x: 1420, y: 60, width: 50, height: 20 }, // 70 px above Stone 2
  { name: "Midway Rest", x: 1510, y: 150, width: 80, height: 20 }, // Safe landing bridge into Zone 5

  // =========================================================================
  // ZONE 5: Micro-Clearance Squeeze & Final Summit (x: 1620 - 2000)
  // =========================================================================
  // Tight 34 px horizontal slot (30 px square fits with 4 px margin).
  // NOTE: the entrance is a 4 px window (y 166–170). Sliding down the face while
  // holding Right gets in at 240 Hz (~1.4 px per frame) but can skip the window
  // at 60 Hz (~5.7 px per frame): frame-rate dependent.
  // NOTE: can be skipped by hopping onto Squeeze Top from Midway Rest (+14 px).
  // NOTE: leaving the slot needs coyote time: only 4 px headroom inside, so you
  // walk off the end (x ≥ 1740) and jump within 0.1 s.
  { name: "Squeeze Top", x: 1630, y: 136, width: 110, height: 30 }, // Bottom at y = 166
  { name: "Squeeze Bottom", x: 1630, y: 200, width: 110, height: 100 }, // Top at y = 200 (34 px gap; also jumpable from floor)

  // Final ascending climb to the Goal Tower
  { name: "Summit Step 1", x: 1780, y: 140, width: 65, height: 20 }, // 60 px above Squeeze Bottom (200)
  // NOTE: overhangs the Goal Platform by 10 px with only 10 px of space under it.
  { name: "Summit Step 2", x: 1875, y: 70, width: 55, height: 20 }, // 70 px above Summit Step 1 (140)

  // Final Goal Platform flush against the right world wall (x = 2000)
  { name: "Goal Platform", x: 1920, y: 100, width: 80, height: 200 },
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
const jumpHeight = 100; // px: how high a full (held) jump rises
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
// Jump forgiveness and control (game time, in seconds)
// -----------------------------------------------------------------------------

// Coyote time: you can still jump this long AFTER leaving the ground.
// Running off a ledge, people press jump a split second late.
// (Named after Wile E. Coyote hanging in mid-air before he notices the cliff.)
const coyoteTime = 0.1;

// Jump buffer: a jump pressed this long BEFORE landing still fires on landing.
// Falling toward the floor, people press jump a split second early.
const jumpBufferTime = 0.1;

// No unit. Releasing Up while rising multiplies the upward speed by this.
// Tap vs hold: a release right at launch leaves 500 × 0.5 = 250 px/s
// → rises 250² / 2500 = 25 px. Measured tap ≈ 29.6 px (a human tap lasts ~13 ms,
// so the square rises ~6 px at full speed before the cut). Full hold ≈ 101 px.
const jumpCutMultiplier = 0.5;

// -----------------------------------------------------------------------------
// Horizontal tuning: running (ground vs air)
// -----------------------------------------------------------------------------

// px/s. Max HORIZONTAL speed. Only velocityX is capped: capping the whole arrow
// would cut the 500 px/s jump to 150, and would slow your run while falling.
const topSpeed = 150;

// px/s² — how many px/s the square GAINS per second while Left/Right is held.
//   Ground: 0 → 150 in ~0.375 s. Tight, snappy.
//   Air:    0 → 150 in ~0.58 s.  You can steer mid-jump, just less sharply.
const groundAcceleration = 400;
const airAcceleration = 260;

// px/s² — how many px/s the square LOSES per second when not pushing Left/Right.
// Horizontal only: gravity always pulls on Y, so Y never gets friction.
//   Ground: from 150, stops in 150² / (2·300) = 37.5 px.
//   Air:    from 150, would coast 150² / (2·60) ≈ 187 px. Momentum carries
//           through a jump instead of braking like it's on the floor.
const groundFriction = 300;
const airFriction = 60;

// -----------------------------------------------------------------------------
// Collision tuning, PER AXIS (walls AND every obstacle)
// -----------------------------------------------------------------------------

// No unit (a fraction). How much speed survives a hit.
// 0 = dead stop, 1 = perfect bounce, 0.6 = comes back at 60% speed.
// Hitting a wall sideways and landing on a floor are different events:
//   X: springy walls. Leaning in at top speed: 150 → 90 → 54 → 32 → 19 → rest.
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
//   X: groundAcceleration × MAX_DT × 1.1 = 400 / 30 × 1.1 ≈ 14.7 px/s
//      (ground, not air: it's the STRONGER push, so it's the worst case)
//   Y: gravity × MAX_DT × 1.1 = 1250 / 30 × 1.1 ≈ 45.8 px/s
//      (With bouncinessY = 0 both branches give 0, so this only matters if
//      landings ever get a small bounce. Kept so that stays a one-number change.)
const restThresholdX = groundAcceleration * MAX_DT * 1.1;
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

// Square's top-left corner, in WORLD px. y grows downward.
// Spawns in the top-left corner of the world and falls onto Box.
let x = 0;
let y = 0;

// How fast the square is moving right now (px/s). Carries over between
// frames, which is what gives the square weight (inertia).
let velocityX = 0;
let velocityY = 0;

// Was the square standing on something (floor or a box top) at the end of the
// last frame? Written by moveAndCollide, read by updateAcceleration and
// updateVelocity in the NEXT frame.
// Not stale: nothing moves between the end of one frame and the start of the
// next, so "grounded at the end of last frame" = "grounded right now".
let isGrounded = false;

// Was Up HELD last frame? Needed to tell "held" (a state) from the events
// "just pressed" (held now, not before) and "just released" (held before, not now).
let wasUpHeld = false;

// Countdown timers (seconds of GAME time). They tick down by dt, so they freeze
// while the tab is hidden: time the game didn't experience doesn't count.
// (Timestamps would count real time and expire while you're on another tab.)
// Both start at 0: at startup nothing has happened yet. Starting the buffer at
// 0.1 would mean "Up was just pressed", and a square spawned on the floor
// would jump by itself.
let coyoteTimer = 0; // > 0 → allowed to jump (grounded, or just left the ground)
let jumpBufferTimer = 0; // > 0 → jump was pressed recently

// Timestamp of the previous frame (ms). Undefined until the very first frame.
let lastTime;

// -----------------------------------------------------------------------------
// Per-frame values: RECOMPUTED every frame, never trusted from last frame
// -----------------------------------------------------------------------------

// Horizontal push from the player this frame (px/s²). Built fresh from keysPressed.
let accelX = 0;

// The world x shown at the screen's LEFT edge (exact, may be fractional).
// screen x = world x − cameraX.
// Recomputed from the square's position every frame by updateCamera, so it
// remembers nothing yet. With camera smoothing it would become real
// remembered state (it would carry over and catch up over several frames).
let cameraX = 0;

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

// Turn Left/Right into a horizontal push, gentler in the air.
// Only one input axis, so the direction is already -1, 0, or 1 (length 0 or 1).
// The normalization from 03 isn't needed anymore.
function updateAcceleration() {
  const { ArrowLeft, ArrowRight } = keysPressed;

  // Direction: -1 (left), 0 (none or both), or 1 (right).
  const inputX = ArrowRight - ArrowLeft;

  // Direction × strength. Units: (no unit) × px/s² = px/s².
  const activeAcceleration = isGrounded ? groundAcceleration : airAcceleration;
  accelX = inputX * activeAcceleration;
}

// =============================================================================
// Velocity: push, friction, gravity, jump, speed caps
// =============================================================================

// Horizontal velocity for one frame. Takes the current velocity, push, and
// friction, returns the new velocity. Touches no globals.
//   - Pushing → speed up: velocity += accel × dt  (px/s² × s = px/s)
//   - Not pushing → friction slows it toward 0, never past it.
function updateAxisVelocity(velocity, accel, friction, deltaTime) {
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
// The jump is decided here, BEFORE moving, using last frame's isGrounded.
function updateVelocity(deltaTime) {
  // --- Horizontal: push/friction (ground or air), then clamp to ±topSpeed. ---
  const activeFriction = isGrounded ? groundFriction : airFriction;

  velocityX = Math.max(
    -topSpeed,
    Math.min(
      updateAxisVelocity(velocityX, accelX, activeFriction, deltaTime),
      topSpeed,
    ),
  );

  // --- Vertical: input events ---
  // "Held" is a state; "just pressed" and "just released" are one-frame events.
  const { ArrowUp } = keysPressed;
  const justPressedUp = ArrowUp && !wasUpHeld;
  const justReleasedUp = !ArrowUp && wasUpHeld;

  // --- Vertical: forgiveness timers ---
  // Coyote: refilled from a STATE (grounded), counts down in the air.
  coyoteTimer = isGrounded ? coyoteTime : Math.max(0, coyoteTimer - deltaTime);
  // Buffer: refilled from an EVENT (just pressed), counts down otherwise.
  // A HELD key never refills it, so holding Up through a landing doesn't jump.
  jumpBufferTimer = justPressedUp
    ? jumpBufferTime
    : Math.max(0, jumpBufferTimer - deltaTime);

  // --- Vertical: jump OR gravity ---
  // Jump = "pressed recently" (buffer) AND "allowed to jump" (coyote).
  // The buffer is "just pressed" stretched over 0.1 s, so justPressedUp
  // isn't needed here directly.
  if (jumpBufferTimer > 0 && coyoteTimer > 0) {
    // Instant upward launch. Gravity takes over from the next frame.
    // Full speed if Up is still HELD. If it's already released (a buffered tap
    // released in the air), start pre-cut: that release happened while falling,
    // so the cut below never saw it.
    velocityY = ArrowUp ? -jumpSpeed : -jumpSpeed * jumpCutMultiplier;

    // Use up BOTH windows that allowed this jump:
    jumpBufferTimer = 0; // the same press can't fire twice
    coyoteTimer = 0; // no second jump while the coyote window is still open
  } else {
    // Variable height: releasing Up while RISING cuts the jump short.
    // Only while rising: cutting a fall would make the square float (parachute).
    if (justReleasedUp && velocityY < 0) {
      velocityY *= jumpCutMultiplier;
    }

    // Gravity every frame, capped at terminal velocity (downward only).
    velocityY = Math.min(velocityY + gravity * deltaTime, terminalVelocity);
  }

  // Updated EVERY frame, in the air too, so events stay accurate.
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
// Movement + collision (all in WORLD coordinates; no camera here)
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
// Camera (connects WORLD to SCREEN)
// =============================================================================

// Keep the square's CENTER in the middle of the screen, without ever showing
// beyond the world's edges.
//   Square's center (world):  x + squareSide / 2
//   Want it at screen x:      canvasWidth / 2
//   screen = world − cameraX  →  cameraX = center − canvasWidth / 2
//   Check: x = 785 → center 800 → cameraX 600 → center on screen at 200. ✓
// Clamp to [0, worldWidth − canvasWidth]: 0 shows the first screen, the max
// shows the last one. Derived, so it follows if either size changes.
// Runs AFTER moveAndCollide: updating before the move would frame where the
// square WAS, leaving it one frame's movement off center (and twitching as
// speed changes).
function updateCamera() {
  const playerCenterX = x + squareSide / 2;
  const targetCameraX = playerCenterX - canvasWidth / 2;
  cameraX = Math.max(0, Math.min(targetCameraX, worldWidth - canvasWidth));
}

// =============================================================================
// Drawing (no game logic in here)
// =============================================================================

// Rounding here is DISPLAY ONLY: the physics keeps exact positions (785.37...),
// the picture snaps to whole pixels so edges stay crisp. Rounding the stored x
// instead would throw away the small per-frame movements delta time relies on.
function drawShape(posX, posY, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(posX), Math.round(posY), width, height);
}

// A ruler across the whole WORLD: a line every 100 px with its world x.
// Without a background reference, a moving camera with a centered square
// looks exactly like a frozen one.
// Lines at lineX + 0.5 land on a pixel's center, so a 1 px line stays crisp
// (only works because the camera translate is rounded to whole pixels).
// Drawn first, so obstacles cover the labels where they overlap.
function drawWorldRuler() {
  ctx.save();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.font = "11px monospace";
  ctx.lineWidth = 1;

  for (let lineX = 0; lineX <= worldWidth; lineX += 100) {
    // Vertical line
    ctx.beginPath();
    ctx.moveTo(lineX + 0.5, 0);
    ctx.lineTo(lineX + 0.5, worldHeight);
    ctx.stroke();

    // World x label near the bottom
    ctx.fillText(lineX, lineX + 0.5 + 4, worldHeight - 6);
  }

  ctx.restore();
}

// Draw one full frame. Physics reports FACTS (the Set of hit obstacles);
// drawing decides what they LOOK like. Drawing only READS: nothing is written
// back into obstacleList, so level data never mixes with per-frame state.
// Draw order = layering: later shapes go on top, so the square is drawn last.
function drawScene(hitObstacles) {
  // 1. Clear in SCREEN coordinates, BEFORE the translate. After it,
  //    (0, 0, canvasWidth, canvasHeight) would mean world 0–400: off screen
  //    once the camera moves, leaving smears.
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // 2. Shift the whole coordinate system by the camera, so everything below
  //    is drawn in plain WORLD coordinates (no "- cameraX" in any draw call).
  //    -Math.round(cameraX), not Math.round(-cameraX): Math.round rounds .5 UP,
  //    so the second form would round the camera opposite to Math.round(x) at
  //    exact .5 fractions and nudge the square 1 px off center.
  ctx.save();
  ctx.translate(-Math.round(cameraX), 0);

  drawWorldRuler();

  for (const obstacle of obstacleList) {
    const color = hitObstacles.has(obstacle) ? obstacleHitColor : obstacleColor;
    drawShape(obstacle.x, obstacle.y, obstacle.width, obstacle.height, color);
  }

  drawShape(x, y, squareSide, squareSide, squareColor);

  // 3. Undo the translate. translate ADDS to the current transform, so without
  //    restore the shifts would pile up frame after frame.
  ctx.restore();
}

// =============================================================================
// Game loop
// =============================================================================

// Fixed order every frame: input → velocity → move & collide → camera → draw.
// Each step finishes before the next one reads its result.
// updateAcceleration and updateVelocity read isGrounded from the END of last
// frame's moveAndCollide, since this frame's collisions haven't run yet.
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
  updateCamera();
  drawScene(hitObstacles);

  // Ask the browser to call gameLoop() again before the next screen repaint.
  requestAnimationFrame(gameLoop);
}

// Kick off the loop.
requestAnimationFrame(gameLoop);
