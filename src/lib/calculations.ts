'use client';

import { 
  isSameDay, 
  startOfDay, 
  endOfDay, 
  isWithinInterval,
  startOfWeek,
  addDays,
  eachWeekOfInterval,
  getDay,
  endOfWeek,
  differenceInCalendarWeeks,
  endOfMonth
} from 'date-fns';
import { es } from 'date-fns/locale';
import type { ShiftWithId, HolidayWithId, EmployeeWithId, LocationWithId, ScheduleWithId } from '@/lib/data';

export type CalculationResult = {
  // 1. Horas Ordinarias (1.0x)
  regularHours: number;
  posRegularHours: number;
  cediRegularHours: number;

  // 2. Horas Extra Diarias (1.5x)
  dailyOvertimeHours: number;
  posDailyOvertimeHours: number;
  cediDailyOvertimeHours: number;

  // 3. Horas Extra Semanales (1.5x entre 42 y 60)
  weeklyOvertimeHours1x5: number;
  posWeeklyOvertime1x5Hours: number;
  cediWeeklyOvertime1x5Hours: number;

  // 4. Horas Extra Semanales (>60 a 2.0x)
  weeklyOvertimeHours2x: number;
  posWeeklyOvertime2xHours: number;
  cediWeeklyOvertime2xHours: number;

  // 5. Feriados
  holidayHoursWorked2x: number;
  holidayHoursWorked3x: number;
  holidayHoursWorked: number;
  holidayHoursNotWorked: number;

  // Totales de Horas
  totalHoursToPay: number;
  totalHoursWorkedPhysically: number;

  // Desglose Financiero
  posRegularPay: number;
  cediRegularPay: number;
  regularPay: number;

  posDailyOvertimePay: number;
  cediDailyOvertimePay: number;
  dailyOvertimePay: number;

  posWeeklyOvertime1x5Pay: number;
  cediWeeklyOvertime1x5Pay: number;
  posWeeklyOvertime2xPay: number;
  cediWeeklyOvertime2xPay: number;
  weeklyOvertimePay: number;

  holidayWorkedPay2x: number;
  holidayWorkedPay3x: number;
  holidayPay: number;
  holidayNotWorkedPay: number;
  totalHolidayPay: number;

  totalOvertimePay: number;
  grossSalary: number;
};

interface ShiftSlice {
  start: Date;
  end: Date;
  isCedi: boolean;
  day: Date;
}

/**
 * Convierte de forma segura cualquier valor (Timestamp Firestore, string o Date) a Date.
 */
const safeToDate = (val: any): Date | null => {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val.toDate === 'function') {
    try {
      const d = val.toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Divide turnos que cruzan la medianoche en segmentos diarios contenidos dentro de un solo día calendario.
 */
function splitShiftAtMidnight(start: Date, end: Date, isCedi: boolean): ShiftSlice[] {
  const slices: ShiftSlice[] = [];
  let cur = new Date(start.getTime());

  while (cur < end) {
    const nextDayStart = startOfDay(addDays(cur, 1));
    const segEnd = end <= nextDayStart ? new Date(end.getTime()) : new Date(nextDayStart.getTime());
    
    if (segEnd.getTime() > cur.getTime()) {
      slices.push({
        start: new Date(cur.getTime()),
        end: new Date(segEnd.getTime()),
        isCedi,
        day: startOfDay(cur)
      });
    }

    cur = new Date(nextDayStart.getTime());
  }

  return slices;
}

/**
 * Resuelve marcas duplicadas y solapadas en un mismo día:
 * Construye intervalos contiguos disjuntos sin duplicar minutos físicos.
 * Si en un intervalo coincide presencia en CEDI, se reconoce como CEDI.
 */
function resolveDaySlices(slices: ShiftSlice[]): { start: Date; end: Date; isCedi: boolean }[] {
  if (slices.length === 0) return [];
  if (slices.length === 1) return [{ start: slices[0].start, end: slices[0].end, isCedi: slices[0].isCedi }];

  const timeSet = new Set<number>();
  for (const s of slices) {
    timeSet.add(s.start.getTime());
    timeSet.add(s.end.getTime());
  }
  const times = Array.from(timeSet).sort((a, b) => a - b);

  const disjoint: { start: Date; end: Date; isCedi: boolean }[] = [];
  for (let i = 0; i < times.length - 1; i++) {
    const tStart = times[i];
    const tEnd = times[i + 1];
    if (tEnd <= tStart) continue;

    // Filtra las marcas activas en este intervalo
    const active = slices.filter(s => s.start.getTime() <= tStart && s.end.getTime() >= tEnd);
    if (active.length > 0) {
      const isCedi = active.some(s => s.isCedi);
      disjoint.push({
        start: new Date(tStart),
        end: new Date(tEnd),
        isCedi
      });
    }
  }

  // Fusiona tramos consecutivos adyacentes con la misma ubicación
  const merged: { start: Date; end: Date; isCedi: boolean }[] = [];
  for (const item of disjoint) {
    if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      if (prev.end.getTime() === item.start.getTime() && prev.isCedi === item.isCedi) {
        prev.end = item.end;
        continue;
      }
    }
    merged.push({ ...item });
  }

  return merged;
}

/**
 * Motor Principal de Cálculo de Nómina conforme a las REGLAS DEFINITIVAS.
 */
export const calculateLaborPeriod = (
  employee: EmployeeWithId,
  startDate: Date,
  endDate: Date,
  allShifts: ShiftWithId[],
  holidays: HolidayWithId[],
  locations: LocationWithId[],
  allSchedules?: ScheduleWithId[],
  firstDayOfWeek1?: Date
): CalculationResult => {
  const posRate = employee.hourlyRate || 0;
  const cediRate = employee.hourlyRateCedi && employee.hourlyRateCedi > 0 ? employee.hourlyRateCedi : posRate;

  const intervalStart = startOfDay(startDate);
  const intervalEnd = endOfDay(endDate);

  // 1. Filtrar turnos del empleado con clockIn y clockOut válidos
  const validEmployeeShifts = allShifts.filter(s => {
    if (s.employeeId !== employee.id) return false;
    const inDate = safeToDate(s.clockIn);
    const outDate = safeToDate(s.clockOut);
    if (!inDate || !outDate) return false; // Ignora entradas sin salida
    if (outDate.getTime() <= inDate.getTime()) return false; // Ignora duraciones no positivas
    // Debe solaparse con el período solicitado
    return inDate <= intervalEnd && outDate >= intervalStart;
  });

  // Preparar helper de feriados
  const holidayDates = holidays
    .map(h => safeToDate(h.date))
    .filter((d): d is Date => d !== null);
  const isHoliday = (d: Date) => holidayDates.some(h => isSameDay(d, h));

  // 2. Dividir marcas por medianoche y acotar al intervalo del cálculo
  const rawSlices: ShiftSlice[] = [];
  for (const s of validEmployeeShifts) {
    const rawIn = safeToDate(s.clockIn)!;
    const rawOut = safeToDate(s.clockOut)!;

    // Recortar estrictamente al rango [intervalStart, intervalEnd]
    const clampedIn = rawIn < intervalStart ? intervalStart : rawIn;
    const clampedOut = rawOut > intervalEnd ? intervalEnd : rawOut;
    if (clampedOut.getTime() <= clampedIn.getTime()) continue;

    // Determinar si la ubicación es CEDI
    const loc = locations.find(l => l.id === s.locationId) || 
                locations.find(l => l.name?.trim().toLowerCase() === s.locationId?.trim().toLowerCase());
    const isCedi = loc?.type === 'CEDI' || loc?.name?.toLowerCase().includes('cedi') || false;

    const dailySlices = splitShiftAtMidnight(clampedIn, clampedOut, isCedi);
    rawSlices.push(...dailySlices);
  }

  // Agrupar slices por día calendario (formato YYYY-MM-DD)
  const slicesByDay: { [dayKey: string]: { day: Date; slices: ShiftSlice[] } } = {};
  for (const slice of rawSlices) {
    const dayKey = slice.day.toISOString().slice(0, 10);
    if (!slicesByDay[dayKey]) {
      slicesByDay[dayKey] = { day: slice.day, slices: [] };
    }
    slicesByDay[dayKey].slices.push(slice);
  }

  // Estructuras de resultados acumulados
  let totalPhysicalMinutes = 0;

  // Feriados trabajados
  let holidayHoursWorked2x = 0;
  let holidayHoursWorked3x = 0;
  let holidayWorkedPay2x = 0;
  let holidayWorkedPay3x = 0;

  // Horas extra diarias (1.5x)
  let posDailyOvertimeHours = 0;
  let cediDailyOvertimeHours = 0;
  let posDailyOvertimePay = 0;
  let cediDailyOvertimePay = 0;

  // Tramos ordinarios agrupados por semana (Lunes a Domingo)
  // Cada semana contiene una lista ordenada de tramos ordinarios { hours, isCedi }
  const ordinarySlicesByWeek: { [weekKey: string]: { hours: number; isCedi: boolean }[] } = {};

  // Ordenar días cronológicamente
  const sortedDayKeys = Object.keys(slicesByDay).sort();

  for (const dayKey of sortedDayKeys) {
    const { day, slices } = slicesByDay[dayKey];
    // Resolver solapamientos y duplicados en el día
    const dayDisjointIntervals = resolveDaySlices(slices);

    // Sumar minutos físicos reales
    for (const interval of dayDisjointIntervals) {
      const mins = (interval.end.getTime() - interval.start.getTime()) / (1000 * 60);
      totalPhysicalMinutes += mins;
    }

    const dayIsHoliday = isHoliday(day);

    if (dayIsHoliday) {
      // REGLA 6: FERIADOS TRABAJADOS
      // Se procesan independientemente de la clasificación ordinaria semanal.
      // Primeras 8 horas: 2.0x tarifa correspondiente (POS o CEDI).
      // Excedente de 8 horas: 3.0x tarifa correspondiente.
      // NO entran en la acumulación semanal ordinaria.
      let dayHolidayAccumulatedHours = 0;

      for (const interval of dayDisjointIntervals) {
        const intervalHours = (interval.end.getTime() - interval.start.getTime()) / (1000 * 60 * 60);
        const rate = interval.isCedi ? cediRate : posRate;

        const startH = dayHolidayAccumulatedHours;
        const endH = dayHolidayAccumulatedHours + intervalHours;
        dayHolidayAccumulatedHours = endH;

        // Tramo dentro de las primeras 8 horas (2.0x)
        const hIn2x = Math.max(0, Math.min(endH, 8) - Math.max(startH, 0));
        if (hIn2x > 0) {
          holidayHoursWorked2x += hIn2x;
          holidayWorkedPay2x += hIn2x * rate * 2.0;
        }

        // Tramo que excede las 8 horas (3.0x)
        const hIn3x = Math.max(0, endH - Math.max(startH, 8));
        if (hIn3x > 0) {
          holidayHoursWorked3x += hIn3x;
          holidayWorkedPay3x += hIn3x * rate * 3.0;
        }
      }
    } else {
      // DÍA REGULAR NO FERIADO:
      // REGLAS 1 Y 2: Primeras 8 horas físicas = ordinarias. Excedente = extra diaria 1.5x.
      const monday = startOfWeek(day, { weekStartsOn: 1 });
      const weekKey = monday.toISOString().slice(0, 10);
      if (!ordinarySlicesByWeek[weekKey]) {
        ordinarySlicesByWeek[weekKey] = [];
      }

      let dayAccumulatedHours = 0;

      for (const interval of dayDisjointIntervals) {
        const intervalHours = (interval.end.getTime() - interval.start.getTime()) / (1000 * 60 * 60);
        const rate = interval.isCedi ? cediRate : posRate;

        const startH = dayAccumulatedHours;
        const endH = dayAccumulatedHours + intervalHours;
        dayAccumulatedHours = endH;

        // Horas ordinarias del día (dentro de las primeras 8 horas)
        const ordHours = Math.max(0, Math.min(endH, 8) - Math.max(startH, 0));
        if (ordHours > 0) {
          ordinarySlicesByWeek[weekKey].push({
            hours: ordHours,
            isCedi: interval.isCedi
          });
        }

        // Horas extra diarias (excedente sobre 8 horas diarias a 1.5x)
        const dailyOtHours = Math.max(0, endH - Math.max(startH, 8));
        if (dailyOtHours > 0) {
          if (interval.isCedi) {
            cediDailyOvertimeHours += dailyOtHours;
            cediDailyOvertimePay += dailyOtHours * rate * 1.5;
          } else {
            posDailyOvertimeHours += dailyOtHours;
            posDailyOvertimePay += dailyOtHours * rate * 1.5;
          }
        }
      }
    }
  }

  // REGLAS 3, 4 Y 5: HORAS EXTRA SEMANALES (LUNES A DOMINGO)
  // Se procesan ÚNICAMENTE sobre las horas que permanecen clasificadas como ordinarias.
  // Regla contra doble pago: Las horas extra diarias NO entran a esta acumulación.
  let posRegularHours = 0;
  let cediRegularHours = 0;
  let posRegularPay = 0;
  let cediRegularPay = 0;

  let posWeeklyOvertime1x5Hours = 0;
  let cediWeeklyOvertime1x5Hours = 0;
  let posWeeklyOvertime1x5Pay = 0;
  let cediWeeklyOvertime1x5Pay = 0;

  let posWeeklyOvertime2xHours = 0;
  let cediWeeklyOvertime2xHours = 0;
  let posWeeklyOvertime2xPay = 0;
  let cediWeeklyOvertime2xPay = 0;

  for (const weekKey of Object.keys(ordinarySlicesByWeek)) {
    const slices = ordinarySlicesByWeek[weekKey];
    let accumulatedWeekOrdinaryHours = 0;

    for (const slice of slices) {
      const rate = slice.isCedi ? cediRate : posRate;
      const startH = accumulatedWeekOrdinaryHours;
      const endH = accumulatedWeekOrdinaryHours + slice.hours;
      accumulatedWeekOrdinaryHours = endH;

      // Zona 1: Horas 0 a 42 = Pago Ordinario 1.0x
      const hInZone1 = Math.max(0, Math.min(endH, 42) - Math.max(startH, 0));
      if (hInZone1 > 0) {
        if (slice.isCedi) {
          cediRegularHours += hInZone1;
          cediRegularPay += hInZone1 * rate * 1.0;
        } else {
          posRegularHours += hInZone1;
          posRegularPay += hInZone1 * rate * 1.0;
        }
      }

      // Zona 2: Horas 42 a 60 = Excedente semanal a 1.5x
      const hInZone2 = Math.max(0, Math.min(endH, 60) - Math.max(startH, 42));
      if (hInZone2 > 0) {
        if (slice.isCedi) {
          cediWeeklyOvertime1x5Hours += hInZone2;
          cediWeeklyOvertime1x5Pay += hInZone2 * rate * 1.5;
        } else {
          posWeeklyOvertime1x5Hours += hInZone2;
          posWeeklyOvertime1x5Pay += hInZone2 * rate * 1.5;
        }
      }

      // Zona 3: Horas superiores a 60 = Excedente a 2.0x
      const hInZone3 = Math.max(0, endH - Math.max(startH, 60));
      if (hInZone3 > 0) {
        if (slice.isCedi) {
          cediWeeklyOvertime2xHours += hInZone3;
          cediWeeklyOvertime2xPay += hInZone3 * rate * 2.0;
        } else {
          posWeeklyOvertime2xHours += hInZone3;
          posWeeklyOvertime2xPay += hInZone3 * rate * 2.0;
        }
      }
    }
  }

  // REGLA 7: FERIADOS NO TRABAJADOS
  // Si en el rango hay un día feriado entre lunes y sábado donde el empleado no trabajó marcas,
  // se reconocen 8 horas a tarifa ordinaria (POS) x 1.0.
  // No genera extra diaria ni semanal.
  let holidayHoursNotWorked = 0;
  let holidayNotWorkedPay = 0;

  // Recorrer todos los días del intervalo de cálculo
  let curDay = startOfDay(startDate);
  const endDayLimit = endOfDay(endDate);

  while (curDay <= endDayLimit) {
    if (isHoliday(curDay) && getDay(curDay) !== 0) {
      const hasWorkedShift = validEmployeeShifts.some(s => {
        const inD = safeToDate(s.clockIn);
        return inD && isSameDay(inD, curDay);
      });

      if (!hasWorkedShift) {
        holidayHoursNotWorked += 8;
        holidayNotWorkedPay += 8 * posRate * 1.0;
      }
    }
    curDay = addDays(curDay, 1);
  }

  // Totales y agregados
  const regularHours = posRegularHours + cediRegularHours;
  const dailyOvertimeHours = posDailyOvertimeHours + cediDailyOvertimeHours;
  const weeklyOvertimeHours1x5 = posWeeklyOvertime1x5Hours + cediWeeklyOvertime1x5Hours;
  const weeklyOvertimeHours2x = posWeeklyOvertime2xHours + cediWeeklyOvertime2xHours;
  const holidayHoursWorked = holidayHoursWorked2x + holidayHoursWorked3x;

  const regularPay = posRegularPay + cediRegularPay;
  const dailyOvertimePay = posDailyOvertimePay + cediDailyOvertimePay;
  const weeklyOvertimePay = posWeeklyOvertime1x5Pay + cediWeeklyOvertime1x5Pay + posWeeklyOvertime2xPay + cediWeeklyOvertime2xPay;
  const holidayPay = holidayWorkedPay2x + holidayWorkedPay3x;
  const totalHolidayPay = holidayPay + holidayNotWorkedPay;
  const totalOvertimePay = dailyOvertimePay + weeklyOvertimePay;

  const grossSalary = regularPay + dailyOvertimePay + weeklyOvertimePay + totalHolidayPay;

  const totalHoursToPay = regularHours + dailyOvertimeHours + weeklyOvertimeHours1x5 + weeklyOvertimeHours2x + holidayHoursWorked + holidayHoursNotWorked;
  const totalHoursWorkedPhysically = totalPhysicalMinutes / 60;

  return {
    regularHours,
    posRegularHours,
    cediRegularHours,

    dailyOvertimeHours,
    posDailyOvertimeHours,
    cediDailyOvertimeHours,

    weeklyOvertimeHours1x5,
    posWeeklyOvertime1x5Hours,
    cediWeeklyOvertime1x5Hours,

    weeklyOvertimeHours2x,
    posWeeklyOvertime2xHours,
    cediWeeklyOvertime2xHours,

    holidayHoursWorked2x,
    holidayHoursWorked3x,
    holidayHoursWorked,
    holidayHoursNotWorked,

    totalHoursToPay,
    totalHoursWorkedPhysically,

    posRegularPay,
    cediRegularPay,
    regularPay,

    posDailyOvertimePay,
    cediDailyOvertimePay,
    dailyOvertimePay,

    posWeeklyOvertime1x5Pay,
    cediWeeklyOvertime1x5Pay,
    posWeeklyOvertime2xPay,
    cediWeeklyOvertime2xPay,
    weeklyOvertimePay,

    holidayWorkedPay2x,
    holidayWorkedPay3x,
    holidayPay,
    holidayNotWorkedPay,
    totalHolidayPay,

    totalOvertimePay,
    grossSalary
  };
};

export const getWeeksBelongingToMonth = (year: number, month: number) => {
  const monthStart = new Date(year, month, 1);
  const monthEnd = endOfMonth(new Date(year, month + 1, 0));
  const scanStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const scanEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const weeksInScan = eachWeekOfInterval({ start: scanStart, end: scanEnd }, { weekStartsOn: 1 });
  return weeksInScan.map(monday => {
    const sunday = endOfDay(addDays(monday, 6));
    const thursday = addDays(monday, 3);
    const belongsToMonth = thursday.getMonth() === month && thursday.getFullYear() === year;
    return { start: monday, end: sunday, belongsToMonth };
  }).filter(w => w.belongsToMonth);
};
