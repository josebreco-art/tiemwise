
'use client';

import {
  BarChart3,
  Building2,
  Calendar,
  ClipboardList,
  Clock,
  Users,
  Receipt,
  Gift,
  Fingerprint,
  LayoutDashboard,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { useAuth } from '@/context/auth-provider';

const navLinksConfig = [
  {
    href: '/dashboard',
    label: 'Tablero',
    icon: LayoutDashboard,
  },
  {
    href: '/welcome',
    label: 'Marcar Asistencia',
    icon: Fingerprint,
  },
  {
    href: '/schedule',
    label: 'Horario',
    icon: Calendar,
  },
  {
    href: '/timesheets',
    label: 'Hojas de Horas',
    icon: ClipboardList,
  },
    {
    href: '/employees',
    label: 'Empleados',
    icon: Users,
  },
  {
    href: '/reports',
    label: 'Reportes',
    icon: BarChart3,
  },
  {
    href: '/payslips',
    label: 'Comprobante de Pago',
    icon: Receipt,
  },
  {
    href: '/locations',
    label: 'Ubicaciones',
    icon: Building2,
  },
  {
    href: '/holidays',
    label: 'Días Feriados',
    icon: Gift,
  }
];

export function NavLinks() {
  const pathname = usePathname();
  const { hasPermission } = useAuth();

  return (
    <SidebarMenu>
      {navLinksConfig.filter(link => hasPermission(link.href)).map((link) => {
        const Icon = link.icon;
        return (
          <SidebarMenuItem key={link.href}>
            <SidebarMenuButton
              asChild
              isActive={pathname === link.href}
              tooltip={link.label}
            >
              <Link href={link.href}>
                <Icon />
                <span>{link.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
