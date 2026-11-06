'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import {
  Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar as CalendarIcon, Printer, Save, MessageCircle, Loader2 } from 'lucide-react';
import { useAppData } from '@/context/app-data-provider';
import type { DateRange } from 'react-day-picker';
import { format, subDays, startOfMonth, endOfMonth, getYear, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Employee, PayslipRecord } from '@/lib/data';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { calculateLaborPeriod, getWeeksBelongingToMonth, type CalculationResult } from '@/lib/calculations';
import { calculateShiftBreakSummary } from '@/lib/break-policy';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Timestamp } from 'firebase/firestore';

type PayslipData = CalculationResult & {
  vacationPay: number;
  vacationDays: number;
  netSalary: number;
  grossSalary: number;
  cajaDeduction: number;
  loanDeduction: number;
  savingsDeduction: number;
  breakExcessDeduction?: number;
  breakExcessMinutes?: number;
  loanBalance: number;
  savingsBalance: number;
  totalHours: number;
};

type AguinaldoData = {
  totalGrossSalaries: number;
  aguinaldoAmount: number;
  monthlyBreakdown: { month: string; year: number; grossSalary: number; isManual: boolean; isFromHistory: boolean }[];
};

export default function PayslipsPage() {
  const { employees, shifts, updateEmployee, holidays, locations, logoUrl, savePayslip, payslips, schedule, firstDayOfWeek1 } = useAppData();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedAguinaldoYear, setSelectedAguinaldoYear] = useState<string>('');
  const [yearsForAguinaldo, setYearsForAguinaldo] = useState<number[]>([]);
  const [vacationDaysToPay, setVacationDaysToPay] = useState<number>(0);
  const { toast } = useToast();

  const [date, setDate] = useState<DateRange | undefined>();
  const [payslipData, setPayslipData] = useState<PayslipData | null>(null);
  const [aguinaldoData, setAguinaldoData] = useState<AguinaldoData | null>(null);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [pendingPayslip, setPendingPayslip] = useState<PayslipData | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const today = new Date();
    setDate({
      from: subDays(today, 15),
      to: today,
    });
    const currentYear = getYear(today);
    setSelectedAguinaldoYear(currentYear.toString());
    setYearsForAguinaldo(Array.from({ length: 5 }, (_, i) => currentYear - i));
  }, []);

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId) || null;

  useEffect(() => {
    setPayslipData(null);
    if (aguinaldoData) setAguinaldoData(null);
  }, [selectedEmployeeId, date, selectedAguinaldoYear]);

  const calculatePayslip = () => {
    if (!selectedEmployee || !date?.from || !date?.to || !locations) return;

    const stats = calculateLaborPeriod(selectedEmployee, date.from, date.to, shifts, holidays, locations, schedule, firstDayOfWeek1);
    
    const hourlyRate = selectedEmployee.hourlyRate || 0;
    const vacationPayValue = vacationDaysToPay * hourlyRate * 8;
    const grossSalary = stats.grossSalary + vacationPayValue;

    // Cálculo de descansos y excesos acumulados en el período
    const fromDate = startOfDay(date.from);
    const toDateEnd = endOfDay(date.to);
    const employeeShiftsInPeriod = (shifts || []).filter(s => {
      if (s.employeeId !== selectedEmployee.id || !s.clockIn) return false;
      const sIn = s.clockIn instanceof Date ? s.clockIn : new Date(s.clockIn);
      return isWithinInterval(sIn, { start: fromDate, end: toDateEnd });
    });

    let periodExcessBreakMinutes = 0;
    employeeShiftsInPeriod.forEach(s => {
      const summary = calculateShiftBreakSummary(s.clockIn, s.clockOut, s.breaks || [], hourlyRate);
      periodExcessBreakMinutes += summary.excessMinutes;
    });

    const breakExcessHours = periodExcessBreakMinutes / 60;
    const breakExcessDeduction = breakExcessHours * hourlyRate;

    const cajaDeduction = grossSalary * ((selectedEmployee.cajaRetentionRate || 0) / 100);
    const loanDeduction = Math.min(selectedEmployee.loanPayment || 0, selectedEmployee.loanAmount || 0);
    const savingsDeduction = selectedEmployee.savingsPayment || 0;
    const netSalary = grossSalary - cajaDeduction - loanDeduction - savingsDeduction - breakExcessDeduction;
    const loanBalance = Math.max(0, (selectedEmployee.loanAmount || 0) - loanDeduction);
    const savingsBalance = (selectedEmployee.savingsAmount || 0) + savingsDeduction;

    const data: PayslipData = {
      ...stats,
      grossSalary,
      netSalary,
      cajaDeduction,
      loanDeduction,
      savingsDeduction,
      breakExcessDeduction,
      breakExcessMinutes: periodExcessBreakMinutes,
      loanBalance,
      savingsBalance,
      totalHours: stats.totalHoursToPay,
      vacationPay: vacationPayValue,
      vacationDays: vacationDaysToPay
    };
    
    setPendingPayslip(data);
    setIsConfirmationOpen(true);
  };
  
  const handleConfirmDeductions = (applyDeductions: boolean) => {
    if (!pendingPayslip || !selectedEmployee) return;

    if (applyDeductions) {
        setPayslipData(pendingPayslip);
    } else {
        const { grossSalary, cajaDeduction, breakExcessDeduction } = pendingPayslip;
        const newNetSalary = grossSalary - cajaDeduction - (breakExcessDeduction || 0);
        
        setPayslipData({
            ...pendingPayslip,
            loanDeduction: 0,
            savingsDeduction: 0,
            loanBalance: selectedEmployee.loanAmount || 0,
            savingsBalance: selectedEmployee.savingsAmount || 0,
            netSalary: newNetSalary,
        });
    }
    setIsConfirmationOpen(false);
    setPendingPayslip(null);
  };

  const sendWhatsApp = () => {
    if (!selectedEmployee || !payslipData || !date?.from || !date?.to) return;

    const p = payslipData;
    const totalHolidayPay = p.holidayPay + p.holidayNotWorkedPay;
    
    let message = `*COMPROBANTE DE PAGO*\n`;
    message += `📅 *Período:* ${format(date.from, 'dd/MM/yy')} - ${format(date.to, 'dd/MM/yy')}\n`;
    message += `--------------------------\n`;
    message += `👤 *Empleado:* ${selectedEmployee.name}\n`;
    message += `🆔 *Cédula:* ${selectedEmployee.cedula}\n`;
    message += `--------------------------\n`;
    message += `🕒 *DESGLOSE DE HORAS E INGRESOS*\n`;
    if (p.posRegularHours > 0) message += ` · Ordinarias POS (1.0×): ${p.posRegularHours.toFixed(2)}h = ₡${p.posRegularPay.toLocaleString('es-CR')}\n`;
    if (p.cediRegularHours > 0) message += ` · Ordinarias CEDI (1.0×): ${p.cediRegularHours.toFixed(2)}h = ₡${p.cediRegularPay.toLocaleString('es-CR')}\n`;
    if (p.posDailyOvertimeHours > 0) message += ` · Extra Diaria POS (1.5×): ${p.posDailyOvertimeHours.toFixed(2)}h = ₡${p.posDailyOvertimePay.toLocaleString('es-CR')}\n`;
    if (p.cediDailyOvertimeHours > 0) message += ` · Extra Diaria CEDI (1.5×): ${p.cediDailyOvertimeHours.toFixed(2)}h = ₡${p.cediDailyOvertimePay.toLocaleString('es-CR')}\n`;
    if (p.posWeeklyOvertime1x5Hours > 0) message += ` · Extra Semanal POS (1.5×): ${p.posWeeklyOvertime1x5Hours.toFixed(2)}h = ₡${p.posWeeklyOvertime1x5Pay.toLocaleString('es-CR')}\n`;
    if (p.cediWeeklyOvertime1x5Hours > 0) message += ` · Extra Semanal CEDI (1.5×): ${p.cediWeeklyOvertime1x5Hours.toFixed(2)}h = ₡${p.cediWeeklyOvertime1x5Pay.toLocaleString('es-CR')}\n`;
    if (p.posWeeklyOvertime2xHours > 0) message += ` · Extra Semanal >60 POS (2.0×): ${p.posWeeklyOvertime2xHours.toFixed(2)}h = ₡${p.posWeeklyOvertime2xPay.toLocaleString('es-CR')}\n`;
    if (p.cediWeeklyOvertime2xHours > 0) message += ` · Extra Semanal >60 CEDI (2.0×): ${p.cediWeeklyOvertime2xHours.toFixed(2)}h = ₡${p.cediWeeklyOvertime2xPay.toLocaleString('es-CR')}\n`;
    if (p.holidayHoursWorked2x > 0) message += ` · Feriado Trabajado (2.0×): ${p.holidayHoursWorked2x.toFixed(2)}h = ₡${p.holidayWorkedPay2x.toLocaleString('es-CR')}\n`;
    if (p.holidayHoursWorked3x > 0) message += ` · Extra Feriado (3.0×): ${p.holidayHoursWorked3x.toFixed(2)}h = ₡${p.holidayWorkedPay3x.toLocaleString('es-CR')}\n`;
    if (p.holidayHoursNotWorked > 0) message += ` · Feriado No Trabajado (1.0×): ${p.holidayHoursNotWorked.toFixed(2)}h = ₡${p.holidayNotWorkedPay.toLocaleString('es-CR')}\n`;
    if (p.vacationDays > 0) message += ` · Vacaciones (${p.vacationDays}d): ₡${p.vacationPay.toLocaleString('es-CR')}\n`;
    
    message += `--------------------------\n`;
    message += `💰 *RESUMEN FINANCIERO*\n`;
    message += `*SALARIO BRUTO: ₡${p.grossSalary.toLocaleString('es-CR')}*\n`;
    message += ` · Rebajo CCSS: -₡${p.cajaDeduction.toLocaleString('es-CR')}\n`;
    if (p.breakExcessDeduction && p.breakExcessDeduction > 0) message += ` · Rebajo Exceso Descansos (${p.breakExcessMinutes || 0}m): -₡${p.breakExcessDeduction.toLocaleString('es-CR')}\n`;
    if (p.loanDeduction > 0) message += ` · Rebajo Préstamo: -₡${p.loanDeduction.toLocaleString('es-CR')}\n`;
    if (p.savingsDeduction > 0) message += ` · Aporte Ahorros: -₡${p.savingsDeduction.toLocaleString('es-CR')}\n`;
    message += `--------------------------\n`;
    message += `✅ *SALARIO NETO: ₡${p.netSalary.toLocaleString('es-CR')}*\n`;
    message += `--------------------------\n`;
    message += `📉 *Saldos Actuales:*\n`;
    message += ` · Préstamo: ₡${p.loanBalance.toLocaleString('es-CR')}\n`;
    message += ` · Ahorros: ₡${p.savingsBalance.toLocaleString('es-CR')}\n`;

    const encodedMessage = encodeURIComponent(message);
    const phone = selectedEmployee.phone ? selectedEmployee.phone.replace(/\D/g, '') : '';
    window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
  };

  const handleSaveToHistory = async () => {
    if (!selectedEmployee || !date?.from || !date?.to || !payslipData) return;
    
    setIsSaving(true);
    try {
        const record: Partial<PayslipRecord> = {
            employeeId: selectedEmployee.id,
            employeeName: selectedEmployee.name,
            cedula: selectedEmployee.cedula,
            startDate: date.from,
            endDate: date.to,
            type: 'regular',
            grossSalary: payslipData.grossSalary,
            netSalary: payslipData.netSalary,
            deductions: {
                caja: payslipData.cajaDeduction,
                loan: payslipData.loanDeduction,
                savings: payslipData.savingsDeduction,
                breakExcess: payslipData.breakExcessDeduction || 0,
            },
            breakExcessMinutes: payslipData.breakExcessMinutes || 0,
            hoursBreakdown: {
                regular: payslipData.regularHours,
                overtime: payslipData.dailyOvertimeHours + payslipData.weeklyOvertimeHours1x5 + payslipData.weeklyOvertimeHours2x,
                holiday: payslipData.holidayHoursWorked + payslipData.holidayHoursNotWorked,
                vacation: payslipData.vacationDays
            }
        };

        await savePayslip(record);
        confirmAndSaveChanges();
        toast({ title: 'Comprobante Guardado', description: 'Historial y saldos actualizados.' });
    } catch (e) {
        toast({ title: 'Error', description: 'No se pudo guardar el comprobante.', variant: 'destructive' });
    } finally {
        setIsSaving(false);
    }
  };

  const confirmAndSaveChanges = () => {
    if (!selectedEmployee || !payslipData) return;
    let updatedData: Partial<Employee> = {};
    if (payslipData.loanDeduction > 0) {
        updatedData.loanAmount = payslipData.loanBalance;
        if (payslipData.loanBalance <= 0) updatedData.loanPayment = 0;
    }
    if (payslipData.savingsDeduction > 0) updatedData.savingsAmount = payslipData.savingsBalance;
    if (payslipData.vacationDays > 0) updatedData.vacationDaysTaken = (selectedEmployee.vacationDaysTaken || 0) + payslipData.vacationDays;
    if (Object.keys(updatedData).length > 0) updateEmployee(selectedEmployee.id, updatedData);
  }

  const calculateAguinaldo = () => {
      if (!selectedEmployee || !locations) return;
      const year = parseInt(selectedAguinaldoYear);
      let totalGrossSalariesSum = 0;
      const monthlyBreakdown = [];

      for (let i = 0; i < 12; i++) {
          const monthDate = new Date(year - 1, 11 + i, 1);
          const monthKey = format(monthDate, 'yyyy-MM');
          const monthStart = startOfMonth(monthDate);
          const monthEnd = endOfMonth(monthDate);

          let monthGrossSalary = 0;
          let isManual = false;
          let isFromHistory = false;

          const toDate = (d: any) => d instanceof Timestamp ? d.toDate() : new Date(d);
          const historyMatches = payslips.filter(p => 
            p.employeeId === selectedEmployee.id && 
            p.type === 'regular' &&
            isWithinInterval(toDate(p.endDate), { start: monthStart, end: monthEnd })
          );

          if (selectedEmployee.manualSalaries?.[monthKey] !== undefined) {
            monthGrossSalary = Number(selectedEmployee.manualSalaries[monthKey]);
            isManual = true;
          } else if (historyMatches.length > 0) {
            monthGrossSalary = historyMatches.reduce((acc, curr) => acc + curr.grossSalary, 0);
            isFromHistory = true;
          } else {
            const weeks = getWeeksBelongingToMonth(monthDate.getFullYear(), monthDate.getMonth());
            weeks.forEach(w => {
              const stats = calculateLaborPeriod(selectedEmployee, w.start, w.end, shifts, holidays, locations, schedule, firstDayOfWeek1);
              monthGrossSalary += stats.grossSalary;
            });
          }
          
          totalGrossSalariesSum += monthGrossSalary;
          monthlyBreakdown.push({ 
            month: format(monthDate, 'MMMM', { locale: es }), 
            year: getYear(monthDate), 
            grossSalary: monthGrossSalary, 
            isManual, 
            isFromHistory 
          });
      }
      setAguinaldoData({ totalGrossSalaries: totalGrossSalariesSum, aguinaldoAmount: totalGrossSalariesSum / 12, monthlyBreakdown });
  }

  const sendWhatsAppAguinaldo = () => {
    if (!selectedEmployee || !aguinaldoData) return;
    const formatMoney = (v: number) => v.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let message = `*COMPROBANTE OFICIAL DE AGUINALDO ${selectedAguinaldoYear}*\n`;
    message += `📅 *Período:* Diciembre ${Number(selectedAguinaldoYear) - 1} - Noviembre ${selectedAguinaldoYear}\n`;
    message += `--------------------------\n`;
    message += `👤 *Colaborador:* ${selectedEmployee.name}\n`;
    message += `🆔 *Cédula:* ${selectedEmployee.cedula}\n`;
    message += `--------------------------\n`;
    message += `📊 *DESGLOSE DE SALARIOS BRUTOS POR MES:*\n`;

    aguinaldoData.monthlyBreakdown.forEach((m) => {
      const capMonth = m.month.charAt(0).toUpperCase() + m.month.slice(1);
      message += ` · ${capMonth} ${m.year}: ₡${formatMoney(m.grossSalary)}\n`;
    });

    message += `--------------------------\n`;
    message += `💰 *SUMA TOTAL DE SALARIOS BRUTOS:* ₡${formatMoney(aguinaldoData.totalGrossSalaries)}\n`;
    message += `📐 *Cálculo Legal (Total ÷ 12):* ₡${formatMoney(aguinaldoData.totalGrossSalaries)} ÷ 12\n`;
    message += `🛡️ *Deducciones de Ley:* ₡0,00 (Exento)\n`;
    message += `--------------------------\n`;
    message += `✅ *MONTO TOTAL A CANCELAR: ₡${formatMoney(aguinaldoData.aguinaldoAmount)}*\n`;

    const encodedMessage = encodeURIComponent(message);
    const phone = selectedEmployee.phone ? selectedEmployee.phone.replace(/\D/g, '') : '';
    window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
  };

  const handlePrint = (areaId: string) => {
    const element = document.getElementById(areaId);
    if (!element) return;
    
    const printContents = element.innerHTML;
    const printWindow = window.open('', '', 'height=850,width=850');
    if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Comprobante de Pago</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 30px; color: #222; line-height: 1.4; }
                .no-print { display: none !important; }
                .no-screen { display: block !important; }
                .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #222; padding-bottom: 16px; margin-bottom: 18px; }
                .logo { max-height: 65px; margin-bottom: 8px; }
                .title { font-size: 22px; font-weight: bold; margin: 0; text-transform: uppercase; }
                .text-right { text-align: right; }
                .text-center { text-align: center; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 15px; font-size: 13px; }
                .section-title { font-weight: bold; border-bottom: 1px solid #ccc; margin-top: 18px; padding-bottom: 4px; font-size: 12px; text-transform: uppercase; color: #444; }
                .total-row { font-weight: bold; font-size: 17px; border-top: 2px solid #222; margin-top: 14px; padding-top: 10px; }
                .text-primary { color: #166534; }
                .text-destructive { color: #991b1b; }
                p { margin: 3px 0; }
                .border-t { border-top: 1px solid #ddd; margin-top: 10px; padding-top: 10px; }
                table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
                th, td { border: 1px solid #ddd; padding: 6px 10px; }
                th { background-color: #f4f4f5; font-weight: bold; text-transform: uppercase; font-size: 11px; }
                .capitalize { text-transform: capitalize; }
                .summary-box { border: 2px solid #166534; background-color: #f0fdf4; padding: 12px 16px; border-radius: 6px; margin-top: 16px; }
                .sig-container { display: flex; justify-content: space-between; margin-top: 60px; padding: 0 20px; }
                .sig-line { border-top: 1px solid #000; width: 230px; text-align: center; padding-top: 6px; font-size: 11px; }
              </style>
            </head>
            <body>
              ${printContents}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="regular" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="regular">Comprobante Planilla</TabsTrigger>
            <TabsTrigger value="aguinaldo">Aguinaldo</TabsTrigger>
        </TabsList>
        
        <TabsContent value="regular">
            <Card className="no-print">
                <CardHeader><CardTitle>Generar Pago de Planilla</CardTitle><CardDescription>Cálculo de haberes con tarifas POS/CEDI.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Select onValueChange={setSelectedEmployeeId}>
                        <SelectTrigger className="w-full sm:w-[250px]"><SelectValue placeholder="Empleado" /></SelectTrigger>
                        <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Popover>
                        <PopoverTrigger asChild>
                        <Button variant={'outline'} className="w-full sm:w-[300px] justify-start" disabled={!isMounted}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {isMounted && date?.from ? `${format(date.from, 'P', {locale:es})} - ${date.to ? format(date.to, 'P', {locale:es}) : ''}` : 'Elegir Rango'}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0"><Calendar mode="range" selected={date} onSelect={setDate} locale={es} /></PopoverContent>
                    </Popover>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Días de Vacaciones a Pagar</Label><Input type="number" value={vacationDaysToPay} onChange={(e) => setVacationDaysToPay(Number(e.target.value))} placeholder="0" /></div>
                  </div>
                  <Button onClick={calculatePayslip} disabled={!selectedEmployeeId || !date?.from} className="w-full sm:w-auto">Generar Comprobante</Button>
                </CardContent>
            </Card>
            
            {pendingPayslip && (
                 <AlertDialog open={isConfirmationOpen} onOpenChange={setIsConfirmationOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Confirmar Deducciones</AlertDialogTitle></AlertDialogHeader>
                        <div className="text-sm">¿Deseas aplicar el rebajo de préstamos y ahorros a este pago?</div>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <div className="flex gap-2">
                                <Button variant="secondary" onClick={() => handleConfirmDeductions(false)}>No aplicar</Button>
                                <Button onClick={() => handleConfirmDeductions(true)}>Aplicar</Button>
                            </div>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}

            {payslipData && selectedEmployee && (
                <Card id="payslip-print-area" className="mt-6 border-primary/20 bg-white">
                    <div className="no-screen hidden">
                        <div className="flex justify-between items-start w-full px-6 py-4">
                            <div>
                                {logoUrl && <img src={logoUrl} alt="Logo" className="logo" />}
                                <h2 className="title">Comprobante de Pago</h2>
                                <p>Período: {date?.from ? format(date.from, 'dd/MM/yyyy') : ''} al {date?.to ? format(date.to, 'dd/MM/yyyy') : ''}</p>
                            </div>
                            <div className="text-right">
                                <p style={{ fontWeight: 'bold', fontSize: '18px' }}>{selectedEmployee.name.toUpperCase()}</p>
                                <p>{selectedEmployee.cedula}</p>
                            </div>
                        </div>
                    </div>
                    <CardContent className="p-6 space-y-4">
                        <div className="section-title">DESGLOSE DE INGRESOS Y HORAS</div>
                        <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-sm">
                            {payslipData.posRegularHours > 0 && (
                                <React.Fragment>
                                    <p>Horas Ordinarias POS ({payslipData.posRegularHours.toFixed(2)}h × ₡{selectedEmployee.hourlyRate?.toLocaleString('es-CR')} × 1.0):</p>
                                    <p className="text-right font-medium">₡{payslipData.posRegularPay.toLocaleString('es-CR')}</p>
                                </React.Fragment>
                            )}
                            {payslipData.cediRegularHours > 0 && (
                                <React.Fragment>
                                    <p>Horas Ordinarias CEDI ({payslipData.cediRegularHours.toFixed(2)}h × ₡{(selectedEmployee.hourlyRateCedi || selectedEmployee.hourlyRate)?.toLocaleString('es-CR')} × 1.0):</p>
                                    <p className="text-right font-medium">₡{payslipData.cediRegularPay.toLocaleString('es-CR')}</p>
                                </React.Fragment>
                            )}
                            {payslipData.posDailyOvertimeHours > 0 && (
                                <React.Fragment>
                                    <p>Horas Extra Diarias POS ({payslipData.posDailyOvertimeHours.toFixed(2)}h × 1.5×):</p>
                                    <p className="text-right font-medium">₡{payslipData.posDailyOvertimePay.toLocaleString('es-CR')}</p>
                                </React.Fragment>
                            )}
                            {payslipData.cediDailyOvertimeHours > 0 && (
                                <React.Fragment>
                                    <p>Horas Extra Diarias CEDI ({payslipData.cediDailyOvertimeHours.toFixed(2)}h × 1.5×):</p>
                                    <p className="text-right font-medium">₡{payslipData.cediDailyOvertimePay.toLocaleString('es-CR')}</p>
                                </React.Fragment>
                            )}
                            {payslipData.posWeeklyOvertime1x5Hours > 0 && (
                                <React.Fragment>
                                    <p>Horas Extra Semanales POS 42-60 ({payslipData.posWeeklyOvertime1x5Hours.toFixed(2)}h × 1.5×):</p>
                                    <p className="text-right font-medium">₡{payslipData.posWeeklyOvertime1x5Pay.toLocaleString('es-CR')}</p>
                                </React.Fragment>
                            )}
                            {payslipData.cediWeeklyOvertime1x5Hours > 0 && (
                                <React.Fragment>
                                    <p>Horas Extra Semanales CEDI 42-60 ({payslipData.cediWeeklyOvertime1x5Hours.toFixed(2)}h × 1.5×):</p>
                                    <p className="text-right font-medium">₡{payslipData.cediWeeklyOvertime1x5Pay.toLocaleString('es-CR')}</p>
                                </React.Fragment>
                            )}
                            {payslipData.posWeeklyOvertime2xHours > 0 && (
                                <React.Fragment>
                                    <p>Horas Superiores a 60 POS ({payslipData.posWeeklyOvertime2xHours.toFixed(2)}h × 2.0×):</p>
                                    <p className="text-right font-medium">₡{payslipData.posWeeklyOvertime2xPay.toLocaleString('es-CR')}</p>
                                </React.Fragment>
                            )}
                            {payslipData.cediWeeklyOvertime2xHours > 0 && (
                                <React.Fragment>
                                    <p>Horas Superiores a 60 CEDI ({payslipData.cediWeeklyOvertime2xHours.toFixed(2)}h × 2.0×):</p>
                                    <p className="text-right font-medium">₡{payslipData.cediWeeklyOvertime2xPay.toLocaleString('es-CR')}</p>
                                </React.Fragment>
                            )}
                            {payslipData.holidayHoursWorked2x > 0 && (
                                <React.Fragment>
                                    <p>Feriado Trabajado Primeras 8h ({payslipData.holidayHoursWorked2x.toFixed(2)}h × 2.0×):</p>
                                    <p className="text-right font-medium">₡{payslipData.holidayWorkedPay2x.toLocaleString('es-CR')}</p>
                                </React.Fragment>
                            )}
                            {payslipData.holidayHoursWorked3x > 0 && (
                                <React.Fragment>
                                    <p>Feriado Trabajado Excedente ({payslipData.holidayHoursWorked3x.toFixed(2)}h × 3.0×):</p>
                                    <p className="text-right font-medium">₡{payslipData.holidayWorkedPay3x.toLocaleString('es-CR')}</p>
                                </React.Fragment>
                            )}
                            {payslipData.holidayHoursNotWorked > 0 && (
                                <React.Fragment>
                                    <p>Feriado No Trabajado Reconocido ({payslipData.holidayHoursNotWorked.toFixed(2)}h × 1.0×):</p>
                                    <p className="text-right font-medium">₡{payslipData.holidayNotWorkedPay.toLocaleString('es-CR')}</p>
                                </React.Fragment>
                            )}
                            {payslipData.vacationDays > 0 && (
                                <React.Fragment>
                                    <p>Vacaciones ({payslipData.vacationDays} días):</p>
                                    <p className="text-right font-medium">₡{payslipData.vacationPay.toLocaleString('es-CR')}</p>
                                </React.Fragment>
                            )}

                            {/* Subtotales requeridos en regla 11 */}
                            <div className="col-span-2 border-t border-dashed my-2 pt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                                <span>Subtotal Salario Ordinario:</span>
                                <span className="text-right">₡{payslipData.regularPay.toLocaleString('es-CR')}</span>
                                {payslipData.cediRegularPay > 0 && (
                                    <React.Fragment>
                                        <span>Subtotal Salario CEDI:</span>
                                        <span className="text-right">₡{payslipData.cediRegularPay.toLocaleString('es-CR')}</span>
                                    </React.Fragment>
                                )}
                                {(payslipData.dailyOvertimePay + payslipData.weeklyOvertimePay) > 0 && (
                                    <React.Fragment>
                                        <span>Subtotal Horas Extra:</span>
                                        <span className="text-right">₡{(payslipData.dailyOvertimePay + payslipData.weeklyOvertimePay).toLocaleString('es-CR')}</span>
                                    </React.Fragment>
                                )}
                                {payslipData.totalHolidayPay > 0 && (
                                    <React.Fragment>
                                        <span>Subtotal Feriados:</span>
                                        <span className="text-right">₡{payslipData.totalHolidayPay.toLocaleString('es-CR')}</span>
                                    </React.Fragment>
                                )}
                            </div>

                            <div className="total-row border-t mt-2 pt-3 flex justify-between col-span-2 text-base font-bold">
                                <span>SALARIO BRUTO:</span>
                                <span>₡{payslipData.grossSalary.toLocaleString('es-CR')}</span>
                            </div>
                        </div>
                        
                        <div className="section-title">DEDUCCIONES Y CARGAS</div>
                        <div className="grid grid-cols-2 gap-2">
                            <p>CCSS (Caja):</p><p className="text-right text-destructive">-₡{payslipData.cajaDeduction.toLocaleString('es-CR')}</p>
                            {payslipData.breakExcessDeduction && payslipData.breakExcessDeduction > 0 ? (
                                <React.Fragment>
                                    <p className="text-amber-800 dark:text-amber-400 font-medium">Exceso Descansos ({payslipData.breakExcessMinutes || 0} min):</p>
                                    <p className="text-right text-destructive">-₡{payslipData.breakExcessDeduction.toLocaleString('es-CR')}</p>
                                </React.Fragment>
                            ) : null}
                            {payslipData.loanDeduction > 0 && <React.Fragment><p>Cuota Préstamo:</p><p className="text-right text-destructive">-₡{payslipData.loanDeduction.toLocaleString('es-CR')}</p></React.Fragment>}
                            {payslipData.savingsDeduction > 0 && <React.Fragment><p>Aporte Ahorro:</p><p className="text-right text-destructive">-₡{payslipData.savingsDeduction.toLocaleString('es-CR')}</p></React.Fragment>}
                            
                            <div className="total-row text-primary mt-4 pt-4 border-t-2 border-primary flex justify-between col-span-2">
                                <span>NETO A PAGAR:</span>
                                <span>₡{payslipData.netSalary.toLocaleString('es-CR')}</span>
                            </div>
                        </div>

                        <div className="border-t mt-20 flex justify-between no-screen hidden">
                            <div style={{ borderTop: '1px solid #000', width: '200px', textAlign: 'center', marginTop: '40px' }}>
                                <p style={{ fontSize: '10px' }}>Firma del Empleado</p>
                            </div>
                            <div style={{ borderTop: '1px solid #000', width: '200px', textAlign: 'center', marginTop: '40px' }}>
                                <p style={{ fontSize: '10px' }}>Sello de la Empresa</p>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="justify-end gap-2 no-print border-t pt-4">
                        <Button onClick={sendWhatsApp} variant="outline" className="bg-green-50 text-green-700 border-green-200"><MessageCircle className="h-4 w-4 mr-2" /> WhatsApp</Button>
                        <Button onClick={handleSaveToHistory} disabled={isSaving}>{isSaving ? <Loader2 className="animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Guardar</Button>
                        <Button onClick={() => handlePrint('payslip-print-area')} variant="outline"><Printer className="mr-2 h-4 w-4" /> Imprimir</Button>
                    </CardFooter>
                </Card>
            )}
        </TabsContent>

        <TabsContent value="aguinaldo">
            <Card className="no-print">
                <CardHeader>
                    <CardTitle>Generador de Comprobante de Aguinaldo</CardTitle>
                    <CardDescription>Cálculo oficial del doceavo de ley (Diciembre {Number(selectedAguinaldoYear) - 1} a Noviembre {selectedAguinaldoYear}).</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row gap-4">
                    <Select onValueChange={setSelectedEmployeeId} value={selectedEmployeeId || undefined}>
                        <SelectTrigger className="w-full sm:w-[300px]"><SelectValue placeholder="Seleccionar Colaborador" /></SelectTrigger>
                        <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button onClick={calculateAguinaldo} disabled={!selectedEmployeeId}>Generar Comprobante de Aguinaldo</Button>
                </CardContent>
            </Card>

            {aguinaldoData && selectedEmployee && (
                 <Card id="aguinaldo-print-area" className="mt-6 border-primary/20 bg-white shadow-sm">
                    <CardContent className="p-6 md:p-8 space-y-6">
                        {/* Encabezado Formal del Comprobante y Datos del Empleado */}
                        <div className="header flex flex-col sm:flex-row justify-between items-start border-b-2 border-foreground/80 pb-4 gap-4">
                            <div>
                                {logoUrl && <img src={logoUrl} alt="Logo" className="logo max-h-16 object-contain mb-2" />}
                                <h2 className="title text-xl font-black uppercase tracking-tight">Comprobante de Pago de Aguinaldo {selectedAguinaldoYear}</h2>
                                <p className="text-xs text-muted-foreground font-medium">
                                    Período Legal: 01 de Diciembre {Number(selectedAguinaldoYear) - 1} al 30 de Noviembre {selectedAguinaldoYear}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Fecha de Emisión: {format(new Date(), 'dd/MM/yyyy', { locale: es })}
                                </p>
                            </div>
                            <div className="text-left sm:text-right bg-muted/30 p-3 rounded-lg border text-sm min-w-[240px]">
                                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Datos del Colaborador</p>
                                <p className="font-bold text-base uppercase mt-0.5">{selectedEmployee.name}</p>
                                <p className="text-xs font-mono text-muted-foreground">Cédula: <span className="font-semibold text-foreground">{selectedEmployee.cedula}</span></p>
                                {selectedEmployee.phone && (
                                    <p className="text-xs font-mono text-muted-foreground">Teléfono: {selectedEmployee.phone}</p>
                                )}
                            </div>
                        </div>

                        {/* Tabla de Desglose de Salarios por Mes */}
                        <div>
                            <div className="section-title font-bold text-xs uppercase tracking-wider text-muted-foreground border-b pb-1 mb-2">
                                Desglose de Salarios Brutos Devengados por Mes
                            </div>
                            <Table className="border">
                              <TableHeader>
                                <TableRow className="bg-muted/50">
                                  <TableHead className="font-bold text-foreground uppercase text-xs">Mes / Año</TableHead>
                                  <TableHead className="text-center font-bold text-foreground uppercase text-xs">Estado / Origen</TableHead>
                                  <TableHead className="text-right font-bold text-foreground uppercase text-xs">Salario Bruto Mensual</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {aguinaldoData.monthlyBreakdown.map((m, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="capitalize font-medium py-2">{m.month} {m.year}</TableCell>
                                    <TableCell className="text-center py-2">
                                        {m.isFromHistory ? (
                                            <Badge variant="outline">Historial</Badge>
                                        ) : m.isManual ? (
                                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-200">En Firme</Badge>
                                        ) : (
                                            <Badge variant="ghost">Estimado</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-semibold py-2">
                                        ₡{m.grossSalary.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="bg-muted/60 font-bold border-t-2 border-foreground/30">
                                    <TableCell colSpan={2} className="uppercase text-xs py-3">
                                        Suma Total de Salarios Brutos (Diciembre {Number(selectedAguinaldoYear) - 1} – Noviembre {selectedAguinaldoYear})
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-sm py-3">
                                        ₡{aguinaldoData.totalGrossSalaries.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                        </div>

                        {/* Resumen de Liquidación y Monto a Cancelar */}
                        <div className="summary-box p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border-2 border-emerald-600/40 rounded-lg space-y-2">
                            <div className="flex justify-between items-center text-xs text-muted-foreground">
                                <span>Suma Total de Salarios Brutos (12 meses):</span>
                                <span className="font-mono font-semibold text-foreground">
                                    ₡{aguinaldoData.totalGrossSalaries.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-xs text-muted-foreground">
                                <span>Cálculo Legal de Aguinaldo (Suma Total ÷ 12):</span>
                                <span className="font-mono">
                                    ₡{aguinaldoData.totalGrossSalaries.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ÷ 12
                                </span>
                            </div>
                            <div className="border-t-2 border-emerald-600/40 pt-3 mt-2 flex justify-between items-center">
                                <span className="text-base sm:text-lg font-black uppercase text-emerald-900 dark:text-emerald-300">
                                    Monto Total de Aguinaldo a Cancelar:
                                </span>
                                <span className="text-xl sm:text-2xl font-black font-mono text-emerald-700 dark:text-emerald-400">
                                    ₡{aguinaldoData.aguinaldoAmount.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>

                        {/* Firmas de Recibido Conforme */}
                        <div className="sig-container pt-14 pb-2 flex flex-col sm:flex-row justify-between items-center sm:items-end gap-10 px-4">
                            <div className="sig-line border-t border-black w-64 pt-2 text-center">
                                <p className="text-xs font-bold uppercase">Firma del Colaborador</p>
                                <p className="text-[10px] text-muted-foreground">Recibido Conforme · Céd. {selectedEmployee.cedula}</p>
                            </div>
                            <div className="sig-line border-t border-black w-64 pt-2 text-center">
                                <p className="text-xs font-bold uppercase">Sello / Firma Autorizada</p>
                                <p className="text-[10px] text-muted-foreground">Pollo Frito Sabor Cervanteño</p>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="justify-end gap-2 no-print border-t pt-4">
                        <Button onClick={sendWhatsAppAguinaldo} variant="outline" className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100">
                            <MessageCircle className="h-4 w-4 mr-2" /> Enviar por WhatsApp
                        </Button>
                        <Button onClick={() => handlePrint('aguinaldo-print-area')} variant="default">
                            <Printer className="mr-2 h-4 w-4" /> Imprimir Comprobante
                        </Button>
                    </CardFooter>
                 </Card>
            )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
