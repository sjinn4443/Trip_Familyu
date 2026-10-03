const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const {spawn}=require('node:child_process');const {once}=require('node:events');
const root=path.resolve(__dirname,'..');
function launch(dir,seed=''){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['server.cjs'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:'0',DATA_DIR:dir,GOOGLE_MAPS_API_KEY:'',INITIAL_BOARD_JSON:seed},stdio:['ignore','pipe','pipe'],windowsHide:true});let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('Server startup timed out'));},8000);child.once('error',reject);child.stdout.on('data',chunk=>{output+=chunk;const url=output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];if(url){clearTimeout(timer);resolve({child,url});}});child.stderr.on('data',chunk=>{output+=chunk;});child.once('exit',code=>{clearTimeout(timer);if(!output.includes('실행:'))reject(new Error(output||`Server exited ${code}`));});});}
async function stop(child){if(child.exitCode!==null)return;const done=once(child,'exit');child.kill();await done;}

test('first deployment imports a board once and keeps volume data across deployments',async()=>{
  const parent=path.join(root,'test-results');await fs.mkdir(parent,{recursive:true});const dir=await fs.mkdtemp(path.join(parent,'volume-'));
  const seed={revision:12,users:[{id:'friend',name:'Friend',color:'#ffad00'}],trip:{startDate:'2026-11-20'},places:[{id:'pick',name:'Saved pick',lat:34.88,lng:128.62,userId:'friend',category:'shop'}]};
  let running=await launch(dir,JSON.stringify(seed));
  try{
    const initial=await (await fetch(running.url+'/api/board')).json();assert.equal(initial.places[0].id,'pick');assert.equal(initial.users[0].color,'#ffad00');assert.equal(initial.places[0].region,'geoje');
    const saved=JSON.parse(await fs.readFile(path.join(dir,'board.json'),'utf8'));assert.equal(saved.places[0].id,'pick');
    await fetch(running.url+'/api/trip',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({startDate:'2026-11-21'})});
    await stop(running.child);running=await launch(dir,JSON.stringify({...seed,places:[],trip:{startDate:'Old snapshot'}}));
    const after=await (await fetch(running.url+'/api/board')).json();assert.equal(after.places[0].id,'pick');assert.equal(after.trip.startDate,'2026-11-21');
    await stop(running.child);running=await launch(dir);
    assert.equal((await (await fetch(running.url+'/api/board')).json()).places[0].id,'pick');
  }finally{await stop(running.child);}
});
test('shared board CRUD, validation, and disk persistence use an isolated data directory',async()=>{
  const parent=path.join(root,'test-results');await fs.mkdir(parent,{recursive:true});const dir=await fs.mkdtemp(path.join(parent,'board-'));let running=await launch(dir);
  async function request(endpoint,method='GET',body,headers={}){const response=await fetch(running.url+endpoint,{method,headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};}
  try{
    const initial=(await request('/api/board')).data;assert.equal(initial.places.length,0);assert.deepEqual(initial.users.map(u=>u.name),['엄마','아빠','수진','중희']);assert.equal(new Set(initial.users.map(u=>u.color)).size,4);assert.equal(initial.trip.startDate,'2026-11-20');assert.equal(initial.trip.endDate,'2026-11-22');
    assert.equal((await request('/api/users','POST',{name:'Test person',color:'#8871b0'},{Origin:'https://different.example'})).status,403);
    const newUser=await request('/api/users','POST',{name:'Test person',color:'#8871b0'});assert.equal(newUser.status,201);
    assert.equal((await request('/api/users/'+newUser.data.id,'PATCH',{color:'#223344'})).data.color,'#223344');
    const hours={weekly:Array.from({length:7},()=>[{open:'10:00',close:'15:00'},{open:'17:00',close:'20:00'}]),source:'user',note:'Test weekly schedule'};
    const place={name:'Test café',lat:34.87,lng:128.61,url:'https://www.google.com/maps/search/?api=1&query=34.87,128.61',userId:newUser.data.id,category:'cafe',currency:'KRW',priceMin:5000,priceMax:8000,openingHours:hours};
    assert.equal((await request('/api/places','POST',{...place,lat:''})).status,400);
    assert.equal((await request('/api/places','POST',{...place,priceMin:9000})).status,400);
    assert.equal((await request('/api/places','POST',{...place,openingHours:{weekly:Array(7).fill([{open:'wrong',close:'20:00'}])}})).status,400);
    const saved=await request('/api/places','POST',place);assert.equal(saved.status,201);
    assert.equal((await request('/api/places','POST',place)).status,409);
    assert.equal(saved.data.region,'geoje');
    assert.equal((await request('/api/categories','POST',{name:'Bookshops',emoji:'📚'})).status,201);
    assert.equal((await request('/api/categories','POST',{name:'bookshops',emoji:'📚'})).status,400);
    assert.equal((await request('/api/categories','POST',{name:'Invalid',emoji:'12345'})).status,400);
    const custom=(await request('/api/board')).data.categories.find(c=>c.name==='Bookshops');
    const seoulPlace=await request('/api/places','POST',{...place,name:'Seoul books',lat:34.88,lng:128.62,url:'https://www.google.com/maps/search/?api=1&query=34.88,128.62',category:custom.id,priceSource:'estimate',priceNote:'Planning estimate'});
    assert.equal(seoulPlace.status,201);assert.equal(seoulPlace.data.region,'geoje');assert.equal(seoulPlace.data.priceSource,'estimate');
    assert.equal((await request('/api/trip','PATCH',{name:'우리 가족여행',startDate:'2026-11-20'})).status,200);
    assert.equal((await request('/api/places/'+saved.data.id,'PUT',{...place,note:'Updated note'})).status,200);
    await stop(running.child);running=await launch(dir);
    const persisted=await request('/api/board');assert.equal(persisted.data.places[0].note,'Updated note');assert.equal(persisted.data.users.at(-1).color,'#223344');
    assert.deepEqual(persisted.data.places[0].openingHours.weekly[1],hours.weekly[1]);
    assert.equal(persisted.data.trip.name,'우리 가족여행');assert.equal(persisted.data.categories.at(-1).emoji,'📚');
    assert.equal(persisted.data.places.at(-1).category,custom.id);
    assert.equal((await request('/api/places/'+seoulPlace.data.id,'DELETE')).status,200);
    assert.equal((await request('/api/places/'+saved.data.id,'DELETE')).status,200);assert.equal((await request('/api/board')).data.places.length,0);
    assert.equal((await request('/api/resolve','POST',{url:'https://example.com/maps'})).status,400);
    const minimal=await request('/api/places','POST',{name:'Four fields only',url:'https://www.google.com/maps/search/?api=1&query=37.55,126.97',category:'shop',userId:newUser.data.id});
    assert.equal(minimal.status,201);assert.equal(minimal.data.lat,37.55);assert.equal(minimal.data.lng,126.97);
    const pending=await request('/api/places','POST',{name:'Waiting for location',url:'https://maps.app.goo.gl/unresolved-test',category:'shop',userId:newUser.data.id});
    assert.equal(pending.status,201);assert.equal(pending.data.lat,null);assert.equal(pending.data.metadataLookup.status,'pending');
  }finally{await stop(running.child);}
});
