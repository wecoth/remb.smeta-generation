// ─── smeta-pdf.js ──────────────────────────────────────────────────
// Обрезаем выходящий за границы логотип через canvas,
// чтобы избежать бага полного исчезновения при генерации PDF.
import { appState } from '../state.js';

export async function generatePDF() {
  const street = document.getElementById('hdrStreet')?.value || '';
  const house  = document.getElementById('hdrHouse')?.value  || '';
  const flat   = document.getElementById('hdrFlat')?.value   || '';
  const on = [street, house, flat ? 'кв. ' + flat : ''].filter(Boolean).join(', ') || '—';

  // ── Подготовка живых футеров (src, размер, позиция, видимость) ──
  const logoData = appState?.logoData || window._auth?._currentProfile?.logoBase64 || null;
  const footerLogoHeight = appState?.footerLogoHeight;
  const footerLogoPosition = appState?.footerLogoPosition;

  document.querySelectorAll('.spp-page:not(.spp-hidden) .spp-a4 [id$="Foot2"]').forEach(foot => {
    if (foot.id === 'prevCovFoot2') return;
    foot.style.display = logoData ? '' : 'none';
  });

  if (logoData) {
    document.querySelectorAll('.spp-page:not(.spp-hidden) .spp-a4 [id$="FtLogoImg2"]').forEach(img => {
      img.src = logoData;
      img.style.display = '';
      if (footerLogoHeight != null) {
        img.style.maxHeight = footerLogoHeight + 'px';
        img.style.maxWidth = 'none';
      }
    });
  }

  if (footerLogoPosition) {
    document.querySelectorAll('.spp-page:not(.spp-hidden) .spp-a4 [id$="Foot2"]').forEach(foot => {
      if (foot.id === 'prevCovFoot2') return;
      foot.style.right = footerLogoPosition.right + 'px';
      foot.style.bottom = footerLogoPosition.bottom + 'px';
      foot.style.left = 'auto';
      foot.style.top = 'auto';
    });
  }

  // ── Клонирование с обрезкой логотипа под A4 ────────────────────
  const pageHtmlArr = [];
  const A4_WIDTH = 1123;
  const A4_HEIGHT = 794;

  document.querySelectorAll('.spp-page:not(.spp-hidden) .spp-a4').forEach(async (page) => {
    const clone = page.cloneNode(true);
    clone.querySelectorAll('.be-toolbar, .be-h-corner, .be-margin-guide').forEach(el => el.remove());
    clone.querySelectorAll('.be-block').forEach(el => { el.classList.remove('be-selected', 'be-editing'); });
    clone.querySelectorAll('.be-hidden').forEach(el => { el.style.display = 'none'; });
    clone.style.transform = 'none';
    clone.style.width  = A4_WIDTH + 'px';
    clone.style.height = A4_HEIGHT + 'px';

    // ── Обработка футера ──
    const foot2 = clone.querySelector('[id$="Foot2"]:not(#prevCovFoot2)');
    if (foot2 && logoData) {
      const footImg = foot2.querySelector('img');
      if (footImg) {
        const liveFoot = page.querySelector('[id$="Foot2"]:not(#prevCovFoot2)');
        if (liveFoot) {
          const liveRect = liveFoot.getBoundingClientRect();   // на живой странице
          const pageRect = page.getBoundingClientRect();

          // Пересчитываем координаты относительно .spp-a4 (который сейчас 1123x794)
          const relX = liveRect.left - pageRect.left;
          const relY = liveRect.top - pageRect.top;
          let footW = liveRect.width;
          let footH = liveRect.height;
          let footLeft = relX;
          let footTop = relY;

          // Проверяем выход за границы 1123x794
          if (
            footLeft + footW <= 0 || footLeft >= A4_WIDTH ||
            footTop + footH <= 0 || footTop >= A4_HEIGHT
          ) {
            // Логотип полностью за пределами → удаляем
            foot2.remove();
          } else {
            // Есть пересечение, нужно обрезать изображение
            const img = new Image();
            img.src = logoData;
            await new Promise(resolve => { img.onload = resolve; });

            const canvas = document.createElement('canvas');
            canvas.width = A4_WIDTH;
            canvas.height = A4_HEIGHT;
            const ctx = canvas.getContext('2d');

            // Определяем видимую область логотипа
            const visibleLeft = Math.max(0, footLeft);
            const visibleTop = Math.max(0, footTop);
            const visibleRight = Math.min(A4_WIDTH, footLeft + footW);
            const visibleBottom = Math.min(A4_HEIGHT, footTop + footH);
            const visibleW = visibleRight - visibleLeft;
            const visibleH = visibleBottom - visibleTop;

            if (visibleW > 0 && visibleH > 0) {
              // Рисуем оригинальное изображение на canvas с нужным смещением,
              // чтобы вырезать только видимый прямоугольник
              ctx.drawImage(
                img,
                visibleLeft - footLeft,          // sX
                visibleTop - footTop,            // sY
                visibleW,                        // sW
                visibleH,                        // sH
                visibleLeft,                     // dx
                visibleTop,                      // dy
                visibleW,                        // dW
                visibleH                         // dH
              );

              const croppedDataUrl = canvas.toDataURL('image/png');
              footImg.src = croppedDataUrl;
              footImg.style.maxHeight = 'none';
              footImg.style.maxWidth = 'none';
            }

            // Заменяем абсолютное позиционирование на фиксированные координаты,
            // чтобы футер точно лежал внутри A4 без отрицательных отступов
            foot2.style.position = 'absolute';
            foot2.style.right = 'auto';
            foot2.style.bottom = 'auto';
            foot2.style.left = visibleLeft + 'px';
            foot2.style.top = visibleTop + 'px';
            foot2.style.width = visibleW + 'px';
            foot2.style.height = visibleH + 'px';
            foot2.style.margin = '0';
            foot2.style.transform = 'none';
          }
        }
      } else {
        // Нет изображения в футере – просто удаляем,
        // либо оставляем пустой контейнер
        foot2.remove();
      }
    }

    pageHtmlArr.push(`<div class="pdf-a4-page">${clone.outerHTML}</div>`);
  });

  // Из-за асинхронной загрузки изображений дожидаемся всех промисов
  await Promise.all(pageHtmlArr);

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
      width: ${A4_WIDTH}px;
      height: ${A4_HEIGHT}px;
      page-break-after: always;
      overflow: hidden;
      position: relative;
    }
    .pdf-a4-page:last-child { page-break-after: auto; }
    .spp-a4 {
      width: ${A4_WIDTH}px !important;
      height: ${A4_HEIGHT}px !important;
      transform: none !important;
      overflow: visible !important;
    }
    .spp-a4 * { font-family: 'Merriweather', serif !important; }
    .be-margin-guide { display: none !important; }
    .spp-a4::before, .spp-a4::after { display: none !important; }
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
