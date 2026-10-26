import { test,describe,before,after,beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment,assertFails,assertSucceeds } from '@firebase/rules-unit-testing';
import * as appSDK from 'firebase/app';
import * as authSDK from 'firebase/auth';
import * as firestoreSDK from 'firebase/firestore';
import { initializeApp as initializeAdmin,deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
const PROJECT='demo-vesper-sync';
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Run through npm run test:firebase; cloud projects are never used by these tests.');
const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
describe('Firebase Authentication and Firestore integration',{concurrency:false},()=>{
let env,admin;
before(async()=>{env=await initializeTestEnvironment({projectId:PROJECT,firestore:{host,port:Number(port),rules:await readFile(new URL('../../firestore.rules',import.meta.url),'utf8')}});admin=initializeAdmin({projectId:PROJECT},'emulator-admin');});
const clients=[];
after(async()=>{for(const client of clients)client.dispose();if(env)await env.cleanup();for(const app of appSDK.getApps())await appSDK.deleteApp(app);if(admin)await deleteAdmin(admin);});
beforeEach(async()=>{await env.clearFirestore();});
const context=uid=>env.authenticatedContext(uid,{email:uid+'@example.invalid',email_verified:true}).firestore();
const record=(id='goal-1',title='Моя цель')=>({kind:'goals',id,body:{id,title,completed:false},updatedAt:1});
const path=(uid,id='goals:goal-1')=>'users/'+uid+'/records/'+id;
test('a confirmed owner can save and read their own records',async()=>{
  const db=context('alice'),ref=firestoreSDK.doc(db,path('alice'));
  await assertSucceeds(firestoreSDK.setDoc(ref,record()));const snapshot=await assertSucceeds(firestoreSDK.getDoc(ref));assert.equal(snapshot.data().body.title,'Моя цель');
});
test('another profile cannot read, list, modify or delete the owner records',async()=>{
  await env.withSecurityRulesDisabled(async ctx=>firestoreSDK.setDoc(firestoreSDK.doc(ctx.firestore(),path('alice')),record()));
  const db=context('bob');
  await assertFails(firestoreSDK.getDoc(firestoreSDK.doc(db,path('alice'))));
  await assertFails(firestoreSDK.getDocs(firestoreSDK.collection(db,'users/alice/records')));
  await assertFails(firestoreSDK.setDoc(firestoreSDK.doc(db,path('alice')),record('goal-1','Чужая правка')));
  await assertFails(firestoreSDK.deleteDoc(firestoreSDK.doc(db,path('alice'))));
});
test('guests and unverified accounts cannot read or write private records',async()=>{
  const guest=env.unauthenticatedContext().firestore(),unverified=env.authenticatedContext('alice',{email_verified:false}).firestore();
  await assertFails(firestoreSDK.getDocs(firestoreSDK.collection(guest,'users/alice/records')));
  await assertFails(firestoreSDK.setDoc(firestoreSDK.doc(unverified,path('alice')),record()));
});
test('invalid record identity and envelope fields are rejected',async()=>{
  const db=context('alice'),ref=firestoreSDK.doc(db,path('alice'));
  await assertFails(firestoreSDK.setDoc(ref,record('another-id')));
  await assertFails(firestoreSDK.setDoc(ref,{...record(),body:{id:'another-id'}}));
  await assertFails(firestoreSDK.setDoc(ref,{...record(),unexpected:true}));
  await assertFails(firestoreSDK.setDoc(ref,{...record(),updatedAt:'not-a-number'}));
});
test('owner deletion markers sync while physical deletion stays disabled',async()=>{
  const db=context('alice'),ref=firestoreSDK.doc(db,path('alice'));
  await firestoreSDK.setDoc(ref,record());await assertSucceeds(firestoreSDK.setDoc(ref,{...record(),body:{...record().body,deleted:true}}));
  assert.equal((await firestoreSDK.getDoc(ref)).data().body.deleted,true);await assertFails(firestoreSDK.deleteDoc(ref));
});
test('private diaries and server-only collections are not shared',async()=>{
  const db=context('alice'),diary={kind:'cycleEntries',id:'2026-10-27',body:{id:'2026-10-27',sex:true,note:'Личная запись'},updatedAt:1};
  await firestoreSDK.setDoc(firestoreSDK.doc(db,path('alice','cycleEntries:2026-10-27')),diary);
  await assertFails(firestoreSDK.getDoc(firestoreSDK.doc(context('bob'),path('alice','cycleEntries:2026-10-27'))));
  for(const target of ['pushSubscriptions/x','serverQuotas/x','notificationReceipts/x'])await assertFails(firestoreSDK.getDoc(firestoreSDK.doc(db,target)));
});
test('reminder writes are limited to the same confirmed owner',async()=>{
  const db=context('alice'),data={uid:'alice',id:'task-1@2026-10-27',sendAt:Date.now()+60000,scheduledAt:Date.now()+120000,status:'pending'};
  await assertSucceeds(firestoreSDK.setDoc(firestoreSDK.doc(db,'reminders/alice:'+data.id),data));
  await assertFails(firestoreSDK.setDoc(firestoreSDK.doc(context('bob'),'reminders/alice:'+data.id),data));
  await assertFails(firestoreSDK.getDoc(firestoreSDK.doc(db,'reminders/alice:'+data.id)));
});
function waitFor(predicate,description,timeout=12000){return new Promise((resolve,reject)=>{const started=Date.now();const check=()=>{if(predicate())resolve();else if(Date.now()-started>timeout)reject(Error('Timeout: '+description));else setTimeout(check,25);};check();});}
async function client(name){
  const module=await import('../../public/src/cloud.js?session='+name);
  const events={user:undefined,status:'',records:[],meta:null};
  clients.push(module);
  await module.configure({onUser(user){events.user=user;events.records=[];},onStatus(status){events.status=status;},onRecords(records,meta){events.records=records;events.meta=meta;}},{
    appName:name,services:{app:appSDK,auth:authSDK,firestore:firestoreSDK},
    config:{firebase:{apiKey:'demo-api-key',authDomain:PROJECT+'.firebaseapp.com',projectId:PROJECT,appId:'demo-app'},chat:false,push:false},
    authEmulator:'http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST,firestoreEmulator:{host,port:Number(port)}
  });
  await waitFor(()=>events.user===null,'guest initialization');return {module,events};
}
test('real email auth, verification and two independent clients synchronize and isolate accounts',async()=>{
  const a=await client('device-a'),b=await client('device-b'),email='alice-'+Date.now()+'@example.invalid',password='test-only-password-27';
  const created=await a.module.signUp(email,password),uid=created.user.uid;
  await waitFor(()=>a.events.user?.unverified,'unverified account state');
  await assert.rejects(()=>a.module.writeRecords([record()],uid));
  await adminAuth(admin).updateUser(uid,{emailVerified:true});await a.module.checkVerification();
  await waitFor(()=>a.events.user?.uid===uid&&!a.events.user.unverified&&a.events.meta?.fromCache===false,'verified server snapshot');
  await a.module.writeRecords([record()],uid);
  await b.module.signIn(email,password);
  await waitFor(()=>b.events.records.some(r=>r.body?.title==='Моя цель'),'same account on another device');
  await b.module.writeRecords([record('goal-1','Изменено на телефоне')],uid);
  await waitFor(()=>a.events.records.some(r=>r.body?.title==='Изменено на телефоне'),'remote edit reaches first device');
  await b.module.signOut();await waitFor(()=>b.events.user===null,'sign out clears identity');
  const bob=await b.module.signUp('bob-'+Date.now()+'@example.invalid',password);await adminAuth(admin).updateUser(bob.user.uid,{emailVerified:true});await b.module.checkVerification();
  await waitFor(()=>b.events.user?.uid===bob.user.uid&&b.events.meta?.uid===bob.user.uid&&b.events.meta?.fromCache===false,'second account loads');
  assert.equal(b.events.records.some(r=>r.body?.title==='Изменено на телефоне'),false);
  await assert.rejects(()=>b.module.writeRecords([record()],uid));
});
});
