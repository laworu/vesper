export const VERSION = 7;
export const uid = () => globalThis.crypto.randomUUID();
export class InputError extends Error {}
export function validDate(value) { return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value; }
export function dateKey(value = new Date(), timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return ['year', 'month', 'day'].map(k => parts.find(p => p.type === k).value).join('-');
}
export function addDays(date, days) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function weekday(date) { return new Date(date + 'T12:00:00Z').getUTCDay(); }
export function startOfWeek(date) { return addDays(date, -((weekday(date) + 6) % 7)); }
export function daysBetween(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000); }
export function clockMinutes(clock) { const [h, m] = clock.split(':').map(Number); return h * 60 + m; }
export function minutesClock(n) { return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; }
export function zonedEpoch(date, clock, timezone = 'Europe/Moscow') {
  const target = Date.parse(`${date}T${clock}:00Z`);
  if (!Number.isFinite(target)) throw new InputError('Проверь дату и время.');
  let result = target;
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(result)).map(x => [x.type, x.value]));
    const local = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    if (target === local) return result;
    result += target - local;
  }
  throw new InputError('Этого местного времени нет из-за перевода часов. Выбери другое время.');
}
export const today = state => dateKey(new Date(), state.settings.timezone);
export function emptyState() {
  let timezone = 'Europe/Moscow';
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone; } catch {}
  return { version: VERSION, profile: null, settings: { timezone, theme: 'nebula', motion: true, cycleVisible: true, remindMinutes: 10, quietStart: '22:00', quietEnd: '08:00', availability: Array.from({length: 7}, () => ({ start: '09:00', end: '21:00' })) }, goals: {}, tasks: {}, occurrences: {}, sessions: {}, attempts: {}, cycleEntries: {}, periods: {}, blocks: {}, messages: {}, timer: null, openingXp: 0, openingDust: 0, legacy: null };
}
export const text = (value, label, max = 200) => {
  const result = String(value ?? '').trim();
  if (!result || result.length > max) throw new InputError(`${label}: введи от 1 до ${max} символов.`);
  return result;
};
export function taskInput(input, state) {
  const duration = Number(input.duration);
  if (!Number.isInteger(duration) || duration < 5 || duration > 720) throw new InputError('Длительность — от 5 до 720 минут.');
  const date = String(input.startDate || today(state));
  if (!validDate(date)) throw new InputError('Укажи корректную дату задачи.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.clock || '')) throw new InputError('Укажи время начала.');
  if (input.endDate && input.endDate < date) throw new InputError('Окончание повторений должно быть после начала.');
  if ((input.endDate && !validDate(input.endDate)) || (input.deadline && !validDate(input.deadline))) throw new InputError('Проверь даты окончания и крайнего срока.');
  const repeat = ['none', 'daily', 'weekdays', 'custom'].includes(input.repeat) ? input.repeat : 'none';
  const days = [...new Set((input.days || []).map(Number))].filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
  if (repeat === 'custom' && !days.length) throw new InputError('Выбери хотя бы один день недели.');
  if (input.goalId && (!state.goals[input.goalId] || state.goals[input.goalId].deleted)) throw new InputError('Выбранная цель больше недоступна.');
  zonedEpoch(date, input.clock, state.settings.timezone);
  return { title: text(input.title, 'Название'), goalId: input.goalId || '', duration, startDate: date, clock: input.clock, repeat, days, endDate: input.endDate || '', deadline: input.deadline || '', priority: ['normal', 'high', 'urgent'].includes(input.priority) ? input.priority : 'normal', remindMinutes: Math.max(0, Math.min(1440, Number(input.remindMinutes ?? state.settings.remindMinutes))), archived: false };
}
export function occursOn(task, date) {
  if (task.archived || date < task.startDate || (task.endDate && date > task.endDate)) return false;
  if (task.repeat === 'none') return date === task.startDate;
  if (task.repeat === 'daily') return true;
  if (task.repeat === 'weekdays') return ![0, 6].includes(weekday(date));
  return (task.days || []).includes(weekday(date));
}
export function materialize(state, from = addDays(today(state), -7), through = addDays(today(state), 21)) {
  const created = [];
  for (const task of Object.values(state.tasks)) {
    if (task.deleted || task.archived || state.goals[task.goalId]?.completed) continue;
    const first = task.repeat === 'none' ? task.startDate : (from > task.startDate ? from : task.startDate);
    const last = task.repeat === 'none' ? task.startDate : through;
    // At most 400 instances per series per pass; old history is never discarded.
    for (let date = first, n = 0; date <= last && n < 400; date = addDays(date, 1), n++) {
      const id = `${task.id}@${date}`;
      if (!occursOn(task, date) || state.occurrences[id]) continue;
      let scheduledAt;
      try { scheduledAt = zonedEpoch(date, task.clock, state.settings.timezone); }
      catch { try { scheduledAt = zonedEpoch(date, minutesClock(Math.min(1439, clockMinutes(task.clock) + 60)), state.settings.timezone); } catch { continue; } }
      const occurrence = { id, taskId: task.id, originalDate: date, scheduledAt, duration: task.duration, status: 'pending', history: [], completedAt: null, updatedAt: Date.now() };
      state.occurrences[id] = occurrence; created.push(occurrence);
    }
  }
  return created;
}
export function occurrenceView(state, occurrence, now = Date.now()) {
  const task = state.tasks[occurrence.taskId];
  if (!task || task.deleted || occurrence.deleted) return null;
  return { ...task, ...occurrence, title: task.title, goalId: task.goalId, priority: task.priority, deadline: task.deadline, inFocus: state.timer?.occurrenceId === occurrence.id, missed: occurrence.status === 'pending' && state.timer?.occurrenceId !== occurrence.id && occurrence.scheduledAt + occurrence.duration * 60000 < now, moved: occurrence.history?.some(h => h.type === 'rescheduled') || false };
}
export function allOccurrences(state, now = Date.now()) { return Object.values(state.occurrences).map(o => occurrenceView(state, o, now)).filter(Boolean).sort((a,b) => a.scheduledAt - b.scheduledAt); }
export function setCompleted(state, id, done, now = Date.now()) {
  const o = state.occurrences[id];
  if (!o || o.deleted) throw new InputError('Задача не найдена.');
  if (done && o.status !== 'done') { o.status = 'done'; o.completedAt = new Date(now).toISOString(); }
  if (!done && o.status === 'done') { o.status = 'pending'; o.completedAt = null; }
  o.updatedAt = now;
  return o;
}
export function cancelOccurrence(state, id, now = Date.now()) {
  const o = state.occurrences[id]; if (!o) throw new InputError('Задача не найдена.');
  o.history.push({ type:'cancelled', at: now }); o.status = 'cancelled'; o.completedAt = null; o.updatedAt = now; return o;
}
export function reschedule(state, id, time, now = Date.now()) {
  const o = state.occurrences[id]; if (!o) throw new InputError('Задача не найдена.');
  if (!Number.isFinite(time) || time < now - 60000) throw new InputError('Выбери будущее время.');
  if (o.status === 'done') throw new InputError('Выполненную задачу сначала нужно вернуть в работу.');
  o.history.push({ type:'rescheduled', from: o.scheduledAt, to: time, at: now });
  o.scheduledAt = time; o.status = 'pending'; o.completedAt = null; o.updatedAt = now;
  return o;
}
export function taskRewards(state) {
  const done = Object.values(state.occurrences).filter(o => !o.deleted && o.status === 'done' && !o.legacyRewarded);
  const xp = Math.max(0, Number(state.openingXp || 0)) + done.reduce((n,o) => n + (o.rewardXp ?? 10), 0);
  const dust = Math.max(0, Number(state.openingDust || 0)) + done.reduce((n,o) => n + (o.rewardDust ?? 5), 0);
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  return { xp, dust, level, progress: xp - (level - 1) ** 2 * 100, target: (2 * level - 1) * 100 };
}
export function kairoState(state, now = Date.now()) {
  const date = dateKey(now, state.settings.timezone);
  const list = allOccurrences(state, now).filter(o => dateKey(o.scheduledAt, state.settings.timezone) === date && o.status !== 'cancelled');
  const missed = allOccurrences(state, now).filter(o => o.missed);
  const done = list.filter(o => o.status === 'done').length;
  const ratio = list.length ? done / list.length : 0;
  return { mood: missed.length ? 'hungry' : list.length && done === list.length ? 'happy' : 'calm', satiety: list.length ? Math.round(35 + 65 * ratio) : 70, done, total: list.length, missed: missed.length, line: missed.length ? `Есть ${missed.length} ${plural(missed.length, ['пропуск','пропуска','пропусков'])}. Давай выберем, что перенести.` : list.length && done === list.length ? 'Все дела дня завершены. Спасибо за звёздное угощение!' : !list.length ? 'Сегодня можно выдохнуть. Или наметить маленький шаг к большой цели.' : `Сегодня у нас ${list.length - done} ${plural(list.length - done, ['дело','дела','дел'])}. Начнём с одного небольшого шага?` };
}
export function plural(n, forms) { const a = Math.abs(n) % 100, b = a % 10; return a >= 11 && a <= 19 ? forms[2] : b === 1 ? forms[0] : b >= 2 && b <= 4 ? forms[1] : forms[2]; }
export function goalStats(state, goalId, from = startOfWeek(today(state)), through = addDays(startOfWeek(today(state)), 6)) {
  const list = allOccurrences(state).filter(o => o.goalId === goalId && o.status !== 'cancelled' && dateKey(o.scheduledAt, state.settings.timezone) >= from && dateKey(o.scheduledAt, state.settings.timezone) <= through);
  const done = list.filter(o => o.status === 'done').length;
  return { done, total: list.length, percent: list.length ? Math.round(done / list.length * 100) : 0 };
}
export function suggestSlots(state, occurrenceId, now = Date.now()) {
  const occurrence = state.occurrences[occurrenceId]; if (!occurrence) return [];
  const task = state.tasks[occurrence.taskId];
  const zone = state.settings.timezone, day = dateKey(now, zone), duration = occurrence.duration * 60000;
  const occupied = allOccurrences(state, now).filter(o => o.id !== occurrenceId && o.status === 'pending').map(o => [o.scheduledAt, o.scheduledAt + o.duration * 60000]);
  occupied.push(...Object.values(state.blocks).filter(b => !b.deleted).map(b => [b.start, b.end]));
  const deadline = task.deadline ? zonedEpoch(task.deadline, '23:59', zone) : Infinity;
  const horizon = task.priority === 'urgent' ? 3 : task.priority === 'high' ? 5 : 10;
  const options = [], late = [];
  for (let d = 0; d < horizon; d++) {
    const date = addDays(day, d), availability = state.settings.availability[weekday(date)];
    if (!availability || availability.disabled) continue;
    const start = clockMinutes(availability.start), end = clockMinutes(availability.end);
    for (let m = start; m + occurrence.duration <= end; m += 15) {
      let time; try { time = zonedEpoch(date, minutesClock(m), zone); } catch { continue; }
      if (time < now + 5 * 60000 || occupied.some(([a,b]) => time < b && time + duration > a)) continue;
      const item = { time, late: time + duration > deadline, reason: `${occurrence.duration} мин свободны${task.deadline ? (time + duration > deadline ? ' · после крайнего срока' : ' · до крайнего срока') : ''}${task.priority === 'urgent' ? ' · срочная задача' : ''}` };
      const collection = item.late ? late : options;
      if (!collection.some(x => Math.abs(x.time - time) < 45 * 60000)) collection.push(item);
      if (options.length >= 3) return options.slice(0, 3);
    }
  }
  return (options.length ? options : late).slice(0, 3);
}
export function recordAttempt(state, input, now = Date.now()) {
  const goal = state.goals[input.goalId];
  if (!goal || goal.deleted) throw new InputError('Выбери учебную цель.');
  const correct = Number(input.correct), total = Number(input.total), minutes = Number(input.minutes || 0);
  if (!Number.isInteger(correct) || !Number.isInteger(total) || total <= 0 || correct < 0 || correct > total || total > 10000) throw new InputError('Проверь число правильных ответов и общее число заданий.');
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) throw new InputError('Проверь затраченное время.');
  const topic = text(input.topic, 'Тема', 120), topicKey = topic.toLocaleLowerCase('ru').trim();
  const attempt = { id: uid(), goalId: goal.id, topic, topicKey, correct, total, minutes, percent: correct / total * 100, date: input.date || today(state), at: now, updatedAt: now };
  if (!validDate(attempt.date)) throw new InputError('Проверь дату результата.');
  state.attempts[attempt.id] = attempt;
  const related = Object.values(state.tasks).find(t => t.goalId === goal.id && t.topicKey === topicKey && t.kind === 'review' && !t.deleted);
  const latest = topicResults(state, goal.id).find(t => t.latest.topicKey === topicKey)?.latest || attempt;
  if (latest.percent < 70) {
    let task = related;
    if (!task || !Object.values(state.occurrences).some(o => o.taskId === task.id && o.status === 'pending')) {
      task = { id: uid(), title: `Повторить: ${topic}`, goalId: goal.id, topicKey, kind: 'review', duration: 25, startDate: today(state), clock: '18:00', priority: 'high', repeat: 'none', days: [], deadline: goal.deadline || '', endDate: '', remindMinutes: state.settings.remindMinutes, updatedAt: now };
      state.tasks[task.id] = task;
      materialize(state);
      const o = state.occurrences[`${task.id}@${task.startDate}`];
      if (o.scheduledAt <= now) { const slot = suggestSlots(state, o.id, now)[0]; if (slot) reschedule(state, o.id, slot.time, now); }
    }
  } else {
    for (const task of Object.values(state.tasks).filter(t => t.goalId === goal.id && t.topicKey === topicKey && t.kind === 'review')) {
      for (const o of Object.values(state.occurrences).filter(o => o.taskId === task.id && o.status === 'pending')) setCompleted(state, o.id, true, now);
    }
  }
  return attempt;
}
export function topicResults(state, goalId) {
  const groups = new Map();
  for (const a of Object.values(state.attempts).filter(a => !a.deleted && a.goalId === goalId).sort((a,b) => String(a.date).localeCompare(String(b.date)) || a.at - b.at)) {
    const key = a.topicKey || a.topic.toLocaleLowerCase('ru');
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(a);
  }
  return [...groups.values()].map(history => ({ topic: history.at(-1).topic, latest: history.at(-1), history, needsReview: history.at(-1).percent < 70 }));
}
export function cycleForecast(state) {
  const starts = Object.values(state.periods).filter(p => !p.deleted).map(p => p.start).sort();
  if (!starts.length) return { starts, intervals: [], next: null, range: null, fertile: null, irregular: false, insufficient: true };
  const intervals = starts.slice(1).map((s,i) => daysBetween(starts[i],s));
  const observed = intervals.slice(-6);
  const lengths = observed.filter(n => n >= 15 && n <= 120);
  const average = lengths.length ? Math.round(lengths.reduce((a,b) => a+b,0) / lengths.length) : Number(state.settings.cycleLength || 28);
  const irregular = observed.some(n => n < 21 || n > 35) || (lengths.length > 1 && Math.max(...lengths) - Math.min(...lengths) > 7);
  const insufficient = observed.length < 3 || lengths.length !== observed.length;
  const spread = lengths.length > 1 ? Math.max(3, Math.ceil(Math.max(...lengths.map(n => Math.abs(n-average))))) : 4;
  const next = addDays(starts.at(-1), average);
  // This is an explicitly labelled calendar estimate, not an ovulation diagnosis or pregnancy probability.
  const fertile = !insufficient && !irregular ? { from: addDays(next, -21), through: addDays(next, -9) } : null;
  return { starts, intervals: observed, average, next, range: { from: addDays(next,-spread), through:addDays(next,spread) }, fertile, irregular, insufficient };
}
export function timerTotal(state, occurrenceId) { return Object.values(state.sessions).filter(s => !s.deleted && s.occurrenceId === occurrenceId).reduce((n,s) => n + s.seconds,0); }
export function validBackup(input) {
  if (!input || typeof input !== 'object' || input.version !== VERSION || !input.settings || !input.tasks || !input.occurrences || !input.goals) throw new InputError('Это не резервная копия VESPER 7.');
  if (typeof input.tasks !== 'object' || Array.isArray(input.tasks)) throw new InputError('Повреждён список задач.');
  const state = { ...emptyState(), ...input, settings: { ...emptyState().settings, ...input.settings } };
  try { new Intl.DateTimeFormat('ru', {timeZone:state.settings.timezone}); } catch { throw new InputError('Некорректный часовой пояс.'); }
  if (!Array.isArray(state.settings.availability) || state.settings.availability.length !== 7) throw new InputError('Повреждено расписание доступного времени.');
  for (const collection of ['tasks','occurrences','goals','attempts','periods','cycleEntries','sessions','blocks','messages']) {
    if (!state[collection] || typeof state[collection] !== 'object' || Array.isArray(state[collection])) throw new InputError(`Повреждены данные: ${collection}.`);
    for (const [id, item] of Object.entries(state[collection])) if (!item || item.id !== id || !/^[A-Za-z0-9][A-Za-z0-9_.@:-]{0,200}$/.test(id) || ['__proto__','constructor','prototype'].includes(id)) throw new InputError('Повреждены идентификаторы записей.');
  }
  for (const t of Object.values(state.tasks)) if (!t.deleted) taskInput(t,state);
  for (const o of Object.values(state.occurrences)) if (!o.deleted && (!Number.isFinite(o.scheduledAt) || !state.tasks[o.taskId] || !['pending','done','cancelled'].includes(o.status))) throw new InputError('Повреждены выполнения задач.');
  return state;
}
export function migrateLegacy(old, now = Date.now()) {
  if (!old?.profile || !Array.isArray(old.missions) || !Array.isArray(old.tasks)) throw new InputError('Файл старой версии не распознан.');
  const state = emptyState(); state.profile = { name: String(old.profile.name || 'Исследователь'), updatedAt:now }; state.legacy = structuredClone(old);
  state.settings.theme = ['nebula','void','system'].includes(old.theme) ? old.theme : 'nebula';
  state.openingDust = Math.max(0, Number(old.stars || 0));
  state.openingXp = Math.max(0, (old.v5?.events || []).reduce((n,e) => n + Number(e.xp || 0),0));
  const date = today(state);
  function taskFrom(item, goalId, prefix) {
    const id = `${prefix}-${item.id || uid()}`, startDate = /^\d{4}-\d{2}-\d{2}$/.test(item.date || '') ? item.date : date;
    state.tasks[id] = { id, title:String(item.text || 'Задача'), goalId, startDate, clock:'18:00', duration:25, repeat:'none', priority:'normal', days:[], deadline:'', endDate:'', remindMinutes:10, updatedAt:now };
    const occurrenceId = `${id}@${startDate}`;
    const o = { id: occurrenceId, taskId:id, originalDate:startDate, scheduledAt:zonedEpoch(startDate,'18:00',state.settings.timezone), duration:25, status:'pending', history:[], completedAt:null, updatedAt:now };
    state.occurrences[occurrenceId] = o;
    if (item.done) { o.status='done'; o.completedAt=new Date(now).toISOString(); o.legacyRewarded=true; }
  }
  for (const m of old.missions) {
    const id = m.id || uid(); state.goals[id] = { id, title:String(m.title||'Цель'), category:m.category||'Личное', deadline:m.v5Deadline||'', study:m.category==='Учеба', completed:!!m.completed, notes:(m.notes||[]).map(n=>n.text||'').join('\n'), updatedAt:now };
    for (const s of m.steps || []) taskFrom(s,id,'step');
    for (const a of m.tests || []) { const aid=`legacy-${a.id||uid()}`; state.attempts[aid]={id:aid,goalId:id,topic:a.topic||'Тема',topicKey:String(a.topic||'Тема').toLocaleLowerCase('ru'),correct:Number(a.correct||0),total:Math.max(1,Number(a.total||1)),percent:Number(a.correct||0)/Math.max(1,Number(a.total||1))*100,minutes:Number(a.minutes||0),date:a.date||date,at:now,updatedAt:now}; }
  }
  for (const t of old.tasks) taskFrom(t,state.goals[t.v5Goal]?.id||'','task');
  for (const [date, entry] of Object.entries(old.cycle?.entries || {})) { state.cycleEntries[date] = { ...entry,id:date,date,updatedAt:now }; }
  if (old.cycle?.periodStart) { const id=old.cycle.periodStart; state.periods[id]={id,start:id,end:'',updatedAt:now}; }
  return state;
}
