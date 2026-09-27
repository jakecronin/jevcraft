import {Vec3} from 'vec3';
export type Cell={name:string;boundingBox:string}|null;
const directions=[[1,0],[-1,0],[0,1],[0,-1]];
export function preservesExit(feet:Vec3,target:Vec3,blockAt:(p:Vec3)=>Cell):boolean {
 const base=feet.floored();
 // Never place into the bot's own feet/head cells.
 if(target.x===base.x&&target.z===base.z&&target.y>=base.y&&target.y<=base.y+1)return false;
 // Only local foot/head placements can remove a flat walkable exit.
 if(target.y<base.y||target.y>base.y+1)return true;
 return directions.some(([dx,dz])=>{
  const p=base.offset(dx,0,dz),head=p.offset(0,1,0);
  if(target.equals(p)||target.equals(head))return false;
  return blockAt(p)?.boundingBox==='empty'&&blockAt(head)?.boundingBox==='empty'&&blockAt(p.offset(0,-1,0))?.boundingBox==='block';
 });
}
export function placementSites(feet:Vec3,blockAt:(p:Vec3)=>Cell) {
 const sites:{target:Vec3;support:Vec3;height:number}[]=[];
 for(const [dx,dz] of directions)for(let height=1;height<=4;height++) {
  const target=feet.floored().offset(dx,height-1,dz),support=target.offset(0,-1,0);
  if(blockAt(target)?.name==='air'&&blockAt(support)?.boundingBox==='block'&&preservesExit(feet,target,blockAt))sites.push({target,support,height});
 }
 return sites;
}
