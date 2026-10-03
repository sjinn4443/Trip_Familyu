const {regionFor}=require('../public/regions.js');
const located=p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng);
const hasHours=p=>p.openingHours?.weekly?.some(day=>Array.isArray(day));
const needsLookup=p=>!located(p)||!p.address||p.addressSource==='map-region'||!hasHours(p);

// Complete optional details without holding up saving or overwriting a friend's edits.
function createEnricher({getBoard,persist,resolvePlace}){
  let queue=Promise.resolve();const pending=new Map();
  function enqueue(place){
    if(!needsLookup(place))return Promise.resolve();
    const key=place.id+':'+place.url;if(pending.has(key))return pending.get(key);
    const id=place.id,url=place.url;
    const task=queue.then(async()=>{
      let details;try{details=await resolvePlace(url);}catch{details={};}
      const current=getBoard().places.find(p=>p.id===id);
      if(!current||current.url!==url)return;
      if(!located(current)&&details.location){current.lat=details.location.lat;current.lng=details.location.lng;current.region=regionFor(current);}
      if((!current.address||current.addressSource==='map-region')&&details.address){current.address=details.address;current.addressSource=details.addressSource||'google';}
      if(!hasHours(current)&&current.openingHours?.source!=='user'&&details.openingHours)current.openingHours=details.openingHours;
      if(details.businessStatus)current.businessStatus=details.businessStatus;
      current.metadataLookup={status:needsLookup(current)?'unavailable':'complete',checkedAt:new Date().toISOString()};
      await persist();
    });
    queue=task.catch(error=>console.error('Place details:',error.message));pending.set(key,task);
    task.finally(()=>pending.delete(key)).catch(()=>{});return task;
  }
  return {enqueue};
}
module.exports={createEnricher,located,needsLookup};
