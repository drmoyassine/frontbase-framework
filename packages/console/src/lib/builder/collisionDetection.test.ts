import {expect,it} from 'vitest';
import {builderCollisionDetection} from './collisionDetection';
const rect=(left:number,top:number,width:number,height:number)=>({left,top,width,height,right:left+width,bottom:top+height});
it('drops into a repeated Card under the pointer instead of the nearer root strip or huge parent',()=>{
 const boxes=new Map([['list',rect(0,0,800,6000)],['card',rect(0,100,800,500)],['after',rect(0,600,800,6)]]);
 const args:any={active:{id:'palette'},pointerCoordinates:{x:650,y:560},collisionRect:rect(600,510,100,100),droppableRects:boxes,droppableContainers:[...boxes.keys()].map(id=>({id,data:{current:{}},node:{current:null}}))};
 expect(builderCollisionDetection(args)[0].id).toBe('card');
 args.pointerCoordinates={x:650,y:602};expect(builderCollisionDetection(args)[0].id).toBe('after');
 args.pointerCoordinates=null;expect(builderCollisionDetection(args).length).toBeGreaterThan(0);
});
