import type { Action, Observation } from './core.js';
import {constrainDrops,remainingDrops} from './drop-policy.js';
import type { Audit } from './audit.js';
export interface Adapter {
  observe():Observation;
  execute(action:Action,signal:AbortSignal):Promise<void>;
  stop():void;
}
export type Decide=(state:Observation,signal:AbortSignal,audit:Audit)=>Promise<Action>;
export type Task={text:string;requester:string};
export class Reactor {
  busy=false;
  automatic=false;
  status='idle';
  history:{actionId:string;result:string}[]=[];
  private controller?:AbortController;
  private started=Date.now();
  private steps=0;
  private repetitions:string[]=[];
  private initialInventory:Record<string,number>;
  private lastObservation:Observation;
  constructor(readonly task:Task,private adapter:Adapter,private decide:Decide,readonly audit:Audit,private notify:(message:string)=>void=()=>{},private limits={steps:120,timeMs:300000,actionMs:15000}) {
    this.lastObservation=adapter.observe();
    this.initialInventory=this.lastObservation.inventory;
    audit('task.start',{task,initialInventory:this.initialInventory,limits});
  }
  snapshot() {
    this.lastObservation=this.adapter.observe();
    return constrainDrops(this.task.text,{...this.lastObservation,objective:this.task.text,requester:this.task.requester,initialInventory:this.initialInventory,history:this.history.slice(-12),lastResult:this.history.at(-1)?.result??'No actions yet'});
  }
  private safeObserve() {try {this.lastObservation=this.adapter.observe();} catch {} return this.lastObservation;}
  cancel(reason='Stopped by operator') {
    if(this.status==='interrupted')return;
    this.automatic=false;this.status='interrupted';this.controller?.abort();this.adapter.stop();
    this.audit('task.interrupted',{message:reason});this.notify(reason);
  }
  private finish(status:string,message:string) {
    this.status=status;this.automatic=false;this.adapter.stop();this.audit(`task.${status}`,{message});this.notify(message);
  }
  async step() {
    if(['interrupted','complete','blocked','clarification'].includes(this.status)) {this.automatic=false;return;}
    if(this.busy)return;
    if(this.steps>=this.limits.steps||Date.now()-this.started>=this.limits.timeMs) {this.finish('blocked','Run budget reached. Start a new task to continue.');return;}
    this.busy=true;this.status='running';const c=new AbortController();this.controller=c;
    let action:Action|undefined; let heartbeat:ReturnType<typeof setInterval>|undefined;
    let onAbort:(()=>void)|undefined;
    try {
      const state=this.snapshot();this.audit('observation',{step:this.steps,state});
      if(state.health<10) throw new Error('Health below 10');
      action=await this.decide(state,c.signal,this.audit);c.signal.throwIfAborted();
      if(!state.actions.some(a=>a.id===action!.id)) throw new Error('Unknown action selected');
      // Execute the original candidate, never arbitrary fields supplied by a model.
      action=state.actions.find(a=>a.id===action!.id)!;
      this.audit('decision',{actionId:action.id,action});
      if(action.kind==='complete') {
        const remaining=remainingDrops(this.task.text,this.snapshot());
        if(remaining!==null&&remaining>0)throw new Error(`Completion rejected: ${remaining} requested items remain in inventory`);
        this.finish('complete',remaining===0?'Verified: none of the requested items remain in inventory.':'Model reports task complete; inspect the trace to verify the outcome.');return;
      }
      if(action.kind==='blocked') {this.finish('blocked','Blocked: no available action can make useful progress. See trace for state and choices.');return;}
      if(action.kind==='clarify') {this.finish('clarification',action.description);return;}
      const signature=JSON.stringify({action:action.id,position:Object.values(state.position).map(v=>Math.round(v*2)/2),inventory:state.inventory});
      this.repetitions.push(signature);
      if(this.repetitions.filter(x=>x===signature).length>=3) {this.finish('blocked','Repeated action with unchanged state detected; stopped.');return;}
      this.repetitions=this.repetitions.slice(-12);
      const signal=AbortSignal.any([c.signal,AbortSignal.timeout(this.limits.actionMs)]);
      const began=Date.now();this.audit('action.start',{actionId:action.id,action});
      heartbeat=setInterval(()=>this.audit('action.progress',{actionId:action!.id,elapsedMs:Date.now()-began,state:this.safeObserve()}),1000);
      const aborted=new Promise<never>((_,reject)=>{onAbort=()=>{this.adapter.stop();reject(new Error('Action interrupted or timed out'));};signal.addEventListener('abort',onAbort,{once:true});});
      try {await Promise.race([this.adapter.execute(action,signal),aborted]);}
      finally {if(onAbort) signal.removeEventListener('abort',onAbort);}
      c.signal.throwIfAborted();
      this.history.push({actionId:action.id,result:'Succeeded'});this.steps++;
      this.audit('action.result',{actionId:action.id,outcome:'succeeded',elapsedMs:Date.now()-began,state:this.snapshot()});
      this.status='idle';
    } catch(error) {
      const message=error instanceof Error?error.message:String(error);
      this.adapter.stop();this.automatic=false;
      if(!c.signal.aborted) this.status='paused';
      if(action) this.history.push({actionId:action.id,result:message});
      this.steps++;
      this.audit(action?'action.result':'step.error',{actionId:action?.id,outcome:c.signal.aborted?'interrupted':'failed',message,state:this.safeObserve()});
      if(!c.signal.aborted)this.notify(`Paused: ${message}. Inspect trace; use auto or Enter to retry, or stop.`);
    } finally {if(heartbeat)clearInterval(heartbeat);this.busy=false;this.controller=undefined;}
  }
}
