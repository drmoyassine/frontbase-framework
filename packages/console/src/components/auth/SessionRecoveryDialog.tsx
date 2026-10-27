import {useSyncExternalStore} from 'react';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter} from '@/components/ui/alert-dialog';
import {Button} from '@/components/ui/button';
import {BASE_PATH} from '@/lib/edition';
import {recoverySnapshot,subscribeRecovery,retrySession,safeAdminReturn} from '@/lib/sessionRecovery';
export function SessionRecoveryDialog(){
    const state=useSyncExternalStore(subscribeRecovery,recoverySnapshot,recoverySnapshot);
    const path=window.location.pathname.startsWith(BASE_PATH)?window.location.pathname.slice(BASE_PATH.length):'/dashboard';
    const target=safeAdminReturn(path+window.location.search+window.location.hash);
    return <AlertDialog open={state.status!=='idle'}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{state.status==='checking'?'Checking your session…':'Sign in again'}</AlertDialogTitle><AlertDialogDescription>{state.message||'Confirming your administrator session.'} Your unsaved work stays open in this tab. After signing in, return here and check your session, then retry the action that failed.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><Button asChild variant="outline"><a href={`${BASE_PATH}/login?reauth=1&returnTo=${encodeURIComponent(target)}`} target="_blank" rel="noopener noreferrer">Sign in in a new tab</a></Button><Button disabled={state.status==='checking'} onClick={()=>void retrySession()}>Check session and continue</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
