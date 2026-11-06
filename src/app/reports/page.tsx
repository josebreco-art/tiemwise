'use client';

import React, { useState, useMemo, useEffect } from 'react';
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
  TableFooter,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, startOfDay, endOfDay, getYear, isWithinInterval, differenceInMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { 
  Calendar as CalendarIcon, 
  Printer, 
  Search, 
  Receipt, 
  FileText, 
  UserCircle, 
  TrendingUp, 
  Clock, 
  MessageCircle,
  Trash2,
  Eye,
  CheckCircle2,
  DollarSign,
  Layers,
  Filter,
  Coffee,
  Utensils,
  Download,
  AlertTriangle
} from 'lucide-react';
import { calculateShiftBreakSummary, determineShiftCategory, BREAK_POLICIES } from '@/lib/break-policy';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
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
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { useAppData } from '@/context/app-data-provider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { calculateLaborPeriod, getWeeksBelongingToMonth } from '@/lib/calculations';
import type { PayslipRecordWithId } from '@/lib/data';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Timestamp } from 'firebase/firestore';

export default function ReportsPage() {
    const { employees, shifts, holidays, locations, logoUrl, payslips, schedule, firstDayOfWeek1, deletePayslip } = useAppData();
    const [date, setDate] = useState<DateRange | undefined>();
    const [isMounted, setIsMounted] = useState(false);
    const [reportData, setReportData] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [historyEmployeeId, setHistoryEmployeeId] = useState<string | null>(null);
    const [historyYear, setHistoryYear] = useState<number>(getYear(new Date()));
    const [printTimestamp, setPrintTimestamp] = useState<string>('');

    const [detailEmployeeId, setDetailEmployeeId] = useState<string | null>(null);

    // Historial de Pagos Tab State
    const [historyFilterEmpId, setHistoryFilterEmpId] = useState<string>('all');
    const [historyFilterDateRange, setHistoryFilterDateRange] = useState<boolean>(false);
    const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
    const [selectedSlipForDetail, setSelectedSlipForDetail] = useState<PayslipRecordWithId | null>(null);
    const [slipToDelete, setSlipToDelete] = useState<PayslipRecordWithId | null>(null);

    // Control de Descansos Tab State
    const [breaksEmployeeId, setBreaksEmployeeId] = useState<string>('all');
    const [breaksSearchQuery, setBreaksSearchQuery] = useState<string>('');

    useEffect(() => {
        setIsMounted(true);
        const today = new Date();
        setDate({ from: startOfDay(today), to: endOfDay(today) });
    }, []);

    useEffect(() => {
      if (isMounted) {
        setPrintTimestamp(format(new Date(), "dd/MM/yyyy HH:mm:ss", { locale: es }));
      }
    }, [isMounted]);

    const toDate = (d: any): Date => {
        if (d instanceof Timestamp) return d.toDate();
        if (d instanceof Date) return d;
        const parsed = new Date(d);
        return isNaN(parsed.getTime()) ? new Date() : parsed;
    }

    const generateReport = () => {
      if (!employees || !shifts || !holidays || !locations || !date?.from || !date?.to) return;
      
      const laborData = employees.map(employee => {
          const stats = calculateLaborPeriod(employee, date.from!, date.to!, shifts, holidays, locations, schedule, firstDayOfWeek1);

          if (stats.totalHoursToPay > 0 || stats.grossSalary > 0) {
              const caja = stats.grossSalary * ((employee.cajaRetentionRate || 0) / 100);
              const loan = Math.min(employee.loanPayment || 0, employee.loanAmount || 0);
              const savings = employee.savingsPayment || 0;
              
              if (searchTerm !== '' && !employee.name.toLowerCase().includes(searchTerm.toLowerCase()) && !employee.cedula.includes(searchTerm)) return null;

              return { 
                  name: employee.name, 
                  cedula: employee.cedula, 
                  totalHours: stats.totalHoursWorkedPhysically || stats.totalHoursToPay, 
                  grossSalary: stats.grossSalary, 
                  netSalary: stats.grossSalary - caja - loan - savings 
              };
          }

          // Fallback a comprobante guardado si no hay marcas registradas en el período
          const savedInPeriod = payslips.filter(p => 
            p.employeeId === employee.id && 
            (isWithinInterval(toDate(p.endDate), { start: startOfDay(date.from!), end: endOfDay(date.to!) }) ||
             isWithinInterval(toDate(p.startDate), { start: startOfDay(date.from!), end: endOfDay(date.to!) }))
          );

          if (savedInPeriod.length > 0) {
            const totalGross = savedInPeriod.reduce((acc, curr) => acc + curr.grossSalary, 0);
            const totalNet = savedInPeriod.reduce((acc, curr) => acc + curr.netSalary, 0);
            const totalHrs = savedInPeriod.reduce((acc, curr) => acc + (curr.hoursBreakdown.regular + curr.hoursBreakdown.overtime + curr.hoursBreakdown.holiday + (curr.hoursBreakdown.vacation || 0) * 8), 0);
            
            if (searchTerm !== '' && !employee.name.toLowerCase().includes(searchTerm.toLowerCase()) && !employee.cedula.includes(searchTerm)) return null;

            return {
              name: employee.name,
              cedula: employee.cedula,
              totalHours: totalHrs,
              grossSalary: totalGross,
              netSalary: totalNet
            }
          }

          return null;
      }).filter(data => data !== null);
      
      setReportData(laborData);
    }

    const totals = useMemo(() => ({
        totalHours: reportData.reduce((acc, curr) => acc + curr.totalHours, 0),
        grossSalary: reportData.reduce((acc, curr) => acc + curr.grossSalary, 0),
        netSalary: reportData.reduce((acc, curr) => acc + curr.netSalary, 0),
    }), [reportData]);

    const employeeSalaryHistory = useMemo(() => {
        if (!historyEmployeeId || !isMounted || !locations) return null;
        const employee = employees.find(e => e.id === historyEmployeeId);
        if (!employee) return null;

        const months = [];
        let grandTotalGross = 0;

        for (let i = 0; i < 12; i++) {
            const weeks = getWeeksBelongingToMonth(historyYear, i);
            let monthGross = 0;
            
            const weekDetails = weeks.map(w => {
                const stats = calculateLaborPeriod(employee, w.start, w.end, shifts, holidays, locations, schedule, firstDayOfWeek1);
                monthGross += stats.grossSalary;
                return { 
                    range: `${format(w.start, 'dd/MM')} - ${format(w.end, 'dd/MM')}`, 
                    grossSalary: stats.grossSalary, 
                    totalHours: stats.totalHoursToPay 
                };
            });
            
            grandTotalGross += monthGross;
            months.push({ 
                name: format(new Date(historyYear, i, 1), 'MMMM', { locale: es }), 
                weeks: weekDetails, 
                totalGross: monthGross 
            });
        }
        return { employee, months, grandTotalGross };
    }, [historyEmployeeId, historyYear, employees, shifts, holidays, locations, schedule, firstDayOfWeek1, isMounted]);

    const employeeTimeDetail = useMemo(() => {
        if (!detailEmployeeId || !date?.from || !date?.to || !isMounted) return null;
        const employee = employees.find(e => e.id === detailEmployeeId);
        if (!employee) return null;

        const start = startOfDay(date.from);
        const end = endOfDay(date.to);

        const relevantShifts = shifts.filter(s => 
            s.employeeId === detailEmployeeId && 
            isWithinInterval(toDate(s.clockIn), { start, end })
        ).sort((a, b) => toDate(a.clockIn).getTime() - toDate(b.clockIn).getTime());

        let totalMins = 0;
        const processedShifts = relevantShifts.map(s => {
            const inD = toDate(s.clockIn);
            const outD = s.clockOut ? toDate(s.clockOut) : null;
            const diff = outD ? differenceInMinutes(outD, inD) : 0;
            if (diff > 0) totalMins += diff;

            const loc = locations.find(l => l.id === s.locationId) || 
                        locations.find(l => l.name?.trim().toLowerCase() === s.locationId?.trim().toLowerCase());

            return {
                date: format(inD, 'dd/MM/yyyy'),
                in: format(inD, 'p', { locale: es }),
                out: outD ? format(outD, 'p', { locale: es }) : 'En turno',
                location: loc?.name || 'Desconocido',
                type: loc?.type || 'POS',
                hours: diff > 0 ? (diff / 60).toFixed(2) : '0.00',
                autoClosed: s.autoClosed,
                autoClosedReason: s.autoClosedReason,
                nightConfirmationsCount: s.nightConfirmations?.length || 0,
            };
        });

        return { employee, processedShifts, totalHours: (totalMins / 60).toFixed(2) };
    }, [detailEmployeeId, date, shifts, locations, isMounted, employees]);

    useEffect(() => { 
        if (date?.from && date?.to) generateReport(); 
    }, [employees, shifts, holidays, locations, date, searchTerm, payslips, schedule, firstDayOfWeek1]);

    const handlePrint = (reportId: string) => {
        const printContents = document.getElementById(reportId)?.innerHTML;
        const printWindow = window.open('', '', 'height=800,width=900');
        if (printWindow) {
            printWindow.document.write(`<html><head><title>Reporte - TimeWise Dining</title><style>body { font-family: Arial, sans-serif; padding: 20px; color: #333; } .report-header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px; } .logo-container img { max-height: 60px; } table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; } th, td { border: 1px solid #ddd; padding: 8px; } th { background-color: #f7f7f7; font-weight: bold; } .text-right { text-align: right; } .totals-row { font-weight: bold; background-color: #f0f0f0 !important; } .footer-signature { margin-top: 80px; display: flex; justify-content: space-between; align-items: flex-end; } .sig-box { border-top: 1px solid #000; width: 250px; text-align: center; padding-top: 5px; font-size: 12px; font-weight: bold; } .print-time { font-size: 10px; color: #666; margin-top: 4px; }</style></head><body><div class="report-container">${printContents}</div></body></html>`);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
        }
    };

    const sendWhatsAppDetailedMarks = () => {
        if (!employeeTimeDetail || !date?.from || !date?.to) return;
        
        let message = `*DETALLE DE MARCAS BIOMÉTRICAS*\n`;
        message += `👤 *Colaborador:* ${employeeTimeDetail.employee.name}\n`;
        message += `🆔 *Cédula:* ${employeeTimeDetail.employee.cedula}\n`;
        message += `📅 *Período:* ${format(date.from, 'dd/MM/yyyy')} al ${format(date.to, 'dd/MM/yyyy')}\n`;
        message += `--------------------------\n`;

        employeeTimeDetail.processedShifts.forEach(s => {
            message += `📍 *${s.date}*\n`;
            message += `  · Entrada: ${s.in}\n`;
            message += `  · Salida: ${s.out}\n`;
            message += `  · Local: ${s.location} (${s.type})\n`;
            message += `  · Tiempo: ${s.hours}h\n\n`;
        });

        message += `--------------------------\n`;
        message += `✅ *TOTAL HORAS FÍSICAS: ${employeeTimeDetail.totalHours}h*`;

        const encodedMessage = encodeURIComponent(message);
        const phone = employeeTimeDetail.employee.phone ? employeeTimeDetail.employee.phone.replace(/\D/g, '') : '';
        const whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;
        window.open(whatsappUrl, '_blank');
    };

    // Filtered Payslips Calculation for the "Historial Pagos" tab
    const filteredPayslipsList = useMemo(() => {
        return (payslips || []).filter(slip => {
            if (historyFilterEmpId !== 'all' && slip.employeeId !== historyFilterEmpId) {
                return false;
            }
            if (historyFilterDateRange && date?.from && date?.to) {
                const sDate = toDate(slip.startDate);
                const eDate = toDate(slip.endDate);
                const inRange = isWithinInterval(eDate, { start: startOfDay(date.from), end: endOfDay(date.to) }) ||
                                isWithinInterval(sDate, { start: startOfDay(date.from), end: endOfDay(date.to) });
                if (!inRange) return false;
            }
            if (historySearchQuery.trim()) {
                const q = historySearchQuery.toLowerCase();
                const matchName = slip.employeeName?.toLowerCase().includes(q);
                const matchCedula = slip.cedula?.toLowerCase().includes(q);
                if (!matchName && !matchCedula) return false;
            }
            return true;
        }).sort((a, b) => toDate(b.createdAt || b.endDate).getTime() - toDate(a.createdAt || a.endDate).getTime());
    }, [payslips, historyFilterEmpId, historyFilterDateRange, date, historySearchQuery]);

    const payslipsTotals = useMemo(() => {
        let totalGross = 0;
        let totalNet = 0;
        let totalCaja = 0;
        let totalLoans = 0;
        let totalSavings = 0;
        let totalHours = 0;

        filteredPayslipsList.forEach(slip => {
            totalGross += slip.grossSalary || 0;
            totalNet += slip.netSalary || 0;
            totalCaja += slip.deductions?.caja || 0;
            totalLoans += slip.deductions?.loan || 0;
            totalSavings += slip.deductions?.savings || 0;
            if (slip.hoursBreakdown) {
                totalHours += (slip.hoursBreakdown.regular || 0) + 
                              (slip.hoursBreakdown.overtime || 0) + 
                              (slip.hoursBreakdown.holiday || 0) + 
                              ((slip.hoursBreakdown.vacation || 0) * 8);
            }
        });

        return {
            count: filteredPayslipsList.length,
            totalGross,
            totalNet,
            totalDeductions: totalCaja + totalLoans + totalSavings,
            totalCaja,
            totalLoans,
            totalSavings,
            totalHours
        };
    }, [filteredPayslipsList]);

    const sendWhatsAppSavedPayslip = (slip: PayslipRecordWithId) => {
        const emp = employees.find(e => e.id === slip.employeeId);
        const formatMoney = (val: number) => val.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const formatHours = (val: number) => Number(val || 0).toFixed(2);

        let message = `*COMPROBANTE DE PAGO*\n`;
        message += `📅 *Período:* ${format(toDate(slip.startDate), 'dd/MM/yy')} - ${format(toDate(slip.endDate), 'dd/MM/yy')}\n`;
        message += `--------------------------\n`;
        message += `👤 *Empleado:* ${slip.employeeName}\n`;
        message += `🆔 *Cédula:* ${slip.cedula}\n`;
        message += `--------------------------\n`;
        message += `🕒 *DESGLOSE DE INGRESOS*\n`;
        if (slip.hoursBreakdown) {
            message += ` · Regulares: ${formatHours(slip.hoursBreakdown.regular)}h\n`;
            if (slip.hoursBreakdown.overtime > 0) message += ` · Extras: ${formatHours(slip.hoursBreakdown.overtime)}h\n`;
            if (slip.hoursBreakdown.holiday > 0) message += ` · Feriados: ${formatHours(slip.hoursBreakdown.holiday)}h\n`;
            if (slip.hoursBreakdown.vacation) message += ` · Vacaciones: ${slip.hoursBreakdown.vacation}d\n`;
        }
        message += `--------------------------\n`;
        message += `💰 *RESUMEN FINANCIERO*\n`;
        message += `*SALARIO BRUTO: ₡${formatMoney(slip.grossSalary || 0)}*\n`;
        message += ` · Rebajo CCSS: -₡${formatMoney(slip.deductions?.caja || 0)}\n`;
        if ((slip.deductions?.loan || 0) > 0) message += ` · Rebajo Préstamo: -₡${formatMoney(slip.deductions.loan)}\n`;
        if ((slip.deductions?.savings || 0) > 0) message += ` · Aporte Ahorros: -₡${formatMoney(slip.deductions.savings)}\n`;
        message += `--------------------------\n`;
        message += `✅ *SALARIO NETO: ₡${formatMoney(slip.netSalary || 0)}*\n`;
        message += `--------------------------\n`;
        message += `📉 *Saldos Actuales:*\n`;
        message += ` · Préstamo: ₡${formatMoney(emp?.loanAmount || 0)}\n`;
        message += ` · Ahorros: ₡${formatMoney(emp?.savingsAmount || 0)}`;

        const encoded = encodeURIComponent(message);
        const phone = emp?.phone ? emp.phone.replace(/\D/g, '') : '';
        window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank');
    };

    // Control de Descansos Tab Data Processing
    const breaksReportData = useMemo(() => {
        if (!shifts || !date?.from || !date?.to) return [];
        const fromDate = startOfDay(date.from);
        const toDateEnd = endOfDay(date.to);

        return shifts.filter(s => {
            const shiftDate = toDate(s.clockIn);
            if (!isWithinInterval(shiftDate, { start: fromDate, end: toDateEnd })) return false;
            if (breaksEmployeeId !== 'all' && s.employeeId !== breaksEmployeeId) return false;
            
            const emp = employees.find(e => e.id === s.employeeId);
            if (breaksSearchQuery.trim()) {
                const q = breaksSearchQuery.toLowerCase();
                const matchName = emp?.name?.toLowerCase().includes(q);
                const matchCedula = emp?.cedula?.toLowerCase().includes(q);
                if (!matchName && !matchCedula) return false;
            }
            return true;
        }).map(s => {
            const emp = employees.find(e => e.id === s.employeeId);
            const loc = locations.find(l => l.id === s.locationId);
            const inDate = toDate(s.clockIn);
            const outDate = s.clockOut ? toDate(s.clockOut) : null;
            const summary = calculateShiftBreakSummary(inDate, outDate, s.breaks || [], emp?.hourlyRate || 0);

            return {
                id: s.id,
                shift: s,
                employee: emp,
                employeeName: emp?.name || 'Desconocido',
                cedula: emp?.cedula || '-',
                locationName: loc?.name || 'Local',
                locationType: loc?.type || 'Punto de Venta',
                rawDate: inDate,
                date: format(inDate, 'dd/MM/yyyy', { locale: es }),
                clockIn: format(inDate, 'HH:mm'),
                clockOut: outDate ? format(outDate, 'HH:mm') : 'En curso',
                durationHours: summary.durationHours,
                categoryLabel: summary.categoryLabel,
                category: summary.category,
                breaks: s.breaks || [],
                totalBreakMinutes: summary.totalMinutes,
                allowedBreakMinutes: summary.allowedMinutes,
                excessBreakMinutes: summary.excessMinutes,
                excessDeduction: summary.excessDeduction,
                inCompliance: summary.inCompliance,
            };
        }).sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());
    }, [shifts, employees, locations, date, breaksEmployeeId, breaksSearchQuery]);

    const breaksTotals = useMemo(() => {
        let totalBreaksCount = 0;
        let totalMinutesTaken = 0;
        let totalAllowedMinutes = 0;
        let totalExcessMinutes = 0;
        let totalDeduction = 0;
        const employeesWithExcess = new Set<string>();

        breaksReportData.forEach(item => {
            totalBreaksCount += (item.breaks || []).length;
            totalMinutesTaken += item.totalBreakMinutes;
            totalAllowedMinutes += item.allowedBreakMinutes;
            totalExcessMinutes += item.excessBreakMinutes;
            totalDeduction += item.excessDeduction;
            if (item.excessBreakMinutes > 0 && item.employee?.id) {
                employeesWithExcess.add(item.employee.id);
            }
        });

        return {
            totalShifts: breaksReportData.length,
            totalBreaksCount,
            totalMinutesTaken,
            totalAllowedMinutes,
            totalExcessMinutes,
            totalDeduction,
            employeesWithExcessCount: employeesWithExcess.size
        };
    }, [breaksReportData]);

    const exportBreaksToCSV = () => {
        if (breaksReportData.length === 0) return;
        const headers = [
            'Fecha',
            'Colaborador',
            'Cédula',
            'Entrada',
            'Salida',
            'Horas Turno',
            'Jornada',
            'Detalle Descansos',
            'Minutos Tomados',
            'Minutos Permitidos',
            'Minutos Exceso',
            'Tarifa Hora (CRC)',
            'Monto Deducción (CRC)'
        ];

        const rows = breaksReportData.map(item => {
            const breaksDetailStr = (item.breaks || []).map(b => {
                const bIn = b.start ? format(toDate(b.start), 'HH:mm') : '';
                const bOut = b.end ? format(toDate(b.end), 'HH:mm') : 'En curso';
                return `${b.name || 'Descanso'}: ${bIn}-${bOut} (${b.durationMinutes || 0}m)`;
            }).join(' | ');

            return [
                `"${item.date}"`,
                `"${item.employeeName.replace(/"/g, '""')}"`,
                `"${item.cedula}"`,
                `"${item.clockIn}"`,
                `"${item.clockOut}"`,
                item.durationHours.toFixed(1),
                `"${item.categoryLabel}"`,
                `"${breaksDetailStr.replace(/"/g, '""')}"`,
                item.totalBreakMinutes,
                item.allowedBreakMinutes,
                item.excessBreakMinutes,
                item.employee?.hourlyRate || 0,
                item.excessDeduction.toFixed(2)
            ].join(',');
        });

        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Reporte_Descansos_Sabor_Cervanteno_${date?.from ? format(date.from, 'yyyyMMdd') : 'periodo'}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const sendWhatsAppBreaksReport = () => {
        if (!date?.from || !date?.to || breaksReportData.length === 0) return;
        let message = `*REPORTE DE CONTROL DE DESCANSOS*\n`;
        message += `🍗 *Pollo Frito Sabor Cervanteño*\n`;
        message += `📅 *Período:* ${format(date.from, 'dd/MM/yyyy')} al ${format(date.to, 'dd/MM/yyyy')}\n`;
        message += `--------------------------\n`;
        message += `📊 *Turnos analizados:* ${breaksTotals.totalShifts}\n`;
        message += `☕ *Descansos registrados:* ${breaksTotals.totalBreaksCount}\n`;
        message += `⏱️ *Minutos consumidos:* ${breaksTotals.totalMinutesTaken} min\n`;
        message += `⚠️ *Minutos de exceso:* ${breaksTotals.totalExcessMinutes} min\n`;
        message += `💰 *Monto total de deducción:* ₡${breaksTotals.totalDeduction.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
        message += `--------------------------\n`;

        const topExcess = breaksReportData.filter(b => b.excessBreakMinutes > 0).slice(0, 5);
        if (topExcess.length > 0) {
            message += `*Casos con exceso detectado:*\n`;
            topExcess.forEach(t => {
                message += `· ${t.employeeName} (${t.date}): +${t.excessBreakMinutes}m (₡${t.excessDeduction.toFixed(0)})\n`;
            });
        }

        const encoded = encodeURIComponent(message);
        window.open(`https://wa.me/?text=${encoded}`, '_blank');
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 no-print">
                <div>
                    <h1 className="text-2xl font-bold font-headline">Auditoría y Reportes</h1>
                    <p className="text-muted-foreground">Consolidado de planillas e historial de ingresos.</p>
                </div>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant={'outline'} className={cn('w-full sm:w-[300px] justify-start text-left font-normal', !date && 'text-muted-foreground')} disabled={!isMounted}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {isMounted && date?.from ? (
                                date.to ? <>{format(date.from, 'dd/MM/yy')} - {format(date.to, 'dd/MM/yy')}</> : format(date.from, 'dd/MM/yy')
                            ) : <span>Elegir Rango</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                        <Calendar mode="range" selected={date} onSelect={setDate} locale={es} />
                    </PopoverContent>
                </Popover>
            </div>

            <Tabs defaultValue="planilla" className="w-full">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto p-1 gap-1">
                    <TabsTrigger value="planilla" className="flex items-center gap-2"><FileText className="h-4 w-4" /> Resumen Planilla</TabsTrigger>
                    <TabsTrigger value="marcas" className="flex items-center gap-2"><Clock className="h-4 w-4" /> Detalle Marcas</TabsTrigger>
                    <TabsTrigger value="descansos" className="flex items-center gap-2"><Coffee className="h-4 w-4" /> Control Descansos</TabsTrigger>
                    <TabsTrigger value="historial" className="flex items-center gap-2"><Receipt className="h-4 w-4" /> Historial Pagos</TabsTrigger>
                    <TabsTrigger value="estado-cuenta" className="flex items-center gap-2"><UserCircle className="h-4 w-4" /> Estado Cuenta</TabsTrigger>
                </TabsList>

                <TabsContent value="planilla" className="space-y-4 pt-4">
                    <Card>
                        <CardHeader className="no-print">
                            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                                <div className="relative w-full sm:max-w-xs">
                                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Filtrar por nombre..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8" />
                                </div>
                                <Button onClick={() => handlePrint('report-planilla')} variant="outline"><Printer className="mr-2 h-4 w-4" /> Imprimir Resumen</Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div id="report-planilla" className="bg-white p-8 rounded-lg border shadow-sm">
                                {reportData.length === 0 ? (
                                    <div className="text-center py-10 text-muted-foreground">No hay datos para el rango seleccionado.</div>
                                ) : (
                                    <>
                                        <div className="report-header flex justify-between items-start border-b-2 border-black pb-4 mb-6">
                                            <div className="report-info">
                                                <h2 className="text-2xl font-black uppercase tracking-tight">Resumen de Planilla</h2>
                                                <div className="space-y-0.5 mt-2 text-sm">
                                                    <p className="flex gap-2"><span className="font-bold">PERÍODO:</span> {date?.from ? format(date.from, 'dd/MM/yyyy', { locale: es }) : ''} al {date?.to ? format(date.to, 'dd/MM/yyyy', { locale: es }) : ''}</p>
                                                    <p className="flex gap-2 text-muted-foreground text-xs"><span className="font-bold">FECHA IMPRESIÓN:</span> {printTimestamp}</p>
                                                </div>
                                            </div>
                                            <div className="logo-container">
                                                {logoUrl && <img src={logoUrl} alt="Logo" className="max-h-16 object-contain" />}
                                            </div>
                                        </div>
                                        
                                        <Table className="w-full border">
                                            <TableHeader>
                                                <TableRow className="bg-muted/50 border-black">
                                                    <TableHead className="font-bold text-black uppercase text-xs">Colaborador</TableHead>
                                                    <TableHead className="text-right font-bold text-black uppercase text-xs">Total Horas</TableHead>
                                                    <TableHead className="text-right font-bold text-black uppercase text-xs">Salario Bruto</TableHead>
                                                    <TableHead className="text-right font-bold text-black uppercase text-xs">Neto a Pagar</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {reportData.map((data, index) => (
                                                    <TableRow key={index} className="border-b">
                                                        <TableCell className="py-3">
                                                            <div className="font-bold text-sm uppercase">{data.name}</div>
                                                            <div className="text-[10px] font-mono text-muted-foreground">{data.cedula}</div>
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-xs">{data.totalHours.toFixed(2)}h</TableCell>
                                                        <TableCell className="text-right font-mono text-xs italic">₡{data.grossSalary.toLocaleString('es-CR')}</TableCell>
                                                        <TableCell className="text-right font-bold text-sm">₡{data.netSalary.toLocaleString('es-CR')}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                            <TableFooter>
                                                <TableRow className="totals-row bg-gray-100 border-t-2 border-black">
                                                    <TableCell className="font-black">TOTALES GENERALES</TableCell>
                                                    <TableCell className="text-right font-black font-mono">{totals.totalHours.toFixed(2)}h</TableCell>
                                                    <TableCell className="text-right font-black font-mono">₡{totals.grossSalary.toLocaleString('es-CR')}</TableCell>
                                                    <TableCell className="text-right text-primary font-black font-mono">₡{totals.netSalary.toLocaleString('es-CR')}</TableCell>
                                                </TableRow>
                                            </TableFooter>
                                        </Table>

                                        <div className="mt-24 flex justify-between items-end px-4">
                                            <div className="sig-box border-t border-black w-72 pt-2 text-center">
                                                <p className="text-sm font-bold uppercase tracking-widest">Firma del Encargado</p>
                                                <p className="text-[10px] text-muted-foreground mt-1">Sello de la Empresa y Fecha de Recibido</p>
                                            </div>
                                            <div className="text-[9px] text-muted-foreground italic text-right">
                                                Sistema de Gestión TimeWise Dining<br/>
                                                Reporte de auditoría interna
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="marcas" className="space-y-4 pt-4">
                    <Card>
                        <CardHeader className="no-print">
                            <div className="flex flex-col sm:flex-row gap-4 mb-2">
                                <div className="flex-grow">
                                    <Label className="text-xs mb-1 block">Seleccionar Colaborador</Label>
                                    <Select onValueChange={setDetailEmployeeId} value={detailEmployeeId || ''}>
                                        <SelectTrigger><SelectValue placeholder="Elige un empleado..." /></SelectTrigger>
                                        <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-end gap-2">
                                    <Button onClick={sendWhatsAppDetailedMarks} disabled={!detailEmployeeId} variant="outline" className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100">
                                        <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                                    </Button>
                                    <Button onClick={() => handlePrint('report-marcas')} disabled={!detailEmployeeId} variant="outline"><Printer className="mr-2 h-4 w-4" /> Imprimir Reporte</Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {!detailEmployeeId ? (
                                <div className="text-center py-20 bg-muted/20 border-2 border-dashed rounded-lg">Selecciona un colaborador y un rango de fechas para ver el detalle.</div>
                            ) : (
                                employeeTimeDetail && (
                                    <div id="report-marcas" className="bg-white p-8 border shadow-sm rounded-lg">
                                        <div className="report-header flex justify-between items-start border-b-2 border-black pb-4 mb-6">
                                            <div className="report-info">
                                                <h2 className="text-2xl font-black uppercase tracking-tight">Detalle de Marcas Biométricas</h2>
                                                <div className="space-y-0.5 mt-2 text-sm">
                                                    <p><span className="font-bold">COLABORADOR:</span> {employeeTimeDetail.employee.name}</p>
                                                    <p><span className="font-bold">CÉDULA:</span> {employeeTimeDetail.employee.cedula}</p>
                                                    <p><span className="font-bold">PERÍODO:</span> {date?.from ? format(date.from, 'dd/MM/yyyy') : ''} al {date?.to ? format(date.to, 'dd/MM/yyyy') : ''}</p>
                                                </div>
                                            </div>
                                            <div className="logo-container">
                                                {logoUrl && <img src={logoUrl} alt="Logo" className="max-h-16 object-contain" />}
                                            </div>
                                        </div>

                                        <Table className="border">
                                            <TableHeader>
                                                <TableRow className="bg-muted/50 border-black">
                                                    <TableHead className="font-bold text-black uppercase text-[10px]">Fecha</TableHead>
                                                    <TableHead className="font-bold text-black uppercase text-[10px]">Entrada</TableHead>
                                                    <TableHead className="font-bold text-black uppercase text-[10px]">Salida</TableHead>
                                                    <TableHead className="font-bold text-black uppercase text-[10px]">Ubicación</TableHead>
                                                    <TableHead className="text-right font-bold text-black uppercase text-[10px]">Total Horas</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {employeeTimeDetail.processedShifts.length === 0 ? (
                                                    <TableRow><TableCell colSpan={5} className="text-center py-10">Sin marcas registradas en este período.</TableCell></TableRow>
                                                ) : (
                                                    employeeTimeDetail.processedShifts.map((s, i) => (
                                                        <TableRow key={i} className="border-b">
                                                            <TableCell className="py-2 text-[10px]">{s.date}</TableCell>
                                                            <TableCell className="py-2 text-[10px] font-mono">{s.in}</TableCell>
                                                            <TableCell className="py-2 text-[10px] font-mono">{s.out}</TableCell>
                                                            <TableCell className="py-2">
                                                                <div className="flex flex-col gap-0.5">
                                                                    <div className="flex items-center gap-1">
                                                                        <span className="text-[10px] font-bold">{s.location}</span>
                                                                        <span className="text-[9px] text-muted-foreground">({s.type})</span>
                                                                    </div>
                                                                    {s.autoClosed && (
                                                                        <span className="text-[9px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 rounded w-fit">
                                                                            ⚠️ Cierre automático CEDI ({s.nightConfirmationsCount}/3 confirmaciones)
                                                                        </span>
                                                                    )}
                                                                    {!s.autoClosed && s.nightConfirmationsCount > 0 && (
                                                                        <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded w-fit">
                                                                            ✓ Verificación CEDI ({s.nightConfirmationsCount}/3)
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="py-2 text-right font-mono font-bold text-[10px]">{s.hours}h</TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                            <TableFooter>
                                                <TableRow className="bg-gray-100 border-t-2 border-black">
                                                    <TableCell colSpan={4} className="font-black text-xs">TOTAL HORAS FÍSICAS EN EL RANGO</TableCell>
                                                    <TableCell className="text-right font-black font-mono text-xs">{employeeTimeDetail.totalHours}h</TableCell>
                                                </TableRow>
                                            </TableFooter>
                                        </Table>

                                        <div className="mt-24 flex justify-between items-end px-4">
                                            <div className="sig-box border-t border-black w-72 pt-2 text-center">
                                                <p className="text-sm font-bold uppercase tracking-widest">Firma del Colaborador</p>
                                                <p className="text-[10px] text-muted-foreground mt-1">Confirmo que las marcas arriba detalladas son correctas</p>
                                            </div>
                                            <div className="sig-box border-t border-black w-72 pt-2 text-center">
                                                <p className="text-sm font-bold uppercase tracking-widest">Sello / Supervisor</p>
                                            </div>
                                        </div>
                                    </div>
                                )
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* PESTAÑA: CONTROL DE DESCANSOS Y EXCESOS */}
                <TabsContent value="descansos" className="space-y-4 pt-4">
                    <Card>
                        <CardHeader className="no-print">
                            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <Coffee className="h-5 w-5 text-amber-600" /> Control de Descansos para Alimentación
                                    </CardTitle>
                                    <CardDescription>
                                        Política oficial de Pollo Frito Sabor Cervanteño. Registro de Coffee Breaks, Almuerzos y Excesos.
                                    </CardDescription>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button onClick={exportBreaksToCSV} disabled={breaksReportData.length === 0} variant="outline" size="sm">
                                        <Download className="mr-2 h-4 w-4 text-emerald-600" /> Exportar Excel (CSV)
                                    </Button>
                                    <Button onClick={() => handlePrint('report-descansos')} disabled={breaksReportData.length === 0} variant="outline" size="sm">
                                        <Printer className="mr-2 h-4 w-4" /> Imprimir Reporte
                                    </Button>
                                    <Button onClick={sendWhatsAppBreaksReport} disabled={breaksReportData.length === 0} variant="outline" size="sm" className="text-emerald-700 dark:text-emerald-400">
                                        <MessageCircle className="mr-2 h-4 w-4" /> Enviar Resumen
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* KPI Metrics */}
                            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 no-print">
                                <Card className="p-3 bg-muted/40">
                                    <span className="text-[11px] text-muted-foreground uppercase font-semibold">Turnos Analizados</span>
                                    <p className="text-xl font-bold font-mono mt-1">{breaksTotals.totalShifts}</p>
                                </Card>
                                <Card className="p-3 bg-muted/40">
                                    <span className="text-[11px] text-muted-foreground uppercase font-semibold">Descansos Marcados</span>
                                    <p className="text-xl font-bold font-mono mt-1">{breaksTotals.totalBreaksCount}</p>
                                </Card>
                                <Card className="p-3 bg-muted/40">
                                    <span className="text-[11px] text-muted-foreground uppercase font-semibold">Minutos Consumidos</span>
                                    <p className="text-xl font-bold font-mono mt-1">{breaksTotals.totalMinutesTaken} min</p>
                                </Card>
                                <Card className={cn("p-3", breaksTotals.totalExcessMinutes > 0 ? "bg-destructive/10 border-destructive/30" : "bg-emerald-500/10 border-emerald-500/20")}>
                                    <span className="text-[11px] uppercase font-semibold flex items-center gap-1">
                                        {breaksTotals.totalExcessMinutes > 0 ? (
                                            <span className="text-destructive font-bold flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Minutos de Exceso</span>
                                        ) : (
                                            <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> En Regla</span>
                                        )}
                                    </span>
                                    <p className={cn("text-xl font-bold font-mono mt-1", breaksTotals.totalExcessMinutes > 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>
                                        {breaksTotals.totalExcessMinutes} min
                                    </p>
                                </Card>
                                <Card className="p-3 bg-muted/40 col-span-2 lg:col-span-1">
                                    <span className="text-[11px] text-muted-foreground uppercase font-semibold">Deducción Estimada</span>
                                    <p className="text-xl font-bold font-mono mt-1 text-primary">
                                        ₡{breaksTotals.totalDeduction.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                </Card>
                            </div>

                            {/* Filter Bar */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 no-print border-y py-4">
                                <div>
                                    <Label className="text-xs mb-1 block text-muted-foreground">Filtrar por Colaborador</Label>
                                    <Select value={breaksEmployeeId} onValueChange={setBreaksEmployeeId}>
                                        <SelectTrigger><SelectValue placeholder="Todos los colaboradores" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos los colaboradores ({employees.length})</SelectItem>
                                            {employees.map(e => (
                                                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs mb-1 block text-muted-foreground">Buscar por Nombre o Cédula</Label>
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Buscar colaborador..."
                                            value={breaksSearchQuery}
                                            onChange={(e) => setBreaksSearchQuery(e.target.value)}
                                            className="pl-9 text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Printable Report Section */}
                            <div id="report-descansos" className="bg-white p-6 md:p-8 rounded-lg border shadow-sm text-black">
                                <div className="report-header flex justify-between items-start border-b-2 border-black pb-4 mb-6">
                                    <div className="report-info">
                                        <span className="text-[11px] font-bold tracking-widest uppercase text-muted-foreground">SABOR CERVANTEÑO CON GUSTO</span>
                                        <h2 className="text-2xl font-black uppercase tracking-tight">Reporte de Control de Descansos</h2>
                                        <p className="text-xs font-semibold uppercase text-muted-foreground">Política de Descansos para Alimentación</p>
                                        <div className="space-y-0.5 mt-2 text-xs">
                                            <p><span className="font-bold">PERÍODO:</span> {date?.from ? format(date.from, 'dd/MM/yyyy', { locale: es }) : ''} al {date?.to ? format(date.to, 'dd/MM/yyyy', { locale: es }) : ''}</p>
                                            <p className="text-gray-500 text-[10px]"><span className="font-bold">EMISIÓN:</span> {printTimestamp}</p>
                                        </div>
                                    </div>
                                    <div className="logo-container">
                                        {logoUrl && <img src={logoUrl} alt="Logo" className="max-h-16 object-contain" />}
                                    </div>
                                </div>

                                <Table className="w-full border text-xs">
                                    <TableHeader>
                                        <TableRow className="bg-muted/50 border-black">
                                            <TableHead className="font-bold text-black uppercase text-[10px]">Fecha</TableHead>
                                            <TableHead className="font-bold text-black uppercase text-[10px]">Colaborador</TableHead>
                                            <TableHead className="font-bold text-black uppercase text-[10px]">Entrada/Salida</TableHead>
                                            <TableHead className="font-bold text-black uppercase text-[10px]">Jornada</TableHead>
                                            <TableHead className="font-bold text-black uppercase text-[10px]">Marcas de Descanso</TableHead>
                                            <TableHead className="text-center font-bold text-black uppercase text-[10px]">Tomado</TableHead>
                                            <TableHead className="text-center font-bold text-black uppercase text-[10px]">Permitido</TableHead>
                                            <TableHead className="text-center font-bold text-black uppercase text-[10px]">Exceso</TableHead>
                                            <TableHead className="text-right font-bold text-black uppercase text-[10px]">Deducción (₡)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {breaksReportData.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                                                    No se encontraron registros de turnos o descansos para los filtros seleccionados.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            breaksReportData.map((item, idx) => (
                                                <TableRow key={item.id || idx} className="border-b">
                                                    <TableCell className="py-2.5 font-mono text-[10px]">{item.date}</TableCell>
                                                    <TableCell className="py-2.5">
                                                        <div className="font-bold uppercase text-[11px]">{item.employeeName}</div>
                                                        <div className="text-[9px] text-muted-foreground font-mono">{item.cedula}</div>
                                                    </TableCell>
                                                    <TableCell className="py-2.5 font-mono text-[10px]">
                                                        <div>{item.clockIn} - {item.clockOut}</div>
                                                        <div className="text-[9px] text-muted-foreground">({item.durationHours.toFixed(1)}h fís.)</div>
                                                    </TableCell>
                                                    <TableCell className="py-2.5">
                                                        <Badge variant="outline" className="text-[9px] font-semibold">
                                                            {item.categoryLabel}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="py-2.5">
                                                        {item.breaks.length === 0 ? (
                                                            <span className="text-[10px] text-muted-foreground italic">Sin descansos registrados</span>
                                                        ) : (
                                                            <div className="space-y-1">
                                                                {item.breaks.map((b: any, bIdx: number) => {
                                                                    const bIn = b.start ? format(toDate(b.start), 'HH:mm') : '';
                                                                    const bOut = b.end ? format(toDate(b.end), 'HH:mm') : 'En curso';
                                                                    return (
                                                                        <div key={bIdx} className="text-[10px] flex items-center gap-1 font-mono">
                                                                            <span className="font-bold text-gray-700">{b.name || 'Descanso'}:</span>
                                                                            <span>{bIn} - {bOut}</span>
                                                                            <span className="text-muted-foreground font-bold">({b.durationMinutes ?? 0}m)</span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="py-2.5 text-center font-mono font-bold text-[11px]">
                                                        {item.totalBreakMinutes} min
                                                    </TableCell>
                                                    <TableCell className="py-2.5 text-center font-mono text-muted-foreground text-[11px]">
                                                        {item.allowedBreakMinutes} min
                                                    </TableCell>
                                                    <TableCell className="py-2.5 text-center font-mono font-bold">
                                                        {item.excessBreakMinutes > 0 ? (
                                                            <span className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded text-[11px]">
                                                                +{item.excessBreakMinutes} min
                                                            </span>
                                                        ) : (
                                                            <span className="text-emerald-700 text-[10px]">0 min</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="py-2.5 text-right font-mono font-bold text-[11px]">
                                                        {item.excessDeduction > 0 ? (
                                                            <span className="text-red-600">
                                                                ₡{item.excessDeduction.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground">₡0.00</span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                    <TableFooter>
                                        <TableRow className="bg-gray-100 border-t-2 border-black font-black">
                                            <TableCell colSpan={5} className="text-xs uppercase">TOTALES CONSOLIDADOS DEL PERÍODO</TableCell>
                                            <TableCell className="text-center font-mono text-xs">{breaksTotals.totalMinutesTaken} min</TableCell>
                                            <TableCell className="text-center font-mono text-xs">{breaksTotals.totalAllowedMinutes} min</TableCell>
                                            <TableCell className="text-center font-mono text-xs text-red-600">
                                                {breaksTotals.totalExcessMinutes > 0 ? `+${breaksTotals.totalExcessMinutes} min` : '0 min'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-xs text-red-600">
                                                ₡{breaksTotals.totalDeduction.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                        </TableRow>
                                    </TableFooter>
                                </Table>

                                <div className="mt-20 flex justify-between items-end px-4">
                                    <div className="sig-box border-t border-black w-72 pt-2 text-center">
                                        <p className="text-xs font-bold uppercase tracking-widest">Firma del Colaborador</p>
                                        <p className="text-[9px] text-gray-500 mt-0.5">Aceptación de tiempos de descanso y alimentación registrados</p>
                                    </div>
                                    <div className="sig-box border-t border-black w-72 pt-2 text-center">
                                        <p className="text-xs font-bold uppercase tracking-widest">Sello / Encargado de Turno</p>
                                        <p className="text-[9px] text-gray-500 mt-0.5">Pollo Frito Sabor Cervanteño</p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="historial" className="space-y-4 pt-4">
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                <div>
                                    <CardTitle>Historial de Comprobantes Guardados</CardTitle>
                                    <CardDescription>Auditoría y consulta de los pagos registrados oficialmente en el sistema.</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant={historyFilterDateRange ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setHistoryFilterDateRange(!historyFilterDateRange)}
                                        className="text-xs"
                                    >
                                        <Filter className="h-3.5 w-3.5 mr-1" />
                                        {historyFilterDateRange ? "Filtrado por Rango Activo" : "Ver Todo el Historial"}
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Filter Bar */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div>
                                    <Label className="text-xs mb-1 block text-muted-foreground">Buscar por Nombre o Cédula</Label>
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Buscar colaborador..."
                                            value={historySearchQuery}
                                            onChange={(e) => setHistorySearchQuery(e.target.value)}
                                            className="pl-9 text-sm"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-xs mb-1 block text-muted-foreground">Filtrar por Colaborador</Label>
                                    <Select value={historyFilterEmpId} onValueChange={setHistoryFilterEmpId}>
                                        <SelectTrigger><SelectValue placeholder="Todos los colaboradores" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos los colaboradores ({employees.length})</SelectItem>
                                            {employees.map(e => (
                                                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-end">
                                    {historyFilterDateRange && date?.from && date?.to ? (
                                        <div className="text-xs bg-muted/60 p-2 rounded-md border w-full text-muted-foreground">
                                            Rango: <span className="font-semibold text-foreground">{format(date.from, 'dd/MM/yyyy')}</span> al <span className="font-semibold text-foreground">{format(date.to, 'dd/MM/yyyy')}</span>
                                        </div>
                                    ) : (
                                        <div className="text-xs text-muted-foreground p-2">
                                            Mostrando todos los comprobantes históricos guardados ({payslips.length} en total).
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Summary Metrics */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <div className="bg-muted/30 border rounded-lg p-3">
                                    <p className="text-xs text-muted-foreground font-medium">Comprobantes</p>
                                    <p className="text-xl font-bold mt-1 text-foreground">{payslipsTotals.count}</p>
                                </div>
                                <div className="bg-muted/30 border rounded-lg p-3">
                                    <p className="text-xs text-muted-foreground font-medium">Total Bruto</p>
                                    <p className="text-xl font-bold mt-1 text-primary">₡{payslipsTotals.totalGross.toLocaleString('es-CR')}</p>
                                </div>
                                <div className="bg-muted/30 border rounded-lg p-3">
                                    <p className="text-xs text-muted-foreground font-medium">Deducciones</p>
                                    <p className="text-xl font-bold mt-1 text-destructive">-₡{payslipsTotals.totalDeductions.toLocaleString('es-CR')}</p>
                                </div>
                                <div className="bg-muted/30 border rounded-lg p-3">
                                    <p className="text-xs text-muted-foreground font-medium">Neto Pagado</p>
                                    <p className="text-xl font-bold mt-1 text-emerald-600">₡{payslipsTotals.totalNet.toLocaleString('es-CR')}</p>
                                </div>
                            </div>

                            {/* Table */}
                            {filteredPayslipsList.length === 0 ? (
                                <div className="text-center py-16 border-2 border-dashed rounded-lg bg-muted/10 space-y-2">
                                    <Receipt className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                                    <p className="text-base font-semibold text-foreground">No se encontraron comprobantes guardados</p>
                                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                                        {payslips.length === 0 
                                            ? "Aún no se han guardado comprobantes de pago. Puedes emitir y guardar comprobantes oficiales desde la sección 'Comprobante de Pago'."
                                            : "No hay comprobantes que coincidan con los filtros seleccionados."}
                                    </p>
                                </div>
                            ) : (
                                <div className="border rounded-lg overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-muted/40">
                                            <TableRow>
                                                <TableHead>Período</TableHead>
                                                <TableHead>Colaborador</TableHead>
                                                <TableHead className="text-center">Horas</TableHead>
                                                <TableHead className="text-right">Bruto</TableHead>
                                                <TableHead className="text-right">Deducciones</TableHead>
                                                <TableHead className="text-right">Neto a Pagar</TableHead>
                                                <TableHead className="text-center">Fecha Registro</TableHead>
                                                <TableHead className="text-center no-print">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredPayslipsList.map((slip) => {
                                                const totalSlipHrs = (slip.hoursBreakdown?.regular || 0) + 
                                                                     (slip.hoursBreakdown?.overtime || 0) + 
                                                                     (slip.hoursBreakdown?.holiday || 0) + 
                                                                     ((slip.hoursBreakdown?.vacation || 0) * 8);
                                                const totalDeds = (slip.deductions?.caja || 0) + (slip.deductions?.loan || 0) + (slip.deductions?.savings || 0);

                                                return (
                                                    <TableRow key={slip.id} className="hover:bg-muted/30 transition-colors">
                                                        <TableCell className="font-mono text-xs">
                                                            <div className="font-semibold">{format(toDate(slip.startDate), 'dd/MM/yy')} al {format(toDate(slip.endDate), 'dd/MM/yy')}</div>
                                                            <span className="text-[10px] text-muted-foreground uppercase">{slip.type === 'vacation' ? 'Vacaciones' : 'Planilla Regular'}</span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="font-medium text-sm text-foreground">{slip.employeeName}</div>
                                                            <div className="text-[11px] text-muted-foreground font-mono">Céd: {slip.cedula}</div>
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono text-xs">
                                                            <span className="font-semibold">{totalSlipHrs.toFixed(1)}h</span>
                                                            {slip.hoursBreakdown?.overtime > 0 && (
                                                                <span className="block text-[10px] text-amber-600">({slip.hoursBreakdown.overtime}h ext)</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-xs font-semibold">
                                                            ₡{(slip.grossSalary || 0).toLocaleString('es-CR')}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-xs text-destructive">
                                                            -₡{totalDeds.toLocaleString('es-CR')}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-xs font-bold text-emerald-600 bg-emerald-50/50">
                                                            ₡{(slip.netSalary || 0).toLocaleString('es-CR')}
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono text-[11px] text-muted-foreground">
                                                            {slip.createdAt ? format(toDate(slip.createdAt), 'dd/MM/yy HH:mm') : '-'}
                                                        </TableCell>
                                                        <TableCell className="text-center no-print">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-primary hover:bg-primary/10"
                                                                    title="Ver / Imprimir Comprobante"
                                                                    onClick={() => setSelectedSlipForDetail(slip)}
                                                                >
                                                                    <Eye className="h-4 w-4" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-green-600 hover:bg-green-50"
                                                                    title="Enviar comprobante por WhatsApp"
                                                                    onClick={() => sendWhatsAppSavedPayslip(slip)}
                                                                >
                                                                    <MessageCircle className="h-4 w-4" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                                                    title="Eliminar Comprobante"
                                                                    onClick={() => setSlipToDelete(slip)}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                        <TableFooter className="bg-primary/5 font-bold">
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-xs">TOTALES ACUMULADOS ({filteredPayslipsList.length} Comprobantes)</TableCell>
                                                <TableCell className="text-right font-mono text-xs">₡{payslipsTotals.totalGross.toLocaleString('es-CR')}</TableCell>
                                                <TableCell className="text-right font-mono text-xs text-destructive">-₡{payslipsTotals.totalDeductions.toLocaleString('es-CR')}</TableCell>
                                                <TableCell className="text-right font-mono text-xs text-emerald-600">₡{payslipsTotals.totalNet.toLocaleString('es-CR')}</TableCell>
                                                <TableCell colSpan={2} className="text-center font-mono text-xs">{payslipsTotals.totalHours.toFixed(1)}h Totales</TableCell>
                                            </TableRow>
                                        </TableFooter>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="estado-cuenta" className="space-y-4 pt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Estado de Cuenta: Anual de Ingresos</CardTitle>
                            <CardDescription>Auditoría semanal y mensual basada en la regla de mayoría de días.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                                <div className="flex-grow">
                                    <Label className="text-xs mb-1 block">Seleccionar Colaborador</Label>
                                    <Select onValueChange={setHistoryEmployeeId} value={historyEmployeeId || ''}>
                                        <SelectTrigger><SelectValue placeholder="Elige un empleado..." /></SelectTrigger>
                                        <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="w-full sm:w-[150px]">
                                    <Label className="text-xs mb-1 block">Año</Label>
                                    <Select onValueChange={(val) => setHistoryYear(parseInt(val))} value={historyYear.toString()}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>{[2024, 2025, 2026].map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {!historyEmployeeId ? (
                                <div className="text-center py-20 bg-muted/20 border-2 border-dashed rounded-lg">Selecciona un empleado para ver su historial.</div>
                            ) : (
                                employeeSalaryHistory && (
                                    <div id="report-cuenta" className="space-y-8">
                                        <div className="flex justify-between items-end border-b pb-4">
                                            <div>
                                                <h3 className="text-2xl font-bold text-primary">{employeeSalaryHistory.employee.name}</h3>
                                                <p className="text-sm text-muted-foreground font-mono">Cédula: {employeeSalaryHistory.employee.cedula}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs uppercase font-bold text-muted-foreground">Total Bruto Anual {historyYear}</p>
                                                <p className="text-3xl font-bold text-primary">₡{employeeSalaryHistory.grandTotalGross.toLocaleString('es-CR')}</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {employeeSalaryHistory.months.map((month, idx) => (
                                                <Card key={idx} className={cn("border-l-4", month.totalGross > 0 ? "border-l-primary" : "border-l-muted opacity-60")}>
                                                    <CardHeader className="py-3 px-4 bg-muted/30">
                                                        <div className="flex justify-between items-center">
                                                            <CardTitle className="text-sm font-bold capitalize">{month.name}</CardTitle>
                                                            <TrendingUp className="h-4 w-4 text-primary/40" />
                                                        </div>
                                                    </CardHeader>
                                                    <CardContent className="p-0">
                                                        <Table>
                                                            <TableBody>
                                                                {month.weeks.map((week, wIdx) => (
                                                                    <TableRow key={wIdx} className="border-none">
                                                                        <TableCell className="py-1 px-4 text-[10px] text-muted-foreground">
                                                                            Sem. {wIdx + 1}: {week.range}
                                                                        </TableCell>
                                                                        <TableCell className="py-1 px-4 text-right font-mono text-xs">
                                                                            ₡{week.grossSalary.toLocaleString('es-CR')}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                            <TableFooter className="bg-primary/5">
                                                                <TableRow>
                                                                    <TableCell className="py-2 px-4 text-xs font-bold">TOTAL MES</TableCell>
                                                                    <TableCell className="py-2 px-4 text-right font-bold">₡{month.totalGross.toLocaleString('es-CR')}</TableCell>
                                                                </TableRow>
                                                            </TableFooter>
                                                        </Table>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                )
                            )}
                        </CardContent>
                        <CardFooter className="justify-end no-print">
                            <Button onClick={() => handlePrint('report-cuenta')} disabled={!historyEmployeeId} variant="outline">
                                <Printer className="mr-2 h-4 w-4" /> Imprimir Estado de Cuenta
                            </Button>
                        </CardFooter>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Modal de Detalle / Reimpresión de Comprobante Guardado */}
            <Dialog open={!!selectedSlipForDetail} onOpenChange={(open) => !open && setSelectedSlipForDetail(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Comprobante Oficial Guardado</DialogTitle>
                        <DialogDescription>
                            Detalle del comprobante emitido {selectedSlipForDetail?.createdAt ? `el ${format(toDate(selectedSlipForDetail.createdAt), 'dd/MM/yyyy HH:mm')}` : ''}.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedSlipForDetail && (
                        <div className="space-y-4">
                            <div id="saved-slip-print-box" className="border rounded-lg p-6 bg-white space-y-6 text-foreground">
                                <div className="flex justify-between items-start border-b pb-4">
                                    <div>
                                        {logoUrl && <img src={logoUrl} alt="Logo" className="h-10 max-w-[140px] object-contain mb-2" />}
                                        <h3 className="text-xl font-bold text-primary">Comprobante de Pago</h3>
                                        <p className="text-xs text-muted-foreground">
                                            Período: <span className="font-semibold text-foreground">{format(toDate(selectedSlipForDetail.startDate), 'dd/MM/yyyy')}</span> al <span className="font-semibold text-foreground">{format(toDate(selectedSlipForDetail.endDate), 'dd/MM/yyyy')}</span>
                                        </p>
                                        <Badge variant="outline" className="mt-1 uppercase text-[10px]">
                                            {selectedSlipForDetail.type === 'vacation' ? 'Vacaciones' : 'Planilla Regular'}
                                        </Badge>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-base text-foreground uppercase">{selectedSlipForDetail.employeeName}</p>
                                        <p className="text-xs font-mono text-muted-foreground">Cédula: {selectedSlipForDetail.cedula}</p>
                                        {selectedSlipForDetail.createdAt && (
                                            <p className="text-[10px] text-muted-foreground mt-1">
                                                Registrado: {format(toDate(selectedSlipForDetail.createdAt), 'dd/MM/yyyy HH:mm')}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Desglose de Horas e Ingresos */}
                                <div className="space-y-2">
                                    <div className="text-xs font-bold text-primary uppercase tracking-wider border-b pb-1">
                                        Desglose de Ingresos y Horas
                                    </div>
                                    <div className="space-y-1.5 text-xs">
                                        {selectedSlipForDetail.hoursBreakdown && (
                                            <div className="flex justify-between text-muted-foreground">
                                                <span>Horas Regulares Laboradas:</span>
                                                <span className="font-mono font-medium text-foreground">{selectedSlipForDetail.hoursBreakdown.regular || 0} horas</span>
                                            </div>
                                        )}
                                        {selectedSlipForDetail.hoursBreakdown?.overtime ? (
                                            <div className="flex justify-between text-muted-foreground">
                                                <span>Horas Extras (1.5x / 2.0x):</span>
                                                <span className="font-mono font-medium text-amber-600">{selectedSlipForDetail.hoursBreakdown.overtime} horas</span>
                                            </div>
                                        ) : null}
                                        {selectedSlipForDetail.hoursBreakdown?.holiday ? (
                                            <div className="flex justify-between text-muted-foreground">
                                                <span>Feriados Reconocidos:</span>
                                                <span className="font-mono font-medium text-foreground">{selectedSlipForDetail.hoursBreakdown.holiday} horas</span>
                                            </div>
                                        ) : null}
                                        {selectedSlipForDetail.hoursBreakdown?.vacation ? (
                                            <div className="flex justify-between text-muted-foreground">
                                                <span>Días de Vacaciones Pagados:</span>
                                                <span className="font-mono font-medium text-foreground">{selectedSlipForDetail.hoursBreakdown.vacation} días</span>
                                            </div>
                                        ) : null}
                                        
                                        <div className="flex justify-between font-bold text-sm pt-2 border-t mt-2">
                                            <span>SALARIO BRUTO:</span>
                                            <span className="font-mono text-primary">₡{(selectedSlipForDetail.grossSalary || 0).toLocaleString('es-CR')}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Deducciones */}
                                <div className="space-y-2">
                                    <div className="text-xs font-bold text-primary uppercase tracking-wider border-b pb-1">
                                        Deducciones y Retenciones
                                    </div>
                                    <div className="space-y-1.5 text-xs">
                                        <div className="flex justify-between text-muted-foreground">
                                            <span>CCSS (Caja Costarricense de Seguro Social):</span>
                                            <span className="font-mono text-destructive">-₡{(selectedSlipForDetail.deductions?.caja || 0).toLocaleString('es-CR')}</span>
                                        </div>
                                        {(selectedSlipForDetail.deductions?.loan || 0) > 0 && (
                                            <div className="flex justify-between text-muted-foreground">
                                                <span>Cuota de Préstamo / Adelanto:</span>
                                                <span className="font-mono text-destructive">-₡{selectedSlipForDetail.deductions.loan.toLocaleString('es-CR')}</span>
                                            </div>
                                        )}
                                        {(selectedSlipForDetail.deductions?.savings || 0) > 0 && (
                                            <div className="flex justify-between text-muted-foreground">
                                                <span>Aporte Plan de Ahorro:</span>
                                                <span className="font-mono text-destructive">-₡{selectedSlipForDetail.deductions.savings.toLocaleString('es-CR')}</span>
                                            </div>
                                        )}

                                        <div className="flex justify-between font-bold text-base pt-3 border-t-2 border-primary mt-2 text-emerald-600 bg-emerald-50/50 p-2 rounded">
                                            <span>NETO A PAGAR:</span>
                                            <span className="font-mono">₡{(selectedSlipForDetail.netSalary || 0).toLocaleString('es-CR')}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Firmas para impresión */}
                                <div className="pt-8 flex justify-between gap-8 mt-6">
                                    <div className="border-t border-black/80 flex-1 text-center pt-2">
                                        <p className="text-[11px] font-bold uppercase">Firma del Colaborador</p>
                                        <p className="text-[9px] text-muted-foreground">Recibí conforme</p>
                                    </div>
                                    <div className="border-t border-black/80 flex-1 text-center pt-2">
                                        <p className="text-[11px] font-bold uppercase">Sello / Administración</p>
                                        <p className="text-[9px] text-muted-foreground">TimeWise Dining</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="flex flex-col sm:flex-row justify-between gap-2 border-t pt-4">
                        <div className="flex gap-2">
                            {selectedSlipForDetail && (
                                <Button
                                    variant="outline"
                                    onClick={() => sendWhatsAppSavedPayslip(selectedSlipForDetail)}
                                    className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                >
                                    <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                onClick={() => handlePrint('saved-slip-print-box')}
                            >
                                <Printer className="h-4 w-4 mr-2" /> Imprimir
                            </Button>
                        </div>
                        <Button variant="secondary" onClick={() => setSelectedSlipForDetail(null)}>
                            Cerrar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Confirmación para Eliminar Comprobante */}
            <AlertDialog open={!!slipToDelete} onOpenChange={(open) => !open && setSlipToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar este comprobante?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción eliminará el comprobante guardado de <span className="font-bold text-foreground">{slipToDelete?.employeeName}</span> para el período del {slipToDelete ? format(toDate(slipToDelete.startDate), 'dd/MM/yyyy') : ''} al {slipToDelete ? format(toDate(slipToDelete.endDate), 'dd/MM/yyyy') : ''}.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setSlipToDelete(null)}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                if (slipToDelete) {
                                    deletePayslip(slipToDelete.id);
                                    setSlipToDelete(null);
                                }
                            }}
                        >
                            Eliminar Comprobante
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
