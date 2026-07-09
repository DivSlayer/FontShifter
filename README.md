<div align="center">

<img src="icons/icon128.png" alt="FontShifter" width="128" height="128" />

# FontShifter

**Change the fonts of any website — with per-site or global settings and optional right-to-left direction.**

[![Microsoft Edge Add-ons](https://img.shields.io/badge/Microsoft%20Edge-Add--ons-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/YOUR_STORE_ID)
[![Download ZIP](https://img.shields.io/badge/Download-Latest%20Release-24292F?style=for-the-badge&logo=github&logoColor=white)](https://github.com/DivSlayer/FontShifter/releases/latest)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](#-license)

**English** · [فارسی](README.fa.md)

</div>

---

## ✨ Features

- 🎨 **Beautiful bundled fonts** — Dana, IRANSans, and Vazir, ready to apply with one click.
- 🌍 **Per-site or global** — set a font just for the current website, or as the default for every site.
- ↔️ **Independent RTL toggle** — turn right-to-left direction on or off *separately* from the font. Change the glyphs without touching the layout, or flip direction without changing the font.
- ⚡ **Works on modern SPAs** — robust support for dynamic content, web components, and shadow DOM (Claude.ai, ChatGPT, and similar sites).
- 🔒 **CSP-safe** — uses Constructable Stylesheets and extension-hosted fonts, so it works without stripping any security headers.

---

## 📦 Install from the Microsoft Edge Add-ons store

The easiest way to install — one click, with automatic updates:

<div align="center">

### [➡️ Get FontShifter on the Microsoft Edge Add-ons store](https://microsoftedge.microsoft.com/addons/detail/fontshifter/fkmmebmnphbkflalkijaelpbgiddeagj)

</div>

---

## 🧩 Use on Edge via "Load Unpacked"

Prefer to run it directly from source, or want the newest build before it hits the store? You can side-load the extension in a few steps.

### 1. Download the ZIP

Grab the latest packaged release here:

<div align="center">

### [⬇️ Download the latest release ZIP](https://github.com/DivSlayer/FontShifter/releases/latest)

</div>

Then **extract** the ZIP to a folder somewhere permanent (if you delete the folder later, the extension stops working).

### 2. Open the Extensions page

In Microsoft Edge, go to:

```
edge://extensions
```

(You can copy-paste that into the address bar.)

### 3. Enable Developer mode

Turn on the **Developer mode** toggle in the bottom-left corner of the Extensions page.

### 4. Load the extension

1. Click **Load unpacked**.
2. Select the folder you extracted in step 1 (the folder that contains **`manifest.json`**).
3. FontShifter now appears in your extensions list and toolbar. 🎉

> **Tip:** Pin it to the toolbar with the puzzle-piece icon so the popup is always one click away.

---

## 🚀 How to use

1. Click the **FontShifter** icon in the toolbar.
2. The popup shows the **current site** at the top.
3. Pick a font — **دانا (Dana)**, **ایران‌سنس (IRANSans)**, or **وزیر (Vazir)** — or choose **Restore Default** for no font change.
4. Toggle **Right-to-left (RTL)** on or off. It's independent of the font:
   - Font **+** RTL → apply a Persian font and flip direction.
   - Font **only** → change glyphs, leave the site's direction alone.
   - RTL **only** (Restore Default + RTL on) → flip direction without changing the font.
5. Save your choice:
   - **Save for This Site** → applies only to the current website.
   - **Set as Global** → becomes the default for every site (a per-site setting always wins over the global one).

---

## 🗂️ Project structure

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest (Manifest V3). |
| `popup.html` / `popup.css` / `popup.js` | The toolbar popup UI and its logic. |
| `content_script.js` | Applies the font and direction to every page and shadow root. |
| `injector.js` | MAIN-world script that hooks `attachShadow` for shadow-DOM support. |
| `fonts/` | Bundled `.woff2` font files. |

---

## 📄 License

Released under the **MIT License**.

---

<div align="center">

Made with ❤️ for better typography on the web.

</div>
