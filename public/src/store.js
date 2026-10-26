import { emptyState, migrateLegacy, validBackup, materialize } from './domain.js';
import { COLLECTIONS, SyncLedger, canonical, stateRecords } from './sync.js';
import * as cloud from './cloud.js';
let key='vesper7:device',currentUser=null,listeners=[],status='local',flushHandle,generation=0,remoteReady=true;
let ledger=new SyncLedger(),flushPromise=Promise.resolve(),reminderHashes=new Map();
export let loadWarning='';
export let state=load(key).state;
function load(storageKey){
  const raw=localStorage.getItem(storageKey);
  if(raw){
    try{
      const {_sync,...data}=JSON.parse(raw);
      return {state:validBackup(data),sync:_sync};
    }catch{
      localStorage.setItem(storageKey+':recovery:'+Date.now(),raw);
      loadWarning='Не удалось прочитать записи. Исходный файл сохранён отдельно для восстановления.';
      return {state:emptyState(),sync:null};
    }
  }
  if(storageKey==='vesper7:device'){
    const legacy=localStorage.getItem('vesper3');
    if(legacy){try{
      localStorage.setItem('vesper3:backup-before-v7',legacy);
      const migrated=migrateLegacy(JSON.parse(legacy));
      localStorage.setItem(storageKey,JSON.stringify(migrated));
      return {state:migrated,sync:null};
    }catch{}}
  }
  return {state:emptyState(),sync:null};
}
export const getUser=()=>currentUser;
export const syncStatus=()=>status;
export const ready=()=>remoteReady;
export const subscribe=fn=>{listeners.push(fn);return()=>{listeners=listeners.filter(x=>x!==fn)};};
const emit=()=>listeners.forEach(fn=>fn());
export function records(source=state){return stateRecords(source);}
function persist(){
  try{localStorage.setItem(key,JSON.stringify({...state,_sync:ledger.snapshot()}));}
  catch{throw Error('Не хватает места для сохранения. Экспортируй данные и освободи хранилище браузера.');}
}
function reminderRows(){
  const now=Date.now(),rows=[];
  for(const o of Object.values(state.occurrences)){
    const task=state.tasks[o.taskId];if(!task)continue;
    let sendAt=o.status==='pending'&&!o.deleted&&!task.deleted?o.scheduledAt-Number(task.remindMinutes??10)*60000:null;
    if(sendAt&&sendAt<now-15*60000)sendAt=null;
    if(sendAt){
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:state.settings.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(sendAt).map(p=>[p.type,p.value]));
      const clock=parts.hour+':'+parts.minute,start=state.settings.quietStart,end=state.settings.quietEnd;
      const quiet=start>end?(clock>=start||clock<end):(clock>=start&&clock<end);
      if(start!==end&&quiet)sendAt=null;
    }
    rows.push({id:o.id,sendAt,scheduledAt:o.scheduledAt,status:sendAt?'pending':o.status});
  }
  return rows;
}
function scheduleFlush(){
  clearTimeout(flushHandle);
  if(!currentUser||currentUser.unverified||!ledger.serverReady||!ledger.pending.size)return;
  const token=generation;
  flushHandle=setTimeout(()=>{flushPromise=flushPromise.then(()=>flush(token)).catch(()=>{});},250);
}
async function flush(token){
  if(token!==generation||!currentUser||currentUser.unverified||!ledger.serverReady)return;
  const uid=currentUser.uid,batch=ledger.selectBatch();
  if(!batch.length)return;
  try{
    status='saving';emit();
    await cloud.writeRecords(batch.map(entry=>entry.record),uid);
    if(token!==generation||currentUser?.uid!==uid)return;
    const refresh=ledger.acknowledge(batch);persist();
    if(refresh.length){
      const latest=await cloud.readRecords(refresh,uid);
      if(token!==generation||currentUser?.uid!==uid)return;
      ledger.acceptRefresh(state,latest);persist();emit();
    }
    if(cloud.capabilities().push){
      const rows=reminderRows().filter(row=>reminderHashes.get(row.id)!==canonical(row));
      if(rows.length)await cloud.syncReminders(rows,uid);
      if(token!==generation||currentUser?.uid!==uid)return;
      for(const row of rows)reminderHashes.set(row.id,canonical(row));
    }
    status=ledger.pending.size?'saving':'synced';emit();scheduleFlush();
  }catch{
    if(token===generation){status='error';persist();emit();}
  }
}
function stampChanged(previous){
  const before=new Map(records(previous).map(r=>[r.kind+':'+r.id,canonical(r.body)])),now=Date.now();
  for(const record of records())if(before.get(record.kind+':'+record.id)!==canonical(record.body)){
    if(COLLECTIONS.includes(record.kind))state[record.kind][record.id].updatedAt=now;
    else if(record.kind==='profile'&&state.profile)state.profile.updatedAt=now;
    else if(record.kind==='settings')state.settings.updatedAt=now;
    else if(record.kind==='timer'){if(state.timer)state.timer.updatedAt=now;state.timerUpdatedAt=now;}
    else if(record.kind==='meta')state.metaUpdatedAt=now;
  }
  // Creating a profile is the explicit action that initializes its common settings.
  if(!previous.profile&&state.profile){state.settings.updatedAt=now;state.metaUpdatedAt=now;}
  return records().filter(r=>before.get(r.kind+':'+r.id)!==canonical(r.body));
}
export function commit(fn){
  const previous=structuredClone(state),outbox=ledger.snapshot(),serverReady=ledger.serverReady;
  try{fn(state);materialize(state);ledger.stage(stampChanged(previous));persist();}
  catch(error){state=previous;ledger=new SyncLedger(currentUser?.unverified?null:currentUser?.uid||null,outbox);ledger.serverReady=serverReady;throw error;}
  emit();scheduleFlush();
}
export function replaceState(input){
  const {_sync,...data}=input,previous=state,outbox=ledger.snapshot(),serverReady=ledger.serverReady;
  state=validBackup(data);
  for(const kind of COLLECTIONS)for(const item of Object.values(previous[kind]))if(!state[kind][item.id])state[kind][item.id]={...item,deleted:true,updatedAt:Date.now()};
  state.settings.updatedAt=Date.now();if(state.profile)state.profile.updatedAt=Date.now();state.metaUpdatedAt=Date.now();state.timer=null;state.timerUpdatedAt=Date.now();
  for(const kind of COLLECTIONS)for(const item of Object.values(state[kind]))item.updatedAt=Date.now();
  try{ledger.stage(records());persist();}
  catch(error){state=previous;ledger=new SyncLedger(currentUser?.unverified?null:currentUser?.uid||null,outbox);ledger.serverReady=serverReady;throw error;}
  emit();scheduleFlush();
}
export function localBackup(){
  const raw=localStorage.getItem('vesper7:device');
  if(!raw)return null;
  try{return JSON.parse(raw)?.profile?raw:null;}catch{return null;}
}
export async function initialize(){
  materialize(state);persist();
  if(typeof window!=='undefined')window.addEventListener('online',()=>{if(currentUser)cloud.refreshSession().catch(()=>{});scheduleFlush();});
  return cloud.configure({
    onUser(account){
      currentUser=account;generation++;clearTimeout(flushHandle);flushPromise=Promise.resolve();reminderHashes=new Map();
      key=account&&!account.unverified?'vesper7:'+account.uid:'vesper7:device';
      const loaded=load(key);state=loaded.state;ledger=new SyncLedger(account&&!account.unverified?account.uid:null,loaded.sync);
      remoteReady=!account||account.unverified||Boolean(state.profile);emit();
    },
    onRecords(incoming,metadata){
      if(!currentUser||currentUser.unverified||metadata.uid!==currentUser.uid)return;
      const result=ledger.receive(state,incoming,metadata);
      if(!result.accepted)return;
      state=result.state;remoteReady=true;
      const created=materialize(state);
      ledger.stage(created.map(body=>({kind:'occurrences',id:body.id,body,updatedAt:body.updatedAt})));
      try{persist();}catch{status='error';}
      emit();scheduleFlush();
    },
    onStatus(next){
      status=next==='synced'&&ledger.pending.size?'saving':next;
      emit();
    }
  });
}
