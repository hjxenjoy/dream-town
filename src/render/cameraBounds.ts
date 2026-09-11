/** At overview zoom, lock an axis when its viewport is wider than the valley. */
export function valleyCameraCenter(x:number,y:number,width:number,height:number,zoom:number){
  const clampAxis=(center:number,size:number,min:number,max:number)=>size>=max-min?(min+max)/2:Math.max(min+size/2,Math.min(max-size/2,center));
  return {x:clampAxis(x,width/zoom,-3300,3300),y:clampAxis(y,height/zoom,-600,3500)};
}
