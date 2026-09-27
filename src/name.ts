import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
export function validName(name: string) { return /^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(name); }
export function renameRequest(text: string): string | null {
  const match=/^(?:rename(?: yourself)?(?: to)?|call yourself|your name is(?: now)?|you are now|you're now)\s+(.+?)\s*[.!]?$/i.exec(text);
  return match ? match[1]!.trim() : null;
}
export class BotName {
  value: string;
  constructor(fallback: string, private path: string) {
    const saved=existsSync(path) ? JSON.parse(readFileSync(path,'utf8')).name : fallback;
    if(typeof saved!=='string'||!validName(saved)) throw new Error('Bot chat name must be 1-16 letters, digits or underscores, starting with a letter');
    this.value=saved;
  }
  rename(name:string) {
    if(!validName(name)) throw new Error('Use 1-16 letters, digits or underscores, starting with a letter.');
    mkdirSync(dirname(this.path),{recursive:true});
    writeFileSync(this.path+'.tmp',JSON.stringify({name})+'\n');
    renameSync(this.path+'.tmp',this.path);
    this.value=name;
  }
}
