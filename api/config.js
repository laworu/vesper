import { route, json, HttpError } from '../server/http.js';
import { firebaseWebConfig, expectedProjectId } from '../server/firebase-config.js';
export default route(async(req,res)=>{
  let firebase=null;
  try {
    const raw=process.env.FIREBASE_WEB_CONFIG ? JSON.parse(process.env.FIREBASE_WEB_CONFIG) : firebaseWebConfig;
    if(raw?.projectId!==expectedProjectId) throw new HttpError(503,'Конфигурация Firebase должна относиться к проекту vesper-21ef9.');
    if(!raw?.apiKey||!raw?.authDomain||!raw?.appId) throw new HttpError(503,'Проверь публичную конфигурацию веб-приложения Firebase.');
    firebase=Object.fromEntries(['apiKey','authDomain','projectId','storageBucket','appId','messagingSenderId','measurementId'].filter(k=>raw[k]).map(k=>[k,raw[k]]));
  }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(503,'Не удалось прочитать FIREBASE_WEB_CONFIG. Удали переопределение или исправь JSON.');}
  return json(res,200,{version:7,firebase,chat:Boolean(firebase&&process.env.FIREBASE_SERVICE_ACCOUNT&&process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_AI_TOKEN),push:Boolean(firebase&&process.env.FIREBASE_SERVICE_ACCOUNT&&process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.CRON_SECRET),vapidPublicKey:process.env.VAPID_PUBLIC_KEY||null});
});
