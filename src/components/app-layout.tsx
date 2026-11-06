
'use client';

import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarInset,
  SidebarTrigger,
  SidebarFooter,
  SidebarGroup,
} from '@/components/ui/sidebar';
import { NavLinks } from '@/components/nav-links';
import { Logo } from '@/components/icons';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { useAppData } from '@/context/app-data-provider';
import { useAuth } from '@/context/auth-provider';
import { PasswordPrompt } from '@/components/password-prompt';
import { BreakNotifier } from '@/components/break-notifier';
import { ShiftAutoCloser } from '@/components/shift-auto-closer';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { logoUrl } = useAppData();
  const { isAuthenticated, logout, isAuthLoading } = useAuth();
  
  if (isAuthLoading) {
    return (
        <div className="flex h-screen w-full items-center justify-center">
            <p>Cargando...</p>
        </div>
    );
  }

  if (!isAuthenticated) {
    return <PasswordPrompt />;
  }
  
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <SidebarGroup>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="shrink-0 h-10 w-10 relative flex items-center justify-center">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="App Logo"
                    className="max-h-8 max-w-8 object-contain"
                  />
                ) : (
                  <Logo className="size-5 text-primary" />
                )}
              </Button>
              <span className="font-headline text-lg font-semibold text-primary">
                TimeWise Dining
              </span>
            </div>
          </SidebarGroup>
        </SidebarHeader>
        <SidebarContent>
          <NavLinks />
        </SidebarContent>
        <SidebarFooter>
            <Button variant="ghost" onClick={logout}>Cerrar Sesión</Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex items-center justify-between p-4 border-b">
            <SidebarTrigger />
        </header>
        <main className="p-4 md:p-6">
          <ShiftAutoCloser />
          <BreakNotifier />
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
