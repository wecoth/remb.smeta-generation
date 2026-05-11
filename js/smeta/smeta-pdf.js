// ─── smeta-pdf.js ──────────────────────────────────────────────────
// Блок: генерация PDF.
// Собирает HTML страниц КП, извлекает CSS из document.styleSheets,
// отправляет на внешний webhook и скачивает blob.

export async function generatePDF() {
  const street = document.getElementById('hdrStreet')?.value || '';
  const house  = document.getElementById('hdrHouse')?.value  || '';
  const flat   = document.getElementById('hdrFlat')?.value   || '';
  const on = [street, house, flat ? 'кв. ' + flat : ''].filter(Boolean).join(', ') || '—';

  // ★ Обновляем все страницы КП перед сбором HTML ★
  if (typeof window._kpPreview?.liveUpdateKP === 'function') {
    window._kpPreview.liveUpdateKP();
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
    .pdf-a4-page { width: 297mm; height: 210mm; page-break-after: always; overflow: hidden; position: relative; }
    .pdf-a4-page:last-child { page-break-after: auto; }
    .spp-a4 { width: 1123px; height: 794px; transform-origin: top left; transform: scale(0.2646); }
    .spp-a4 * { font-family: 'Merriweather', serif !important; }
    .be-margin-guide { display: none !important; }

    /* ⬇ Убираем пунктирную рамку из PDF */
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
