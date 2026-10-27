import { timingSafeEqual } from 'node:crypto';

export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
export function json(res,status,value){res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');return res.status(status).json(value);}
export function body(req){
  let value=req.body;
  if(typeof value==='string'){if(Buffer.byteLength(value)>32000)throw new HttpError(413,'Слишком большой запрос.');try{value=JSON.parse(value);}catch{throw new HttpError(400,'Некорректный запрос.');}}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'Некорректный запрос.');
  return value;
}
export const route=fn=>async(req,res)=>{try{await fn(req,res);}catch(error){const status=error instanceof HttpError?error.status:500;return json(res,status,{error:status===500?'Сервис временно недоступен. Попробуй позже.':error.message});}};
export function post(req){if(req.method!=='POST')throw new HttpError(405,'Используй POST.');}
export function checkCron(req){
  const expected=process.env.CRON_SECRET,actual=String(req.headers.authorization||'').replace(/^Bearer /,'');
  if(!expected)throw new HttpError(503,'Служба напоминаний ещё не подключена.');
  if(actual.length!==expected.length||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))throw new HttpError(401,'Нет доступа.');
}
