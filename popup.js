// popup.js (Corrected with logic to load current state)

const SITE_SETTINGS_KEY = 'fontSiteSettings';
const GLOBAL_SETTING_KEY = 'fontGlobalSetting';
const FONT_MAP = {
  "Dana": { name: "Dana", file: "fonts/Dana.woff2" },
  "IRANSans": { name: "IRANSans", file: "fonts/IRANSans.woff2" },
  "Vazir": { name: "Vazir", file: "fonts/Vazir.woff2" },
};

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('fontsForm');
  const rtlToggle = document.getElementById('rtlToggle');
  const saveSiteBtn = document.getElementById('saveSiteBtn');
  const saveGlobalBtn = document.getElementById('saveGlobalBtn');
  const hostnameEl = document.getElementById('hostname');

  let currentHostname = '';

  // --- Step 1: Get the current tab's hostname ---
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab?.url && tab.url.startsWith('http')) {
    currentHostname = new URL(tab.url).hostname;
    hostnameEl.textContent = currentHostname;
  } else {
    // Handle cases like chrome:// pages or local files where the extension can't run
    document.body.innerHTML = '<div class="container" style="text-align: center;"><p>Cannot apply settings to this page.</p></div>';
    return;
  }

  // --- Step 2 & 3: Load settings from storage and determine the effective rule ---
  chrome.storage.local.get([SITE_SETTINGS_KEY, GLOBAL_SETTING_KEY], (result) => {
    const siteSettings = result[SITE_SETTINGS_KEY] || {};
    const globalSetting = result[GLOBAL_SETTING_KEY] || null;
    // This is the override logic: site-specific setting wins if it exists.
    // `undefined` is the key check, because a `null` setting is a valid override.
    const siteSetting = siteSettings[currentHostname];
    const effectiveSetting = siteSetting !== undefined ? siteSetting : globalSetting;

    // --- Step 4: Reflect font choice and direction in the controls ---
    // If the effective setting names a font, use it. Otherwise, 'none'.
    const fontValue = effectiveSetting && effectiveSetting.name ? effectiveSetting.name : 'none';

    const inputToCheck = form.querySelector(`input[value="${fontValue}"]`);
    if (inputToCheck) {
      inputToCheck.checked = true;
    } else {
      // As a fallback, always check the 'none' option if something goes wrong.
      form.querySelector('input[value="none"]').checked = true;
    }

    // Direction is independent of the font. Legacy settings saved before the
    // split have no `rtl` field but always meant rtl-on, so default to true
    // whenever a setting exists without an explicit flag.
    if (effectiveSetting) {
      rtlToggle.checked = effectiveSetting.rtl === undefined ? true : !!effectiveSetting.rtl;
    } else {
      rtlToggle.checked = true;
    }
  });

  // --- Event Listeners for Saving ---

  // Combine the selected font (if any) with the direction toggle into one
  // setting object. Returns null when there is nothing to apply (no font and
  // rtl off), which callers treat as "clear this rule".
  function getSelectedMeta() {
    const font = FONT_MAP[form.font.value] || null;
    const rtl = rtlToggle.checked;
    if (!font && !rtl) return null;
    return { ...(font || {}), rtl };
  }

  saveSiteBtn.addEventListener('click', () => {
    const meta = getSelectedMeta();
    chrome.storage.local.get([SITE_SETTINGS_KEY], (result) => {
      const settings = result[SITE_SETTINGS_KEY] || {};

      if (meta === null) {
        // Nothing to apply for this site: remove its specific rule so it
        // falls back to the global setting.
        delete settings[currentHostname];
      } else {
        settings[currentHostname] = meta;
      }

      chrome.storage.local.set({ [SITE_SETTINGS_KEY]: settings }, () => window.close());
    });
  });

  saveGlobalBtn.addEventListener('click', () => {
    const meta = getSelectedMeta();
    if (meta === null) {
      chrome.storage.local.remove(GLOBAL_SETTING_KEY, () => window.close());
    } else {
      chrome.storage.local.set({ [GLOBAL_SETTING_KEY]: meta }, () => window.close());
    }
  });
});
