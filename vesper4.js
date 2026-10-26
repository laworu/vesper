
'use strict';
// VESPER 4 upgrade: extends the existing VESPER 3 data model without resetting localStorage.
const V4_AREAS=[
 ['Учеба','Учебный центр','Темы, тесты и повторение','◈'],
 ['Привычки','Трекер привычек','Отметки и серии','◉'],
 ['Личные проекты','Проектная доска','Этапы и сроки','✧'],
 ['Чтение','Библиотека','Книги, страницы и заметки','▤'],
 ['Спорт','Дневник активности','Тренировки и регулярность','◌'],
 ['Работа','Рабочий план','Проекты и дедлайны','▦'],
 ['Творчество','Творческая студия','Идеи и результаты','✳'],
 ['Личное','Личные цели','Любые свои направления','♡']
];
const V4_PACES={
 calm:{title:'Спокойный',daily:2,focus:20,desc:'Небольшие ориентиры и минимум подсказок.'},
 balanced:{title:'Сбалансированный',daily:4,focus:35,desc:'Равномерная нагрузка и умеренные подсказки.'},
 intense:{title:'Интенсивный',daily:6,focus:50,desc:'Больше этапов и подробная аналитика.'}
};
function v4Pace(){return V4_PACES[db.profile?.pace]||V4_PACES.balanced}
function v4Check(x){return x?'checked':''}
function v4Goals(){return Array.isArray(db.profile?.goals)?db.profile.goals:[]}
function v4Settings(){
 const pace=v4Pace();
 return `${sectionHead('ПЕРСОНАЛИЗАЦИЯ','Настройки вселенной','Настройки влияют на главную, рекомендации и визуализацию космоса.')}
 <form id="v4SettingsForm">
 <div class="panel"><h3>01 / Направления</h3><p class="muted">Выбери несколько. Остальные инструменты всегда доступны.</p><div class="v4-areas">
 ${V4_AREAS.map(([id,name,desc,icon])=>`<label class="v4-option"><input type="checkbox" name="goal" value="${esc(id)}" ${v4Check(v4Goals().includes(id))}><span class="v4-icon">${icon}</span><b>${name}</b><small>${desc}</small></label>`).join('')}</div></div>
 <div class="panel"><h3>02 / Темп</h3><p class="muted">Рекомендации, а не ограничения или штрафы.</p><div class="v4-pace">${Object.entries(V4_PACES).map(([id,x])=>`<label class="v4-option"><input type="radio" name="pace" value="${id}" ${v4Check((db.profile.pace||'balanced')===id)}><b>${x.title}</b><small>${x.desc}</small><span class="tag">Ориентир: ${x.daily} дела / день · фокус ${x.focus} мин</span></label>`).join('')}</div></div>
 <div class="panel"><h3>03 / Галактика</h3><p class="muted">Выбор меняет фон и визуализацию целей на космической карте.</p><div class="v4-pace">${[['nebula','Туманность'],['system','Звездная система'],['void','Черная дыра']].map(([id,label])=>`<label class="v4-option v4-${id}"><input type="radio" name="theme" value="${id}" ${v4Check(db.theme===id)}><b>${label}</b></label>`).join('')}</div><label class="v4-check"><input type="checkbox" name="motion" ${v4Check(db.v4Motion!==false)}> Космические анимации</label><label class="v4-check"><input type="checkbox" name="hints" ${v4Check(db.v4Hints!==false)}> Подсказки по планированию</label></div>
 <div class="panel"><h3>Профиль и данные</h3><div class="field"><label>Имя</label><input name="name" required maxlength="32" value="${esc(db.profile.name)}"></div><label class="v4-check"><input type="checkbox" name="cycle" ${v4Check(db.cycle.enabled)}> Показывать личный календарь цикла</label><p class="muted small">Данные остаются в этом браузере. Для переноса на другое устройство сохрани резервную копию.</p><div class="flex wrap"><button class="btn" type="submit">Сохранить настройки</button>${button('Экспортировать данные','export','btn secondary')}${button('Импортировать копию','import','btn secondary')}</div><input type="file" id="importFile" accept="application/json" class="hide"></div></form>`;
}
function v4Dashboard(){
 const pace=v4Pace(),today=iso(),todays=db.tasks.filter(t=>t.date===today),due=db.tasks.filter(t=>!t.done&&(!t.date||t.date<=today)),active=db.missions.filter(m=>!m.completed);
 const areas=v4Goals(),widgets=areas.map(a=>{
 if(a==='Учеба'){const weak=db.missions.flatMap(m=>weakTopics(m).map(w=>({m,w})));return `<div class="panel"><h3>Учебный центр</h3>${weak.length?weak.slice(0,3).map(({m,w})=>`<div class="listrow"><span>${esc(w.name)}<br><small class="muted">${esc(m.title)}</small></span><b class="v4-low">${score(w.latest)}%</b></div>`).join(''):'<p class="muted">Слабые темы появятся после тестов.</p>'}${button('Открыть цели','go:missions','btn secondary tiny')}</div>`}
 if(a==='Привычки')return `<div class="panel"><h3>Привычки</h3><p class="muted">${db.habits.filter(h=>h.days.includes(today)).length} из ${db.habits.length} отмечено сегодня</p>${db.habits.slice(0,3).map(h=>`<div class="listrow"><span>${esc(h.name)}</span>${button(h.days.includes(today)?'✓':'Отметить','habitdone:'+h.id,'btn secondary tiny')}</div>`).join('')}${button('Все привычки','go:habits','btn secondary tiny')}</div>`;
 if(a==='Чтение')return `<div class="panel"><h3>Библиотека</h3><p class="muted">Записи о книгах и ежедневном чтении.</p>${button('Дневник чтения','v4reading','btn secondary tiny')}</div>`;
 if(a==='Спорт')return `<div class="panel"><h3>Дневник активности</h3><p class="muted">Отмечай тренировки в привычках и задачах.</p>${button('Привычки','go:habits','btn secondary tiny')}</div>`;
 return `<div class="panel"><h3>${esc(a)}</h3><p class="muted">Цели, этапы и результаты.</p>${button('Мои цели','go:missions','btn secondary tiny')}</div>`;
 }).join('');
 return `${sectionHead('VESPER / ЦЕНТР УПРАВЛЕНИЯ','Твой день',`Привет, ${esc(db.profile.name)}. Твоя вселенная развивается вместе с тобой.`)}
 <div class="v4-hero v4-${esc(db.theme)}"><div class="v4-hero-content"><span class="eyebrow">YOUR OWN UNIVERSE</span><h2>Каждое действие оставляет след</h2><p>${pace.title} темп · ориентир ${pace.daily} дела в день</p>${button('Моя вселенная','go:universe','btn secondary tiny')}</div></div>
 <div class="grid four v4-stats">${[['Задачи сегодня',todays.filter(t=>t.done).length+' / '+todays.length,'planner'],['Активные цели',active.length,'missions'],['Выполнено задач',db.tasks.filter(t=>t.done).length,'archive'],['Звездная пыль',db.stars,'growth']].map(([label,value,link])=>`<div class="panel stat"><small>${label}</small><strong>${value}</strong>${button('Открыть','go:'+link,'btn secondary tiny')}</div>`).join('')}</div>
 <div class="grid two v4-columns"><div class="panel"><div class="flex between wrap"><h3>Ближайшие задачи</h3>${button('+ Задача','newtask','btn secondary tiny')}</div>${due.length?due.slice(0,pace.daily+2).map(t=>`<div class="listrow"><span>${esc(t.text)}<br><small class="muted">${esc(t.date||'Без срока')}</small></span>${button('✓','taskdone:'+t.id,'btn secondary tiny')}</div>`).join(''):'<p class="muted">Нет срочных задач.</p>'}${button('Открыть план','go:planner','btn secondary tiny')}</div><div class="panel"><h3>Твои цели</h3>${active.slice(0,5).map(m=>`<div class="listrow"><span>${esc(m.title)}<br><small class="muted">${pct(m)}% этапов</small></span>${button('Открыть','openmission:'+m.id,'btn secondary tiny')}</div>`).join('')||'<p class="muted">Добавь первую цель.</p>'}${button('+ Новая цель','newmission','btn secondary tiny')}</div></div>
 ${areas.length?`<h2 class="v4-section-title">Твои направления</h2><div class="grid two v4-columns">${widgets}</div>`:''}
 ${db.v4Hints!==false?`<div class="hint v4-hint">Режим «${pace.title}»: рекомендуемый фокус-сеанс ${pace.focus} минут. Планируй столько, сколько удобно.</div>`:''}`;
}
function v4Reading(){
 const records=db.v4Reading||[];
 return `${sectionHead('БИБЛИОТЕКА','Дневник чтения','Все записи сохраняются в истории и архиве.')}
 <div class="grid three v4-stats"><div class="panel stat"><small>Прочитано страниц</small><strong>${records.reduce((n,r)=>n+r.pages,0)}</strong></div><div class="panel stat"><small>Записей</small><strong>${records.length}</strong></div><div class="panel stat"><small>Читала сегодня</small><strong>${records.some(r=>r.date===iso())?'Да':'Нет'}</strong></div></div>
 <div class="panel v4-block"><h3>Записать чтение</h3><form id="v4ReadingForm"><div class="field"><label>Книга или материал</label><input name="book" required maxlength="150" placeholder="Название книги"></div><div class="grid two"><div class="field"><label>Дата</label><input type="date" name="date" required value="${iso()}"></div><div class="field"><label>Страниц</label><input type="number" name="pages" min="1" max="10000" required></div></div><div class="field"><label>Главы или заметка</label><textarea name="note" maxlength="1000"></textarea></div><button class="btn" type="submit">Сохранить</button></form></div>
 <div class="panel v4-block"><h3>История чтения</h3>${records.length?records.slice().reverse().map(r=>`<div class="listrow"><span><b>${esc(r.book)}</b><br><small class="muted">${esc(r.date)} · ${esc(r.note||'Без заметки')}</small></span><b>+${r.pages} стр.</b></div>`).join(''):'<p class="muted">Пока нет записей.</p>'}</div>`;
}
function v4Archive(){
 const records=[
 ...db.tasks.filter(t=>t.done).map(t=>({title:t.text,meta:'Задача · '+(t.date||'Дата не указана')})),
 ...db.missions.flatMap(m=>[
 ...m.steps.filter(s=>s.done).map(s=>({title:s.text,meta:'Этап · '+m.title})),
 ...m.tests.map(t=>({title:t.topic,meta:'Тест · '+m.title+' · '+score(t)+'% · '+t.date}))
 ]),
 ...db.missions.filter(m=>m.completed).map(m=>({title:m.title,meta:'Завершенная цель · '+(m.completedAt||'')})),
 ...(db.v4Reading||[]).map(r=>({title:r.book,meta:'Чтение · '+r.pages+' стр. · '+r.date}))
 ];
 return `${sectionHead('АРХИВ СВЕРХНОВЫХ','История достижений','Завершенные задачи, этапы, тесты, чтение и цели за всё время.')}
 <div class="panel"><div class="flex between wrap"><h3>${records.length} записей</h3>${button('Дневник чтения','v4reading','btn secondary tiny')}</div>${records.length?records.map(r=>`<div class="listrow"><span><b>${esc(r.title)}</b><br><small class="muted">${esc(r.meta)}</small></span><span class="tag">✷</span></div>`).join(''):'<p class="muted">Выполненные действия появятся здесь.</p>'}</div>`;
}
function v4Growth(){
 const records=db.v4Reading||[],tests=db.missions.flatMap(m=>m.tests),tasks=db.tasks.filter(t=>t.done),steps=db.missions.flatMap(m=>m.steps.filter(s=>s.done)),habits=db.habits.reduce((n,h)=>n+h.days.length,0);
 const stats=[
 ['Логика',tests.length*2+steps.length,'◈'],
 ['Эрудиция',records.length*2+tests.length,'▤'],
 ['Дисциплина',tasks.length+habits,'◎'],
 ['Активность',db.habits.filter(h=>/спорт|трен|йога|бег|ходьба/i.test(h.name)).reduce((n,h)=>n+h.days.length*2,0),'◉'],
 ['Творчество',db.missions.filter(m=>/твор|дизайн|рисован|музык/i.test(m.category)).filter(m=>m.completed).length*3,'✳'],
 ['Концентрация',tests.length+steps.length,'✧']
 ];
 const xp=db.stars+records.length*5+tests.length*10,level=Math.floor(xp/100)+1;
 return `${sectionHead('ПАРАМЕТРЫ РАЗВИТИЯ','Твое развитие','Игровые очки отражают записанную активность, а не реальные способности.')}
 <div class="grid two v4-columns"><div class="panel"><h3>Уровень ${level} · Исследователь</h3><p class="muted">${xp} XP</p><div class="progress"><span style="width:${xp%100}%"></span></div><p class="small muted">До следующего уровня ${100-xp%100} XP</p></div><div class="panel"><h3>Начисления</h3><p class="muted">Тесты, выполненные этапы, привычки, задачи и чтение обновляют показатели автоматически. Повторный просмотр не начисляет очки.</p></div></div>
 <div class="panel v4-block"><h3>Характеристики</h3>${stats.map(([name,value,icon])=>`<div class="v4-skill"><div class="flex between"><span>${icon} ${name}</span><b>${value}</b></div><div class="progress"><span style="width:${Math.min(100,value)}%"></span></div></div>`).join('')}</div>`;
}
const v4OldNavItems=navItems;
navItems=function(){return v4OldNavItems().map(([id,icon,label])=>[id,icon,({missions:'Цели',planner:'Задачи',growth:'Развитие',profile:'Настройки'})[id]||label]).flatMap(x=>x[0]==='habits'?[x,['reading','▤','Чтение']]:[x])};
const v4OldRender=render;
render=function(){
 if(!db.profile){v4OldRender();return}
 if(page==='reading'){
   stopSpace();$('#app').classList.remove('hide');$('#today').textContent=new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long'});renderNav();$('#crumb').textContent='Чтение';$('#view').innerHTML='<div class="fadein">'+v4Reading()+'</div>';return;
 }
 v4OldRender();
 if(page==='dashboard')$('#view').innerHTML='<div class="fadein">'+v4Dashboard()+'</div>';
 if(page==='profile')$('#view').innerHTML='<div class="fadein">'+v4Settings()+'</div>';
 if(page==='archive')$('#view').innerHTML='<div class="fadein">'+v4Archive()+'</div>';
 if(page==='growth')$('#view').innerHTML='<div class="fadein">'+v4Growth()+'</div>';
 document.body.dataset.galaxy=db.theme;
};
const v4OldMissions=missions;
missions=function(){return v4OldMissions().replaceAll('МИССИИ','ЦЕЛИ').replaceAll('Миссии','Цели').replaceAll('миссии','цели').replaceAll('миссий','целей')};
const v4OldStartSpace=startSpace;
startSpace=function(){
 v4OldStartSpace();
 if(db.v4Motion===false)stopSpace();
};
const v4OldAction=action;
action=function(a){if(a==='v4reading'){navigate('reading');return}return v4OldAction(a)};
document.addEventListener('submit',function(e){
 if(e.target.id==='v4SettingsForm'){
  e.preventDefault();const f=new FormData(e.target);
  db.profile.goals=f.getAll('goal');db.profile.pace=f.get('pace')||'balanced';
  db.profile.name=String(f.get('name')||'').trim()||db.profile.name;
  db.theme=f.get('theme')||'nebula';db.v4Motion=!!f.get('motion');db.v4Hints=!!f.get('hints');db.cycle.enabled=!!f.get('cycle');
  save();render();toast('Настройки применены');
 }
 if(e.target.id==='v4ReadingForm'){
  e.preventDefault();const f=new FormData(e.target),pages=Number(f.get('pages'));
  const book=String(f.get('book')||'').trim(),date=String(f.get('date')||'');
  if(!book||!Number.isInteger(pages)||pages<1||pages>10000||! /^\d{4}-\d{2}-\d{2}$/.test(date))return;
  db.v4Reading=db.v4Reading||[];
  db.v4Reading.push({id:uid(),book,pages,date,note:String(f.get('note')||'')});
  db.stars+=2;save();render();toast('Чтение сохранено в архиве');
 }
});
if(db.profile){page='dashboard';render()}
