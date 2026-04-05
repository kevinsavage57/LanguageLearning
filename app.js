// app.js — Safe boot loader with on-page diagnostics.
// Imports app_main.js AFTER DOMContentLoaded so app_main can safely query DOM elements.

function showStatusBanner(text) {
  try {
    let el = document.getElementById("bootStatusBanner");
    if (!el) {
      el = document.createElement("div");
      el.id = "bootStatusBanner";
      el.style.position = "fixed";
      el.style.left = "0";
      el.style.right = "0";
      el.style.top = "0";
      el.style.zIndex = "99999";
      el.style.padding = "8px 10px";
      el.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      el.style.fontSize = "13px";
      el.style.background = "#111";
      el.style.color = "#fff";
      el.style.borderBottom = "1px solid rgba(255,255,255,0.12)";
      document.documentElement.appendChild(el);
    }
    el.textContent = text;
  } catch (_) {}
}

function showFatal(err) {
  try {
    const msg = (err && (err.stack || err.message)) ? (err.stack || err.message) : String(err);
    let box = document.getElementById("fatalErrorOverlay");
    if (!box) {
      box = document.createElement("div");
      box.id = "fatalErrorOverlay";
      box.style.position = "fixed";
      box.style.left = "0";
      box.style.top = "0";
      box.style.right = "0";
      box.style.bottom = "0";
      box.style.background = "rgba(0,0,0,0.92)";
      box.style.color = "#fff";
      box.style.zIndex = "99998";
      box.style.padding = "16px";
      box.style.overflow = "auto";
      box.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
      box.style.whiteSpace = "pre-wrap";
      box.style.lineHeight = "1.3";
      const title = document.createElement("div");
      title.textContent = "Spanish Game – Startup Error";
      title.style.fontSize = "18px";
      title.style.fontWeight = "700";
      title.style.marginBottom = "10px";
      const pre = document.createElement("div");
      pre.id = "fatalErrorText";
      pre.textContent = msg;
      box.appendChild(title);
      box.appendChild(pre);
      document.body.appendChild(box);
    } else {
      const pre = document.getElementById("fatalErrorText");
      if (pre) pre.textContent = msg;
    }
  } catch (_) {}
}

window.addEventListener("error", (e) => showFatal(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => showFatal(e.reason));

showStatusBanner("Boot: waiting for DOMContentLoaded …");

window.addEventListener("DOMContentLoaded", async () => {
  showStatusBanner("Boot: importing app_main.js …");
  try {
    await import("./app_main.js");
    showStatusBanner("Boot: app_main.js loaded ✅");
  } catch (e) {
    showStatusBanner("Boot: app_main.js failed ❌ (see overlay)");
    showFatal(e);
  }
});
