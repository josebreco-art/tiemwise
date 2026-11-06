'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useAppData } from '@/context/app-data-provider';
import { useToast } from '@/hooks/use-toast';
import {
  type ScheduleWithId,
  type EmployeeWithId,
  type BreakSlot,
} from '@/lib/data';
import {
  parse,
  differenceInMinutes,
  addMinutes,
  setHours,
  setMinutes,
  setSeconds,
  getDay,
  format,
} from 'date-fns';
import { es } from 'date-fns/locale';

const daysOfWeek = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

type ScheduleWithRelations = ScheduleWithId & { employee?: EmployeeWithId };

export function BreakNotifier() {
  const { employees, schedule, currentWeekType } = useAppData();
  const { toast } = useToast();
  const notifiedBreakIdsRef = useRef<Set<string>>(new Set());

  const fullSchedule = useMemo((): ScheduleWithRelations[] => {
    if (!schedule || !employees) return [];
    return schedule
      .map(s => ({ ...s, employee: employees.find(e => e.id === s.employeeId) }))
      .filter(s => s.employee);
  }, [schedule, employees]);

  useEffect(() => {
    const checkBreaks = () => {
      const now = new Date();
      const currentDayName = daysOfWeek[getDay(now)];
      const isWeekend = currentDayName === 'Sábado' || currentDayName === 'Domingo';
      const breakStartTimeLimit = setSeconds(setMinutes(setHours(new Date(), isWeekend ? 13 : 14), 0), 0);

      const employeesWorkingToday = fullSchedule.filter(
        s => s.dayOfWeek === currentDayName && s.weekType === currentWeekType
      );
      
      const uniqueEmployeeIds = [...new Set(employeesWorkingToday.map(s => s.employeeId))];
      const dailyBreaks: BreakSlot[] = [];

      uniqueEmployeeIds.forEach(id => {
        const empShifts = employeesWorkingToday.filter(s => s.employeeId === id);
        const employee = employees.find(e => e.id === id);
        if (!employee) return;

        let totalMins = 0;
        let start = new Date(8640000000000000);
        let end = new Date(-8640000000000000);

        empShifts.forEach(s => {
          try {
            const sStart = parse(s.startTime, 'HH:mm', new Date());
            const sEnd = parse(s.endTime, 'HH:mm', new Date());
            if (sStart < start) start = sStart;
            if (sEnd > end) end = sEnd;
            let diff = differenceInMinutes(sEnd, sStart);
            if (diff < 0) diff += 24 * 60;
            totalMins += diff;
          } catch (e) {}
        });

        const duration = totalMins >= 12 * 60 ? 60 : (totalMins >= 4 * 60 ? 30 : 0);
        if (duration === 0) return;

        const winStart = addMinutes(start, 60);
        const winEnd = addMinutes(end, -120);
        let currentSlot = winStart > breakStartTimeLimit ? winStart : breakStartTimeLimit;

        while(addMinutes(currentSlot, duration) <= winEnd) {
          const slotEnd = addMinutes(currentSlot, duration);
          const overlap = dailyBreaks.some(b => (currentSlot < b.endTime && slotEnd > b.startTime));
          if (!overlap) {
            dailyBreaks.push({ startTime: currentSlot, endTime: slotEnd, employees: [employee] });
            break;
          }
          currentSlot = addMinutes(currentSlot, 15);
        }
      });
      
      dailyBreaks.forEach(breakSlot => {
        const minsUntil = differenceInMinutes(breakSlot.startTime, now);
        const breakId = `${currentDayName}-${breakSlot.startTime.getTime()}-${breakSlot.employees[0].id}`;

        if (minsUntil > 0 && minsUntil <= 5 && !notifiedBreakIdsRef.current.has(breakId)) {
          new Audio('https://cdn.pixabay.com/download/audio/2022/03/15/audio_22e83a4263.mp3').play().catch(() => {});
          toast({
            title: `Descanso Próximo (${format(breakSlot.startTime, 'p', { locale: es })})`,
            description: `${breakSlot.employees[0].name} debe tomar su descanso pronto.`,
            duration: 10000,
          });
          notifiedBreakIdsRef.current.add(breakId);
        }
      });
    };

    const interval = setInterval(checkBreaks, 60000);
    checkBreaks();
    return () => clearInterval(interval);
  }, [fullSchedule, currentWeekType, employees, toast]);

  return null;
}
