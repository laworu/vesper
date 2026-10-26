import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function walk(path){for(const item of await readdir(path,{withFileTypes:true})){const name=`${path}/${item.name}`;if(item.isDirectory())await walk(name);else if(/\.(m?js)$/.test(name)){const result=spawnSync(process.execPath,['--check',name],{encoding:'utf8'});if(result.status!==0){process.stderr.write(result.stderr);process.exitCode=1;}}}}
for(const folder of ['public/src','api','server','scripts','cloudflare'])await walk(folder);
if(!process.exitCode)process.stdout.write('JavaScript syntax checks passed.\n');
