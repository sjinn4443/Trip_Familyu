const {test}=require('node:test');const assert=require('node:assert/strict');const {regionFor,inRegion}=require('../public/regions.js');
test('Geoje places across the island belong to the family view',()=>{for(const p of [{lat:34.88,lng:128.62},{lat:34.76,lng:128.66},{lat:34.96,lng:128.70}]){assert.equal(regionFor(p),'geoje');assert.equal(inRegion(p,'geoje'),true);}});
test('unlocated places and other cities remain outside Geoje',()=>{for(const p of [{lat:35.18,lng:129.08},{lat:37.56,lng:126.98},{lat:null,lng:null},{lat:'34.88',lng:'128.62'}])assert.equal(regionFor(p),'other');});
