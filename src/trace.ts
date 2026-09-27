import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2);
const files=readdirSync('logs').filter(f=>f.endsWith('.jsonl')).sort();
const path=args.find(a=>!a.startsWith('--'))??(files.length?`logs/${files.at(-1)}`:undefined);
if(!path)throw new Error('No traces yet. Start a task first.');
const lines=readFileSync(path,'utf8').split('\n').filter(Boolean);
const events=lines.map((line,index)=>{try{return JSON.parse(line);}catch{return {type:'invalid.line',sequence:index+1,data:{line}};}});
if(args.includes('--json')) console.log(JSON.stringify(events,null,2));
else {
 const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const cards=events.map(e=>`<details data-search="${escape(JSON.stringify(e).toLowerCase())}"><summary>#${e.sequence??'?'} ${escape(e.time??'')} · ${escape(e.type??'legacy.event')}</summary><pre>${escape(JSON.stringify(e,null,2))}</pre></details>`).join('\n');
 const output=path.replace(/\.jsonl$/,'.html');
 writeFileSync(output,`<!doctype html><meta charset="utf-8"><title>JevCraft trace</title><style>body{font:16px system-ui;background:#111827;color:#e5e7eb;max-width:1100px;margin:40px auto;padding:20px}details{border:1px solid #374151;margin:10px 0;padding:12px;border-radius:8px}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px monospace}input,button{padding:10px;margin:6px;background:#1f2937;color:white;border:1px solid #6b7280}input{width:55%}</style><h1>Reactive run trace</h1><p>${escape(path)} · ${events.length} events</p><p>Snapshot export. Re-run npm run trace to include newer events. Requests show exactly what Jev received; responses show its returned choices, not hidden reasoning.</p><input id="search" placeholder="Filter events, action IDs, errors..."><button onclick="document.querySelectorAll('details').forEach(d=>d.open=true)">Expand all</button><button onclick="document.querySelectorAll('details').forEach(d=>d.open=false)">Collapse all</button>${cards}<script>document.querySelector('#search').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('details').forEach(d=>d.hidden=!d.dataset.search.includes(q));});</script>`);
 console.log(`Open this file in your browser:\n${resolve(output)}`);
}
