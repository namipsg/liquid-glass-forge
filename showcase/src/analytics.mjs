import './analytics.css';

const measurementId = 'G-PE9ZPWM6WK';
const sitePath = '/liquid-glass-forge/';
const preferenceKey = 'liquid-glass-forge.analytics';
const disableKey = 'ga-disable-' + measurementId;
const denied = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
};
const granted = { analytics_storage: 'granted' };
const publicQuery = new Set(['example', 'framework', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id']);
let allowed = false;
let tag;

function readPreference() {
  try { return localStorage.getItem(preferenceKey); }
  catch { return null; }
}

function pageLocation() {
  const url = new URL(location.href);
  for (const [key, value] of [...url.searchParams]) {
    if (!publicQuery.has(key) || !/^[a-z\d_-]{1,80}$/i.test(value)) url.searchParams.delete(key);
  }
  url.hash = '';
  return url.href;
}

function applyPreference(preference) {
  allowed = preference === 'allow';
  window[disableKey] = !allowed;
  if (tag) {
    tag('consent', 'update', allowed ? granted : denied);
    return;
  }
  if (!allowed) return;

  const queue = window.dataLayer ??= [];
  tag = function () { queue.push(arguments); };
  tag('consent', 'default', denied);
  tag('consent', 'update', granted);
  tag('js', new Date());
  tag('config', measurementId, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_path: sitePath,
    cookie_prefix: 'lgf',
    page_location: pageLocation(),
    page_referrer: document.referrer ? new URL(document.referrer).origin + '/' : '',
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
  document.head.append(script);
}

export function mountAnalytics() {
  if (location.origin !== 'https://namipsg.github.io' || !location.pathname.startsWith(sitePath)) return;

  const footer = document.querySelector('.directory-credit') ?? document.querySelector('footer');
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'forge-analytics-settings';
  settings.textContent = 'Analytics settings';
  settings.setAttribute('aria-controls', 'forge-analytics');
  footer.append(settings);

  const panel = document.createElement('section');
  panel.id = 'forge-analytics';
  panel.setAttribute('aria-labelledby', 'forge-analytics-title');
  panel.innerHTML = `
    <h2 id="forge-analytics-title">Optional website analytics</h2>
    <p>Allow Google Analytics to use cookies to measure visits, traffic sources, and use of the examples and setup guides. You can change your choice in the footer. <a href="https://policies.google.com/technologies/partner-sites">How Google uses this data</a>.</p>
    <div class="forge-analytics-actions">
      <button type="button" data-choice="deny">Decline analytics</button>
      <button type="button" data-choice="allow">Allow analytics</button>
    </div>`;
  document.body.append(panel);

  function showPanel(open) {
    panel.hidden = !open;
    settings.setAttribute('aria-expanded', String(open));
  }

  const preference = readPreference();
  showPanel(preference !== 'allow' && preference !== 'deny');
  applyPreference(preference);
  settings.addEventListener('click', () => {
    showPanel(panel.hidden);
    if (!panel.hidden) panel.querySelector('button').focus();
  });
  for (const button of panel.querySelectorAll('button')) {
    button.addEventListener('click', () => {
      const choice = button.dataset.choice;
      try { localStorage.setItem(preferenceKey, choice); } catch { /* Keep the choice for this page. */ }
      applyPreference(choice);
      showPanel(false);
      if (document.activeElement === button) settings.focus({ preventScroll: true });
    });
  }
  window.addEventListener('storage', event => {
    if (event.key !== preferenceKey && event.key !== null) return;
    const choice = readPreference();
    applyPreference(choice);
    showPanel(choice !== 'allow' && choice !== 'deny');
  });
}

export function trackAnalytics(name, parameters) {
  if (allowed) tag('event', name, parameters);
}
