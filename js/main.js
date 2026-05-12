// ─── MAIN.JS ──────────────────────────────────────────────────────
import { appState } from './state.js';
import { computeRooms, updateExpl } from './room.js';
import { initPlanner, setTool, forceRedraw, getViewport } from './ui-planner.js';
import { renderToImage } from './render.js';
import { setViewport } from './snapping.js';
import {
  initSmeta,
  handleSmr, initSmrManual, addSmrRow, clearSmr,
  handleMat, initMatManual, addMatRow, clearMat,
  generatePDF, importRoomsFromPlanner, captureCanvas,
  collectSmrRows, collectMatRows, getSmrTotal, getMatTotal,
  renderSmrTable, renderMatTable,          // ← добавили
  renderGantt, syncSectionsToGantt, recalcAllStageDaysAuto, // ← добавили
  renderPayments, updateTotals             // ← добавили
} from './smeta.js';
import { autosaveToLocalStorage, loadFromLocalStorage, downloadProject, uploadProject } from './storage.js';
import { clearHistory } from './commands/CommandHistory.js';

// ── Expose smeta module globally (for inline oninput/onclick) ──────
window._smetaModule = {
  handleSmr, initSmrManual, addSmrRow, clearSmr,
  handleMat, initMatManual, addMatRow, clearMat,
  generatePDF, importRoomsFromPlanner, captureCanvas,
  collectSmrRows, collectMatRows, getSmrTotal, getMatTotal,
};

// Expose appState and viewport for captureCanvas
window._appState = appState;
window._plannerViewport = getViewport;
window._renderModule = { renderToImage };

// main.js initializes modules and wires up tabs

// ── Tab switching ─────────────────────────────────────────────────

function switchTab(tab) {
  appState.activeTab = tab;
  const plannerView = document.getElementById('plannerView');
  const smetaView   = document.getElementById('smetaView');
  const kpView      = document.getElementById('kpView');
  const btnPlanner  = document.getElementById('tabPlanner');
  const btnSmeta    = document.getElementById('tabSmeta');
  const btnKP       = document.getElementById('tabKP');

  plannerView.style.display = tab === 'planner' ? 'flex'  : 'none';
  smetaView.style.display   = tab === 'smeta'   ? 'block' : 'none';
  if (kpView) kpView.style.display = tab === 'kp' ? 'block' : 'none';

  btnPlanner?.classList.toggle('active', tab === 'planner');
  btnSmeta?.classList.toggle('active',   tab === 'smeta');
  btnKP?.classList.toggle('active',      tab === 'kp');

  // Resize canvas when switching to planner tab
  if (tab === 'planner') {
    requestAnimationFrame(() => {
      const cw = document.getElementById('canvasWrap');
      const canvas = document.getElementById('planCanvas');
      if (cw && canvas) {
        const r = cw.getBoundingClientRect();
        canvas.width = r.width; canvas.height = r.height;
        forceRedraw();
      }
    });
  }

  // Re-scale A4 preview when switching to KP
  if (tab === 'kp') {
    requestAnimationFrame(() => {
      if (typeof window.setA4Scale === 'function') {
        window.setA4Scale();
        setTimeout(window.setA4Scale, 80);
      }
    });
  }
}

// ── DOM-ready init ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Tab buttons
  document.getElementById('tabPlanner')?.addEventListener('click', () => switchTab('planner'));
  document.getElementById('tabSmeta')?.addEventListener('click',   () => switchTab('smeta'));
  document.getElementById('tabKP')?.addEventListener('click',      () => switchTab('kp'));

  // ── Init planner ──
  const canvas     = document.getElementById('planCanvas');
  const canvasWrap = document.getElementById('canvasWrap');
  if (canvas && canvasWrap) {
    initPlanner({
      canvas, canvasWrap,
      toolGrid:        document.getElementById('toolGrid'),
      offsetBtns:      document.getElementById('offsetBtns'),
      doorHingeButtons:document.getElementById('doorHingeButtons'),
      doorSwingButtons:document.getElementById('doorSwingButtons'),
      editPanel:       document.getElementById('editPanel'),
      editContent:     document.getElementById('editContent'),
      btnDeleteSelected:document.getElementById('btnDeleteSelected'),
      btnUndo:         document.getElementById('btnUndo'),
      btnRedo:         document.getElementById('btnRedo'),
      btnNew:          document.getElementById('btnNew'),
      btnRecalc:       document.getElementById('btnRecalc'),
      btnZoomIn:       document.getElementById('btnZoomIn'),
      btnZoomOut:      document.getElementById('btnZoomOut'),
      btnZoomReset:    document.getElementById('btnZoomReset'),
      btnImportRooms:  document.getElementById('btnImportRooms'),
      explBody:        document.getElementById('explBody'),
      roomCount:       document.getElementById('roomCount'),
      lblTool:         document.getElementById('lblTool'),
      lblCoords:       document.getElementById('lblCoords'),
      lblLen:          document.getElementById('lblLen'),
      lblLenVal:       document.getElementById('lblLenVal'),
      snapBadge:       document.getElementById('snapBadge'),
      lengthOverlay:   document.getElementById('lengthOverlay'),
      lengthLabel:     document.getElementById('lengthLabel'),
      inpWallThick:    document.getElementById('inpWallThick'),
      inpWallHeight:   document.getElementById('inpWallHeight'),
      rulerTooltip:    document.getElementById('rulerTooltip'),
    });
  }

  // ── Restore planner project from local storage (if exists) ──
    //if (loadFromLocalStorage()) {
    // комнаты больше не пересчитываются автоматически
    // computeRooms(...) – вызов удалён
   // updateExpl(document.getElementById('explBody'), document.getElementById('roomCount'));
   // clearHistory();
   // forceRedraw();
  //}

  // ── Init smeta ──
  initSmeta();

  // ── Save/load project buttons ──
  document.getElementById('btnSaveProject')?.addEventListener('click', downloadProject);
  document.getElementById('btnLoadProject')?.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    uploadProject(f, err => {
  if (err) { alert('Ошибка загрузки: ' + err.message); return; }
  // computeRooms(...) – удалён вызов, комнаты теперь создаются вручную
  updateExpl(document.getElementById('explBody'), document.getElementById('roomCount'));
  clearHistory();
  forceRedraw();
          // ── Обновление сметы и КП после загрузки ──
    renderSmrTable();
    renderMatTable();
    syncSectionsToGantt();
    recalcAllStageDaysAuto();
    renderGantt();
    renderPayments();
    updateTotals();

    // Обновление предпросмотра КП
    if (window._kpPreview && window._kpPreview.liveUpdateKP) {
      window._kpPreview.liveUpdateKP();
    }

    // Синхронизация размеров логотипов с localStorage
    const sizes = {
      coverLogoWidth:   appState.coverLogoWidth,
      coverLogoHeight:  appState.coverLogoHeight,
      footerLogoHeight: appState.footerLogoHeight,
      footerLogoPosition: appState.footerLogoPosition
    };
    localStorage.setItem('remb_logo_sizes', JSON.stringify(sizes));
    });
  });

  // ── Autosave every 30s ──
  //setInterval(autosaveToLocalStorage, 30000);

  // ── Start on smeta tab ──
  switchTab('smeta');
});
