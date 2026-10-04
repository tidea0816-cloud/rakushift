/*
 * 共通のシート・ダイアログ
 * 
 */
"use strict";

/* ============ 汎用モーダル/シート/ダイアログ ============ */
function showSheet(innerHtml){
  $modal.innerHTML = `<div class="overlay" onclick="if(event.target===this) App.closeModal()"><div class="sheet">${innerHtml}</div></div>`;
}
function showActionSheet(actions){
  const html = `<div style="padding:6px 0">
    ${actions.map((a,i)=>`<button class="btn btn-block ${a.danger?'btn-danger':'btn-secondary'}" style="margin-bottom:8px" onclick="App.runAction(${i})">${a.label}</button>`).join("")}
    <button class="btn btn-block btn-outline" onclick="App.closeModal()">キャンセル</button>
  </div>`;
  window._sheetActions = actions;
  $modal.innerHTML = `<div class="overlay" onclick="if(event.target===this) App.closeModal()"><div class="sheet">${html}</div></div>`;
}
App.runAction = function(i){ App.closeModal(); window._sheetActions[i].action(); };
function confirmDialog(title, message, confirmLabel, onConfirm){
  const html = `<div style="padding:8px 4px">
    <div style="font-weight:700;margin-bottom:6px">${esc(title)}</div>
    ${message?`<div class="footnote" style="margin-bottom:14px">${esc(message)}</div>`:""}
    <button class="btn btn-block btn-danger" style="border:1px solid #E3B0B6;margin-bottom:8px" onclick="App.runConfirm()">${esc(confirmLabel)}</button>
    <button class="btn btn-block btn-outline" onclick="App.closeConfirmOnly()">やめる</button>
  </div>`;
  window._confirmCb = onConfirm;
  window._prevModalHtml = $modal.innerHTML;
  $modal.innerHTML = `<div class="overlay" style="z-index:60"><div class="sheet" style="border-radius:16px;max-width:340px;margin:auto">${html}</div></div>` + $modal.innerHTML;
}
App.runConfirm = function(){
  const cb = window._confirmCb;
  $modal.innerHTML = window._prevModalHtml || "";
  if(cb) cb();
};
App.closeConfirmOnly = function(){
  $modal.innerHTML = window._prevModalHtml || "";
};
App.closeModal = function(){ $modal.innerHTML = ""; openCellRef=null; };

