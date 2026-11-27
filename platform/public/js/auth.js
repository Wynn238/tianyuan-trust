/* ==========================================================================
 * 多角色登录前端封装（消费者 / 农户 / 运营）
 * 认证接口保持不变：POST /api/auth/login|logout、GET /api/auth/me
 * 会话键保持不变：ty_token / ty_user
 * TODO: 接入正式鉴权时改为 HttpOnly Cookie + 刷新 token。
 * ========================================================================== */
(function () {
  'use strict';

  const ROLE_LABEL = { consumer: '消费者', farmer: '农户 / 合作社', admin: '运营 / 监管' };

  let currentUser = null;
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });

  /* ---------------- 会话（HttpOnly Cookie，不再读写 localStorage） ---------------- */
  function getToken() { return ''; }
  function getUser() { return currentUser; }
  function setSession(token, user) { currentUser = user || null; }
  function clearSession() { currentUser = null; }
  function isLogged() { return !!currentUser; }
  function hasRole() {
    const u = getUser();
    if (!u) return false;
    const roles = Array.prototype.slice.call(arguments).flat().filter(Boolean);
    return !roles.length || roles.indexOf(u.role) >= 0;
  }
  function hasPermission(perm) {
    const u = getUser();
    if (!u) return false;
    return Array.isArray(u.permissions) && u.permissions.indexOf(perm) >= 0;
  }
  function requireRole() { return hasRole.apply(null, arguments); }

  async function refreshMe() {
    try {
      const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
      if (!res.ok) { currentUser = null; return null; }
      const data = await res.json();
      currentUser = data.user || null;
      return currentUser;
    } catch (e) { currentUser = null; return null; }
  }

  /* ---------------- 请求与错误文案 ---------------- */
  function mapError(status, message) {
    const msg = String(message || '');
    if (status === 0) return '网络连接失败，请检查服务后重试';
    if (status === 408) return '登录超时，请稍后重试';
    if (/不属于所选角色|无权访问/.test(msg)) return '当前账号无权访问该工作台';
    if (status === 401 || /密码不正确|手机号或密码/.test(msg)) return '手机号或密码不正确';
    if (status === 400 && msg) return msg;
    return msg || '登录失败，请稍后重试';
  }

  async function loginRequest(payload) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    let res;
    try {
      res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
    } catch (e) {
      const err = new Error(e && e.name === 'AbortError' ? mapError(408) : mapError(0));
      err.status = e && e.name === 'AbortError' ? 408 : 0;
      throw err;
    } finally {
      clearTimeout(timer);
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) {
      const err = new Error(mapError(res.status, data && data.error && data.error.message));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function login(payload) {
    const data = await loginRequest(payload);
    setSession(data.token, data.user);
    renderNavAuth();
    return data.user;
  }

  function logoutTarget(user) {
    if (!user) return '/';
    if (user.role === 'farmer') return '/farmer.html';
    if (user.role === 'admin') return '/admin.html';
    return '/';
  }

  async function logout() {
    const user = getUser();
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (e) { /* 网络失败也清本地 */ }
    clearSession();
    toast('已退出登录');
    const target = logoutTarget(user);
    setTimeout(() => { location.href = target; }, 300);
  }

  function handle401() {
    const user = getUser();
    clearSession();
    if (location.pathname.indexOf('farmer') >= 0 || location.pathname.indexOf('admin') >= 0) {
      location.reload();
      return;
    }
    openLogin({ desc: '登录状态已过期，请重新登录后继续。' });
    void user;
  }

  /* ---------------- 表单校验 ---------------- */
  function validate(phone, password) {
    if (!phone) return '请输入 11 位手机号';
    if (!/^1\d{10}$/.test(phone)) return '请输入正确的手机号';
    if (!password) return '请输入密码';
    return '';
  }

  function setError(box, message) {
    const el = box.querySelector('[data-login-error]');
    if (!el) return;
    el.innerHTML = message ? icon('alert') + '<span>' + esc(message) + '</span>' : '';
    const input = box.querySelector('[name=phone]');
    if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  /* ---------------- 密码显示 / 隐藏 ---------------- */
  function bindPasswordToggle(root) {
    const btn = root.querySelector('[data-pw-toggle]');
    if (!btn) return;
    btn.onclick = () => {
      const input = root.querySelector('[name=password]');
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(show));
      btn.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
      btn.innerHTML = icon(show ? 'eyeOff' : 'eye');
      input.focus();
    };
  }

  /* ---------------- 消费者登录 / 注册弹窗 ---------------- */
  let loginModal = null;

  function authChoiceBody(desc) {
    return `
      <div class="authv2" data-authv2>
        <aside class="authv2__aside">
          <div class="authv2__brand">
            <span class="authv2__mark">${icon('leaf')}</span>
            <div>
              <p class="authv2__brand-name">田源可信</p>
              <p class="authv2__brand-sub">溯源助农平台</p>
            </div>
          </div>
          <div class="authv2__quote">
            <p class="authv2__kicker">从田间到餐桌</p>
            <h2>让每一颗果子，<br>都带着证据进城。</h2>
            <p>农事记录、检测报告和冷链温度写在同一份档案里。买得明白，卖得有底气。</p>
          </div>
          <div class="authv2__seal">
            <span>${icon('shield')}</span>
            <p>链上存证 · 扫码可查</p>
          </div>
        </aside>
        <section class="authv2__main">
          <button class="authv2__close" type="button" data-close aria-label="关闭">${icon('x')}</button>

          <div class="authv2__view" data-view="choice">
            <p class="authv2__step">消费者账户</p>
            <h1 class="authv2__title">先确认一下</h1>
            <p class="authv2__lede">${esc(desc)}</p>
            <div class="authv2__choices">
              <button class="authv2__choice" type="button" data-mode="login">
                <span class="authv2__num">01</span>
                <span class="authv2__choice-text">
                  <strong>我已经有账号</strong>
                  <span>用手机号和密码登录</span>
                </span>
                <span class="authv2__arrow">${icon('arrowRight')}</span>
              </button>
              <button class="authv2__choice" type="button" data-mode="register">
                <span class="authv2__num">02</span>
                <span class="authv2__choice-text">
                  <strong>我第一次来</strong>
                  <span>创建一个消费者账号</span>
                </span>
                <span class="authv2__arrow">${icon('arrowRight')}</span>
              </button>
            </div>
            <p class="authv2__fine">登录或注册即表示同意《服务条款》与《隐私政策》。</p>
            <div class="authv2__portal">
              <a href="/farmer.html">农户 / 合作社入口</a>
              <a href="/admin.html">运营 / 监管入口</a>
            </div>
          </div>

          <form class="authv2__form" data-view="login" novalidate hidden>
            <button class="authv2__back" type="button" data-back>${icon('arrowRight')} 返回</button>
            <p class="authv2__step">账户登录</p>
            <h1 class="authv2__title">欢迎回来</h1>
            <p class="authv2__lede">登录后可下单、查订单、申请理赔和评价。</p>
            <label class="authv2__field">
              <span>手机号</span>
              <input class="authv2__input" name="phone" type="tel" inputmode="numeric" autocomplete="username" placeholder="11 位手机号">
            </label>
            <label class="authv2__field">
              <span>密码</span>
              <div class="pw-wrap">
                <input class="authv2__input" name="password" type="password" autocomplete="current-password" placeholder="请输入密码">
                <button class="pw-toggle" type="button" data-pw-toggle aria-label="显示密码" aria-pressed="false">${icon('eye')}</button>
              </div>
            </label>
            <p class="authv2__error" data-error role="alert" aria-live="polite"></p>
            <button class="btn btn--primary authv2__submit" type="submit">登录</button>
            <p class="authv2__switch">还没有账号？<button type="button" data-mode="register">马上注册</button></p>
          </form>

          <form class="authv2__form" data-view="register" novalidate hidden>
            <button class="authv2__back" type="button" data-back>${icon('arrowRight')} 返回</button>
            <p class="authv2__step">创建消费者账号</p>
            <h1 class="authv2__title">第一次来</h1>
            <p class="authv2__lede">注册后可下单、查看溯源档案和申请理赔。</p>
            <div class="authv2__row">
              <label class="authv2__field">
                <span>昵称</span>
                <input class="authv2__input" name="nickname" maxlength="20" autocomplete="nickname" placeholder="怎么称呼你">
              </label>
              <label class="authv2__field">
                <span>手机号</span>
                <input class="authv2__input" name="phone" type="tel" inputmode="numeric" autocomplete="username" placeholder="11 位手机号">
              </label>
            </div>
            <label class="authv2__field">
              <span>设置密码</span>
              <div class="pw-wrap">
                <input class="authv2__input" name="password" type="password" autocomplete="new-password" placeholder="至少 6 位">
                <button class="pw-toggle" type="button" data-pw-toggle aria-label="显示密码" aria-pressed="false">${icon('eye')}</button>
              </div>
            </label>
            <label class="authv2__field">
              <span>确认密码</span>
              <input class="authv2__input" name="confirm" type="password" autocomplete="new-password" placeholder="再输一次">
            </label>
            <label class="authv2__agree">
              <input type="checkbox" name="agree">
              <span>我已阅读并同意《服务条款》与《隐私政策》</span>
            </label>
            <p class="authv2__error" data-error role="alert" aria-live="polite"></p>
            <button class="btn btn--primary authv2__submit" type="submit">注册并登录</button>
            <p class="authv2__switch">已经有账号？<button type="button" data-mode="login">直接登录</button></p>
          </form>
        </section>
      </div>`;
  }

  function openLogin(opts) {
    const o = Object.assign({ role: 'consumer', desc: '浏览与扫码溯源无需登录；登录后可以下单、查看订单、申请理赔和评价。', onSuccess: null }, opts || {});
    const trigger = document.activeElement && document.activeElement !== document.body
      ? document.activeElement
      : document.querySelector('[data-auth-login]');
    if (loginModal) { try { loginModal.close(); } catch (e) { /* ignore */ } }

    loginModal = modal({
      title: '',
      body: authChoiceBody(o.desc),
      width: '980px',
      className: 'authv2-modal',
      bare: true,
      onClose: () => { if (trigger && typeof trigger.focus === 'function') setTimeout(() => trigger.focus(), 0); },
    });

    const box = loginModal.box;
    const root = box.querySelector('[data-authv2]');
    const views = root.querySelectorAll('[data-view]');
    let busy = false;

    function show(name) {
      root.dataset.view = name;
      views.forEach((node) => { node.hidden = node.dataset.view !== name; });
      const target = name === 'choice'
        ? root.querySelector('[data-mode="login"]')
        : root.querySelector(`[data-view="${name}"] [name="${name === 'register' ? 'nickname' : 'phone'}"]`);
      if (target) setTimeout(() => target.focus(), 60);
    }

    function formError(form, msg) {
      const el = form.querySelector('[data-error]');
      if (!el) return;
      el.textContent = msg || '';
      el.hidden = !msg;
    }

    async function submitLogin(form) {
      if (busy) return false;
      const phone = form.querySelector('[name=phone]').value.trim();
      const password = form.querySelector('[name=password]').value;
      const err = validate(phone, password);
      if (err) { formError(form, err); return false; }
      busy = true;
      formError(form, '');
      const btn = form.querySelector('[type=submit]');
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = '登录中…';
      try {
        const user = await login({ phone, password, role: 'consumer' });
        toast('欢迎，' + user.name);
        loginModal.close();
        if (typeof o.onSuccess === 'function') setTimeout(() => o.onSuccess(user), 80);
        return true;
      } catch (e) {
        formError(form, e.message || '登录失败');
        return false;
      } finally {
        busy = false;
        btn.disabled = false;
        btn.textContent = label;
      }
    }

    async function submitRegister(form) {
      if (busy) return false;
      const nickname = form.querySelector('[name=nickname]').value.trim();
      const phone = form.querySelector('[name=phone]').value.trim();
      const password = form.querySelector('[name=password]').value;
      const confirm = form.querySelector('[name=confirm]').value;
      if (!nickname) { formError(form, '请填写昵称'); return false; }
      if (!/^1\d{10}$/.test(phone)) { formError(form, '请输入正确的 11 位手机号'); return false; }
      if (password.length < 6) { formError(form, '密码至少 6 位'); return false; }
      if (password !== confirm) { formError(form, '两次输入的密码不一致'); return false; }
      if (!form.querySelector('[name=agree]').checked) { formError(form, '请先同意服务条款与隐私政策'); return false; }
      busy = true;
      formError(form, '');
      const btn = form.querySelector('[type=submit]');
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = '创建中…';
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, password, nickname, agree: true }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data.error && data.error.message) || '注册失败');
        const user = data.user;
        setSession(null, user);
        renderNavAuth();
        toast('账号已创建，欢迎你');
        loginModal.close();
        if (typeof o.onSuccess === 'function') setTimeout(() => o.onSuccess(user), 80);
        return true;
      } catch (e) {
        formError(form, e.message || '注册失败');
        return false;
      } finally {
        busy = false;
        btn.disabled = false;
        btn.textContent = label;
      }
    }

    root.addEventListener('click', (e) => {
      const mode = e.target.closest('[data-mode]');
      if (mode) { show(mode.dataset.mode); return; }
      if (e.target.closest('[data-back]')) show('choice');
    });
    root.querySelector('[data-view="login"]').addEventListener('submit', (e) => {
      e.preventDefault();
      void submitLogin(e.currentTarget);
    });
    root.querySelector('[data-view="register"]').addEventListener('submit', (e) => {
      e.preventDefault();
      void submitRegister(e.currentTarget);
    });
    bindPasswordToggle(box);
    show('choice');
    return loginModal;
  }

  /* ---------------- 整页登录门（农户 / 运营） ---------------- */
  function ridgeTexture() {
    return `<svg class="gate__texture" viewBox="0 0 640 360" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="rgba(27,75,52,.13)" stroke-width="1.5">
        <path d="M-20 250 Q 140 200 320 246 T 660 242"/>
        <path d="M-20 292 Q 150 240 330 288 T 660 282"/>
        <path d="M-20 334 Q 160 282 340 328 T 660 322"/>
      </g>
    </svg>`;
  }
  function gridTexture() {
    return `<svg class="gate__texture" width="100%" height="100%" aria-hidden="true">
      <defs><pattern id="gateGrid" width="34" height="34" patternUnits="userSpaceOnUse">
        <path d="M34 0H0V34" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="1"/>
      </pattern></defs>
      <rect width="100%" height="100%" fill="url(#gateGrid)"/>
    </svg>`;
  }

  function gatePanel(formHtml, g, denied) {
    const isAdmin = g.role === 'admin';
    const deniedHtml = denied
      ? `<div class="gate__denied">${icon('alert')}<span>当前账号是「${esc(ROLE_LABEL[denied] || denied)}」，无权访问该工作台。请用${isAdmin ? '运营' : '农户'}账号登录。</span></div>`
      : '';
    return `
      <section class="gate__panel">
        <p class="gate__eyebrow">${isAdmin ? '运营 / 监管账户' : '农户 / 合作社入口'}</p>
        <h2 class="gate__panel-title">${isAdmin ? '登录控制台' : '登录农户工作台'}</h2>
        <p class="gate__panel-lede">${isAdmin ? '仅限平台运营与监管账户登录，权限校验最严格。' : '使用农户或合作社手机号登录。'}</p>
        ${isAdmin ? '' : '<div class="gate__modes"><span aria-current="true">登录</span><a href="/farmer-apply.html">注册农户</a></div>'}
        ${deniedHtml}
        ${formHtml}
        <p class="login-hint">${isAdmin ? '账号由平台统一开通，如需变更请联系系统管理员。' : '登录遇到问题？请联系所在合作社管理员。'}</p>
        ${denied ? `<button class="btn btn--ghost btn--sm" type="button" data-switch style="justify-self:start;padding-inline:0">退出当前账号并切换</button>` : ''}
      </section>`;
  }

  function showGate(gate) {
    const g = Object.assign({ role: 'farmer' }, gate || {});
    if (document.querySelector('[data-auth-gate]')) return;
    const isAdmin = g.role === 'admin';
    const denied = g.denied || null;
    const main = document.querySelector('main');
    if (main) main.style.display = 'none';
    document.body.style.overflow = 'hidden';

    const art = (!isAdmin)
      ? `<figure class="gate__photo">
           <img src="/assets/photos/pear.jpg" alt="砀山梨园里挂在枝头的梨" width="960" height="720" loading="lazy">
           <figcaption>砀山 · 梨园实拍 · 2026-09-12</figcaption>
         </figure>`
      : '';
    const points = isAdmin
      ? `<div class="gate__tags">
           <span class="gate__tag">${icon('clipboard')} 商品审核</span>
           <span class="gate__tag">${icon('alert')} 预警处置</span>
           <span class="gate__tag">${icon('link')} 链账本</span>
         </div>`
      : `<ul class="gate__points">
           <li class="gate__point">${icon('qr')}<span>一个批次一枚溯源码，扫码即可回看全过程</span></li>
           <li class="gate__point">${icon('mic')}<span>语音、拍照、扫码记录农事，不用打字</span></li>
           <li class="gate__point">${icon('shield')}<span>提交后生成链上凭证，消费者可自行核验</span></li>
         </ul>`;

    const wrap = document.createElement('div');
    wrap.className = 'gate ' + (isAdmin ? 'gate--admin' : 'gate--farmer');
    wrap.setAttribute('data-auth-gate', '');
    wrap.innerHTML = `
      <div class="gate__shell">
        <aside class="gate__aside ${isAdmin ? 'gate__aside--dark' : ''}">
          ${isAdmin ? gridTexture() : ridgeTexture()}
          <div class="gate__brand">
            <span class="gate__mark">${icon('leaf')}</span>
            <div>
              <p class="gate__brand-name" style="margin:0">田源可信</p>
              <p class="gate__brand-sub" style="margin:0">${isAdmin ? '运营与监管' : '溯源助农平台'}</p>
            </div>
          </div>
          <h1 class="gate__title">${isAdmin ? '运营与监管台' : '欢迎回到田间'}</h1>
          <p class="gate__lede">${isAdmin
            ? '集中处理商品审核、风险预警与链账本查验。这里的每一次处置都会留下记录。'
            : '管理批次、记录农事、查看订单与结算，让每一份收成都留下记录。'}</p>
          ${points}
          ${art}
          ${isAdmin ? '<p class="gate__aside-note">权限由服务端校验 · 每次处置写入链上留痕</p>' : ''}
        </aside>
        ${gatePanel(`
          <form class="login-form" data-gate-form novalidate>
            <label class="login-field">
              <span class="login-label">手机号</span>
              <input class="login-input" name="phone" type="tel" inputmode="numeric" autocomplete="username"
                placeholder="请输入 11 位手机号" aria-describedby="gate-error">
            </label>
            <label class="login-field">
              <span class="login-label">密码</span>
              <div class="pw-wrap">
                <input class="login-input" name="password" type="password" autocomplete="current-password"
                  placeholder="请输入密码" aria-describedby="gate-error">
                <button class="pw-toggle" type="button" data-pw-toggle aria-label="显示密码" aria-pressed="false">${icon('eye')}</button>
              </div>
            </label>
            <p class="login-error" id="gate-error" data-login-error role="alert" aria-live="polite"></p>
            <button class="btn btn--primary login-submit" type="submit">${isAdmin ? '登录控制台' : '登录并进入'}</button>
          </form>`, g, denied)}`;
    document.body.appendChild(wrap);

    const panel = wrap.querySelector('.gate__panel');
    const form = wrap.querySelector('[data-gate-form]');
    bindPasswordToggle(wrap);

    let busy = false;
    const submit = async (phone, password) => {
      if (busy) return;
      const err = validate(phone, password);
      if (err) { setError(wrap, err); return; }
      busy = true;
      setError(wrap, '');
      const btn = wrap.querySelector('.login-submit');
      const label = btn.textContent;
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.textContent = '登录中…';
      try {
        await login({ phone, password, role: g.role });
        btn.textContent = '登录成功';
        location.reload();
      } catch (e) {
        setError(wrap, e.message || '登录失败');
      } finally {
        busy = false;
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.textContent = label;
      }
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      submit(form.querySelector('[name=phone]').value.trim(), form.querySelector('[name=password]').value);
    };
    const sw = wrap.querySelector('[data-switch]');
    if (sw) sw.onclick = async () => { await logout(); };

    // 非表单元素接收初始焦点，避免移动端自动弹出键盘
    panel.setAttribute('tabindex', '-1');
    setTimeout(() => panel.focus(), 40);
  }

  /* ---------------- 页面守卫 ---------------- */
  function loadPageScript(src) {
    if (document.readyState === 'loading') {
      document.write('<script src="' + src + '"><\/script>');
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    document.body.appendChild(s);
  }

  function requirePage(opts) {
    const roles = opts.roles || [];
    ready.then(() => {
      if (hasRole(roles)) {
        if (opts.script) loadPageScript(opts.script);
        renderNavAuth();
        return;
      }
      const user = getUser();
      const gate = Object.assign({}, opts.gate || {});
      if (user) gate.denied = user.role;
      showGate(gate);
      renderNavAuth();
    });
    return false;
  }

  function withLogin(fn, opts) {
    if (isLogged()) return fn();
    openLogin(Object.assign({}, opts || {}, { onSuccess: () => fn() }));
    return null;
  }

  /* ---------------- 导航登录态 ---------------- */
  function renderNavAuth() {
    const slot = document.querySelector('[data-auth-slot]');
    if (!slot) return;
    const user = getUser();
    document.querySelectorAll('[data-admin-link]').forEach((n) => { n.hidden = !hasPermission('admin.overview'); });
    document.querySelectorAll('[data-role-entry]').forEach((entry) => {
      entry.innerHTML = '';
      if (!user) return;
      if (user.role === 'farmer') entry.innerHTML = user.status === 'active' ? '<a class="btn btn--secondary btn--sm" href="/farmer.html">我的工作台</a>' : '<a class="btn btn--secondary btn--sm" href="/farmer-apply.html">入驻审核中</a>';
      else if (user.role === 'admin') entry.innerHTML = '<a class="btn btn--secondary btn--sm" href="/admin.html">管理后台</a>';
    });
    document.querySelectorAll('[data-guest-only]').forEach((n) => { n.style.display = user ? 'none' : ''; });
    if (user) {
      const accountHref = user.role === 'consumer' ? '/account.html' : user.role === 'farmer' ? '/farmer.html' : '/admin.html';
      slot.innerHTML = `
        <a class="nav__account" href="${accountHref}" title="${esc(ROLE_LABEL[user.role] || user.role)}">${icon('user')}<span>${esc(user.name)}</span></a>
        <button class="btn btn--ghost btn--sm" type="button" data-auth-logout>退出</button>`;
      const out = slot.querySelector('[data-auth-logout]');
      if (out) out.onclick = logout;
    } else {
      slot.innerHTML = `<button class="btn btn--secondary btn--sm" type="button" data-auth-login>登录</button>`;
      const btn = slot.querySelector('[data-auth-login]');
      if (btn) btn.onclick = () => openLogin({});
    }
  }

  function boot() {
    refreshMe().finally(() => {
      renderNavAuth();
      if (resolveReady) resolveReady();
    });
    window.addEventListener('auth:required', handle401);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.Auth = {
    getToken, getUser, isLogged, hasRole, hasPermission, requireRole,
    login, logout, openLogin, showGate, requirePage, withLogin, handle401, renderNavAuth, refreshMe,
    ready,
  };
})();
