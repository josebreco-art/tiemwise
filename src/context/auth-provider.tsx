'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAppData } from '@/context/app-data-provider';

type UserRole = 'admin' | 'user' | null;

interface AuthContextType {
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  role: UserRole;
  login: (password: string, targetRole: 'admin' | 'user') => boolean;
  logout: () => void;
  changePassword: (oldPass: string, newPass: string) => Promise<boolean>;
  hasPermission: (path: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_AUTH_KEY = 'app-session-auth';
const SESSION_ROLE_KEY = 'app-session-role';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { adminPassword, userPassword, userPermissions, isLoading: isAppDataLoading, setAdminPassword } = useAppData();
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<UserRole>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== 'undefined' && !isAppDataLoading) {
      const sessionAuth = sessionStorage.getItem(SESSION_AUTH_KEY);
      const sessionRole = sessionStorage.getItem(SESSION_ROLE_KEY) as UserRole;
      if (sessionAuth === 'true') {
        setIsAuthenticated(true);
        setRole(sessionRole);
      }
      setIsAuthLoading(false);
    }
  }, [isAppDataLoading]);

  const login = (password: string, targetRole: 'admin' | 'user') => {
    const requiredPass = targetRole === 'admin' ? adminPassword : userPassword;
    
    if (password === requiredPass) {
      sessionStorage.setItem(SESSION_AUTH_KEY, 'true');
      sessionStorage.setItem(SESSION_ROLE_KEY, targetRole);
      setIsAuthenticated(true);
      setRole(targetRole);
      return true;
    }
    return false;
  };

  const logout = () => {
    sessionStorage.removeItem(SESSION_AUTH_KEY);
    sessionStorage.removeItem(SESSION_ROLE_KEY);
    setIsAuthenticated(false);
    setRole(null);
    window.location.href = '/welcome';
  };

  const changePassword = async (oldPass: string, newPass: string) => {
    if (oldPass === adminPassword) {
      await setAdminPassword(newPass);
      return true;
    }
    return false;
  };

  const hasPermission = (path: string) => {
    if (role === 'admin') return true;
    if (role === 'user') {
      return !!userPermissions[path];
    }
    return false;
  }

  if ((isAuthLoading || isAppDataLoading) && !pathname.startsWith('/welcome') && pathname !== '/') {
      return (
        <div className="flex h-screen w-full items-center justify-center">
            <p>Verificando acceso seguro...</p>
        </div>
      );
  }

  const value = {
    isAuthenticated,
    isAuthLoading,
    role,
    login,
    logout,
    changePassword,
    hasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
