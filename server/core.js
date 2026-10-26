import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { timingSafeEqual } from 'node:crypto';
export class HttpError extends Error { constructor(status,message){ super(message); this.status=status; } }
export function json(res,status,body) { res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');return res.status(status).json(body); }
export function admin() {
  if(!getApps().length) {
    if(!process.env.FIREBASE_SERVICE_ACCOUNT) throw new HttpError(503,'Онлайн-профиль ещё не подключён.');
    let service;try{service=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);}catch{throw new HttpError(503,'Настройки онлайн-профиля требуют проверки.');}
    initializeApp({credential:cert(service)});
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
export function body(req) {
  let value=req.body;
  if(typeof value==='string') {if(Buffer.byteLength(value)>32000)throw new HttpError(413,'Слишком большой запрос.');try{value=JSON.parse(value);}catch{throw new HttpError(400,'Некорректный запрос.');}}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'Некорректный запрос.');
  return value;
}
export const route=fn=>async(req,res)=>{try{await fn(req,res);}catch(error){const status=error instanceof HttpError?error.status:500;return json(res,status,{error:status===500?'Сервис временно недоступен. Попробуй позже.':error.message});}};
export function post(req){if(req.method!=='POST')throw new HttpError(405,'Используй POST.');}
export function checkCron(req) {
  const expected=process.env.CRON_SECRET;
  const actual=String(req.headers.authorization||'').replace(/^Bearer /,'');
  if(!expected)throw new HttpError(503,'Служба напоминаний ещё не подключена.');
  if(actual.length!==expected.length||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))throw new HttpError(401,'Нет доступа.');
}
export async function quota(uid, kind, limit) {
  const {db}=admin(),day=new Date().toISOString().slice(0,10),ref=db.doc(`serverQuotas/${kind}:${uid}:${day}`);
  await db.runTransaction(async tx=>{const snap=await tx.get(ref);const count=snap.data()?.count||0;if(count>=limit)throw new HttpError(429,'Лимит сообщений на сегодня закончился. Чат станет доступен завтра.');tx.set(ref,{count:count+1,uid,day,expiresAt:new Date(Date.now()+3*86400000)});});
}
