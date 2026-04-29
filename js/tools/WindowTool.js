// ─── WindowTool.js ────────────────────────────────────────────────
import { BaseTool } from './BaseTool.js';
import { executeCommand } from '../commands/CommandHistory.js';
import { AddOpeningCommand } from '../commands/AddOpeningCommand.js';
import { findClosestWall } from '../wall.js';

export class WindowTool extends BaseTool {
  constructor(ui) {
    super(ui);
    this.name = 'window';
    this.hoverOpening = null;
    this._lastWorld = null;          // храним последние мировые координаты мыши
    this._onWidthInput = null;
    this._onHeightInput = null;
  }

  activate() {
    this.hoverOpening = null;
    this._lastWorld = null;
    this.ui.canvas.style.cursor = 'crosshair';

    // Пересчитывать превью при изменении размеров в панели
    if (this.ui.dom.inpWindowWidth) {
      this._onWidthInput = () => this._updateHoverFromInput();
      this.ui.dom.inpWindowWidth.addEventListener('input', this._onWidthInput);
    }
    if (this.ui.dom.inpWindowHeight) {
      this._onHeightInput = () => this._updateHoverFromInput();
      this.ui.dom.inpWindowHeight.addEventListener('input', this._onHeightInput);
    }

    this.ui.doRedraw();
  }

  deactivate() {
    if (this.ui.dom.inpWindowWidth && this._onWidthInput)
      this.ui.dom.inpWindowWidth.removeEventListener('input', this._onWidthInput);
    if (this.ui.dom.inpWindowHeight && this._onHeightInput)
      this.ui.dom.inpWindowHeight.removeEventListener('input', this._onHeightInput);
    this._onWidthInput = null;
    this._onHeightInput = null;
    this._lastWorld = null;
    this.hoverOpening = null;
  }

  getCursor() { return 'crosshair'; }

  getRenderState() {
    return { hoverOpening: this.hoverOpening };
  }

  onMouseDown(pos, world, e) {
    if (this.hoverOpening) {
      executeCommand(new AddOpeningCommand(this.hoverOpening));
      this.ui.doRedraw();
      return true;
    }
    return false;
  }

  onMouseMove(pos, world, e) {
    this._lastWorld = world;                     // сохраняем позицию
    this._updateHover(world);                    // пересчитываем hover
    this.ui.updateCoordinatesLabel(world, null, null);
    this.ui.doRedraw();
    return true;
  }

  onKeyDown(e) {
    if (e.key === 'Escape') {
      this.hoverOpening = null;
      this.ui.doRedraw();
      return true;
    }
    return false;
  }

  // Внутренние методы

  /** Пересчёт hoverOpening по мировым координатам */
  _updateHover(world) {
    const hit = findClosestWall(world.x, world.y);
    if (hit) {
      const w = parseFloat(this.ui.dom.inpWindowWidth?.value) || 1200;
      const h = parseFloat(this.ui.dom.inpWindowHeight?.value) || 1500;
      const wlen = Math.hypot(hit.wall.x2 - hit.wall.x1, hit.wall.y2 - hit.wall.y1);
      const angle = Math.atan2(hit.wall.y2 - hit.wall.y1, hit.wall.x2 - hit.wall.x1);
      const nx = -Math.sin(angle), ny = Math.cos(angle);
      const px = hit.wall.x1 + (hit.wall.x2 - hit.wall.x1) * hit.t;
      const py = hit.wall.y1 + (hit.wall.y2 - hit.wall.y1) * hit.t;
      const side = ((world.x - px) * nx + (world.y - py) * ny) >= 0 ? 1 : -1;
      this.hoverOpening = wlen > w + 1
        ? { wall: hit.wall, t: hit.t, width: w, height: h, type: 'window', side }
        : null;
    } else {
      this.hoverOpening = null;
    }
  }

  /** Вызывается при изменении полей ввода – пересчитывает hover, если мышь над стеной */
  _updateHoverFromInput() {
    if (!this._lastWorld) return;
    this._updateHover(this._lastWorld);
    this.ui.doRedraw();
  }
}
