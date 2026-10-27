import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpError } from './http.js';
import { expectedProjectId } from './firebase-config.js';
export { HttpError,json,body,route,post,checkCron } from './http.js';
export function admin() {
  if(!getApps().length) {
    if(!process.env.FIREBASE_SERVICE_ACCOUNT) throw new HttpError(503,'Онлайн-профиль ещё не подключён.');
    let service;try{service=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);}catch{throw new HttpError(503,'Настройки онлайн-профиля требуют проверки.');}
    if(service.project_id!==expectedProjectId)throw new HttpError(503,'Сервисный аккаунт должен относиться к проекту vesper-21ef9.');
    initializeApp({credential:cert(service),projectId:expectedProjectId});
  }
  return {auth:getAuth(),db:getFirestore()};
}
export async function requireUser(req) {
  const token=String(req.headers.authorization||'').match(/^Bearer (.+)$/)?.[1];
  if(!token)throw new HttpError(401,'Войди в профиль, чтобы использовать эту функцию.');
  let user;try{user=await admin().auth.verifyIdToken(token,true);}catch(error){if(error instanceof HttpError)throw error;throw new HttpError(401,'Срок входа истёк. Войди снова.');}
  if(!user.email_verified)throw new HttpError(403,'Подтверди электронную почту.');
  return user;
}
export async function quota(uid, kind, limit) {
  const {db}=admin(),day=new Date().toISOString().slice(0,10),ref=db.doc(`serverQuotas/${kind}:${uid}:${day}`);
  await db.runTransaction(async tx=>{const snap=await tx.get(ref);const count=snap.data()?.count||0;if(count>=limit)throw new HttpError(429,'Лимит сообщений на сегодня закончился. Чат станет доступен завтра.');tx.set(ref,{count:count+1,uid,day,expiresAt:new Date(Date.now()+3*86400000)});});
}
