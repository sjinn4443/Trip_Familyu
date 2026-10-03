const fs=require('node:fs/promises');const path=require('node:path');
const URL='https://api.frankfurter.dev/v2/rates?base=KRW&quotes=JPY,IDR,GBP,USD,EUR';
function parse(rows){if(!Array.isArray(rows))throw new Error('Invalid exchange-rate response.');const rates={KRW:1},dates={};for(const row of rows){const code=String(row.quote||'').toUpperCase();if(String(row.base).toUpperCase()==='KRW'&&['JPY','IDR','GBP','USD','EUR'].includes(code)&&Number.isFinite(row.rate)&&row.rate>0&&/^\d{4}-\d{2}-\d{2}$/.test(row.date)){rates[code]=row.rate;dates[code]=row.date;}}
  if(!['JPY','IDR','GBP'].every(c=>rates[c]))throw new Error('Required exchange rates are unavailable.');return {base:'KRW',rates,dates,fetchedAt:new Date().toISOString(),source:'Frankfurter',sourceUrl:'https://frankfurter.dev/'};
}
function createService(directory){const file=path.join(directory,'fx.json');let cached=null,pending=null,retryAfter=0;
  async function get(){if(!cached){try{cached=JSON.parse(await fs.readFile(file,'utf8'));parse(Object.entries(cached.dates).map(([quote,date])=>({base:'KRW',quote,date,rate:cached.rates[quote]})));}catch{cached=null;}}
    const age=cached?Date.now()-Date.parse(cached.fetchedAt):Infinity;if(age<6*3600000)return {...cached,stale:false};if(Date.now()<retryAfter)return cached?{...cached,stale:true}:{unavailable:true};
    if(!pending)pending=(async()=>{try{const response=await fetch(URL,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Exchange-rate lookup failed.');cached=parse(await response.json());await fs.mkdir(directory,{recursive:true});await fs.writeFile(file,JSON.stringify(cached,null,2));return {...cached,stale:false};}catch(error){console.warn('Exchange rates:',error.message);retryAfter=Date.now()+20*60000;return cached?{...cached,stale:true}:{unavailable:true};}finally{pending=null;}})();return pending;
  }return {get};
}
module.exports={URL,parse,createService};
