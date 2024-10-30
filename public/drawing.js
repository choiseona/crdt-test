class DrawingCanvas {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.isDrawing = false;
    this.currentPath = [];
    this.tempDrawing = null;
  }

  setupCanvas() {
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.clear();
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  startDrawing(x, y, color, size) {
    this.isDrawing = true;
    this.currentPath = [{ x, y }];
    this.tempDrawing = {
      points: this.currentPath,
      color: color,
      size: size,
    };
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = size;
  }

  draw(x, y) {
    if (!this.isDrawing) return null;

    this.currentPath.push({ x, y });
    this.tempDrawing.points = [...this.currentPath];

    // 현재 그리기 상태만 그리기
    this.ctx.lineTo(x, y);
    this.ctx.stroke();

    return this.tempDrawing;
  }

  stopDrawing() {
    if (!this.isDrawing) return;

    const finalPath = [...this.currentPath];
    this.isDrawing = false;
    this.tempDrawing = null;
    return finalPath;
  }

  drawPath(points, color, size) {
    this.ctx.beginPath();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = size;

    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }
    this.ctx.stroke();
  }
}

// main.js의 draw 함수 수정
function draw(e) {
  const rect = canvas.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const tempDrawing = canvas.draw(x, y);

  if (tempDrawing) {
    const currentDrawing = {
      id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      points: tempDrawing.points,
      color: tempDrawing.color,
      size: tempDrawing.size,
      timestamp: Date.now(),
    };

    dataChannels.forEach((channel) => {
      if (channel.readyState === "open") {
        channel.send(JSON.stringify(currentDrawing));
      }
    });
  }
}
