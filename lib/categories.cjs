const DEFAULT_CATEGORIES=[
  {id:'meal',name:'식사',emoji:'🍚',tint:'#e8fbfa',estimateMin:9000,estimateMax:18000},
  {id:'cafe',name:'카페',emoji:'☕',tint:'#fff7e7',estimateMin:5000,estimateMax:9000},
  {id:'shop',name:'소품샵',emoji:'🎁',tint:'#fff1d1',estimateMin:5000,estimateMax:30000},
  {id:'craft',name:'공예',emoji:'🧶',tint:'#ffefd0',estimateMin:10000,estimateMax:40000},
  {id:'experience',name:'체험',emoji:'🥽',tint:'#fff3db',estimateMin:0,estimateMax:20000},
  {id:'sight',name:'관광',emoji:'🌿',tint:'#fff8e9',estimateMin:0,estimateMax:15000},
  {id:'stay',name:'숙소',emoji:'🛏️',tint:'#fff0d4',estimateMin:60000,estimateMax:150000},
  {id:'other',name:'기타',emoji:'📍',tint:'#fff7e8',estimateMin:null,estimateMax:null}
];
function planningEstimate(category,countryCode='kr'){
  if(countryCode!=='kr')return null;
  const c=DEFAULT_CATEGORIES.find(c=>c.id===category);
  if(c?.estimateMin==null||c?.estimateMax==null)return null;
  return {priceMin:c.estimateMin,priceMax:c.estimateMax,currency:'KRW',priceSource:'estimate',priceNote:'카테고리를 기준으로 계산한 여행 예산이에요. 실제 메뉴 가격이 아니므로 계획에 맞게 수정해 주세요.'};
}
module.exports={DEFAULT_CATEGORIES,planningEstimate};
