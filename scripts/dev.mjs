import http from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve,extname } from 'node:path';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const publicRoot=resolve('public');
const routes={'/api/config':'config','/api/chat':'chat','/api/news':'news','/api/push-subscribe':'push-subscribe','/api/push-dispatch':'push-dispatch'};
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  res.status=code=>{res.statusCode=code;return res;};res.json=value=>{res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));return res;};
  try{
    const url=new URL(req.url,'http://localhost');
    if(routes[url.pathname]){
      let content='';for await(const chunk of req){content+=chunk;if(content.length>32000){res.status(413).json({error:'Запрос слишком большой.'});return;}}
      if(content){try{req.body=JSON.parse(content);}catch{res.status(400).json({error:'Некорректный JSON.'});return;}}
      const handler=(await import(`../api/${routes[url.pathname]}.js`)).default;await handler(req,res);return;
    }
    let path;try{path=decodeURIComponent(url.pathname);}catch{res.status(400).end();return;}
    const file=resolve(publicRoot,'.'+(path==='/'?'/index.html':path));
    if(!file.startsWith(publicRoot+'/')){res.status(403).end();return;}
    const info=await stat(file);if(!info.isFile()){res.status(404).end();return;}
    res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(await readFile(file));
  }catch(error){if(!res.headersSent)res.status(error.code==='ENOENT'?404:500).json({error:'Не удалось открыть ресурс.'});else res.end();}
});
const port=Number(process.env.PORT||4173);server.listen(port,'0.0.0.0',()=>process.stdout.write(`VESPER local preview: http://localhost:${port}\n`));
