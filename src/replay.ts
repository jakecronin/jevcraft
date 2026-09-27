import { readFileSync } from 'node:fs';
import { choose, observationSchema, parseDecision } from './core.js';
const state = observationSchema.parse(JSON.parse(readFileSync(process.argv.find(a=>a.endsWith('.json')) ?? 'fixtures/near-log.json','utf8')));
const decision = process.argv.includes('--live') ? await choose(state,new AbortController().signal) : parseDecision({ model:'recorded-fixture-not-live-jev', answers:{ next_action:{type:'choice',choice:'mine_1_64_0',confidence:0.9,probabilities:{mine_1_64_0:0.9,wait:0.1}} } },state);
console.log(JSON.stringify(decision,null,2));
