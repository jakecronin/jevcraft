export function inventoryQuestion(text:string) {
 return /^(?:what(?:'s| is) in your inventory|what (?:are you carrying|do you have(?: in your inventory)?)|(?:show|print|explain|list)(?: me)?(?: your)? inventory|inventory)[?!.]?$/i.test(text.trim());
}
export function inventoryReport(items:Record<string,number>):string[] {
 const entries=Object.entries(items).filter(([,n])=>n>0).sort(([a],[b])=>a.localeCompare(b));
 if(!entries.length)return ['My inventory is empty.'];
 const lines=[`Inventory: ${entries.reduce((n,[,count])=>n+count,0)} items across ${entries.length} item types.`];
 let line='';for(const [name,count] of entries){const item=`${count} ${name.replaceAll('_',' ')}`;if(line.length+item.length>175){lines.push(line);line='';}line+=(line?', ':'')+item;}if(line)lines.push(line);
 return lines;
}
