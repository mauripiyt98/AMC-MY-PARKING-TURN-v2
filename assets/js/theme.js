(() => {
  'use strict';

  const storageKey = 'mpt-theme';
  const root = document.documentElement;

  function readTheme() {
    try {
      return localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light';
    } catch (_error) {
      return 'light';
    }
  }

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    root.dataset.theme = isDark ? 'dark' : 'light';
    root.style.colorScheme = isDark ? 'dark' : 'light';
    const toggle = document.querySelector('.theme-toggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(isDark));
      toggle.setAttribute('aria-label', isDark ? 'Activar modo claro' : 'Activar modo oscuro');
      toggle.title = isDark ? 'Activar modo claro' : 'Activar modo oscuro';
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(storageKey, theme);
    } catch (_error) {
      // El selector sigue funcionando aunque el navegador bloquee el almacenamiento local.
    }
  }

  function mountToggle() {
    const toggle = document.createElement('button');
    toggle.className = 'theme-toggle';
    toggle.type = 'button';
    toggle.innerHTML = `
      <span class="theme-toggle__sun" aria-hidden="true">☀</span>
      <span class="theme-toggle__moon" aria-hidden="true">☾</span>
      <span class="theme-toggle__thumb" aria-hidden="true"></span>
    `;
    toggle.addEventListener('click', () => {
      const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      saveTheme(nextTheme);
      applyTheme(nextTheme);
    });
    document.body.append(toggle);
    applyTheme(readTheme());
  }

  applyTheme(readTheme());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountToggle, { once: true });
  } else {
    mountToggle();
  }
})();
