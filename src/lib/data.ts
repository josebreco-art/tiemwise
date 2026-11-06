
export type WithId<T> = T & { id: string };

export type Employee = {
  name: string;
  cedula: string;
  phone?: string;
  position?: string;
  hourlyRate: number;
  hourlyRateCedi?: number;
  cajaRetentionRate?: number;
  initialLoanAmount?: number;
  loanAmount?: number;
  loanPayment?: number;
  savingsAmount?: number;
  savingsPayment?: number;
  vacationDaysAccrued?: number;
  vacationDaysTaken?: number;
  faceDescriptor?: string;
  manualSalaries?: { [key: string]: number };
};
export type EmployeeWithId = WithId<Employee>;


export type Location = {
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  type: 'Punto de Venta' | 'CEDI';
};
export type LocationWithId = WithId<Location>;

export type ShiftBreak = {
  id?: string;
  type: 'coffee_morning' | 'lunch' | 'coffee_afternoon' | 'general';
  name?: string;
  start: Date;
  end: Date | null;
  durationMinutes?: number;
};

export type NightConfirmation = {
  tier: 1 | 2 | 3;
  confirmedAt: Date;
};

export type Shift = {
  employeeId: string;
  locationId: string;
  clockIn: Date;
  clockOut: Date | null;
  approved: boolean;
  breaks?: ShiftBreak[];
  totalBreakMinutes?: number;
  allowedBreakMinutes?: number;
  excessBreakMinutes?: number;
  shiftHoursCategory?: '7h' | '8h' | '10h' | '12h' | 'otra';
  nightConfirmations?: NightConfirmation[];
  autoClosed?: boolean;
  autoClosedReason?: string;
};
export type ShiftWithId = WithId<Shift>;

export type PayslipRecord = {
  employeeId: string;
  employeeName: string;
  cedula: string;
  startDate: Date;
  endDate: Date;
  type: 'regular' | 'vacation';
  grossSalary: number;
  netSalary: number;
  deductions: {
    caja: number;
    loan: number;
    savings: number;
    breakExcess?: number;
  };
  breakExcessMinutes?: number;
  hoursBreakdown: {
    regular: number;
    overtime: number;
    holiday: number;
    vacation?: number;
  };
  createdAt: Date;
};
export type PayslipRecordWithId = WithId<PayslipRecord>;

export type Schedule = {
  employeeId: string;
  locationId: string;
  dayOfWeek: string; 
  startTime: string; 
  endTime: string; 
  weekType: 'Semana 1' | 'Semana 2';
};
export type ScheduleWithId = WithId<Schedule>;

export type Holiday = {
    name: string;
    date: Date;
}
export type HolidayWithId = WithId<Holiday>;

export type AppSettings = {
  logoUrl: string;
  firstDayOfWeek1?: string;
  adminPassword?: string;
  userPassword?: string;
  userPermissions?: Record<string, boolean>;
};

export type ManualAdjustment = {
  employeeId: string;
  employeeName: string;
  cedula: string;
  date: string;
  clockIn: string;
  clockOut: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  locationId: string;
  reason: string;
  supervisorSignature: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
};
export type ManualAdjustmentWithId = WithId<ManualAdjustment>;

export type BreakSlot = {
  startTime: Date;
  endTime: Date;
  employees: EmployeeWithId[];
};

export type DailyBreakSchedule = {
  day: string;
  breaks: BreakSlot[];
};
