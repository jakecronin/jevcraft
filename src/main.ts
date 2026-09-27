import {createInterface} from 'node:readline';
import {addressed} from './chat.js';
import {BotName,renameRequest} from './name.js';
import {choose} from './core.js';
import {connect} from './minecraft.js';
import {worldAdapter} from './world.js';
import {Reactor} from './reactor.js';
import {inventoryQuestion,inventoryReport} from './inventory-report.js';
import {inventory} from './world.js';
import {Trace} from './audit.js';
const identity=new BotName(process.env.MC_CHAT_NAME??process.env.MC_USERNAME??'JevCraft','.bot-state/name.json');
const bot=connect();const adapter=worldAdapter(bot,()=>identity.value,message=>reply(message));
let ready=false;let runner:Reactor|undefined;let trace:Trace|undefined;
const reply=(message:string)=>{console.log(message);if(ready)bot.chat(`[${identity.value}] ${message.slice(0,220)}`);};
function start(text:string,requester:string,automatic:boolean) {
  if(!ready)return;
  if(runner?.busy||runner?.automatic){reply('Already working. Stop the current task first.');return;}
  if(!text.trim()||text.length>500){reply('Use a task between 1 and 500 characters.');return;}
  if(runner&&!['complete','blocked','clarification','interrupted'].includes(runner.status)) runner.cancel('Replaced by a new task');
  trace=new Trace();
  runner=new Reactor({text,requester},adapter,async(state,signal,audit)=>(await choose(state,signal,undefined,audit)).action,trace.emit,reply);
  runner.automatic=automatic;
  reply(`Task: ${text}. Say "${identity.value} stop" to interrupt.`);
  console.log(`Trace: ${trace.path}\nInspect: npm run trace`);
  if(automatic)void runner.step();
}
function interrupt(reason:string) {if(runner)runner.cancel(reason);else{adapter.stop();reply('Stopped.');}}
function status() {reply(runner?`${runner.status}: ${runner.task.text}`:'Idle. Give me a task.');}
const rl=createInterface({input:process.stdin,output:process.stdout});
const timer=setInterval(()=>{if(ready&&runner?.automatic)void runner.step();},1000);
bot.on('spawn',()=>{ready=true;console.log(`Ready as ${identity.value}. Chat: "${identity.value}, <task>". Terminal: task <text>, Enter, auto, stop, status, trace, quit.`);});
bot.on('chat',(username,message)=>{
  if(!ready||username===bot.username)return;
  const text=addressed(message,identity.value);if(!text)return;
  if(/^(?:stop|cancel|pause|stop what you are doing|stop everything|please stop)[.!]?$/i.test(text)){interrupt(`Stopped by ${username}`);return;}
  if(/^(?:status|what are you doing|how is it going)[?!]?$/i.test(text)){status();return;}
  if(inventoryQuestion(text)){const items=inventory(bot);trace?.emit('inventory.report',{requester:username,items});for(const line of inventoryReport(items))reply(line);return;}
  const name=renameRequest(text);
  if(name!==null){try{const previous=identity.value;identity.rename(name);trace?.emit('name.changed',{previous,name});reply(`My name is now ${name}. Minecraft username remains ${bot.username}.`);}catch(e){reply((e as Error).message);}return;}
  if(/^(?:what(?:'s| is) your name|who are you)[?.!]?$/i.test(text)){reply(`I'm ${identity.value}.`);return;}
  start(text,username,true);
});
rl.on('line',line=>{
  const text=line.trim();
  if(text==='stop'||text==='pause')interrupt('Stopped from terminal');
  else if(text==='quit'){interrupt('Exiting');bot.quit();clearInterval(timer);rl.close();}
  else if(text==='status')status();
  else if(text==='inventory'){for(const line of inventoryReport(inventory(bot)))reply(line);}
  else if(text==='trace')console.log(trace?`Full chain: ${trace.path}\nRun npm run trace in another terminal.`:'No task trace yet.');
  else if(text.startsWith('task '))start(text.slice(5),'terminal',false);
  else if(text==='reset')start('Collect one additional oak log','terminal',false);
  else if(text==='auto'&&runner){runner.automatic=true;void runner.step();}
  else if(text===''&&runner){runner.automatic=false;void runner.step();}
  else console.log('task <request> = new task in step mode; Enter = one action; auto; stop; status; trace; quit');
});
bot.on('death',()=>{ready=false;interrupt('Bot died');});
bot.on('end',()=>{ready=false;interrupt('Disconnected');clearInterval(timer);rl.close();});
bot.on('kicked',()=>{ready=false;interrupt('Kicked by server');});
bot.on('error',error=>{interrupt(`Connection error: ${error.message}`);});
bot.on('health',()=>{if(ready&&bot.health<10&&runner?.status==='running')interrupt('Low health');});
process.on('SIGINT',()=>{interrupt('Ctrl+C');bot.quit();clearInterval(timer);rl.close();});
