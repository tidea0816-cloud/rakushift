/*
 * お試し用のデモデータ(アドレスの最後に ?demo を付けて開くと、データが空のときだけ入る)
 * 架空の店:A早番(開店)/D中番(中番)/B遅番(閉め)、社員3人・バイト4人。来月分を自動で作る。
 */
"use strict";

function seedRoleDemo(){
  if(state.shiftTypes.length) return false; // 二重投入を防ぐ
  state.store.name = "デモ店舗(中番ルール)";
  const A = {id:uid(), name:"A早番", startMinutes:570, endMinutes:1125, sortOrder:0, role:"開店"};
  const D = {id:uid(), name:"D中番", startMinutes:660, endMinutes:1215, sortOrder:1, role:"中番"};
  const B = {id:uid(), name:"B遅番", startMinutes:735, endMinutes:1290, sortOrder:2, role:"閉め"};
  state.shiftTypes.push(A, D, B);

  const person = (name, type, extra) => Object.assign(emptyStaff(), {name, employmentType:type}, extra||{});
  const aoki = person("青木","社員",{ratings:{closing:5}, preferences:{[D.id]:"多め"}});
  const inoue = person("井上","社員",{ratings:{closing:5}});
  const ueda = person("上田","社員",{ratings:{closing:5}, preferences:{[A.id]:"多め",[D.id]:"少なめ"}});
  const usual = (days, s, e) => Object.fromEntries(days.map(w=>[w,{startMinutes:s,endMinutes:e}]));
  const eto = person("江藤","バイト",{usualAvailabilities:usual([2,3,4,5,6],570,990)});
  const ono = person("小野","バイト",{usualAvailabilities:usual([1,7],750,1290)});
  const kato = person("加藤","バイト",{usualAvailabilities:usual([3,5],1020,1290)});
  const kimura = person("木村","バイト",{usualAvailabilities:usual([1,7],570,1110)});
  [aoki,inoue,ueda].forEach(s=>SKILLS.forEach(sk=>{ if(s.ratings[sk.id]==null) s.ratings[sk.id]=3; }));
  state.staff.push(aoki, inoue, ueda, eto, ono, kato, kimura);
  ensureTemplate("平日"); ensureTemplate("土日");

  // 来月:いつもの時間を反映し、休み希望を入れて生成
  const now = new Date(), next = new Date(now.getFullYear(), now.getMonth()+1, 1);
  const y = next.getFullYear(), m = next.getMonth()+1;
  [eto,ono,kato,kimura].forEach(s=>applyUsualAvailability(s, y, m));
  aoki.dayOffs.push({id:uid(), date:dateStr(y,m,10), kind:"全休", startMinutes:null, endMinutes:null, strength:"絶対", category:"希望休"});
  inoue.dayOffs.push({id:uid(), date:dateStr(y,m,18), kind:"全休", startMinutes:null, endMinutes:null, strength:"絶対", category:"有給"});
  ueda.dayOffs.push({id:uid(), date:dateStr(y,m,5), kind:"全休", startMinutes:null, endMinutes:null, strength:"できれば", category:"希望休"});
  save();
  runGeneration(y, m);
  ui.year = y; ui.month = m;
  return true;
}
