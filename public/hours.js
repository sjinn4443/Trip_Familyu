(function(root){
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const minutes=t=>typeof t==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)?Number(t.slice(0,2))*60+Number(t.slice(3)):t==='24:00'?1440:null;
  const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  function normalize(value){
    if(!value)return null;if(!Array.isArray(value.weekly)||value.weekly.length!==7)throw new Error('영업시간에는 모든 요일 정보가 필요해요.');
    const weekly=value.weekly.map(row=>{if(row===null)return null;if(!Array.isArray(row)||row.length>6)throw new Error('영업시간 구간을 확인해 주세요.');
      const sorted=row.map(p=>{const open=minutes(p.open),close=minutes(p.close);if(open===null||close===null||open===1440||open===close)throw new Error('올바른 시작·마감 시간을 입력해 주세요.');return {open:clock(open),close:clock(close)};}).sort((a,b)=>minutes(a.open)-minutes(b.open));
      for(let i=1;i<sorted.length;i++){let end=minutes(sorted[i-1].close);if(end<=minutes(sorted[i-1].open))end+=1440;if(end>minutes(sorted[i].open))throw new Error('영업시간이 겹쳐요. 휴게시간을 확인해 주세요.');}return sorted;});
    return {weekly,source:['google','business-page','user'].includes(value.source)?value.source:'user',note:String(value.note||'').slice(0,300)};
  }
  function fromGoogle(hours){
    if(!Array.isArray(hours?.periods)||!hours.periods.length)return null;
    const weekly=Array.from({length:7},()=>[]);
    for(const p of hours.periods){if(!p.open)continue;if(!p.close){if(p.open.day===0&&p.open.hour===0){for(const day of weekly)day.push({open:'00:00',close:'24:00'});}continue;}
      const a=p.open.day*1440+p.open.hour*60+(p.open.minute||0),b=p.close.day*1440+p.close.hour*60+(p.close.minute||0);let end=b;if(end<=a)end+=10080;
      for(let t=a;t<end;){const d=Math.floor(t/1440),edge=Math.min(end,(d+1)*1440);weekly[d%7].push({open:clock(t-d*1440),close:clock(edge-d*1440)});t=edge;}
    }return normalize({weekly,source:'google',note:'구글 지도의 정규 영업시간이에요. 휴일과 예약 회차는 다를 수 있어요.'});
  }
  function fromEmbed(rows){
    if(!Array.isArray(rows))return null;const weekly=Array(7).fill(null);let count=0;
    for(const row of rows){const label=row?.[0],day=days.indexOf(label)>=0?days.indexOf(label):['일요일','월요일','화요일','수요일','목요일','금요일','토요일'].indexOf(label);if(day<0||!Array.isArray(row[3]))continue;const intervals=[];let known=false;
      for(const item of row[3]){const pair=item?.[1];if(Array.isArray(pair)&&Array.isArray(pair[0])&&Array.isArray(pair[1])){intervals.push({open:clock(Number(pair[0][0])*60+Number(pair[0][1]||0)),close:clock(Number(pair[1][0])*60+Number(pair[1][1]||0))});known=true;}else if(/closed|휴무|휴업/i.test(String(item?.[0]))){known=true;}else if(/24 hours|24시간/i.test(String(item?.[0]))){intervals.push({open:'00:00',close:'24:00'});known=true;}}
      if(known){weekly[day]=intervals;count++;}
    }return count?normalize({weekly,source:'google',note:'구글 지도에 표시된 요일별 영업시간이에요. 휴일과 예약 회차는 다를 수 있어요.'}):null;
  }
  function fromSchema(spec){
    if(!spec)return null;const weekly=Array.from({length:7},()=>[]);let count=0;
    for(const p of Array.isArray(spec)?spec:[spec]){if(p.validFrom||p.validThrough)continue;for(const d of Array.isArray(p.dayOfWeek)?p.dayOfWeek:[p.dayOfWeek]){const day=days.indexOf(String(d).split('/').at(-1));if(day<0||minutes(p.opens)===null||minutes(p.closes)===null)continue;count++;if(p.opens!==p.closes)weekly[day].push({open:p.opens,close:p.closes});}}
    return count?normalize({weekly,source:'business-page',note:'업체가 안내한 영업시간이에요. 휴일 변동을 확인해 주세요.'}):null;
  }
  function weekday(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;const d=new Date(date+'T12:00:00Z');return Number.isNaN(d.getTime())?null:d.getUTCDay();}
  function windows(hours,date){const day=weekday(date);if(!hours||day===null)return null;const current=hours.weekly?.[day];if(current===null||current===undefined)return null;const out=[];
    for(let offset=-1;offset<=1;offset++){const row=hours.weekly[(day+offset+7)%7];for(const p of row||[]){const open=minutes(p.open),close=minutes(p.close);if(open===null||close===null)continue;const a=offset*1440+open,b=offset*1440+close+(close<=open?1440:0);if(b>0)out.push([a,b]);}}
    const merged=[];for(const interval of out.sort((a,b)=>a[0]-b[0])){const previous=merged.at(-1);if(previous&&interval[0]<=previous[1])previous[1]=Math.max(previous[1],interval[1]);else merged.push([...interval]);}return merged;
  }
  function nextVisit(place,date,arrival,duration,limit){const w=windows(place.openingHours,date);if(w===null)return {time:arrival,wait:0,hoursKnown:false};for(const [open,close]of w){const time=Math.max(arrival,open);if(time+duration<=close&&time+duration<=limit)return {time,wait:time-arrival,hoursKnown:true};}return null;}
  function describe(hours,date){const day=weekday(date),row=day===null?null:hours?.weekly?.[day];if(row==null)return '영업시간 미확인 · 방문 전 확인해 주세요';if(!row.length)return ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'][day]+' 휴무';const gaps=row.slice(1).map((p,i)=>`${row[i].close}–${p.open}`);return `영업 시작 ${row[0].open} · 휴게시간: ${gaps.length?gaps.join(', '):'안내 없음'} · 마감 ${row.at(-1).close}${minutes(row.at(-1).close)<=minutes(row.at(-1).open)?' (다음 날)':''}`;}
  const api={days,minutes,clock,normalize,fromGoogle,fromEmbed,fromSchema,weekday,windows,nextVisit,describe};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Hours=api;
})(typeof window!=='undefined'?window:globalThis);
