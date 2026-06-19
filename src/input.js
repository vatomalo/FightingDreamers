export class InputBuffer {
  constructor(target = window) {
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();

    target.addEventListener('keydown', (event) => {
      if (!event.repeat) {
        this.pressed.add(event.code);
      }

      this.down.add(event.code);
    });

    target.addEventListener('keyup', (event) => {
      this.down.delete(event.code);
      this.released.add(event.code);
    });
  }

  isDown(code) {
    return this.down.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  wasReleased(code) {
    return this.released.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }
}
