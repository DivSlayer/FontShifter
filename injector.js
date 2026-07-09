// injector.js
// Runs directly in the page's MAIN world via manifest content_scripts declaration.
// This guarantees the patch is applied before any page code runs, eliminating
// the race condition from dynamic <script> tag injection.

(function () {
  // Guard against double-patching if the script somehow runs twice.
  if (window.__fontShifterPatched) return;
  window.__fontShifterPatched = true;

  const originalAttachShadow = Element.prototype.attachShadow;

  Element.prototype.attachShadow = function (options) {
    // Let the browser create the shadow root as normal.
    const shadowRoot = originalAttachShadow.call(this, options);

    // We can only interact with 'open' shadow roots.
    if (options.mode === 'open') {
      // Fire a custom event that bubbles up through the composed DOM tree.
      // The content script (in the ISOLATED world) listens for this event
      // on the document and uses it as a signal to re-apply font styles.
      this.dispatchEvent(new CustomEvent('fontshifter-shadowroot-attached', {
        bubbles: true,
        composed: true,
      }));
    }

    return shadowRoot;
  };
})();
