import { createHash } from 'node:crypto';
import { route,json,post,body,requireUser,admin,HttpError } from '../server/core.js';
export default route(async(req,res)=>{
  post(req);const user=await requireUser(req),input=body(req),sub=input.subscription;
  let endpoint;try{endpoint=new URL(sub?.endpoint);}catch{throw new HttpError(400,'Подписка уведомлений не распознана.');}
  const host=endpoint.hostname;
  const allowed=['fcm.googleapis.com','updates.push.services.mozilla.com','notify.windows.com','push.apple.com'].some(h=>host===h||host.endsWith('.'+h));
  if(endpoint.protocol!=='https:'||!allowed||endpoint.href.length>4096||!sub.keys?.auth||!sub.keys?.p256dh)throw new HttpError(400,'Этот сервис уведомлений пока не поддерживается.');
  const id=`${user.uid}:${createHash('sha256').update(endpoint.href).digest('hex')}`;
  const ref=admin().db.doc(`pushSubscriptions/${id}`);
  if(input.remove)await ref.delete();else await ref.set({uid:user.uid,subscription:sub,updatedAt:Date.now()});
  return json(res,200,{ok:true});
});
