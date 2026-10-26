// Deploy on the Workers Free plan. Add SITE_URL and CRON_SECRET as Worker secrets/settings.
export default {
  async scheduled(_event,env,ctx) {
    ctx.waitUntil((async()=>{
      const response=await fetch(new URL('/api/push-dispatch',env.SITE_URL),{method:'POST',headers:{Authorization:`Bearer ${env.CRON_SECRET}`}});
      if(!response.ok)console.error('VESPER reminder dispatch failed',response.status);
    })());
  },
  async fetch(){return new Response('VESPER reminder scheduler');}
};
