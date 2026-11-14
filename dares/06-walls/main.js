// Grab the canvas and its 2D drawing context. All drawing goes through ctx.
const canvas = document.getElementById("my-canvas");
const ctx = canvas.getContext("2d");

// Named sizes: resizing the canvas or square only means editing one line.
const canvasWidth = canvas.width;
const canvasHeight = canvas.height;
const squareSide = 30;

// --- Walls ---
// Limits for the square's TOP-LEFT corner so the WHOLE square stays visible.
// (Wrapping in 05 allowed -squareSide..canvasWidth, partly off screen.
// Solid walls need fully on screen, so subtract the square's size on the far side.)
// Computed once: they only depend on constants.
const leftLimit = 0;
const rightLimit = canvasWidth - squareSide;
const topLimit = 0;
const bottomLimit = canvasHeight - squareSide;

// Largest frame time (in seconds) we trust. A bigger dt is probably a
// tab switch or a freeze, not real gameplay, so it gets cut down to this.
// It's a safety limit, not a smoothness limit.
// Note: restThreshold below depends on this. Changing it changes that too.
const MAX_DT = 0.1;

// --- Movement tuning ---

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

// No unit (a fraction). How much speed survives a wall hit.
// 0 = dead stop, 1 = perfect bounce, 0.6 = comes back at 60% speed.
// Leaning on a wall at top speed: 150 → 90 → 54 → 32.4 → rest (3 bounces).
const bounciness = 0.6;

// px/s — hits slower than this REST against the wall instead of bouncing.
// Must be above the most speed ONE frame of pushing can add (acceleration × MAX_DT
// = 40 px/s), or leaning on a wall becomes 240 invisible bounces per second.
// Derived, not typed in, so it follows if acceleration or MAX_DT change.
// × 1.1 = safety margin, since floats near the boundary can land on either side.
const restThreshold = acceleration * MAX_DT * 1.1;

// --- Physical state: REMEMBERED between frames ---
// Nothing outside the game knows these, so these variables ARE the truth.

// Square's top-left corner (px). y grows downward.
let x = 0;
let y = 0;

// How fast the square is moving right now (px/s). Carries over between
// frames, which is what gives the square weight (inertia).
let velocityX = 0;
let velocityY = 0;

// --- Per-frame values: RECOMPUTED every frame, never trusted from last frame ---

// Push from the player this frame (px/s²). Built fresh from keysPressed.
let accelX = 0;
let accelY = 0;

// Timestamp of the previous frame (ms). Lives outside gameLoop() so it
// survives between frames. Undefined until the very first frame.
let lastTime;

// --- Input ---

// The ONE source of truth for input. Listeners write it; the loop reads it.
const keysPressed = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
};

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

// --- Velocity: push, friction, speed cap ---

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

// --- Movement + walls ---

// One axis of movement + wall collision. Returns BOTH new position and new
// velocity as an object, since a JS function can only return one thing.
// Touches no globals (besides tuning constants), so it works for X and Y.
//
// A wall hit answers two separate questions:
//   1. WHERE is it?   → clamp back inside, so it never sits in the wall.
//   2. HOW is it moving? → otherwise velocity still points into the wall.
//      - Slow hit (< restThreshold): it's resting against the wall → 0.
//      - Real hit: flip direction and lose some energy → bounce.
// Clamping throws away the overshoot. At these speeds that's a fraction of a pixel.
function moveAndCollideAxis(pos, vel, minLimit, maxLimit, deltaTime) {
  // Units: px/s × s = px.
  pos += vel * deltaTime;

  if (pos < minLimit || pos > maxLimit) {
    vel = Math.abs(vel) < restThreshold ? 0 : -vel * bounciness;

    // Clamp: Math.max(low, Math.min(high, value)) forces value into [low, high].
    pos = Math.max(minLimit, Math.min(maxLimit, pos));
  }

  return { pos, vel };
}

// Move, THEN check walls: you can only detect a hit after moving.
// A bounce changes velocity here, after it was used. That's fine:
// the new velocity is what next frame starts from.
// Axes are independent, so in a corner each one bounces and settles on its own.
function moveAndCollide(deltaTime) {
  const nextX = moveAndCollideAxis(
    x,
    velocityX,
    leftLimit,
    rightLimit,
    deltaTime,
  );
  x = nextX.pos;
  velocityX = nextX.vel;

  const nextY = moveAndCollideAxis(
    y,
    velocityY,
    topLimit,
    bottomLimit,
    deltaTime,
  );
  y = nextY.pos;
  velocityY = nextY.vel;
}

// --- Drawing ---

// Drawing only: no game logic in here.
function drawSquare(posX, posY) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = "red";
  ctx.fillRect(posX, posY, squareSide, squareSide);
}

// --- Game loop ---

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
  moveAndCollide(deltaTime);
  drawSquare(x, y);

  // Ask the browser to call gameLoop() again before the next screen repaint.
  requestAnimationFrame(gameLoop);
}

// Kick off the loop.
requestAnimationFrame(gameLoop);
