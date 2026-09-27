import {inventoryReport} from './inventory-report.js';
import { Vec3 } from 'vec3';
import pf from 'mineflayer-pathfinder';
import type { Action, Observation } from './core.js';
import type { Bot } from './minecraft.js';
import {placementSites,preservesExit} from './placement.js';
import { stop } from './minecraft.js';
const vec=(p:{x:number;y:number;z:number})=>new Vec3(p.x,p.y,p.z);
const point=(p:Vec3)=>({x:p.x,y:p.y,z:p.z});
export function inventory(bot:Bot) {
  const items:Record<string,number>={};
  for(const item of bot.inventory.items()) items[item.name]=(items[item.name]??0)+item.count;
  return items;
}
export function worldAdapter(bot:Bot, getName:()=>string=()=>bot.username, report:(message:string)=>void=()=>{}) {
  let chestMemory: {position:{x:number;y:number;z:number};items:Record<string,number>;observedAt:string}|undefined;
  function observe():Observation {
    const actions:Action[]=[
      {id:'inventory',kind:'inventory',description:'Print a complete counted inventory report to chat'},
      {id:'wait',kind:'wait',description:'Wait briefly for world updates'},
      {id:'complete',kind:'complete',description:'Declare task complete only if its outcome has been observed'},
      {id:'blocked',kind:'blocked',description:'Report that no available action can accomplish the task'},
      {id:'clarify_target',kind:'clarify',description:'Which target or location do you mean? Please restate the task with a specific target.'},
      {id:'clarify_quantity',kind:'clarify',description:'How many items do you want? Please restate the task with a quantity.'},
    ];
    const inv=inventory(bot);const pos=bot.entity.position;
    // Nearby meaningful blocks. Exclude terrain from this first candidate set to keep it bounded.
    const positions=bot.findBlocks({matching:b=>b.name.endsWith('_log')||b.name.endsWith('_ore')||b.name==='chest'||b.name==='crafting_table',maxDistance:12,count:24});
    const blocks=[];
    for(const p of positions) {
      const b=bot.blockAt(p);if(!b)continue;
      blocks.push({name:b.name,position:point(p)});
      const suffix=`${p.x}_${p.y}_${p.z}`;
      if(pos.distanceTo(p)>3) actions.push({id:`move_${suffix}`,kind:'move',target:point(p),blockName:b.name,description:`Approach ${b.name} at ${p}`});
      else if(b.name==='chest') {
        actions.push({id:`inspect_${suffix}`,kind:'inspect',target:point(p),blockName:b.name,description:`Inspect chest inventory at ${p}`});
        for(const [name,count] of Object.entries(inv).slice(0,12)) actions.push({id:`deposit_${suffix}_${name}`,kind:'deposit',target:point(p),blockName:b.name,itemName:name,count,description:`Deposit all ${count} carried ${name} into chest at ${p}`});
      } else if(bot.canDigBlock(b)&&bot.canSeeBlock(b)&&b.canHarvest(bot.heldItem?.type??null)) actions.push({id:`mine_${suffix}`,kind:'mine',target:point(p),blockName:b.name,description:`Mine reachable ${b.name} at ${p} with current hand/tool`});
    }
    const players=Object.values(bot.players).filter(p=>p.entity&&p.username!==bot.username).slice(0,8).map(p=>({name:p.username,position:point(p.entity!.position)}));
    for(const p of players) actions.push({id:`approach_${p.name}`,kind:'move',target:p.position,description:`Approach player ${p.name} at ${JSON.stringify(p.position)}`});
    for(const e of Object.values(bot.entities).filter(e=>e.name==='item'&&e.position.distanceTo(pos)<=12).slice(0,12)) {
      const item=e.getDroppedItem();if(!item)continue;
      actions.push({id:`collect_${e.id}`,kind:'collect',target:point(e.position),entityId:e.id,itemName:item.name,description:`Collect nearby dropped ${item.name} (entity ${e.id})`});
    }
    for(const item of bot.inventory.items()) actions.push({id:`drop_${item.slot}_${item.name}`,kind:'drop',itemName:item.name,itemSlot:item.slot,count:item.count,description:`Toss the entire stack of ${item.count} ${item.name} from slot ${item.slot} as loose items onto the ground. Does NOT place blocks.`});
    for(const name of Object.keys(inv).slice(0,16)) actions.push({id:`equip_${name}`,kind:'equip',itemName:name,description:`Equip ${name} in hand`});
    const held=bot.heldItem;
    const sites=placementSites(pos,p=>bot.blockAt(p));
    if(held&&bot.registry.blocksByName[held.name]) {
      for(const {target,support,height} of sites) {
        const ref=bot.blockAt(support);
        if(ref&&bot.canSeeBlock(ref)&&pos.offset(0,1.62,0).distanceTo(support.offset(.5,1,.5))<=4.5)
          actions.push({id:`place_${target.x}_${target.y}_${target.z}`,kind:'place',target:point(target),reference:point(support),itemName:held.name,description:`Place one held ${held.name} at ${target}: ${height===1?'start a column on the ground':`extend this vertical column to height ${height} above current ground`}. This creates a solid block, NOT a dropped item.`});
      }
    }
    return {objective:'',position:point(pos),health:bot.health,inventory:inv,gainedLogs:0,lastResult:'',world:{botName:getName(),yaw:bot.entity.yaw,dimension:bot.game.dimension,blocks,players,heldItem:held?.name??null,inventoryBlockNames:Object.keys(inv).filter(name=>!!bot.registry.blocksByName[name]),placementSites:sites.map(s=>({position:point(s.target),height:s.height})),chestMemory:chestMemory??null,capabilities:'Bounded nearby movement, harvestable logs/ores, dropped items, equip, adjacent placement and reachable vertical column extensions up to four blocks above current feet, toss inventory stacks as loose items, inspect chest, deposit all of an item. No crafting, withdrawal, building blueprint, long-range exploration or autonomous mine construction.'},actions:actions.slice(0,240)};
  }
  async function execute(a:Action,signal:AbortSignal) {
    signal.throwIfAborted();
    const abort=()=>stop(bot);signal.addEventListener('abort',abort,{once:true});
    try {
      if(a.kind==='inventory') {for(const line of inventoryReport(inventory(bot)))report(line);return;}
      if(a.kind==='wait') {await new Promise(r=>setTimeout(r,500));signal.throwIfAborted();return;}
      if(a.kind==='equip') {
        const item=bot.inventory.items().find(i=>i.name===a.itemName);if(!item)throw new Error('Item no longer in inventory');
        await bot.equip(item,'hand');signal.throwIfAborted();if(bot.heldItem?.name!==a.itemName)throw new Error('Equip not confirmed');return;
      }
      if(a.kind==='drop') {
        const item=bot.inventory.items().find(i=>i.slot===a.itemSlot);
        if(!item||item.name!==a.itemName||item.count!==a.count)throw new Error('Stack changed since decision; reobserve before tossing');
        const before=inventory(bot)[item.name]??0;const amount=item.count;
        await bot.tossStack(item);signal.throwIfAborted();
        await new Promise(r=>setTimeout(r,300));signal.throwIfAborted();
        if((inventory(bot)[item.name]??0)>before-amount)throw new Error('Drop not confirmed or items were picked back up');
        return;
      }
      if(!a.target)throw new Error('Missing target');
      const p=vec(a.target);
      if(p.distanceTo(bot.entity.position)>96)throw new Error('Target outside local execution range');
      if(a.kind==='move') {
        await bot.pathfinder.goto(a.exact?new pf.goals.GoalBlock(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z)):new pf.goals.GoalNear(p.x,p.y,p.z,2));signal.throwIfAborted();
        if(bot.entity.position.distanceTo(p)>(a.exact?1.5:4))throw new Error('Movement did not reach target');return;
      }
      if(a.kind==='collect') {
        const e=bot.entities[a.entityId!];if(!e||e.getDroppedItem()?.name!==a.itemName)throw new Error('Drop changed or disappeared');
        const before=inventory(bot)[a.itemName!]??0;
        await bot.pathfinder.goto(new pf.goals.GoalNear(e.position.x,e.position.y,e.position.z,0));signal.throwIfAborted();
        await new Promise(r=>setTimeout(r,700));signal.throwIfAborted();
        if((inventory(bot)[a.itemName!]??0)<=before)throw new Error('Pickup not confirmed');return;
      }
      if(a.kind==='place') {
        if(!a.reference||bot.heldItem?.name!==a.itemName)throw new Error('Held block changed');
        const support=bot.blockAt(vec(a.reference));
        if(!support||support.boundingBox!=='block'||bot.blockAt(p)?.name!=='air')throw new Error('Placement site changed');
        if(bot.entity.position.offset(0,1.62,0).distanceTo(support.position.offset(.5,1,.5))>4.5)throw new Error('Placement out of reach');
        if(!preservesExit(bot.entity.position,p,p=>bot.blockAt(p)))throw new Error('Placement would block the last walkable exit');
        await bot.placeBlock(support,new Vec3(0,1,0));signal.throwIfAborted();
        if(bot.blockAt(p)?.name!==a.itemName)throw new Error('Placement not confirmed');return;
      }
      const b=bot.blockAt(p);if(!b||b.name!==a.blockName)throw new Error('Block changed');
      if(a.kind==='mine') {
        if(!bot.canDigBlock(b)||!bot.canSeeBlock(b)||!b.canHarvest(bot.heldItem?.type??null))throw new Error('Block not harvestable/reachable');
        await bot.dig(b);signal.throwIfAborted();if(bot.blockAt(p)?.name===b.name)throw new Error('Mining not confirmed');return;
      }
      if(a.kind==='inspect'||a.kind==='deposit') {
        if(p.distanceTo(bot.entity.position)>4||b.name!=='chest')throw new Error('Chest not reachable');
        const chest=await bot.openChest(b);
        try {
          signal.throwIfAborted();
          if(a.kind==='deposit') {
            const item=bot.inventory.items().find(i=>i.name===a.itemName);if(!item)throw new Error('Item no longer carried');
            const before=inventory(bot)[a.itemName!]??0;const amount=Math.min(a.count??0,before);
            if(amount<=0)throw new Error('No items to deposit');
            await chest.deposit(item.type,null,amount);signal.throwIfAborted();
            if((inventory(bot)[a.itemName!]??0)>before-amount)throw new Error('Deposit not confirmed');
          }
          const items:Record<string,number>={};for(const i of chest.containerItems())items[i.name]=(items[i.name]??0)+i.count;
          chestMemory={position:point(p),items,observedAt:new Date().toISOString()};
        } finally {chest.close();}
        return;
      }
      throw new Error('Unsupported executor action');
    } finally {signal.removeEventListener('abort',abort);}
  }
  let inFlight=false;
  async function serialExecute(action:Action,signal:AbortSignal) {
    if(inFlight)throw new Error('Previous action still settling after cancellation');
    inFlight=true;try{await execute(action,signal);}finally{inFlight=false;}
  }
  return {observe,execute:serialExecute,stop:()=>{stop(bot);if(bot.currentWindow)bot.closeWindow(bot.currentWindow);}};
}
