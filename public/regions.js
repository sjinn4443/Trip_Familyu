(function(root){
  const regions={geoje:{name:'거제도',dates:'11월 20일–22일',bounds:[[34.65,128.40],[35.09,128.86]],center:[34.88,128.62],zoom:11,minZoom:9}};
  function inRegion(place,key){const r=regions[key];return !!r&&typeof place.lat==='number'&&typeof place.lng==='number'&&place.lat>=r.bounds[0][0]&&place.lat<=r.bounds[1][0]&&place.lng>=r.bounds[0][1]&&place.lng<=r.bounds[1][1];}
  function regionFor(place){return inRegion(place,'geoje')?'geoje':'other';}
  const api={regions,inRegion,regionFor};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TripRegions=api;
})(typeof window!=='undefined'?window:globalThis);
