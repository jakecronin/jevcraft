import {test} from 'node:test';
import assert from 'node:assert/strict';
import {relativeRoute,reached} from '../src/movement.js';
import {inventoryQuestion,inventoryReport} from '../src/inventory-report.js';
import {Reactor} from '../src/reactor.js';
import type {Observation} from '../src/core.js';
const origin={x:0.5,y:64,z:0.5};
test('forward then right uses the initial facing and cumulative endpoints',()=>{
 const route=relativeRoute('walk 10 blocks forward and then 20 blocks to the right',origin,0)!;
 assert.equal(route.length,2);
 assert.deepEqual(route[0].target,{x:0.5,y:64,z:-9.5});
 assert.deepEqual(route[1].target,{x:20.5,y:64,z:-9.5});
 assert.deepEqual(relativeRoute('step back',origin,0)![0].target,{x:0.5,y:64,z:1.5});
 assert.equal(relativeRoute('walk 1000 blocks forward',origin,0),null);
 assert.equal(relativeRoute('walk forward and build a house',origin,0),null);
});
test('inventory requests produce complete counted, bounded messages',()=>{
 assert.ok(inventoryQuestion("what's in your inventory?"));assert.ok(inventoryQuestion('explain your inventory'));
 assert.equal(inventoryQuestion('drop your inventory'),false);
 assert.deepEqual(inventoryReport({}),['My inventory is empty.']);
 const lines=inventoryReport(Object.fromEntries(Array.from({length:36},(_,i)=>[`long_item_name_${i}`,64])));
 assert.ok(lines.every(l=>l.length<=180));assert.match(lines.join(' '),/long item name 35/);
});
test('route exposes only next leg and verifies endpoints before advancing',async()=>{
 let p={...origin};const offered:string[][]=[];
 const observe=():Observation=>({objective:'',position:p,health:20,inventory:{},gainedLogs:0,lastResult:'',world:{yaw:0},actions:[{id:'wait',kind:'wait',description:'wait'},{id:'blocked',kind:'blocked',description:'blocked'},{id:'complete',kind:'complete',description:'complete'}]});
 const r=new Reactor({text:'walk 10 blocks forward then 20 blocks right',requester:'test'},{observe,execute:async a=>{p={...a.target!};},stop:()=>{}},async state=>{offered.push(state.actions.map(a=>a.id));return state.actions.find(a=>a.id.startsWith('route_'))??state.actions.find(a=>a.kind==='complete')!;},()=>{});
 await r.step();await r.step();await r.step();
 assert.ok(offered[0].includes('route_0'));assert.ok(!offered[0].includes('route_1'));assert.ok(!offered[0].includes('complete'));
 assert.ok(offered[1].includes('route_1'));assert.equal(r.status,'complete');assert.ok(reached(p,{x:20.5,y:64,z:-9.5}));
});
