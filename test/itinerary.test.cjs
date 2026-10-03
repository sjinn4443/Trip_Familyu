const {test}=require('node:test');const assert=require('node:assert/strict');const {recommend,distance,price}=require('../public/itinerary.js');
const p=(id,lat,category='cafe',cost=5000)=>({id,name:id,lat,lng:129.01,category,currency:'KRW',priceMin:cost,priceMax:cost});

test('required places waiting for coordinates never create a route through zero coordinates',()=>{
  const {plan}=require('../public/itinerary.js');
  const result=plan([{...p('pending',null),lng:null},p('nearby',35.1)],{include:['pending'],forceInclude:true});
  assert.equal(result.routes.length,0);assert.match(result.reason,/위치가 아직 미확인/);
});
test('does not combine different cities into one day',()=>{
  const routes=recommend([p('a',35.1,'meal'),p('b',35.105),p('seoul',37.56,'shop')]);assert.equal(routes.length,1);assert.deepEqual(routes[0].stops.map(s=>s.id),['a','b']);
});
test('budget excludes expensive stops and exposes unknown prices',()=>{
  const missing={...p('unknown',35.102,'shop'),priceMin:null,priceMax:null};const routes=recommend([p('meal',35.1,'meal',15000),p('coffee',35.101,'cafe',6000),missing,p('expensive',35.103,'shop',50000)],{budget:30000});
  assert.equal(routes[0].cost,21000);assert.equal(routes[0].unknown,1);assert.ok(routes.every(r=>r.cost<=30000&&!r.stops.some(s=>s.id==='expensive')));
});
test('schedules visits and transfers from chosen start time',()=>{
  const route=recommend([p('meal',35.1,'meal'),p('coffee',35.105)],{start:'12:00'})[0];assert.equal(route.stops[0].time,720);assert.ok(route.stops[1].time>780);assert.ok(route.duration>=110);assert.ok(route.moving>0);
});
test('never invents additional stops or treats unknown/free prices alike',()=>{
  assert.equal(recommend([p('only',35.1)]).length,0);assert.equal(price(p('free',35.1,'sight',0)),0);assert.equal(price({...p('foreign',35.1),currency:'GBP'}),null);assert.equal(distance(p('a',35.1),p('a',35.1)),0);
});
test('every recommendation contains every selected place, including more than four',()=>{
 const all=Array.from({length:5},(_,i)=>p(String(i),35.1+i*.001,'shop',1000));const ids=all.map(p=>p.id);
 const routes=recommend(all,{include:ids});assert.ok(routes.length);assert.ok(routes.every(r=>ids.every(id=>r.stops.some(s=>s.id===id))));
 assert.equal(recommend(all,{include:ids,budget:3000}).length,0);
 assert.equal(recommend(all,{include:['missing']}).length,0);
 assert.equal(recommend([...all,p('seoul',37.56)],{include:['0','seoul'],mode:'transit'}).length,0);
});
test('order changes to visit an early-closing stop and avoids break time',()=>{
 const hours=intervals=>({weekly:Array.from({length:7},()=>intervals),source:'user'});
 const meal={...p('meal',35.1,'meal'),openingHours:hours([{open:'12:00',close:'15:00'},{open:'17:00',close:'21:00'}])};
 const shop={...p('early',35.101,'shop'),openingHours:hours([{open:'09:00',close:'12:30'}])};
 const route=recommend([meal,shop],{include:['meal','early'],start:'11:30'})[0];assert.ok(route);assert.equal(route.stops[0].id,'early');
 assert.ok(route.stops.every(s=>s.hoursKnown));assert.ok(route.stops[0].time+route.stops[0].duration<=750);
 const later=recommend([meal,p('coffee',35.102)],{include:['meal'],start:'14:30'})[0];assert.ok(later);assert.ok(later.stops.find(s=>s.id==='meal').time>=1020);
});
test('closed weekdays are excluded and unknown hours are visibly flagged',()=>{
 const closed={...p('closed',35.101),openingHours:{weekly:Array.from({length:7},()=>[]),source:'user'}};
 const all=[p('a',35.1),p('b',35.102),closed];assert.ok(recommend(all).every(r=>!r.stops.some(s=>s.id==='closed')));
 assert.equal(recommend(all,{include:['closed']}).length,0);assert.equal(recommend(all)[0].unknownHours,2);
});
test('applied required picks remain in a plan even when closed, far away, or over budget',()=>{
 const closed={...p('required',35.1,'shop',50000),openingHours:{weekly:Array.from({length:7},()=>[]),source:'user'}};
 const routes=recommend([closed,p('nearby',35.101)],{include:['required'],forceInclude:true});
 assert.ok(routes.length);assert.ok(routes.every(r=>r.stops.some(s=>s.id==='required')&&r.stops.some(s=>s.id==='nearby')));assert.ok(routes[0].warnings.length);assert.equal(routes[0].stops.find(s=>s.id==='required').hoursConflict,true);
 const over=recommend([closed],{include:['required'],forceInclude:true,budget:10000});assert.equal(over[0].stops.length,1);assert.ok(over[0].warnings.some(w=>w.includes('예산')));
 const far=recommend([p('busan',35.1),p('seoul',37.56)],{include:['busan','seoul'],forceInclude:true});assert.ok(far.every(r=>r.stops.length===2));assert.ok(far[0].warnings.some(w=>w.includes('멀리')));
});
test('a single required pick is a valid plan and nearby optional stops form distinct alternatives',()=>{
 assert.equal(recommend([p('required',35.1)],{include:['required'],forceInclude:true})[0].stops.length,1);
 const all=[p('required',35.1,'meal'),p('a',35.101,'cafe'),p('b',35.102,'shop'),p('c',35.103,'sight'),p('d',35.104,'craft')];
 const routes=recommend(all,{include:['required'],forceInclude:true});assert.equal(routes.length,3);assert.ok(routes.every(r=>r.stops.some(s=>s.id==='required')&&r.stops.length===4));
 assert.equal(new Set(routes.map(r=>r.stops.map(s=>s.id).sort().join('|'))).size,3);
});
