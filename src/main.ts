import { createInterface } from 'node:readline';
import { mkdirSync, appendFileSync } from 'node:fs';
import { choose } from './core.js';
import { connect, execute, logCount, observe, stop } from './minecraft.js';
const bot = connect();
mkdirSync('logs',{recursive:true});
const logfile = `logs/${new Date().toISOString().replaceAll(':','-')}.jsonl`;
const record = (event: unknown) => appendFileSync(logfile,JSON.stringify({time:new Date().toISOString(),event})+'\n');
let ready=false, busy=false, automatic=false, baseline=0, steps=0, failures=0, lastResult='None';
let controller: AbortController | undefined;
let started=0;
function halt(reason: string) {
  automatic=false; controller?.abort(); stop(bot); lastResult=reason;
  console.log(reason); record({type:'halt',reason});
}
const rl=createInterface({input:process.stdin,output:process.stdout});
async function step() {
  if (busy || !ready) return;
  if (logCount(bot)>baseline) { halt('Complete: collected an additional oak log.'); return; }
  if (steps>=30 || (started && Date.now()-started>120_000) || failures>=3) { halt('Run limit reached. Use reset for a new task.'); return; }
  if (!started) started=Date.now();
  busy=true; const run=new AbortController(); controller=run;
  try {
    const state=observe(bot,baseline,lastResult);
    if (state.health<10 || bot.inventory.emptySlotCount()===0) throw new Error('Low health or full inventory');
    const decision=await choose(state,run.signal);
    run.signal.throwIfAborted();
    console.log(`Jev chose ${decision.action.id} (confidence ${decision.response.answers.next_action.confidence})`);
    record({type:'decision',...decision});
    const signal=AbortSignal.any([run.signal,AbortSignal.timeout(15_000)]);
    await execute(bot,decision.action,signal);
    run.signal.throwIfAborted();
    steps++; failures=0; lastResult=`Completed ${decision.action.id}`;
    record({type:'result',lastResult,state:observe(bot,baseline,lastResult)});
  } catch(error) {
    stop(bot); automatic=false; failures++;
    lastResult=error instanceof Error ? error.message : String(error);
    console.error(lastResult); record({type:'error',message:lastResult});
  } finally { busy=false; controller=undefined; }
  if (ready && logCount(bot)>baseline) halt('Complete: collected an additional oak log.');
}
bot.on('spawn',()=>{ready=true; baseline=logCount(bot); steps=0; failures=0; started=0; console.log('Ready. Enter = one Jev-selected action; auto = continuous; stop; status; reset; quit.');});
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
  else if(command==='reset' && !busy && ready) {baseline=logCount(bot);steps=0;failures=0;started=0;lastResult='New task';automatic=false;}
  else if(command==='auto' && ready && !busy) {automatic=true;void step();}
  else if(command==='' && !automatic) void step();
  else console.log('Commands: Enter, auto, stop, status, reset, quit');
});
const timer=setInterval(()=>{if(automatic) void step();},1000);
process.on('SIGINT',()=>{halt('Interrupted');bot.quit();rl.close();clearInterval(timer);});
