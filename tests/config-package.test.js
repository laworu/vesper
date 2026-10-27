import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('public Firebase configuration starts without optional server SDK packages',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'vesper-config-'));
  try{
    for(const path of ['api','server'])await mkdir(join(directory,path));
    for(const path of ['package.json','api/config.js','server/http.js','server/firebase-config.js'])await copyFile(new URL('../'+path,import.meta.url),join(directory,path));
    const {FIREBASE_WEB_CONFIG,NODE_TEST_CONTEXT,...environment}=process.env;
    const result=spawnSync(process.execPath,['--input-type=module','-e',`
      import {writeFileSync} from 'node:fs';
      const handler=(await import('./api/config.js')).default;
      const response={setHeader(){},status(code){this.code=code;return this;},json(data){writeFileSync('response.json',JSON.stringify({status:this.code,projectId:data.firebase?.projectId}));}};
      await handler({method:'GET'},response);
    `],{cwd:directory,env:environment,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(await readFile(join(directory,'response.json'),'utf8')),{status:200,projectId:'vesper-21ef9'});
  }finally{await rm(directory,{recursive:true,force:true});}
});
