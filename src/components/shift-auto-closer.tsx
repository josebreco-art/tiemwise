
'use client';

import { useEffect, useRef } from 'react';
import { useAppData } from '@/context/app-data-provider';
import { useToast } from '@/hooks/use-toast';
import { isBefore, startOfDay, getDay, differenceInCalendarWeeks, startOfWeek, format, setHours, setMinutes, isAfter } from 'date-fns';

const daysOfWeek = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function ShiftAutoCloser() {
  const { shifts, schedule, updateShift, firstDayOfWeek1 } = useAppData();
  const { toast } = useToast();
  const processedShiftsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!shifts || shifts.length === 0) return;

    // Solo procesar turnos sin salida de DÍAS ANTERIORES que no hayan sido procesados en esta carga
    const forgottenShifts = shifts.filter(s => 
        !s.clockOut &&
        isBefore(s.clockIn, startOfDay(new Date())) &&
        !processedShiftsRef.current.has(s.id)
    );

    if (forgottenShifts.length > 0) {
      forgottenShifts.forEach(shift => {
        processedShiftsRef.current.add(shift.id);

        const clockInDate = shift.clockIn;
        const dayOfWeek = daysOfWeek[getDay(clockInDate)];

        let shiftWeekType: 'Semana 1' | 'Semana 2' = 'Semana 1';
        if (firstDayOfWeek1) {
            const startOfCycle = startOfWeek(firstDayOfWeek1, { weekStartsOn: 1 });
            const weekDiff = differenceInCalendarWeeks(clockInDate, startOfCycle, { weekStartsOn: 1 });
            shiftWeekType = weekDiff % 2 === 0 ? 'Semana 1' : 'Semana 2';
        }

        const employeeSchedulesForDay = schedule.filter(s => 
          s.employeeId === shift.employeeId && 
          s.dayOfWeek === dayOfWeek && 
          s.weekType === shiftWeekType
        ).sort((a,b) => b.endTime.localeCompare(a.endTime));

        const lastScheduleForDay = employeeSchedulesForDay[0];
        let clockOutDate: Date | null = null;
        let method = "";

        if (lastScheduleForDay) {
          const [h, m] = lastScheduleForDay.endTime.split(':').map(Number);
          const scheduledEndTime = setMinutes(setHours(new Date(clockInDate), h), m);
          
          if (isAfter(scheduledEndTime, clockInDate)) {
            clockOutDate = scheduledEndTime;
            method = `a las ${lastScheduleForDay.endTime} según horario`;
          }
        }

        // Fallback: Si no hay horario o el horario es inválido, cerrar a las 21:00
        if (!clockOutDate) {
            const autoEndTime = setMinutes(setHours(new Date(clockInDate), 21), 0);
            if (isAfter(autoEndTime, clockInDate)) {
                clockOutDate = autoEndTime;
                method = "a las 21:00 (Cierre Automático)";
            }
        }

        if (clockOutDate) {
          updateShift(shift.id, { clockOut: clockOutDate });
          toast({
            title: 'Turno Cerrado Automáticamente',
            description: `Se cerró un turno del ${format(clockInDate, 'dd/MM')} ${method}.`,
          });
        }
      });
    }
  }, [shifts, schedule, updateShift, firstDayOfWeek1, toast]);

  return null;
}
