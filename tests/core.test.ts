import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { observationSchema, parseDecision, requestBody, choose } from '../src/core.js';
const state=observationSchema.parse(JSON.parse(readFileSync('fixtures/near-log.json','utf8')));
const result=(choice:string,confidence=0.9)=>({model:'test',answers:{next_action:{type:'choice',choice,confidence,probabilities:{wait:0.1,mine_1_64_0:0.9}}}});
test('request exposes only supplied executable actions',()=>{assert.deepEqual(Object.keys(requestBody(state,'test').questions.next_action.criteria),['wait','mine_1_64_0']);});
test('unknown action cannot be executed',()=>{assert.throws(()=>parseDecision(result('attack_player'),state),/outside/);});
test('malformed confidence is rejected',()=>{assert.throws(()=>parseDecision(result('wait',2),state));});
test('selected target is resolved from original state',()=>{assert.deepEqual(parseDecision(result('mine_1_64_0'),state).action.target,{x:1,y:64,z:0});});
test('HTTP failures do not fall back to a gameplay action',async()=>{
  process.env.TYPESAFE_API_KEY='test-key';
  try { await assert.rejects(choose(state,new AbortController().signal,async()=>new Response('',{status:429})),/HTTP 429/); }
  finally {delete process.env.TYPESAFE_API_KEY;}
});
test('cancellation releases a hung movement and clears controls',async()=>{
  const {execute}=await import('../src/minecraft.js');
  let cleared=0;
  const {Vec3}=await import('vec3');
  const bot={entity:{position:new Vec3(0,64,0)},blockAt:()=>({name:'oak_log'}),
    pathfinder:{goto:()=>new Promise(()=>{}),setGoal:()=>{}},stopDigging:()=>{},clearControlStates:()=>{cleared++;}};
  const controller=new AbortController();
  const pending=execute(bot as never,{id:'move',kind:'move',description:'test',target:{x:2,y:64,z:0}},controller.signal);
  controller.abort();
  await assert.rejects(pending,/cancelled/);
  assert.ok(cleared>0);
});
test('audit preserves rejected raw response and omits authorization',async()=>{
 const previous=process.env.TYPESAFE_API_KEY;process.env.TYPESAFE_API_KEY='secret-fixture-value';
 const events:unknown[]=[];
 try {
 await assert.rejects(choose(state,new AbortController().signal,async()=>Response.json({unexpected:'invalid payload'}),(type,data)=>events.push({type,data})));
 const log=JSON.stringify(events);
 assert.match(log,/model.request/);assert.match(log,/invalid payload/);assert.match(log,/model.error/);
 assert.ok(!log.includes('secret-fixture-value'));assert.ok(!log.includes('Authorization'));
 }finally{if(previous===undefined)delete process.env.TYPESAFE_API_KEY;else process.env.TYPESAFE_API_KEY=previous;}
});
