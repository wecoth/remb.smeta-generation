// ─── smeta-pdf.js ──────────────────────────────────────────────────
// Генерация PDF без transform:scale. Страница фиксирована 1123×794 px.
// Всё, что не влезает в эти размеры, обрезается самим Chromium.
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

  // 1. Контейнеры футера — показываем/скрываем
  document.querySelectorAll('.spp-page:not(.spp-hidden) .spp-a4 [id$="Foot2"]').forEach(foot => {
    if (foot.id === 'prevCovFoot2') return;
    foot.style.display = logoData ? '' : 'none';
  });

  // 2. Логотип — src и размер
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

  // ★ Клонируем страницы ПОСЛЕ обновления ★
  const pageHtmlArr = [];
  document.querySelectorAll('.spp-page:not(.spp-hidden) .spp-a4').forEach(page => {
    const clone = page.cloneNode(true);
    clone.querySelectorAll('.be-toolbar, .be-h-corner, .be-margin-guide').forEach(el => el.remove());
    clone.querySelectorAll('.be-block').forEach(el => { el.classList.remove('be-selected', 'be-editing'); });
    clone.querySelectorAll('.be-hidden').forEach(el => { el.style.display = 'none'; });

    // АБСОЛЮТНО НИКАКОГО МАСШТАБИРОВАНИЯ
    clone.style.transform = 'none';
    clone.style.width  = '1123px';
    clone.style.height = '794px';

    pageHtmlArr.push(`<div class="pdf-a4-page">${clone.outerHTML}</div>`);
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

    /* Страница PDF: фиксированный размер 1123x794px,
       браузер сам отмасштабирует под 297x210mm */
    .pdf-a4-page {
      width: 1123px;
      height: 794px;
      page-break-after: always;
      overflow: hidden;        /* ← обрезаем всё, что выходит за границы */
      position: relative;
    }
    .pdf-a4-page:last-child { page-break-after: auto; }

    /* Лист внутри — без scale, точные размеры */
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

    /* Дополнительные разблокировки */
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
