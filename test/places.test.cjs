const {test}=require('node:test');
const assert=require('node:assert/strict');
const {googleURL,parseURL,parseHTML,parseEmbed,parseStructuredBusiness,categoryFor}=require('../lib/places.cjs');
const {planningEstimate}=require('../lib/categories.cjs');
test('only allows HTTPS Google Maps links and blocks redirect targets outside Maps',()=>{
  for(const url of ['http://maps.app.goo.gl/a','https://example.com/maps','https://www.google.com/search?q=test','https://maps.app.goo.gl.evil.test/a','https://user:pass@maps.app.goo.gl/a','https://maps.app.goo.gl:8443/a','https://goo.gl/not-maps'])assert.throws(()=>googleURL(url));
  assert.equal(googleURL('https://maps.app.goo.gl/gDx7Z3bHyi9CUefn6').hostname,'maps.app.goo.gl');
});
test('uses place coordinates instead of a different camera position',()=>{
  const place=parseURL('https://www.google.com/maps/place/Some+Cafe/@55.85,-4.23,14z/data=!3d35.0985959!4d129.01033599853514');
  assert.equal(place.name,'Some Cafe');assert.equal(place.location.lat,35.0985959);
  assert.equal(parseURL('https://www.google.com/maps/place/Some+Cafe/@55.85,-4.23,14z').location,null);
});
test('parses coordinate search links without inventing a place name',()=>{
  const place=parseURL('https://www.google.com/maps/search/?api=1&query=35.1,129.1');assert.equal(place.name,'');assert.deepEqual(place.location,{lat:35.1,lng:129.1});
});
test('reads selected feature coordinates from nested Maps state, excluding viewport',()=>{
  const id='0x3568e9a54a6e8fe7:0xebc48d7689bf2696';
  const feature=[id,'고양이의여행',null,[null,null,35.0985959,129.01033599853514]];
  const state=[[[17916,-4.2369024,55.8519725]],null,")]}'\n"+JSON.stringify([feature])];
  const html=`<script>window.APP_INITIALIZATION_STATE=${JSON.stringify(state)};window.NEXT=1;</script>`;
  const result=parseHTML(html,{googleId:id,location:null});assert.equal(result.name,'고양이의여행');assert.equal(result.location.lat,35.0985959);assert.equal(result.location.lng,129.01033599853514);
});
test('category inference treats cafes, restaurants and gift shops separately',()=>{
  assert.equal(categoryFor(['coffee_shop']),'cafe');assert.equal(categoryFor(['restaurant']),'meal');assert.equal(categoryFor(['gift_shop']),'shop');assert.equal(categoryFor([],'이름만 있는 곳'),'other');
});
test('embed details extract the selected store address, ignoring another business',()=>{
  const id='0x123:0x456';const store=[];store[0]=[id,'Store',[37.56744,126.92906],'1110'];store[1]='Banul';store[12]='Knit shop';store[13]='15 Yeonhui-ro 11ga-gil, Seoul';store[31]='바늘이야기';
  const other=[];other[0]=['0x789:0xabc','Other',[35.1,129.1],'2220'];other[1]='Other store';other[13]='Busan';
  const parsed=parseEmbed('initEmbed('+JSON.stringify([other,store])+');',{googleId:id,name:'바늘이야기 banul'});
  assert.equal(parsed.name,'바늘이야기 banul');assert.equal(parsed.address,store[13]);assert.equal(parsed.location.lat,37.56744);assert.equal(parsed.category,'craft');
});
test('public structured business data supplies exact address and coordinates',()=>{
  const business={'@type':'Restaurant',name:'후다PHO',geo:{latitude:37.506527,longitude:127.0873432},address:{streetAddress:'삼전로9길 19',addressLocality:'송파구',addressRegion:'서울특별시'}};
  const result=parseStructuredBusiness('<script type="application/ld+json">'+JSON.stringify(business)+'</script>');
  assert.equal(result.location.lng,127.0873432);assert.ok(result.address.includes('삼전로9길 19'));assert.equal(result.priceMin,undefined);
});
test('automatic planning budgets are explicitly estimates and do not claim a menu price',()=>{
  assert.equal(categoryFor([], '후다Pho'),'meal');assert.equal(categoryFor([], 'Trying Samsung Galaxy XR'),'experience');
  const price=planningEstimate('meal');assert.equal(price.priceSource,'estimate');assert.equal(price.currency,'KRW');assert.match(price.priceNote,/실제 메뉴 가격이 아니/);
  assert.equal(planningEstimate('other'),null);assert.equal(planningEstimate('meal','us'),null);
});
