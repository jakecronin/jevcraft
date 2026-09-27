import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BotName,renameRequest} from '../src/name.js';
import {addressed} from '../src/chat.js';
test('rename natural commands and reject unrelated requests',()=>{
 for(const s of ['rename yourself Woody','call yourself Woody','your name is now Woody','rename Woody']) assert.equal(renameRequest(s),'Woody');
 assert.equal(renameRequest('collect four logs'),null);
});
test('renaming persists and changes addressing without changing login',()=>{
 const dir=mkdtempSync(join(tmpdir(),'jev-name-'));
 try {
 const name=new BotName('JevCraft',join(dir,'name.json'));
 name.rename('Woody');
 assert.equal(addressed('Woody, get wood',name.value),'get wood');
 assert.equal(addressed('JevCraft stop',name.value),null);
 assert.equal(addressed('Woodyard stop',name.value),null);
 assert.equal(new BotName('JevCraft',join(dir,'name.json')).value,'Woody');
 for(const bad of ['', '/op', 'a b', 'a'.repeat(17)]) assert.throws(()=>name.rename(bad));
 assert.equal(name.value,'Woody');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
