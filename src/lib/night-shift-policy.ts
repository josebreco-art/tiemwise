import { type Shift, type Location, type ShiftWithId, type LocationWithId, type NightConfirmation } from './data';

export const CEDI_LOCATION_ID = 'nMkSu1BvdDrwItro89SB';

export const NIGHT_SHIFT_UI = {
  TITLE: 'Confirmación de Cierre Automático Nocturno',
  MESSAGE: 'El sistema ha detectado turno activo en CEDI después de las 10:00 p.m. Para evitar el cierre automático de turno por inactividad nocturna, confirme que continúa en labores.',
  BUTTON_TEXT: 'Confirmar Continuidad de Turno (Evitar Cierre)',
} as const;

export type NightTier = 1 | 2 | 3;

export interface NightConfirmationStatus {
  isEligible: boolean; // Is active shift in CEDI (all shifts in CEDI regardless of entry time)
  activeTier: NightTier | null; // Next pending tier to confirm (1, 2, 3, or null if all done)
  isPromptActive: boolean; // Should the alert and confirmation button be displayed right now
  isOverdueForAutoClose: boolean; // Grace window expired, system should close shift now
  autoCloseTime: Date | null; // Exact time to set as clockOut when closing
  targetTime: Date | null; // When confirmation is officially due
  graceDeadline: Date | null; // When grace window ends and auto-close triggers
  windowOpensAt: Date | null; // When the confirmation button starts showing
  minutesRemainingInGrace: number | null;
  completedTiers: NightTier[];
  tierLabel: string;
  autoCloseReason: string;
}

/**
 * Checks if a location is CEDI
 */
export function isCediLocation(location?: Location | LocationWithId | null): boolean {
  if (!location) return false;
  if ('id' in location && location.id === CEDI_LOCATION_ID) return true;
  if (location.type === 'CEDI') return true;
  const name = (location.name || '').toLowerCase();
  return name.includes('cedi') || name.includes('distribucion') || name.includes('distribución');
}

/**
 * Checks if a shift clock-in occurred after 10:00 p.m. (22:00)
 * (Retained for backwards compatibility or reports classification)
 */
export function isNightShiftEntry(clockIn: Date): boolean {
  const hours = clockIn.getHours();
  return hours >= 22 || hours < 5;
}

/**
 * Evaluates the 3-tier confirmation status of an active CEDI shift:
 * Aplica a cualquier colaborador en CEDI, sin importar la hora de entrada:
 * - 1st confirmation: at 3 hours from clock-in. Window opens 15m before, grace is 30m.
 * - 2nd confirmation: 2 hours after 1st confirmation. Window opens 15m before, grace is 30m.
 * - 3rd confirmation: 1 hour after 2nd confirmation. Window opens 15m before, grace is 30m.
 * 
 * If not confirmed by the end of grace period, shift is automatically closed at the target mark.
 */
export function getNightConfirmationStatus(
  shift: Shift | ShiftWithId,
  location?: Location | LocationWithId | null,
  now: Date = new Date()
): NightConfirmationStatus {
  // Must be an open shift
  if (shift.clockOut !== null) {
    return {
      isEligible: false,
      activeTier: null,
      isPromptActive: false,
      isOverdueForAutoClose: false,
      autoCloseTime: null,
      targetTime: null,
      graceDeadline: null,
      windowOpensAt: null,
      minutesRemainingInGrace: null,
      completedTiers: [],
      tierLabel: '',
      autoCloseReason: '',
    };
  }

  // Must be in CEDI (aplica a todos los turnos de CEDI sin importar la hora de entrada)
  if (!isCediLocation(location)) {
    return {
      isEligible: false,
      activeTier: null,
      isPromptActive: false,
      isOverdueForAutoClose: false,
      autoCloseTime: null,
      targetTime: null,
      graceDeadline: null,
      windowOpensAt: null,
      minutesRemainingInGrace: null,
      completedTiers: [],
      tierLabel: '',
      autoCloseReason: '',
    };
  }

  const clockInDate = new Date(shift.clockIn);

  // Las alertas se activan únicamente después de las 10:00 p.m. (>= 22:00 o madrugada < 05:00)
  if (!isNightShiftEntry(clockInDate)) {
    return {
      isEligible: false,
      activeTier: null,
      isPromptActive: false,
      isOverdueForAutoClose: false,
      autoCloseTime: null,
      targetTime: null,
      graceDeadline: null,
      windowOpensAt: null,
      minutesRemainingInGrace: null,
      completedTiers: [],
      tierLabel: '',
      autoCloseReason: '',
    };
  }

  const confirmations: NightConfirmation[] = (shift.nightConfirmations || []).map(c => ({
    tier: c.tier,
    confirmedAt: new Date(c.confirmedAt),
  }));

  const hasTier1 = confirmations.find(c => c.tier === 1);
  const hasTier2 = confirmations.find(c => c.tier === 2);
  const hasTier3 = confirmations.find(c => c.tier === 3);

  const completedTiers: NightTier[] = [];
  if (hasTier1) completedTiers.push(1);
  if (hasTier2) completedTiers.push(2);
  if (hasTier3) completedTiers.push(3);

  // All 3 tiers completed! Shift is fully validated.
  if (hasTier1 && hasTier2 && hasTier3) {
    return {
      isEligible: true,
      activeTier: null,
      isPromptActive: false,
      isOverdueForAutoClose: false,
      autoCloseTime: null,
      targetTime: null,
      graceDeadline: null,
      windowOpensAt: null,
      minutesRemainingInGrace: null,
      completedTiers,
      tierLabel: 'Turno nocturno CEDI verificado en su totalidad (3/3)',
      autoCloseReason: '',
    };
  }

  const nowMs = now.getTime();
  const GRACE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes grace
  const EARLY_WINDOW_MS = 15 * 60 * 1000; // Opens 15 minutes before due time

  // --- TIER 1: 3 hours after clockIn ---
  if (!hasTier1) {
    const tier1TargetMs = clockInDate.getTime() + 3 * 3600 * 1000;
    const windowOpensMs = tier1TargetMs - EARLY_WINDOW_MS;
    const graceDeadlineMs = tier1TargetMs + GRACE_WINDOW_MS;

    const isOverdue = nowMs > graceDeadlineMs;
    const isPromptActive = nowMs >= windowOpensMs && !isOverdue;
    const minutesRemainingInGrace = isOverdue ? 0 : Math.max(0, Math.round((graceDeadlineMs - nowMs) / 60000));

    return {
      isEligible: true,
      activeTier: 1,
      isPromptActive,
      isOverdueForAutoClose: isOverdue,
      autoCloseTime: new Date(tier1TargetMs),
      targetTime: new Date(tier1TargetMs),
      graceDeadline: new Date(graceDeadlineMs),
      windowOpensAt: new Date(windowOpensMs),
      minutesRemainingInGrace,
      completedTiers,
      tierLabel: '1ª Confirmación Nocturna (3 horas de turno)',
      autoCloseReason: 'Cierre automático nocturno por inactividad a las 3 horas de labor en CEDI.',
    };
  }

  // --- TIER 2: 2 hours after Tier 1 confirmation ---
  if (!hasTier2) {
    const baseTimeMs = hasTier1.confirmedAt.getTime();
    const tier2TargetMs = baseTimeMs + 2 * 3600 * 1000;
    const windowOpensMs = tier2TargetMs - EARLY_WINDOW_MS;
    const graceDeadlineMs = tier2TargetMs + GRACE_WINDOW_MS;

    const isOverdue = nowMs > graceDeadlineMs;
    const isPromptActive = nowMs >= windowOpensMs && !isOverdue;
    const minutesRemainingInGrace = isOverdue ? 0 : Math.max(0, Math.round((graceDeadlineMs - nowMs) / 60000));

    return {
      isEligible: true,
      activeTier: 2,
      isPromptActive,
      isOverdueForAutoClose: isOverdue,
      autoCloseTime: new Date(tier2TargetMs),
      targetTime: new Date(tier2TargetMs),
      graceDeadline: new Date(graceDeadlineMs),
      windowOpensAt: new Date(windowOpensMs),
      minutesRemainingInGrace,
      completedTiers,
      tierLabel: '2ª Confirmación Nocturna (2 horas después de la 1ª confirmación)',
      autoCloseReason: 'Cierre automático nocturno por inactividad a las 5 horas de labor en CEDI.',
    };
  }

  // --- TIER 3: 1 hour after Tier 2 confirmation ---
  const baseTimeMs = hasTier2.confirmedAt.getTime();
  const tier3TargetMs = baseTimeMs + 1 * 3600 * 1000;
  const windowOpensMs = tier3TargetMs - EARLY_WINDOW_MS;
  const graceDeadlineMs = tier3TargetMs + GRACE_WINDOW_MS;

  const isOverdue = nowMs > graceDeadlineMs;
  const isPromptActive = nowMs >= windowOpensMs && !isOverdue;
  const minutesRemainingInGrace = isOverdue ? 0 : Math.max(0, Math.round((graceDeadlineMs - nowMs) / 60000));

  return {
    isEligible: true,
    activeTier: 3,
    isPromptActive,
    isOverdueForAutoClose: isOverdue,
    autoCloseTime: new Date(tier3TargetMs),
    targetTime: new Date(tier3TargetMs),
    graceDeadline: new Date(graceDeadlineMs),
    windowOpensAt: new Date(windowOpensMs),
    minutesRemainingInGrace,
    completedTiers,
    tierLabel: '3ª Confirmación Nocturna (1 hora después de la 2ª confirmación)',
    autoCloseReason: 'Cierre automático nocturno por inactividad a las 6 horas de labor en CEDI.',
  };
}
