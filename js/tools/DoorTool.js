// ─── DoorTool.js ──────────────────────────────────────────────────
import { BaseTool } from './BaseTool.js';
import { executeCommand } from '../commands/CommandHistory.js';
import { AddOpeningCommand } from '../commands/AddOpeningCommand.js';
import { findClosestWall } from '../wall.js';

export class DoorTool extends BaseTool {
  constructor(ui) {
    super(ui);
    this.name = 'door';
    this.hoverOpening = null;
    this._lastWorld = null;
    this._onWidthInput = null;
    this._onHeightInput = null;
  }

  activate() {
    this.hoverOpening = null;
    this._lastWorld = null;
    this.ui.canvas.style.cursor = 'crosshair';

    if (this.ui.dom.inpDoorWidth) {
      this._onWidthInput = () => this._updateHoverFromInput();
      this.ui.dom.inpDoorWidth.addEventListener('input', this._onWidthInput);
      this.ui.dom.inpDoorWidth.addEventListener('change', this._onWidthInput);
    }
    if (this.ui.dom.inpDoorHeight) {
      this._onHeightInput = () => this._updateHoverFromInput();
      this.ui.dom.inpDoorHeight.addEventListener('input', this._onHeightInput);
      this.ui.dom.inpDoorHeight.addEventListener('change', this._onHeightInput);
    }

    this.ui.doRedraw();
  }

  deactivate() {
    if (this.ui.dom.inpDoorWidth && this._onWidthInput) {
      this.ui.dom.inpDoorWidth.removeEventListener('input', this._onWidthInput);
      this.ui.dom.inpDoorWidth.removeEventListener('change', this._onWidthInput);
    }
    if (this.ui.dom.inpDoorHeight && this._onHeightInput) {
      this.ui.dom.inpDoorHeight.removeEventListener('input', this._onHeightInput);
      this.ui.dom.inpDoorHeight.removeEventListener('change', this._onHeightInput);
    }
    this._onWidthInput = null;
    this._onHeightInput = null;
    this._lastWorld = null;
    this.hoverOpening = null;
  }

  getCursor() {
    return 'crosshair';
  }

  getRenderState() {
    return { hoverOpening: this.hoverOpening };
  }

  /** Единственный источник истины для размеров — всегда читаем из DOM */
  _getDims() {
    return {
      w: parseFloat(this.ui.dom.inpDoorWidth?.value) || 900,
      h: parseFloat(this.ui.dom.inpDoorHeight?.value) || 2100,
    };
  }

  onMouseDown(pos, world, e) {
    if (!this.hoverOpening) return false;

    // Перечитываем размеры из DOM прямо в момент клика.
    // Это гарантирует актуальные значения независимо от того,
    // когда последний раз срабатывал onMouseMove или input.
    const { w, h } = this._getDims();
    const ho = { ...this.hoverOpening, width: w, height: h };

    console.log('🚪 CLICK width:', ho.width, 'height:', ho.height);
    executeCommand(new AddOpeningCommand(ho));
    this.ui.doRedraw();
    return true;
  }

  onMouseMove(pos, world, e) {
    this._lastWorld = world;
    this._updateHover(world);
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

  // ── Внутренние методы ─────────────────────────────────────────────

  _updateHover(world) {
    const hit = findClosestWall(world.x, world.y);
    if (hit) {
      const { w, h } = this._getDims();
      const wlen = Math.hypot(hit.wall.x2 - hit.wall.x1, hit.wall.y2 - hit.wall.y1);
      const angle = Math.atan2(hit.wall.y2 - hit.wall.y1, hit.wall.x2 - hit.wall.x1);
      const nx = -Math.sin(angle), ny = Math.cos(angle);
      const px = hit.wall.x1 + (hit.wall.x2 - hit.wall.x1) * hit.t;
      const py = hit.wall.y1 + (hit.wall.y2 - hit.wall.y1) * hit.t;
      const side = ((world.x - px) * nx + (world.y - py) * ny) >= 0 ? 1 : -1;
      this.hoverOpening = wlen > w + 1
        ? {
            wall: hit.wall,
            t: hit.t,
            width: w,
            height: h,
            type: 'door',
            hinge: this.ui.defaultDoorHinge,
            swing: this.ui.defaultDoorSwing,
            side,
          }
        : null;
    } else {
      this.hoverOpening = null;
    }
  }

  _updateHoverFromInput() {
    if (!this._lastWorld) return;
    this._updateHover(this._lastWorld);
    this.ui.doRedraw();
  }
}
