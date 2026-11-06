
'use client';

import { useState, useRef, useEffect } from 'react';
import type { DateRange } from 'react-day-picker';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon, KeyRound, Database, Download, Loader2, Upload, Lock, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Calendar } from '@/components/ui/calendar';
import { format, formatDistanceToNow, startOfDay, endOfDay, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAppData } from '@/context/app-data-provider';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '@/context/auth-provider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

function ActiveShiftsTable() {
    const { employees, locations, shifts } = useAppData();
    
    const activeShifts = shifts ? shifts.filter((shift) => !shift.clockOut) : [];

    const getShiftDuration = (clockIn: any) => {
        if (!clockIn) return '';
        const clockInDate = clockIn instanceof Timestamp ? clockIn.toDate() : new Date(clockIn);
        return formatDistanceToNow(clockInDate, { addSuffix: true, locale: es });
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Tiempo en Turno</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {activeShifts.length > 0 ? (
                    activeShifts.map((shift) => {
                        const employee = employees.find((e) => e.id === shift.employeeId);
                        const location = locations.find((l) => l.id === shift.locationId);
                        return (
                            <TableRow key={shift.id}>
                                <TableCell className="font-medium">{employee?.name}</TableCell>
                                <TableCell>{location?.name}</TableCell>
                                <TableCell>
                                    {getShiftDuration(shift.clockIn)}
                                </TableCell>
                            </TableRow>
                        );
                    })
                ) : (
                    <TableRow>
                        <TableCell colSpan={3} className="text-center">
                            No hay empleados en turno actualmente.
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    );
}

function AccessManagementCard() {
    const { 
        adminPassword, setAdminPassword, 
        userPassword, setUserPassword, 
        userPermissions, setUserPermissions 
    } = useAppData();
    const { toast } = useToast();
    const [newAdminPass, setNewAdminPass] = useState('');
    const [newUserPass, setNewUserPass] = useState('');
    const [permissions, setPermissions] = useState<Record<string, boolean>>(userPermissions);

    const handleSavePasswords = async () => {
        if (newAdminPass) await setAdminPassword(newAdminPass);
        if (newUserPass) await setUserPassword(newUserPass);
        toast({ title: 'Contraseñas actualizadas' });
        setNewAdminPass('');
        setNewUserPass('');
    };

    const handleTogglePermission = (path: string) => {
        const updated = { ...permissions, [path]: !permissions[path] };
        setPermissions(updated);
    };

    const handleSavePermissions = async () => {
        await setUserPermissions(permissions);
        toast({ title: 'Permisos de usuario actualizados' });
    };

    const modules = [
        { path: '/dashboard', label: 'Tablero' },
        { path: '/schedule', label: 'Horarios' },
        { path: '/timesheets', label: 'Hojas de Horas' },
        { path: '/employees', label: 'Empleados' },
        { path: '/reports', label: 'Reportes' },
        { path: '/payslips', label: 'Comprobantes' },
        { path: '/locations', label: 'Ubicaciones' },
        { path: '/holidays', label: 'Feriados' },
    ];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" /> Gestión de Accesos</CardTitle>
                <CardDescription>Configura contraseñas y permisos del rol Usuario.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-4">
                    <div className="grid gap-2">
                        <Label>Nueva Contraseña Admin</Label>
                        <Input type="password" placeholder="Dejar vacío para no cambiar" value={newAdminPass} onChange={e => setNewAdminPass(e.target.value)} />
                    </div>
                    <div className="grid gap-2">
                        <Label>Nueva Contraseña Usuario</Label>
                        <Input type="password" placeholder="Dejar vacío para no cambiar" value={newUserPass} onChange={e => setNewUserPass(e.target.value)} />
                    </div>
                    <Button onClick={handleSavePasswords} className="w-full">Actualizar Contraseñas</Button>
                </div>

                <div className="pt-4 border-t space-y-4">
                    <Label className="text-base font-bold">Permisos Rol Usuario</Label>
                    <div className="grid grid-cols-2 gap-4">
                        {modules.map(mod => (
                            <div key={mod.path} className="flex items-center space-x-2">
                                <Checkbox id={mod.path} checked={permissions[mod.path] || false} onCheckedChange={() => handleTogglePermission(mod.path)} />
                                <Label htmlFor={mod.path} className="cursor-pointer">{mod.label}</Label>
                            </div>
                        ))}
                    </div>
                    <Button variant="secondary" onClick={handleSavePermissions} className="w-full">
                        <ShieldCheck className="mr-2 h-4 w-4" /> Guardar Permisos
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function DataManagementCard() {
    const { employees, locations, shifts, payslips, schedule, holidays, manualAdjustments, deleteShiftsInRange, restoreData } = useAppData();
    const { toast } = useToast();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [isLoading, setIsLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setDateRange({
            from: startOfMonth(new Date()),
            to: new Date(),
        });
    }, []);

    const handleBackup = () => {
        const backupData = {
            version: "1.2",
            exportDate: new Date().toISOString(),
            employees,
            locations,
            shifts,
            payslips,
            schedule,
            holidays,
            manualAdjustments
        };

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `timewise_backup_${format(new Date(), 'yyyy-MM-dd_HHmm')}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast({ title: 'Respaldo Generado', description: 'Se ha descargado una copia de seguridad completa de la base de datos.' });
    };

    const handleRestoreClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target?.result as string;
                const backup = JSON.parse(content);
                
                const hasEmployees = Boolean(backup.employees || backup.collections?.employees);
                const hasLocations = Boolean(backup.locations || backup.collections?.locations);

                if (!hasEmployees && !hasLocations) {
                    throw new Error("Estructura de archivo inválida.");
                }

                await restoreData(backup);
                toast({ title: 'Éxito', description: 'Los datos han sido restaurados exitosamente.' });
            } catch (error) {
                console.error(error);
                toast({ title: 'Error', description: 'No se pudo procesar el archivo de respaldo.', variant: 'destructive' });
            } finally {
                setIsLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleDelete = async () => {
        if (!dateRange?.from || !dateRange?.to) {
            toast({ title: 'Error', description: 'Por favor, selecciona un rango de fechas.', variant: 'destructive' });
            return;
        }

        setIsLoading(true);
        try {
            const startDate = startOfDay(dateRange.from);
            const endDate = endOfDay(dateRange.to);
            
            await deleteShiftsInRange(startDate, endDate);
            toast({ title: 'Éxito', description: `Se han eliminado los registros de horas seleccionados.` });
            setIsDialogOpen(false);
        } catch (error) {
            console.error(error);
            toast({ title: 'Error', description: 'No se pudieron eliminar los registros.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-primary" />
                    Gestión de Datos y Copias de Seguridad
                </CardTitle>
                <CardDescription>Consulta el estado de la base de datos y genera o restaura respaldos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado de Base de Datos</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Conectado a Firestore
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                        <div className="flex justify-between py-1 border-b border-border/50">
                            <span className="text-muted-foreground">Empleados:</span>
                            <span className="font-semibold">{employees.length}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-border/50">
                            <span className="text-muted-foreground">Ubicaciones:</span>
                            <span className="font-semibold">{locations.length}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-border/50">
                            <span className="text-muted-foreground">Marcas de Tiempo:</span>
                            <span className="font-semibold">{shifts.length}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-border/50">
                            <span className="text-muted-foreground">Comprobantes de Pago:</span>
                            <span className="font-semibold">{payslips.length}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-border/50">
                            <span className="text-muted-foreground">Turnos / Horarios:</span>
                            <span className="font-semibold">{schedule.length}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-border/50">
                            <span className="text-muted-foreground">Ajustes Manuales:</span>
                            <span className="font-semibold">{manualAdjustments.length}</span>
                        </div>
                    </div>
                </div>

                <Button variant="default" className="w-full" onClick={handleBackup} disabled={isLoading}>
                    <Download className="mr-2 h-4 w-4" />
                    Descargar Respaldo Completo (JSON)
                </Button>

                <div className="hidden">
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" />
                </div>

                <Button variant="outline" className="w-full" onClick={handleRestoreClick} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    Restaurar Respaldo desde Archivo (JSON)
                </Button>

                 <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="w-full" disabled={isLoading}>
                            <Database className="mr-2 h-4 w-4" />
                            Borrar Registros de Horas
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Esta acción es irreversible. Se eliminarán permanentemente todos los registros del rango seleccionado.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="py-4 flex justify-center">
                            <Calendar
                                mode="range"
                                selected={dateRange}
                                onSelect={setDateRange}
                                className="rounded-md border"
                                initialFocus
                                locale={es}
                            />
                        </div>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete} disabled={isLoading || !dateRange?.from || !dateRange?.to}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Sí, eliminar registros
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    );
}


export default function DashboardPage() {
  const { setLogoUrl } = useAppData();
  const { role } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  const handleLogoUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          setLogoUrl(result);
          toast({
            title: 'Logo Actualizado',
            description: 'El nuevo logo ha sido cargado exitosamente.',
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-6">
        
        {role === 'admin' && (
            <>
                <Card>
                  <CardHeader>
                    <CardTitle>Configuración del Logo</CardTitle>
                    <CardDescription>Sube una imagen desde tu dispositivo.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden"
                      accept="image/*"
                    />
                    <Button onClick={handleLogoUploadClick} className="w-full">
                      <ImageIcon className="mr-2 h-4 w-4" /> Subir Logo
                    </Button>
                  </CardContent>
                </Card>
                
                <AccessManagementCard />

                <DataManagementCard />
            </>
        )}

      </div>

      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Actualmente en Turno</CardTitle>
            <CardDescription>
              Empleados que están actualmente en turno en todas las ubicaciones.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActiveShiftsTable />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
