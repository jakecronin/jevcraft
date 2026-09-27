import {relativeRoute,reached} from './movement.js';
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
  private route:Action[]|null=null;
  private routeIndex=0;
  private consecutiveFailures=0;
  private blockedChoices=0;
  private nextAttempt=0;
  private cooldowns=new Map<string,number>();
  private repetitions:string[]=[];
  private initialInventory:Record<string,number>;
  private lastObservation:Observation;
  constructor(readonly task:Task,private adapter:Adapter,private decide:Decide,readonly audit:Audit,private notify:(message:string)=>void=()=>{},private limits={steps:positiveEnv('BOT_MAX_STEPS',600),timeMs:positiveEnv('BOT_RUN_MINUTES',20)*60000,actionMs:positiveEnv('BOT_ACTION_SECONDS',45)*1000}) {
    this.lastObservation=adapter.observe();
    this.initialInventory=this.lastObservation.inventory;
    this.route=relativeRoute(task.text,this.lastObservation.position,(this.lastObservation.world as {yaw?:number})?.yaw??0);
    audit('task.start',{task,initialInventory:this.initialInventory,limits,route:this.route});
  }
  snapshot() {
    this.lastObservation=this.adapter.observe();
    let state:Observation={...this.lastObservation,objective:this.task.text,requester:this.task.requester,initialInventory:this.initialInventory,history:this.history.slice(-20),lastResult:this.history.at(-1)?.result??'No actions yet'};
    if(this.route) {
      const next=this.route[this.routeIndex];
      state={...state,world:{...state.world as object,relativeMovement:{route:this.route,nextLeg:this.routeIndex,frame:'Facing direction at task start'}},actions:state.actions.filter(a=>['wait','blocked','clarify','inventory'].includes(a.kind)||(a.kind==='complete'&&!next))};
      if(next)state.actions.push(next);
    }
    state={...state,actions:state.actions.filter(a=>(this.cooldowns.get(a.id)??0)<=this.steps)};
    return constrainDrops(this.task.text,state);
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
    if(this.busy||Date.now()<this.nextAttempt)return;
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
        if(this.route&&this.routeIndex<this.route.length)throw new Error('Movement route not finished');
        const remaining=remainingDrops(this.task.text,this.snapshot());
        if(remaining!==null&&remaining>0)throw new Error(`Completion rejected: ${remaining} requested items remain in inventory`);
        this.finish('complete',this.route?'Verified: all requested movement legs completed.':remaining===0?'Verified: none of the requested items remain in inventory.':'Model reports task complete; inspect the trace to verify the outcome.');return;
      }
      if(action.kind==='blocked') {
        this.blockedChoices++;this.steps++;
        if(this.blockedChoices<3){this.history.push({actionId:action.id,result:'Reconsider: inspect current options for an intermediate step before declaring blocked.'});this.audit('recovery.reconsider',{attempt:this.blockedChoices,summary:'Rechecking available actions before giving up'});this.status='idle';this.nextAttempt=Date.now()+1000;return;}
        this.finish('blocked','Blocked after three checks of available actions. See trace for missing capabilities.');return;
      }
      if(action.kind==='clarify') {this.finish('clarification',action.description);return;}
      const signature=JSON.stringify({action:action.id,position:Object.values(state.position).map(v=>Math.round(v*2)/2),inventory:state.inventory});
      this.repetitions.push(signature);
      if(this.repetitions.filter(x=>x===signature).length>=3) {
        this.steps++;this.consecutiveFailures++;this.cooldowns.set(action.id,this.steps+3);
        this.history.push({actionId:action.id,result:'Repeated without progress; temporarily excluded. Choose another approach.'});
        this.audit('recovery.cooldown',{actionId:action.id,untilStep:this.steps+3});
        if(this.consecutiveFailures>=5)this.finish('blocked','Repeated lack of progress despite retries.');else this.status='idle';
        return;
      }
      this.repetitions=this.repetitions.slice(-12);
      const signal=AbortSignal.any([c.signal,AbortSignal.timeout(this.limits.actionMs)]);
      const began=Date.now();this.audit('action.start',{actionId:action.id,action});
      heartbeat=setInterval(()=>this.audit('action.progress',{actionId:action!.id,elapsedMs:Date.now()-began,state:this.safeObserve()}),1000);
      const aborted=new Promise<never>((_,reject)=>{onAbort=()=>{this.adapter.stop();reject(new Error('Action interrupted or timed out'));};signal.addEventListener('abort',onAbort,{once:true});});
      try {await Promise.race([this.adapter.execute(action,signal),aborted]);}
      finally {if(onAbort) signal.removeEventListener('abort',onAbort);}
      c.signal.throwIfAborted();
      if(this.route&&action.id===this.route[this.routeIndex]?.id) {
        if(!reached(this.adapter.observe().position,action.target!))throw new Error('Relative movement endpoint not reached');
        this.routeIndex++;
      }
      this.history.push({actionId:action.id,result:'Succeeded'});this.steps++;this.consecutiveFailures=0;this.blockedChoices=0;
      this.audit('action.result',{actionId:action.id,outcome:'succeeded',elapsedMs:Date.now()-began,state:this.snapshot()});
      this.status='idle';
    } catch(error) {
      const message=error instanceof Error?error.message:String(error);
      this.adapter.stop();
      this.consecutiveFailures++;
      const retry=!!action&&!c.signal.aborted&&this.consecutiveFailures<5;
      if(!retry)this.automatic=false;
      if(!c.signal.aborted) this.status='paused';
      if(action) this.history.push({actionId:action.id,result:message});
      this.steps++;
      this.audit(action?'action.result':'step.error',{actionId:action?.id,outcome:c.signal.aborted?'interrupted':'failed',message,state:this.safeObserve()});
      if(retry){
        this.status='idle';this.nextAttempt=Date.now()+2000;
        this.cooldowns.set(action!.id,this.steps+2);
        this.audit('recovery.retry',{actionId:action!.id,message,failures:this.consecutiveFailures});
        this.notify(`Action failed: ${message}. Reobserving and trying another approach. Say stop to interrupt.`);
      }else if(!c.signal.aborted)this.notify(`Paused: ${message}. Inspect trace; use auto or Enter to retry, or stop.`);
    } finally {if(heartbeat)clearInterval(heartbeat);this.busy=false;this.controller=undefined;}
  }
}

function positiveEnv(name:string,fallback:number){const n=Number(process.env[name]??fallback);return Number.isFinite(n)&&n>0?Math.floor(n):fallback;}
