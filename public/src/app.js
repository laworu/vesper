import * as D from './domain.js';
import {state,commit,replaceState,initialize,subscribe,getUser,syncStatus,ready,localBackup,loadWarning} from './store.js';
import * as cloud from './cloud.js';
import {shell,esc,icon,button,field,select,longField,taskRow,fmt,fmtDay,time,duration} from './views.js';
const modal=document.querySelector('#modal'),root=document.querySelector('#shell');
const ctx={page:'today',taskFilter:'today',goalFilter:'active',goalTab:'tasks',goalId:'',planWeek:'',cycleMonth:'',cycleDate:'',menu:false,news:[],newsLoading:false,newsError:false,chatBusy:false,capabilities:{},user:null,sync:'local',ready:true};
let renderQueued=false,lastPage='',skipDraft=false,lastIdentity='device';
function toast(message){const node=document.querySelector('#toast');node.textContent=message;node.classList.add('show');clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>node.classList.remove('show'),4300);}
function parseRoute(){const [path]=location.hash.replace(/^#\/?/,'').split('?');const [page,id]=path.split('/');ctx.page=['today','goals','goal','plan','map','kairo','cycle','news','profile'].includes(page)?page:'today';if(page==='goal'){try{ctx.goalId=decodeURIComponent(id||'');}catch{ctx.page='goals';}}ctx.menu=false;}
function navigate(page,id){location.hash=`/${page}${id?'/'+encodeURIComponent(id):''}`;if(ctx.page===page&&(!id||ctx.goalId===id))render();}
function requestRender(){if(renderQueued)return;renderQueued=true;queueMicrotask(()=>{renderQueued=false;render();});}
function formDraft(){
  const form=document.activeElement?.closest('main form');if(!form)return null;
  return {kind:form.dataset.form,active:document.activeElement.name,start:document.activeElement.selectionStart,values:[...form.elements].filter(e=>e.name).map(e=>({name:e.name,value:e.value,checked:e.checked,type:e.type}))};
}
function restoreDraft(draft){
  const form=document.querySelector(`main form[data-form="${draft.kind}"]`);if(!form)return;
  for(const saved of draft.values){const matches=[...form.elements].filter(e=>e.name===saved.name);for(const el of matches){if(['checkbox','radio'].includes(el.type)){if(el.value===saved.value)el.checked=saved.checked;}else el.value=saved.value;}}
  const active=[...form.elements].find(e=>e.name===draft.active);active?.focus({preventScroll:true});try{if(draft.start!==null)active?.setSelectionRange(draft.start,draft.start);}catch{}
}
function render(){
  const account=getUser(),identity=account?account.uid+':'+Boolean(account.unverified):'device';
  if(identity!==lastIdentity){closeModal();pendingBackup.value=null;ctx.chatBusy=false;skipDraft=true;lastIdentity=identity;}
  const draft=!skipDraft&&lastPage===ctx.page?formDraft():null;skipDraft=false;
  ctx.user=getUser();ctx.sync=syncStatus();ctx.syncError=cloud.syncErrorMessage();ctx.ready=ready();ctx.hasLocal=Boolean(localBackup());
  root.innerHTML=shell(state,ctx);lastPage=ctx.page;
  document.body.classList.toggle('no-motion',!state.settings.motion);
  document.body.classList.toggle('has-timer',Boolean(state.timer));document.body.dataset.theme=state.settings.theme;
  document.title=`${ctx.page==='goal'?state.goals[ctx.goalId]?.title||'Цель':({today:'Сегодня',goals:'Цели',plan:'План',map:'Вселенная',kairo:'Кайро',cycle:'Дневник цикла',news:'Обсерватория',profile:'Профиль'})[ctx.page]} · VESPER`;
  if(draft)restoreDraft(draft);
  updateTimer();
  if(ctx.page==='kairo'){const log=document.querySelector('#chat-messages');if(log)log.scrollTop=log.scrollHeight;}
  if(ctx.page==='news'&&!ctx.news.length&&!ctx.newsLoading&&!ctx.newsError)loadNews();
  if(!state.profile&&ctx.ready&&!ctx.user?.unverified&&!modal.open)welcome();
  highlightFocusedTask();
}
function highlightFocusedTask(){const focus=new URLSearchParams(location.hash.split('?')[1]||'').get('focus');if(focus){const item=[...document.querySelectorAll('[data-occurrence]')].find(n=>n.dataset.occurrence===focus);if(item){item.style.outline='1px solid #c4a4ed';item.style.borderRadius='8px';item.scrollIntoView({block:'center'});}}}
function showModal(title,content){modal.innerHTML=`<div class="modal-header"><h2 id="modal-title">${esc(title)}</h2><button type="button" class="icon-button" data-act="close" aria-label="Закрыть окно">${icon('close',17)}</button></div><div class="modal-body">${content}</div>`;if(!modal.open)modal.showModal();requestAnimationFrame(()=>modal.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea,button[type=submit]')?.focus());}
function closeModal(){modal.close();modal.innerHTML='';}
function form(kind,content,submit='Сохранить',hidden=''){return `<form data-form="${kind}"><div class="form-error" role="alert"></div>${hidden}${content}<div class="modal-footer">${button('Отмена','close','secondary')}<button class="btn" type="submit">${esc(submit)}</button></div></form>`;}
function confirmAction(title,description,action,label='Подтвердить'){showModal(title,`<p class="muted small">${esc(description)}</p><div class="modal-footer">${button('Отмена','close','secondary')}${button(label,action,'danger')}</div>`);}
function welcome(){showModal('Твоя вселенная начинается здесь',`<div class="welcome"><span class="brand-star">✦</span><p>Цели, маленькие шаги и твой звёздный спутник.<br>Здесь можно двигаться в собственном темпе.</p><form data-form="welcome"><div class="form-error" role="alert"></div>${field('name','Как к тебе обращаться?',ctx.user?.name||'',{required:true,placeholder:'Имя или никнейм'})}<button class="btn full large" type="submit">Открыть мою вселенную ${icon('arrow',16)}</button></form><p class="consent">${ctx.user?'Записи сохранятся в твоём онлайн-профиле.':'На этом устройстве записи сохраняются в браузере. Для телефона и компьютера нужен онлайн-профиль.'}</p>${!ctx.user?button('Войти в онлайн-профиль','auth','secondary full','user'):''}<div class="divider">или</div><button type="button" class="sub-action" data-act="demo">Посмотреть пример с задачами</button></div>`);}
function taskForm(id='',goalId='',date=''){
  const t=id?state.tasks[id]:null;
  const goals=Object.values(state.goals).filter(g=>!g.deleted&&(!g.completed||g.id===t?.goalId));
  showModal(t?'Изменить задачу':'Добавить задачу',form('task',field('title','Что нужно сделать?',t?.title||'',{required:true,placeholder:'Например, разобрать одну тему'})+select('goalId','Связь с целью',t?.goalId||goalId,[['','Самостоятельная задача'],...goals.map(g=>[g.id,g.title])])+`<div class="form-grid">${field('startDate','Дата первого выполнения',t?.startDate||date||D.today(state),{type:'date',required:true})}${field('clock','Время начала',t?.clock||'18:00',{type:'time',required:true})}${field('duration','Плановая длительность, минут',t?.duration||25,{type:'number',min:5,max:720,required:true})}${select('priority','Срочность',t?.priority||'normal',[['normal','Обычная'],['high','Важная'],['urgent','Срочная']])}</div>`+select('repeat','Регулярность',t?.repeat||'none',[['none','Один раз'],['daily','Каждый день'],['weekdays','По будням'],['custom','В выбранные дни']])+`<div class="field" id="custom-days" ${(t?.repeat||'none')!=='custom'?'hidden':''}><label>Дни недели</label><div class="checks">${[1,2,3,4,5,6,0].map((d,i)=>`<label class="check-chip"><input type="checkbox" name="days" value="${d}" ${(t?.days||[]).includes(d)?'checked':''}>${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i]}</label>`).join('')}</div></div><div class="form-grid">${field('endDate','Повторять до (необязательно)',t?.endDate||'',{type:'date'})}${field('deadline','Крайний срок (необязательно)',t?.deadline||'',{type:'date'})}</div>`+select('remindMinutes','Напоминание',t?.remindMinutes??state.settings.remindMinutes,[[0,'В момент начала'],[5,'За 5 минут'],[10,'За 10 минут'],[30,'За 30 минут'],[60,'За час']])+`<p class="small muted">Регулярные задачи имеют отдельную отметку на каждый день. Изменения расписания применяются к будущим неперенесённым выполнениям.</p>`,t?'Сохранить задачу':'Добавить задачу',`<input type="hidden" name="id" value="${esc(id)}">`));
}
function goalForm(id=''){
  const g=state.goals[id];showModal(g?'Изменить цель':'Создать цель',form('goal',field('title','К какому результату хочешь прийти?',g?.title||'',{required:true,placeholder:'Например, подготовиться к пробнику'})+select('category','Направление',g?.category||'Личное',[['Личное','Личное'],['Учёба','Учёба'],['Работа','Работа'],['Спорт','Спорт'],['Творчество','Творчество']])+field('deadline','Ориентир по сроку (необязательно)',g?.deadline||'',{type:'date'})+`<label class="check-chip mb"><input type="checkbox" name="study" ${g?.study?'checked':''}>Учебная цель — вести темы и результаты ДЗ</label>`+longField('notes','Описание результата и заметки',g?.notes||'')+(g?`<div class="form-divider">${button('Удалить цель и её задачи',`delete-goal:${g.id}`,'danger small')}</div>`:''),g?'Сохранить изменения':'Создать цель',`<input type="hidden" name="id" value="${esc(id)}">`));
}
function attemptForm(goalId,topic=''){
  const task=state.tasks[topic];if(task?.kind==='review')topic=task.title.replace(/^Повторить:\s*/,'');else {try{topic=decodeURIComponent(topic);}catch{}}
  showModal('Записать результат ДЗ',form('attempt',field('topic','Тема',topic,{required:true})+`<div class="form-grid">${field('correct','Правильных ответов','',{type:'number',min:0,max:10000,required:true})}${field('total','Всего заданий','',{type:'number',min:1,max:10000,required:true})}${field('date','Дата выполнения',D.today(state),{type:'date',required:true})}${field('minutes','Затраченное время, минут',0,{type:'number',min:0,max:1440})}</div><div class="note">Меньше 70% — создадим задачу повторения. От 70% — тема будет отмечена как исправленная. Старые попытки останутся в истории.</div>`,'Сохранить результат',`<input type="hidden" name="goalId" value="${esc(goalId)}">`));
}
function detailForm(id){
  const o=D.occurrenceView(state,state.occurrences[id]||{});if(!o)throw Error('Задача не найдена.');
  const list=(o.history||[]).map(h=>`<li>${h.type==='rescheduled'?`Перенесена: ${fmt(h.from,state)} ${time(h.from,state)} → ${fmt(h.to,state)} ${time(h.to,state)}`:h.type==='cancelled'?'Удалена из плана':h.type==='goal-closed'?'Цель завершена':h.type==='schedule-changed'?'Изменено расписание':'Изменение'} · ${fmt(h.at,state)}</li>`).join('');
  showModal(o.title,`<p class="small muted">${state.goals[o.goalId]?`Цель: ${esc(state.goals[o.goalId].title)}`:'Самостоятельная задача'}</p><div class="grid-2"><div class="note">План: ${fmt(o.scheduledAt,state,{day:'numeric',month:'long'})} в ${time(o.scheduledAt,state)}<br>Длительность: ${o.duration} мин</div><div class="note">Фактическое время: ${duration(D.timerTotal(state,id))}<br>${o.status==='done'?`Выполнена ${fmt(o.completedAt,state)}`:o.status==='cancelled'?'Удалена из плана':o.missed?'Пропущена':'В плане'}</div></div>${o.deadline?`<p class="small mt">Крайний срок: ${fmtDay(o.deadline,state)}</p>`:''}${list?`<h3 class="mt">История</h3><ul class="small muted">${list}</ul>`:''}<div class="row wrap mt">${button('Изменить задачу / расписание',`edit-task:${o.taskId}`,'secondary small')}${button('Добавить время вручную',`manual-time:${id}`,'secondary small','clock')}${o.status==='pending'?button('Перенести',`move:${id}`,'secondary small','move'):''}${o.repeat!=='none'&&!state.tasks[o.taskId]?.archived?button('Остановить повторения',`stop-series:${o.taskId}`,'danger small'):''}${o.status!=='cancelled'?button('Удалить это выполнение',`cancel:${id}`,'danger small'):button('Вернуть в план',`restore:${id}`,'secondary small')}</div>`);
}
function moveForm(id){
  const o=D.occurrenceView(state,state.occurrences[id]||{});if(!o)throw Error('Задача не найдена.');
  const slots=D.suggestSlots(state,id),first=slots[0],defaultDate=first?D.dateKey(first.time,state.settings.timezone):D.today(state),defaultClock=first?time(first.time,state):'18:00';
  showModal('Новый маршрут для задачи',form('move',`<p class="small muted">${esc(o.title)} · ${o.duration} мин. Учитываем доступные часы, занятость, крайний срок и срочность.</p>${slots.length?slots.map((s,i)=>`<label class="time-slot"><input type="radio" name="slot" value="${s.time}" ${i===0?'checked':''}><span class="grow">${fmt(s.time,state,{weekday:'short',day:'numeric',month:'short'})}, ${time(s.time,state)}<small class="${s.late?'danger-text':''}">${esc(s.reason)}</small></span>${s.late?'<span class="badge red">После срока</span>':''}</label>`).join(''):'<div class="note">Подходящих свободных интервалов в ближайшие дни не нашлось. Можно изменить свободные часы в профиле или выбрать время вручную.</div>'}<label class="time-slot"><input type="radio" name="slot" value="manual" ${!slots.length?'checked':''}><span class="grow">Выбрать другое время</span></label><div class="form-grid mt" id="manual-slot" ${slots.length?'hidden':''}>${field('date','Дата',defaultDate,{type:'date'})}${field('clock','Время',defaultClock,{type:'time'})}</div><p class="small muted mt">Перенесётся только это выполнение. Исходная дата и отметка о переносе сохранятся.</p>`,'Перенести задачу',`<input type="hidden" name="id" value="${esc(id)}">`));
}
function periodForm(id=''){
  const p=state.periods[id];showModal(p?'Изменить фактические даты':'Отметить менструацию',form('period',`<div class="form-grid">${field('start','Фактическое начало',p?.start||ctx.cycleDate||D.today(state),{type:'date',required:true})}${field('end','Фактическое окончание',p?.end||'',{type:'date'})}</div><p class="small muted">Если период ещё идёт, окончание можно добавить позже. Новая фактическая дата обновит историю и ориентировочный прогноз.</p>${p?button('Удалить этот период',`delete-period:${id}`,'danger small'):''}`,'Сохранить даты',`<input type="hidden" name="id" value="${esc(id)}">`));
}
function authForm(mode='login'){
  if(!cloud.configured()){showModal('Онлайн-профиль',`<p class="muted small">Онлайн-вход для этой версии ещё не подключён. Текущие записи сохраняются в браузере и доступны для экспорта в профиле.</p><p class="small muted">После подключения ты сможешь открыть один и тот же профиль на телефоне и компьютере.</p><div class="modal-footer">${button('Понятно','close')}</div>`);return;}
  showModal(mode==='signup'?'Создать онлайн-профиль':'Войти в профиль',form('auth',field('email','Электронная почта','',{type:'email',required:true})+field('password','Пароль','',{type:'password',required:true})+`<p class="consent">${mode==='signup'?'Пароль — от 6 символов. На почту придёт письмо подтверждения.':'После входа откроются записи выбранного профиля. Локальные записи не переносятся автоматически.'}</p><div class="row wrap">${button(mode==='signup'?'Уже есть профиль':'Создать профиль',mode==='signup'?'auth':'signup','ghost small')}${button('Забыли пароль?','reset-password','ghost small')}</div>`,mode==='signup'?'Зарегистрироваться':'Войти',`<input type="hidden" name="mode" value="${mode}">`)+`<hr>${button('Войти через Google','google-auth','secondary full')}`);
}
function saveTimer(s,now=Date.now()){
  const t=s.timer;if(!t)return;
  const elapsed=t.elapsedMs+(t.running?Math.max(0,now-t.startedAt):0);
  s.sessions[t.id]={id:t.id,occurrenceId:t.occurrenceId,seconds:Math.max(1,Math.round(elapsed/1000)),date:D.dateKey(now,s.settings.timezone),at:now,updatedAt:now};s.timer=null;
}
function startTimer(id){
  const o=state.occurrences[id];if(!o||o.status!=='pending')throw Error('Таймер доступен для задачи в работе.');
  if(state.timer?.occurrenceId===id){closeModal();toast('Таймер этой задачи уже открыт.');return;}
  if(state.timer){confirmAction('Переключить таймер?','Текущее время будет сохранено, затем начнётся новая задача.',`switch-timer:${id}`,'Сохранить и начать');return;}
  commit(s=>{s.timer={id:D.uid(),occurrenceId:id,elapsedMs:0,startedAt:Date.now(),running:true,updatedAt:Date.now()};});closeModal();toast('Время пошло.');
}
function updateTimer(){const t=state.timer;if(!t)return;const seconds=Math.floor((t.elapsedMs+(t.running?Math.max(0,Date.now()-t.startedAt):0))/1000);const text=`${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;document.querySelectorAll('[data-timer-readout]').forEach(el=>el.textContent=text);}
async function loadNews(){if(ctx.newsLoading)return;ctx.newsLoading=true;ctx.newsError=false;requestRender();try{const r=await fetch('/api/news',{signal:AbortSignal.timeout(12000)});const data=await r.json();if(!r.ok&&!data.items?.length)throw Error('news');ctx.news=(data.items||[]).filter(n=>/^https:\/\/(www\.)?(nasa\.gov|esa\.int)\//.test(n.url||''));ctx.newsError=Boolean(data.stale);sessionStorage.setItem('vesper:news',JSON.stringify(ctx.news));}catch{ctx.newsError=true;}finally{ctx.newsLoading=false;requestRender();}}
function exportData(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`VESPER-${D.today(state)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function pendingBackup(data){
  let parsed;try{parsed=JSON.parse(data);}catch{throw Error('Не удалось прочитать JSON-файл.');}
  const next=parsed.version===7?D.validBackup(parsed):D.migrateLegacy(parsed);
  showModal('Импортировать резервную копию?',`<p class="muted small">Текущие записи будут заменены. Сначала можно скачать их копию. В выбранном файле: ${Object.keys(next.goals).length} целей и ${Object.keys(next.tasks).length} задач.</p><div class="modal-footer">${button('Экспортировать текущие','export','secondary')}${button('Отмена','close','secondary')}${button('Заменить записи','confirm-import','danger')}</div>`);pendingBackup.value=next;
}
function demo(){
  if(state.profile){confirmAction('Загрузить пример?','Пример добавит цели и задачи в текущий профиль.', 'confirm-demo','Добавить пример');return;}seedDemo();
}
function seedDemo(){commit(s=>{
  s.profile=s.profile||{name:'Исследователь',updatedAt:Date.now()};const date=D.today(s);
  const examples=[['Подготовиться к пробнику','Учёба',true],['Вернуть движение в день','Спорт',false],['Запустить личный проект','Творчество',false]];
  const ids=examples.map(([title,category,study])=>{const id=D.uid();s.goals[id]={id,title,category,study,deadline:D.addDays(date,30),notes:'',completed:false,updatedAt:Date.now()};return id;});
  [['Решить 5 заданий по математике',ids[0],25,'daily','16:00'],['Разобрать сложную тему',ids[0],40,'none','18:00'],['Прогуляться без телефона',ids[1],30,'daily','19:00'],['Набросать идею проекта',ids[2],30,'none','20:00'],['Записаться на тренировку','',10,'none','12:00']].forEach(([title,goalId,duration,repeat,clock])=>{const id=D.uid();s.tasks[id]={id,...D.taskInput({title,goalId,duration,repeat,clock,startDate:date,priority:'normal'},s),updatedAt:Date.now()};});
  });closeModal();toast('Пример добавлен. Все задачи можно изменить или удалить.');}
async function act(value){
  const [action,...args]=value.split(':'),id=args[0];
  if(action==='close'){closeModal();return;}
  if(action==='go'){closeModal();navigate(id);return;}
  if(action==='menu'){ctx.menu=!ctx.menu;requestRender();return;}
  if(action==='auth'){authForm();return;}
  if(action==='signup'){authForm('signup');return;}
  if(action==='google-auth'){await cloud.googleSignIn();closeModal();return;}
  if(action==='reset-password'){const email=modal.querySelector('[name=email]')?.value;if(!email)throw Error('Сначала введи почту.');await cloud.resetPassword(email);toast('Если профиль существует, письмо восстановления отправлено.');return;}
  if(action==='verify'){showModal('Подтверждение почты',`<p class="small muted">Открой письмо от VESPER по адресу ${esc(getUser()?.email)} и перейди по ссылке.</p><div class="row wrap mt">${button('Я подтвердил(а) почту','check-verification')}${button('Отправить письмо снова','resend-verification','secondary')}${button('Выйти','sign-out','ghost')}</div>`);return;}
  if(action==='check-verification'){await cloud.checkVerification();closeModal();toast('Почта подтверждена.');requestRender();return;}
  if(action==='retry-sync'){await cloud.refreshSession();toast('Облачные записи обновлены.');return;}
  if(action==='resend-verification'){await cloud.resendVerification();toast('Письмо отправлено. Проверь также папку «Спам».');return;}
  if(action==='sign-out'){await cloud.signOut();closeModal();toast('Онлайн-профиль закрыт.');return;}
  if(getUser()?.unverified){await act('verify');return;}
  if(action==='demo'){demo();return;}
  if(action==='confirm-demo'){seedDemo();return;}
  if(!state.profile){welcome();return;}
  if(action==='new-task'){taskForm('',id||'');return;}
  if(action==='new-task-date'){taskForm('','',id);return;}
  if(action==='edit-task'){taskForm(id);return;}
  if(action==='new-goal'){goalForm();return;}
  if(action==='edit-goal'){goalForm(id);return;}
  if(action==='goal'){ctx.goalTab='tasks';navigate('goal',id);return;}
  if(action==='goaltab'){ctx.goalTab=id;requestRender();return;}
  if(action==='goalfilter'){ctx.goalFilter=id;requestRender();return;}
  if(action==='filter'){ctx.taskFilter=id;requestRender();return;}
  if(action==='complete-goal'){
    const g=state.goals[id];if(g.completed){commit(s=>{s.goals[id].completed=false;for(const o of Object.values(s.occurrences)){if(s.tasks[o.taskId]?.goalId===id&&o.status==='cancelled'&&o.history.at(-1)?.type==='goal-closed'&&o.scheduledAt>Date.now()){o.status='pending';o.history.push({type:'reopened',at:Date.now()});}}});toast('Цель снова в работе.');return;}
    confirmAction('Завершить цель?','Оставшиеся выполнения будут убраны из плана. История выполненного сохранится.',`confirm-complete-goal:${id}`,'Завершить цель');return;
  }
  if(action==='confirm-complete-goal'){commit(s=>{s.goals[id].completed=true;s.goals[id].completedAt=new Date().toISOString();for(const o of Object.values(s.occurrences)){if(s.tasks[o.taskId]?.goalId===id&&o.status==='pending'){o.status='cancelled';o.history.push({type:'goal-closed',at:Date.now()});}}});closeModal();toast('Цель завершена. Это важный шаг! ✦');return;}
  if(action==='delete-goal'){confirmAction('Удалить цель?','Цель и её задачи будут удалены из текущего плана. Перед этим можно сохранить экспорт в профиле.',`confirm-delete-goal:${id}`,'Удалить цель');return;}
  if(action==='confirm-delete-goal'){if(state.timer&&state.tasks[state.occurrences[state.timer.occurrenceId]?.taskId]?.goalId===id)throw Error('Сначала сохрани активный таймер этой цели.');commit(s=>{s.goals[id].deleted=true;for(const t of Object.values(s.tasks))if(t.goalId===id)t.deleted=true;for(const o of Object.values(s.occurrences))if(s.tasks[o.taskId]?.goalId===id&&o.status!=='done')o.deleted=true;});closeModal();navigate('goals');toast('Цель удалена.');return;}
  if(action==='notes'){showModal('Заметки к цели',form('notes',longField('notes','Текст',state.goals[id].notes||''),'Сохранить заметки',`<input type="hidden" name="id" value="${esc(id)}">`));return;}
  if(action==='attempt'){attemptForm(id,args.slice(1).join(':'));return;}
  if(action==='detail'){detailForm(id);return;}
  if(action==='move'){moveForm(id);return;}
  if(action==='cancel'){confirmAction('Удалить это выполнение?','Удалится только это дело из плана. Расписание остальных повторений сохранится; пропуск останется в истории.',`confirm-cancel:${id}`,'Удалить выполнение');return;}
  if(action==='confirm-cancel'){commit(s=>{if(s.timer?.occurrenceId===id)saveTimer(s);D.cancelOccurrence(s,id);});closeModal();toast('Выполнение удалено из плана.');return;}
  if(action==='restore'){commit(s=>{s.occurrences[id].status='pending';s.occurrences[id].history.push({type:'restored',at:Date.now()});});closeModal();toast('Задача возвращена в план.');return;}
  if(action==='timer'){startTimer(id);return;}
  if(action==='stop-series'){confirmAction('Остановить повторения?','Будущие выполнения будут удалены из плана. История и уже пропущенные дела сохранятся.',`confirm-stop-series:${id}`,'Остановить повторения');return;}
  if(action==='confirm-stop-series'){commit(s=>{s.tasks[id].archived=true;for(const o of Object.values(s.occurrences))if(o.taskId===id&&o.status==='pending'&&o.scheduledAt>=Date.now()){o.status='cancelled';o.history.push({type:'series-stopped',at:Date.now()});}});closeModal();toast('Будущие повторения остановлены.');return;}
  if(action==='switch-timer'){commit(s=>saveTimer(s));startTimer(id);return;}
  if(action==='timer-pause'){commit(s=>{const t=s.timer;if(!t)return;if(t.running){t.elapsedMs+=Math.max(0,Date.now()-t.startedAt);t.running=false;}else{t.startedAt=Date.now();t.running=true;}});return;}
  if(action==='timer-stop'){commit(s=>saveTimer(s));toast('Фактическое время сохранено.');return;}
  if(action==='manual-time'){showModal('Добавить фактическое время',form('manual-time',field('minutes','Сколько минут потрачено?','',{type:'number',min:1,max:1440,required:true})+field('date','Дата работы',D.today(state),{type:'date',required:true}),'Сохранить время',`<input type="hidden" name="id" value="${esc(id)}">`));return;}
  if(action==='week'){ctx.planWeek=D.addDays(ctx.planWeek||D.startOfWeek(D.today(state)),Number(id)*7);commit(s=>D.materialize(s,ctx.planWeek,D.addDays(ctx.planWeek,6)));return;}
  if(action==='new-block'){showModal('Занятый интервал',form('block',field('title','Что занимает это время?','',{required:true,placeholder:'Например, работа или занятия'})+field('date','Дата',D.today(state),{type:'date',required:true})+`<div class="form-grid">${field('start','Начало','09:00',{type:'time',required:true})}${field('end','Окончание','17:00',{type:'time',required:true})}</div>`,'Добавить интервал'));return;}
  if(action==='block'){const b=state.blocks[id];confirmAction(b.title,`${fmt(b.start,state)} ${time(b.start,state)}–${time(b.end,state)}. Удалить этот занятый интервал?`,`delete-block:${id}`,'Удалить интервал');return;}
  if(action==='delete-block'){commit(s=>s.blocks[id].deleted=true);closeModal();toast('Интервал удалён.');return;}
  if(action==='cycle-date'){ctx.cycleDate=id;requestRender();return;}
  if(action==='month'){const date=new Date((ctx.cycleMonth||D.today(state).slice(0,7)+'-01')+'T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+Number(id));ctx.cycleMonth=date.toISOString().slice(0,10);requestRender();return;}
  if(action==='period'){periodForm(id||'');return;}
  if(action==='delete-period'){confirmAction('Удалить период?','Эти даты перестанут учитываться в прогнозе. Ежедневные записи сохранятся.',`confirm-delete-period:${id}`,'Удалить даты');return;}
  if(action==='confirm-delete-period'){commit(s=>s.periods[id].deleted=true);closeModal();toast('Даты удалены, прогноз обновлён.');return;}
  if(action==='delete-cycle'){confirmAction('Удалить запись дня?','Симптомы и личные отметки этого дня будут удалены.',`confirm-delete-cycle:${id}`,'Удалить запись');return;}
  if(action==='confirm-delete-cycle'){commit(s=>s.cycleEntries[id]={id,deleted:true,updatedAt:Date.now()});closeModal();toast('Запись удалена.');return;}
  if(action==='refresh-news'){loadNews();return;}
  if(action==='prompt'){const input=document.querySelector('#chat-input');input.value=args.join(':');input.focus();return;}
  if(action==='export'){exportData();return;}
  if(action==='import'){document.querySelector('#import-file')?.click();return;}
  if(action==='confirm-import'){if(pendingBackup.value){replaceState(pendingBackup.value);pendingBackup.value=null;closeModal();toast('Резервная копия восстановлена.');}return;}
  if(action==='import-local'){const backup=localBackup();if(backup)pendingBackup(backup);return;}
  if(action==='enable-push'){await cloud.subscribePush();toast('Уведомления включены на этом устройстве.');return;}
  if(action==='disable-push'){await cloud.unsubscribePush();toast('Уведомления отключены на этом устройстве.');return;}
}
async function submit(formNode){
  const f=new FormData(formNode),value=Object.fromEntries(f),kind=formNode.dataset.form;
  if(kind==='welcome'){commit(s=>s.profile={name:D.text(value.name,'Имя',32),updatedAt:Date.now()});closeModal();toast('Добро пожаловать в твою вселенную!');return;}
  if(kind==='goal'){const title=D.text(value.title,'Название цели',120),id=value.id||D.uid();commit(s=>{s.goals[id]={...(s.goals[id]||{}),id,title,category:value.category,deadline:value.deadline||'',study:f.has('study'),notes:String(value.notes||'').slice(0,3000),completed:s.goals[id]?.completed||false,updatedAt:Date.now()};});closeModal();navigate('goal',id);toast('Цель сохранена. Теперь добавь к ней задачи.');return;}
  if(kind==='task'){
    const input=D.taskInput({...value,days:f.getAll('days')},state),id=value.id||D.uid();
    commit(s=>{s.tasks[id]={...(s.tasks[id]||{}),id,...input,updatedAt:Date.now()};for(const o of Object.values(s.occurrences)){if(o.taskId!==id||o.status!=='pending'||o.history.some(h=>h.type==='rescheduled')||o.scheduledAt<Date.now())continue;if(D.occursOn(s.tasks[id],o.originalDate)){o.scheduledAt=D.zonedEpoch(o.originalDate,input.clock,s.settings.timezone);o.duration=input.duration;}else{o.status='cancelled';o.history.push({type:'schedule-changed',at:Date.now()});}}});closeModal();toast('Задача сохранена.');return;
  }
  if(kind==='attempt'){if(value.date>D.today(state))throw Error('Результат должен относиться к уже выполненному ДЗ.');let result;commit(s=>result=D.recordAttempt(s,value));closeModal();toast(result.percent<70?'Результат сохранён. Добавлена задача повторения.':'Результат сохранён. Тема исправлена! ✦');return;}
  if(kind==='notes'){commit(s=>s.goals[value.id].notes=String(value.notes||'').slice(0,3000));closeModal();toast('Заметки сохранены.');return;}
  if(kind==='move'){
    const timestamp=value.slot==='manual'?D.zonedEpoch(value.date,value.clock,state.settings.timezone):Number(value.slot),o=state.occurrences[value.id],end=timestamp+o.duration*60000;
    if(D.allOccurrences(state).some(a=>a.id!==o.id&&a.status==='pending'&&timestamp<a.scheduledAt+a.duration*60000&&end>a.scheduledAt)||Object.values(state.blocks).some(b=>!b.deleted&&timestamp<b.end&&end>b.start))throw Error('Это время уже занято. Выбери другой интервал.');
    commit(s=>D.reschedule(s,value.id,timestamp));closeModal();toast('Задача перенесена. Отметка и история сохранены.');return;
  }
  if(kind==='manual-time'){const minutes=Number(value.minutes);if(!Number.isFinite(minutes)||minutes<1||minutes>1440)throw Error('Укажи от 1 до 1440 минут.');if(value.date>D.today(state))throw Error('Фактическое время нельзя записать на будущий день.');commit(s=>{const id=D.uid();s.sessions[id]={id,occurrenceId:value.id,seconds:minutes*60,date:value.date,at:Date.now(),updatedAt:Date.now()};});closeModal();toast('Время добавлено.');return;}
  if(kind==='block'){const start=D.zonedEpoch(value.date,value.start,state.settings.timezone),end=D.zonedEpoch(value.date,value.end,state.settings.timezone);if(end<=start)throw Error('Окончание должно быть после начала.');commit(s=>{const id=D.uid();s.blocks[id]={id,title:D.text(value.title,'Название',100),start,end,updatedAt:Date.now()};});closeModal();toast('Занятость добавлена.');return;}
  if(kind==='period'){
    if(!value.start||value.start>D.today(state)||value.end>D.today(state))throw Error('Отмечай только фактические даты, не будущие.');
    if(value.end&&value.end<value.start)throw Error('Окончание не может быть раньше начала.');
    if(Object.values(state.periods).some(p=>!p.deleted&&p.id!==value.id&&value.start<=(p.end||p.start)&&(value.end||value.start)>=p.start))throw Error('Эти даты пересекаются с уже отмеченным периодом. Измени существующую запись.');
    commit(s=>{const id=value.id||D.uid();s.periods[id]={id,start:value.start,end:value.end||'',updatedAt:Date.now()};});closeModal();toast('Даты сохранены, прогноз пересчитан.');return;
  }
  if(kind==='cycle'){
    if(value.date>D.today(state))throw Error('Наблюдения можно записать за сегодняшний или прошедший день.');
    const pain=value.pain===''?null:Number(value.pain),energy=value.energy===''?null:Number(value.energy);
    if(pain!==null&&(!Number.isInteger(pain)||pain<0||pain>10))throw Error('Боль — целое число от 0 до 10.');if(energy!==null&&(!Number.isInteger(energy)||energy<1||energy>5))throw Error('Энергия — целое число от 1 до 5.');
    skipDraft=true;commit(s=>{s.cycleEntries[value.date]={id:value.date,date:value.date,flow:value.flow,symptoms:f.getAll('symptom'),pain,energy,mood:value.mood,sex:f.has('sex'),note:String(value.note||'').slice(0,2000),updatedAt:Date.now()};});toast('Запись дня сохранена.');return;
  }
  if(kind==='settings'){
    const name=D.text(value.name,'Имя',32);try{new Intl.DateTimeFormat('ru',{timeZone:value.timezone});}catch{throw Error('Проверь часовой пояс, например Europe/Moscow.');}
    const availability=Array.from({length:7},(_,d)=>({disabled:!f.has(`available-${d}`),start:value[`start-${d}`],end:value[`end-${d}`]}));
    if(availability.some(a=>!a.disabled&&(!a.start||!a.end||a.end<=a.start)))throw Error('В доступные дни окончание должно быть позже начала.');
    skipDraft=true;commit(s=>{s.profile.name=name;s.settings={...s.settings,timezone:value.timezone,theme:value.theme,motion:f.has('motion'),cycleVisible:f.has('cycleVisible'),remindMinutes:Number(value.remindMinutes),quietStart:value.quietStart,quietEnd:value.quietEnd,availability};});toast('Настройки сохранены.');return;
  }
  if(kind==='auth'){
    if(value.mode==='signup'){await cloud.signUp(value.email,value.password);closeModal();toast('Профиль создан. Подтверди почту, чтобы включить синхронизацию.');}
    else{await cloud.signIn(value.email,value.password);closeModal();toast('Вход выполнен.');}return;
  }
  if(kind==='chat'){
    if(!ctx.user){authForm();return;}if(!ctx.capabilities.chat)throw Error('Свободный ИИ-чат ещё не подключён.');
    const message=D.text(value.message,'Сообщение',2000),history=Object.values(state.messages).filter(m=>!m.deleted).sort((a,b)=>a.at-b.at).slice(-8).map(m=>({role:m.role,content:m.content})),requestUid=ctx.user.uid;
    const id=D.uid();skipDraft=true;commit(s=>s.messages[id]={id,role:'user',content:message,at:Date.now(),updatedAt:Date.now()});ctx.chatBusy=true;requestRender();
    try{const result=await cloud.api('/api/chat',{message,history},requestUid);if(getUser()?.uid!==requestUid)return;commit(s=>{const id=D.uid();s.messages[id]={id,role:'assistant',content:result.reply,at:Date.now(),updatedAt:Date.now()};});}finally{ctx.chatBusy=false;requestRender();}return;
  }
}
document.addEventListener('click',event=>{const target=event.target.closest('[data-act]');if(!target)return;event.preventDefault();Promise.resolve(act(target.dataset.act)).catch(error=>{const errorBox=modal.open?modal.querySelector('.form-error'):null;if(errorBox)errorBox.textContent=cloud.authMessage(error);else toast(cloud.authMessage(error));});});
document.addEventListener('submit',async event=>{
  const formNode=event.target;if(!formNode.matches('form[data-form]'))return;event.preventDefault();
  const errorBox=formNode.querySelector('.form-error');if(errorBox)errorBox.textContent='';const submitButton=event.submitter;if(submitButton)submitButton.disabled=true;
  try{await submit(formNode);}catch(error){if(errorBox&&errorBox.isConnected)errorBox.textContent=cloud.authMessage(error);else toast(cloud.authMessage(error));}finally{if(submitButton?.isConnected)submitButton.disabled=false;}
});
document.addEventListener('change',async event=>{
  const el=event.target;
  try{
    if(el.matches('[data-complete]')){
      const id=el.dataset.complete,o=state.occurrences[id],task=state.tasks[o.taskId];
      if(el.checked&&task.kind==='review'&&D.topicResults(state,task.goalId).find(t=>t.latest.topicKey===task.topicKey)?.needsReview){el.checked=false;attemptForm(task.goalId,task.id);return;}
      const checked=el.checked,before=D.taskRewards(state);commit(s=>{if(checked&&s.timer?.occurrenceId===id)saveTimer(s);D.setCompleted(s,id,checked);});const after=D.taskRewards(state);toast(checked?(after.xp>before.xp?`Готово! +${after.xp-before.xp} XP и +${after.dust-before.dust} ✦. Кайро получил питание.`:'Выполнение сохранено. Кайро получил питание.'):'Задача снова в работе. Награда скорректирована.');
    }
    if(el.name==='repeat'){const field=modal.querySelector('#custom-days');if(field)field.hidden=el.value!=='custom';}
    if(el.name==='slot'){const field=modal.querySelector('#manual-slot');if(field)field.hidden=el.value!=='manual';}
    if(el.id==='import-file'&&el.files[0]){if(el.files[0].size>10*1024*1024)throw Error('Резервная копия должна быть меньше 10 МБ.');pendingBackup(await el.files[0].text());el.value='';}
  }catch(error){toast(error.message);requestRender();}
});
modal.addEventListener('click',event=>{if(event.target===modal){const bounds=modal.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)closeModal();}});
window.addEventListener('hashchange',()=>{parseRoute();render();window.scrollTo({top:0,behavior:state.settings.motion?'smooth':'auto'});});
window.addEventListener('online',()=>toast('Соединение восстановлено.'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden){commit(s=>D.materialize(s));}});
setInterval(updateTimer,1000);
setInterval(()=>{if(!modal.open)requestRender();},60000);
subscribe(requestRender);
parseRoute();try{ctx.news=JSON.parse(sessionStorage.getItem('vesper:news')||'[]');}catch{}
render();
if(loadWarning)toast(loadWarning);
initialize().then(config=>{ctx.capabilities=config;requestRender();}).catch(()=>toast('Онлайн-сервисы недоступны. Локальные записи сохранены.'));
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
function startStars(){
  const canvas=document.querySelector('#starfield'),context=canvas.getContext('2d');if(!context)return;
  let width=0,height=0,points=[],frame=0,raf;
  function resize(){const ratio=Math.min(devicePixelRatio||1,2);width=innerWidth;height=innerHeight;canvas.width=width*ratio;canvas.height=height*ratio;context.setTransform(ratio,0,0,ratio,0,0);let seed=7727;const random=()=>((seed=(seed*16807)%2147483647)/2147483647);points=Array.from({length:Math.min(170,Math.round(width*height/8000))},()=>({x:random()*width,y:random()*height,r:.3+random()*.8,a:.1+random()*.35,phase:random()*6}));draw();}
  function draw(){context.clearRect(0,0,width,height);for(const p of points){const alpha=p.a*(.75+.25*Math.sin(frame*.006+p.phase));context.fillStyle=`rgba(195,187,225,${alpha})`;context.beginPath();context.arc(p.x,p.y,p.r,0,Math.PI*2);context.fill();}frame++;}
  function tick(){if(!document.hidden&&state.settings.motion&&!matchMedia('(prefers-reduced-motion: reduce)').matches)draw();raf=requestAnimationFrame(tick);}
  addEventListener('resize',resize);resize();tick();
}
startStars();
