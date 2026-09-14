import { MAP_SIZE, TILE_W, TILE_H } from '../sim/terrain.ts';
/** At overview zoom, lock an axis when its viewport is wider than the valley. */
export function valleyCameraCenter(x:number,y:number,width:number,height:number,zoom:number){
  const clampAxis=(center:number,size:number,min:number,max:number)=>size>=max-min?(min+max)/2:Math.max(min+size/2,Math.min(max-size/2,center));
  return {x:clampAxis(x,width/zoom,-MAP_SIZE*TILE_W/2-516,MAP_SIZE*TILE_W/2+516),y:clampAxis(y,height/zoom,-600,MAP_SIZE*TILE_H+716)};
}
