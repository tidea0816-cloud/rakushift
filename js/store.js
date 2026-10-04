/*
 * データの保存(iOS版の SwiftData の代わり)
 * すべてのデータは1つの「state」オブジェクトにまとめ、端末のブラウザ内(localStorage)に保存する。
 * サーバーには送らない。消えたときに備えて、バックアップファイルの保存・読み込みもここで扱う。
 */
"use strict";

const STORAGE_KEY = "shiftAppState_v1";
const SKILLS = [
  {id:"customerService", label:"接客"},
  {id:"fitting", label:"フィッティング対応"},
  {id:"carefulness", label:"丁寧さ"},
  {id:"agility", label:"動き"},
  {id:"closing", label:"店閉め対応"},
];
const PREF_LEVELS = ["多め","普通","少なめ","不可"];
const DAY_LABELS = ["日","月","火","水","木","金","土"];
// 休みの区分。希望休だけが公休に数える(有給・特休・社外業務は数えない。design_decisions.md #34)
const DAYOFF_CATEGORIES = ["希望休","有給","特休","社外業務"];

function uid(){ return "id_" + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }

function defaultState(){
  return {
    store: {
      name: "",
      maxConsecutiveWorkDays: 5,
      minRestHours: 11,
      weightPreferredDayOff: 10,
      weightShiftPreference: 5,
      weightFairness: 2,
      weightConsecutive: 2,
      weightRestInterval: 2,
      // 社員の休みと人員数(design_decisions.md #33, #34)
      monthlyPublicHolidays: 8,       // 社員の月間公休日数
      fullHeadcountMinMinutes: 420,   // バイトを「1人」と数える最低勤務時間(分)。未満は0.5人
      weightWeekendAttendance: 3,     // 重み6:土日祝に社員が休むことへの減点
      weightClosingFairness: 8,       // 重み7:閉め回数のばらつきへの減点(2026-10-04 2→8。希望度に負けて閉めが偏ったため)
      weightRoleFairness: 2,          // 開店・中番の回数のばらつきへの減点(「少なめ」が0回まで偏らないように)
    },
    businessDays: [1,2,3,4,5,6,7].map(w => ({weekday:w, isClosed:false, openMinutes:600, closeMinutes:1260})),
    specialDates: [], // {id,date:'YYYY-MM-DD',kind:'臨時休業'|'臨時営業',openMinutes,closeMinutes,note}
    shiftTypes: [], // {id,name,startMinutes,endMinutes,sortOrder,requiredSkill,requiredSkillMinStars,requiredSkillMinCount}
    staff: [], // {id,name,employmentType,isNewcomer,ratings:{},workableWeekdays:[1..7],monthlyHourLimit,isActive,notes,preferences:{typeId:level},dayOffs:[...]}
    staffingRequirements: [], // {id,kind:'平日'|'土日'|'特定日',date,items:{typeId:count}}
    weekdayTasks: [], // {id,name,weekdays:[],shiftTypeId,requiredSkill,requiredMinStars,requiredMinCount,extraStaffCount}
    schedules: {}, // "YYYY-M": {assignments:[{id,date,staffId,shiftTypeId,isLocked,staffNameSnapshot,shiftTypeNameSnapshot}]}
  };
}

let state = loadState();

/** 保存済みデータを読み込む(無ければ空の状態から始める) */
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    return mergeWithDefaults(JSON.parse(raw));
  }catch(e){ return defaultState(); }
}

/** 保存データに、新しく増えた設定項目の既定値を補う(古いバージョンのデータでも動くように) */
function mergeWithDefaults(saved){
  const base = defaultState();
  const merged = Object.assign(base, saved);
  merged.store = Object.assign(defaultState().store, saved.store || {});
  // 閉め均等の重みは画面で変えられないので、古い既定値(2)のまま保存されていたら新しい既定値にそろえる
  if(merged.store.weightClosingFairness===2) merged.store.weightClosingFairness = defaultState().store.weightClosingFairness;
  return merged;
}

/** いまのデータを端末に保存する(変更のたびに呼ぶ) */
function save(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
}

/* ============ バックアップ(ファイルへの書き出し・読み込み) ============ */

/** バックアップのファイル名(例:らくシフト_バックアップ_2026-10-04.json) */
function backupFileName(){
  const d = new Date();
  return `らくシフト_バックアップ_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}.json`;
}

/** 全データを1つのファイルにして保存する(iPhoneは共有シート → 「ファイルに保存」) */
async function exportBackup(){
  const payload = JSON.stringify({app:"rakushift", version:1, savedAt:new Date().toISOString(), state}, null, 1);
  const name = backupFileName();
  const file = new File([payload], name, {type:"application/json"});
  // スマホ:共有シートで「ファイル」アプリなどに保存
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:name}); return true; }
    catch(e){ if(e && e.name==="AbortError") return false; }
  }
  // パソコン:ダウンロードとして保存
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  return true;
}

/** バックアップファイルを読み込んで、データを丸ごと置き換える。成功したら true */
async function importBackup(file){
  const text = await file.text();
  const parsed = JSON.parse(text);
  if(!parsed || parsed.app!=="rakushift" || !parsed.state) throw new Error("らくシフトのバックアップファイルではありません");
  state = mergeWithDefaults(parsed.state);
  save();
  return true;
}

/** 「ホーム画面に追加」していないと、iPhoneは使わない期間が続くとデータを消すことがある。
 *  消されにくくするよう、ブラウザに「このデータは大事」と伝えておく(対応ブラウザのみ) */
function requestPersistentStorage(){
  try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch(e){}
}
