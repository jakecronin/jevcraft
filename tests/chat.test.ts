import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addressed,parseRequest,interpret,ChatGate} from '../src/chat.js';
const result=(intent:string,quantity:string)=>({model:'test',answers:{intent:{type:'choice',choice:intent},quantity:{type:'choice',choice:quantity}}});
test('only explicitly addressed messages are interpreted',()=>{
 assert.equal(addressed('hello everyone'),null);
 assert.equal(addressed('jevil get wood'),null);
 assert.equal(addressed('Hey Jev, get four logs'),'get four logs');
 assert.equal(addressed('JevCraft stop'),'stop');
});
test('counts, defaults, unsupported requests and limits',()=>{
 assert.deepEqual(parseRequest(result('collect','4')),{intent:'collect',count:4});
 assert.deepEqual(parseRequest(result('collect','unspecified')),{intent:'collect',count:1});
 for(const q of ['0','-1','65','1.5','invalid']) assert.deepEqual(parseRequest(result('collect',q)),{intent:'unsupported'});
 assert.deepEqual(parseRequest(result('unsupported','4')),{intent:'unsupported'});
 assert.deepEqual(parseRequest(result('stop','invalid')),{intent:'stop'});
 assert.throws(()=>parseRequest(result('attack','1')));
});
test('stop cancels pending interpretation without releasing a newer request',()=>{
 const gate=new ChatGate();const first=gate.begin()!;
 assert.equal(gate.begin(),undefined);gate.cancel();assert.equal(first.signal.aborted,true);
 const next=gate.begin()!;gate.finish(first);assert.equal(gate.begin(),undefined);
 gate.finish(next);assert.ok(gate.begin());
});
test('interpret submits only request text and uses returned Jev choices',async()=>{
 const previous=process.env.TYPESAFE_API_KEY;process.env.TYPESAFE_API_KEY='fixture-key';
 try {
 const out=await interpret('get four oak logs',new AbortController().signal,async(_url,options)=>{
  const body=JSON.parse(options!.body as string);
  assert.deepEqual(body.state,{message:'get four oak logs'});
  assert.equal(body.questions.quantity.criteria['64'],'64 additional logs');
  return Response.json(result('collect','4'));
 });
 assert.deepEqual(out.request,{intent:'collect',count:4});
 }finally{if(previous===undefined) delete process.env.TYPESAFE_API_KEY;else process.env.TYPESAFE_API_KEY=previous;}
});
