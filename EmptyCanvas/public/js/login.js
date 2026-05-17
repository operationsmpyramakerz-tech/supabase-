document.addEventListener('DOMContentLoaded', function () {
  const loginForm = document.getElementById('loginForm');
  const forgotPasswordForm = document.getElementById('forgotPasswordForm');
  const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
  const backToLoginBtn = document.getElementById('backToLoginBtn');
  const recoveryEmailInput = document.getElementById('recoveryEmail');
  const errorMessage = document.getElementById('error-message');
  const loginBtn = loginForm.querySelector('.login-btn');
  const recoveryBtn = forgotPasswordForm ? forgotPasswordForm.querySelector('.recovery-btn') : null;

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

  function showForgotMode() {
    hideError();
    loginForm.hidden = true;
    if (forgotPasswordForm) forgotPasswordForm.hidden = false;
    if (recoveryEmailInput) {
      recoveryEmailInput.value = '';
      setTimeout(() => recoveryEmailInput.focus(), 50);
    }
  }

  function showLoginMode() {
    hideError();
    if (forgotPasswordForm) forgotPasswordForm.hidden = true;
    loginForm.hidden = false;
    const usernameInput = document.getElementById('username');
    if (usernameInput) setTimeout(() => usernameInput.focus(), 50);
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
