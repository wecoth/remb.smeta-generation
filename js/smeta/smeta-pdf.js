// ─── smeta-pdf.js ──────────────────────────────────────────────────
// Футер вырезается из .spp-a4 и помещается в .pdf-a4-page,
// что гарантирует его обрезку по границам PDF-листа.
import { appState } from '../state.js';

export async function generatePDF() {
  const street = document.getElementById('hdrStreet')?.value || '';
  const house  = document.getElementById('hdrHouse')?.value  || '';
  const flat   = document.getElementById('hdrFlat')?.value   || '';
  const on = [street, house, flat ? 'кв. ' + flat : ''].filter(Boolean).join(', ') || '—';

  // ★ Обновляем футер-логотипы на живых страницах ДО клонирования ★
  const logoData = appState?.logoData || window._auth?._currentProfile?.logoBase64 || null;
  const footerLogoHeight = appState?.footerLogoHeight;
  const footerLogoPosition = appState?.footerLogoPosition;

  // 1. Контейнеры футера
  document.querySelectorAll('.spp-page:not(.spp-hidden) .spp-a4 [id$="Foot2"]').forEach(foot => {
    if (foot.id === 'prevCovFoot2') return;
    foot.style.display = logoData ? '' : 'none';
  });

  // 2. Логотип и размер
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

  // 3. Позиция футера
  if (footerLogoPosition) {
    document.querySelectorAll('.spp-page:not(.spp-hidden) .spp-a4 [id$="Foot2"]').forEach(foot => {
      if (foot.id === 'prevCovFoot2') return;
      foot.style.right = footerLogoPosition.right + 'px';
      foot.style.bottom = footerLogoPosition.bottom + 'px';
      foot.style.left = 'auto';
      foot.style.top = 'auto';
    });
  }

  // ★ Клонируем страницы ★
  const pageHtmlArr = [];
  document.querySelectorAll('.spp-page:not(.spp-hidden) .spp-a4').forEach((page) => {
    const clone = page.cloneNode(true);

    // Убираем UI редактора
    clone.querySelectorAll('.be-toolbar, .be-h-corner, .be-margin-guide').forEach(el => el.remove());
    clone.querySelectorAll('.be-block').forEach(el => {
      el.classList.remove('be-selected', 'be-editing');
    });
    clone.querySelectorAll('.be-hidden').forEach(el => { el.style.display = 'none'; });

    // Без масштабирования, фиксированные размеры
    clone.style.transform = 'none';
    clone.style.width  = '1123px';
    clone.style.height = '794px';

    // ‼️ ИЗВЛЕКАЕМ ФУТЕР из клона, чтобы вставить его в pdf-a4-page отдельно
    const footClone = clone.querySelector('[id$="Foot2"]:not(#prevCovFoot2)');
    let footHtml = '';
    if (footClone) {
      // Фиксируем его абсолютную позицию относительно родительской страницы в процентах
      const originalFoot = page.querySelector('[id$="Foot2"]:not(#prevCovFoot2)');
      if (originalFoot) {
        const footRect = originalFoot.getBoundingClientRect();
        const pageRect = page.getBoundingClientRect();

        // Позиция в процентах от верхнего левого угла .spp-a4
        const leftPct   = ((footRect.left - pageRect.left) / pageRect.width  * 100).toFixed(3);
        const topPct    = ((footRect.top  - pageRect.top)  / pageRect.height * 100).toFixed(3);
        const widthPct  = (footRect.width  / pageRect.width  * 100).toFixed(3);
        const heightPct = (footRect.height / pageRect.height * 100).toFixed(3);

        // Создаём новый футер с корректным позиционированием внутри pdf-a4-page
        footClone.style.position = 'absolute';
        footClone.style.left   = leftPct + '%';
        footClone.style.top    = topPct + '%';
        footClone.style.width  = widthPct + '%';
        footClone.style.height = heightPct + '%';
        footClone.style.right  = 'auto';
        footClone.style.bottom = 'auto';
        footClone.style.margin = '0';
        footClone.style.transform = 'none';
      }
      footHtml = footClone.outerHTML;
      footClone.remove(); // убираем из основного клона, чтобы не дублировался
    }

    pageHtmlArr.push(`<div class="pdf-a4-page">${clone.outerHTML}${footHtml}</div>`);
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

    .pdf-a4-page {
      width: 1123px;
      height: 794px;
      page-break-after: always;
      overflow: hidden;            /* ← обрезает всё, включая вынесенный футер */
      position: relative;
    }
    .pdf-a4-page:last-child { page-break-after: auto; }

    .spp-a4 {
      width: 1123px !important;
      height: 794px !important;
      transform: none !important;
      overflow: visible !important;
    }
    .spp-a4 * { font-family: 'Merriweather', serif !important; }
    .be-margin-guide { display: none !important; }
    .spp-a4::before,
    .spp-a4::after { display: none !important; }

    #prevSmrTableWrap, #prevMatTableWrap { overflow: visible !important; }
    .spp-a4 > div[style*="padding:90px"] { overflow: visible !important; max-height: none !important; height: auto !important; }

    ${sheetCss}
  `;

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
