import test from 'node:test';
import assert from 'node:assert/strict';

test('switching accounts during a batch stops the remaining writes and stale snapshots',async()=>{
  const cloud=await import('../public/src/cloud.js?test=account-switch');
  let accountChanged,releaseWrite,firstCommitted=false;
  const writes=[],snapshots=[],received=[],users=[];
  const auth={};
  await cloud.configure({onUser:user=>users.push(user),onRecords:(records,meta)=>received.push({records,meta}),onStatus:()=>{}},{
    config:{firebase:{projectId:'test-only'},chat:false,push:false},
    services:{
      app:{initializeApp:()=>({})},
      auth:{getAuth:()=>auth,onIdTokenChanged:(_auth,callback)=>{accountChanged=callback;return ()=>{};}},
      firestore:{getFirestore:()=>({}),collection:(_db,...path)=>path.join('/'),doc:(_db,...path)=>path.join('/'),
        onSnapshot:(path,_options,callback)=>{snapshots.push({path,callback});return ()=>{};},
        writeBatch:()=>{const paths=[];return {set:path=>paths.push(path),commit:async()=>{writes.push(paths);await new Promise(resolve=>{releaseWrite=resolve;firstCommitted=true;});}};}}
    }
  });
  try{
    await accountChanged({uid:'alice',email:'alice@example.invalid',emailVerified:true});
    const records=Array.from({length:401},(_,i)=>({kind:'goals',id:'goal-'+i,body:{id:'goal-'+i},updatedAt:1}));
    const writing=cloud.writeRecords(records,'alice');
    assert.equal(firstCommitted,true);assert.equal(writes[0].length,400);
    await accountChanged({uid:'bob',email:'bob@example.invalid',emailVerified:true});
    snapshots[0].callback({metadata:{fromCache:false,hasPendingWrites:false},docs:[]});
    assert.equal(received.length,0);assert.equal(users.at(-1).uid,'bob');
    releaseWrite();await assert.rejects(writing,/Профиль изменился/);
    assert.equal(writes.length,1);assert.equal(writes[0].every(path=>path.startsWith('users/alice/records/')),true);
    await assert.rejects(()=>cloud.writeRecords(records,'alice'),/Профиль изменился/);
  }finally{cloud.dispose();}
});
