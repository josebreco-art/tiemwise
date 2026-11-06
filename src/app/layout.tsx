import type { Metadata } from 'next';
import { PT_Sans } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { RootProvider } from '@/components/root-provider';

const ptSans = PT_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-pt-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TimeWise Dining',
  description: 'Employee time management and payroll tracking for modern restaurants',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${ptSans.variable}`} suppressHydrationWarning>
      <body className="font-body antialiased min-h-screen bg-background">
        <RootProvider>{children}</RootProvider>
        <Toaster />
      </body>
    </html>
  );
}
