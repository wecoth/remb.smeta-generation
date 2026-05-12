/* ════════════════════════════════════════════════
   REMB Auth Module  —  js/auth.js
════════════════════════════════════════════════ */

const N8N_BASE = 'https://assistcloudai.xyz/webhook';

window._auth = {

   // Состояние ручного кадрирования логотипа
let _cropState = {
  img: null,
  startX: 0, startY: 0,
  rect: null,
  dragging: false,
  canvas: null,
};

  async checkAuth() {
    const token = localStorage.getItem('remb_token');
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
        // Fallback: если сервер не вернул размеры логотипов — берём из localStorage
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

  handleProfileLogo(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      initCrop(img);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
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
      // Размеры логотипов
      coverLogoWidth:   (window.appState && window.appState.coverLogoWidth   != null) ? window.appState.coverLogoWidth   : null,
      coverLogoHeight:  (window.appState && window.appState.coverLogoHeight  != null) ? window.appState.coverLogoHeight  : null,
      footerLogoHeight: (window.appState && window.appState.footerLogoHeight != null) ? window.appState.footerLogoHeight : null,
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

    // Кнопка в сайдбаре
    const sidebarName = document.getElementById('sidebarCompanyName');
    if (sidebarName && profile.companyName) sidebarName.textContent = profile.companyName;

    // Скрытые поля — liveUpdate() читает именно их
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el !== null) el.value = val || '';
    };
    set('companyName',   profile.companyName);
    set('companySlogan', profile.slogan);
    set('executorName',  profile.ownerName);
    set('companyPhone',  profile.phone);
    set('companyOgrn',   profile.ogrn);

    // Логотип → window.appState.logoData (state.js делает window.appState = appState)
    if (profile.logoBase64) {
      if (window.appState) window.appState.logoData = profile.logoBase64;
      const preview = document.getElementById('logoPreview');
      if (preview) { preview.src = profile.logoBase64; preview.style.display = 'block'; }
      const ph = document.getElementById('logoPlaceholder');
      if (ph) ph.style.display = 'none';
    }

    // Перерисовать превью с задержкой (дать время модулю инициализироваться)
    setTimeout(() => {
      if (window._smetaModule && window._smetaModule.liveUpdate) {
        window._smetaModule.liveUpdate();
      }
    }, 100);

    // Применяем размеры логотипов из профиля
    if (window.appState) {
      if (profile.coverLogoWidth   != null) window.appState.coverLogoWidth   = profile.coverLogoWidth;
      if (profile.coverLogoHeight  != null) window.appState.coverLogoHeight  = profile.coverLogoHeight;
      if (profile.footerLogoHeight != null) window.appState.footerLogoHeight = profile.footerLogoHeight;
    }

    // Сохраняем в localStorage как fallback
    const sizes = {
      coverLogoWidth:   profile.coverLogoWidth   ?? null,
      coverLogoHeight:  profile.coverLogoHeight  ?? null,
      footerLogoHeight: profile.footerLogoHeight ?? null,
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

// ─── Функции ручного кадрирования логотипа ─────────────────────

function resetCropUI() {
  const prev = document.getElementById('profileLogoPreview');
  const ph = document.getElementById('profileLogoPlaceholder');
  const canvas = document.getElementById('logoCropCanvas');
  const controls = document.getElementById('cropControls');
  if (prev) prev.style.display = 'none';
  if (ph) ph.style.display = 'block';
  if (canvas) { canvas.style.display = 'none'; canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height); }
  if (controls) controls.style.display = 'none';
}

function initCrop(imgElement) {
  const canvas = document.getElementById('logoCropCanvas');
  const controls = document.getElementById('cropControls');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const maxW = 400; // максимальная ширина превью
  const scale = Math.min(1, maxW / imgElement.naturalWidth);
  canvas.width = imgElement.naturalWidth * scale;
  canvas.height = imgElement.naturalHeight * scale;
  ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);

  _cropState.img = imgElement;
  _cropState.rect = null;
  _cropState.canvas = canvas;
  canvas.style.display = 'block';
  controls.style.display = 'flex';
  document.getElementById('profileLogoPreview').style.display = 'none';
  document.getElementById('profileLogoPlaceholder').style.display = 'none';

  // обработчики мыши
  canvas.onmousedown = (e) => {
    const rect = canvas.getBoundingClientRect();
    _cropState.startX = e.clientX - rect.left;
    _cropState.startY = e.clientY - rect.top;
    _cropState.dragging = true;
    _cropState.rect = null;
  };
  canvas.onmousemove = (e) => {
    if (!_cropState.dragging) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(_cropState.startX, e.clientX - rect.left);
    const y = Math.min(_cropState.startY, e.clientY - rect.top);
    const w = Math.abs(e.clientX - rect.left - _cropState.startX);
    const h = Math.abs(e.clientY - rect.top - _cropState.startY);
    _cropState.rect = { x, y, w, h };
    drawCropRect();
  };
  canvas.onmouseup = () => {
    _cropState.dragging = false;
  };
}

function drawCropRect() {
  const { canvas, rect, img } = _cropState;
  if (!canvas || !img) return;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (rect && rect.w > 5 && rect.h > 5) {
    ctx.strokeStyle = '#4a6fe3';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.setLineDash([]);
  }
}

function confirmCrop() {
  const { canvas, rect, img } = _cropState;
  if (!rect || rect.w < 5 || rect.h < 5) return;
  
  const scaleX = img.naturalWidth / canvas.width;
  const scaleY = img.naturalHeight / canvas.height;
  const sx = rect.x * scaleX;
  const sy = rect.y * scaleY;
  const sw = rect.w * scaleX;
  const sh = rect.h * scaleY;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = sw;
  outCanvas.height = sh;
  const outCtx = outCanvas.getContext('2d');
  outCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  
  const trimmed = outCanvas.toDataURL('image/png');
  window._auth._pendingLogoBase64 = trimmed;
  
  // Показываем результат
  const preview = document.getElementById('profileLogoPreview');
  preview.src = trimmed;
  preview.style.display = 'block';
  canvas.style.display = 'none';
  document.getElementById('cropControls').style.display = 'none';
  document.getElementById('profileLogoPlaceholder').style.display = 'none';
}

// Привязываем кнопки после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
  const confirmBtn = document.getElementById('cropConfirmBtn');
  const cancelBtn = document.getElementById('cropCancelBtn');
  if (confirmBtn) confirmBtn.addEventListener('click', confirmCrop);
  if (cancelBtn) cancelBtn.addEventListener('click', resetCropUI);
});

};
