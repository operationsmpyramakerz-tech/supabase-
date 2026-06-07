document.addEventListener('DOMContentLoaded', function () {
  const loginForm = document.getElementById('loginForm');
  const forgotPasswordForm = document.getElementById('forgotPasswordForm');
  const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
  const backToLoginBtn = document.getElementById('backToLoginBtn');
  const signupForm = document.getElementById('signupForm');
  const showSignupBtn = document.getElementById('showSignupBtn');
  const backFromSignupBtn = document.getElementById('backFromSignupBtn');
  const recoveryEmailInput = document.getElementById('recoveryEmail');
  const errorMessage = document.getElementById('error-message');
  const loginBtn = loginForm.querySelector('.login-btn');
  const recoveryBtn = forgotPasswordForm ? forgotPasswordForm.querySelector('.recovery-btn') : null;
  const signupBtn = signupForm ? signupForm.querySelector('.signup-submit-btn') : null;
  const loginHeaderTitle = document.querySelector('.login-brand-title');
  const loginHeaderSubtitle = document.querySelector('.login-subtitle');
  const loginLogoStage = document.getElementById('loginLogoStage');
  const loginInlineLogoPieces = document.getElementById('loginInlineLogoPieces');
  let authModeSwitching = false;
  const LOGIN_LOGO_ANIMATION_VARIANT = 'explode';
  const LOGIN_LOGO_ANIMATION_MIN_MS = {
    explode: 2200,
    pulse: 1950,
    line: 2300,
    slide: 2200,
  }[LOGIN_LOGO_ANIMATION_VARIANT] || 2150;
  if (loginLogoStage) loginLogoStage.dataset.logoAnimation = LOGIN_LOGO_ANIMATION_VARIANT;
  try { document.body.dataset.loginLogoAnimation = LOGIN_LOGO_ANIMATION_VARIANT; } catch {}



  const cardThemeButtons = Array.from(document.querySelectorAll('[data-card-theme]'));
  const CARD_THEME_KEY = 'pyramakerz-login-card-theme';
  const allowedCardThemes = new Set(['white', 'orange', 'navy', 'black']);

  function applyLoginCardTheme(theme, persist = true) {
    const nextTheme = allowedCardThemes.has(theme) ? theme : 'white';
    document.body.dataset.loginCardTheme = nextTheme;
    cardThemeButtons.forEach((button) => {
      const isSelected = button.dataset.cardTheme === nextTheme;
      button.setAttribute('aria-pressed', String(isSelected));
    });
    if (persist) {
      try { localStorage.setItem(CARD_THEME_KEY, nextTheme); } catch {}
    }
  }

  let savedCardTheme = 'white';
  try { savedCardTheme = localStorage.getItem(CARD_THEME_KEY) || 'white'; } catch {}
  applyLoginCardTheme(savedCardTheme, false);

  cardThemeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      applyLoginCardTheme(button.dataset.cardTheme || 'white');
    });
  });

  function sanitizeMessage(message) {
    const value = String(message || '').trim();
    if (!value) return value;
    const internalRe = /(notion|supabase|database\s*id|database\s*ids|team_members|vercel|environment\s+variables?|service_role|api\s*key|schema|migration|rpc|rest|sql|table\s+is\s+not\s+configured)/i;
    return internalRe.test(value) ? 'Invalid username or password.' : value;
  }

  function showMessage(message, type = 'error') {
    errorMessage.textContent = sanitizeMessage(message);
    errorMessage.classList.toggle('success-message', type === 'success');
    errorMessage.classList.toggle('error-message', type !== 'success');
    errorMessage.style.display = 'block';
  }

  function showError(message) {
    showMessage(message, 'error');
  }

  function showSuccess(message) {
    showMessage(message, 'success');
  }

  function hideError() {
    errorMessage.style.display = 'none';
    errorMessage.textContent = '';
  }

  const LOGIN_SPLASH_MARKER_KEY = 'ops.loginSplash.pendingAt';
  const CHROME_CACHE_KEY = 'ops.ui.chrome.v1';
  const ALLOWED_PAGES_KEY = 'allowedPages';

  // Clear older full-screen login splash markers. The new login transition happens
  // in-place on the logo icon inside the login card, then navigates when ready.
  try {
    sessionStorage.removeItem(LOGIN_SPLASH_MARKER_KEY);
    sessionStorage.removeItem('ops.postLogin.pendingAt');
  } catch {}

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function waitForLoginSplashMinimum(startedAt, minMs = 2150) {
    const elapsed = Date.now() - Number(startedAt || Date.now());
    return sleep(Math.max(0, minMs - elapsed));
  }

  function warmChromeCacheFromAccount(account, fallbackUsername) {
    const data = account && typeof account === 'object' ? account : {};
    const name = String(data.name || data.username || fallbackUsername || '').trim();
    const allowedPages = Array.isArray(data.allowedPages) ? data.allowedPages : [];

    try { if (name) localStorage.setItem('username', name); } catch {}
    try { if (allowedPages.length) sessionStorage.setItem(ALLOWED_PAGES_KEY, JSON.stringify(allowedPages)); } catch {}
    try {
      localStorage.setItem(CHROME_CACHE_KEY, JSON.stringify({
        name,
        username: name,
        position: String(data.position || '').trim(),
        department: String(data.department || '').trim(),
        email: String(data.email || '').trim(),
        photoUrl: String(data.photoUrl || '').trim(),
        allowedPages,
        savedAt: Date.now(),
      }));
    } catch {}
  }

  async function fetchAccountForWarmCache(username) {
    try {
      const res = await fetch('/api/account?_login_check=' + Date.now(), {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const account = await res.json().catch(() => null);
      warmChromeCacheFromAccount(account, username);
      return account;
    } catch {
      return null;
    }
  }


function buildInlineLoginLogoPiecesMarkup() {
    const variant = LOGIN_LOGO_ANIMATION_VARIANT;

    if (variant === 'pulse') {
      return [0, 1, 2].map((index) => (
        `<span class="login-inline-logo-pulse-echo" style="--d:${(index * 0.16).toFixed(2)}s;"></span>`
      )).join('');
    }

    const grid = 4;
    const pieces = [];
    for (let row = 0; row < grid; row += 1) {
      for (let col = 0; col < grid; col += 1) {
        const index = (row * grid) + col;
        const cx = col - ((grid - 1) / 2);
        const cy = row - ((grid - 1) / 2);
        const distance = Math.max(Math.abs(cx), Math.abs(cy));
        const diagonalBias = (row - col) * 3;
        const bgX = grid === 1 ? 0 : (col / (grid - 1)) * 100;
        const bgY = grid === 1 ? 0 : (row / (grid - 1)) * 100;
        let style = `background-position:${bgX}% ${bgY}%;`;

        if (variant === 'line') {
          const lineOrder = ((1.6 - distance) * 0.19) + ((row + col) * 0.025);
          const revealX = cx < 0 ? -1 : 1;
          const revealY = cy < 0 ? -1 : 1;
          style += `--d:${(0.04 + lineOrder).toFixed(3)}s;--line-x:${revealX};--line-y:${revealY};`;
        } else if (variant === 'slide') {
          const fromX = Math.round((cx <= 0 ? -1 : 1) * (72 + Math.abs(cx) * 14) + diagonalBias);
          const fromY = Math.round((cy <= 0 ? -1 : 1) * (42 + Math.abs(cy) * 10) - diagonalBias);
          const settleX = Math.round(fromX * -0.10);
          const settleY = Math.round(fromY * -0.10);
          const rot = Math.round((cx - cy) * 7);
          const delay = (0.03 + ((row + col) * 0.032)).toFixed(3);
          style += `--tx:${fromX}px;--ty:${fromY}px;--sx:${settleX}px;--sy:${settleY}px;--rot:${rot}deg;--d:${delay}s;`;
        } else {
          const spread = 30 + (distance * 16);
          const tx = Math.round(cx * spread + (((index % 3) - 1) * 5));
          const ty = Math.round(cy * spread + ((((index + 1) % 3) - 1) * 5));
          const orbit = Math.round((index % 2 ? 1 : -1) * (18 + distance * 10));
          const returnX = Math.round(tx * -0.18);
          const returnY = Math.round(ty * -0.18);
          const delay = (0.02 + ((row + col) * 0.022)).toFixed(3);
          style += `--tx:${tx}px;--ty:${ty}px;--rx:${returnX}px;--ry:${returnY}px;--rot:${orbit}deg;--d:${delay}s;`;
        }

        pieces.push(`<span class="login-inline-logo-piece" style="${style}"></span>`);
      }
    }
    return pieces.join('');
  }

  function prepareInlineLoginLogoPieces() {
    if (!loginInlineLogoPieces) return;
    if (loginInlineLogoPieces.dataset.ready === LOGIN_LOGO_ANIMATION_VARIANT) return;
    loginInlineLogoPieces.innerHTML = buildInlineLoginLogoPiecesMarkup();
    loginInlineLogoPieces.dataset.ready = LOGIN_LOGO_ANIMATION_VARIANT;
  }

  function startInlineLoginLogoAnimation() {
    prepareInlineLoginLogoPieces();
    try { document.body.classList.add('login-inline-success-active'); } catch {}
    if (loginLogoStage) {
      loginLogoStage.classList.remove('is-running');
      // Force a reflow so repeated failed/success attempts restart the animation cleanly.
      void loginLogoStage.offsetWidth;
      loginLogoStage.dataset.logoAnimation = LOGIN_LOGO_ANIMATION_VARIANT;
      loginLogoStage.classList.add('is-running');
    }
  }

  function buildLoginLogoPiecesMarkup() {
    const grid = 4;
    const pieces = [];
    for (let row = 0; row < grid; row += 1) {
      for (let col = 0; col < grid; col += 1) {
        const index = (row * grid) + col;
        const cx = col - ((grid - 1) / 2);
        const cy = row - ((grid - 1) / 2);
        const spread = 44 + ((Math.abs(cx) + Math.abs(cy)) * 18);
        const jitterX = ((index % 3) - 1) * 10;
        const jitterY = (((index + 1) % 3) - 1) * 9;
        const tx = Math.round((cx * spread) + jitterX);
        const ty = Math.round((cy * spread) + jitterY);
        const mx = Math.round(tx * 0.38);
        const my = Math.round(ty * 0.38);
        const rot = Math.round((cx * 18) - (cy * 16) + ((index % 2 ? 1 : -1) * 13));
        const mrot = Math.round(rot * -0.35);
        const delay = (0.03 + ((row + col) * 0.018)).toFixed(3);
        const bgX = grid === 1 ? 0 : (col / (grid - 1)) * 100;
        const bgY = grid === 1 ? 0 : (row / (grid - 1)) * 100;
        pieces.push(
          `<span class="login-success-splash__piece" style="--tx:${tx}px;--ty:${ty}px;--mx:${mx}px;--my:${my}px;--rot:${rot}deg;--mrot:${mrot}deg;--d:${delay}s;background-position:${bgX}% ${bgY}%;"></span>`
        );
      }
    }
    return pieces.join('');
  }

  function ensureLoginSuccessSplash() {
    let splash = document.getElementById('loginSuccessSplash');
    if (splash) return splash;

    splash = document.createElement('div');
    splash.id = 'loginSuccessSplash';
    splash.className = 'login-success-splash';
    splash.setAttribute('role', 'status');
    splash.setAttribute('aria-live', 'polite');
    splash.innerHTML = `
      <div class="login-success-splash__ambient" aria-hidden="true"></div>
      <div class="login-success-splash__stage" aria-hidden="true">
        <span class="login-success-splash__halo"></span>
        <span class="login-success-splash__logo-grid">
          ${buildLoginLogoPiecesMarkup()}
        </span>
        <img src="/images/logo.png" alt="" class="login-success-splash__solid-logo" />
      </div>
      <span class="sr-only">Opening dashboard</span>
    `;
    document.body.appendChild(splash);
    return splash;
  }

  function positionLoginSuccessSplashFromLogo(splash) {
    try {
      const sourceLogo = document.querySelector('.login-logo');
      const rect = sourceLogo && sourceLogo.getBoundingClientRect ? sourceLogo.getBoundingClientRect() : null;
      if (!rect || !rect.width || !rect.height) return;
      const targetSize = Math.max(96, Math.min(window.innerWidth || 0, window.innerHeight || 0, 152));
      splash.style.setProperty('--logo-start-x', `${Math.round(rect.left + (rect.width / 2))}px`);
      splash.style.setProperty('--logo-start-y', `${Math.round(rect.top + (rect.height / 2))}px`);
      splash.style.setProperty('--logo-start-scale', String(Math.max(0.28, Math.min(0.86, rect.width / targetSize))));
    } catch {}
  }

  function showLoginSuccessSplash() {
    const splash = ensureLoginSuccessSplash();
    positionLoginSuccessSplashFromLogo(splash);
    document.body.classList.add('login-success-active');
    splash.hidden = false;
    splash.classList.remove('is-leaving');
    splash.classList.add('is-active');
    return splash;
  }

  function setButtonLoading(button, loading, loadingText, normalText) {
    if (!button) return;
    const label = button.querySelector('span');
    if (loading) {
      button.classList.add('loading');
      button.disabled = true;
      if (label) label.textContent = loadingText;
      else button.textContent = loadingText;
    } else {
      button.classList.remove('loading');
      button.disabled = false;
      if (label) label.textContent = normalText;
      else button.textContent = normalText;
    }
  }

  function setLoading(loading) {
    setButtonLoading(loginBtn, loading, 'Signing In...', 'Sign In');
  }

  function setRecoveryLoading(loading) {
    setButtonLoading(recoveryBtn, loading, 'Sending...', 'Send Password');
  }

  function setSignupLoading(loading) {
    setButtonLoading(signupBtn, loading, 'Sending request...', 'Send sign up request');
  }

  function setHeaderCopy(mode) {
    if (loginHeaderTitle) loginHeaderTitle.textContent = 'Pyramakerz';
    if (loginHeaderSubtitle) loginHeaderSubtitle.textContent = '';
  }

  function showForgotMode() {
    hideError();
    authModeSwitching = false;
    document.body.classList.remove('auth-signup-mode', 'auth-transitioning-to-signup');
    document.body.classList.add('auth-recovery-mode');
    setHeaderCopy('recovery');
    loginForm.hidden = true;
    if (signupForm) signupForm.hidden = true;
    if (forgotPasswordForm) forgotPasswordForm.hidden = false;
    if (recoveryEmailInput) {
      recoveryEmailInput.value = '';
      recoveryEmailInput.blur();
    }
  }

  function showLoginMode() {
    hideError();
    authModeSwitching = false;
    document.body.classList.remove('auth-recovery-mode', 'auth-signup-mode', 'auth-transitioning-to-signup');
    setHeaderCopy('login');
    if (forgotPasswordForm) forgotPasswordForm.hidden = true;
    if (signupForm) signupForm.hidden = true;
    loginForm.hidden = false;
    if (showSignupBtn) showSignupBtn.disabled = false;
    const usernameInput = document.getElementById('username');
    if (usernameInput) usernameInput.blur();
  }

  function showSignupMode() {
    if (!signupForm || authModeSwitching) return;
    hideError();
    authModeSwitching = true;
    document.body.classList.remove('auth-recovery-mode', 'auth-signup-mode');
    document.body.classList.add('auth-transitioning-to-signup');
    if (forgotPasswordForm) forgotPasswordForm.hidden = true;
    if (showSignupBtn) showSignupBtn.disabled = true;

    window.setTimeout(() => {
      loginForm.hidden = true;
      signupForm.hidden = false;
      signupForm.reset();
      setHeaderCopy('signup');
      document.body.classList.remove('auth-transitioning-to-signup');
      document.body.classList.add('auth-signup-mode');
      if (showSignupBtn) showSignupBtn.disabled = false;
      authModeSwitching = false;
      document.getElementById('signupUsername')?.blur?.();
    }, 880);
  }

  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    hideError();
    setLoading(true);
    let loginRedirecting = false;

    const formData = new FormData(loginForm);
    const username = formData.get('username');
    const password = formData.get('password');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        const startedAt = Date.now();
        const redirectTo = result.redirect || '/home';
        loginRedirecting = true;

        // Run the transition on the existing login logo only. No separate splash page
        // or full-screen animation is shown; the user stays on the login page until
        // the account/chrome cache is warm enough to open Home cleanly.
        startInlineLoginLogoAnimation();

        const accountPromise = fetchAccountForWarmCache(username);
        try { sessionStorage.removeItem(LOGIN_SPLASH_MARKER_KEY); } catch {}
        try { sessionStorage.removeItem('ops.postLogin.pendingAt'); } catch {}

        await Promise.all([
          accountPromise.catch(() => null),
          waitForLoginSplashMinimum(startedAt, LOGIN_LOGO_ANIMATION_MIN_MS),
        ]);

        window.location.replace(redirectTo);
      } else {
        showError(response.status === 401
          ? 'Invalid username or password.'
          : (result.error || 'Login failed. Please try again.'));
      }
    } catch (error) {
      console.error('Login error:', error);
      showError('Network error. Please check your connection and try again.');
    } finally {
      if (!loginRedirecting) {
        setLoading(false);
        try { document.body.classList.remove('login-inline-success-active'); } catch {}
        if (loginLogoStage) loginLogoStage.classList.remove('is-running');
      }
    }
  });

  if (showSignupBtn) {
    showSignupBtn.addEventListener('click', showSignupMode);
  }

  if (backFromSignupBtn) {
    backFromSignupBtn.addEventListener('click', showLoginMode);
  }

  if (signupForm) {
    signupForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      hideError();

      const formData = new FormData(signupForm);
      const payload = {
        username: String(formData.get('username') || '').trim(),
        password: String(formData.get('password') || '').trim(),
        repeatPassword: String(formData.get('repeatPassword') || '').trim(),
        employeeCode: String(formData.get('employeeCode') || '').trim(),
        phone: String(formData.get('phone') || '').trim(),
        email: String(formData.get('email') || '').trim(),
      };

      if (!payload.username || !payload.password || !payload.repeatPassword || !payload.employeeCode || !payload.phone || !payload.email) {
        showError('Please fill all sign up fields.');
        return;
      }
      if (payload.password !== payload.repeatPassword) {
        showError('Passwords do not match.');
        return;
      }

      setSignupLoading(true);
      try {
        const response = await fetch('/api/signup-request', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.ok) {
          signupForm.reset();
          showSuccess(result.message || 'Your sign up request was sent successfully.');
        } else {
          showError(result.error || 'Could not send sign up request.');
        }
      } catch (error) {
        console.error('Sign up request error:', error);
        showError('Network error. Please check your connection and try again.');
      } finally {
        setSignupLoading(false);
      }
    });
  }

  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener('click', showForgotMode);
  }

  if (backToLoginBtn) {
    backToLoginBtn.addEventListener('click', showLoginMode);
  }

  if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      hideError();
      setRecoveryLoading(true);

      const email = String(recoveryEmailInput?.value || '').trim();
      if (!email) {
        setRecoveryLoading(false);
        showError('Please enter your email.');
        return;
      }

      try {
        const response = await fetch('/api/forgot-password', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        const result = await response.json().catch(() => ({}));

        if (response.ok && result.success) {
          showSuccess(result.message || 'Password sent successfully. Please check your inbox.');
        } else if (response.status === 404) {
          showError(result.error || 'No user found with this email.');
        } else {
          showError(result.error || 'Could not send password. Please try again.');
        }
      } catch (error) {
        console.error('Forgot password error:', error);
        showError('Network error. Please check your connection and try again.');
      } finally {
        setRecoveryLoading(false);
      }
    });
  }

  document.getElementById('username').addEventListener('input', hideError);
  document.getElementById('password').addEventListener('input', hideError);
  if (recoveryEmailInput) recoveryEmailInput.addEventListener('input', hideError);
  if (signupForm) signupForm.querySelectorAll('input').forEach((input) => input.addEventListener('input', hideError));

  // Toggle show/hide password
  const pwdInput = document.getElementById('password');
  const toggleBtn = document.getElementById('togglePassword');
  if (toggleBtn && pwdInput) {
    const eye = toggleBtn.querySelector('.icon-eye');
    const eyeOff = toggleBtn.querySelector('.icon-eye-off');
    toggleBtn.addEventListener('click', () => {
      const show = pwdInput.getAttribute('type') === 'password';
      pwdInput.setAttribute('type', show ? 'text' : 'password');
      toggleBtn.setAttribute('aria-pressed', String(show));
      if (eye && eyeOff) {
        eye.style.display = show ? 'none' : '';
        eyeOff.style.display = show ? '' : 'none';
      }
    });
  }

});
