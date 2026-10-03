const {test}=require('node:test');const assert=require('node:assert/strict');const Hours=require('../public/hours.js');
const weekly=row=>({weekly:Array.from({length:7},()=>row),source:'user'});
test('breaks require a full visit to fit in one open interval',()=>{
 const p={openingHours:weekly([{open:'10:00',close:'15:00'},{open:'17:00',close:'21:00'}])};
 assert.equal(Hours.nextVisit(p,'2026-11-09',14*60+30,60,24*60).time,17*60);
 assert.equal(Hours.nextVisit(p,'2026-11-09',20*60+30,60,24*60),null);
 assert.match(Hours.describe(p.openingHours,'2026-11-09'),/휴게시간: 15:00–17:00/);
});
test('unknown, closed and overnight schedules are distinct',()=>{
 assert.equal(Hours.nextVisit({},'2026-11-09',600,45,1440).hoursKnown,false);
 assert.equal(Hours.nextVisit({openingHours:weekly([])},'2026-11-09',600,45,1440),null);
 const late={openingHours:weekly([{open:'20:00',close:'02:00'}])};
 assert.equal(Hours.nextVisit(late,'2026-11-09',60,45,1440).time,60);
 assert.equal(Hours.nextVisit(late,'2026-11-09',19*60,60,1800).time,20*60);
 assert.throws(()=>Hours.normalize(weekly([{open:'10:00',close:'16:00'},{open:'15:00',close:'18:00'}])),/겹쳐/);
});
test('Google periods preserve weekday closure and overnight spillover',()=>{
 const h=Hours.fromGoogle({periods:[{open:{day:1,hour:10},close:{day:1,hour:15}},{open:{day:1,hour:17},close:{day:1,hour:22}},{open:{day:6,hour:22},close:{day:0,hour:2}}]});
 assert.deepEqual(h.weekly[1],[{open:'10:00',close:'15:00'},{open:'17:00',close:'22:00'}]);assert.deepEqual(h.weekly[2],[]);assert.deepEqual(h.weekly[0],[{open:'00:00',close:'02:00'}]);
 const always=Hours.fromGoogle({periods:[{open:{day:0,hour:0}}]});assert.equal(always.weekly[5][0].close,'24:00');
 assert.equal(Hours.nextVisit({openingHours:always},'2026-11-09',23*60+30,90,1800).time,23*60+30);
 assert.equal(Hours.nextVisit({openingHours:h},'2026-11-14',23*60+30,90,1800).time,23*60+30);
});
test('embed hours extract actual times while leaving missing weekdays unknown',()=>{
 const h=Hours.fromEmbed([['Monday',1,[],[['10 am–8 pm',[[10],[20]]]]],['Tuesday',2,[],[['Closed']]]]);
 assert.deepEqual(h.weekly[1],[{open:'10:00',close:'20:00'}]);assert.deepEqual(h.weekly[2],[]);assert.equal(h.weekly[3],null);
});

test('Korean embed weekdays, closures and all-day opening are supported',()=>{const h=Hours.fromEmbed([['금요일',5,[],[['10시–20시',[[10],[20]]]]],['토요일',6,[],[['휴무']]],['일요일',0,[],[['24시간 영업']]]]);assert.deepEqual(h.weekly[5],[{open:'10:00',close:'20:00'}]);assert.deepEqual(h.weekly[6],[]);assert.deepEqual(h.weekly[0],[{open:'00:00',close:'24:00'}]);assert.match(Hours.describe(h,'2026-11-20'),/영업 시작 10:00/);});
