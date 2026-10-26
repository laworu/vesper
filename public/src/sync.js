import { emptyState } from './domain.js';

export const COLLECTIONS=['goals','tasks','occurrences','sessions','attempts','cycleEntries','periods','blocks','messages'];
const KINDS=new Set(['profile','settings','meta','timer',...COLLECTIONS]);
export function canonical(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
export const recordKey=record=>`${record.kind}:${record.id}`;
export function validRecord(record){
  if(!record||!KINDS.has(record.kind)||typeof record.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.@:-]{0,200}$/.test(record.id)||['constructor','prototype','__proto__'].includes(record.id))return false;
  if(!record.body||typeof record.body!=='object'||Array.isArray(record.body))return false;
  if(COLLECTIONS.includes(record.kind)&&record.body.id!==record.id)return false;
  if(record.kind==='settings'){
    if(!Array.isArray(record.body.availability)||record.body.availability.length!==7)return false;
    try{new Intl.DateTimeFormat('ru',{timeZone:record.body.timezone});}catch{return false;}
  }
  return true;
}
export function stateRecords(source){
  const result=[
    {kind:'profile',id:'main',body:source.profile||{},updatedAt:source.profile?.updatedAt||0},
    {kind:'settings',id:'main',body:source.settings,updatedAt:source.settings.updatedAt||0},
    {kind:'meta',id:'main',body:{openingXp:source.openingXp,openingDust:source.openingDust},updatedAt:source.metaUpdatedAt||0},
    {kind:'timer',id:'active',body:source.timer||{stopped:true},updatedAt:source.timer?.updatedAt||source.timerUpdatedAt||0}
  ];
  for(const kind of COLLECTIONS)for(const item of Object.values(source[kind]||{}))result.push({kind,id:item.id,body:item,updatedAt:item.updatedAt||0});
  return result;
}
export function applyRecord(state,record){
  if(!validRecord(record))return;
  const body=structuredClone(record.body);
  if(COLLECTIONS.includes(record.kind))state[record.kind][record.id]=body;
  else if(record.kind==='profile')state.profile=body.name?body:null;
  else if(record.kind==='settings')state.settings={...emptyState().settings,...body};
  else if(record.kind==='meta'){state.openingXp=Number(body.openingXp)||0;state.openingDust=Number(body.openingDust)||0;state.metaUpdatedAt=record.updatedAt||0;}
  else if(record.kind==='timer'){state.timer=body.stopped?null:body;state.timerUpdatedAt=record.updatedAt||0;}
}

// Durable account-scoped outbox. Only a confirmed server snapshot enables uploads.
// Browser clock differences are deliberately NOT used to decide which remote record wins.
export class SyncLedger {
  constructor(uid=null,saved=null){
    this.uid=uid;this.serverReady=false;this.pending=new Map();this.baseline=new Map();this.shadows=new Map();
    if(saved?.uid===uid&&uid){
      for(const [key,value]of Object.entries(saved.pending||{}))if(value?.mutation&&validRecord(value.record)&&recordKey(value.record)===key)this.pending.set(key,value);
      for(const [key,value]of Object.entries(saved.baseline||{}))if(typeof value==='string')this.baseline.set(key,value);
    }
  }
  stage(records){
    if(!this.uid)return;
    for(const record of records)if(validRecord(record))this.pending.set(recordKey(record),{mutation:crypto.randomUUID(),record:structuredClone(record)});
  }
  selectBatch(limit=400){
    if(!this.serverReady||!this.uid)return [];
    return [...this.pending.entries()].slice(0,limit).map(([key,item])=>({key,...structuredClone(item),baseline:this.baseline.get(key)}));
  }
  receive(current,incoming,{uid,fromCache=false}={}){
    if(uid!==this.uid)return {accepted:false,state:current};
    const records=incoming.filter(validRecord);
    // The initial empty memory-cache event is not evidence that the user's cloud is empty.
    if(fromCache&&!records.length)return {accepted:false,state:current};
    if(!fromCache)this.serverReady=true;
    const next=fromCache?structuredClone(current):emptyState();
    next.legacy=current.legacy;
    for(const record of records){
      const key=recordKey(record);
      if(!fromCache&&!record.localPending){
        if(this.pending.has(key))this.shadows.set(key,structuredClone(record));
        this.baseline.set(key,canonical(record.body));
      }
      if(!this.pending.has(key))applyRecord(next,record);
    }
    for(const value of this.pending.values())applyRecord(next,value.record);
    return {accepted:true,state:next};
  }
  acknowledge(batch){
    const refresh=[];
    for(const entry of batch){
      if(this.pending.get(entry.key)?.mutation!==entry.mutation)continue;
      const shadow=this.shadows.get(entry.key),sent=canonical(entry.record.body);
      if(shadow&&canonical(shadow.body)!==sent&&canonical(shadow.body)!==entry.baseline)refresh.push({kind:entry.record.kind,id:entry.record.id});
      this.pending.delete(entry.key);this.shadows.delete(entry.key);this.baseline.set(entry.key,sent);
    }
    return refresh;
  }
  acceptRefresh(state,incoming){
    for(const record of incoming.filter(validRecord)){
      const key=recordKey(record);this.baseline.set(key,canonical(record.body));
      if(!this.pending.has(key))applyRecord(state,record);
    }
  }
  snapshot(){return {uid:this.uid,pending:Object.fromEntries(this.pending),baseline:Object.fromEntries(this.baseline)};}
}
