const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { googleURL,coords,resolve,parseURL,CATEGORIES } = require('./lib/places.cjs');
const {createEnricher,needsLookup,located}=require('./lib/enrichment.cjs');
const {DEFAULT_CATEGORIES}=require('./lib/categories.cjs');
const {regionFor}=require('./public/regions.js');
const Hours=require('./public/hours.js');
const {createService}=require('./lib/fx.cjs');
const ROOT = __dirname, DATA = path.join(process.env.DATA_DIR || path.join(ROOT,'data'),'board.json');
const PORT = Number(process.env.PORT || 4311), HOST = process.env.HOST || '127.0.0.1';
const fx=createService(path.dirname(DATA));
let board; let writes = Promise.resolve();
const enricher=createEnricher({getBoard:()=>board,persist,resolvePlace:url=>resolve(url,process.env.GOOGLE_MAPS_API_KEY,board.categories)});
const defaults = () => ({revision:0, users:[{id:'mom',name:'엄마',color:'#0ad7d4'},{id:'dad',name:'아빠',color:'#3b82f6'},{id:'sujin',name:'수진',color:'#ef8198'},{id:'junghui',name:'중희',color:'#9170cd'}],categories:structuredClone(DEFAULT_CATEGORIES),trip:{name:'거제도 가족여행',startDate:'2026-11-20',endDate:'2026-11-22'},places:[]});
async function initialize() {
  await fs.mkdir(path.dirname(DATA),{recursive:true});
  let firstStart=false;
  try { board = JSON.parse(await fs.readFile(DATA,'utf8')); } catch(error) {
    if (error.code !== 'ENOENT') throw error;
    board = process.env.INITIAL_BOARD_JSON ? JSON.parse(process.env.INITIAL_BOARD_JSON) : defaults();
    if(!Array.isArray(board.users)||!Array.isArray(board.places))throw new Error('초기 여행 데이터가 올바르지 않아요.');
    board.revision=Number.isSafeInteger(board.revision)?board.revision:0;
    firstStart=true;
  }
  board.categories ||= structuredClone(DEFAULT_CATEGORIES);board.trip ||= defaults().trip;
  for(const p of board.places)p.region=regionFor(p);
  // Seed only an empty volume; later deployments always use its saved board.
  if(firstStart)await fs.writeFile(DATA,JSON.stringify(board,null,2),{flag:'wx'});
}
function persist() {
  board.revision++;
  const snapshot = JSON.stringify(board,null,2);
  writes = writes.catch(()=>{}).then(async()=>{const temp=DATA+'.tmp';await fs.writeFile(temp,snapshot);await fs.rename(temp,DATA);});
  return writes;
}
function json(res,status,value) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value)); }
async function body(req) {
  let str=''; for await(const chunk of req) { str+=chunk; if(Buffer.byteLength(str)>24000) throw new Error('입력한 내용이 너무 길어요.'); }
  try { return JSON.parse(str); } catch { throw new Error('입력 내용을 확인해 주세요.'); }
}
function string(value,max=150) { return typeof value==='string' ? value.trim().slice(0,max) : ''; }
function validatePlace(p) {
  const name=string(p.name);if(!name) throw new Error('장소 이름을 입력해 주세요.');
  const url = googleURL(p.url).href;
  const supplied=[p.lat,p.lng].some(v=>v!==''&&v!=null);
  const point = supplied ? (p.lat!==''&&p.lng!==''&&p.lat!=null&&p.lng!=null?coords(p.lat,p.lng):null) : parseURL(url).location||{lat:null,lng:null};
  if(!point) throw new Error('지도 좌표를 확인해 주세요.');
  if(!board.users.some(u=>u.id===p.userId)) throw new Error('등록한 가족을 선택해 주세요.');
  if(!board.categories.some(c=>c.id===p.category)) throw new Error('카테고리를 선택해 주세요.');
  const priceMin = p.priceMin === '' || p.priceMin == null ? null : Number(p.priceMin);
  const priceMax = p.priceMax === '' || p.priceMax == null ? null : Number(p.priceMax);
  if([priceMin,priceMax].some(v=>v!==null && (!Number.isFinite(v)||v<0||v>1e9)) || (priceMin!==null&&priceMax!==null&&priceMin>priceMax)) throw new Error('올바른 가격 범위를 입력해 주세요.');
  return {name,...point,region:regionFor(point),url,userId:p.userId,category:p.category,address:string(p.address,250),addressSource:string(p.addressSource,40),note:string(p.note,600),priceMin,priceMax,currency:['KRW','USD','GBP','EUR','JPY','IDR'].includes(p.currency)?p.currency:'KRW',priceLevel:string(p.priceLevel,60)||null,priceRange:p.priceRange && typeof p.priceRange==='object'?p.priceRange:null,priceSource:priceMin!==null||priceMax!==null?(['estimate','google','web'].includes(p.priceSource)?p.priceSource:'user'):p.priceLevel||p.priceRange?'google':'unknown',priceNote:string(p.priceNote,300),openingHours:Hours.normalize(p.openingHours),businessStatus:string(p.businessStatus,40),source:p.source==='google-places'?'google-places':'google-link',attributions:Array.isArray(p.attributions)?p.attributions.slice(0,10).map(a=>({provider:string(a.provider,100)})):[],sourceLinks:Array.isArray(p.sourceLinks)?p.sourceLinks.slice(0,5).map(s=>{let link;try{link=new URL(s.url);}catch{return null;}return link.protocol==='https:'&&!link.username&&!link.password?{title:string(s.title,80),url:link.href.slice(0,2000)}:null;}).filter(Boolean):[]};
}
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    // Changes are restricted to requests from this origin, including LAN use.
    if(req.method!=='GET' && req.headers.origin && !([`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin))) return json(res,403,{error:'이 앱에서 요청해 주세요.'});
    if(req.method==='GET' && url.pathname==='/api/board') return json(res,200,{...board,googlePlacesEnabled:Boolean(process.env.GOOGLE_MAPS_API_KEY)});
    if(req.method==='GET' && url.pathname==='/api/health') return json(res,200,{ok:true});
    if(req.method==='GET' && url.pathname==='/api/fx')return json(res,200,await fx.get());
    if(req.method==='POST' && url.pathname==='/api/resolve') {
      const input=await body(req);return json(res,200,await resolve(string(input.url,3000),process.env.GOOGLE_MAPS_API_KEY,board.categories));
    }
    if(req.method==='PATCH' && url.pathname==='/api/trip'){
      const p=await body(req);for(const key of ['name','startDate','endDate'])if(p[key]!==undefined)board.trip[key]=string(p[key],120);await persist();return json(res,200,board.trip);
    }
    if(req.method==='POST' && url.pathname==='/api/categories'){
      const p=await body(req),name=string(p.name,40),emoji=string(p.emoji,16);
      if(!name||!emoji||[...new Intl.Segmenter('en',{granularity:'grapheme'}).segment(emoji)].length>2)throw new Error('카테고리 이름과 이모티콘 한두 개를 입력해 주세요.');
      if(board.categories.some(c=>c.name.toLowerCase()===name.toLowerCase()))throw new Error('이미 있는 카테고리예요.');
      if(board.categories.length>=64)throw new Error('카테고리는 최대 64개까지 추가할 수 있어요.');
      const category={id:'cat-'+crypto.randomUUID(),name,emoji,tint:'#e8fbfa',estimateMin:null,estimateMax:null};board.categories.push(category);await persist();return json(res,201,category);
    }
    if(req.method==='POST' && url.pathname==='/api/users') {
      const p=await body(req),name=string(p.name,30),color=string(p.color,7);
      if(!name || !/^#[\da-f]{6}$/i.test(color)) throw new Error('이름과 색상을 입력해 주세요.');
      if(board.users.length>=20) throw new Error('최대 20명까지 추가할 수 있어요.');
      if(board.users.some(u=>u.name.toLowerCase()===name.toLowerCase())) throw new Error('이미 사용 중인 이름이에요.');
      const user={id:crypto.randomUUID(),name,color};board.users.push(user);await persist();return json(res,201,user);
    }
    if(req.method==='PATCH' && url.pathname.startsWith('/api/users/')) {
      const user=board.users.find(u=>u.id===url.pathname.split('/').at(-1));if(!user) return json(res,404,{error:'가족 정보를 찾을 수 없어요.'});
      const p=await body(req);if(!/^#[\da-f]{6}$/i.test(p.color)) throw new Error('올바른 색상을 선택해 주세요.');user.color=p.color;await persist();return json(res,200,user);
    }
    if(req.method==='POST' && url.pathname==='/api/places') {
      const input=await body(req),p=validatePlace(input);
      if(board.places.some(x=>x.url===p.url || (located(x)&&located(p)&&x.name===p.name && Math.abs(x.lat-p.lat)<0.0001 && Math.abs(x.lng-p.lng)<0.0001))) return json(res,409,{error:'이미 저장한 장소예요. 기존 장소를 수정해 주세요.'});
      const place={...p,id:crypto.randomUUID(),createdAt:new Date().toISOString()};if(needsLookup(place))place.metadataLookup={status:'pending'};board.places.push(place);await persist();json(res,201,place);void enricher.enqueue(place).catch(()=>{});return;
    }
    if(url.pathname.startsWith('/api/places/') && ['PUT','DELETE'].includes(req.method)) {
      const id=url.pathname.split('/').at(-1),index=board.places.findIndex(p=>p.id===id);
      if(index<0) return json(res,404,{error:'장소를 찾을 수 없어요.'});
      if(req.method==='DELETE') board.places.splice(index,1);
      else {const input=await body(req),old=board.places[index],sameLink=input.url===old.url;board.places[index]={...old,...validatePlace({...input,openingHours:sameLink?old.openingHours:null,businessStatus:sameLink?old.businessStatus:''}),updatedAt:new Date().toISOString()};if(needsLookup(board.places[index]))board.places[index].metadataLookup={status:'pending'};}
      await persist();json(res,200,{ok:true});if(req.method==='PUT')void enricher.enqueue(board.places[index]).catch(()=>{});return;
    }
    if(url.pathname.startsWith('/api/')) return json(res,404,{error:'요청을 찾을 수 없어요.'});
    if(req.method!=='GET' && req.method!=='HEAD') return json(res,405,{error:'지원하지 않는 요청 방식이에요.'});
    let relative=decodeURIComponent(url.pathname); if(relative==='/') relative='/index.html';
    const file=path.resolve(ROOT,'public','.'+relative);
    if(!file.startsWith(path.join(ROOT,'public')+path.sep)) return json(res,403,{error:'접근할 수 없어요.'});
    const contents=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.tile.openstreetmap.org; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'self'; base-uri 'self'"});res.end(req.method==='HEAD'?undefined:contents);
  } catch(error) { if(error.code==='ENOENT') return json(res,404,{error:'파일을 찾을 수 없어요.'});console.error(error.message);json(res,400,{error:error.message||'잠시 후 다시 시도해 주세요.'}); }
});
initialize().then(()=>server.listen(PORT,HOST,()=>{console.log(`거제도 가족여행 실행: http://${HOST}:${server.address().port}`);for(const p of board.places)if(p.metadataLookup?.status==='pending')void enricher.enqueue(p).catch(()=>{});})).catch(error=>{console.error(error);process.exitCode=1;});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
