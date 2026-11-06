'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/app-layout';
import { AppDataProvider } from '@/context/app-data-provider';
import { AuthProvider } from '@/context/auth-provider';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { usePathname } from 'next/navigation';

/**
 * AppLayoutSelector decides whether to wrap children in the admin sidebar layout
 * or render them as a plain public page (like /welcome).
 */
function AppLayoutSelector({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent hydration mismatch by waiting for the client to mount
  if (!mounted) {
    return <div className="min-h-screen bg-background" />;
  }

  // Check if we are on a public page
  const isPublicPage = pathname === '/welcome' || pathname === '/';

  if (isPublicPage) {
    return <div className="min-h-screen bg-muted/50">{children}</div>;
  }

  // Admin pages use the full sidebar layout
  return <AppLayout>{children}</AppLayout>;
}

export function RootProvider({ children }: { children: React.ReactNode }) {
  return (
    <FirebaseClientProvider>
      <AppDataProvider>
        <AuthProvider>
          <AppLayoutSelector>{children}</AppLayoutSelector>
        </AuthProvider>
      </AppDataProvider>
    </FirebaseClientProvider>
  );
}
