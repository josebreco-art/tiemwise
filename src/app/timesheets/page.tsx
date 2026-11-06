'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Clock, Calendar as CalendarIcon, ShieldCheck, PlusCircle, Search, Trash2, History, UserCheck, Store, Building2, AlertTriangle, Info } from 'lucide-react';
import { format, differenceInMinutes, subDays, isWithinInterval, startOfDay, endOfDay, parse, parseISO, addMinutes, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { Badge } from '@/components/ui/badge';
import { useAppData } from '@/context/app-data-provider';
import { Timestamp } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { ManualAdjustment } from '@/lib/data';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function ManualAdjustmentForm({ onComplete }: { onComplete: () => void }) {
  const { employees, locations, addManualAdjustment, addShift, shifts } = useAppData();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState<Partial<ManualAdjustment>>({
    employeeId: '',
    locationId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    totalHours: 0,
    reason: '',
    supervisorSignature: '',
    status: 'pending'
  });

  const toDate = (date: any): Date => {
    if (date instanceof Timestamp) return date.toDate();
    if (date instanceof Date) return date;
    const d = new Date(date);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  const selectedEmployee = employees.find(e => e.id === formData.employeeId);

  const existingHours = useMemo(() => {
    if (!formData.employeeId || !formData.date) return 0;
    const targetDate = parseISO(formData.date);
    return shifts
      .filter(s => s.employeeId === formData.employeeId && s.clockOut && isSameDay(toDate(s.clockIn), targetDate))
      .reduce((acc, s) => {
          const inD = toDate(s.clockIn);
          const outD = s.clockOut ? toDate(s.clockOut) : inD;
          if (outD <= inD) return acc;
          return acc + (differenceInMinutes(outD, inD) / 60);
      }, 0);
  }, [formData.employeeId, formData.date, shifts]);

  const totals = useMemo(() => {
    const manual = Number(formData.totalHours) || 0;
    const grandTotal = existingHours + manual;
    const regular = Math.min(grandTotal, 8);
    const overtime = Math.max(0, grandTotal - 8);
    return { manual, grandTotal, regular, overtime };
  }, [existingHours, formData.totalHours]);

  const handleSubmit = (asApproved: boolean) => {
    if (!formData.employeeId || !formData.locationId || !formData.supervisorSignature || !formData.totalHours) {
      toast({ title: 'Datos incompletos', description: 'Por favor complete todos los campos.', variant: 'destructive' });
      return;
    }

    const adjustmentData: Partial<ManualAdjustment> = {
      ...formData,
      employeeName: selectedEmployee?.name || '',
      cedula: selectedEmployee?.cedula || '',
      totalHours: totals.manual,
      regularHours: Math.max(0, totals.regular - Math.min(existingHours, 8)),
      overtimeHours: Math.max(0, totals.overtime - Math.max(0, existingHours - 8)),
      status: asApproved ? 'approved' : 'pending',
    };

    addManualAdjustment(adjustmentData);

    if (asApproved) {
      const shiftDate = parseISO(formData.date!);
      const clockIn = parse('08:00', 'HH:mm', shiftDate);
      const clockOut = addMinutes(clockIn, totals.manual * 60);
      addShift({ employeeId: formData.employeeId, locationId: formData.locationId, clockIn, clockOut, approved: true });
    }

    toast({ title: 'Éxito', description: `Registro manual guardado.` });
    onComplete();
  };

  return (
    <div className="space-y-6 py-4">
      <div className="bg-primary/5 p-4 rounded-lg border border-primary/20 flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <p className="text-sm font-medium">Asignación Directa de Horas: Se sumarán a las marcas del día.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Empleado</Label>
          <Select onValueChange={(val) => setFormData({...formData, employeeId: val})}>
            <SelectTrigger><SelectValue placeholder="Buscar..." /></SelectTrigger>
            <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label>Ubicación</Label>
          <Select onValueChange={(val) => setFormData({...formData, locationId: val})}>
            <SelectTrigger><SelectValue placeholder="Ubicación..." /></SelectTrigger>
            <SelectContent>{locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label>Fecha</Label><Input type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} /></div>
        <div className="space-y-2"><Label>Horas Adicionales</Label><Input type="number" step="0.5" value={formData.totalHours || ''} onChange={(e) => setFormData({...formData, totalHours: parseFloat(e.target.value) || 0})} /></div>
      </div>
      <div className="space-y-2"><Label>Motivo</Label><Textarea placeholder="Justificación..." value={formData.reason} onChange={(e) => setFormData({...formData, reason: e.target.value})} /></div>
      <div className="space-y-2"><Label>Validado por (Supervisor)</Label><Input placeholder="Tu nombre" value={formData.supervisorSignature} onChange={(e) => setFormData({...formData, supervisorSignature: e.target.value})} /></div>
      <div className="flex gap-2 justify-end pt-4 border-t">
        <Button variant="outline" onClick={() => onComplete()}>Cancelar</Button>
        <Button variant="secondary" onClick={() => handleSubmit(false)}>Guardar Pendiente</Button>
        <Button onClick={() => handleSubmit(true)}>Aprobar y Registrar</Button>
      </div>
    </div>
  );
}

export default function TimesheetsPage() {
  const { employees, locations, shifts, updateShift, deleteShift, manualAdjustments, deleteManualAdjustment } = useAppData();
  const [date, setDate] = useState<DateRange | undefined>();
  const [isManualDialogOpen, setIsManualDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteShiftId, setDeleteShiftId] = useState<string | null>(null);
  const [deleteAdjustmentId, setDeleteAdjustmentId] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setIsMounted(true);
    const today = new Date();
    setDate({ from: subDays(today, 7), to: today });
  }, []);

  const toDate = (date: any): Date => {
    if (date instanceof Timestamp) return date.toDate();
    if (date instanceof Date) return date;
    const d = new Date(date);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  const filteredEmployees = useMemo(() => {
    if (!isMounted || !date?.from) return [];
    const start = startOfDay(date.from);
    const end = date.to ? endOfDay(date.to) : endOfDay(date.from);

    return employees.filter(emp => {
      const employeeShifts = shifts.filter(s => s.employeeId === emp.id && isWithinInterval(toDate(s.clockIn), { start, end }));
      const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            emp.cedula.includes(searchTerm);
      return employeeShifts.length > 0 && matchesSearch;
    });
  }, [employees, shifts, date, searchTerm, isMounted]);

  const filteredAdjustments = useMemo(() => {
    if (!isMounted || !date?.from) return [];
    const start = startOfDay(date.from);
    const end = date.to ? endOfDay(date.to) : endOfDay(date.from);

    return manualAdjustments.filter(adj => {
        const adjDate = parseISO(adj.date);
        const matchesDate = isWithinInterval(adjDate, { start, end });
        const matchesSearch = adj.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             adj.cedula.includes(searchTerm);
        return matchesDate && matchesSearch;
    }).sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());
  }, [manualAdjustments, date, searchTerm, isMounted]);

  const handleApproveAll = (employeeId: string) => {
    if (!date?.from) return;
    const start = startOfDay(date.from);
    const end = date.to ? endOfDay(date.to) : endOfDay(date.from);
    const pending = shifts.filter(s => s.employeeId === employeeId && !s.approved && isWithinInterval(toDate(s.clockIn), { start, end }));
    pending.forEach(s => updateShift(s.id, { approved: true }));
    toast({ title: 'Éxito', description: `Marcas aprobadas.` });
  };

  if (!isMounted) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
              <h1 className="text-2xl font-bold font-headline">Revisión de Marcas</h1>
              <p className="text-muted-foreground">Gestión de tiempos, auditoría y ajustes manuales.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()} className="hidden sm:flex"><History className="mr-2 h-4 w-4" /> Imprimir</Button>
            <Button onClick={() => setIsManualDialogOpen(true)}><PlusCircle className="mr-2 h-4 w-4" /> Registro Manual</Button>
          </div>
      </div>

      <Card className="bg-muted/30 border-primary/20">
        <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-grow relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Buscar por nombre o cédula..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        className="pl-10" 
                    />
                </div>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full md:w-[300px] justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date?.from ? (
                                date.to ? (
                                    <>{format(date.from, 'dd/MM/yy', { locale: es })} - {format(date.to, 'dd/MM/yy', { locale: es })}</>
                                ) : (
                                    format(date.from, 'dd/MM/yy', { locale: es })
                                )
                            ) : (
                                <span>Seleccionar Rango de Fecha</span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                        <Calendar mode="range" selected={date} onSelect={setDate} locale={es} />
                    </PopoverContent>
                </Popover>
            </div>
        </CardContent>
      </Card>

      <Alert variant="default" className="bg-blue-50 border-blue-200">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertTitle className="text-blue-800 text-sm">Control de Ubicación (Geofencing)</AlertTitle>
        <AlertDescription className="text-blue-700 text-xs leading-relaxed">
          El sistema bloquea tanto la <strong>entrada como la salida</strong> fuera del local.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="regular" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="regular" className="flex items-center gap-2">
                <Clock className="h-4 w-4" /> Marcas Biométricas
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
                <History className="h-4 w-4" /> Historial de Ajustes
            </TabsTrigger>
        </TabsList>
        
        <TabsContent value="regular" className="space-y-4 pt-4">
            {filteredEmployees.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border rounded-lg bg-card">
                    Sin registros biométricos coincidentes.
                </div>
            ) : (
                <Accordion type="single" collapsible className="w-full space-y-2">
                  {filteredEmployees.map((employee) => {
                    const start = startOfDay(date!.from!);
                    const end = date?.to ? endOfDay(date.to) : endOfDay(date!.from!);
                    const employeeShifts = shifts.filter(s => s.employeeId === employee.id && isWithinInterval(toDate(s.clockIn), { start, end }));
                    
                    let posMins = 0;
                    let cediMins = 0;
                    let unknownMins = 0;

                    employeeShifts.forEach(s => {
                        let loc = locations.find(l => l.id === s.locationId);
                        if (!loc) loc = locations.find(l => l.name?.trim().toLowerCase() === s.locationId?.trim().toLowerCase());

                        if (s.clockOut) {
                            const inDate = toDate(s.clockIn);
                            const outDate = toDate(s.clockOut);
                            const diff = differenceInMinutes(outDate, inDate);
                            
                            if (diff > 0) {
                                const isCedi = loc?.type === 'CEDI' || 
                                               loc?.name?.toLowerCase().includes('cedi') || 
                                               loc?.name?.toLowerCase().includes('distribu');

                                if (isCedi) {
                                    cediMins += diff;
                                } else if (loc) {
                                    posMins += diff; 
                                } else {
                                    unknownMins += diff;
                                }
                            }
                        }
                    });

                    return (
                      <AccordionItem value={employee.id} key={employee.id} className="border rounded-lg bg-card px-4 shadow-sm">
                        <AccordionTrigger className="hover:no-underline py-4">
                          <div className="flex justify-between items-center w-full pr-4 text-left">
                            <div className="flex flex-col items-start">
                                <span className="font-bold text-base">{employee.name}</span>
                                <span className="text-xs text-muted-foreground">{employee.cedula}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="hidden sm:flex items-center gap-2 text-[10px] font-bold">
                                    <Badge variant="outline" className="border-primary/30 flex gap-1 bg-green-50/50 text-primary">
                                        <Store className="h-3 w-3" /> Punto Venta: {(posMins / 60).toFixed(1)}h
                                    </Badge>
                                    <Badge variant="outline" className="border-orange-300 flex gap-1 bg-orange-50/50 text-orange-600">
                                        <Building2 className="h-3 w-3" /> CEDI: {(cediMins / 60).toFixed(1)}h
                                    </Badge>
                                    {unknownMins > 0 && (
                                      <Badge variant="destructive" className="flex gap-1">
                                          <AlertTriangle className="h-3 w-3" /> Error: {(unknownMins / 60).toFixed(1)}h
                                      </Badge>
                                    )}
                                </div>
                                <Badge variant="secondary" className="text-[10px]">{employeeShifts.length} marcas</Badge>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="flex justify-end mb-4">
                             <Button size="sm" onClick={() => handleApproveAll(employee.id)}>Aprobar Todo el Rango</Button>
                          </div>
                          <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Entrada</TableHead>
                                    <TableHead>Salida</TableHead>
                                    <TableHead>Ubicación</TableHead>
                                    <TableHead className="text-center">Horas</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                              {employeeShifts.map((shift) => {
                                let location = locations.find(l => l.id === shift.locationId);
                                if (!location) location = locations.find(l => l.name?.trim().toLowerCase() === shift.locationId?.trim().toLowerCase());

                                const locName = location?.name || 'Local Desconocido';
                                const isCedi = location?.type === 'CEDI' || locName.toLowerCase().includes('cedi');
                                const inD = toDate(shift.clockIn);
                                const outD = shift.clockOut ? toDate(shift.clockOut) : null;
                                const isInvalid = outD && outD < inD;
                                const durationHours = outD && !isInvalid ? (differenceInMinutes(outD, inD) / 60) : 0;

                                return (
                                <TableRow key={shift.id} className={isInvalid ? "bg-red-50" : ""}>
                                  <TableCell>{format(inD, 'dd/MM/yy', { locale: es })}</TableCell>
                                  <TableCell className="font-mono text-xs">{format(inD, 'p', {locale: es})}</TableCell>
                                  <TableCell className="font-mono text-xs">
                                    {shift.clockOut ? (
                                        <span className={isInvalid ? "text-destructive font-bold flex items-center gap-1" : ""}>
                                            <span title="Salida anterior a entrada">
                                                {format(outD!, 'p', {locale: es})}
                                                {isInvalid && <AlertTriangle className="h-3 w-3 inline ml-1" />}
                                            </span>
                                        </span>
                                    ) : (
                                        <Badge variant="secondary">En turno</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                      <div className="flex items-center gap-2">
                                          {!location ? (
                                            <span title="Ubicación no encontrada">
                                              <AlertTriangle className="h-3 w-3 text-destructive" />
                                            </span>
                                          ) : isCedi ? (
                                            <Building2 className="h-3 w-3 text-orange-600" />
                                          ) : (
                                            <Store className="h-3 w-3 text-primary" />
                                          )}
                                          <div className="flex flex-col">
                                            <span className="text-xs font-medium">{locName}</span>
                                            <span className="text-[10px] text-muted-foreground uppercase">{location?.type || (isCedi ? 'CEDI' : 'POS')}</span>
                                          </div>
                                      </div>
                                  </TableCell>
                                  <TableCell className="text-center font-mono font-bold text-primary text-xs">
                                    <div>{shift.clockOut && !isInvalid ? `${durationHours.toFixed(2)}h` : '-'}</div>
                                    {shift.breaks && shift.breaks.length > 0 && (
                                      <div className="flex flex-wrap items-center justify-center gap-1 mt-0.5">
                                        <span className="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-sans font-medium">
                                          ☕ {shift.totalBreakMinutes || shift.breaks.reduce((a, b) => a + (b.durationMinutes || 0), 0)}m
                                        </span>
                                        {shift.excessBreakMinutes && shift.excessBreakMinutes > 0 ? (
                                          <span className="text-[9px] bg-red-100 text-red-800 px-1 py-0.2 rounded font-sans font-bold">
                                            +{shift.excessBreakMinutes}m
                                          </span>
                                        ) : null}
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {shift.approved ? (
                                        <Badge className="bg-green-100 text-green-800 border-green-200 text-[10px]">Aprobada</Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-orange-600 border-orange-200 text-[10px]">Pendiente</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteShiftId(shift.id)}>
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              )})}
                            </TableBody>
                          </Table>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
            )}
        </TabsContent>

        <TabsContent value="manual" className="pt-4">
            <Card>
                <CardHeader>
                    <CardTitle>Historial de Ajustes Manuales</CardTitle>
                    <CardDescription>Horas adicionales agregadas por supervisión.</CardDescription>
                </CardHeader>
                <CardContent>
                    {filteredAdjustments.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground">No se encontraron ajustes.</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Empleado</TableHead>
                                    <TableHead className="text-right">Horas</TableHead>
                                    <TableHead>Motivo</TableHead>
                                    <TableHead>Supervisor</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredAdjustments.map((adj) => (
                                    <TableRow key={adj.id}>
                                        <TableCell className="font-medium">{format(parseISO(adj.date), 'dd/MM/yy', { locale: es })}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col text-xs">
                                                <span className="font-bold">{adj.employeeName}</span>
                                                <span className="text-muted-foreground">{adj.cedula}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-primary">
                                            <div className="flex flex-col items-end">
                                                <span>+{adj.totalHours}h</span>
                                                <span className="text-[10px] text-muted-foreground">({adj.regularHours}r / {adj.overtimeHours}e)</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="max-w-[180px] truncate text-xs italic">&quot;{adj.reason}&quot;</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1 text-[10px] font-medium bg-muted px-2 py-1 rounded">
                                                <UserCheck className="h-3 w-3" /> {adj.supervisorSignature}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {adj.status === 'approved' ? (
                                                <Badge className="bg-green-100 text-green-800 text-[10px]">Aprobado</Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[10px]">Pendiente</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteAdjustmentId(adj.id)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isManualDialogOpen} onOpenChange={setIsManualDialogOpen}>
        <DialogContent className="sm:max-w-[650px]">
          <DialogHeader><DialogTitle>Tarjeta Digital de Registro Manual</DialogTitle></DialogHeader>
          <ManualAdjustmentForm onComplete={() => setIsManualDialogOpen(false)} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteShiftId} onOpenChange={(open) => { if (!open) setDeleteShiftId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta marca?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if(deleteShiftId) deleteShift(deleteShiftId); setDeleteShiftId(null); }} className="bg-destructive">Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteAdjustmentId} onOpenChange={(open) => { if (!open) setDeleteAdjustmentId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este ajuste?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción es irreversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if(deleteAdjustmentId) deleteManualAdjustment(deleteAdjustmentId); setDeleteAdjustmentId(null); }} className="bg-destructive">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
