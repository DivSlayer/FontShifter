// content_script.js
//
// CSP STRATEGY — why no declarativeNetRequest header stripping:
//   Stripping the content-security-policy header caused infinite reload loops
//   on SPAs like Claude.ai and ChatGPT because they depend on CSP for their
//   own internal routing and security model.
//
//   Instead we use two Chromium behaviours that sidestep CSP without touching headers:
//
//   1. font-src: chrome-extension:// URLs in web_accessible_resources are ALWAYS
//      allowed to load as fonts, regardless of what font-src says in the site's CSP.
//      This is a long-standing Chromium policy (crbug.com/408756).
//
//   2. style-src 'unsafe-inline': We avoid inline <style> injection entirely.
//      Instead we use the Constructable Stylesheets API:
//        const sheet = new CSSStyleSheet();
//        sheet.replaceSync(css);
//        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
//      Adopted stylesheets are NOT subject to style-src CSP — they are treated
//      as programmatic style, equivalent to CSSOM manipulation, which is always
//      permitted. This works in Edge/Chrome 73+.

const SITE_SETTINGS_KEY = 'fontSiteSettings';
const GLOBAL_SETTING_KEY = 'fontGlobalSetting';
const TARGET_CLASS = 'ext-font-override-target';

// WeakMap tracks the CSSStyleSheet we adopted into each root, so we can
// remove it cleanly during the cleanup phase without relying on IDs.
const rootSheetMap = new WeakMap();

// Counter-based unique ID per shadow root (Bug 6 fix from previous session).
let shadowRootCounter = 0;
const shadowRootIdMap = new WeakMap();
function getShadowRootKey(root) {
  if (!shadowRootIdMap.has(root)) shadowRootIdMap.set(root, shadowRootCounter++);
  return shadowRootIdMap.get(root);
}

// --- Element Classification ---

const SAFE_TEXT_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'DT', 'DD', 'BLOCKQUOTE',
  'TD', 'TH', 'CAPTION', 'LABEL', 'LEGEND', 'BUTTON', 'PRE', 'CODE', 'STRONG', 'EM', 'B',
]);
const CONDITIONAL_TAGS = new Set([
  'DIV', 'ARTICLE', 'SECTION', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'MAIN'
]);
const NON_EMPTY_TAGS = new Set(['A', 'SPAN', 'I']);

function shouldStyleElement(element) {
  const tagName = element.tagName.toUpperCase();
  if (SAFE_TEXT_TAGS.has(tagName)) return true;
  if (NON_EMPTY_TAGS.has(tagName)) return element.textContent.trim() !== '';
  if (CONDITIONAL_TAGS.has(tagName)) {
    return Array.from(element.childNodes).some(
      node => node.nodeType === 3 && node.nodeValue.trim() !== ''
    );
  }
  return false;
}

// --- Constructable Stylesheet Helpers ---

/**
 * Removes a previously adopted stylesheet from a root's adoptedStyleSheets
 * and clears our WeakMap entry for it.
 */
function removeAdoptedSheet(root) {
  const existing = rootSheetMap.get(root);
  if (!existing) return;
  try {
    const arr = Array.from(root.adoptedStyleSheets || []);
    const idx = arr.indexOf(existing);
    if (idx !== -1) arr.splice(idx, 1);
    root.adoptedStyleSheets = arr;
  } catch (e) {
    // Some sandboxed roots may throw; safe to ignore.
  }
  rootSheetMap.delete(root);
}

/**
 * Creates a CSSStyleSheet with @font-face + class rule and adopts it into root.
 * This is CSP-safe: adopted stylesheets bypass style-src entirely.
 *
 * Font and direction are independent axes: `setting` may carry a font
 * (name/file), an `rtl` flag, or both. We only emit the @font-face /
 * font-family when a font is present, and only emit `direction: rtl` when
 * rtl is enabled.
 */
function adoptSheetIntoRoot(root, setting) {
  const { name, file, rtl } = setting;
  const hasFont = !!(name && file);

  let css = '';
  if (hasFont) {
    const fontUrl = chrome.runtime.getURL(file);
    css += `
      @font-face {
        font-family: "${name}";
        src: url("${fontUrl}") format('woff2');
        font-display: swap;
      }`;
  }

  const declarations = [];
  if (hasFont) declarations.push(`font-family: "${name}", sans-serif !important;`);
  if (rtl) declarations.push(`direction: rtl !important;`);

  // Nothing to apply — don't adopt an empty sheet.
  if (declarations.length === 0) return;

  css += `
      .${TARGET_CLASS} {
        ${declarations.join('\n        ')}
      }`;

  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [...(root.adoptedStyleSheets || []), sheet];
    rootSheetMap.set(root, sheet);
  } catch (e) {
    console.warn('FontShifter: CSSStyleSheet adoption failed for root', root, e);
  }
}

// --- Core Logic ---

// SCHEDULING — this is the crash fix.
//
// applyGlobalStyles reads storage ASYNCHRONOUSLY and rewrites the entire
// document + every shadow root. It is triggered from three places (initial
// load, storage.onChanged, and every attachShadow via injector.js). On
// web-component-heavy SPAs (Claude.ai / ChatGPT) attachShadow fires hundreds
// of times during load, so hundreds of full-document passes used to be
// kicked off at once. Their async storage callbacks interleaved, and because
// rootSheetMap only remembers the LAST adopted sheet per root, every
// overlapping pass orphaned its own CSSStyleSheet forever. Unbounded adopted
// stylesheets + repeated O(DOM) TreeWalks froze and crashed the tab.
//
// Fix: coalesce every trigger into ONE debounced pass, and never let two
// passes overlap. If new triggers arrive while a pass is in flight, we run
// exactly one more pass afterwards.
let applyScheduled = false;
let applyInFlight = false;
let rerunRequested = false;

function applyGlobalStyles() {
  if (applyInFlight) {
    rerunRequested = true;
    return;
  }
  if (applyScheduled) return;
  applyScheduled = true;
  setTimeout(() => {
    applyScheduled = false;
    applyInFlight = true;
    rerunRequested = false;
    applyGlobalStylesNow(() => {
      applyInFlight = false;
      // Fold any triggers that arrived mid-pass into a single follow-up.
      if (rerunRequested) applyGlobalStyles();
    });
  }, 50);
}

function applyGlobalStylesNow(done) {
  // `done` MUST run on every exit path, or applyInFlight would latch true
  // forever and freeze all future updates.
  const finish = () => { try { done && done(); } catch (_) {} };

  if (!document.head) {
    document.addEventListener('DOMContentLoaded', applyGlobalStyles, { once: true });
    finish();
    return;
  }

  try {
    if (!chrome.runtime?.id) { finish(); return; }

    chrome.storage.local.get([SITE_SETTINGS_KEY, GLOBAL_SETTING_KEY], (result) => {
      try {
        if (!chrome.runtime?.id) return;

        // Determine hostname. Falls back to iframe's own hostname on cross-origin frames.
        let hostname;
        try { hostname = window.top.location.hostname; } catch (e) { hostname = window.location.hostname; }
        if (!hostname) hostname = 'local_file';

        const siteSettings = result[SITE_SETTINGS_KEY] || {};
        const globalSetting = result[GLOBAL_SETTING_KEY] || null;
        let effectiveSetting = siteSettings[hostname] !== undefined
          ? siteSettings[hostname]
          : globalSetting;

        // Backward compatibility: settings saved before font/direction were
        // split store only {name, file} and always meant "font + rtl". Treat a
        // font-bearing setting with no explicit rtl flag as rtl-on so existing
        // users see no change until they toggle it off.
        if (effectiveSetting && effectiveSetting.rtl === undefined && effectiveSetting.name) {
          effectiveSetting = { ...effectiveSetting, rtl: true };
        }

        // Collect all roots: document + all open shadow roots in the page.
        const allRoots = [
          document,
          ...Array.from(document.querySelectorAll('*'))
            .map(el => el.shadowRoot)
            .filter(Boolean),
        ];

        // CLEANUP: Remove adopted sheets and TARGET_CLASS from every root.
        for (const root of allRoots) {
          removeAdoptedSheet(root);
          const startNode = root.nodeType === Node.DOCUMENT_NODE ? root.documentElement : root;
          startNode?.querySelectorAll?.(`.${TARGET_CLASS}`)
            .forEach(el => el.classList.remove(TARGET_CLASS));
        }

        // STYLING: Adopt a new sheet and tag elements in each root.
        // A setting is "active" if it applies a font, rtl, or both.
        const isActive = effectiveSetting && (
          (effectiveSetting.name && effectiveSetting.file) || effectiveSetting.rtl
        );
        if (isActive) {
          for (const root of allRoots) {
            adoptSheetIntoRoot(root, effectiveSetting);
            applyClassesToRoot(root);
          }
        }
      } finally {
        finish();
      }
    });
  } catch (e) {
    console.error('FontShifter: Error in applyGlobalStyles:', e);
    finish();
  }
}

function applyClassesToRoot(root) {
  const startNode = root.nodeType === Node.DOCUMENT_NODE ? root.documentElement : root;
  if (!startNode) return;
  const walker = document.createTreeWalker(startNode, NodeFilter.SHOW_ELEMENT);
  let el;
  while ((el = walker.nextNode())) {
    if (shouldStyleElement(el)) el.classList.add(TARGET_CLASS);
  }
}

// --- MutationObserver for Dynamic Content ---

let isObserving = false;

function startObservers() {
  if (isObserving || !document.documentElement) return;
  isObserving = true;

  // Coalesce bursts of mutations (streaming SPAs fire these constantly) into
  // a single batched tagging pass on the next animation frame, instead of
  // running a synchronous TreeWalk for every individual mutation record.
  let pending = new Set();
  let flushScheduled = false;

  function flush() {
    flushScheduled = false;
    const nodes = pending;
    pending = new Set();

    // Only act if we actually have a font applied right now.
    if (!rootSheetMap.has(document)) return;

    for (const node of nodes) {
      // Node may have been detached since it was queued.
      if (!node.isConnected) continue;
      if (shouldStyleElement(node)) node.classList.add(TARGET_CLASS);
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
      let child;
      while ((child = walker.nextNode())) {
        if (shouldStyleElement(child)) child.classList.add(TARGET_CLASS);
      }
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            pending.add(node);
          } else if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() && node.parentElement) {
            pending.add(node.parentElement);
          }
        }
      } else if (mutation.type === 'characterData') {
        if (mutation.target.nodeValue?.trim() && mutation.target.parentElement) {
          pending.add(mutation.target.parentElement);
        }
      }
    }

    if (pending.size > 0 && !flushScheduled) {
      flushScheduled = true;
      requestAnimationFrame(flush);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

// --- Main Entry Point ---

function main() {
  // injector.js runs as a MAIN world content script (declared in manifest.json).
  // It patches attachShadow and fires 'fontshifter-shadowroot-attached' events.
  document.addEventListener('fontshifter-shadowroot-attached', () => {
    applyGlobalStyles();
  });

  // React to font changes made in the popup.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes[SITE_SETTINGS_KEY] || changes[GLOBAL_SETTING_KEY])) {
      applyGlobalStyles();
    }
  });

  // Initial application.
  applyGlobalStyles();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyGlobalStyles();
      startObservers();
    });
  } else {
    startObservers();
  }
}

main();
