'use client';

/**
 * Asistente de voz (Text-to-Speech) para confirmación de asistencia
 */

export interface SpeakAttendanceParams {
  name: string;
  type: 'entrada' | 'salida' | 'almuerzo_inicio' | 'almuerzo_fin' | 'descanso_inicio' | 'descanso_fin';
  time?: Date;
  locationName?: string;
  enabled?: boolean;
  breakName?: string;
  breakMinutes?: number;
  allowedMinutes?: number;
  excessMinutes?: number;
}

export function formatTimeForVoice(date: Date = new Date()): string {
  try {
    return date.toLocaleTimeString('es-CR', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'de la tarde' : 'de la mañana';
    const formattedHour = hours % 12 || 12;
    return `${formattedHour}:${minutes} ${ampm}`;
  }
}

export function speakAttendance({
  name,
  type,
  time = new Date(),
  locationName,
  enabled = true,
  breakName,
  breakMinutes,
  allowedMinutes,
  excessMinutes = 0,
}: SpeakAttendanceParams): { message: string; supported: boolean } {
  const formattedTime = formatTimeForVoice(time);
  const firstName = name.trim().split(' ')[0] || name;
  const breakLabel = breakName || 'descanso';

  let message = '';
  switch (type) {
    case 'entrada':
      message = `¡Bienvenido, ${firstName}! Tu ENTRADA ha sido registrada con éxito a las ${formattedTime}${
        locationName ? ` en ${locationName}` : ''
      }. ¡Que tengas un excelente día de trabajo!`;
      break;
    case 'salida':
      if (excessMinutes > 0) {
        message = `¡Hasta luego, ${firstName}! Tu salida ha sido registrada a las ${formattedTime}. Se registraron ${excessMinutes} minutos de exceso en descansos durante tu jornada.`;
      } else {
        message = `¡Hasta luego, ${firstName}! Tu SALIDA ha sido registrada con éxito a las ${formattedTime}. ¡Buen descanso y gracias por tu labor!`;
      }
      break;
    case 'almuerzo_inicio':
    case 'descanso_inicio':
      message = `¡Buen provecho, ${firstName}! Salida a ${breakLabel} registrada a las ${formattedTime}. ${
        allowedMinutes ? `Recuerda que tienes ${allowedMinutes} minutos autorizados.` : ''
      }`;
      break;
    case 'almuerzo_fin':
    case 'descanso_fin':
      if (excessMinutes > 0) {
        message = `¡Bienvenido nuevamente, ${firstName}! Tu regreso ha sido registrado. Tomaste ${breakMinutes || 0} minutos, con ${excessMinutes} minutos de exceso.`;
      } else {
        message = `¡Bienvenido nuevamente, ${firstName}! Tu regreso de ${breakLabel} ha sido registrado a tiempo con ${breakMinutes || 0} minutos.`;
      }
      break;
    default:
      message = `Registro completado para ${firstName} a las ${formattedTime}.`;
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return { message, supported: false };
  }

  if (!enabled) {
    return { message, supported: true };
  }

  try {
    // Cancel any pending speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'es-ES';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Pick Spanish voice if available
    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(
      (v) =>
        v.lang.startsWith('es') ||
        v.lang.includes('es-ES') ||
        v.lang.includes('es-MX') ||
        v.lang.includes('es-US') ||
        v.lang.includes('es-419')
    );

    if (spanishVoice) {
      utterance.voice = spanishVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis error:', err);
  }

  return { message, supported: true };
}

export function testVoiceBot(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      '¡Hola! El asistente de voz está listo y configurado para confirmar entradas y salidas.'
    );
    utterance.lang = 'es-ES';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find((v) => v.lang.startsWith('es'));
    if (spanishVoice) {
      utterance.voice = spanishVoice;
    }

    window.speechSynthesis.speak(utterance);
  }
}

export function speakCustomText(message: string, enabled = true): { message: string; supported: boolean } {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return { message, supported: false };
  }

  if (!enabled) {
    return { message, supported: true };
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'es-ES';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find((v) => v.lang.startsWith('es'));
    if (spanishVoice) {
      utterance.voice = spanishVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis error:', err);
  }

  return { message, supported: true };
}

export function playChimeSound(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    // Gentle attention chime: 587.33Hz (D5) -> 880Hz (A5)
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  } catch (err) {
    console.warn('Audio chime error:', err);
  }
}

export function buildCediWhatsAppUrl(phone: string, employeeName: string, deadlineTimeStr: string): string {
  const cleanPhone = phone.replace(/\D/g, '');
  let message = `🍗 *Pollo Frito Sabor Cervanteño — Control CEDI*\n\n`;
  message += `Hola *${employeeName}*, tu turno activo en CEDI requiere *Confirmación de Continuidad Laboral* antes de las *${deadlineTimeStr}* para evitar el cierre automático del sistema por inactividad.\n\n`;
  message += `📍 *Acción requerida:* Por favor acércate a la pantalla del reloj checador y presiona el botón: _"Confirmar Continuidad de Turno (Evitar Cierre)"_. ✅`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

