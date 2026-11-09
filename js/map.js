'use strict';
window.MapView = (() => {
  const WIDTH=1419, HEIGHT=2048;
  const paths={default:'assets/gta_5_map.webp'};
  let map,overlay,style='default',markers=new Map(),clickHandler=null;
  const bounds=[[0,0],[HEIGHT,WIDTH]];
  function init(onClick){clickHandler=onClick;map=L.map('map',{crs:L.CRS.Simple,minZoom:-3,maxZoom:3,zoomSnap:.25,zoomDelta:.5,attributionControl:false,zoomControl:true});overlay=L.imageOverlay(paths[style],bounds,{interactive:false}).addTo(map);map.fitBounds(bounds);map.setMaxBounds([[-HEIGHT*.35,-WIDTH*.35],[HEIGHT*1.35,WIDTH*1.35]]);map.on('click',e=>clickHandler?.(e.latlng));}
  function setStyle(next){if(!paths[next])return;style=next;if(overlay)overlay.setUrl(paths[style]);}
  function popupContent(p,editable,onEdit){
    const wrap=document.createElement('div');
    const name=document.createElement('div');name.className='popup-name';name.textContent=p.name;wrap.append(name);
    if(p.description){const desc=document.createElement('div');desc.className='popup-desc';desc.textContent=p.description;wrap.append(desc);}
    if(editable){const button=document.createElement('button');button.className='popup-edit';button.textContent='Edit checkpoint';button.addEventListener('click',e=>{e.stopPropagation();map.closePopup();onEdit(p.id);});wrap.append(button);}
    return wrap;
  }
  function render(points,onSelect,completed=new Set()){
    if(!map)return;
    for(const marker of markers.values())marker.remove();markers.clear();
    for(const p of points){
      const icon=L.divIcon({className:'',html:`<div class="checkpoint-pin ${completed.has(p.id)?'checkpoint-done':''}" style="background:${p.color}"></div>`,iconSize:[22,22],iconAnchor:[11,11]});
      const marker=L.marker([p.y*HEIGHT,p.x*WIDTH],{icon,bubblingMouseEvents:false}).addTo(map);
      // Attach a stable popup once. Closing it does not unbind it.
      marker.bindPopup(document.createElement('div'));
      marker.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);onSelect(p.id);});
      markers.set(p.id,marker);
    }
  }
  function focus(p){const marker=markers.get(p.id);if(!marker)return;map.setView(marker.getLatLng(),Math.max(map.getZoom(),0),{animate:true});}
  function showPopup(p,editable,onEdit){
    const marker=markers.get(p.id);if(!marker)return;
    marker.getPopup().setContent(popupContent(p,editable,onEdit));
    marker.openPopup();
  }
  function fit(){map?.fitBounds(bounds);}function refresh(){setTimeout(()=>map?.invalidateSize(),230);}
  function normalize(latlng){return {x:latlng.lng/WIDTH,y:latlng.lat/HEIGHT};}
  function inBounds(p){return p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;}
  return {init,setStyle,render,focus,showPopup,fit,refresh,normalize,inBounds,getStyle:()=>style};
})();
