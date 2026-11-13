// Grab the canvas and its 2D drawing context. All drawing goes through ctx.
const canvas = document.getElementById("my-canvas");
const ctx = canvas.getContext("2d");

// Named sizes: resizing the canvas or square only means editing one line.
const canvas_width = canvas.width;
const canvas_height = canvas.height;

// Top-left corner of the square, in pixels. (0, 0) is the canvas's top-left;
// y grows DOWNWARD.
let x = 0;
let y = 60;

let square_side = 30;

// Pixels moved per frame. Frame-based, so a 144Hz screen runs this faster
// than a 60Hz one (still open).
const speed = 7;

function draw() {
  // Flip Book step 1: wipe the last frame, or the square smears.
  ctx.clearRect(0, 0, canvas_width, canvas_height);

  // Fully off the right edge? Jump back one lap to just off the left edge,
  // carrying the overshoot (x - canvas_width) so no distance is lost.
  // Use >=, not ===: speeds like 7 or 0.7 can skip right past the exact value.
  if (x >= canvas_width) {
    x = -square_side + (x - canvas_width);
  }

  // Flip Book step 2: update.
  x += speed;

  // Flip Book step 3: draw at the new position.
  ctx.fillStyle = "red";
  ctx.fillRect(x, y, square_side, square_side);

  // Ask the browser to call draw() again before the next screen repaint.
  requestAnimationFrame(draw);
}

// Kick off the loop.
requestAnimationFrame(draw);
