const {test}=require('node:test');const assert=require('node:assert/strict');const Money=require('../public/money.js');const {parse}=require('../lib/fx.cjs');
const fx={rates:{KRW:1,JPY:.1,IDR:12,GBP:.0005},dates:{JPY:'2026-10-02',IDR:'2026-10-02',GBP:'2026-10-02'}};
test('four currencies use the same dated snapshot and correct conversion direction',()=>{
 assert.equal(Money.convert(10000,'KRW','IDR',fx),120000);assert.equal(Money.convert(5,'GBP','KRW',fx),10000);
 assert.deepEqual(Money.ranges({priceMin:10000,priceMax:20000,currency:'KRW'},fx).map(r=>r.currency),['KRW','JPY','IDR','GBP']);
 assert.match(Money.dateLabel(fx),/2026년 10월 2일/);assert.match(Money.ranges({priceMin:10000,priceMax:10000,currency:'KRW'},fx).at(-1).label,/5\.00/);
});
test('missing rates and unknown prices stay unavailable instead of becoming zero',()=>{
 assert.equal(Money.convert(10000,'KRW','JPY',null),null);assert.equal(Money.convert(null,'KRW','KRW',fx),null);
 assert.ok(Money.ranges({priceMin:null,priceMax:null,currency:'KRW'},fx).every(r=>r.label==='—'));
 assert.throws(()=>parse([{base:'KRW',quote:'JPY',date:'2026-10-02',rate:-1}]));
 const data=parse(['JPY','IDR','GBP'].map(quote=>({base:'KRW',quote,date:'2026-10-02',rate:fx.rates[quote]})));assert.equal(data.dates.GBP,'2026-10-02');
});
