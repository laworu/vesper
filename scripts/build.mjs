import { stat,readFile } from 'node:fs/promises';
import './check.mjs';
if(process.exitCode)process.exit(process.exitCode);
for(const path of ['index.html','style.css','src/app.js','assets/kairo.png','sw.js','manifest.webmanifest'])await stat(`public/${path}`);
const manifest=JSON.parse(await readFile('public/manifest.webmanifest','utf8'));
if(manifest.start_url!=='/')throw Error('Invalid manifest start URL');
process.stdout.write('Static application ready in public/. Server routes are deployed from api/.\n');
