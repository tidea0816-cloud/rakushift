/*
 * Service Worker:アプリの部品を端末に覚えさせて、電波がなくても開けるようにする。
 * 方針:まずネットから最新を取りに行き、つながらないときだけ覚えている版を使う
 *       (更新がすぐ届く+オフラインでも動く)。
 * 部品のファイルを増やしたら、下の FILES にも追加し、VERSION を1つ上げる。
 */
const VERSION = "rakushift-v1";
const FILES = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "js/store.js", "js/utils.js", "js/holidays.js", "js/role-input.js", "js/role-engine.js", "js/input-builder.js", "js/engine.js", "js/validator.js",
  "js/generation.js", "js/app.js", "js/view-schedule.js", "js/view-cell.js", "js/view-result.js",
  "js/export-image.js", "js/view-dayoff.js", "js/view-availability.js", "js/view-staff.js", "js/view-settings.js",
  "js/view-settings-store.js", "js/ui-common.js", "js/touch.js", "js/demo.js", "js/main.js",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  // 古い版の覚えを消す
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if(event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(VERSION).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(hit => hit || caches.match("index.html")))
  );
});
