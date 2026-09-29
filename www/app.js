/* Calendario — UI + calendar engine (offline) */

const VIEW_TITLES = { calendar: "Calendar", tasks: "Tasks", groceries: "Groceries", meals: "Meals", profiles: "People" };

const state = {
  view: "calendar",
  profiles: [], tasks: [], events: [], groceries: [], meals: [],
  filterProfileId: null,
  cal: {
    granularity: "month",
    anchor: new Date().toISOString().slice(0, 10),
    year: new Date().getFullYear(),
    selectedDay: null,
  },
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtShort = (iso) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtLong = (iso) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
const haptic = (ms = 8) => navigator.vibrate?.(ms);
const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const isoOf = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const dateOf = (iso) => new Date(iso + "T00:00:00");

function toast(msg) {
  const t = $("#toast"); if (!t) return;
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 1800);
}

function countdown(iso, time) {
  const target = new Date(iso + "T" + (time || "00:00") + ":00");
  let ms = target - Date.now();
  const past = ms < 0; ms = Math.abs(ms);
  const mins = Math.floor(ms / 60000), hrs = Math.floor(mins / 60), days = Math.floor(hrs / 24);
  let txt;
  if (mins < 1) txt = "now";
  else if (mins < 60) txt = mins + "m";
  else if (hrs < 24) txt = hrs + "h " + (mins % 60) + "m";
  else if (days < 30) txt = days + "d " + (hrs % 24) + "h";
  else txt = days + "d";
  return past ? txt + " ago" : "in " + txt;
}

async function loadAll() {
  const data = await DB.loadAll();
  Object.assign(state, data);
}

const profileById = (id) => state.profiles.find((p) => p.id === id);

/* ---------- Calendar math (ported from Python) ---------- */

function startOfWeek(d) {
  const day = d.getDay(); // 0=Sun
  const s = new Date(d);
  s.setDate(s.getDate() - day);
  s.setHours(0, 0, 0, 0);
  return s;
}

function daysInYear(y) {
  return (new Date(y + 1, 0, 1) - new Date(y, 0, 1)) / 86400000;
}

function percentOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 1);
  const doy = Math.floor((d - start) / 86400000) + 1;
  return Math.round(doy / daysInYear(d.getFullYear()) * 10000) / 100;
}

function taskOccursOn(t, d) {
  if (!t.due_date) return false;
  const anchor = dateOf(t.due_date);
  if (d < anchor) return false;
  if (t.recurrence_until && d > dateOf(t.recurrence_until)) return false;
  const rec = t.recurrence || "once";
  if (rec === "once") return isoOf(d) === t.due_date;
  if (rec === "daily") return true;
  if (rec === "weekly") return (Math.floor((d - anchor) / 86400000)) % 7 === 0;
  if (rec === "monthly") return d.getDate() === anchor.getDate();
  return false;
}

function tasksOn(d) {
  return state.tasks.filter((t) => taskOccursOn(t, d));
}
function eventsOn(d) {
  const iso = isoOf(d);
  return state.events.filter((e) => e.day === iso);
}
function mealsOn(d) {
  const iso = isoOf(d);
  return state.meals.filter((m) => m.day === iso);
}

/* ---------- Calendar view builders ---------- */

function buildDayView(iso) {
  const d = dateOf(iso);
  return {
    view: "day",
    date: iso,
    weekday: d.toLocaleDateString(undefined, { weekday: "long" }),
    month: d.toLocaleDateString(undefined, { month: "long" }),
    day_num: d.getDate(),
    year: d.getFullYear(),
    percent_of_year: percentOfYear(d),
    is_today: iso === todayISO(),
    tasks: tasksOn(d),
    events: eventsOn(d).sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00")),
    meals: mealsOn(d),
  };
}

function buildWeekView(iso) {
  const start = startOfWeek(dateOf(iso));
  const today = todayISO();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const dayIso = isoOf(d);
    const t = tasksOn(d), e = eventsOn(d), m = mealsOn(d);
    days.push({
      date: dayIso,
      weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
      day_num: d.getDate(),
      is_today: dayIso === today,
      is_past: dayIso < today,
      percent_of_year: percentOfYear(d),
      tasks: t,
      events: e.sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00")),
      meals: m,
      tasks_done: t.filter((x) => x.status === "done").length,
      tasks_total: t.length,
    });
  }
  const end = new Date(start); end.setDate(end.getDate() + 6);
  return {
    view: "week",
    start: isoOf(start),
    end: isoOf(end),
    percent_of_year: percentOfYear(dateOf(iso)),
    week_of_year: Math.floor((dateOf(iso) - new Date(dateOf(iso).getFullYear(), 0, 1)) / 86400000 / 7) + 1,
    days,
  };
}

function buildMonthView(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const gridStart = startOfWeek(first);
  const gridEnd = new Date(startOfWeek(last)); gridEnd.setDate(gridEnd.getDate() + 6);
  const today = todayISO();
  const cells = [];
  const cur = new Date(gridStart);
  while (cur <= gridEnd) {
    const t = tasksOn(cur), e = eventsOn(cur), m = mealsOn(cur);
    cells.push({
      date: isoOf(cur),
      day: cur.getDate(),
      in_month: cur.getMonth() === month,
      is_today: isoOf(cur) === today,
      is_past: isoOf(cur) < today,
      tasks_total: t.length,
      tasks_done: t.filter((x) => x.status === "done").length,
      events_total: e.length,
      events_important: e.filter((x) => x.important).length,
      has_meal: m.length > 0,
    });
    cur.setDate(cur.getDate() + 1);
  }
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return {
    view: "month",
    year, month,
    month_name: first.toLocaleDateString(undefined, { month: "long" }),
    percent_of_year: percentOfYear(first),
    weeks,
  };
}

function buildYearView(year) {
  const today = todayISO();
  const months = [];
  for (let m = 0; m < 12; m++) {
    const first = new Date(year, m, 1);
    const last = new Date(year, m + 1, 0);
    const days = [];
    for (let d = 1; d <= last.getDate(); d++) {
      const dd = new Date(year, m, d);
      const iso = isoOf(dd);
      const t = tasksOn(dd), e = eventsOn(dd);
      days.push({
        date: iso,
        day: d,
        is_today: iso === today,
        is_past: iso < today,
        load: t.length + e.length,
      });
    }
    months.push({
      month: m + 1,
      name: first.toLocaleDateString(undefined, { month: "long" }),
      short: first.toLocaleDateString(undefined, { month: "short" }),
      first_weekday: first.getDay(),
      percent_of_year: percentOfYear(first),
      days,
    });
  }
  const jan1 = new Date(year, 0, 1);
  const now = new Date();
  let pct = 0;
  if (now.getFullYear() === year) pct = percentOfYear(now);
  else if (year < now.getFullYear()) pct = 100;
  return {
    view: "year",
    year,
    total_days: daysInYear(year),
    percent_of_year: pct,
    months,
  };
}

function buildCalendarData() {
  const c = state.cal;
  if (c.granularity === "day") return buildDayView(c.anchor);
  if (c.granularity === "week") return buildWeekView(c.anchor);
  if (c.granularity === "month") { const d = dateOf(c.anchor); return buildMonthView(d.getFullYear(), d.getMonth()); }
  return buildYearView(c.year);
}

function renderProfilesStrip() {
  const el = $("#profilesStrip"); if (!el) return;
  if (!state.profiles.length) { el.innerHTML = ""; return; }
  el.innerHTML = state.profiles.map((p) =>
    '<div class="avatar-chip ' + (state.filterProfileId === p.id ? "active" : "") + '" data-action="filter-profile" data-id="' + p.id + '" style="background:' + p.color + '33">' + p.avatar + '</div>'
  ).join("");
}

function calTopBar() {
  const c = state.cal;
  const data = c._data;
  let range = "";
  if (c.granularity === "day" && data) range = fmtLong(data.date);
  else if (c.granularity === "week" && data) range = fmtShort(data.start) + " – " + fmtShort(data.end);
  else if (c.granularity === "month" && data) range = data.month_name + " " + data.year;
  else if (c.granularity === "year") range = "" + c.year;

  return '<div class="cal-top">'
    + '<button class="nav-btn" data-action="cal-prev">‹</button>'
    + '<button class="today-btn" data-action="cal-today">Today</button>'
    + '<button class="nav-btn" data-action="cal-next">›</button>'
    + '<div class="cal-range">' + range + '</div>'
    + '</div>'
    + '<div class="cal-top" style="margin-bottom:10px">'
    + '<div class="segmented" style="flex:1;justify-content:space-between">'
    + '<button data-action="cal-gran" data-g="day" class="' + (c.granularity === "day" ? "active" : "") + '">Day</button>'
    + '<button data-action="cal-gran" data-g="week" class="' + (c.granularity === "week" ? "active" : "") + '">Week</button>'
    + '<button data-action="cal-gran" data-g="month" class="' + (c.granularity === "month" ? "active" : "") + '">Month</button>'
    + '<button data-action="cal-gran" data-g="year" class="' + (c.granularity === "year" ? "active" : "") + '">Year</button>'
    + '</div></div>';
}

function eventCardHTML(e) {
  const p = profileById(e.profile_id);
  const cd = countdown(e.day, e.time);
  return '<div class="event-card ' + (e.important ? "important" : "") + '">'
    + '<div class="event-time ' + (!e.time ? "all-day" : "") + '">' + (e.time || "all day") + '</div>'
    + '<div class="event-body"><div class="event-title">' + escapeHTML(e.title) + (e.important ? " ⚠️" : "") + '</div>'
    + (e.location ? '<div class="event-meta">📍 ' + escapeHTML(e.location) + '</div>' : "")
    + (p ? '<div class="event-meta">' + p.avatar + " " + escapeHTML(p.name) + '</div>' : "")
    + '<div class="event-countdown">⏱ ' + cd + '</div></div></div>';
}

function taskRow(t) {
  const p = profileById(t.profile_id);
  const rec = t.recurrence && t.recurrence !== "once"
    ? '<span class="badge ' + t.recurrence + '">' + t.recurrence + '</span>'
    : (t.priority === "high" ? '<span class="badge high">high</span>' : "");
  return '<div class="task-row">'
    + '<div class="checkbox ' + (t.status === "done" ? "checked" : "") + '" data-action="toggle-task" data-id="' + t.id + '"></div>'
    + '<div class="task-body"><div class="task-title ' + (t.status === "done" ? "done" : "") + '">' + escapeHTML(t.title) + '</div>'
    + '<div class="task-meta">' + (t.due_date ? fmtShort(t.due_date) : "No date") + (p ? " · " + p.avatar + " " + escapeHTML(p.name) : "") + '</div></div>'
    + rec + '</div>';
}

function dayViewHTML(d) {
  let events = d.events, tasks = d.tasks, meals = d.meals;
  if (state.filterProfileId) {
    events = events.filter((e) => e.profile_id === state.filterProfileId);
    tasks = tasks.filter((t) => t.profile_id === state.filterProfileId);
    meals = meals.filter((m) => m.cook_profile_id === state.filterProfileId);
  }
  let h = '<div class="day-header"><div class="day-header-dow">' + d.weekday + '</div>'
    + '<div class="day-header-num">' + d.day_num + '</div>'
    + '<div class="day-header-sub">' + d.month + " " + d.year
    + (d.is_today ? ' · <span style="color:var(--accent);font-weight:700">Today</span>' : "")
    + '</div></div>';

  if (events.length) {
    h += '<div class="day-section-h">Appointments · ' + events.length + '</div>';
    h += events.map(eventCardHTML).join("");
  }
  if (meals.length) {
    h += '<div class="day-section-h">Meals · ' + meals.length + '</div>';
    h += meals.map((m) => {
      const cook = profileById(m.cook_profile_id);
      return '<div class="card"><div class="avatar" style="background:' + (cook ? cook.color + "33" : "var(--accent-soft)") + '">' + (cook ? cook.avatar : "🍽️") + '</div>'
        + '<div class="card-body"><div class="card-title">' + escapeHTML(m.title) + '</div>'
        + '<div class="card-sub">' + m.slot + (cook ? " · " + escapeHTML(cook.name) : "") + '</div></div></div>';
    }).join("");
  }
  h += '<div class="day-section-h">Tasks · ' + tasks.length + '</div>';
  h += tasks.length ? tasks.map(taskRow).join("") : '<div class="empty"><div class="empty-icon">✨</div>Nothing on this day</div>';
  return h;
}

function weekViewHTML(d) {
  return '<div class="week-grid">' + d.days.map((day) => {
    let tasks = day.tasks, events = day.events, meals = day.meals;
    if (state.filterProfileId) {
      tasks = tasks.filter((t) => t.profile_id === state.filterProfileId);
      events = events.filter((e) => e.profile_id === state.filterProfileId);
      meals = meals.filter((m) => m.cook_profile_id === state.filterProfileId);
    }
    const pills = [];
    events.forEach((e) => pills.push('<div class="week-pill event ' + (e.important ? "important" : "") + '">' + (e.time ? e.time + " " : "") + escapeHTML(e.title) + '</div>'));
    tasks.forEach((t) => pills.push('<div class="week-pill task ' + (t.status === "done" ? "done" : "") + '">' + escapeHTML(t.title) + '</div>'));
    meals.forEach((m) => pills.push('<div class="week-pill meal">🍽️ ' + escapeHTML(m.title) + '</div>'));
    const vis = pills.slice(0, 5), more = pills.length - vis.length;
    return '<div class="week-col ' + (day.is_today ? "today" : "") + '" data-action="cal-select-day" data-date="' + day.date + '">'
      + '<div class="week-col-head"><div class="week-col-dow">' + day.weekday + '</div><div class="week-col-num">' + day.day_num + '</div></div>'
      + '<div class="week-items">' + vis.join("") + (more > 0 ? '<div class="week-more">+' + more + '</div>' : "") + '</div></div>';
  }).join("") + '</div>';
}

function monthViewHTML(d) {
  const DOW = ["S","M","T","W","T","F","S"];
  const head = '<div class="month-dow-row">' + DOW.map((x) => '<div class="month-dow">' + x + '</div>').join("") + '</div>';
  const cells = d.weeks.flat().map((c) => {
    const cls = ["month-cell"];
    if (!c.in_month) cls.push("out");
    if (c.is_today) cls.push("today");
    if (c.is_past && !c.is_today) cls.push("past");
    const bars = [];
    for (let i = 0; i < Math.min(c.tasks_done, 4); i++) bars.push('<div class="mini-bar done"></div>');
    for (let i = 0; i < Math.min(c.tasks_total - c.tasks_done, 4); i++) bars.push('<div class="mini-bar"></div>');
    if (c.events_important > 0) bars.push('<div class="mini-bar important"></div>');
    else if (c.events_total > 0) bars.push('<div class="mini-bar event"></div>');
    if (c.has_meal) bars.push('<div class="mini-bar meal"></div>');
    return '<div class="' + cls.join(" ") + '" data-action="cal-select-day" data-date="' + c.date + '">'
      + '<div class="month-cell-num">' + c.day + '</div>'
      + '<div class="month-cell-bars">' + bars.slice(0, 4).join("") + '</div></div>';
  }).join("");
  return head + '<div class="month-grid">' + cells + '</div>';
}

function yearViewHTML(d) {
  return '<div class="year-grid">' + d.months.map((m) => {
    const DOW = ["S","M","T","W","T","F","S"];
    const blanks = Array.from({ length: m.first_weekday }, () => '<div class="mini-day out"></div>').join("");
    const days = m.days.map((dd) => {
      const load = Math.min(dd.load, 4);
      const cls = ["mini-day", "l" + load];
      if (dd.is_today) cls.push("today");
      else if (dd.is_past) cls.push("past");
      return '<div class="' + cls.join(" ") + '" data-action="cal-select-day" data-date="' + dd.date + '">' + dd.day + '</div>';
    }).join("");
    return '<div class="mini-month"><div class="mini-month-title">' + m.short + ' <span class="pct">' + m.percent_of_year.toFixed(0) + '%</span></div>'
      + '<div class="mini-dow">' + DOW.map((x) => '<span>' + x + '</span>').join("") + '</div>'
      + '<div class="mini-days">' + blanks + days + '</div></div>';
  }).join("") + '</div>';
}

function renderCalendarView() {
  const el = $('[data-view="calendar"]'); if (!el) return;
  const c = state.cal;
  c._data = buildCalendarData();
  const top = calTopBar();
  let body = "";
  if (c.granularity === "day") body = dayViewHTML(c._data);
  if (c.granularity === "week") body = weekViewHTML(c._data);
  if (c.granularity === "month") body = monthViewHTML(c._data);
  if (c.granularity === "year") body = yearViewHTML(c._data);
  el.innerHTML = top + body;
}

function renderTasks() {
  const el = $('[data-view="tasks"]'); if (!el) return;
  let tasks = [...state.tasks];
  if (state.filterProfileId) tasks = tasks.filter((t) => t.profile_id === state.filterProfileId);
  const ord = { high: 0, normal: 1, low: 2 };
  tasks.sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (b.status === "done" && a.status !== "done") return -1;
    const da = a.due_date || "9999-12-31", db = b.due_date || "9999-12-31";
    if (da !== db) return da < db ? -1 : 1;
    return (ord[a.priority] ?? 1) - (ord[b.priority] ?? 1);
  });
  el.innerHTML = tasks.length ? tasks.map(taskRow).join("")
    : '<div class="empty"><div class="empty-icon">📋</div>No tasks yet<br>Tap + to add one</div>';
}

function renderGroceries() {
  const el = $('[data-view="groceries"]'); if (!el) return;
  const active = state.groceries.filter((g) => !g.purchased);
  const bought = state.groceries.filter((g) => g.purchased);
  const byCat = active.reduce((a, g) => { (a[g.category || "general"] ||= []).push(g); return a; }, {});
  const parts = [];
  if (!state.groceries.length) {
    parts.push('<div class="empty"><div class="empty-icon">🛒</div>List is empty<br>Tap + to add</div>');
  } else {
    for (const [cat, items] of Object.entries(byCat).sort()) {
      parts.push('<div class="section-h">' + cat + '</div>');
      parts.push(items.map((g) => {
        const p = profileById(g.added_by_profile_id);
        return '<div class="card"><div class="checkbox ' + (g.purchased ? "checked" : "") + '" data-action="toggle-grocery" data-id="' + g.id + '"></div>'
          + '<div class="card-body"><div class="card-title">' + escapeHTML(g.name) + '</div>'
          + '<div class="card-sub">' + escapeHTML(g.quantity) + (p ? " · added by " + p.avatar : "") + '</div></div></div>';
      }).join(""));
    }
    if (bought.length) {
      parts.push('<div class="section-h">Purchased · ' + bought.length + '</div>');
      parts.push(bought.map((g) => '<div class="card"><div class="checkbox checked" data-action="toggle-grocery" data-id="' + g.id + '"></div>'
        + '<div class="card-body"><div class="card-title done">' + escapeHTML(g.name) + '</div></div></div>').join(""));
      parts.push('<button class="btn btn-ghost" data-action="clear-purchased">Clear purchased</button>');
    }
  }
  el.innerHTML = parts.join("");
}

function renderMeals() {
  const el = $('[data-view="meals"]'); if (!el) return;
  let meals = [...state.meals];
  if (state.filterProfileId) meals = meals.filter((m) => m.cook_profile_id === state.filterProfileId);
  const up = meals.filter((m) => m.day >= todayISO()).sort((a, b) => a.day.localeCompare(b.day));
  if (!up.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🍳</div>No meals planned<br>Tap + to plan one</div>';
    return;
  }
  const byDay = up.reduce((a, m) => { (a[m.day] ||= []).push(m); return a; }, {});
  const parts = [];
  for (const [day, ms] of Object.entries(byDay)) {
    parts.push('<div class="section-h">' + fmtLong(day) + '</div>');
    parts.push(ms.map((m) => {
      const cook = profileById(m.cook_profile_id);
      return '<div class="card"><div class="avatar" style="background:' + (cook ? cook.color + "33" : "var(--accent-soft)") + '">' + (cook ? cook.avatar : "🍽️") + '</div>'
        + '<div class="card-body"><div class="card-title">' + escapeHTML(m.title) + '</div>'
        + '<div class="card-sub">' + m.slot + (cook ? " · " + escapeHTML(cook.name) : "") + '</div></div></div>';
    }).join(""));
  }
  el.innerHTML = parts.join("");
}

function renderProfilesView() {
  const el = $('[data-view="profiles"]'); if (!el) return;
  if (!state.profiles.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">👥</div>No profiles yet<br>Tap + to add</div>';
    return;
  }
  el.innerHTML = state.profiles.map((p) => {
    const open = state.tasks.filter((t) => t.profile_id === p.id && t.status !== "done").length;
    const ev = state.events.filter((e) => e.profile_id === p.id && e.day >= todayISO()).length;
    return '<div class="card"><div class="avatar" style="background:' + p.color + '33">' + p.avatar + '</div>'
      + '<div class="card-body"><div class="card-title">' + escapeHTML(p.name) + '</div>'
      + '<div class="card-sub">' + open + ' open task' + (open === 1 ? "" : "s") + ' · ' + ev + ' upcoming event' + (ev === 1 ? "" : "s") + '</div></div></div>';
  }).join("");
}

function render() {
  renderProfilesStrip();
  if (state.view === "calendar") renderCalendarView();
  if (state.view === "tasks") renderTasks();
  if (state.view === "groceries") renderGroceries();
  if (state.view === "meals") renderMeals();
  if (state.view === "profiles") renderProfilesView();
}

function setView(name) {
  state.view = name;
  const t = $("#viewTitle"); if (t) t.textContent = VIEW_TITLES[name];
  $$(".tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === name));
  $$(".view").forEach((x) => x.classList.toggle("active", x.dataset.view === name));
  render();
}

function openSheet(html) {
  const s = $("#sheet"); if (!s) return;
  s.innerHTML = '<div class="sheet-handle"></div>' + html;
  requestAnimationFrame(() => {
    const b = $("#sheetBackdrop"); if (b) b.classList.add("open");
    s.classList.add("open");
  });
}
function closeSheet() {
  const b = $("#sheetBackdrop"), s = $("#sheet");
  if (b) b.classList.remove("open");
  if (s) s.classList.remove("open");
}

function profileOptions() {
  return state.profiles.map((p) => '<option value="' + p.id + '">' + p.avatar + " " + escapeHTML(p.name) + '</option>').join("");
}

function sheetTask(prefillDate) {
  openSheet('<h2>New task</h2>'
    + '<div class="field"><label>Title</label><input id="f-title" autofocus placeholder="e.g. Wash dishes"></div>'
    + '<div class="row2"><div class="field"><label>Date</label><input id="f-due" type="date" value="' + (prefillDate || todayISO()) + '"></div>'
    + '<div class="field"><label>Priority</label><select id="f-priority"><option value="low">Low</option><option value="normal" selected>Normal</option><option value="high">High</option></select></div></div>'
    + '<div class="row2"><div class="field"><label>Repeats</label><select id="f-rec"><option value="once" selected>Once</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select></div>'
    + '<div class="field"><label>Until</label><input id="f-until" type="date"></div></div>'
    + '<div class="field"><label>Assignee</label><select id="f-profile"><option value="">— none —</option>' + profileOptions() + '</select></div>'
    + '<button class="btn btn-primary" data-action="submit-task">Add task</button>'
    + '<button class="btn btn-ghost" data-action="close-sheet">Cancel</button>');
}

function sheetEvent(prefillDate) {
  openSheet('<h2>New event</h2>'
    + '<div class="field"><label>Title</label><input id="f-title" autofocus placeholder="e.g. Dentist"></div>'
    + '<div class="row2"><div class="field"><label>Date</label><input id="f-day" type="date" value="' + (prefillDate || todayISO()) + '"></div>'
    + '<div class="field"><label>Time</label><input id="f-time" type="time"></div></div>'
    + '<div class="field"><label>Location</label><input id="f-loc" placeholder="optional"></div>'
    + '<div class="row2"><div class="field"><label>Who</label><select id="f-profile"><option value="">— none —</option>' + profileOptions() + '</select></div>'
    + '<div class="field"><label>Important</label><select id="f-imp"><option value="false">No</option><option value="true">Yes</option></select></div></div>'
    + '<button class="btn btn-primary" data-action="submit-event">Add event</button>'
    + '<button class="btn btn-ghost" data-action="close-sheet">Cancel</button>');
}

function sheetGrocery() {
  const cats = ["produce","dairy","meat","pantry","frozen","household","general"];
  openSheet('<h2>Add item</h2>'
    + '<div class="field"><label>Item</label><input id="f-name" autofocus placeholder="e.g. Oat milk"></div>'
    + '<div class="row2"><div class="field"><label>Quantity</label><input id="f-qty" value="1"></div>'
    + '<div class="field"><label>Category</label><select id="f-cat">' + cats.map((c) => '<option value="' + c + '">' + c + '</option>').join("") + '</select></div></div>'
    + '<div class="field"><label>Added by</label><select id="f-by"><option value="">— none —</option>' + profileOptions() + '</select></div>'
    + '<button class="btn btn-primary" data-action="submit-grocery">Add to list</button>'
    + '<button class="btn btn-ghost" data-action="close-sheet">Cancel</button>');
}

function sheetMeal() {
  openSheet('<h2>Plan a meal</h2>'
    + '<div class="field"><label>Dish</label><input id="f-title" autofocus placeholder="e.g. Pasta night"></div>'
    + '<div class="row2"><div class="field"><label>Day</label><input id="f-day" type="date" value="' + (state.cal.selectedDay || todayISO()) + '"></div>'
    + '<div class="field"><label>Slot</label><select id="f-slot"><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner" selected>Dinner</option><option value="snack">Snack</option></select></div></div>'
    + '<div class="field"><label>Cook</label><select id="f-cook"><option value="">— nobody —</option>' + profileOptions() + '</select></div>'
    + '<button class="btn btn-primary" data-action="submit-meal">Plan meal</button>'
    + '<button class="btn btn-ghost" data-action="close-sheet">Cancel</button>');
}

function sheetProfile() {
  const avatars = ["🙂","🦊","🐻","🐱","🦁","🐼","🐨","🦉","🐢","🌟","🐶","🐰"];
  const colors = ["#6ea8fe","#6bdba0","#ffc15e","#ff8b94","#c792ea","#7fd1e0","#f4a261"];
  openSheet('<h2>New profile</h2>'
    + '<div class="field"><label>Name</label><input id="f-name" autofocus placeholder="e.g. Alex"></div>'
    + '<div class="field"><label>Avatar</label><select id="f-avatar">' + avatars.map((a) => '<option>' + a + '</option>').join("") + '</select></div>'
    + '<div class="field"><label>Color</label><select id="f-color">' + colors.map((c) => '<option value="' + c + '">' + c + '</option>').join("") + '</select></div>'
    + '<button class="btn btn-primary" data-action="submit-profile">Add profile</button>'
    + '<button class="btn btn-ghost" data-action="close-sheet">Cancel</button>');
}

function sheetAddChooser() {
  openSheet('<h2>Add</h2>'
    + '<button class="btn btn-primary" data-action="open-sheet-task">✓ Task</button>'
    + '<button class="btn btn-primary" data-action="open-sheet-event" style="margin-top:8px;background:var(--warn)">📅 Event</button>'
    + '<button class="btn btn-primary" data-action="open-sheet-grocery" style="margin-top:8px;background:var(--success)">🛒 Grocery</button>'
    + '<button class="btn btn-primary" data-action="open-sheet-meal" style="margin-top:8px;background:#c792ea">🍽️ Meal</button>'
    + '<button class="btn btn-primary" data-action="open-sheet-profile" style="margin-top:8px;background:#f4a261">👤 Profile</button>'
    + '<button class="btn btn-ghost" data-action="close-sheet">Cancel</button>');
}

function sheetMenu() {
  openSheet('<h2>Menu</h2>'
    + '<button class="btn btn-primary" data-action="export-data">⬇️ Export backup</button>'
    + '<button class="btn btn-primary" data-action="import-data" style="margin-top:8px;background:var(--success)">⬆️ Import backup</button>'
    + '<button class="btn btn-primary" data-action="seed-demo" style="margin-top:8px;background:#c792ea">✨ Load demo data</button>'
    + '<button class="btn btn-danger" data-action="wipe-data">🗑️ Erase everything</button>'
    + '<button class="btn btn-ghost" data-action="close-sheet">Cancel</button>');
}

async function submitTask() {
  const title = $("#f-title").value.trim();
  if (!title) return toast("Give it a title");
  await DB.create("tasks", {
    title,
    due_date: $("#f-due").value || null,
    priority: $("#f-priority").value,
    recurrence: $("#f-rec").value,
    recurrence_until: $("#f-until").value || null,
    profile_id: $("#f-profile").value ? +$("#f-profile").value : null,
    status: "todo",
  });
  closeSheet(); await loadAll(); render(); toast("Task added");
}

async function submitEvent() {
  const title = $("#f-title").value.trim();
  if (!title) return toast("Give it a title");
  await DB.create("events", {
    title,
    day: $("#f-day").value,
    time: $("#f-time").value || null,
    location: $("#f-loc").value || null,
    important: $("#f-imp").value === "true",
    profile_id: $("#f-profile").value ? +$("#f-profile").value : null,
  });
  closeSheet(); await loadAll(); render(); toast("Event added");
}

async function submitGrocery() {
  const name = $("#f-name").value.trim();
  if (!name) return toast("What are we buying?");
  await DB.create("groceries", {
    name,
    quantity: $("#f-qty").value || "1",
    category: $("#f-cat").value,
    added_by_profile_id: $("#f-by").value ? +$("#f-by").value : null,
    purchased: false,
  });
  closeSheet(); await loadAll(); render(); toast("Added");
}

async function submitMeal() {
  const title = $("#f-title").value.trim();
  if (!title) return toast("What's cooking?");
  await DB.create("meals", {
    title,
    day: $("#f-day").value,
    slot: $("#f-slot").value,
    cook_profile_id: $("#f-cook").value ? +$("#f-cook").value : null,
  });
  closeSheet(); await loadAll(); render(); toast("Meal planned");
}

async function submitProfile() {
  const name = $("#f-name").value.trim();
  if (!name) return toast("Name?");
  await DB.create("profiles", {
    name,
    avatar: $("#f-avatar").value,
    color: $("#f-color").value,
  });
  closeSheet(); await loadAll(); render(); toast("Welcome!");
}

async function toggleTask(id) {
  haptic();
  const t = state.tasks.find((x) => x.id === id); if (!t) return;
  await DB.update("tasks", id, {
    status: t.status === "done" ? "todo" : "done",
    completed_at: t.status === "done" ? null : new Date().toISOString(),
  });
  await loadAll(); render();
}

async function toggleGrocery(id) {
  haptic();
  const g = state.groceries.find((x) => x.id === id); if (!g) return;
  await DB.update("groceries", id, { purchased: !g.purchased });
  await loadAll(); render();
}

async function clearPurchased() {
  const bought = state.groceries.filter((g) => g.purchased);
  for (const g of bought) await DB.remove("groceries", g.id);
  await loadAll(); render(); toast("Cleared " + bought.length);
}

function calShift(dir) {
  const c = state.cal;
  const shift = (iso, days) => { const d = dateOf(iso); d.setDate(d.getDate() + days); return isoOf(d); };
  if (c.granularity === "day") c.anchor = shift(c.anchor, dir);
  if (c.granularity === "week") c.anchor = shift(c.anchor, dir * 7);
  if (c.granularity === "month") { const d = dateOf(c.anchor); d.setDate(1); d.setMonth(d.getMonth() + dir); c.anchor = isoOf(d); }
  if (c.granularity === "year") c.year += dir;
  renderCalendarView();
}

function calSelectDay(iso) {
  state.cal.selectedDay = iso;
  state.cal.anchor = iso;
  state.cal.granularity = "day";
  haptic();
  renderCalendarView();
}

/* ---------- Export / Import / Wipe ---------- */

async function exportData() {
  closeSheet();
  const payload = await DB.exportAll();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "calendario-" + todayISO() + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Backup downloaded");
}

async function importData() {
  closeSheet();
  const input = $("#importFile");
  input.value = "";
  input.click();
}

async function handleImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const result = await DB.importAll(payload, "merge");
    await loadAll(); render();
    toast("Imported " + result.added + " (skipped " + result.skipped + ")");
  } catch (err) {
    toast("Import failed: " + err.message);
  }
}

async function wipeData() {
  if (!confirm("Erase ALL data on this phone? This cannot be undone.")) return;
  await DB.wipe();
  await loadAll(); render();
  closeSheet();
  toast("Everything erased");
}

async function seedDemo() {
  const result = await DB.seedDemo();
  await loadAll(); render();
  closeSheet();
  toast(result.seeded ? "Demo data loaded" : "Already has data — skipped");
}

/* ---------- Global click delegation ---------- */

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]"); if (!el) return;
  const { action, id, date, g } = el.dataset;
  const numId = id ? +id : null;
  try {
    switch (action) {
      case "filter-profile":
        state.filterProfileId = state.filterProfileId === numId ? null : numId;
        render(); return;
      case "toggle-task": return toggleTask(numId);
      case "toggle-grocery": return toggleGrocery(numId);
      case "clear-purchased": return clearPurchased();

      case "cal-gran": state.cal.granularity = g; renderCalendarView(); return;
      case "cal-prev": return calShift(-1);
      case "cal-next": return calShift(1);
      case "cal-today":
        state.cal.anchor = todayISO();
        state.cal.year = new Date().getFullYear();
        renderCalendarView(); return;
      case "cal-select-day": return calSelectDay(date);

      case "open-sheet-task": return sheetTask(state.cal.selectedDay);
      case "open-sheet-event": return sheetEvent(state.cal.selectedDay);
      case "open-sheet-grocery": return sheetGrocery();
      case "open-sheet-meal": return sheetMeal();
      case "open-sheet-profile": return sheetProfile();

      case "submit-task": return submitTask();
      case "submit-event": return submitEvent();
      case "submit-grocery": return submitGrocery();
      case "submit-meal": return submitMeal();
      case "submit-profile": return submitProfile();

      case "export-data": return exportData();
      case "import-data": return importData();
      case "wipe-data": return wipeData();
      case "seed-demo": return seedDemo();
      case "close-sheet": return closeSheet();
    }
  } catch (err) {
    console.error(err);
    toast("Error: " + err.message);
  }
});

/* ---------- Wire buttons ---------- */

function wireButtons() {
  const tb = $("#tabbar");
  if (tb) tb.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab"); if (!tab) return;
    haptic(); setView(tab.dataset.tab);
  });

  const fab = $("#fabAdd");
  if (fab) fab.addEventListener("click", () => {
    haptic(15);
    if (state.view === "groceries") return sheetGrocery();
    if (state.view === "meals") return sheetMeal();
    if (state.view === "profiles") return sheetProfile();
    return sheetAddChooser();
  });

  const bd = $("#sheetBackdrop");
  if (bd) bd.addEventListener("click", closeSheet);

  const menu = $("#menuBtn");
  if (menu) menu.addEventListener("click", sheetMenu);

  const imp = $("#importFile");
  if (imp) imp.addEventListener("change", handleImportFile);
}

/* ---------- Boot ---------- */

(async function boot() {
  try {
    await DB.open();
    await loadAll();
    if (state.profiles.length === 0) {
      await DB.seedDemo();
      await loadAll();
    }
    wireButtons();
    setView("calendar");
  } catch (err) {
    console.error(err);
    const v = $('[data-view="calendar"]');
    if (v) v.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>Could not start<br><small>' + escapeHTML(err.message) + '</small></div>';
  }
})();
