
'use client';

import { useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2, Pencil, Loader2, RotateCcw } from 'lucide-react';
import { type EmployeeWithId, type Employee } from '@/lib/data';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAppData } from '@/context/app-data-provider';
import type { FaceCaptureHandle } from '@/components/face-capture';
import { Badge } from '@/components/ui/badge';

const FaceCapture = dynamic(() => import('@/components/face-capture'), { 
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-4">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Cargando cámara...
    </div>
  )
});

export default function EmployeesPage() {
  const { employees, addEmployee, updateEmployee, deleteEmployee } = useAppData();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const faceCaptureRef = useRef<FaceCaptureHandle>(null);
  
  const initialNewEmployeeState = {
    name: '',
    cedula: '',
    phone: '',
    hourlyRate: 0,
    hourlyRateCedi: 0,
    cajaRetentionRate: 9.34,
    initialLoanAmount: 0,
    loanAmount: 0,
    loanPayment: 0,
    savingsAmount: 0,
    savingsPayment: 0,
    vacationDaysAccrued: 0,
    vacationDaysTaken: 0,
    faceDescriptor: undefined,
  };

  const [newEmployee, setNewEmployee] = useState(initialNewEmployeeState);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeWithId | null>(null);
  const [faceDescriptor, setFaceDescriptor] = useState<string | undefined>(undefined);

  const { toast } = useToast();

  const handleFaceCaptured = (descriptor: Float32Array | null) => {
    setFaceDescriptor(descriptor ? JSON.stringify(Array.from(descriptor)) : undefined);
  };

  const handleAddEmployee = () => {
    if (!newEmployee.name || !newEmployee.cedula || newEmployee.hourlyRate <= 0) {
       toast({ title: 'Error', description: 'Nombre, cédula y tarifa son obligatorios.', variant: 'destructive' });
      return;
    }
    
    addEmployee({ 
      ...newEmployee, 
      faceDescriptor: faceDescriptor || undefined, 
      loanAmount: newEmployee.initialLoanAmount 
    } as Partial<Employee>);
    setIsAddDialogOpen(false);
    toast({ title: 'Empleado Añadido' });
  };

  const handleEditEmployee = () => {
    if (!editingEmployee) return;
    
    updateEmployee(editingEmployee.id, { 
      ...editingEmployee, 
      faceDescriptor: faceDescriptor || undefined
    } as Partial<Employee>);
    setIsEditDialogOpen(false);
    toast({ title: 'Cambios Guardados' });
  };

  const handleResetVacations = () => {
    if (!editingEmployee) return;
    setEditingEmployee({ ...editingEmployee, vacationDaysTaken: 0 });
    toast({ title: 'Vacaciones Reiniciadas', description: 'Los días disfrutados se han puesto en cero.' });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><h1 className="text-2xl font-bold font-headline">Gestión de Personal</h1><p className="text-muted-foreground">Administra perfiles y finanzas.</p></div>
        <Button onClick={() => { setNewEmployee(initialNewEmployeeState); setFaceDescriptor(undefined); setIsAddDialogOpen(true); }}>
          <PlusCircle className="mr-2 h-4 w-4" /> Añadir Empleado
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tarifas (₡)</TableHead>
                <TableHead>Préstamo (₡)</TableHead>
                <TableHead>Ahorro (₡)</TableHead>
                <TableHead>Vacaciones</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="py-4">
                    <div className="font-bold">{employee.name}</div>
                    <div className="text-[10px] text-muted-foreground">{employee.faceDescriptor ? '✓ Rostro Registrado' : '⚠ Sin Biometría'}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs">POS: <span className="font-mono font-bold text-primary">₡{(employee.hourlyRate ?? 0).toFixed(0)}</span></div>
                    <div className="text-xs">CEDI: <span className="font-mono font-bold text-orange-600">₡{(employee.hourlyRateCedi ?? employee.hourlyRate ?? 0).toFixed(0)}</span></div>
                  </TableCell>
                  <TableCell className={employee.loanAmount && employee.loanAmount > 0 ? "text-destructive font-medium" : ""}>
                    <div>₡{(employee.loanAmount || 0).toLocaleString()}</div>
                    {employee.loanPayment ? <div className="text-[10px] text-muted-foreground font-normal">Cuota: ₡{employee.loanPayment.toLocaleString()}</div> : null}
                  </TableCell>
                  <TableCell className="text-primary font-medium">
                    <div>₡{(employee.savingsAmount || 0).toLocaleString()}</div>
                    {employee.savingsPayment ? <div className="text-[10px] text-emerald-600 font-medium">Cuota: ₡{employee.savingsPayment.toLocaleString()}</div> : null}
                  </TableCell>
                  <TableCell><Badge variant="outline">{(employee.vacationDaysAccrued || 0) - (employee.vacationDaysTaken || 0)} d</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => { setEditingEmployee(employee); setFaceDescriptor(employee.faceDescriptor); setIsEditDialogOpen(true); }}><Pencil className="h-4 w-4 text-primary" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar a {employee.name}?</AlertDialogTitle>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteEmployee(employee.id)} className="bg-destructive">Eliminar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[650px] overflow-y-auto max-h-[90vh]">
          <DialogHeader><DialogTitle>Nuevo Empleado</DialogTitle></DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nombre</Label><Input value={newEmployee.name} onChange={(e) => setNewEmployee({...newEmployee, name: e.target.value})} /></div>
              <div className="space-y-2"><Label>Cédula</Label><Input value={newEmployee.cedula} onChange={(e) => setNewEmployee({...newEmployee, cedula: e.target.value})} /></div>
            </div>
            <FaceCapture ref={faceCaptureRef} onFaceCaptured={handleFaceCaptured} />
            <div className="grid grid-cols-2 gap-4 bg-muted/20 p-4 rounded-lg">
              <div className="space-y-2"><Label>Tarifa POS (₡)</Label><Input type="number" value={newEmployee.hourlyRate} onChange={(e) => setNewEmployee({...newEmployee, hourlyRate: Number(e.target.value)})} /></div>
              <div className="space-y-2"><Label>Tarifa CEDI (₡)</Label><Input type="number" value={newEmployee.hourlyRateCedi} onChange={(e) => setNewEmployee({...newEmployee, hourlyRateCedi: Number(e.target.value)})} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4 bg-muted/20 p-4 rounded-lg">
              <div className="space-y-2"><Label>Saldo Préstamo Inicial (₡)</Label><Input type="number" value={newEmployee.initialLoanAmount} onChange={(e) => setNewEmployee({...newEmployee, initialLoanAmount: Number(e.target.value)})} /></div>
              <div className="space-y-2"><Label>Cuota Préstamo (₡)</Label><Input type="number" value={newEmployee.loanPayment} onChange={(e) => setNewEmployee({...newEmployee, loanPayment: Number(e.target.value)})} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4 bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-lg">
              <div className="space-y-2"><Label className="text-emerald-700 dark:text-emerald-400 font-semibold">Saldo Ahorro Inicial (₡)</Label><Input type="number" value={newEmployee.savingsAmount} onChange={(e) => setNewEmployee({...newEmployee, savingsAmount: Number(e.target.value)})} /></div>
              <div className="space-y-2"><Label className="text-emerald-700 dark:text-emerald-400 font-bold">Cuota de Ahorro (₡)</Label><Input type="number" placeholder="Ej: 5000" value={newEmployee.savingsPayment} onChange={(e) => setNewEmployee({...newEmployee, savingsPayment: Number(e.target.value)})} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Retención Caja (%)</Label><Input type="number" value={newEmployee.cajaRetentionRate} onChange={(e) => setNewEmployee({...newEmployee, cajaRetentionRate: Number(e.target.value)})} /></div>
              <div className="space-y-2"><Label>Teléfono</Label><Input value={newEmployee.phone} onChange={(e) => setNewEmployee({...newEmployee, phone: e.target.value})} /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={handleAddEmployee}>Registrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[650px] overflow-y-auto max-h-[90vh]">
          <DialogHeader><DialogTitle>Editar Perfil</DialogTitle></DialogHeader>
          {editingEmployee && (
            <div className="grid gap-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Nombre</Label><Input value={editingEmployee.name} onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Cédula</Label><Input value={editingEmployee.cedula} onChange={(e) => setEditingEmployee({ ...editingEmployee, cedula: e.target.value })} /></div>
              </div>
              <FaceCapture ref={faceCaptureRef} onFaceCaptured={handleFaceCaptured} initialDescriptor={editingEmployee.faceDescriptor} />
              
              <div className="grid grid-cols-2 gap-4 bg-primary/5 p-4 border border-primary/10 rounded-lg">
                <div className="space-y-2"><Label className="text-primary font-bold">Tarifa POS (₡)</Label><Input type="number" value={editingEmployee.hourlyRate} onChange={(e) => setEditingEmployee({...editingEmployee, hourlyRate: Number(e.target.value)})} /></div>
                <div className="space-y-2"><Label className="text-orange-600 font-bold">Tarifa CEDI (₡)</Label><Input type="number" value={editingEmployee.hourlyRateCedi} onChange={(e) => setEditingEmployee({...editingEmployee, hourlyRateCedi: Number(e.target.value)})} /></div>
              </div>

              {/* Préstamo */}
              <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg">
                <div className="space-y-2">
                  <Label>Saldo Préstamo (₡)</Label>
                  <Input type="number" value={editingEmployee.loanAmount ?? 0} onChange={(e) => setEditingEmployee({...editingEmployee, loanAmount: Number(e.target.value)})} />
                </div>
                <div className="space-y-2">
                  <Label>Cuota Préstamo (₡)</Label>
                  <Input type="number" value={editingEmployee.loanPayment ?? 0} onChange={(e) => setEditingEmployee({...editingEmployee, loanPayment: Number(e.target.value)})} />
                </div>
              </div>

              {/* Ahorro */}
              <div className="grid grid-cols-2 gap-4 bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-lg">
                <div className="space-y-2">
                  <Label className="text-emerald-700 dark:text-emerald-400 font-semibold">Saldo Ahorro (₡)</Label>
                  <Input type="number" value={editingEmployee.savingsAmount ?? 0} onChange={(e) => setEditingEmployee({...editingEmployee, savingsAmount: Number(e.target.value)})} />
                </div>
                <div className="space-y-2">
                  <Label className="text-emerald-700 dark:text-emerald-400 font-bold">Cuota de Ahorro (₡)</Label>
                  <Input type="number" placeholder="Ej: 5000" value={editingEmployee.savingsPayment ?? 0} onChange={(e) => setEditingEmployee({...editingEmployee, savingsPayment: Number(e.target.value)})} />
                  <p className="text-[10px] text-muted-foreground">Monto que se deduce periódicamente en comprobantes</p>
                </div>
              </div>

              {/* Vacaciones */}
              <div className="grid grid-cols-1 gap-4 bg-muted/30 p-4 rounded-lg">
                <div className="space-y-2">
                    <Label>Vacaciones Acumuladas (días)</Label>
                    <div className="flex gap-2">
                        <Input type="number" value={editingEmployee.vacationDaysAccrued ?? 0} onChange={(e) => setEditingEmployee({...editingEmployee, vacationDaysAccrued: Number(e.target.value)})} />
                        <Button variant="outline" size="icon" title="Reiniciar disfrutadas" onClick={handleResetVacations}><RotateCcw className="h-4 w-4" /></Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Disfrutadas: {editingEmployee.vacationDaysTaken || 0}d (Saldo neto disponible: {((editingEmployee.vacationDaysAccrued || 0) - (editingEmployee.vacationDaysTaken || 0))} días)</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                 <div className="space-y-2"><Label>Retención Caja (%)</Label><Input type="number" value={editingEmployee.cajaRetentionRate} onChange={(e) => setEditingEmployee({...editingEmployee, cajaRetentionRate: Number(e.target.value)})} /></div>
                 <div className="space-y-2"><Label>Teléfono</Label><Input value={editingEmployee.phone || ''} onChange={(e) => setEditingEmployee({...editingEmployee, phone: e.target.value})} /></div>
              </div>
            </div>
          )}
          <DialogFooter><Button onClick={handleEditEmployee}>Guardar Cambios</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
