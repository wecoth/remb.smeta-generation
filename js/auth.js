/* ════════════════════════════════════════════════
   REMB Auth Module  —  js/auth.js
════════════════════════════════════════════════ */

const N8N_BASE = 'https://assistcloudai.xyz/webhook';

window._auth = {

  // Состояние ручного кадрирования логотипа
  _cropState: {
    originalImg: null,    // исходная картинка (Image)
    startX: 0, startY: 0,
    rect: null,           // { x, y, w, h } в координатах canvas
    dragging: false,
    canvas: null,         // ссылка на #cropBigCanvas
  },

  // Показываем модальное окно после выбора файла
  async handleProfileLogo(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Читаем файл в DataURL
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });

    // Загружаем изображение
    const img = new Image();
    img.onload = () => this.openCropModal(img);
    img.src = dataUrl;
  },

  // Открыть модалку с большим холстом
  openCropModal(img) {
    const modal = document.getElementById('cropModal');
    const canvas = document.getElementById('cropBigCanvas');
    if (!modal || !canvas) return;

    // Определяем максимальные размеры холста (чтобы влезало в окно)
    const maxWidth = 650;  // чуть меньше ширины карточки
    const maxHeight = 450;
    let width = img.naturalWidth;
    let height = img.naturalHeight;

    // Масштабируем, если больше максимума
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);

    // Настраиваем canvas
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    // Сохраняем состояние
    this._cropState.originalImg = img;
    this._cropState.canvas = canvas;
    this._cropState.rect = null;
    this._cropState.dragging = false;

    // Показываем модальное окно
    modal.style.display = 'block';

    // Обработчики мыши
    canvas.onmousedown = (e) => {
      const rect = canvas.getBoundingClientRect();
      this._cropState.startX = e.clientX - rect.left;
      this._cropState.startY = e.clientY - rect.top;
      this._cropState.dragging = true;
      this._cropState.rect = null;
    };

    canvas.onmousemove = (e) => {
      if (!this._cropState.dragging) return;
      const rect = canvas.getBoundingClientRect();
      const x1 = this._cropState.startX;
      const y1 = this._cropState.startY;
      const x2 = e.clientX - rect.left;
      const y2 = e.clientY - rect.top;

      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);

      // Не даём выделению выйти за границы
      this._cropState.rect = {
        x: Math.max(0, x),
        y: Math.max(0, y),
        w: Math.min(w, canvas.width - x),
        h: Math.min(h, canvas.height - y),
      };

      this.redrawCropCanvas();
    };

    canvas.onmouseup = () => {
      this._cropState.dragging = false;
    };
  },

  // Перерисовка холста с прямоугольником выделения
  redrawCropCanvas() {
    const { canvas, originalImg, rect } = this._cropState;
    if (!canvas || !originalImg) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalImg, 0, 0, canvas.width, canvas.height);

    if (rect && rect.w > 3 && rect.h > 3) {
      ctx.strokeStyle = '#4a6fe3';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.setLineDash([]);
    }
  },

  // Применить кадрирование
  applyCrop() {
    const { canvas, originalImg, rect } = this._cropState;
    if (!canvas || !originalImg || !rect || rect.w < 5 || rect.h < 5) {
      alert('Пожалуйста, выделите область (потяните мышью)');
      return;
    }

    // Пересчитываем координаты в исходное изображение
    const scaleX = originalImg.naturalWidth / canvas.width;
    const scaleY = originalImg.naturalHeight / canvas.height;
    const sx = rect.x * scaleX;
    const sy = rect.y * scaleY;
    const sw = rect.w * scaleX;
    const sh = rect.h * scaleY;

    // Создаём обрезанный холст
    const outCanvas = document.createElement('canvas');
    outCanvas.width = sw;
    outCanvas.height = sh;
    const outCtx = outCanvas.getContext('2d');
    outCtx.drawImage(originalImg, sx, sy, sw, sh, 0, 0, sw, sh);

    // Получаем DataURL обрезанного логотипа
    this._pendingLogoBase64 = outCanvas.toDataURL('image/png');

    // Показываем превью в маленькой зоне профиля
    const preview = document.getElementById('profileLogoPreview');
    const placeholder = document.getElementById('profileLogoPlaceholder');
    if (preview) {
      preview.src = this._pendingLogoBase64;
      preview.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';

    // Закрываем модальное окно
    this.closeCropModal();
  },

  // Закрыть модальное окно (если клик по оверлею — тоже закрываем)
  closeCropModal(e) {
    if (e && e.target !== document.querySelector('.crop-modal-overlay')) return;
    const modal = document.getElementById('cropModal');
    if (modal) modal.style.display = 'none';
    // Очищаем canvas для экономии памяти
    const canvas = document.getElementById('cropBigCanvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  },

  // ─── остальные методы auth (checkAuth, submit, openProfile, saveProfile и т.д.) ───
  // ... (оставьте их без изменений, как в предыдущей версии)
  async checkAuth() {
    const token = localStorage.getItem('remb_token');
     if (cached.footerLogoPosition != null) window.appState.footerLogoPosition = cached.footerLogoPosition;
    if (!token) { this.showAuthScreen(); return; }
    try {
      const res = await fetch(N8N_BASE + '/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      if (data.success) {
        this.applyProfile(data.profile);
        if (!data.profile?.coverLogoWidth && window.appState) {
          const cached = JSON.parse(localStorage.getItem('remb_logo_sizes') || '{}');
          if (cached.coverLogoWidth   != null) window.appState.coverLogoWidth   = cached.coverLogoWidth;
          if (cached.coverLogoHeight  != null) window.appState.coverLogoHeight  = cached.coverLogoHeight;
          if (cached.footerLogoHeight != null) window.appState.footerLogoHeight = cached.footerLogoHeight;
        }
        this.showApp();
      } else {
        localStorage.removeItem('remb_token');
        localStorage.removeItem('remb_userId');
        this.showAuthScreen();
      }
    } catch (e) { this.showApp(); }
  },

  currentTab: 'login',

  switchTab(tab) {
    this.currentTab = tab;
    document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
    document.getElementById('tabReg').classList.toggle('active', tab === 'register');
    document.getElementById('authBtnText').textContent = tab === 'login' ? 'Войти' : 'Зарегистрироваться';
    this.hideError();
  },

  async submit() {
    const email    = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!email || !password) { this.showError('Заполните email и пароль'); return; }

    this.setLoading(true);
    this.hideError();

    const endpoint = this.currentTab === 'login' ? '/auth/login' : '/auth/register';
    try {
      const res  = await fetch(N8N_BASE + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('remb_token',  data.token);
        localStorage.setItem('remb_userId', data.userId);
        this.applyProfile(data.profile || {});
        this.hideAuthScreen();
        this.showApp();
      } else {
        const msgs = {
          'email_exists':   'Этот email уже зарегистрирован',
          'not_found':      'Пользователь не найден',
          'wrong_password': 'Неверный пароль',
          'missing_fields': 'Заполните все поля'
        };
        this.showError(msgs[data.error] || 'Ошибка авторизации');
      }
    } catch (e) { this.showError('Нет соединения с сервером'); }

    this.setLoading(false);
  },

  openProfile() {
    const p = this._currentProfile || {};
    document.getElementById('profileCompanyName').value = p.companyName || '';
    document.getElementById('profileSlogan').value      = p.slogan      || '';
    document.getElementById('profileOwnerName').value   = p.ownerName   || '';
    document.getElementById('profilePhone').value       = p.phone       || '';
    document.getElementById('profileOgrn').value        = p.ogrn        || '';
    if (p.logoBase64) {
      document.getElementById('profileLogoPreview').src           = p.logoBase64;
      document.getElementById('profileLogoPreview').style.display = 'block';
      document.getElementById('profileLogoPlaceholder').style.display = 'none';
    }
    document.getElementById('profileSaveMsg').style.display = 'none';
    document.getElementById('profileScreen').style.display  = 'block';
  },

  closeProfile(e) {
    if (e && e.target !== document.querySelector('.profile-overlay')) return;
    document.getElementById('profileScreen').style.display = 'none';
  },

  async saveProfile() {
    const token = localStorage.getItem('remb_token');
    if (!token) return;
    const profile = {
      token,
      companyName: document.getElementById('profileCompanyName').value,
      slogan:      document.getElementById('profileSlogan').value,
      ownerName:   document.getElementById('profileOwnerName').value,
      phone:       document.getElementById('profilePhone').value,
      ogrn:        document.getElementById('profileOgrn').value,
      logoBase64:  this._pendingLogoBase64 || (this._currentProfile && this._currentProfile.logoBase64) || '',
      coverLogoWidth:   (window.appState && window.appState.coverLogoWidth   != null) ? window.appState.coverLogoWidth   : null,
      coverLogoHeight:  (window.appState && window.appState.coverLogoHeight  != null) ? window.appState.coverLogoHeight  : null,
      footerLogoHeight: (window.appState && window.appState.footerLogoHeight != null) ? window.appState.footerLogoHeight : null,
      footerLogoPosition: (window.appState && window.appState.footerLogoPosition)
  ? { ...window.appState.footerLogoPosition } : null,
    };
    try {
      const res  = await fetch(N8N_BASE + '/profile/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      const data = await res.json();
      if (data.success) {
        this._currentProfile = { ...profile };
        this.applyProfile(profile);
        document.getElementById('profileSaveMsg').style.display = 'block';
        setTimeout(() => {
          document.getElementById('profileSaveMsg').style.display = 'none';
          document.getElementById('profileScreen').style.display  = 'none';
        }, 1500);
      }
    } catch (e) { alert('Ошибка сохранения'); }
  },

  applyProfile(profile) {
    if (!profile) return;
    this._currentProfile = profile;

    const sidebarName = document.getElementById('sidebarCompanyName');
    if (sidebarName && profile.companyName) sidebarName.textContent = profile.companyName;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el !== null) el.value = val || '';
    };
    set('companyName',   profile.companyName);
    set('companySlogan', profile.slogan);
    set('executorName',  profile.ownerName);
    set('companyPhone',  profile.phone);
    set('companyOgrn',   profile.ogrn);

    if (profile.logoBase64) {
      if (window.appState) window.appState.logoData = profile.logoBase64;
      const preview = document.getElementById('logoPreview');
      if (preview) { preview.src = profile.logoBase64; preview.style.display = 'block'; }
      const ph = document.getElementById('logoPlaceholder');
      if (ph) ph.style.display = 'none';
    }

    setTimeout(() => {
      if (window._smetaModule && window._smetaModule.liveUpdate) {
        window._smetaModule.liveUpdate();
      }
    }, 100);

    if (window.appState) {
      if (profile.coverLogoWidth   != null) window.appState.coverLogoWidth   = profile.coverLogoWidth;
      if (profile.coverLogoHeight  != null) window.appState.coverLogoHeight  = profile.coverLogoHeight;
      if (profile.footerLogoHeight != null) window.appState.footerLogoHeight = profile.footerLogoHeight;
    }

if (profile.footerLogoPosition) {
  window.appState.footerLogoPosition = profile.footerLogoPosition;
}
     
    const sizes = {
      coverLogoWidth:   profile.coverLogoWidth   ?? null,
      coverLogoHeight:  profile.coverLogoHeight  ?? null,
      footerLogoHeight: profile.footerLogoHeight ?? null,
      footerLogoPosition: profile.footerLogoPosition ?? null, // ← добавить
    };
    localStorage.setItem('remb_logo_sizes', JSON.stringify(sizes));
  },

  logout() {
    localStorage.removeItem('remb_token');
    localStorage.removeItem('remb_userId');
    this._currentProfile = null;
    document.getElementById('profileScreen').style.display = 'none';
    this.showAuthScreen();
  },

  showAuthScreen() {
    document.getElementById('authScreen').style.display = 'block';
    document.getElementById('authEmail').value    = '';
    document.getElementById('authPassword').value = '';
    this.hideError();
  },

  hideAuthScreen() {
    document.getElementById('authScreen').style.display = 'none';
  },

  showApp() {
    this.hideAuthScreen();
    if (window.initSmeta) window.initSmeta();
    else if (window._smetaModule && window._smetaModule.init) window._smetaModule.init();
  },

  showError(msg) {
    const el = document.getElementById('authError');
    el.textContent   = msg;
    el.style.display = 'block';
  },

  hideError() {
    document.getElementById('authError').style.display = 'none';
  },

  setLoading(on) {
    document.getElementById('authBtnText').style.display   = on ? 'none'   : 'inline';
    document.getElementById('authBtnLoader').style.display = on ? 'inline' : 'none';
    document.getElementById('authSubmitBtn').disabled      = on;
  }
};

// Вешаем клик по зоне логотипа для открытия выбора файла
document.addEventListener('DOMContentLoaded', () => {
  const logoZone = document.getElementById('profileLogoZone');
  const logoInput = document.getElementById('profileLogoInput');
  if (logoZone && logoInput) {
    logoZone.addEventListener('click', (e) => {
      // Если клик не по canvas (внутри зоны его быть не должно)
      logoInput.click();
    });
  }
});
