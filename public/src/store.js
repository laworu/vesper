import { emptyState, migrateLegacy, validBackup, materialize } from './domain.js';
import * as cloud from './cloud.js';
const collections=['goals','tasks','occurrences','sessions','attempts','cycleEntries','periods','blocks','messages'];
let key='vesper7:device', currentUser=null, listeners=[], status='local', savedHashes=new Map(), flushHandle, flushPromise=Promise.resolve(), remoteReady=true;
export let loadWarning='';
export let state=load(key);
function load(storageKey){
  const raw=localStorage.getItem(storageKey);
  if(raw){try{return validBackup(JSON.parse(raw));}catch{localStorage.setItem(`${storageKey}:recovery:${Date.now()}`,raw);loadWarning='Не удалось прочитать записи. Исходный файл сохранён отдельно для восстановления.';return emptyState();}}
  if(storageKey==='vesper7:device'){
    const legacy=localStorage.getItem('vesper3');
    if(legacy){try{localStorage.setItem('vesper3:backup-before-v7',legacy);const migrated=migrateLegacy(JSON.parse(legacy));localStorage.setItem(storageKey,JSON.stringify(migrated));return migrated;}catch{}}
  }
  return emptyState();
}
export const getUser=()=>currentUser;
export const syncStatus=()=>status;
export const ready=()=>remoteReady;
export const subscribe=fn=>{listeners.push(fn);return()=>{listeners=listeners.filter(x=>x!==fn)};};
const emit=()=>listeners.forEach(fn=>fn());
const hash=body=>JSON.stringify(body);
function persist(){try{localStorage.setItem(key,JSON.stringify(state));}catch{throw Error('Не хватает места для сохранения. Экспортируй данные и освободи хранилище браузера.');}}
export function records(source=state){
  const result=[
    {kind:'profile',id:'main',body:source.profile||{},updatedAt:source.profile?.updatedAt||0},
    {kind:'settings',id:'main',body:source.settings,updatedAt:source.settings.updatedAt||0},
    {kind:'meta',id:'main',body:{openingXp:source.openingXp,openingDust:source.openingDust},updatedAt:source.metaUpdatedAt||0},
    {kind:'timer',id:'active',body:source.timer||{stopped:true},updatedAt:source.timer?.updatedAt||source.timerUpdatedAt||0}
  ];
  for(const kind of collections)for(const item of Object.values(source[kind]||{}))result.push({kind,id:item.id,body:item,updatedAt:item.updatedAt||0});
  return result;
}
function reminderRows(){
  const now=Date.now(),rows=[];
  for(const o of Object.values(state.occurrences)){
    const task=state.tasks[o.taskId];if(!task)continue;
    let sendAt=o.status==='pending'&&!o.deleted&&!task.deleted?o.scheduledAt-Number(task.remindMinutes??10)*60000:null;
    if(sendAt&&sendAt<now-15*60000)sendAt=null;
    if(sendAt){
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:state.settings.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(sendAt).map(p=>[p.type,p.value]));
      const clock=`${parts.hour}:${parts.minute}`,start=state.settings.quietStart,end=state.settings.quietEnd;
      const quiet=start>end?(clock>=start||clock<end):(clock>=start&&clock<end);
      if(start!==end&&quiet)sendAt=null;
    }
    rows.push({id:o.id,sendAt,scheduledAt:o.scheduledAt,status:sendAt?'pending':o.status});
  }
  return rows;
}
function scheduleFlush(){clearTimeout(flushHandle);if(!currentUser||currentUser.unverified||!remoteReady)return;flushHandle=setTimeout(()=>{flushPromise=flushPromise.then(flush).catch(()=>{});},300);}
async function flush(){
  if(!currentUser||currentUser.unverified||!remoteReady)return;
  const changed=records().filter(r=>savedHashes.get(`${r.kind}:${r.id}`)!==hash(r.body));
  if(!changed.length)return;
  const uid=currentUser.uid;
  try{
    await cloud.writeRecords(changed);
    if(currentUser?.uid!==uid)return;
    for(const record of changed)savedHashes.set(`${record.kind}:${record.id}`,hash(record.body));
    await cloud.syncReminders(reminderRows());
  }catch{status='error';emit();}
}
export function commit(fn){
  const previous=structuredClone(state);
  try{fn(state);materialize(state);stampChanged(previous);persist();}catch(error){state=previous;throw error;}
  emit();scheduleFlush();
}
function stampChanged(previous){
  const before=new Map(records(previous).map(r=>[`${r.kind}:${r.id}`,hash(r.body)])),now=Date.now();
  for(const record of records())if(before.get(`${record.kind}:${record.id}`)!==hash(record.body)){
    if(collections.includes(record.kind))state[record.kind][record.id].updatedAt=now;
    else if(record.kind==='profile'&&state.profile)state.profile.updatedAt=now;
    else if(record.kind==='settings')state.settings.updatedAt=now;
    else if(record.kind==='timer'){if(state.timer)state.timer.updatedAt=now;state.timerUpdatedAt=now;}
    else if(record.kind==='meta')state.metaUpdatedAt=now;
  }
}
export function replaceState(next){
  const previous=state;state=validBackup(next);
  // Tombstones preserve deletions across an existing cloud profile.
  for(const kind of collections)for(const item of Object.values(previous[kind]))if(!state[kind][item.id])state[kind][item.id]={...item,deleted:true,updatedAt:Date.now()};
  state.settings.updatedAt=Date.now();if(state.profile)state.profile.updatedAt=Date.now();state.metaUpdatedAt=Date.now();state.timer=null;state.timerUpdatedAt=Date.now();
  for(const kind of collections)for(const item of Object.values(state[kind]))item.updatedAt=Date.now();
  try{persist();}catch(error){state=previous;throw error;}emit();scheduleFlush();
}
export function localBackup(){return localStorage.getItem('vesper7:device');}
export async function initialize(){
  materialize(state);persist();
  return cloud.configure({
    onUser(account){
      currentUser=account;savedHashes=new Map();clearTimeout(flushHandle);
      key=account&&!account.unverified?`vesper7:${account.uid}`:'vesper7:device';state=load(key);remoteReady=!account||account.unverified;emit();
    },
    onRecords(incoming){
      const local=new Map(records().map(r=>[`${r.kind}:${r.id}`,r]));
      for(const r of incoming){
        if(!r||!r.body||typeof r.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.@:-]{0,200}$/.test(r.id)||['__proto__','constructor','prototype'].includes(r.id)||!['profile','settings','meta','timer',...collections].includes(r.kind))continue;
        const id=`${r.kind}:${r.id}`;savedHashes.set(id,hash(r.body));
        const own=local.get(id);
        if(own&&(own.updatedAt||0)>(r.updatedAt||0))continue;
        if(collections.includes(r.kind))state[r.kind][r.id]=r.body;
        else if(r.kind==='profile')state.profile=r.body.name?r.body:null;
        else if(r.kind==='settings')state.settings={...emptyState().settings,...r.body};
        else if(r.kind==='meta'){state.openingXp=r.body.openingXp||0;state.openingDust=r.body.openingDust||0;state.metaUpdatedAt=r.updatedAt;}
        else if(r.kind==='timer'){state.timer=r.body.stopped?null:r.body;state.timerUpdatedAt=r.updatedAt;}
      }
      remoteReady=true;materialize(state);persist();emit();scheduleFlush();
    },
    onStatus(next){status=next;emit();}
  });
}
