'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShieldCheck, User, KeyRound } from 'lucide-react';

export function PasswordPrompt() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('admin');
  const router = useRouter();

  const handleLogin = () => {
    const success = login(password, role);
    if (!success) {
      toast({
        title: 'Error de Autenticación',
        description: 'La contraseña es incorrecta para este rol.',
        variant: 'destructive',
      });
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <Dialog open={true}>
      <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" /> Acceso al Sistema
          </DialogTitle>
          <DialogDescription>
            Selecciona tu perfil e introduce la contraseña.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="admin" onValueChange={(v) => setRole(v as any)} className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="admin" className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Admin
            </TabsTrigger>
            <TabsTrigger value="user" className="flex items-center gap-2">
              <User className="h-4 w-4" /> Usuario
            </TabsTrigger>
          </TabsList>
          <div className="py-6 space-y-4">
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">
                Iniciando sesión como: <span className="text-foreground font-bold uppercase">{role === 'admin' ? 'Administrador' : 'Usuario General'}</span>
              </p>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyPress}
              className="text-center"
              autoFocus
            />
          </div>
        </Tabs>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => router.push('/welcome')}>Volver</Button>
          <Button onClick={handleLogin} className="w-full sm:flex-1">Entrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
