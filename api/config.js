import { route, json } from '../server/core.js';
export default route(async(req,res)=>{
  let firebase=null;
  try {
    const raw=JSON.parse(process.env.FIREBASE_WEB_CONFIG||'null');
    if(raw?.apiKey&&raw?.projectId&&raw?.authDomain) firebase=Object.fromEntries(['apiKey','authDomain','projectId','appId','messagingSenderId'].filter(k=>raw[k]).map(k=>[k,raw[k]]));
  }catch{}
  return json(res,200,{version:7,firebase,chat:Boolean(firebase&&process.env.FIREBASE_SERVICE_ACCOUNT&&process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_AI_TOKEN),push:Boolean(firebase&&process.env.FIREBASE_SERVICE_ACCOUNT&&process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.CRON_SECRET),vapidPublicKey:process.env.VAPID_PUBLIC_KEY||null});
});
