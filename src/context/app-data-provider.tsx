'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo } from 'react';
import { useFirebase, useMemoFirebase } from '@/firebase';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  addDoc,
  query,
  where,
  getDocs,
  writeBatch,
  limit,
} from 'firebase/firestore';
import { 
    signInAnonymously
} from 'firebase/auth';
import {
  type Employee,
  type Location,
  type Shift,
  type ShiftBreak,
  type Schedule,
  type Holiday,
  type AppSettings,
  type ManualAdjustment,
  type PayslipRecord,
  type EmployeeWithId,
  type LocationWithId,
  type ShiftWithId,
  type ScheduleWithId,
  type HolidayWithId,
  type ManualAdjustmentWithId,
  type PayslipRecordWithId,
} from '@/lib/data';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';
import { format, differenceInCalendarWeeks, startOfWeek } from 'date-fns';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';

const DEFAULT_LOGO_URL = 'https://picsum.photos/seed/logo/200/100';
const DEFAULT_ADMIN_PASSWORD = 'pollofrito2026';
const DEFAULT_USER_PASSWORD = 'pollofrito2026';

interface AppDataContextType {
  employees: EmployeeWithId[];
  addEmployee: (employee: Partial<Employee>) => void;
  updateEmployee: (employeeId: string, employee: Partial<Employee>) => void;
  deleteEmployee: (employeeId: string) => void;

  locations: LocationWithId[];
  addLocation: (location: Partial<Location>) => void;
  updateLocation: (locationId: string, location: Partial<Location>) => void;
  deleteLocation: (locationId: string) => void;
  
  shifts: ShiftWithId[];
  addShift: (shift: Partial<Shift>) => void;
  updateShift: (shiftId: string, shift: Partial<Shift>) => void;
  deleteShift: (shiftId: string) => void;
  deleteShiftsInRange: (startDate: Date, endDate: Date) => Promise<void>;

  payslips: PayslipRecordWithId[];
  savePayslip: (record: Partial<PayslipRecord>) => Promise<void>;
  deletePayslip: (id: string) => void;

  schedule: ScheduleWithId[];
  addScheduleItem: (item: Partial<Schedule>) => void;
  updateScheduleItem: (itemId: string, item: Partial<Schedule>) => void;
  deleteScheduleItem: (itemId: string) => void;

  holidays: HolidayWithId[];
  addHoliday: (holiday: Partial<Holiday>) => void;
  deleteHoliday: (holidayId: string) => void;

  manualAdjustments: ManualAdjustmentWithId[];
  addManualAdjustment: (adjustment: Partial<ManualAdjustment>) => void;
  updateManualAdjustment: (id: string, adjustment: Partial<ManualAdjustment>) => void;
  deleteManualAdjustment: (id: string) => void;
  
  logoUrl: string;
  setLogoUrl: (url: string) => void;
  adminPassword: string;
  setAdminPassword: (password: string) => Promise<void>;
  userPassword: string;
  setUserPassword: (password: string) => Promise<void>;
  userPermissions: Record<string, boolean>;
  setUserPermissions: (permissions: Record<string, boolean>) => Promise<void>;
  isLoading: boolean;
  firstDayOfWeek1: Date | undefined;
  setFirstDayOfWeek1: (date: Date | undefined) => void;
  currentWeekType: 'Semana 1' | 'Semana 2';
  restoreData: (backup: any) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { firestore, auth, user, isUserLoading } = useFirebase();
  const [isDataLoading, setIsDataLoading] = useState(true);

  // Auto sign-in for anonymous access
  useEffect(() => {
    if (!isUserLoading && !user && auth) {
      signInAnonymously(auth).catch(console.error);
    }
  }, [isUserLoading, user, auth]);


  // Collections Refs
  const employeesCol = useMemoFirebase(() => firestore ? collection(firestore, 'employees') : null, [firestore]);
  const locationsCol = useMemoFirebase(() => firestore ? collection(firestore, 'locations') : null, [firestore]);
  const shiftsCol = useMemoFirebase(() => firestore ? collection(firestore, 'timeRecords') : null, [firestore]);
  const payslipsCol = useMemoFirebase(() => firestore ? collection(firestore, 'payslips') : null, [firestore]);
  const scheduleCol = useMemoFirebase(() => firestore ? collection(firestore, 'schedules') : null, [firestore]);
  const holidaysCol = useMemoFirebase(() => firestore ? collection(firestore, 'holidays') : null, [firestore]);
  const adjustmentsCol = useMemoFirebase(() => firestore ? collection(firestore, 'manualAdjustments') : null, [firestore]);
  const appSettingsDoc = useMemoFirebase(() => firestore ? doc(firestore, 'appSettings/main') : null, [firestore]);

  // Data hooks - load Firestore collections directly without blocking on auth user
  const { data: employeesData, isLoading: employeesLoading } = useCollection<Employee>(employeesCol);
  const { data: locationsData, isLoading: locationsLoading } = useCollection<Location>(locationsCol);
  const { data: shiftsData, isLoading: shiftsLoading } = useCollection<Shift>(shiftsCol);
  const { data: payslipsData, isLoading: payslipsLoading } = useCollection<PayslipRecord>(payslipsCol);
  const { data: scheduleData, isLoading: scheduleLoading } = useCollection<Schedule>(scheduleCol);
  const { data: holidaysData, isLoading: holidaysLoading } = useCollection<Holiday>(holidaysCol);
  const { data: adjustmentsData, isLoading: adjustmentsLoading } = useCollection<ManualAdjustment>(adjustmentsCol);
  const { data: appSettingsData, isLoading: appSettingsLoading } = useDoc<AppSettings>(appSettingsDoc);

  // --- App Settings State Management ---
  const logoUrl = appSettingsData?.logoUrl || DEFAULT_LOGO_URL;
  const adminPassword = appSettingsData?.adminPassword || DEFAULT_ADMIN_PASSWORD;
  const userPassword = appSettingsData?.userPassword || DEFAULT_USER_PASSWORD;
  const userPermissions = appSettingsData?.userPermissions || { '/reports': true, '/payslips': true };

  const firstDayOfWeek1 = useMemo(() => {
    return appSettingsData?.firstDayOfWeek1 ? new Date(appSettingsData.firstDayOfWeek1) : undefined;
  }, [appSettingsData]);

  const [currentWeekType, setCurrentWeekType] = useState<'Semana 1' | 'Semana 2'>('Semana 1');

  useEffect(() => {
    if (firstDayOfWeek1) {
      const start = startOfWeek(firstDayOfWeek1, { weekStartsOn: 1 });
      const now = new Date();
      const weekDiff = differenceInCalendarWeeks(now, start, { weekStartsOn: 1 });
      setCurrentWeekType(weekDiff % 2 === 0 ? 'Semana 1' : 'Semana 2');
    }
  }, [firstDayOfWeek1]);
  
  const setLogoUrl = (url: string) => {
    if (!appSettingsDoc) return;
    setDoc(appSettingsDoc, { logoUrl: url }, { merge: true }).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: appSettingsDoc.path,
            operation: 'update',
            requestResourceData: { logoUrl: url },
        }));
    });
  };

  const setAdminPassword = async (password: string) => {
    if (!appSettingsDoc) return;
    await setDoc(appSettingsDoc, { adminPassword: password }, { merge: true }).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: appSettingsDoc.path,
            operation: 'update',
            requestResourceData: { adminPassword: password },
        }));
    });
  }

  const setUserPassword = async (password: string) => {
    if (!appSettingsDoc) return;
    await setDoc(appSettingsDoc, { userPassword: password }, { merge: true }).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: appSettingsDoc.path,
            operation: 'update',
            requestResourceData: { userPassword: password },
        }));
    });
  }

  const setUserPermissions = async (permissions: Record<string, boolean>) => {
    if (!appSettingsDoc) return;
    await setDoc(appSettingsDoc, { userPermissions: permissions }, { merge: true }).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: appSettingsDoc.path,
            operation: 'update',
            requestResourceData: { userPermissions: permissions },
        }));
    });
  }

  const setFirstDayOfWeek1 = (date: Date | undefined) => {
    if (!appSettingsDoc) return;
    setDoc(appSettingsDoc, { firstDayOfWeek1: date ? date.toISOString() : undefined }, { merge: true }).catch(error => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: appSettingsDoc.path,
            operation: 'update',
            requestResourceData: { firstDayOfWeek1: date ? date.toISOString() : undefined },
        }));
    });
  }

  useEffect(() => {
    const collectionsLoading = employeesLoading || locationsLoading || shiftsLoading || payslipsLoading || scheduleLoading || holidaysLoading || adjustmentsLoading || appSettingsLoading;
    setIsDataLoading(collectionsLoading);
  }, [employeesLoading, locationsLoading, shiftsLoading, payslipsLoading, scheduleLoading, holidaysLoading, adjustmentsLoading, appSettingsLoading]);

  // Safety timer: Never allow the app to be stuck on loading screen indefinitely if Firestore is unreachable
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsDataLoading(false);
    }, 10000);
    return () => clearTimeout(timer);
  }, []);


  const toDateSafe = (date: any): Date | null => {
      if (!date) return null;
      if (date instanceof Timestamp) return date.toDate();
      if (date instanceof Date) return date;
      const parsedDate = new Date(date);
      return isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  // Memoized data transformations
  const employees: EmployeeWithId[] = useMemo(() => employeesData || [], [employeesData]);
  const locations: LocationWithId[] = useMemo(() => locationsData || [], [locationsData]);
  
  const shifts: ShiftWithId[] = useMemo(() => {
    const list: ShiftWithId[] = [];
    if (!shiftsData) return list;

    for (const s of shiftsData) {
      const clockInDate = toDateSafe(s.clockIn);
      const clockOutDate = toDateSafe(s.clockOut);
      if (!clockInDate) continue;

      const parsedBreaks: ShiftBreak[] = Array.isArray(s.breaks) ? s.breaks.map(b => {
        const bStart = toDateSafe(b.start) || new Date();
        const bEnd = toDateSafe(b.end);
        const durationMinutes = b.durationMinutes ?? (bEnd ? Math.max(0, Math.round((bEnd.getTime() - bStart.getTime()) / 60000)) : undefined);
        return {
          ...b,
          start: bStart,
          end: bEnd,
          durationMinutes
        };
      }) : [];

      const parsedNightConfirmations = Array.isArray(s.nightConfirmations)
        ? s.nightConfirmations.map((nc: any) => ({
            tier: nc.tier as 1 | 2 | 3,
            confirmedAt: toDateSafe(nc.confirmedAt) || new Date(),
          }))
        : [];

      list.push({
        ...s,
        clockIn: clockInDate,
        clockOut: clockOutDate,
        breaks: parsedBreaks,
        nightConfirmations: parsedNightConfirmations,
      });
    }

    return list;
  }, [shiftsData]);

  const payslips: PayslipRecordWithId[] = useMemo(() => {
    return (payslipsData || []).map(p => ({
        ...p,
        startDate: toDateSafe(p.startDate) || new Date(),
        endDate: toDateSafe(p.endDate) || new Date(),
        createdAt: toDateSafe(p.createdAt) || new Date(),
    }));
  }, [payslipsData]);

  const schedule: ScheduleWithId[] = useMemo(() => scheduleData || [], [scheduleData]);

  const holidays: HolidayWithId[] = useMemo(() => {
    return (holidaysData || []).map(h => {
        const holidayDate = toDateSafe(h.date);
        if (!holidayDate) return null;
        return { ...h, date: holidayDate };
    }).filter((h): h is HolidayWithId => h !== null);
  }, [holidaysData]);

  const manualAdjustments: ManualAdjustmentWithId[] = useMemo(() => {
    return (adjustmentsData || []).map(a => {
      return { ...a, createdAt: toDateSafe(a.createdAt) || new Date() };
    });
  }, [adjustmentsData]);

  // Firestore actions
  const addEmployee = (employee: Partial<Employee>) => {
    if (!employeesCol) return;
    addDoc(employeesCol, employee).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: employeesCol.path,
            operation: 'create',
            requestResourceData: employee,
        }));
    });
  }
  const updateEmployee = (employeeId: string, employee: Partial<Employee>) => {
    if (!employeesCol) return;
    const docRef = doc(employeesCol, employeeId);
    updateDoc(docRef, employee).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: employee,
        }));
    });
  }
  const deleteEmployee = (employeeId: string) => {
    if (!employeesCol) return;
    const docRef = doc(employeesCol, employeeId);
    deleteDoc(docRef).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete',
        }));
    });
  }

  const addLocation = (location: Partial<Location>) => {
    if (!locationsCol) return;
     addDoc(locationsCol, location).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: locationsCol.path,
            operation: 'create',
            requestResourceData: location,
        }));
    });
  }
  const updateLocation = (locationId: string, location: Partial<Location>) => {
    if (!locationsCol) return;
    const docRef = doc(locationsCol, locationId);
    updateDoc(docRef, location).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: location,
        }));
    });
  }
  const deleteLocation = (locationId: string) => {
    if (!locationsCol) return;
    const docRef = doc(locationsCol, locationId);
    deleteDoc(docRef).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete',
        }));
    });
  }

  const addShift = (shift: Partial<Shift>) => {
    if (!shiftsCol) return;
    addDoc(shiftsCol, shift).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: shiftsCol.path,
            operation: 'create',
            requestResourceData: shift,
        }));
    });
  }
  const updateShift = (shiftId: string, shift: Partial<Shift>) => {
    if (!shiftsCol) return;
    const docRef = doc(shiftsCol, shiftId);
    updateDoc(docRef, shift).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: shift,
        }));
    });
  }
  const deleteShift = (shiftId: string) => {
    if (!shiftsCol) return;
    const docRef = doc(shiftsCol, shiftId);
    deleteDoc(docRef).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete',
        }));
    });
  }

  const deleteShiftsInRange = async (startDate: Date, endDate: Date) => {
    if (!firestore || !shiftsCol) return;
    
    let shouldContinue = true;

    while (shouldContinue) {
      const q = query(
        shiftsCol, 
        where('clockIn', '>=', startDate), 
        where('clockIn', '<=', endDate),
        limit(400)
      );
      
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        shouldContinue = false;
        break;
      }

      const batch = writeBatch(firestore);
      querySnapshot.forEach((doc) => {
          batch.delete(doc.ref);
      });
      
      await batch.commit();
      
      if (querySnapshot.size < 400) shouldContinue = false;
    }
  };

  const savePayslip = async (record: Partial<PayslipRecord>) => {
    if (!payslipsCol || !firestore || !record.employeeId || !record.startDate || !record.endDate) return;

    const q = query(
        payslipsCol,
        where('employeeId', '==', record.employeeId),
        where('startDate', '==', record.startDate),
        where('endDate', '==', record.endDate)
    );

    const snapshot = await getDocs(q);
    // Conserva historial: asigna nueva versión sin eliminar comprobantes anteriores
    const version = (snapshot.docs.length || 0) + 1;

    const newDocRef = doc(payslipsCol);
    await setDoc(newDocRef, {
        ...record,
        version,
        createdAt: new Date()
    }).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: payslipsCol.path,
            operation: 'write',
            requestResourceData: record,
        }));
    });
  }

  const deletePayslip = (id: string) => {
    if (!payslipsCol) return;
    const docRef = doc(payslipsCol, id);
    deleteDoc(docRef).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete',
        }));
    });
  }

  const addScheduleItem = (item: Partial<Schedule>) => {
    if (!scheduleCol) return;
    addDoc(scheduleCol, item).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: scheduleCol.path,
            operation: 'create',
            requestResourceData: item,
        }));
    });
  }
  const updateScheduleItem = (itemId: string, item: Partial<Schedule>) => {
    if (!scheduleCol) return;
    const docRef = doc(scheduleCol, itemId);
    updateDoc(docRef, item).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: item,
        }));
    });
  }
  const deleteScheduleItem = (itemId: string) => {
    if (!scheduleCol) return;
    const docRef = doc(scheduleCol, itemId);
    deleteDoc(docRef).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete',
        }));
    });
  }

  const addHoliday = (holiday: Partial<Holiday>) => {
    if (!holidaysCol || !holiday.date) return;
    const holidayId = format(holiday.date, 'yyyy-MM-dd');
    const docRef = doc(holidaysCol, holidayId);
    setDoc(docRef, { ...holiday, id: holidayId }).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'create',
            requestResourceData: holiday,
        }));
    });
  };

  const deleteHoliday = (holidayId: string) => {
    if (!holidaysCol) return;
    const docRef = doc(holidaysCol, holidayId);
    deleteDoc(docRef).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete',
        }));
    });
  };

  const addManualAdjustment = (adjustment: Partial<ManualAdjustment>) => {
    if (!adjustmentsCol) return;
    addDoc(adjustmentsCol, { ...adjustment, createdAt: new Date() }).catch(error => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: adjustmentsCol.path,
        operation: 'create',
        requestResourceData: adjustment,
      }));
    });
  }

  const updateManualAdjustment = (id: string, adjustment: Partial<ManualAdjustment>) => {
    if (!adjustmentsCol) return;
    const docRef = doc(adjustmentsCol, id);
    updateDoc(docRef, adjustment).catch(error => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: docRef.path,
        operation: 'update',
        requestResourceData: adjustment,
      }));
    });
  }

  const deleteManualAdjustment = (id: string) => {
    if (!adjustmentsCol) return;
    const docRef = doc(adjustmentsCol, id);
    deleteDoc(docRef).catch(error => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: docRef.path,
        operation: 'delete',
      }));
    });
  }

  const restoreData = async (backup: any) => {
    if (!firestore) return;

    const sourceData = backup.collections || backup;

    const collectionsToRestore = [
      { data: sourceData.employees, path: 'employees' },
      { data: sourceData.locations, path: 'locations' },
      { data: sourceData.timeRecords || sourceData.shifts, path: 'timeRecords', isDate: true },
      { data: sourceData.payslips, path: 'payslips', isDate: true },
      { data: sourceData.schedules || sourceData.schedule, path: 'schedules' },
      { data: sourceData.holidays, path: 'holidays', isDate: true },
      { data: sourceData.manualAdjustments, path: 'manualAdjustments', isDate: true }
    ];

    for (const col of collectionsToRestore) {
      const data = col.data;
      if (!Array.isArray(data)) continue;

      let batch = writeBatch(firestore);
      let count = 0;

      for (const item of data) {
        const { id, ...rest } = item;
        if (!id) continue;

        const docRef = doc(firestore, col.path, id);
        const cleanedData = { ...rest };
        if (col.isDate) {
          if (cleanedData.clockIn) cleanedData.clockIn = new Date(cleanedData.clockIn);
          if (cleanedData.clockOut) cleanedData.clockOut = new Date(cleanedData.clockOut);
          if (cleanedData.startDate) cleanedData.startDate = new Date(cleanedData.startDate);
          if (cleanedData.endDate) cleanedData.endDate = new Date(cleanedData.endDate);
          if (cleanedData.date && typeof cleanedData.date !== 'string') cleanedData.date = new Date(cleanedData.date);
          if (cleanedData.createdAt) cleanedData.createdAt = new Date(cleanedData.createdAt);
        }

        batch.set(docRef, cleanedData, { merge: true });
        count++;

        if (count >= 400) {
          await batch.commit();
          batch = writeBatch(firestore);
          count = 0;
        }
      }
      
      if (count > 0) {
        await batch.commit();
      }
    }

    if (backup.appSettings && appSettingsDoc) {
      const { id, ...settingsRest } = backup.appSettings;
      await setDoc(appSettingsDoc, settingsRest, { merge: true });
    }
  };

  const value = {
    employees,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    locations,
    addLocation,
    updateLocation,
    deleteLocation,
    shifts,
    addShift,
    updateShift,
    deleteShift,
    deleteShiftsInRange,
    payslips,
    savePayslip,
    deletePayslip,
    schedule,
    addScheduleItem,
    updateScheduleItem,
    deleteScheduleItem,
    holidays,
    addHoliday,
    deleteHoliday,
    manualAdjustments,
    addManualAdjustment,
    updateManualAdjustment,
    deleteManualAdjustment,
    logoUrl,
    setLogoUrl,
    adminPassword,
    setAdminPassword,
    userPassword,
    setUserPassword,
    userPermissions,
    setUserPermissions,
    isLoading: isDataLoading,
    firstDayOfWeek1,
    setFirstDayOfWeek1,
    currentWeekType,
    restoreData,
  };

  return (
    <AppDataContext.Provider value={value}>
       {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (context === undefined) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
}
