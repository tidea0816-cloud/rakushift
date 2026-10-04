/*
 * 画面の土台
 * 画面の状態・タブ切り替え・描画の入り口
 */
"use strict";

/* ============ アプリ状態(画面) ============ */
let ui = {
  tab: 0, // 0=シフト表 1=休み希望 2=スタッフ 3=設定
  year: new Date().getFullYear(),
  month: new Date().getMonth()+1,
  settingsScreen: "menu", // menu|types|typeEdit|requirements|reqOverrides|reqOverrideEdit|tasks|taskEdit|business|specialDates|specialEdit
  editingId: null,
};

const App = {};
window.App = App;

const $app = document.getElementById("app");
const $modal = document.getElementById("modalRoot");

function render(){
  let html = "";
  if(ui.tab===0) html = renderSchedule();
  else if(ui.tab===1) html = ui.dayoffScreen==="availability" ? renderAvailability() : renderDayOffList();
  else if(ui.tab===2) html = renderStaffList();
  else if(ui.tab===3) html = renderSettings();

  html += renderTabbar();
  $app.innerHTML = html;
  attachGlobalHandlers();
}

function renderTabbar(){
  const tabs = [["calendar","シフト表"],["🌙","休み希望"],["person2","スタッフ"],["gear","設定"]];
  const icons = ["📅","🌙","🧑‍🤝‍🧑","⚙️"];
  return `<div class="tabbar">
    ${[0,1,2,3].map(i=>`<button class="tab ${ui.tab===i?'active':''}" data-tab="${i}"><span class="ic">${icons[i]}</span><span>${tabs[i][1]}</span></button>`).join("")}
  </div>`;
}

function attachGlobalHandlers(){
  $app.querySelectorAll("[data-tab]").forEach(el=>{
    el.addEventListener("click", ()=>{ ui.tab = Number(el.dataset.tab); if(ui.tab===3) ui.settingsScreen="menu"; if(ui.tab===1) ui.dayoffScreen="list"; render(); });
  });
}

function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

