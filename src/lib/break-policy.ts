export type ShiftCategory = '7h' | '8h' | '10h' | '12h' | 'otra';

export interface BreakPolicyRules {
  category: ShiftCategory;
  label: string;
  allowedMinutes: number;
  details: {
    coffeeMorning?: number;
    lunch?: number;
    coffeeAfternoon?: number;
  };
}

/**
 * Política oficial de Pollo Frito Sabor Cervanteño
 * Basada en la directriz de descansos para alimentación:
 * - 7 Horas (Ingreso en la tarde): 15 min (Coffee break tarde 15m) -> Total 15 min
 * - 8 Horas: 10 min mañana + 20 min almuerzo -> Total 30 min
 * - 10 Horas: 10 min mañana + 25 min almuerzo + 10 min tarde -> Total 45 min
 * - 12 Horas: 10 min mañana + 30 min almuerzo + 20 min tarde -> Total 60 min
 */
export const BREAK_POLICIES: Record<ShiftCategory, BreakPolicyRules> = {
  '7h': {
    category: '7h',
    label: '7 Horas (Ingreso Tarde)',
    allowedMinutes: 15,
    details: {
      coffeeAfternoon: 15,
    },
  },
  '8h': {
    category: '8h',
    label: '8 Horas (Regular)',
    allowedMinutes: 30,
    details: {
      coffeeMorning: 10,
      lunch: 20,
    },
  },
  '10h': {
    category: '10h',
    label: '10 Horas (Extendido)',
    allowedMinutes: 45,
    details: {
      coffeeMorning: 10,
      lunch: 25,
      coffeeAfternoon: 10,
    },
  },
  '12h': {
    category: '12h',
    label: '12 Horas (Completo)',
    allowedMinutes: 60,
    details: {
      coffeeMorning: 10,
      lunch: 30,
      coffeeAfternoon: 20,
    },
  },
  'otra': {
    category: 'otra',
    label: 'Jornada Especial',
    allowedMinutes: 30,
    details: {},
  },
};

/**
 * Determina dinámicamente la categoría de la jornada según la hora de ingreso
 * y la duración real física trabajada.
 */
export function determineShiftCategory(clockIn: Date, clockOut: Date | null, referenceDate = new Date()): {
  category: ShiftCategory;
  allowedMinutes: number;
  label: string;
  durationHours: number;
} {
  const inDate = new Date(clockIn);
  const outDate = clockOut ? new Date(clockOut) : referenceDate;
  const durationMs = Math.max(0, outDate.getTime() - inDate.getTime());
  const durationHours = durationMs / (1000 * 60 * 60);
  const clockInHour = inDate.getHours();

  // Si ingresó en la tarde (13:00 en adelante) y la duración estimada/real es <= 7.5 horas
  if (clockInHour >= 13 && durationHours <= 7.5) {
    const policy = BREAK_POLICIES['7h'];
    return { category: '7h', allowedMinutes: policy.allowedMinutes, label: policy.label, durationHours };
  }

  if (durationHours < 9) {
    const policy = BREAK_POLICIES['8h'];
    return { category: '8h', allowedMinutes: policy.allowedMinutes, label: policy.label, durationHours };
  }

  if (durationHours < 11) {
    const policy = BREAK_POLICIES['10h'];
    return { category: '10h', allowedMinutes: policy.allowedMinutes, label: policy.label, durationHours };
  }

  const policy = BREAK_POLICIES['12h'];
  return { category: '12h', allowedMinutes: policy.allowedMinutes, label: policy.label, durationHours };
}

/**
 * Calcula el resumen de descansos de un turno:
 * Minutos tomados, permitidos, excesos y costo monetario de deducción.
 */
export function calculateShiftBreakSummary(
  clockIn: Date,
  clockOut: Date | null,
  breaks: Array<{ start: Date; end?: Date | null; durationMinutes?: number }> = [],
  hourlyRate = 0,
  referenceDate = new Date()
) {
  const { category, allowedMinutes, label, durationHours } = determineShiftCategory(clockIn, clockOut, referenceDate);

  let totalMinutes = 0;
  let hasOpenBreak = false;
  let openBreakMinutes = 0;

  breaks.forEach((b) => {
    const bStart = new Date(b.start);
    if (!b.end) {
      hasOpenBreak = true;
      const curElapsed = Math.max(0, Math.round((referenceDate.getTime() - bStart.getTime()) / 60000));
      openBreakMinutes += curElapsed;
      totalMinutes += curElapsed;
    } else {
      const bEnd = new Date(b.end);
      const minutes = b.durationMinutes ?? Math.max(0, Math.round((bEnd.getTime() - bStart.getTime()) / 60000));
      totalMinutes += minutes;
    }
  });

  const excessMinutes = Math.max(0, totalMinutes - allowedMinutes);
  const excessHours = excessMinutes / 60;
  const excessDeduction = excessHours * hourlyRate;

  return {
    category,
    categoryLabel: label,
    durationHours,
    allowedMinutes,
    totalMinutes,
    excessMinutes,
    excessHours,
    excessDeduction,
    hasOpenBreak,
    openBreakMinutes,
    inCompliance: excessMinutes === 0,
  };
}
