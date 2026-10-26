
'use strict';
/* VESPER 5.0 UI update. Existing vesper3 data remains untouched. */
const v5Nav=[['universe','✦','Вселенная'],['goals','◎','Цели и задачи'],['areas','◈','Направления'],['development','✧','Развитие'],['profile','⚙','Настройки']];
const v5PreviousRender=render, v5PreviousAction=action, v5PreviousStartSpace=startSpace;
navItems=()=>v5Nav;
function v5Home(){
const active=db.missions.filter(m=>!m.completed),due=db.tasks.filter(t=>!t.done&&(!t.date||t.date<=iso()));
return `${sectionHead('VESPER / 5.0','Твоя вселенная','Каждая цель — отдельный объект на космической карте.')}
<div class="v5-actions">${button('+ Новая цель','newmission')}${button('+ Задача','newtask','btn secondary')}${button('Планирование','go:goals','btn secondary')}</div>
<div class="v5-stats"><div class="panel stat"><small>Задач сегодня</small><strong>${db.tasks.filter(t=>t.date===iso()).length}</strong></div><div class="panel stat"><small>Активных целей</small><strong>${active.length}</strong></div><div class="panel stat"><small>Звёздная пыль</small><strong>${db.stars} ✦</strong></div></div>
<div class="spacewrap theme-${esc(db.theme)} v5-space" id="space"><canvas id="spaceCanvas"></canvas><div class="space-overlay" id="spaceLabels"></div><div class="space-top"><span class="eyebrow">КАРТА ЦЕЛЕЙ</span>${button('Сменить вид','theme','btn secondary tiny')}</div><div class="space-help">Нажми на объект, чтобы открыть цель</div></div>
<div class="grid two v5-below"><div class="panel"><div class="flex between"><h3>На сегодня</h3>${button('+ Задача','newtask','btn secondary tiny')}</div>${due.slice(0,6).map(t=>`<div class="listrow"><span>${esc(t.text)}<br><small class="muted">${esc(t.date||'Без срока')}</small></span>${button('✓','taskdone:'+t.id,'btn secondary tiny')}</div>`).join('')||'<p class="muted">Срочных задач нет.</p>'}</div><div class="panel"><div class="flex between"><h3>Твои цели</h3>${button('+ Цель','newmission','btn secondary tiny')}</div>${active.slice(0,6).map(m=>`<div class="listrow"><span>${esc(m.title)}<br><small class="muted">${pct(m)}% · ${esc(m.category)}</small></span>${button('Открыть','openmission:'+m.id,'btn secondary tiny')}</div>`).join('')||'<p class="muted">Создай первую цель.</p>'}</div></div>`;
}
function v5Goals(){return `${sectionHead('ПЛАНИРОВАНИЕ','Цели и задачи','Цели с этапами и отдельные повседневные задачи.')}<div class="v5-actions">${button('+ Цель','newmission')}${button('+ Задача','newtask','btn secondary')}</div><div class="panel"><h3>Цели</h3>${db.missions.filter(m=>!m.completed).map(m=>`<div class="listrow"><div><b>${esc(m.title)}</b><br><small class="muted">${esc(m.category)} · ${pct(m)}% · ${m.steps.length} этапов</small></div>${button('Открыть','openmission:'+m.id,'btn secondary tiny')}</div>`).join('')||'<p class="muted">Целей пока нет.</p>'}</div><div class="panel v5-below"><h3>Самостоятельные задачи</h3>${db.tasks.map(t=>`<div class="listrow"><label class="flex"><input class="check" type="checkbox" data-task="${esc(t.id)}" ${t.done?'checked':''}><span style="${t.done?'text-decoration:line-through;opacity:.6':''}">${esc(t.text)}</span></label><small class="muted">${esc(t.date||'Без срока')}</small></div>`).join('')||'<p class="muted">Задач пока нет.</p>'}</div>`}
function v5Areas(){const areas=db.profile.goals||[];return `${sectionHead('ИНСТРУМЕНТЫ','Направления','Используй только нужные тебе разделы.')}<div class="v5-area-grid">${areas.map(a=>`<div class="panel"><h3>${esc(a)}</h3><p class="muted">Цели, действия и результаты</p>${button('Цели направления','go:goals','btn secondary tiny')}</div>`).join('')}</div><div class="panel v5-below"><h3>Инструменты</h3><div class="v5-actions">${button('Привычки','go:habits','btn secondary')}${button('Дневник чтения','v4reading','btn secondary')}${db.cycle.enabled?button('Приватный дневник цикла','go:cycle','btn secondary'):''}${button('Настроить','go:profile','btn secondary')}</div></div>`}
function v5Development(){const finished=db.missions.filter(m=>m.completed);return `${sectionHead('ТВОЙ ПРОГРЕСС','Развитие','История роста и архив достигнутых целей.')}<div class="panel"><h3>Игровой прогресс</h3><p class="muted">Текущие очки VESPER 4.0 сохранены. Расширенная RPG-экономика появится отдельным обновлением.</p><strong>${db.stars} ✦</strong></div><div class="panel v5-below"><h3>Архив сверхновых · ${finished.length}</h3><p class="muted small">Здесь отображаются только завершённые цели.</p>${finished.map(m=>`<div class="listrow"><span>✷ <b>${esc(m.title)}</b><br><small class="muted">${esc(m.completedAt||'Дата не указана')}</small></span>${button('Открыть','openmission:'+m.id,'btn secondary tiny')}</div>`).join('')||'<p class="muted">Завершённых целей пока нет.</p>'}</div>`}
render=function(){
 if(!db.profile){v5PreviousRender();return}
 if(page==='dashboard')page='universe';
 if(page==='planner'||page==='missions')page='goals';
 if(page==='growth'||page==='archive')page='development';
 if(['universe','goals','areas','development'].includes(page)){
 stopSpace();$('#app').classList.remove('hide');$('#today').textContent=new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long'});renderNav();$('#crumb').textContent=v5Nav.find(x=>x[0]===page)[2];
 $('#view').innerHTML='<div class="fadein">'+({universe:v5Home,goals:v5Goals,areas:v5Areas,development:v5Development}[page]())+'</div>';
 document.body.dataset.galaxy=db.theme;if(page==='universe')v5StartSpace();return;
 }
 v5PreviousRender();
};
function v5StartSpace(){
 v5PreviousStartSpace();
 const overlay=$('#spaceLabels');if(!overlay)return;
 const goals=db.missions.filter(m=>!m.completed).slice(0,16);
 function place(){overlay.innerHTML=goals.map((m,i)=>{const a=i*2.39996+.3,r=Math.sqrt((i+1)/(goals.length+1));return `<button class="v5-planet" data-act="openmission:${esc(m.id)}" style="left:${50+Math.cos(a)*r*42}%;top:${52+Math.sin(a)*r*33}%;--h:${(235+i*37)%360}"><span class="v5-orb"></span><span class="v5-planet-name">${esc(m.title)}</span><small>${pct(m)}%</small></button>`}).join('');overlay.dataset.signature='v5'}
 place();
 // Original canvas updater checks signature; restore goal markers if it changes.
 const obs=new MutationObserver(()=>{if(!overlay.isConnected){obs.disconnect();return}if(overlay.querySelector('.space-label'))place()});
 obs.observe(overlay,{childList:true});
}
action=function(a){
 if(a==='go:missions'||a==='go:planner'){navigate('goals');return}
 if(a==='go:growth'||a==='go:archive'){navigate('development');return}
 return v5PreviousAction(a);
};
if(db.profile){page='universe';render();}
