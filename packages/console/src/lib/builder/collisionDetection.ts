import {closestCenter,pointerWithin,type CollisionDetection} from '@dnd-kit/core';

/** A repeated list can be thousands of pixels high: nearest-center alone picks
 * a distant root strip even when the pointer is inside an item. Prefer the
 * smallest actual hit, preserving keyboard/empty-space fallback behavior. */
export const builderCollisionDetection:CollisionDetection=args=>{
    const hits=pointerWithin(args);
    if(!hits.length)return closestCenter(args);
    return [...hits].sort((left,right)=>{
        const a=args.droppableRects.get(left.id),b=args.droppableRects.get(right.id);
        return (a?a.width*a.height:Infinity)-(b?b.width*b.height:Infinity);
    }).slice(0,1);
};
