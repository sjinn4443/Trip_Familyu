const {test}=require('node:test');const assert=require('node:assert/strict');
const {createEnricher}=require('../lib/enrichment.cjs');
const hours={weekly:Array(7).fill([{open:'10:00',close:'18:00'}]),source:'google'};
test('optional details arrive after saving and persist without replacing required fields',async()=>{
  const place={id:'1',url:'https://maps.app.goo.gl/test',name:'My name',category:'craft',userId:'friend',lat:null,lng:null};const board={places:[place]};let writes=0;
  const worker=createEnricher({getBoard:()=>board,persist:async()=>writes++,resolvePlace:async()=>({name:'Different',category:'shop',location:{lat:34.88,lng:128.62},address:'거제 주소',openingHours:hours})});
  await worker.enqueue(place);assert.equal(place.region,'geoje');assert.equal(place.address,'거제 주소');assert.deepEqual(place.openingHours,hours);assert.equal(place.name,'My name');assert.equal(place.category,'craft');assert.equal(place.metadataLookup.status,'complete');assert.equal(writes,1);
});
test('background results cannot overwrite a corrected address, pin, or hours',async()=>{
  const place={id:'1',url:'a',lat:null,lng:null};let finish;const response=new Promise(resolve=>finish=resolve);
  const worker=createEnricher({getBoard:()=>({places:[place]}),persist:async()=>{},resolvePlace:()=>response});
  const task=worker.enqueue(place);await Promise.resolve();Object.assign(place,{address:'Corrected address',addressSource:'user',lat:35.1,lng:129.1,openingHours:{...hours,source:'user'}});
  finish({address:'Old address',location:{lat:37.5,lng:127},openingHours:{weekly:[]}});await task;
  assert.equal(place.address,'Corrected address');assert.equal(place.lat,35.1);assert.equal(place.openingHours.source,'user');
});
test('changed links, deleted places, and failed lookups stay safe',async()=>{
  const place={id:'1',url:'a',lat:null,lng:null};let finish;const response=new Promise(resolve=>finish=resolve);let writes=0;
  const board={places:[place]};const worker=createEnricher({getBoard:()=>board,persist:async()=>writes++,resolvePlace:()=>response});
  const task=worker.enqueue(place);place.url='b';finish({location:{lat:37.5,lng:127}});await task;assert.equal(place.lat,null);assert.equal(writes,0);
  const task2=worker.enqueue(place);board.places=[];await task2;assert.equal(writes,0);
  board.places=[place];const failed=createEnricher({getBoard:()=>board,persist:async()=>writes++,resolvePlace:async()=>{throw new Error('offline');}});
  await failed.enqueue(place);assert.equal(place.lat,null);assert.equal(place.metadataLookup.status,'unavailable');assert.equal(writes,1);
});
