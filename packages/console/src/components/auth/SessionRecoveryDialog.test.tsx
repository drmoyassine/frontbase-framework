import React,{useState} from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
const auth=vi.hoisted(()=>({isAuthenticated:true,isLoading:false}));
vi.mock('@/lib/auth/useAuth',()=>({useAuth:()=>auth}));
import {ProtectedRoute} from './ProtectedRoute';
import {SessionRecoveryController,configureSessionRecovery} from '@/lib/sessionRecovery';
afterEach(()=>{cleanup();auth.isAuthenticated=true;});
it('keeps the exact unsaved editor mounted during expired-session recovery and same-identity resume',async()=>{
 Object.assign(window.location,{pathname:'/frontbase-admin/builder/123',search:'?tab=options',hash:'#element'});
 const identity={id:'owner',tenant:'tenant',role:'admin'};const probe=vi.fn<any>().mockResolvedValueOnce({status:'unauthenticated'}).mockResolvedValueOnce({status:'authenticated',identity,user:{id:'owner'},tenant:null});
 const controller=new SessionRecoveryController({identity:()=>identity,probe,invalid:()=>{auth.isAuthenticated=false;},recovered:()=>{auth.isAuthenticated=true;}});configureSessionRecovery(controller);
 function Editor(){const [text,setText]=useState('');return <input aria-label="Draft" value={text} onChange={e=>setText(e.target.value)}/>;}
 render(<MemoryRouter initialEntries={['/builder/123?tab=options#element']}><Routes><Route path="/builder/:id" element={<ProtectedRoute><Editor/></ProtectedRoute>}/><Route path="/login" element={<p>Sign-in route</p>}/></Routes></MemoryRouter>);fireEvent.change(screen.getByRole('textbox',{name:'Draft'}),{target:{value:'unsaved draft'}});
 await act(()=>controller.report());expect(screen.queryByRole('alertdialog')).not.toBeNull();expect(screen.getByDisplayValue('unsaved draft')).toBeInTheDocument();expect(screen.getByRole('link',{name:'Sign in in a new tab'})).toHaveAttribute('target','_blank');expect(screen.getByRole('link',{name:'Sign in in a new tab'})).toHaveAttribute('href','/frontbase-admin/login?reauth=1&returnTo=%2Fbuilder%2F123%3Ftab%3Doptions%23element');
 fireEvent.click(screen.getByRole('button',{name:'Check session and continue'}));await act(async()=>{});expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();expect(screen.getByRole('textbox',{name:'Draft'})).toHaveValue('unsaved draft');
});
