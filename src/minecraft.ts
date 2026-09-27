import mineflayer from 'mineflayer';
import pathfinderModule from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import type { Action, Observation } from './core.js';
const { pathfinder, Movements, goals } = pathfinderModule;
export function connect() {
  const auth = process.env.MC_AUTH ?? 'offline';
  if (auth !== 'offline' && auth !== 'microsoft') throw new Error('MC_AUTH must be offline or microsoft');
  const bot = mineflayer.createBot({ host: process.env.MC_HOST ?? '127.0.0.1',
    port: Number(process.env.MC_PORT ?? 25565), username: process.env.MC_USERNAME ?? 'JevCraft',
    version: process.env.MC_VERSION ?? '1.21.4', auth, profilesFolder: '.auth' });
  bot.loadPlugin(pathfinder);
  bot.on('spawn', () => {
    const moves = new Movements(bot);
    moves.canDig = false;
    moves.allow1by1towers = false;
    moves.allowParkour = false;
    moves.scafoldingBlocks = [];
    bot.pathfinder.setMovements(moves);
  });
  return bot;
}
export type Bot = ReturnType<typeof connect>;
export function logCount(bot: Bot) { return bot.inventory.items().filter(i => i.name === 'oak_log').reduce((n,i) => n+i.count,0); }
export function observe(bot: Bot, baseline: number, lastResult: string): Observation {
  const actions: Action[] = [
    { id: 'wait', kind: 'wait', description: 'Wait briefly for the world or drops to update' },
    { id: 'wait_longer', kind: 'wait', description: 'Wait briefly if no useful target is available' },
  ];
  for (const p of bot.findBlocks({ matching: b => b.name === 'oak_log', maxDistance: 12, count: 8 })) {
    const block = bot.blockAt(p);
    if (!block) continue;
    const kind = bot.canDigBlock(block) && bot.canSeeBlock(block) ? 'mine' : 'move';
    actions.push({ id: `${kind}_${p.x}_${p.y}_${p.z}`, kind, target: { x:p.x,y:p.y,z:p.z },
      description: `${kind === 'mine' ? 'Mine' : 'Approach'} observed oak log at ${p}` });
  }
  for (const entity of Object.values(bot.entities)) {
    if (entity.name !== 'item' || entity.position.distanceTo(bot.entity.position) > 12) continue;
    if (entity.getDroppedItem()?.name !== 'oak_log') continue;
    actions.push({ id: `collect_${entity.id}`, kind:'collect', entityId:entity.id,
      target:{x:entity.position.x,y:entity.position.y,z:entity.position.z}, description:`Pick up oak-log drop ${entity.id}` });
  }
  return { objective: 'Collect one additional oak log, then stop', position: { x:bot.entity.position.x,y:bot.entity.position.y,z:bot.entity.position.z },
    health:bot.health, inventory:Object.fromEntries(bot.inventory.items().map(i => [i.name, bot.inventory.items().filter(j=>j.name===i.name).reduce((n,j)=>n+j.count,0)])),
    gainedLogs:logCount(bot)-baseline, lastResult, actions };
}
export function stop(bot: Bot) {
  bot.pathfinder.setGoal(null);
  bot.stopDigging();
  bot.clearControlStates();
}
async function perform(bot: Bot, action: Action, signal: AbortSignal) {
  signal.throwIfAborted();
  const abort = () => stop(bot);
  signal.addEventListener('abort', abort, { once:true });
  try {
    if (action.kind === 'wait') { await new Promise(r=>setTimeout(r,500)); return; }
    if (!action.target) throw new Error('Missing target');
    let p = new Vec3(action.target.x,action.target.y,action.target.z);
    if (p.distanceTo(bot.entity.position)>16) throw new Error('Target too far away');
    if (action.kind === 'collect') {
      const entity = bot.entities[action.entityId!];
      if (!entity || entity.getDroppedItem()?.name !== 'oak_log') throw new Error('Drop no longer exists');
      p = entity.position.clone();
      const before = logCount(bot);
      await bot.pathfinder.goto(new goals.GoalNear(p.x,p.y,p.z,0));
      await new Promise(r=>setTimeout(r,700));
      if (logCount(bot)<=before) throw new Error('No inventory pickup observed');
    } else {
      const block = bot.blockAt(p);
      if (!block || block.name !== 'oak_log') throw new Error('Target changed');
      if (action.kind === 'move') await bot.pathfinder.goto(new goals.GoalNear(p.x,p.y,p.z,2));
      else {
        if (!bot.canDigBlock(block) || !bot.canSeeBlock(block)) throw new Error('Block not reachable');
        await bot.dig(block);
      }
    }
    signal.throwIfAborted();
  } finally { signal.removeEventListener('abort',abort); }
}

// Some game operations do not settle immediately after disconnect or cancellation.
// Release the runner promptly; stop() clears all controls before it can run again.
export async function execute(bot: Bot, action: Action, signal: AbortSignal) {
  signal.throwIfAborted();
  let rejectAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    rejectAbort = () => { stop(bot); reject(new Error('Action cancelled or timed out')); };
    signal.addEventListener('abort', rejectAbort, { once: true });
  });
  try { await Promise.race([perform(bot, action, signal), cancelled]); }
  finally { if (rejectAbort) signal.removeEventListener('abort', rejectAbort); }
}
