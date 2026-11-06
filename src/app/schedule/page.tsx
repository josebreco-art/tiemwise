'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ScheduleWithId, EmployeeWithId, BreakSlot, DailyBreakSchedule } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { PlusCircle, Pencil, Trash2, Calendar as CalendarIcon, FileDown, Coffee, BarChart2, Filter } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAppData } from '@/context/app-data-provider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, parse, differenceInMinutes, addMinutes, setHours, setMinutes, setSeconds } from 'date-fns';
import { es } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const weekTypes = ['Semana 1', 'Semana 2'];

export default function SchedulePage() {
  const { 
    employees, 
    locations, 
    schedule, 
    addScheduleItem, 
    updateScheduleItem, 
    deleteScheduleItem, 
    firstDayOfWeek1, 
    setFirstDayOfWeek1, 
    currentWeekType 
  } = useAppData();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleWithId | null>(null);
  const [breakSchedules, setBreakSchedules] = useState<{ [weekType: string]: DailyBreakSchedule[] }>({});
  const [isMounted, setIsMounted] = useState(false);
  const [visibleEmployeeIds, setVisibleEmployeeIds] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (employees.length > 0 && visibleEmployeeIds.length === 0) {
      setVisibleEmployeeIds(employees.map(e => e.id));
    }
  }, [employees, visibleEmployeeIds.length]);
  
  const fullSchedule = useMemo(() => {
    return schedule.map(s => {
        const employee = employees.find(e => e.id === s.employeeId);
        const location = locations.find(l => l.id === s.locationId);
        return { ...s, employee, location };
    }).filter(s => s.employee && s.location)
    .sort((a,b) => employees.findIndex(e => e.id === a.employeeId) - employees.findIndex(e => e.id === b.employeeId));
  }, [schedule, employees, locations]);

  const displayedEmployees = useMemo(() => {
    return employees.filter(e => visibleEmployeeIds.includes(e.id));
  }, [employees, visibleEmployeeIds]);

  const programmedHoursAnalysis = useMemo(() => {
    return displayedEmployees.map(emp => {
      const getHoursForWeek = (weekType: string) => {
        const weekShifts = schedule.filter(s => s.employeeId === emp.id && s.weekType === weekType);
        let totalMins = 0;
        weekShifts.forEach(s => {
          const [startH, startM] = s.startTime.split(':').map(Number);
          const [endH, endM] = s.endTime.split(':').map(Number);
          let diff = (endH * 60 + endM) - (startH * 60 + startM);
          if (diff < 0) diff += 24 * 60; 
          totalMins += diff;
        });
        return totalMins / 60;
      };

      const w1 = getHoursForWeek('Semana 1');
      const w2 = getHoursForWeek('Semana 2');

      return {
        id: emp.id,
        name: emp.name,
        week1Hours: w1,
        week2Hours: w2,
        average: (w1 + w2) / 2
      };
    });
  }, [displayedEmployees, schedule]);

  const handleOpenForm = (scheduleItem: ScheduleWithId | null = null) => {
    setEditingSchedule(scheduleItem);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingSchedule(null);
  };

  const handleDelete = (scheduleId: string) => {
    deleteScheduleItem(scheduleId);
    toast({
        title: 'Turno Eliminado',
        description: 'El turno ha sido eliminado del horario.',
        variant: 'destructive'
    });
  };

  const toggleEmployeeVisibility = (id: string) => {
    setVisibleEmployeeIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => setVisibleEmployeeIds(employees.map(e => e.id));
  const handleDeselectAll = () => setVisibleEmployeeIds([]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const formValues = Object.fromEntries(formData.entries()) as any;

    if (!formValues.employeeId || !formValues.dayOfWeek || !formValues.startTime || !formValues.endTime || !formValues.locationId || !formValues.weekType) {
        toast({ title: 'Error', description: 'Por favor, rellena todos los campos.', variant: 'destructive' });
        return;
    }

    if (editingSchedule) {
      updateScheduleItem(editingSchedule.id, formValues);
       toast({ title: 'Horario Actualizado', description: 'El turno ha sido actualizado correctamente.' });
    } else {
      addScheduleItem(formValues);
      toast({ title: 'Turno Añadido', description: 'El nuevo turno ha sido añadido al horario.' });
    }
    handleCloseForm();
  };

  const handleExportSchedulePdf = async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable')
    ]);
    const doc = new jsPDF({ orientation: 'landscape' });
    weekTypes.forEach((weekType, index) => {
      if (index > 0) doc.addPage();
      doc.setFontSize(16);
      doc.text(`Horario Rotativo - ${weekType}`, 14, 20);
      const head = [['Empleado', ...daysOfWeek]];
      const body = displayedEmployees.map(employee => {
        const row = [employee.name];
        daysOfWeek.forEach(day => {
          const daySchedules = fullSchedule.filter(s => s.employeeId === employee.id && s.dayOfWeek === day && s.weekType === weekType);
          const cellText = daySchedules.map(s => `${s.startTime}-${s.endTime}\n(${s.location?.name})`).join('\n\n');
          row.push(cellText || '-');
        });
        return row;
      }).filter(row => row.slice(1).some(cell => cell !== '-'));
      autoTable(doc, {
        head: head,
        body: body,
        startY: 25,
        theme: 'grid',
        headStyles: { fillColor: weekType === 'Semana 1' ? '#3b82f6' : '#f97316' },
        styles: { fontSize: 8, cellPadding: 2, valign: 'middle' },
        columnStyles: { 0: { fontStyle: 'bold', minCellWidth: 30 } },
      });
    });
    doc.save(`horario_semanal_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const generateBreakSchedule = () => {
    const today = new Date();
    const allBreakSchedules: { [weekType: string]: DailyBreakSchedule[] } = {};
    
    weekTypes.forEach(weekType => {
      const generatedScheduleForWeek: DailyBreakSchedule[] = [];
      daysOfWeek.forEach((day) => {
          const isWeekend = day === 'Sábado' || day === 'Domingo';
          const breakStartTimeLimit = setSeconds(setMinutes(setHours(today, isWeekend ? 13 : 14), 0), 0);
          const employeesWorkingToday = fullSchedule.filter(s => s.dayOfWeek === day && s.weekType === weekType && visibleEmployeeIds.includes(s.employeeId));
          const employeeBreakSlots: { employee: EmployeeWithId; possibleSlots: Date[]; breakDuration: number }[] = [];
          
          employeesWorkingToday.forEach(shift => {
              if (!shift.employee) return;
              if (employeeBreakSlots.find(e => e.employee.id === shift.employeeId)) return;
              const employeeShiftsToday = employeesWorkingToday.filter(s => s.employeeId === shift.employeeId);
              let totalDuration = 0;
              let earliestStart = new Date(8640000000000000); 
              let latestEnd = new Date(-8640000000000000); 
              
              employeeShiftsToday.forEach(s => {
                  const shiftStart = parse(s.startTime, 'HH:mm', today);
                  const shiftEnd = parse(s.endTime, 'HH:mm', today);
                  if (shiftStart < earliestStart) earliestStart = shiftStart;
                  if (shiftEnd > latestEnd) latestEnd = latestEnd;
                  let duration = differenceInMinutes(shiftEnd, shiftStart);
                  if (duration < 0) duration += 24 * 60;
                  totalDuration += duration;
              });
              
              const breakDuration = totalDuration >= 12 * 60 ? 60 : (totalDuration >= 4 * 60 ? 30 : 0);
              if (breakDuration === 0) return;
              
              const breakWindowStart = addMinutes(earliestStart, 60);
              const breakWindowEnd = addMinutes(latestEnd, -120);
              let currentSlot = breakWindowStart > breakStartTimeLimit ? breakWindowStart : breakStartTimeLimit;
              const possibleSlots: Date[] = [];
              
              while(addMinutes(currentSlot, breakDuration) <= breakWindowEnd) {
                  possibleSlots.push(currentSlot);
                  currentSlot = addMinutes(currentSlot, 15);
              }
              
              if(shift.employee && possibleSlots.length > 0) {
                employeeBreakSlots.push({ employee: shift.employee as EmployeeWithId, possibleSlots, breakDuration });
              }
          });
          
          const dailyBreaks: BreakSlot[] = [];
          employeeBreakSlots.sort((a,b) => a.possibleSlots.length - b.possibleSlots.length);
          employeeBreakSlots.forEach(({ employee, possibleSlots, breakDuration }) => {
              for (const slot of possibleSlots) {
                  const slotEndTime = addMinutes(slot, breakDuration);
                  const isOverlapping = dailyBreaks.some(existingBreak => (slot < existingBreak.endTime && slotEndTime > existingBreak.startTime));
                  if (!isOverlapping) {
                      dailyBreaks.push({ startTime: slot, endTime: slotEndTime, employees: [employee] });
                      break; 
                  }
              }
          });
          
          dailyBreaks.sort((a,b) => a.startTime.getTime() - b.startTime.getTime());
          if (dailyBreaks.length > 0) generatedScheduleForWeek.push({ day, breaks: dailyBreaks });
      });
      allBreakSchedules[weekType] = generatedScheduleForWeek;
    });
    
    setBreakSchedules(allBreakSchedules);
    toast({ title: "Horario de Descansos Generado", description: "Se han creado horarios de descanso." });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
              <h1 className="text-2xl font-bold font-headline">Horario Rotativo</h1>
              <p className="text-muted-foreground">Planifica turnos, descansos y analiza la carga de trabajo.</p>
          </div>
          <div className="flex flex-wrap gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <Filter className="mr-2 h-4 w-4" /> 
                    Empleados ({visibleEmployeeIds.length})
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0">
                  <div className="p-2 border-b bg-muted/50 flex justify-between gap-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleSelectAll}>Todos</Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={handleDeselectAll}>Ninguno</Button>
                  </div>
                  <ScrollArea className="h-72">
                    <div className="p-2 space-y-1">
                      {employees.map(emp => (
                        <div key={emp.id} className="flex items-center space-x-2 p-1 hover:bg-muted rounded-md cursor-pointer" onClick={() => toggleEmployeeVisibility(emp.id)}>
                          <Checkbox checked={visibleEmployeeIds.includes(emp.id)} id={`filter-${emp.id}`} />
                          <Label htmlFor={`filter-${emp.id}`} className="flex-grow cursor-pointer text-sm">{emp.name}</Label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
              <Button variant="outline" onClick={handleExportSchedulePdf}><FileDown className="mr-2 h-4 w-4" /> Exportar</Button>
              <Button onClick={() => handleOpenForm()}><PlusCircle className="mr-2 h-4 w-4" /> Añadir Turno</Button>
          </div>
      </div>

      <Tabs defaultValue="grid" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="grid">Calendario Semanal</TabsTrigger>
          <TabsTrigger value="analysis" className="flex gap-2"><BarChart2 className="h-4 w-4" /> Análisis de Horas</TabsTrigger>
          <TabsTrigger value="breaks" className="flex gap-2"><Coffee className="h-4 w-4" /> Descansos</TabsTrigger>
        </TabsList>
        <TabsContent value="grid" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Ciclo de Dos Semanas</CardTitle>
              <CardDescription>
                Semana actual: {isMounted ? <span className="font-bold text-primary">{currentWeekType}</span> : <Skeleton className="h-4 w-20 inline-block" />}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {displayedEmployees.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">Selecciona empleados en el botón de filtro para ver el horario.</div>
              ) : (
                weekTypes.map(weekType => {
                    const isWeek1 = weekType === 'Semana 1';
                    return (
                        <div key={weekType} className="mb-8 last:mb-0">
                            <h3 className={cn("text-xl font-bold mb-3 p-2 rounded-t-lg", isWeek1 ? "bg-blue-600 text-white" : "bg-orange-500 text-white")}>{weekType}</h3>
                            <div className="overflow-x-auto border rounded-b-lg">
                                <Table>
                                    <TableHeader>
                                        <TableRow className={isWeek1 ? "bg-blue-50" : "bg-orange-50"}>
                                        <TableHead className="w-[150px] min-w-[150px] sticky left-0 z-10 font-semibold bg-inherit">Empleado</TableHead>
                                        {daysOfWeek.map((day) => (<TableHead key={day} className="w-[200px] min-w-[200px] font-semibold">{day}</TableHead>))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {displayedEmployees.map((employee) => (
                                        <TableRow key={employee.id} className="[&_td]:first:sticky [&_td]:first:left-0 [&_td]:first:z-10">
                                            <TableCell className="font-medium align-top pt-3 bg-card">{employee.name}</TableCell>
                                            {daysOfWeek.map((day) => {
                                            const daySchedules = fullSchedule.filter((s) => s.employeeId === employee.id && s.dayOfWeek === day && s.weekType === weekType);
                                            return (
                                                <TableCell key={`${employee.id}-${day}`} className="align-top p-2 bg-card">
                                                <div className="flex flex-col gap-2">
                                                    {daySchedules.length > 0 ? (
                                                        daySchedules.map(s => (
                                                            <div key={s.id} className="text-xs p-2 bg-secondary rounded-md text-secondary-foreground relative group">
                                                                <p className="font-bold">{`${s.startTime} - ${s.endTime}`}</p>
                                                                <p className="text-[10px] opacity-70">{s.location?.name}</p>
                                                                <div className="absolute top-1 right-1 flex opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleOpenForm(s)}><Pencil className="h-3 w-3 text-primary" /></Button>
                                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(s.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                                                                </div>
                                                            </div>
                                                        ))
                                                    ) : (<div className="text-center text-muted-foreground">-</div>)}
                                                </div>
                                                </TableCell>
                                            );})}
                                        </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    );})
              )}
            </CardContent>
            <CardFooter className="border-t pt-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <Label>Primer día de la Semana 1:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant={'outline'} className={cn('w-[280px] justify-start text-left font-normal', !firstDayOfWeek1 && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {firstDayOfWeek1 ? format(firstDayOfWeek1, 'PPP', { locale: es }) : <span>Elige una fecha</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={firstDayOfWeek1} onSelect={setFirstDayOfWeek1} initialFocus locale={es} /></PopoverContent>
                </Popover>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="analysis" className="pt-4">
          <Card>
            <CardHeader><CardTitle>Carga Horaria Programada</CardTitle><CardDescription>Resumen de horas totales asignadas por trabajador en el ciclo rotativo.</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead className="text-center">Horas Semana 1</TableHead>
                    <TableHead className="text-center">Horas Semana 2</TableHead>
                    <TableHead className="text-center">Promedio Semanal</TableHead>
                    <TableHead className="text-right">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {programmedHoursAnalysis.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-center font-mono">{item.week1Hours.toFixed(1)}h</TableCell>
                      <TableCell className="text-center font-mono">{item.week2Hours.toFixed(1)}h</TableCell>
                      <TableCell className="text-center font-mono font-bold text-primary">{item.average.toFixed(1)}h</TableCell>
                      <TableCell className="text-right">
                        {item.average > 42 ? (
                          <Badge variant="destructive">Exceso (&gt;42h)</Badge>
                        ) : item.average > 40 ? (
                          <Badge variant="secondary" className="bg-orange-100 text-orange-800">Carga Alta (&gt;40h)</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-green-50 text-green-700">Normal</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="breaks" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div><CardTitle>Descansos Sugeridos</CardTitle><CardDescription>Distribución automática para optimizar la operación.</CardDescription></div>
                <Button variant="outline" onClick={generateBreakSchedule}><Coffee className="mr-2 h-4 w-4" /> Generar Descansos</Button>
              </div>
            </CardHeader>
            <CardContent>
              {Object.values(breakSchedules).some(s => s.length > 0) ? (
                <div className="space-y-8">
                  {weekTypes.map(weekType => {
                    const weeklyBreakSchedule = breakSchedules[weekType];
                    if (!weeklyBreakSchedule || weeklyBreakSchedule.length === 0) return null;
                    return (
                        <div key={weekType} className="mb-4">
                             <h3 className={cn("text-lg font-bold mb-3 p-2 rounded-lg", weekType === 'Semana 1' ? "bg-blue-100 text-blue-800" : "bg-orange-100 text-orange-800")}>{`Plan de Descansos ${weekType}`}</h3>
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {daysOfWeek.filter(day => weeklyBreakSchedule.some(d => d.day === day)).map((day) => (
                                    <div key={day} className="border rounded-lg p-3">
                                        <h4 className="font-semibold mb-2 border-b pb-1 text-sm">{day}</h4>
                                        <Table><TableBody>
                                                {(weeklyBreakSchedule.find(d => d.day === day)?.breaks || []).map((breakSlot, index) => (
                                                    <TableRow key={index}>
                                                        <TableCell className="text-[10px] font-mono p-1">{format(breakSlot.startTime, 'p', { locale: es })} - {format(breakSlot.endTime, 'p', { locale: es })}</TableCell>
                                                        <TableCell className="text-[10px] p-1">{breakSlot.employees.map(e => e.name).join(', ')}</TableCell>
                                                    </TableRow>
                                                ))}
                                        </TableBody></Table>
                                    </div>
                                ))}
                             </div>
                        </div>
                    );
                  })}
                </div>
              ) : (<div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">Haz clic en &quot;Generar Descansos&quot; para ver la planificación sugerida.</div>)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSchedule ? 'Editar Turno' : 'Añadir Nuevo Turno'}</DialogTitle>
            <DialogDescription>Asigna el horario y la ubicación para el colaborador.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="weekType" className="text-right">Ciclo</Label>
              <Select name="weekType" defaultValue={editingSchedule?.weekType} required>
                <SelectTrigger className="col-span-3"><SelectValue placeholder="Semana 1 o 2" /></SelectTrigger>
                <SelectContent>{weekTypes.map(type => (<SelectItem key={type} value={type}>{type}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="employeeId" className="text-right">Empleado</Label>
              <Select name="employeeId" defaultValue={editingSchedule?.employeeId} required>
                <SelectTrigger className="col-span-3"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{employees.map(emp => (<SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="dayOfWeek" className="text-right">Día</Label>
              <Select name="dayOfWeek" defaultValue={editingSchedule?.dayOfWeek} required>
                <SelectTrigger className="col-span-3"><SelectValue placeholder="Día de la semana" /></SelectTrigger>
                <SelectContent>{daysOfWeek.map(day => (<SelectItem key={day} value={day}>{day}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="locationId" className="text-right">Ubicación</Label>
              <Select name="locationId" defaultValue={editingSchedule?.locationId} required>
                <SelectTrigger className="col-span-3"><SelectValue placeholder="¿Dónde trabajará?" /></SelectTrigger>
                <SelectContent>{locations.map(loc => (<SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="startTime" className="text-right text-xs">Entrada</Label>
              <Input id="startTime" name="startTime" type="time" defaultValue={editingSchedule?.startTime} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="endTime" className="text-right text-xs">Salida</Label>
              <Input id="endTime" name="endTime" type="time" defaultValue={editingSchedule?.endTime} className="col-span-3" required />
            </div>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
              <Button type="submit">{editingSchedule ? 'Guardar Cambios' : 'Añadir Turno'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
