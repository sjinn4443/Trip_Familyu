(function(root){
  const Hours=typeof module!=='undefined'&&module.exports?require('./hours.js'):root.Hours;
  function distance(a,b){const r=n=>n*Math.PI/180;const h=Math.sin(r(b.lat-a.lat)/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(r(b.lng-a.lng)/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
  function price(p,fx){let value=null;if(p.priceMin!=null&&p.priceMax!=null)value=(p.priceMin+p.priceMax)/2;else if(p.priceMax!=null)value=p.priceMax;else if(p.priceMin!=null)value=p.priceMin;if(value===null)return null;if(p.currency==='KRW')return value;const rate=fx?.rates?.[p.currency];return rate>0?value/rate:null;}
  const visitLength=p=>({meal:60,cafe:50,shop:35,sight:60,craft:45,experience:60,other:40})[p.category]||40;
  function plan(places,{mode='walk',budget=0,start='11:30',date='2026-11-20',include=[],fx=null,forceInclude=false}={}){
    const costOf=p=>price(p,fx);
    if(Hours.weekday(date)===null)return {routes:[],reason:'요일별 영업시간을 확인하려면 여행 날짜를 선택해 주세요.'};
    const wanted=new Set(include),required=places.filter(p=>wanted.has(p.id));
    if(required.length!==wanted.size)return {routes:[],reason:'선택한 장소가 현재 지역 또는 필터 밖에 있어요. 전체 목록을 선택하거나 필터를 해제해 주세요.'};
    if(required.some(p=>!Number.isFinite(p.lat)||!Number.isFinite(p.lng)))return {routes:[],reason:'선택한 장소의 지도 위치가 아직 미확인이에요. 위치가 확인되면 다시 적용하거나 구글 지도 장소 링크를 수정해 주세요.'};
    const candidates=places.filter(p=>(forceInclude&&wanted.has(p.id))||((p.category!=='stay'||wanted.has(p.id))&&!['CLOSED_PERMANENTLY','CLOSED_TEMPORARILY'].includes(p.businessStatus)&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&(!budget||costOf(p)===null||costOf(p)<=budget)));
    if(!forceInclude&&required.some(p=>!candidates.includes(p)))return {routes:[],reason:'필수 장소가 휴업 중이거나 예산을 초과하거나 위치가 없어요. 장소 정보, 예산 또는 선택을 수정해 주세요.'};
    if(!forceInclude&&budget&&required.reduce((s,p)=>s+(costOf(p)||0),0)>budget)return {routes:[],reason:'필수 장소가 예산을 초과해요. 예산을 늘리거나 장소 수를 줄여 주세요.'};
    const maxGap=mode==='walk'?6:40;
    if(!forceInclude&&required.some(a=>required.some(b=>distance(a,b)>maxGap)))return {routes:[],reason:mode==='walk'?'선택한 장소들이 도보로 이동하기에는 멀어요. 대중교통을 선택하거나 더 가까운 곳을 골라 주세요.':'선택한 장소들이 하루 코스로 묶기에는 멀어요. 지역별로 계획해 보세요.'};
    const startTime=Hours.minutes(start)??690,limit=startTime+720,radius=mode==='walk'?2.5:7;
    const routes=new Map(),anchors=required.length?[required[0]]:candidates;
    for(const anchor of anchors){
      const nearby=candidates.filter(p=>wanted.has(p.id)||(required.length?required.some(r=>distance(r,p)<=radius):distance(anchor,p)<=radius));
      if(nearby.length<(wanted.size?1:2))continue;
      const optional=nearby.filter(p=>!wanted.has(p.id)).sort((a,b)=>distance(anchor,a)-distance(anchor,b)).slice(0,12);
      const pool=[...required,...optional],maxStops=Math.min(pool.length,Math.max(4,required.length+1));
      let beam=[{stops:[],time:startTime,cost:0,km:0,moving:0,waiting:0,score:0}];
      for(let depth=0;depth<maxStops&&beam.length;depth++){
        const next=[];
        for(const state of beam){const remaining=required.filter(p=>!state.stops.some(s=>s.id===p.id));
          for(const p of pool){if(state.stops.some(s=>s.id===p.id))continue;if(remaining.length>=maxStops-depth&&!wanted.has(p.id))continue;
            const previous=state.stops.at(-1),segment=previous?distance(previous,p):0;
            if(previous&&segment>(required.length?maxGap:radius*2)&&!(forceInclude&&wanted.has(p.id)))continue;
            const transfer=!previous?0:mode==='walk'?Math.max(3,Math.ceil(segment*1.3/4.5*60)):Math.max(8,Math.ceil(segment*1.3/16*60)+8);
            const cost=state.cost+(costOf(p)||0);if(budget&&cost>budget)continue;
            const duration=visitLength(p),arrival=state.time+transfer,slot=Hours.nextVisit(p,date,arrival,duration,limit);if(!slot||slot.time+duration>limit)continue;
            const stops=[...state.stops,{...p,...slot,transfer,duration}],time=slot.time+duration,km=state.km+segment,waiting=state.waiting+slot.wait;
            const diversity=new Set(stops.map(s=>s.category)).size,missing=required.filter(r=>!stops.some(s=>s.id===r.id)).length;
            const score=stops.length*10+diversity*3-km*.7-waiting*.04-(time-startTime)*.01+(stops[0].category==='meal'?.25:0);
            const candidate={stops,time,cost,km,moving:state.moving+transfer,waiting,diversity,score,missing};next.push(candidate);
            if(stops.length>=(wanted.size?1:2)&&!missing){const key=stops.map(s=>s.id).sort().join('|'),old=routes.get(key);if(!old||score>old.score){const known=stops.filter(s=>costOf(s)!==null).length;routes.set(key,{...candidate,known,unknown:stops.length-known,duration:time-startTime,unknownHours:stops.filter(s=>!s.hoursKnown).length,warnings:[]});}}
          }
        }
        // Keep alternative orders so an early-closing stop can come before lunch.
        next.sort((a,b)=>a.missing-b.missing||b.score-a.score);beam=next.slice(0,80);
      }
    }
    const sorted=[...routes.values()].sort((a,b)=>b.score-a.score),result=[];
    for(const r of sorted){const different=wanted.size?r.stops.length===sorted[0].stops.length:result.every(x=>r.stops.some(p=>!x.stops.some(s=>s.id===p.id)));if(different){result.push({...r,id:'route-'+result.length});if(result.length===3)break;}}
    if(!result.length&&forceInclude&&required.length){
      const warnings=[],stops=[],remaining=[...required];let time=startTime,cost=0,km=0,moving=0;
      while(remaining.length){const previous=stops.at(-1);remaining.sort((a,b)=>previous?distance(previous,a)-distance(previous,b):0);const p=remaining.shift(),segment=previous&&Number.isFinite(p.lat)&&Number.isFinite(previous.lat)?distance(previous,p):0;
        const transfer=!previous?0:mode==='walk'?Math.max(3,Math.ceil(segment*1.3/4.5*60)):Math.max(8,Math.ceil(segment*1.3/16*60)+8);time+=transfer;moving+=transfer;km+=segment;
        const duration=visitLength(p),slot=Hours.nextVisit(p,date,time,duration,limit);const conflict=!slot||['CLOSED_PERMANENTLY','CLOSED_TEMPORARILY'].includes(p.businessStatus);
        if(conflict)warnings.push(p.name+': 방문 시간이 영업시간과 맞지 않아요. 시간을 확인하거나 다른 날짜를 선택해 주세요.');
        const visit={...p,time:slot?.time??time,wait:slot?.wait||0,hoursKnown:slot?.hoursKnown||false,hoursConflict:conflict,duration,transfer};stops.push(visit);time=visit.time+duration;cost+=costOf(p)||0;
      }
      if(budget&&cost>budget)warnings.push('선택한 필수 장소가 예산을 초과하지만 코스에는 포함했어요.');
      if(time>limit)warnings.push('필수 장소를 모두 방문하면 12시간을 넘겨요. 이동 방법이나 출발 시간을 확인해 주세요.');
      if(required.some(a=>required.some(b=>distance(a,b)>maxGap)))warnings.push('일부 필수 장소들이 멀리 떨어져 있어요. 대중교통과 실제 이동 시간을 확인해 주세요.');
      const known=stops.filter(p=>costOf(p)!==null).length;
      const extras=candidates.filter(p=>!wanted.has(p.id)&&required.some(r=>distance(r,p)<=radius)).slice(0,12),variants=[];
      for(let variant=0;variant<Math.min(3,Math.max(1,extras.length));variant++){
        const visits=[...stops];let total=cost,end=time,length=km,travel=moving;
        const choices=[...extras.slice(variant),...extras.slice(0,variant)];
        for(const p of choices){if(visits.length>=Math.max(4,required.length+1))break;if(budget&&total+(costOf(p)||0)>budget)continue;
          const segment=distance(visits.at(-1),p),transfer=mode==='walk'?Math.max(3,Math.ceil(segment*1.3/4.5*60)):Math.max(8,Math.ceil(segment*1.3/16*60)+8),duration=visitLength(p),slot=Hours.nextVisit(p,date,end+transfer,duration,limit);
          if(!slot||slot.time+duration>limit)continue;visits.push({...p,...slot,transfer,duration});total+=costOf(p)||0;end=slot.time+duration;length+=segment;travel+=transfer;
        }
        const key=visits.map(p=>p.id).sort().join('|');if(variants.some(v=>v.key===key))continue;variants.push({key,stops:visits,cost:total,km:length,moving:travel,duration:end-startTime});
      }
      const largest=Math.max(...variants.map(v=>v.stops.length));for(const v of variants.filter(v=>v.stops.length===largest)){const priced=v.stops.filter(p=>costOf(p)!==null).length;result.push({...v,id:'route-'+result.length,known:priced,unknown:v.stops.length-priced,unknownHours:v.stops.filter(p=>!p.hoursKnown).length,warnings,requiredOnly:true});}
    }
    return {routes:result,reason:result.length?'':wanted.size?'필수 장소를 예산·영업시간·휴게시간·12시간 안에 모두 방문하기 어려워요. 날짜, 출발 시간, 예산 또는 선택을 바꿔 주세요.':'현재 시간과 예산에 맞는 코스가 없어요. 가까운 장소를 추가하거나 날짜, 출발 시간, 이동 방법 또는 필터를 바꿔 주세요.'};
  }
  const api={distance,price,plan,recommend:(places,options)=>plan(places,options).routes};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Itinerary=api;
})(typeof window!=='undefined'?window:globalThis);
