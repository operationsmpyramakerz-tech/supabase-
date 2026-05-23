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
  let authModeSwitching = false;

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
        // Save username from login form for greetings
        try { localStorage.setItem('username', String(username || '')); } catch {}

        // Verify that the session cookie was actually stored, then redirect.
        try {
          await fetch('/api/account?_login_check=' + Date.now(), { credentials: 'same-origin', cache: 'no-store' });
        } catch {}
        window.location.replace(result.redirect || '/home');
      } else {
        showError(response.status === 401
          ? 'Invalid username or password.'
          : (result.error || 'Login failed. Please try again.'));
      }
    } catch (error) {
      console.error('Login error:', error);
      showError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
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
