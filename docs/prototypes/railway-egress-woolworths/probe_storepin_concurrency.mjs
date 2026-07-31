const UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BASE="https://www.woolworths.com.au";
const TERMS=["spaghetti","eggs","carrot","brown onion","tinned tomatoes","tasty cheese","beef mince","garlic cloves","potato","lemon","broccoli","olive oil"];
const jar=new Map();
const absorb=r=>{for(const c of r.headers.getSetCookie?.()||[]){const kv=c.split(";")[0];const i=kv.indexOf("=");if(i>0)jar.set(kv.slice(0,i).trim(),kv.slice(i+1).trim());}};
const cookie=extra=>[...new Map([...jar,...Object.entries(extra||{})])].map(([k,v])=>`${k}=${v}`).join("; ");
const search=async(term,extra)=>{
  const loc="/shop/search/products?searchTerm="+encodeURIComponent(term);
  const t0=Date.now();
  const res=await fetch(BASE+"/apis/ui/Search/products",{method:"POST",headers:{"User-Agent":UA,"Content-Type":"application/json",Accept:"application/json",Origin:BASE,Referer:BASE+loc,Cookie:cookie(extra)},body:JSON.stringify({SearchTerm:term,PageNumber:1,PageSize:10,SortType:"TraderRelevance",IsSpecial:false,Location:loc,formatObject:JSON.stringify({name:term}),isBundle:false,isMobile:false,Filters:[]}),signal:AbortSignal.timeout(45000)});
  const txt=await res.text(); let d=null; try{d=JSON.parse(txt)}catch{}
  const p=d?.Products?.[0]?.Products?.[0];
  return {term,status:res.status,ms:Date.now()-t0,store:p?.FulfilmentStoreId,top:p?.Name,price:p?.Price,total:d?.SearchResultsCount,body:d?null:txt.slice(0,200)};
};
const out={};
try{const r=await fetch("https://ipinfo.io/json");out.where=await r.json()}catch(e){out.where={e:String(e)}}
{const r=await fetch(BASE+"/shop/search/products?searchTerm=carrot",{headers:{"User-Agent":UA,Accept:"text/html"}});absorb(r);await r.text();out.seedCookies=[...jar.keys()];}
out.storePin=[];
out.storePin.push({label:"default",...await search("spaghetti")});
for(const rgn of ["syd1","mel1","syd2","bne1"]) out.storePin.push({label:"bff_region="+rgn,...await search("spaghetti",{bff_region:rgn})});
// concurrency: a whole 12-item cold list fired at once
const t0=Date.now();
out.concurrent=await Promise.all(TERMS.map(t=>search(t).catch(e=>({term:t,error:String(e)}))));
out.concurrentWallMs=Date.now()-t0;
// second round immediately, to see if the burst triggered anything
const t1=Date.now();
out.concurrent2=await Promise.all(TERMS.map(t=>search(t).catch(e=>({term:t,error:String(e)}))));
out.concurrent2WallMs=Date.now()-t1;
console.log("PROBE_JSON_START");console.log(JSON.stringify(out));console.log("PROBE_JSON_END");
