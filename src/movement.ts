import type {Action} from './core.js';
type Point={x:number;y:number;z:number};
const words:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,fifteen:15,twenty:20,thirty:30};
export function relativeRoute(text:string,origin:Point,yaw:number):Action[]|null {
 if(!/\b(?:walk|move|step|go)\b/i.test(text)||!/(forward|back|left|right)/i.test(text))return null;
 const clean=text.toLowerCase().replace(/[.!?]/g,'').replace(/\bplease\b/g,'').trim();
 const segments=clean.split(/\s*(?:,|\band then\b|\bthen\b|\band\b)\s*/).filter(Boolean);
 const route:Action[]=[];let p={...origin};
 for(const segment of segments) {
  const match=/^(?:(?:walk|move|step|go)\s+)?(?:(\d+|[a-z]+)\s+(?:blocks?\s+)?)?(?:to\s+the\s+)?(forward(?:s)?|back(?:ward(?:s)?)?|left|right)(?:\s+(\d+|[a-z]+)(?:\s+blocks?)?)?$/.exec(segment.trim());
  if(!match)return null;
  const raw=match[1]??match[3];const n=raw?(words[raw]??Number(raw)):1;
  if(!Number.isInteger(n)||n<1||n>64||segments.length>8)return null;
  const direction=match[2];let dx=-Math.sin(yaw),dz=-Math.cos(yaw);
  if(direction.startsWith('back')){dx=-dx;dz=-dz;}
  else if(direction==='right'){dx=Math.cos(yaw);dz=-Math.sin(yaw);}
  else if(direction==='left'){dx=-Math.cos(yaw);dz=Math.sin(yaw);}
  p={x:p.x+dx*n,y:p.y,z:p.z+dz*n};
  route.push({id:`route_${route.length}`,kind:'move',target:{...p},exact:true,description:`Leg ${route.length+1}/${segments.length}: move ${n} blocks ${direction} relative to the facing direction at task start. Reach ${JSON.stringify(p)} before the next leg.`});
 }
 return route;
}
export function reached(current:Point,target:Point) {return Math.hypot(current.x-target.x,current.z-target.z)<=1.1&&Math.abs(current.y-target.y)<=1;}
