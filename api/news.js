let cache=null,cacheAt=0;
const decode=s=>String(s||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
const tag=(s,t)=>decode(s.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${t}>`,'i'))?.[1]||'');
export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=3600');
  if(cache&&Date.now()-cacheAt<900000)return res.status(200).json({items:cache});
  try{
    const response=await fetch('https://www.nasa.gov/feed/',{headers:{'User-Agent':'VESPER/7'},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('feed');
    const xml=await response.text();
    const items=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].slice(0,12).map(([,s])=>{
      const url=tag(s,'link'),image=s.match(/<(?:media:content|enclosure)[^>]*url="([^"]+)"/i)?.[1]||'';
      if(!url.startsWith('https://www.nasa.gov/'))return null;
      return {title:tag(s,'title'),url,description:tag(s,'description').slice(0,400),date:tag(s,'pubDate'),image:image.startsWith('https://')?image:'',source:'NASA',language:'Оригинал на английском'};
    }).filter(Boolean);
    if(!items.length)throw Error('empty');cache=items;cacheAt=Date.now();return res.status(200).json({items});
  }catch{return res.status(cache?200:503).json({items:cache||[],stale:Boolean(cache),error:'Не удалось обновить ленту. Официальные источники доступны по ссылкам.'});}
}
