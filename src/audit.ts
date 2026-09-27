import { appendFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
export type Audit = (type:string, data?:unknown)=>void;
export class Trace {
  readonly id=randomUUID();
  readonly path:string;
  private sequence=0;
  constructor(directory='logs', private output:(line:string)=>void=console.log) {
    mkdirSync(directory,{recursive:true});
    this.path=`${directory}/${new Date().toISOString().replaceAll(':','-')}-${this.id}.jsonl`;
  }
  emit:Audit=(type,data={})=>{
    const event={schemaVersion:1,runId:this.id,sequence:++this.sequence,time:new Date().toISOString(),type,data};
    appendFileSync(this.path,JSON.stringify(event)+'\n');
    const detail=data as Record<string,unknown>;
    this.output(`[${event.time.slice(11,19)} #${event.sequence}] ${type} ${detail.summary??detail.message??(detail.actionId ? `${detail.actionId}${detail.elapsedMs!==undefined?` (${detail.elapsedMs}ms)`:''}` : '')}`);
  };
}
