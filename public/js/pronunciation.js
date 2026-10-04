// Spanish spelling is an approximation. CMUdict pronunciations are US English.
export const phones={AA:'a',AE:'a',AH:'a',AO:'o',AW:'au',AY:'ai',B:'b',CH:'ch',D:'d',DH:'d',EH:'e',ER:'er',EY:'ei',F:'f',G:'g',HH:'j',IH:'i',IY:'i',JH:'y',K:'k',L:'l',M:'m',N:'n',NG:'ng',OW:'ou',OY:'oi',P:'p',R:'r',S:'s',SH:'sh',T:'t',TH:'z',UH:'u',UW:'u',V:'v',W:'u',Y:'i',Z:'s',ZH:'sh'};
export function fromPhones(sequence){return sequence.split(/\s+/).map(phone=>{const stress=phone.endsWith('1');const sound=phones[phone.replace(/[012]$/,'')]||'';return stress?sound.replace(/[aeiou]/,v=>({a:'á',e:'é',i:'í',o:'ó',u:'ú'})[v]):sound;}).join('');}
const common={the:'da',a:'a',an:'an',of:'ov',to:'tu',and:'and',is:'is',was:'uaz',were:'uer',are:'ar',there:'der',their:'der',they:'dei',this:'dis',that:'dat',these:'dis',those:'dous',you:'yu',your:'yor',i:'ai',he:'ji',she:'shi',we:'ui',it:'it',my:'mai',his:'jis',her:'jer',our:'áuer',one:'uan',two:'tu',said:'sed',says:'ses',have:'jav',has:'jas',had:'jad',do:'du',does:'das',did:'did',not:'nat',no:'nou',for:'for',with:'uid',be:'bi',been:'bin',as:'as',at:'at',on:'an',in:'in',but:'bat',from:'fram',all:'ol',would:'uud',could:'kud',should:'shud',through:'zru',though:'dou',thought:'zot',enough:'ináf',"don't":'dount',"can't":'kant',"i'm":'aim',"it's":'its',"you're":'yor',"i'll":'ail',"that's":'dats',"there's":'ders'};
const dictionaries=new Map(),pending=new Map();
const normalize=word=>word.toLowerCase().replace(/[’‘]/g,"'");
export function installDictionary(letter,data){dictionaries.set(letter,data);}
async function loadLetter(letter){
  if(dictionaries.has(letter))return;
  if(pending.has(letter))return pending.get(letter);
  const task=(async()=>{try{
    const url=new URL(`../pronunciation/${letter}.json`,import.meta.url).href;
    let cache;try{cache=await globalThis.caches?.open('reader-cmudict-v1');}catch{}
    let response=await cache?.match(url);
    if(!response){response=await fetch(url,{signal:AbortSignal.timeout(8000)});if(response.ok&&cache)try{await cache.put(url,response.clone());}catch{}}
    if(!response?.ok)throw new Error('Dictionary unavailable');
    dictionaries.set(letter,await response.json());
  }catch{/* Keep common words and spelling rules usable offline. Retry on the next passage. */}
  finally{pending.delete(letter);}})();pending.set(letter,task);return task;
}
export async function preparePronunciation(text){const letters=new Set((text.match(/[a-z]+(?:['’][a-z]+)*/gi)||[]).map(word=>word[0].toLowerCase()));await Promise.all([...letters].map(loadLetter));}
// Conservative fallback for words absent from the dictionary, never advertised as exact.
export function spellingFallback(word){
  return normalize(word).replace(/'s$/,'s').replace(/tion/g,'shon').replace(/sion/g,'shon').replace(/ture/g,'cher').replace(/igh/g,'ai').replace(/eigh/g,'ei').replace(/ough/g,'af').replace(/([bcdfghjklmnpqrstvwxyz])([aeiou])([bcdfghjklmnpqrstvwxyz])e$/g,(_,c,v,end)=>c+({a:'ei',e:'i',i:'ai',o:'ou',u:'iu'})[v]+end).replace(/ee|ea/g,'i').replace(/oo/g,'u').replace(/oa|ow/g,'ou').replace(/ai|ay/g,'ei').replace(/oi|oy/g,'oi').replace(/ou/g,'au').replace(/qu/g,'ku').replace(/ph/g,'f').replace(/th/g,'z').replace(/sh/g,'§').replace(/ch/g,'¤').replace(/wh/g,'u').replace(/ck/g,'k').replace(/kn/g,'n').replace(/wr/g,'r').replace(/c(?=[eiy])/g,'s').replace(/g(?=[eiy])/g,'y').replace(/c/g,'k').replace(/j/g,'y').replace(/h/g,'j').replace(/w/g,'u').replace(/x/g,'ks').replace(/z/g,'s').replace(/§/g,'sh').replace(/¤/g,'ch').replace(/([a-z])\1/g,'$1');
}
export function transcribe(text){
  const uncertain=[],ambiguous=[];
  const result=text.replace(/[a-z]+(?:['’][a-z]+)*/gi,word=>{
    const key=normalize(word);if(Object.hasOwn(common,key))return common[key];
    const shard=dictionaries.get(key[0]);const value=shard&&Object.hasOwn(shard,key)?shard[key]:null;
    if(value){if(Array.isArray(value)){ambiguous.push(word);return value[0];}return value;}
    uncertain.push(word);return spellingFallback(key);
  });
  return {text:result,uncertain:[...new Set(uncertain)],ambiguous:[...new Set(ambiguous)]};
}
// Whole clauses/sentences keep meaning units together; original text is untouched.
export function localFragments(text){return (text.match(/[^.!?;:,]+(?:[.!?;:,]+[”"’']*)?|[.!?;:,]+/g)||[text]).filter(value=>value.trim()).map(value=>{const en=value.trim();return {en,...transcribe(en)};});}
