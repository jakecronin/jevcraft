import type {Observation} from './core.js';
// This narrow mechanical constraint handles explicit inventory-disposal requests.
// Ambiguous/quantified requests still use Jev, with drop and place clearly distinguished.
export function dropScope(task:string):'all'|'logs'|'blocks'|null {
 if(!/^(?:please\s+)?(?:drop|toss|throw(?:\s+away)?|dump)\b/i.test(task.trim()))return null;
 if(/\b(?:log|logs)\b/i.test(task))return 'logs';
 if(/\bblocks\b/i.test(task))return 'blocks';
 if(/\b(?:inventory|items|everything)\b/i.test(task))return 'all';
 return null;
}
export function remainingDrops(task:string,state:Observation):number|null {
 const scope=dropScope(task);if(!scope)return null;
 const blockNames=(state.world as {inventoryBlockNames?:string[]})?.inventoryBlockNames??[];
 return Object.entries(state.inventory).filter(([name])=>scope==='all'||(scope==='logs'?name.endsWith('_log'):blockNames.includes(name))).reduce((sum,[,n])=>sum+n,0);
}
export function constrainDrops(task:string,state:Observation):Observation {
 const scope=dropScope(task);if(!scope)return state;
 if(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i.test(task))return {...state,actions:[
  {id:'clarify_drop_amount',kind:'clarify',description:'I can currently toss whole stacks only. Please say drop all your logs, blocks, or inventory.'},
  {id:'blocked',kind:'blocked',description:'Exact partial-stack dropping is not implemented'},
 ]};
 const blockNames=(state.world as {inventoryBlockNames?:string[]})?.inventoryBlockNames??[];
 const remaining=remainingDrops(task,state)!;
 return {...state,actions:state.actions.filter(a=>{
  if(a.kind==='drop')return scope==='all'||(scope==='logs'?a.itemName?.endsWith('_log'):blockNames.includes(a.itemName??''));
  if(a.kind==='complete')return remaining===0;
  return ['wait','blocked','clarify'].includes(a.kind);
 })};
}
