class Drawing {
  constructor(id, points, color, size, timestamp) {
    this.id = id;
    this.points = points;
    this.color = color;
    this.size = size;
    this.timestamp = timestamp;
  }
}

class CRDT {
  constructor() {
    this.drawings = new Map();
    this.site = Math.random().toString(36).substr(2, 9);
  }

  generateId() {
    return `${this.site}-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }

  addDrawing(points, color, size) {
    const id = this.generateId();
    const drawing = new Drawing(id, points, color, size, Date.now());
    this.drawings.set(id, drawing);
    return drawing;
  }

  merge(remoteDrawing) {
    if (
      !this.drawings.has(remoteDrawing.id) ||
      this.drawings.get(remoteDrawing.id).timestamp < remoteDrawing.timestamp
    ) {
      this.drawings.set(remoteDrawing.id, remoteDrawing);
      return true;
    }
    return false;
  }
}
