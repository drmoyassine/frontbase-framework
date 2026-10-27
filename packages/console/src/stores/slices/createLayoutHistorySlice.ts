import type {StateCreator} from 'zustand';
import type {BuilderState} from '../builder';
import type {Page} from '@/types/builder';
type Frame={pageId:string;layout:NonNullable<Page['layoutData']>};
export interface LayoutHistorySlice{layoutUndo:Frame[];layoutRedo:Frame[];undoLayout:()=>void;redoLayout:()=>void;}
export const createLayoutHistorySlice:StateCreator<BuilderState,[],[],LayoutHistorySlice>=(set,get)=>({
    layoutUndo:[],layoutRedo:[],
    undoLayout:()=>{
        const state=get(),frame=state.layoutUndo.at(-1),page=state.pages.find(page=>page.id===state.currentPageId);
        if(!frame||frame.pageId!==page?.id||!page.layoutData)return;
        set({pages:state.pages.map(value=>value.id===page.id?{...value,layoutData:structuredClone(frame.layout)}:value),layoutUndo:state.layoutUndo.slice(0,-1),layoutRedo:[...state.layoutRedo,{pageId:page.id,layout:structuredClone(page.layoutData)}],selectedComponentId:null,hasUnsavedChanges:true});
    },
    redoLayout:()=>{
        const state=get(),frame=state.layoutRedo.at(-1),page=state.pages.find(page=>page.id===state.currentPageId);
        if(!frame||frame.pageId!==page?.id||!page.layoutData)return;
        set({pages:state.pages.map(value=>value.id===page.id?{...value,layoutData:structuredClone(frame.layout)}:value),layoutRedo:state.layoutRedo.slice(0,-1),layoutUndo:[...state.layoutUndo,{pageId:page.id,layout:structuredClone(page.layoutData)}],selectedComponentId:null,hasUnsavedChanges:true});
    },
});
