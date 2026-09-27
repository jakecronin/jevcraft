import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Reactor,type Adapter} from '../src/reactor.js';
import type {Action,Observation} from '../src/core.js';
const wait:Action={id:'wait',kind:'wait',description:'Wait'};
const complete:Action={id:'complete',kind:'complete',description:'Complete'};
const state=():Observation=>({objective:'',position:{x:0,y:64,z:0},health:20,inventory:{},gainedLogs:0,lastResult:'',actions:[wait,complete]});
function fixture(execute:Adapter['execute']=async()=>{}) {
 const events:{type:string;data:any}[]=[];let stops=0;
 const adapter:Adapter={observe:state,execute,stop:()=>{stops++;}};
 return {adapter,events,audit:(type:string,data?:unknown)=>events.push({type,data}),stops:()=>stops};
}
test('recent results and original task reach the next decision; ordered audit',async()=>{
 const f=fixture();const inputs:Observation[]=[];
 const r=new Reactor({text:'Do my task',requester:'Alex'},f.adapter,async s=>{inputs.push(s);return wait;},f.audit);
 await r.step();await r.step();
 assert.equal(inputs[1].objective,'Do my task');assert.equal(inputs[1].history?.length,1);
 assert.ok(f.events.findIndex(e=>e.type==='action.start')<f.events.findIndex(e=>e.type==='action.result'));
});
test('cancel during inference prevents stale response execution',async()=>{
 let release!:(a:Action)=>void;let executed=0;const f=fixture(async()=>{executed++;});
 const r=new Reactor({text:'x',requester:'x'},f.adapter,()=>new Promise(resolve=>{release=resolve;}),f.audit);
 const pending=r.step();r.cancel();release(wait);await pending;
 assert.equal(executed,0);assert.equal(r.status,'interrupted');
});
test('cancel releases hung execution and disables auto',async()=>{
 const f=fixture(()=>new Promise(()=>{}));const r=new Reactor({text:'x',requester:'x'},f.adapter,async()=>wait,f.audit);
 r.automatic=true;const p=r.step();await new Promise(resolve=>setImmediate(resolve));r.cancel();await p;
 assert.equal(r.busy,false);assert.equal(r.automatic,false);assert.ok(f.stops()>0);
 assert.ok(f.events.some(e=>e.type==='action.result'&&e.data.outcome==='interrupted'));
});
test('repetition temporarily excludes an action before third identical execution',async()=>{
 let n=0;const f=fixture(async()=>{n++;});const r=new Reactor({text:'x',requester:'x'},f.adapter,async()=>wait,f.audit);
 await r.step();await r.step();await r.step();assert.equal(n,2);assert.equal(r.status,'idle');assert.ok(!r.snapshot().actions.some(a=>a.id==='wait'));
});
test('model completion does not claim independent verification',async()=>{
 const f=fixture();let message='';const r=new Reactor({text:'x',requester:'x'},f.adapter,async()=>complete,f.audit,m=>{message=m;});
 await r.step();assert.equal(r.status,'complete');assert.match(message,/Model reports/);
});
test('failure reobserves and is included in history',async()=>{
 const f=fixture(async()=>{throw new Error('Target gone');});const r=new Reactor({text:'x',requester:'x'},f.adapter,async()=>wait,f.audit);
 await r.step();assert.equal(r.status,'idle');assert.equal(r.history[0].result,'Target gone');assert.ok(f.events.some(e=>e.type==='recovery.retry'));
});
test('action timeout stops controls and allows bounded retry',async()=>{
 const f=fixture(()=>new Promise(()=>{}));const r=new Reactor({text:'x',requester:'x'},f.adapter,async()=>wait,f.audit,()=>{},{steps:5,timeMs:5000,actionMs:20});
 // Keep the process alive while AbortSignal.timeout uses its unref-ed timer.
 const keepAlive=setInterval(()=>{},100);
 try{await r.step();assert.equal(r.status,'idle');assert.ok(f.stops()>0);}finally{clearInterval(keepAlive);}
});
test('progress events arrive before an action completes',async()=>{
 const f=fixture(async()=>{await new Promise(resolve=>setTimeout(resolve,1100));});
 const r=new Reactor({text:'x',requester:'x'},f.adapter,async()=>wait,f.audit);
 await r.step();const progress=f.events.findIndex(e=>e.type==='action.progress');
 assert.ok(progress>0);assert.ok(progress<f.events.findIndex(e=>e.type==='action.result'));
});
