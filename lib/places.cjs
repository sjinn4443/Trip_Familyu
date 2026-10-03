const GOOGLE_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'maps.google.com', 'www.google.com', 'google.com', 'maps.google.co.kr', 'www.google.co.kr', 'google.co.kr']);
const CATEGORIES = { meal: '🍚', cafe: '☕', shop: '🎁', sight: '🌿', stay: '🛏️', other: '📍' };
const {planningEstimate}=require('./categories.cjs');
const {regionFor}=require('../public/regions.js');
const Hours=require('../public/hours.js');

function googleURL(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error('구글 지도 공유 링크를 붙여넣어 주세요.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !GOOGLE_HOSTS.has(url.hostname.toLowerCase())) throw new Error('HTTPS로 시작하는 구글 지도 링크를 사용해 주세요.');
  if (['www.google.com', 'google.com', 'www.google.co.kr', 'google.co.kr'].includes(url.hostname) && !url.pathname.startsWith('/maps')) throw new Error('구글 지도 장소 링크를 사용해 주세요.');
  if (url.hostname === 'goo.gl' && !url.pathname.startsWith('/maps/')) throw new Error('구글 지도 공유 링크만 지원해요.');
  return url;
}
function coords(lat, lng) {
  lat = Number(lat); lng = Number(lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
function parseURL(value) {
  const url = googleURL(value);
  let decoded; try { decoded = decodeURIComponent(url.href); } catch { decoded = url.href; }
  let location = null;
  // !3d/!4d are the place coordinates; @ is often only the camera position.
  const pair = decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pair) location = coords(pair[1], pair[2]);
  const q = url.searchParams.get('query') || url.searchParams.get('q') || '';
  const queryCoords = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!location && queryCoords) location = coords(queryCoords[1], queryCoords[2]);
  const nameMatch = decoded.match(/\/maps\/place\/([^/]+)/);
  const name = nameMatch ? nameMatch[1].replace(/\+/g, ' ') : queryCoords ? '' : q;
  const id = decoded.match(/!1s((?:0x[\da-f]+:0x[\da-f]+|ChI[^!/?&]+))/i)?.[1] || url.searchParams.get('query_place_id') || '';
  return { name, location, placeId: id.startsWith('ChI') ? id : '', googleId: id, expandedUrl: url.href };
}
function unescapeHTML(text) {
  return String(text).replace(/&#(\d+);/g, (_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}
function parseHTML(html, initial) {
  const result = { ...initial };
  const stateMatch = html.match(/window\.APP_INITIALIZATION_STATE\s*=\s*([\s\S]*?);window\./);
  let state;
  try { state = JSON.parse(stateMatch?.[1] || 'null'); } catch {}
  let best = null;
  function visit(node, depth = 0) {
    if (depth > 24) return;
    if (Array.isArray(node)) {
      // Place record: [feature id, title, ..., [null,null,lat,lng], ...].
      if (typeof node[0] === 'string' && /^0x[\da-f]+:0x[\da-f]+$/i.test(node[0]) && typeof node[1] === 'string') {
        const point = node.find(x => Array.isArray(x) && x.length === 4 && x[0] === null && x[1] === null && typeof x[2] === 'number' && typeof x[3] === 'number' && coords(x[2], x[3]));
        if (point && (!initial.googleId || initial.googleId === node[0])) best = { name: node[1], location: coords(point[2],point[3]), googleId: node[0] };
      }
      for (const item of node) visit(item, depth + 1);
    } else if (typeof node === 'string' && node.startsWith(")]}'")) {
      try { visit(JSON.parse(node.slice(node.indexOf('\n') + 1)), depth + 1); } catch {}
    }
  }
  visit(state);
  if (best) Object.assign(result,best);
  const title = html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:title"/i)?.[1] || html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)?.[1];
  if (!result.name && title && !['Google Maps','Google 지도'].includes(title)) result.name = unescapeHTML(title).split(' · ')[0].replace(/ - (?:Google Maps|Google 지도)$/, '');
  // Some Maps pages put the selected place's coordinates inside a static-map image.
  if (!result.location && title && !['Google Maps','Google 지도'].includes(title)) {
    const center = html.match(/staticmap[^"<>]*center=(-?\d+(?:\.\d+)?)(?:%2C|,)(-?\d+(?:\.\d+)?)/i);
    if (center) result.location = coords(center[1],center[2]);
  }
  return result;
}
function parsePrice(text){
  const m=String(text||'').match(/₩\s*([\d,]+)\s*(?:–|—|-|~|to)\s*₩?\s*([\d,]+)/i);
  if(!m)return null;const min=Number(m[1].replaceAll(',','')),max=Number(m[2].replaceAll(',',''));
  return min<=max&&max<1e9?{priceMin:min,priceMax:max,currency:'KRW',priceSource:'google',priceNote:'구글 지도에 표시된 가격 범위예요. 방문 전 최신 메뉴를 확인해 주세요.'}:null;
}
function parseEmbed(html,initial={}){
  const match=html.match(/initEmbed\((\[[\s\S]*?)\);/);let data;try{data=JSON.parse(match?.[1]||'null');}catch{return initial;}
  let selected=null;
  function walk(node,depth=0){
    if(!Array.isArray(node)||depth>24)return;
    if(Array.isArray(node[0])&&typeof node[0][0]==='string'&&/^0x[\da-f]+:0x[\da-f]+$/i.test(node[0][0])&&typeof node[1]==='string'&&Array.isArray(node[0][2])){
      const location=coords(node[0][2][0],node[0][2][1]);
      if(location&&(!initial.googleId||initial.googleId===node[0][0])){
        selected={...initial,name:initial.name||node[31]||node[1],location,googleId:node[0][0],placeId:node[27]||initial.placeId,address:typeof node[13]==='string'?node[13]:Array.isArray(node[2])?node[2].join(', '):'',addressSource:'google',category:categoryFor([String(node[12]||'').toLowerCase().replaceAll(' ','_')],node[31]||node[1])};
        try{selected.openingHours=Hours.fromEmbed(node[39]?.[0])||initial.openingHours||null;}catch{} 
        function prices(v,d=0){if(d>10)return;if(typeof v==='string'){const p=parsePrice(v);if(p)Object.assign(selected,p);}else if(Array.isArray(v))v.forEach(x=>prices(x,d+1));}prices(node);
      }
    }
    node.forEach(x=>walk(x,depth+1));
  }walk(data);return selected||initial;
}
function parseStructuredBusiness(html,initial={}){
  let result={...initial};
  for(const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    let data;try{data=JSON.parse(match[1]);}catch{continue;}
    function walk(v){if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return;}
      if(v.name&&v.geo&&v.address){const location=coords(v.geo.latitude,v.geo.longitude);if(location&&(!initial.location||distance(initial.location,location)<1)){
        const address=typeof v.address==='string'?v.address:[v.address.streetAddress,v.address.addressLocality,v.address.addressRegion,v.address.addressCountry].filter(Boolean).join(', ');
        result={...result,name:initial.name||v.name,location,address,addressSource:'business-page',...parsePrice(v.priceRange)};
        try{result.openingHours=Hours.fromSchema(v.openingHoursSpecification)||result.openingHours||null;}catch{}
      }}if(v['@graph'])walk(v['@graph']);
    }walk(data);
  }return result;
}
async function fetchGoogle(value) {
  let url = googleURL(value);
  for (let hop = 0; hop < 7; hop++) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'HereTogether/1.0', 'Accept-Language':'ko-KR,ko;q=0.9,en;q=0.7', 'Cookie':'SOCS=CAI' } });
    if ([301,302,303,307,308].includes(response.status)) {
      const target = response.headers.get('location');
      if (!target) throw new Error('구글 지도 링크가 올바르지 않아요.');
      url = googleURL(new URL(target,url).href);
      await response.body?.cancel();
      continue;
    }
    if (!response.ok) throw new Error('구글 지도에서 장소 정보를 읽지 못했어요.');
    const reader = response.body.getReader(); let size = 0; const chunks = [];
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.length;
      if (size > 4_000_000) { await reader.cancel(); throw new Error('페이지가 너무 커서 링크에 포함된 정보를 사용해요.'); }
      chunks.push(Buffer.from(chunk.value));
    }
    return { url: url.href, html: Buffer.concat(chunks).toString('utf8') };
  }
  throw new Error('구글 지도 링크의 이동 단계가 너무 많아요.');
}
function categoryFor(types = [], name = '') {
  if(types.some(t=>/knit|craft|yarn/.test(t))||/바늘|뜨개|knit|yarn|craft/i.test(name))return 'craft';
  if(/galaxy.?xr|체험|experience/i.test(name))return 'experience';
  if (types.some(t=> /cafe|coffee_shop|tea_house/.test(t)) || /카페|커피|coffee|cafe|café/i.test(name)) return 'cafe';
  if (types.some(t=> /restaurant|meal_|bakery|food/.test(t)) || /식당|국밥|분식|식사|쌀국수|pho|restaurant/i.test(name)) return 'meal';
  if (types.some(t=> /gift_shop|store|shopping/.test(t)) || /소품|선물|문구|상점|기프트|고양이의여행/.test(name)) return 'shop';
  if (types.some(t=> /lodging|hotel/.test(t))) return 'stay';
  if (types.some(t=> /tourist_attraction|park|museum|beach/.test(t))) return 'sight';
  return 'other';
}
async function enrich(place, key) {
  const mask = 'id,displayName,formattedAddress,location,types,priceLevel,priceRange,googleMapsUri,attributions,regularOpeningHours,businessStatus';
  let url, options;
  const headers = {'X-Goog-Api-Key':key,'X-Goog-FieldMask':place.placeId ? mask : mask.split(',').map(x=>'places.'+x).join(',')};
  if (place.placeId) {
    url = `https://places.googleapis.com/v1/places/${encodeURIComponent(place.placeId)}?languageCode=ko`;
    options = { headers };
  } else {
    if (!place.name) return place;
    url = 'https://places.googleapis.com/v1/places:searchText';
    const body = { textQuery: place.name, languageCode:'ko', pageSize:1 };
    if (place.location) body.locationBias = { circle: { center: { latitude:place.location.lat, longitude:place.location.lng }, radius:1000 } };
    options = { method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body) };
  }
  const response = await fetch(url,{...options,signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('구글 Places API 설정을 확인해 주세요. 링크의 기본 정보는 사용할 수 있어요.');
  const data = await response.json(); const p = place.placeId ? data : data.places?.[0];
  if (!p) return place;
  const location = p.location ? coords(p.location.latitude,p.location.longitude) : place.location;
  // Do not silently replace a resolved pin with a namesake in another city.
  if (place.location && location && distance(place.location,location) > 5) return place;
  return { ...place, name:p.displayName?.text || place.name, location, address:p.formattedAddress || '', category:categoryFor(p.types,p.displayName?.text), placeId:p.id, priceLevel:p.priceLevel || null, priceRange:p.priceRange || null, openingHours:Hours.fromGoogle(p.regularOpeningHours)||place.openingHours||null,businessStatus:p.businessStatus||'',attributions:p.attributions || [], source:'google-places' };
}
async function resolve(value, key, categories=[]) {
  let place = { ...parseURL(value), source:'google-link', address:'', priceLevel:null,priceRange:null };
  const warnings = [];
  try {
    const page = await fetchGoogle(value);
    place = parseHTML(page.html,{...place,...parseURL(page.url)});
    place = parseStructuredBusiness(page.html,parseEmbed(page.html,place));
    const cidFromURL=new URL(place.expandedUrl).searchParams.get('cid');
    if((/^0x[\da-f]+:0x[\da-f]+$/i.test(place.googleId)||/^\d+$/.test(cidFromURL||''))&&(!place.address||!place.openingHours)){
      try{const cid=cidFromURL||BigInt(place.googleId.split(':')[1]).toString();const detail=await fetchGoogle(`https://www.google.com/maps?cid=${cid}&output=embed&hl=ko`);place=parseEmbed(detail.html,place);}catch(error){console.warn('Maps details:',error.message);}
    }
  } catch (error) { console.warn('Maps lookup:',error.message,error.cause?.code||''); warnings.push('구글 지도 페이지를 읽지 못했어요. 장소 이름과 지도 위치를 확인해 주세요.'); }
  place.category ||= categoryFor([],place.name);
  if (key) { try { place = await enrich(place,key); } catch (error) { warnings.push(error.message); } }
  if (!place.location) warnings.push('정확한 위치를 찾지 못했어요. 저장 후 자동 확인하거나 지도를 눌러 위치를 지정해 주세요.');
  if(place.location&&!place.address){const area=regionFor(place.location);place.address=area==='geoje'?'경상남도 거제시':`${place.location.lat.toFixed(5)}, ${place.location.lng.toFixed(5)}`;place.addressSource='map-region';}
  if(place.priceRange){const min=place.priceRange.startPrice,max=place.priceRange.endPrice;const number=p=>p?Number(p.units||0)+Number(p.nanos||0)/1e9:null;place.priceMin=number(min);place.priceMax=number(max);place.currency=min?.currencyCode||max?.currencyCode||'KRW';place.priceSource='google';place.priceNote='구글 Places에서 확인한 가격 범위예요.';}
  if(place.priceMin==null&&place.priceMax==null&&place.location&&place.location.lat>=33&&place.location.lat<=39&&place.location.lng>=124&&place.location.lng<=132){const custom=categories.find(c=>c.id===place.category);const estimate=custom?.estimateMin!=null&&custom?.estimateMax!=null?{priceMin:custom.estimateMin,priceMax:custom.estimateMax,currency:'KRW',priceSource:'estimate',priceNote:'카테고리 기준 예상 예산이에요. 실제 메뉴 가격과 다를 수 있어요.'}:planningEstimate(place.category);if(estimate)Object.assign(place,estimate);}
  return { ...place, originalUrl:googleURL(value).href, warnings };
}
function distance(a,b) {
  const rad=x=>x*Math.PI/180; const dlat=rad(b.lat-a.lat),dlng=rad(b.lng-a.lng);
  const h=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlng/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
module.exports={googleURL,parseURL,parseHTML,parseEmbed,parseStructuredBusiness,parsePrice,coords,resolve,categoryFor,distance,CATEGORIES};
