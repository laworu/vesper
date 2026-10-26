import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../public/src/domain.js';
import { SyncLedger,canonical } from '../public/src/sync.js';
const goal=(title,updatedAt=1)=>({kind:'goals',id:'goal-1',body:{id:'goal-1',title,completed:false,updatedAt},updatedAt});
const server={uid:'alice',fromCache:false},cache={uid:'alice',fromCache:true};
test('an initial empty cache cannot enable uploads or erase cached records',()=>{
  const ledger=new SyncLedger('alice'),state=emptyState();state.goals['goal-1']=goal('Cached').body;
  const result=ledger.receive(state,[],cache);
  assert.equal(result.accepted,false);assert.equal(result.state.goals['goal-1'].title,'Cached');assert.equal(ledger.serverReady,false);assert.deepEqual(ledger.selectBatch(),[]);
});
test('server state is authoritative even when its device clock is behind',()=>{
  const ledger=new SyncLedger('alice'),state=emptyState();state.goals['goal-1']=goal('Stale fast clock',99999999).body;
  const result=ledger.receive(state,[goal('Remote edit',2)],server);
  assert.equal(result.state.goals['goal-1'].title,'Remote edit');assert.equal(ledger.pending.size,0);
});
test('unsynced mutations survive reload and overlay server data until acknowledged',()=>{
  const ledger=new SyncLedger('alice');ledger.stage([goal('Offline edit',30)]);
  const restored=new SyncLedger('alice',JSON.parse(JSON.stringify(ledger.snapshot())));
  const result=restored.receive(emptyState(),[goal('Remote before edit',20)],server);
  assert.equal(result.state.goals['goal-1'].title,'Offline edit');assert.equal(restored.selectBatch().length,1);
});
test('acknowledging an earlier write does not drop a newer local edit',()=>{
  const ledger=new SyncLedger('alice');ledger.receive(emptyState(),[goal('Original')],server);ledger.stage([goal('First',2)]);const first=ledger.selectBatch();ledger.stage([goal('Second',3)]);ledger.acknowledge(first);
  assert.equal(ledger.pending.size,1);assert.equal(ledger.selectBatch()[0].record.body.title,'Second');
});
test('an acknowledgement from another account cannot share an outbox or snapshot',()=>{
  const alice=new SyncLedger('alice');alice.stage([goal('Private')]);
  const bob=new SyncLedger('bob',alice.snapshot());assert.equal(bob.pending.size,0);
  const result=bob.receive(emptyState(),[goal('Private')],server);assert.equal(result.accepted,false);assert.equal(Object.keys(result.state.goals).length,0);
});
test('field order does not count as an edit; synchronization stays quiet after hydration',()=>{
  assert.equal(canonical({z:1,a:{b:2,a:3}}),canonical({a:{a:3,b:2},z:1}));
  const ledger=new SyncLedger('alice');ledger.receive(emptyState(),[goal('Remote')],server);assert.deepEqual(ledger.selectBatch(),[]);
});
test('soft deletions reach other devices and are not resurrected from stale cache',()=>{
  const ledger=new SyncLedger('alice'),state=emptyState();state.goals['goal-1']=goal('Cached',99).body;
  const deleted=goal('Deleted',2);deleted.body.deleted=true;
  const result=ledger.receive(state,[deleted],server);assert.equal(result.state.goals['goal-1'].deleted,true);assert.equal(ledger.pending.size,0);
});
test('a competing remote edit during a write requests a fresh read of only that record',()=>{
  const ledger=new SyncLedger('alice');ledger.receive(emptyState(),[goal('Original',1)],server);ledger.stage([goal('Local',2)]);const batch=ledger.selectBatch();ledger.receive(emptyState(),[goal('Other device',3)],server);
  assert.deepEqual(ledger.acknowledge(batch),[{kind:'goals',id:'goal-1'}]);const state=emptyState();ledger.acceptRefresh(state,[goal('Server winner',4)]);assert.equal(state.goals['goal-1'].title,'Server winner');
});
