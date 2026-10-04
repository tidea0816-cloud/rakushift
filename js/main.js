/*
 * 起動処理(すべてのファイルを読み込んだ最後に動く)
 */
"use strict";

// ?demo 付きで開いたら、お試し用のデモデータを入れる(データが空のときだけ)
if(new URLSearchParams(location.search).has("demo")) seedRoleDemo();

render();
requestPersistentStorage();

// オフラインでも開けるように、Service Worker(アプリの部品を端末に覚えさせる仕組み)を登録する
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>{ navigator.serviceWorker.register("sw.js").catch(()=>{}); });
}
