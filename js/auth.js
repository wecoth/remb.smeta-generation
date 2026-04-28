/* ════════════════════════════════════════════════
   REMB Auth Module  —  js/auth.js
════════════════════════════════════════════════ */

const N8N_BASE = 'https://assistcloudai.xyz/webhook';

window._auth = {

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
      const b64 = e.target.result;
      document.getElementById('profileLogoPreview').src           = b64;
      document.getElementById('profileLogoPreview').style.display = 'block';
      document.getElementById('profileLogoPlaceholder').style.display = 'none';
      this._pendingLogoBase64 = b64;
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
      logoBase64:  this._pendingLogoBase64 || (this._currentProfile && this._currentProfile.logoBase64) || ''
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
