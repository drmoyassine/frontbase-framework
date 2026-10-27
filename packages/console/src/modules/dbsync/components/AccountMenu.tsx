import { ChevronDown, LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function AccountMenu({ logout }: { logout: () => Promise<void> }) {
    const user = useAuthStore(state => state.user);
    const navigate = useNavigate();
    const { theme = 'system', setTheme } = useTheme();
    const name = user?.username || user?.email?.split('@')[0] || 'Account';
    return <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <button aria-label="Open account menu" className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">{name.slice(0, 1).toUpperCase()}</span>
                <span className="hidden sm:inline max-w-40 truncate text-sm font-medium">{name}</span>
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)]">
            <DropdownMenuLabel>
                <div className="truncate">{name}</div>
                <div className="truncate text-xs font-normal text-muted-foreground" title={user?.email}>{user?.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/settings')}><Settings className="mr-2 h-4 w-4" />Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="flex items-center justify-between gap-2 px-2 py-1">
            <DropdownMenuLabel className="p-0 text-xs text-muted-foreground">Appearance</DropdownMenuLabel>
            <DropdownMenuRadioGroup className="flex shrink-0 rounded-md border bg-muted/40 p-0.5" value={theme} onValueChange={value => {
                if (['light', 'dark', 'system'].includes(value)) setTheme(value);
            }}>
                {([
                    { value: 'light', label: 'Light', Icon: Sun },
                    { value: 'dark', label: 'Dark', Icon: Moon },
                    { value: 'system', label: 'System', Icon: Monitor },
                ] as const).map(({ value, label, Icon }) => <DropdownMenuRadioItem
                    key={value} value={value} aria-label={label} title={label}
                    onSelect={event => event.preventDefault()}
                    className="flex h-7 w-7 items-center justify-center rounded-sm p-0 cursor-pointer [&>span]:hidden data-[state=checked]:bg-background data-[state=checked]:text-primary data-[state=checked]:shadow-sm data-[state=checked]:ring-1 data-[state=checked]:ring-border focus:ring-2 focus:ring-primary"
                ><Icon aria-hidden="true" className="h-3.5 w-3.5" /></DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600 dark:text-red-400" onSelect={() => { void logout(); }}><LogOut className="mr-2 h-4 w-4" />Log out</DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>;
}
