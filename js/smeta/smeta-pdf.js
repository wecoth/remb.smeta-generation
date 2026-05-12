// ─── smeta-pdf.js ──────────────────────────────────────────────────
// Блок: генерация PDF.
// Собирает HTML страниц КП, извлекает CSS из document.styleSheets,
// отправляет на внешний webhook и скачивает blob.
import { appState } from '../state.js';

export async function generatePDF() {
  const street = document.getElementById('hdrStreet')?.value || '';
  const house  = document.getElementById('hdrHouse')?.value  || '';
  const flat   = document.getElementById('hdrFlat')?.value   || '';
  const on = [street, house, flat ? 'кв. ' + flat : ''].filter(Boolean).join(', ') || '—';

  // ★ Сначала обновляем футеры на живых страницах — ДО клонирования ★
  const logoData = appState?.logoData || window._auth?._currentProfile?.logoBase64 || null;
  const footerLogoHeight = appState?.footerLogoHeight;
  const footerLogoPosition = appState?.footerLogoPosition;

  document.querySelectorAll('.spp-page:not(.spp-hidden) .spp-a4 [id$="FtLogoImg2"]').forEach(img => {
    if (logoData) {
      img.src = logoData;
      img.style.display = '';
      if (footerLogoHeight != null) {
        img.style.maxHeight = footerLogoHeight + 'px';
        img.style.maxWidth = 'none';
      }
    } else {
      img.style.display = 'none';
    }
  });

  if (footerLogoPosition) {
    document.querySelectorAll('.spp-page:not(.spp-hidden) .spp-a4 [id$="Foot2"]').forEach(foot => {
      if (foot.id === 'prevCovFoot2') return;
      foot.style.right = footerLogoPosition.right + 'px';
      foot.style.bottom = footerLogoPosition.bottom + 'px';
      foot.style.left = 'auto';
      foot.style.top = 'auto';
    });
  }

  const pageHtmlArr = [];

  document.querySelectorAll('.spp-page:not(.spp-hidden) .spp-a4').forEach(page => {
    const clone = page.cloneNode(true);
    clone.querySelectorAll('.be-toolbar, .be-h-corner, .be-margin-guide').forEach(el => el.remove());
    clone.querySelectorAll('.be-block').forEach(el => { el.classList.remove('be-selected', 'be-editing'); });
    clone.querySelectorAll('.be-hidden').forEach(el => { el.style.display = 'none'; });
    clone.style.transform = 'none';
    clone.style.width  = '1123px';
    clone.style.height = '794px';

    // ★ Читаем реальные координаты футера с живой страницы через getBoundingClientRect ★
    // Футер позиционирован внутри масштабированного .spp-a4 (scale 0.2646),
    // поэтому getBoundingClientRect возвращает уже визуальные координаты.
    // Переводим их в проценты от размера живого .spp-a4 на экране
    // и выносим футер из клона наружу — в .pdf-a4-page (297mm × 210mm),
    // где он позиционируется в тех же процентах.

    const liveFoot = page.querySelector('[id$="Foot2"]:not(#prevCovFoot2)');
    let footOverlayHtml = '';

    if (liveFoot && logoData) {
      const pageRect = page.getBoundingClientRect();
      const footRect = liveFoot.getBoundingClientRect();

      // Позиция и размер в процентах от визуального размера страницы
      const leftPct   = ((footRect.left   - pageRect.left)  / pageRect.width  * 100).toFixed(4);
      const topPct    = ((footRect.top    - pageRect.top)   / pageRect.height * 100).toFixed(4);
      const widthPct  = (footRect.width  / pageRect.width  * 100).toFixed(4);
      const heightPct = (footRect.height / pageRect.height * 100).toFixed(4);

      // Убираем футер из клона чтобы не дублировать
      const cloneFoot = clone.querySelector('[id$="Foot2"]:not(#prevCovFoot2)');
      if (cloneFoot) cloneFoot.remove();

      // Клонируем живой футер (с актуальным src логотипа)
      const footClone = liveFoot.cloneNode(true);

      // Сбрасываем inline позиционирование — теперь управляем снаружи
      footClone.style.position = 'static';
      footClone.style.right  = '';
      footClone.style.bottom = '';
      footClone.style.left   = '';
      footClone.style.top    = '';

      footOverlayHtml = `
        <div style="
          position: absolute;
          left: ${leftPct}%;
          top: ${topPct}%;
          width: ${widthPct}%;
          height: ${heightPct}%;
          overflow: visible;
          pointer-events: none;
          margin: 0;
          padding: 0;
        ">${footClone.outerHTML}</div>`;
    }

    pageHtmlArr.push(`<div class="pdf-a4-page">${clone.outerHTML}${footOverlayHtml}</div>`);
  });

  const pdfHtml = pageHtmlArr.join('\n');

  const sheetCss = Array.from(document.styleSheets).map(s => {
    try { return Array.from(s.cssRules).map(r => r.cssText).join('\n'); } catch { return ''; }
  }).join('\n');

  const pdfCss = `
    @import url('https://fonts.googleapis.com/css2?family=Onest:wght@300;400;500;600&display=swap');
    @font-face {
      font-family: 'Merriweather';
      src: url('https://raw.githubusercontent.com/MishkinIN/Font_GOST_2.304/master/gost_2.304.ttf') format('truetype');
    }
    @page { size: 297mm 210mm; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background: #fff; font-family: 'Merriweather', serif; }
    .pdf-a4-page { width: 297mm; height: 210mm; page-break-after: always; overflow: visible; position: relative; }
    .pdf-a4-page:last-child { page-break-after: auto; }
    .spp-a4 { width: 1123px; height: 794px; transform-origin: top left; transform: scale(0.2646); overflow: visible !important; }
    .spp-a4 * { font-family: 'Merriweather', serif !important; }
    .be-margin-guide { display: none !important; }

    /* Скрываем пунктирную рамку в PDF */
    .spp-a4::before {
      border: none !important;
      display: none !important;
    }

    ${sheetCss}`;

  const btns = document.querySelectorAll('.btn-generate');
  btns.forEach(b => { b.textContent = 'Генерация...'; b.disabled = true; });

  try {
    const resp = await fetch('https://assistcloudai.xyz/webhook/generate-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: pdfHtml, css: pdfCss }),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Смета_${on}.pdf`;
    a.click();
  } catch (e) {
    alert('Ошибка генерации PDF: ' + e.message);
  } finally {
    btns.forEach(b => { b.textContent = 'Сформировать PDF →'; b.disabled = false; });
  }
}
