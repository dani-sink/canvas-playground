const canvas = document.getElementById("my-canvas");
const ctx = canvas.getContext("2d");
const canvas_width = canvas.width;
const canvas_height = canvas.height;

let x = 0;
let y = 60;

let square_side = 30;

const speed = 7;

function draw() {
  ctx.clearRect(0, 0, canvas_width, canvas_height);

  if (x >= canvas_width) {
    x = -square_side + (x - canvas_width);
  }
  x += speed;

  ctx.fillStyle = "red";
  ctx.fillRect(x, y, square_side, square_side);
  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);
