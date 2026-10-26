'use strict';
/* Cosmic Portal: navigation is a full-screen map, home is the functional dashboard. */
const v6RenderPrevious=render, v6ActionPrevious=action;
const V6_NAV=[['map','✦','Космическая карта'],['home','◈','Главная'],['goals','◎','Цели и задачи'],['areas','◇','Направления'],['development','✧','Развитие'],['account','◉','Личный кабинет'],['settings','⚙','Настройки']];
navItems=()=>V6_NAV;
const v6Text=(s)=>esc(String(s??''));
function v6Dashboard(){
 const all=db.tasks||[], today=iso(),active=v5Active(),pending=all.filter(t=>!t.done),todayList=pending.filter(t=>!t.date||t.date<=today),linked=pending.filter(t=>t.v5Goal);
 const doneToday=all.filter(t=>t.done&&t.date===today).length;
 return `${sectionHead('VESPER / КОМАНДНЫЙ ЦЕНТР','Твой день','Всё необходимое для движения к целям — в одном пространстве.')}
 <div class="v6-welcome"><div><span class="eyebrow">ЛИЧНАЯ ВСЕЛЕННАЯ</span><h2>${v6Text(db.profile?.name||'Исследователь')}, твой маршрут начинается здесь.</h2><p>Отмечай сделанное, следи за прогрессом и управляй своими системами.</p><div class="v6-actions">${button('+ Задача','v5:newtask')}${button('+ Цель','v5:newgoal','btn secondary')}${button('Открыть карту','go:map','btn secondary')}</div></div><div class="v6-welcome-orb" aria-hidden="true"></div></div>
 <div class="v6-stats"><div class="panel stat"><small>Выполнено сегодня</small><strong>${doneToday}</strong></div><div class="panel stat"><small>Активные цели</small><strong>${active.length}</strong></div><div class="panel stat"><small>Текущие задачи</small><strong>${pending.length}</strong></div><div class="panel stat"><small>Уровень</small><strong>${v5Level()}</strong></div></div>
 <div class="grid two v6-content"><div class="panel"><div class="flex between wrap"><h3>Ближайшие задачи</h3>${button('+ Добавить','v5:newtask','btn secondary tiny')}</div>${todayList.slice(0,7).map(t=>`<div class="listrow"><label class="flex"><input type="checkbox" class="check" data-task="${v6Text(t.id)}"><span>${v6Text(t.text)}</span></label><small class="muted">${v6Text(t.date||'Без срока')}</small></div>`).join('')||'<p class="muted">Срочных задач нет. Можно заняться долгосрочными целями.</p>'}${button('Все задачи','go:goals','btn secondary tiny')}</div>
 <div class="panel"><div class="flex between wrap"><h3>Активные цели</h3>${button('+ Создать','v5:newgoal','btn secondary tiny')}</div>${active.slice(0,6).map(m=>`<div class="v6-goal-line"><div class="flex between"><b>${v6Text(m.title)}</b><span class="muted small">${pct(m)}%</span></div><div class="progress"><span style="width:${pct(m)}%"></span></div>${button('Открыть','openmission:'+m.id,'btn secondary tiny')}</div>`).join('')||'<p class="muted">Создай первую цель — она появится на космической карте.</p>'}</div></div>
 <div class="panel v6-content"><div class="flex between wrap"><h3>Быстрый доступ</h3><span class="muted small">Твои инструменты</span></div><div class="v6-quick">${[['go:areas','◇','Направления'],['v5:habits','◉','Привычки'],['v4reading','▤','Чтение'],['v5:cycle','♡','Дневник цикла'],['go:development','✧','Развитие'],['go:account','◈','Личный кабинет']].map(([a,i,n])=>`<button data-act="${a}"><span>${i}</span>${n}</button>`).join('')}</div></div>`;
}
function v6Account(){const xp=v5Xp(),level=v5Level(),crystals=v5Crystals(),target=60*(2*level-1),progress=xp-60*(level-1)*(level-1),pctLevel=Math.max(0,Math.min(100,Math.round(progress/target*100)));const entries=v5Meta().events||[];
 return `${sectionHead('ЛИЧНЫЙ КАБИНЕТ','Профиль исследователя','Твои достижения, уровень и внутренняя валюта VESPER.')}
 <div class="v6-account-hero"><div class="v6-avatar" aria-hidden="true">✦</div><div><span class="eyebrow">VESPER IDENTITY</span><h2>${v6Text(db.profile?.name||'Исследователь')}</h2><p class="muted">Исследователь собственной вселенной</p></div>${button('Настройки профиля','go:settings','btn secondary tiny')}</div>
 <div class="v6-stats v6-account-stats"><div class="panel stat"><small>Уровень</small><strong>${level}</strong><span class="muted small">Без ограничений функций</span></div><div class="panel stat"><small>Опыт (XP)</small><strong>${xp}</strong><span class="muted small">Накоплено за действия</span></div><div class="panel stat"><small>Кристаллы ✧</small><strong>${crystals}</strong><span class="muted small">Баланс внутренней валюты</span></div><div class="panel stat"><small>Звёздная пыль ✦</small><strong>${db.stars||0}</strong><span class="muted small">Баланс старой системы</span></div></div>
 <div class="panel v6-content"><div class="flex between"><h3>До следующего уровня</h3><b>${progress} / ${target} XP</b></div><div class="progress"><span style="width:${pctLevel}%"></span></div><p class="muted small">Уровни открывают косметические награды, но не ограничивают инструменты VESPER.</p></div>
 <div class="grid two v6-content"><div class="panel"><h3>Статистика</h3>${[['Завершённые цели',v5Completed().length],['Активные цели',v5Active().length],['Выполненные задачи',db.tasks.filter(t=>t.done).length],['События опыта',entries.length]].map(([k,v])=>`<div class="listrow"><span>${k}</span><b>${v}</b></div>`).join('')}</div><div class="panel"><h3>Последние достижения</h3>${entries.slice(-6).reverse().map(e=>`<div class="listrow"><span>${v6Text(({goal:'Цель',task:'Задача',step:'Этап',habit:'Привычка',reading:'Чтение',test:'Тест'})[e.kind]||'Действие')}<br><small class="muted">${v6Text(e.date||'')}</small></span><b>+${Number(e.xp)||0} XP</b></div>`).join('')||'<p class="muted">Достижения появятся после выполнения задач.</p>'}</div></div>`;
}
function v6Map(){return `<div class="v6-map-wrap theme-${v6Text(db.theme)}"><canvas id="spaceCanvas" aria-label="Анимированная космическая карта"></canvas><div class="space-overlay" id="spaceLabels"></div><div class="v6-map-nodes" id="v6MapNodes"></div><header class="v6-map-header"><div class="v6-map-brand"><span class="v6-brand-star">✦</span><div><b>VESPER</b><small>YOUR OWN UNIVERSE</small></div></div><div class="v6-map-tools">${button('◐ Атмосфера','theme','btn secondary tiny')}${button('Главная','go:home','btn secondary tiny')}</div></header><div class="v6-map-footer"><span>Нажми на центр системы или космический объект</span><span>Перемещение по вселенной</span></div></div>`}
function v6StartMap(){v5StartSpace();const host=$('#v6MapNodes');if(!host)return;
 const nodes=[['home','Центр системы','Главная','50%','50%','core'],['account','Личный кабинет','Уровень и кристаллы','76%','27%','account'],['settings','Настройки','Твоя атмосфера','19%','25%','settings'],['goals','Цели и задачи','Планирование','22%','72%','goals'],['areas','Направления','Привычки и учёба','79%','72%','areas'],['development','Развитие','Достижения','50%','86%','development']];
 host.innerHTML=nodes.map(([id,title,subtitle,x,y,kind])=>`<button class="v6-map-node v6-node-${kind}" style="left:${x};top:${y}" data-act="v6:portal:${id}" aria-label="Открыть: ${title}"><span class="v6-node-body" aria-hidden="true"></span><span class="v6-node-label">${title}</span><small>${subtitle}</small></button>`).join('');
 // Goal objects remain independently clickable in the inherited spaceLabels layer.
 const overlay=$('#spaceLabels');if(overlay){overlay.querySelectorAll('.v5-planet').forEach(x=>x.classList.add('v6-goal-planet'));}
}
render=function(){if(!db.profile){document.body.classList.remove('v6-map-mode');v6RenderPrevious();return}
 const aliases={dashboard:'home',universe:'map',planner:'goals',missions:'goals',growth:'development',archive:'development',profile:'settings'};page=aliases[page]||page;
 document.body.classList.toggle('v6-map-mode',page==='map');
 if(page==='map'||page==='home'||page==='account'){
 stopSpace();$('#app').classList.remove('hide');$('#today').textContent=new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long'});renderNav();$('#crumb').textContent=({map:'Космическая карта',home:'Главная',account:'Личный кабинет'})[page];
 $('#view').innerHTML=page==='map'?v6Map():`<div class="fadein v6-page">${page==='home'?v6Dashboard():v6Account()}</div>`;
 document.body.dataset.galaxy=db.theme;if(page==='map')v6StartMap();return;
 }
 if(page==='settings'){
 // V4 settings view is still the authoritative editable settings form.
 page='profile';v6RenderPrevious();page='settings';renderNav();$('#crumb').textContent='Настройки';return;
 }
 v6RenderPrevious();
};
action=function(a){if(a.startsWith('v6:portal:')){const target=a.slice(10);document.body.classList.add('v6-warping');setTimeout(()=>{document.body.classList.remove('v6-warping');navigate(target)},300);return}
 if(a==='go:map'||a==='go:home'||a==='go:account'||a==='go:settings'){navigate(a.slice(3));return}
 return v6ActionPrevious(a)};
// Return to map from the brand, and make settings button point to the new settings route.
const brand=document.querySelector('.brand');if(brand){brand.style.cursor='pointer';brand.setAttribute('title','Космическая карта');brand.addEventListener('click',()=>navigate('map'))}
const settingsButton=$('#settingsBtn');if(settingsButton)settingsButton.onclick=()=>navigate('settings');
if(db.profile){page='map';render()}
