import webpush from 'web-push';
import { route,json,checkCron,admin,HttpError } from '../server/core.js';
export default route(async(req,res)=>{
  if(!['POST','GET'].includes(req.method))throw new HttpError(405,'Метод не поддерживается.');
  checkCron(req);
  if(!process.env.VAPID_PUBLIC_KEY||!process.env.VAPID_PRIVATE_KEY)throw new HttpError(503,'Уведомления ещё не подключены.');
  webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:hello@example.invalid',process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
  const {db}=admin(),now=Date.now();
  const queue=await db.collection('reminders').where('sendAt','>',0).where('sendAt','<=',now).orderBy('sendAt').limit(60).get();
  let sent=0,expired=0;
  for(const doc of queue.docs){
    let item;
    await db.runTransaction(async tx=>{const snap=await tx.get(doc.ref),data=snap.data();if(!data?.sendAt||data.sendAt>now||(data.lockUntil||0)>now)return;item=data;tx.update(doc.ref,{lockUntil:now+60000});});
    if(!item)continue;
    const live=await db.doc(`users/${item.uid}/records/occurrences:${item.id}`).get();
    const occurrence=live.data()?.body;
    if(!occurrence||occurrence.deleted||occurrence.status!=='pending'||occurrence.scheduledAt!==item.scheduledAt||now-item.sendAt>15*60000){await doc.ref.update({sendAt:null,status:'expired',lockUntil:0});expired++;continue;}
    const subscribers=await db.collection('pushSubscriptions').where('uid','==',item.uid).get();
    let success=false;
    for(const sub of subscribers.docs){
      const receipt=db.doc(`notificationReceipts/${doc.id}:${Math.trunc(item.scheduledAt)}:${sub.id}`);
      let shouldSend=false;
      await db.runTransaction(async tx=>{const snap=await tx.get(receipt);if(snap.exists)return;tx.set(receipt,{at:now,uid:item.uid,state:'sending'});shouldSend=true;});
      if(!shouldSend)continue;
      try{await webpush.sendNotification(sub.data().subscription,JSON.stringify({title:'Кайро напоминает ✦',body:'В твоём плане скоро начнётся задача. Загляни в VESPER.',tag:`task-${item.id}`,url:`/#/today?focus=${encodeURIComponent(item.id)}`}),{TTL:900,timeout:8000});await receipt.update({state:'sent'});success=true;sent++;}
      catch(error){if([404,410].includes(error.statusCode))await sub.ref.delete();await receipt.delete();}
    }
    await doc.ref.update({sendAt:null,status:success?'sent':subscribers.empty?'no-devices':'failed',lockUntil:0});
  }
  return json(res,200,{sent,expired,processed:queue.size});
});
