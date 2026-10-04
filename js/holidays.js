/*
 * 日本の祝日を「計算で」求める部品(ネットにつながなくても使える)
 * iOS版の JapaneseHolidays.swift と同じ決まり(2020年以降の祝日法)で計算する。
 *  ・決まった日付の祝日と、第◯月曜日の祝日(成人の日など)
 *  ・春分の日・秋分の日(近似式。1980〜2099年で正しい)
 *  ・振替休日(日曜の祝日のあと、最初の祝日でない日)と国民の休日(祝日にはさまれた平日)
 * 法律が変わったら、ここを直せばアプリ全体に反映される。
 */
"use strict";

const holidayCache = {}; // 年 → {"M-D": 祝日名}

/** その日の祝日名(祝日でなければ null) */
function holidayName(y, m, d){
  return holidaysOf(y)[m + "-" + d] || null;
}

/** その年の祝日一覧(キーは "月-日"。例:"1-1") */
function holidaysOf(year){
  if(!holidayCache[year]) holidayCache[year] = computeHolidays(year);
  return holidayCache[year];
}

function computeHolidays(year){
  const list = {};
  const add = (m, d, name) => { list[m + "-" + d] = name; };

  // 決まった日付の祝日
  add(1,1,"元日"); add(2,11,"建国記念の日"); add(2,23,"天皇誕生日"); add(4,29,"昭和の日");
  add(5,3,"憲法記念日"); add(5,4,"みどりの日"); add(5,5,"こどもの日"); add(8,11,"山の日");
  add(11,3,"文化の日"); add(11,23,"勤労感謝の日");

  // 第◯月曜日の祝日(ハッピーマンデー)
  add(1, nthMonday(year,1,2), "成人の日");
  add(7, nthMonday(year,7,3), "海の日");
  add(9, nthMonday(year,9,3), "敬老の日");
  add(10, nthMonday(year,10,2), "スポーツの日");

  // 春分の日・秋分の日
  add(3, equinoxDay(year, 20.8431), "春分の日");
  add(9, equinoxDay(year, 23.2488), "秋分の日");

  // 日付の計算は「年初からの通し日」で行う(月またぎを簡単にするため)
  const toDate = key => { const [m,d] = key.split("-").map(Number); return new Date(year, m-1, d); };
  const keyOf = date => (date.getMonth()+1) + "-" + date.getDate();
  const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

  // 国民の休日:前後の日が両方とも祝日の平日
  Object.keys(list).forEach(key => {
    const date = toDate(key);
    const between = addDays(date, 1), after = addDays(date, 2);
    if(after.getFullYear()===year && list[keyOf(after)] && !list[keyOf(between)] && between.getDay()!==0){
      list[keyOf(between)] = "国民の休日";
    }
  });

  // 振替休日:日曜の祝日のあと、最初の「祝日でない日」が休み
  Object.keys(list).map(toDate).sort((a,b)=>a-b).forEach(date => {
    if(date.getDay()!==0) return;
    let next = addDays(date, 1);
    while(list[keyOf(next)]) next = addDays(next, 1);
    if(next.getFullYear()===year) list[keyOf(next)] = "振替休日";
  });
  return list;
}

/** その月の第n月曜日の「日」 */
function nthMonday(year, month, nth){
  const weekday = new Date(year, month-1, 1).getDay(); // 0=日, 1=月
  const firstMonday = 1 + (8 - weekday) % 7;
  return firstMonday + (nth - 1) * 7;
}

/** 春分・秋分の日の「日」(1980〜2099年の近似式) */
function equinoxDay(year, base){
  return Math.floor(base + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
}
