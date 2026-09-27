import { createInterface } from 'node:readline';
import { mkdirSync, appendFileSync } from 'node:fs';
import { addressed, interpret, ChatGate } from './chat.js';
import { choose } from './core.js';
import { connect, execute, logCount, observe, stop } from './minecraft.js';
const bot = connect();
mkdirSync('logs',{recursive:true});
const logfile = `logs/${new Date().toISOString().replaceAll(':','-')}.jsonl`;
const record = (event: unknown) => appendFileSync(logfile,JSON.stringify({time:new Date().toISOString(),event})+'\n');
let ready=false, busy=false, automatic=false, baseline=0, steps=0, failures=0, lastResult='None';
let controller: AbortController | undefined;
let started=0, targetCount=1;
let chatTask=false;
const chatGate=new ChatGate();
function reply(message: string) { if(ready) bot.chat(`[Jev] ${message.slice(0,220)}`); }
function newTask(count=1) {
  baseline=logCount(bot); targetCount=count; steps=0; failures=0; started=0; lastResult='New task';automatic=false;
}
function statusText() { return `${Math.max(0,logCount(bot)-baseline)}/${targetCount} additional oak logs. ${automatic||busy?'Working.':'Idle.'} ${lastResult}`; }

function halt(reason: string) {
  automatic=false; chatGate.cancel(); controller?.abort(); stop(bot); lastResult=reason;
  if(chatTask) { reply(reason); chatTask=false; }
  console.log(reason); record({type:'halt',reason});
}
const rl=createInterface({input:process.stdin,output:process.stdout});
async function step() {
  if (busy || !ready) return;
  if (logCount(bot)-baseline>=targetCount) { halt(`Complete: collected ${targetCount} additional oak log(s).`); return; }
  if (steps>=Math.max(30,targetCount*5) || (started && Date.now()-started>Math.min(600_000,120_000+targetCount*10_000)) || failures>=3) { halt('Run limit reached. Use reset for a new task.'); return; }
  if (!started) started=Date.now();
  busy=true; const run=new AbortController(); controller=run;
  try {
    const state=observe(bot,baseline,lastResult,targetCount);
    if (state.health<10 || bot.inventory.emptySlotCount()===0) throw new Error('Low health or full inventory');
    const decision=await choose(state,run.signal);
    run.signal.throwIfAborted();
    console.log(`Jev chose ${decision.action.id} (confidence ${decision.response.answers.next_action.confidence})`);
    record({type:'decision',...decision});
    const signal=AbortSignal.any([run.signal,AbortSignal.timeout(15_000)]);
    await execute(bot,decision.action,signal);
    run.signal.throwIfAborted();
    steps++; failures=0; lastResult=`Completed ${decision.action.id}`;
    record({type:'result',lastResult,state:observe(bot,baseline,lastResult,targetCount)});
  } catch(error) {
    stop(bot); automatic=false; failures++;
    lastResult=error instanceof Error ? error.message : String(error);
    if(chatTask && !run.signal.aborted) reply(`Paused: ${lastResult}. Ask me to stop, then try a new request.`);
    console.error(lastResult); record({type:'error',message:lastResult});
  } finally { busy=false; controller=undefined; }
  if (ready && logCount(bot)-baseline>=targetCount) halt(`Complete: collected ${targetCount} additional oak log(s).`);
}
bot.on('spawn',()=>{ready=true; baseline=logCount(bot); steps=0; failures=0; started=0; console.log('Ready. Enter = one Jev-selected action; auto = continuous; stop; status; reset; quit.');});
bot.on('chat',(username,message)=>{
  if(username===bot.username || !ready) return;
  const text=addressed(message);
  if(!text) return;
  // These explicit controls work even when Jev is unavailable or interpreting.
  if(/^(stop|cancel|pause)[.!]?$/i.test(text)) { const notified=chatTask;halt('Stopped by player.');if(!notified) reply('Stopped.');return; }
  if(/^status[?!]?$/i.test(text)) { reply(statusText()); return; }
  if(text.length>300) {reply('Please keep requests under 300 characters.');return;}
  const pending=chatGate.begin();
  if(!pending) {reply('Still interpreting a request. Say "jev stop" to cancel.');return;}
  void (async()=>{
    try {
      const result=await interpret(text,pending.signal);pending.signal.throwIfAborted();
      record({type:'chat',username,text,...result});
      const request=result.request;
      if(request.intent==='stop') {const notified=chatTask;halt('Stopped by player.');if(!notified) reply('Stopped.');}
      else if(request.intent==='status') reply(statusText());
      else if(request.intent==='unsupported') reply('I can gather 1-64 nearby oak logs, report progress, or stop. Try: Jev, get me four oak logs.');
      else if(busy||automatic) reply('I am busy. Say "jev stop" before starting another collection.');
      else {
        newTask(request.count); chatTask=true;
        if(!observe(bot,baseline,lastResult,targetCount).actions.some(a=>a.kind!=='wait')) {
          reply('No oak logs or oak-log drops within 12 blocks. Place some nearby and ask again.');chatTask=false;return;
        }
        reply(`Collecting ${request.count} additional oak log(s). Say "jev stop" to cancel.`);
        automatic=true;void step();
      }
    } catch(error) {if(!pending.signal.aborted) reply(`Could not interpret request: ${error instanceof Error?error.message:String(error)}. No new task started.`);}
    finally {chatGate.finish(pending);}
  })();
});
bot.on('death',()=>{ready=false;halt('Bot died; task cancelled.');});
bot.on('end',()=>{ready=false;halt('Disconnected. Restart the process to reconnect.');rl.close();clearInterval(timer);});
bot.on('kicked',reason=>{halt('Kicked by server');console.error(reason);});
bot.on('error',error=>{halt(error.message);});
bot.on('health',()=>{if(ready && bot.health<10) halt('Low health; stopped.');});
rl.on('line',line=>{
  const command=line.trim();
  if(command==='quit') { halt('Exiting');bot.quit();rl.close();clearInterval(timer); }
  else if(command==='stop') halt('Stopped by operator');
  else if(command==='status') console.log({ready,busy,automatic,steps,failures,lastResult,logfile});
  else if(command==='reset' && !busy && ready) {chatGate.cancel();chatTask=false;newTask();}
  else if(command==='auto' && ready && !busy) {automatic=true;void step();}
  else if(command==='' && !automatic) void step();
  else console.log('Commands: Enter, auto, stop, status, reset, quit');
});
const timer=setInterval(()=>{if(automatic) void step();},1000);
process.on('SIGINT',()=>{halt('Interrupted');bot.quit();rl.close();clearInterval(timer);});
