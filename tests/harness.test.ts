import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vec3} from 'vec3';
import {constrainDrops,dropScope,remainingDrops} from '../src/drop-policy.js';
import {placementSites,preservesExit} from '../src/placement.js';
import {worldAdapter} from '../src/world.js';
import type {Observation} from '../src/core.js';
const state:Observation={objective:'',position:{x:0,y:64,z:0},health:20,inventory:{oak_log:5,stone_axe:1},gainedLogs:0,lastResult:'',world:{inventoryBlockNames:['oak_log']},actions:[
 {id:'place',kind:'place',description:'Place block'},
 {id:'drop_log',kind:'drop',itemName:'oak_log',description:'Toss logs'},
 {id:'drop_axe',kind:'drop',itemName:'stone_axe',description:'Toss axe'},
 {id:'complete',kind:'complete',description:'Done'},
 {id:'wait',kind:'wait',description:'Wait'},
 {id:'blocked',kind:'blocked',description:'Blocked'},
]};
test('regression: drop inventory cannot select placement or premature completion',()=>{
 assert.deepEqual(constrainDrops('drop all of your inventory',state).actions.map(a=>a.id),['drop_log','drop_axe','wait','blocked']);
 assert.equal(remainingDrops('drop your inventory',state),6);
 assert.equal(remainingDrops('drop your logs',state),5);
 assert.deepEqual(constrainDrops('drop your blocks',state).actions.filter(a=>a.kind==='drop').map(a=>a.id),['drop_log']);
 assert.ok(constrainDrops('drop your logs',{...state,inventory:{stone_axe:1}}).actions.some(a=>a.kind==='complete'));
 assert.equal(dropScope('do not drop your logs'),null);
 assert.equal(dropScope('drop two logs'),'logs');
 assert.ok(constrainDrops('drop two logs',state).actions.every(a=>a.kind==='clarify'||a.kind==='blocked'));
});
const feet=new Vec3(0,64,0);
function terrain(occupied:Vec3[]=[]) {return (p:Vec3)=>p.y<64?{name:'stone',boundingBox:'block'}:occupied.some(b=>b.equals(p))?{name:'oak_log',boundingBox:'block'}:{name:'air',boundingBox:'empty'};}
test('regression: extend a pole upward and leave at least one exit',()=>{
 const pole=new Vec3(1,64,0);
 assert.ok(placementSites(feet,terrain([pole])).some(s=>s.target.equals(new Vec3(1,65,0))&&s.height===2));
 const walls=[new Vec3(1,64,0),new Vec3(-1,64,0),new Vec3(0,64,1)];
 assert.equal(preservesExit(feet,new Vec3(0,64,-1),terrain(walls)),false);
 assert.equal(preservesExit(feet,new Vec3(1,65,0),terrain([pole])),true);
 assert.equal(preservesExit(feet,feet,terrain()),false);
});
test('drop executor tosses the whole stack, never places it, and rejects stale slots',async()=>{
 let items=[{name:'oak_log',slot:36,count:5,type:1}];let tossed=0;
 const bot={inventory:{items:()=>items},tossStack:async(item:typeof items[number])=>{tossed=item.count;items=[];},pathfinder:{setGoal:()=>{}},stopDigging:()=>{},clearControlStates:()=>{}};
 const adapter=worldAdapter(bot as never);
 const action={id:'drop_36',kind:'drop' as const,itemName:'oak_log',itemSlot:36,count:5,description:'Toss'};
 await adapter.execute(action,new AbortController().signal);assert.equal(tossed,5);
 await assert.rejects(adapter.execute(action,new AbortController().signal),/Stack changed/);
});
