import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

test('server routes start when CommonJS require of ES modules is unavailable',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'vesper-startup-'));
  try{
    const {NODE_TEST_CONTEXT,...environment}=process.env;
    const result=spawnSync(process.execPath,['--no-experimental-require-module','--input-type=module','-e',`
      import {writeFileSync} from 'node:fs';
      const cases=[
        ['config','GET',{}],
        ['chat','POST',{}],
        ['push-subscribe','POST',{}],
        ['push-dispatch','POST',{authorization:'Bearer incorrect-test-secret'}]
      ],results=[];
      for(const [name,method,headers]of cases){
        const handler=(await import('./api/'+name+'.js')).default;
        const response={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
        await handler({method,headers,body:{message:'Test'}},response);
        results.push({name,status:response.code,...(name==='config'?{projectId:response.data.firebase?.projectId}:{})});
      }
      writeFileSync(process.argv[1],JSON.stringify(results));
    `,join(directory,'result.json')],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...environment,FIREBASE_WEB_CONFIG:'',FIREBASE_SERVICE_ACCOUNT:'',CRON_SECRET:'startup-test-secret'},encoding:'utf8',timeout:20000});
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(await readFile(join(directory,'result.json'),'utf8')),[
      {name:'config',status:200,projectId:'vesper-21ef9'},
      {name:'chat',status:401},
      {name:'push-subscribe',status:401},
      {name:'push-dispatch',status:401}
    ]);
  }finally{await rm(directory,{recursive:true,force:true});}
});
