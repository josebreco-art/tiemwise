'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, LogIn as LogInIcon, VideoOff, Loader2, Volume2, VolumeX, Bot, UserCheck, RefreshCw, ShieldCheck, ShieldAlert, Coffee, Utensils, CheckCircle2, Clock, Timer, AlertTriangle, BellRing, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAppData } from '@/context/app-data-provider';
import Link from 'next/link';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { type EmployeeWithId, type ShiftBreak, type ShiftWithId } from '@/lib/data';
import { speakAttendance, testVoiceBot, formatTimeForVoice, speakCustomText, playChimeSound, buildCediWhatsAppUrl } from '@/lib/attendance-voice';
import { calculateShiftBreakSummary, determineShiftCategory, BREAK_POLICIES } from '@/lib/break-policy';
import { getNightConfirmationStatus, NIGHT_SHIFT_UI, isCediLocation, type NightTier } from '@/lib/night-shift-policy';

function DigitalClock() {
    const [time, setTime] = useState<Date | null>(null);
    useEffect(() => {
        setTime(new Date());
        const timerId = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);
    if (time === null) return <div className="text-center mt-6 font-mono text-4xl">Cargando...</div>;
    return (
        <div className="text-center mt-6">
            <p className="text-6xl font-bold font-mono text-foreground">{time.toLocaleTimeString('es-CR')}</p>
        </div>
    );
}

export default function WelcomePageContent() {
  const { employees, locations, shifts, addShift, updateShift, logoUrl, isLoading } = useAppData();
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [currentCoords, setCurrentCoords] = useState<{lat: number, lon: number} | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'requesting' | 'ready' | 'denied' | 'unavailable'>('requesting');
  const [isInsideGeofence, setIsInsideGeofence] = useState<boolean | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [lastAnnouncement, setLastAnnouncement] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const { toast } = useToast();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraRetryCount, setCameraRetryCount] = useState(0);
  const [faceMatcher, setFaceMatcher] = useState<any | null>(null);
  const [identifiedEmployee, setIdentifiedEmployee] = useState<EmployeeWithId | null>(null);
  const [detectionMessage, setDetectionMessage] = useState('Iniciando cámara y reconocimiento facial...');
  const [isInitializing, setIsInitializing] = useState(true);
  const faceapiRef = useRef<any>(null);

  useEffect(() => {
    if (locations && locations.length > 0 && !selectedLocationId) {
      setSelectedLocationId(locations[0].id);
    }
  }, [locations, selectedLocationId]);

  useEffect(() => {
    let isMounted = true;
    let modelsFinished = false;
    // Timeout de seguridad: si tras 7 segundos la descarga de modelos no concluye, no bloquear
    const timer = setTimeout(() => {
      if (isMounted) {
        setIsInitializing(false);
        if (!modelsFinished) {
          setDetectionMessage('Conectando IA facial... Mantente frente a la cámara.');
        }
      }
    }, 7000);

    const loadModels = async () => {
      try {
        faceapiRef.current = await import('face-api.js');
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
        await Promise.all([
          faceapiRef.current.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapiRef.current.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapiRef.current.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        modelsFinished = true;
        if (isMounted) {
          setModelsLoaded(true);
        }
      } catch (e) {
        console.warn('Face API load error:', e);
        if (isMounted) {
          setDetectionMessage('Cargando modelos biométricos. Por favor espera.');
        }
      } finally {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    };
    loadModels();

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!employees || employees.length === 0) {
      return;
    }

    if (modelsLoaded && faceapiRef.current) {
      const labeledFaceDescriptors = employees
          .filter(employee => employee.faceDescriptor)
          .map(employee => {
              try {
                  const descriptor = new Float32Array(JSON.parse(employee.faceDescriptor!));
                  return new faceapiRef.current.LabeledFaceDescriptors(employee.id, [descriptor]);
              } catch (e) { return null; }
          }).filter(ld => ld !== null) as any[];

      if (labeledFaceDescriptors.length > 0) {
          const matcher = new faceapiRef.current.FaceMatcher(labeledFaceDescriptors, 0.55);
          setFaceMatcher(matcher);
          setDetectionMessage('Apunta la cámara a tu rostro para identificarte.');
      } else {
          setDetectionMessage('No hay rostros enrolados. Un administrador debe registrar los datos biométricos.');
      }
    }
  }, [employees, modelsLoaded]);

  // GPS Geolocation Watcher
  useEffect(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setGpsStatus('unavailable');
      return;
    }

    let watchId: number | null = null;

    const onSuccess = (pos: GeolocationPosition) => {
      setCurrentCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      setGpsStatus('ready');
    };

    const onError = (err: GeolocationPositionError) => {
      // Gracefully handle GPS status without throwing console.error
      if (err.code === 1) {
        // Permission denied by user or iframe policy
        setGpsStatus('denied');
      } else {
        setGpsStatus('unavailable');
      }
    };

    try {
      watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 60000,
      });
    } catch {
      setGpsStatus('unavailable');
    }

    return () => {
      if (watchId !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  const restartCamera = () => {
    setCameraRetryCount((c) => c + 1);
  };

  // Camera Stream - Inicia de inmediato sin depender de los modelos pesados
  useEffect(() => {
    let isMounted = true;
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      setIsCameraLoading(true);
      setCameraError(null);
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Navegador sin soporte de acceso a cámara');
        }

        // Intento 1: cámara frontal con resolución óptima
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
          });
        } catch {
          // Fallback a cualquier cámara de video disponible si facingMode es rechazado
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }

        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
            if (isMounted) {
              setIsCameraReady(true);
              setIsCameraLoading(false);
            }
          } catch {
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play().catch(() => {});
              if (isMounted) {
                setIsCameraReady(true);
                setIsCameraLoading(false);
              }
            };
          }
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.warn('Camera access error:', err);
        setIsCameraReady(false);
        setIsCameraLoading(false);
        setCameraError(err?.message || 'Permiso de cámara no concedido');
        setDetectionMessage('Por favor concede acceso a la cámara para marcar asistencia.');
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setIsCameraReady(false);
      setIsCameraLoading(false);
    };
  }, [cameraRetryCount]);

  useEffect(() => {
    if (!isCameraReady || !faceMatcher || !faceapiRef.current) return;
    // Si ya hay un empleado identificado, pausar el ciclo de detección para darle tiempo de marcar
    if (identifiedEmployee) return;

    const intervalId = setInterval(async () => {
      if (videoRef.current && videoRef.current.readyState >= 3) {
        try {
          const detections = await faceapiRef.current
            .detectAllFaces(videoRef.current, new faceapiRef.current.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptors();
            
          if (detections.length === 1) {
            const result = faceMatcher.findBestMatch(detections[0].descriptor);
            if (result.label && result.label !== 'unknown') {
              const matchedEmployee = employees.find(e => e.id === result.label);
              if (matchedEmployee) {
                 setIdentifiedEmployee(matchedEmployee);
                 setDetectionMessage(`¡Hola, ${matchedEmployee.name.split(' ')[0]}! Identidad verificada.`);
                 return;
              }
            }
            setDetectionMessage('Rostro no reconocido en el sistema.');
          } else if (detections.length > 1) {
            setDetectionMessage('Solo una persona debe colocarse frente a la cámara.');
          } else {
            setDetectionMessage('Apunta la cámara a tu rostro para identificarte.');
          }
        } catch (err) {
          console.warn('Face detection error:', err);
        }
      }
    }, 900);
    return () => clearInterval(intervalId);
  }, [isCameraReady, faceMatcher, employees, identifiedEmployee]);

  useEffect(() => {
    if (!selectedLocationId || !currentCoords) {
        setIsInsideGeofence(null);
        return;
    }
    const loc = locations.find(l => l.id === selectedLocationId);
    if (!loc || !loc.latitude || !loc.longitude) {
        setIsInsideGeofence(true);
        return;
    }

    const R = 6371e3;
    const phi1 = currentCoords.lat * Math.PI/180;
    const phi2 = loc.latitude * Math.PI/180;
    const deltaPhi = (loc.latitude - currentCoords.lat) * Math.PI/180;
    const deltaLambda = (loc.longitude - currentCoords.lon) * Math.PI/180;
    const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    setIsInsideGeofence(distance <= 200);
  }, [selectedLocationId, currentCoords, locations]);

  const handleClockIn = () => {
    if (isInsideGeofence === false) {
        toast({ title: 'Ubicación Incorrecta', description: `Debes estar en el local para marcar entrada.`, variant: 'destructive' });
        return;
    }
    if (!selectedLocationId || !identifiedEmployee) return;
    const activeShift = shifts?.find(s => s.employeeId === identifiedEmployee.id && s.clockOut === null);
    if (activeShift) {
        toast({ title: 'Error', description: 'Ya tienes un turno activo.', variant: 'destructive' });
        return;
    }

    const loc = locations.find(l => l.id === selectedLocationId);
    const now = new Date();

    addShift({ employeeId: identifiedEmployee.id, locationId: selectedLocationId, clockIn: now, clockOut: null, approved: false });
    
    // Voice Bot Announcement
    setIsSpeaking(true);
    const { message } = speakAttendance({
      name: identifiedEmployee.name,
      type: 'entrada',
      time: now,
      locationName: loc?.name,
      enabled: voiceEnabled,
    });
    setLastAnnouncement(message);
    setTimeout(() => setIsSpeaking(false), 5000);

    toast({ title: '✅ Entrada Registrada', description: `¡Bienvenido/a, ${identifiedEmployee.name.split(' ')[0]}!` });
    setIdentifiedEmployee(null);
  };

  const handleStartBreak = (breakType: 'coffee_morning' | 'lunch' | 'coffee_afternoon' | 'general', breakName: string) => {
    if (isInsideGeofence === false) {
      toast({ title: 'Ubicación Incorrecta', description: 'Debes estar en el local para marcar descanso.', variant: 'destructive' });
      return;
    }
    if (!identifiedEmployee) return;
    const activeShift = shifts?.find(s => s.employeeId === identifiedEmployee.id && s.clockOut === null);
    if (!activeShift) {
      toast({ title: 'Error', description: 'Debes iniciar tu turno antes de tomar un descanso.', variant: 'destructive' });
      return;
    }
    const hasOpenBreak = (activeShift.breaks || []).some(b => !b.end);
    if (hasOpenBreak) {
      toast({ title: 'Aviso', description: 'Ya tienes un descanso en curso.', variant: 'destructive' });
      return;
    }

    const now = new Date();
    const newBreak: ShiftBreak = {
      type: breakType,
      name: breakName,
      start: now,
      end: null,
    };

    const updatedBreaks = [...(activeShift.breaks || []), newBreak];
    const summary = calculateShiftBreakSummary(activeShift.clockIn, null, updatedBreaks, identifiedEmployee.hourlyRate || 0, now);

    updateShift(activeShift.id, { breaks: updatedBreaks });

    setIsSpeaking(true);
    const { message } = speakAttendance({
      name: identifiedEmployee.name,
      type: 'descanso_inicio',
      time: now,
      breakName,
      allowedMinutes: summary.allowedMinutes,
      enabled: voiceEnabled,
    });
    setLastAnnouncement(message);
    setTimeout(() => setIsSpeaking(false), 5000);

    toast({ 
      title: `☕ Salida a ${breakName}`, 
      description: `Iniciado a las ${formatTimeForVoice(now)}. Tienes ${summary.allowedMinutes}m permitidos según jornada.` 
    });
    setIdentifiedEmployee(null);
  };

  const handleEndBreak = () => {
    if (isInsideGeofence === false) {
      toast({ title: 'Ubicación Incorrecta', description: 'Debes estar en el local para registrar regreso.', variant: 'destructive' });
      return;
    }
    if (!identifiedEmployee) return;
    const activeShift = shifts?.find(s => s.employeeId === identifiedEmployee.id && s.clockOut === null);
    if (!activeShift) {
      toast({ title: 'Error', description: 'No tienes un turno activo.', variant: 'destructive' });
      return;
    }
    const openBreakIndex = (activeShift.breaks || []).findIndex(b => !b.end);
    if (openBreakIndex === -1) {
      toast({ title: 'Aviso', description: 'No tienes descansos pendientes por cerrar.', variant: 'destructive' });
      return;
    }

    const now = new Date();
    const openBreak = activeShift.breaks![openBreakIndex];
    const bStart = new Date(openBreak.start);
    const durationMinutes = Math.max(1, Math.round((now.getTime() - bStart.getTime()) / 60000));

    const updatedBreaks = activeShift.breaks!.map((b, idx) => {
      if (idx === openBreakIndex) {
        return {
          ...b,
          end: now,
          durationMinutes
        };
      }
      return b;
    });

    const summary = calculateShiftBreakSummary(activeShift.clockIn, null, updatedBreaks, identifiedEmployee.hourlyRate || 0, now);

    updateShift(activeShift.id, {
      breaks: updatedBreaks,
      totalBreakMinutes: summary.totalMinutes,
      allowedBreakMinutes: summary.allowedMinutes,
      excessBreakMinutes: summary.excessMinutes,
      shiftHoursCategory: summary.category,
    });

    setIsSpeaking(true);
    const { message } = speakAttendance({
      name: identifiedEmployee.name,
      type: 'descanso_fin',
      time: now,
      breakName: openBreak.name || 'descanso',
      breakMinutes: durationMinutes,
      excessMinutes: summary.excessMinutes,
      enabled: voiceEnabled,
    });
    setLastAnnouncement(message);
    setTimeout(() => setIsSpeaking(false), 5000);

    toast({ 
      title: summary.excessMinutes > 0 ? '⚠️ Regreso con Exceso' : '✅ Regreso Registrado', 
      description: `Duración: ${durationMinutes} min. ${summary.excessMinutes > 0 ? `Exceso acumulado: ${summary.excessMinutes} min.` : 'En regla.'}`,
      variant: summary.excessMinutes > 0 ? 'destructive' : 'default'
    });
    setIdentifiedEmployee(null);
  };

  const handleClockOut = () => {
    if (isInsideGeofence === false) {
        toast({ title: 'Ubicación Incorrecta', description: `Debes estar en el local para marcar salida.`, variant: 'destructive' });
        return;
    }
    if (!identifiedEmployee) return;
    const activeShift = shifts?.find(s => s.employeeId === identifiedEmployee.id && s.clockOut === null);
    if (!activeShift) {
        toast({ title: 'Error', description: 'No tienes un turno activo.', variant: 'destructive' });
        return;
    }

    const hasOpenBreak = (activeShift.breaks || []).some(b => !b.end);
    if (hasOpenBreak) {
      toast({ 
        title: 'Descanso en Curso', 
        description: 'Debes registrar el fin de tu descanso antes de marcar la salida definitiva del turno.', 
        variant: 'destructive' 
      });
      return;
    }

    const loc = locations.find(l => l.id === selectedLocationId);
    const now = new Date();

    const summary = calculateShiftBreakSummary(
      activeShift.clockIn,
      now,
      activeShift.breaks || [],
      identifiedEmployee.hourlyRate || 0,
      now
    );

    updateShift(activeShift.id, { 
      clockOut: now,
      shiftHoursCategory: summary.category,
      allowedBreakMinutes: summary.allowedMinutes,
      totalBreakMinutes: summary.totalMinutes,
      excessBreakMinutes: summary.excessMinutes,
    });

    // Voice Bot Announcement
    setIsSpeaking(true);
    const { message } = speakAttendance({
      name: identifiedEmployee.name,
      type: 'salida',
      time: now,
      locationName: loc?.name,
      enabled: voiceEnabled,
      excessMinutes: summary.excessMinutes,
    });
    setLastAnnouncement(message);
    setTimeout(() => setIsSpeaking(false), 5000);

    toast({ 
      title: '👋 Salida Registrada', 
      description: summary.excessMinutes > 0 
        ? `Turno finalizado (${summary.categoryLabel}). Se detectaron ${summary.excessMinutes}m de exceso en descansos.` 
        : `Turno finalizado exitosamente (${summary.categoryLabel}). Descansos en orden.` 
    });
    setIdentifiedEmployee(null);
  };

  const handleTestVoice = () => {
    setIsSpeaking(true);
    testVoiceBot();
    setLastAnnouncement('¡Hola! El asistente de voz está listo y configurado para confirmar entradas y salidas.');
    setTimeout(() => setIsSpeaking(false), 4000);
  };

  const lastAudioAlertTimeRef = useRef<Record<string, number>>({});
  const notifiedWhatsAppTiersRef = useRef<Record<string, boolean>>({});

  // Lista de colaboradores con confirmación de CEDI pendiente ahora mismo
  const pendingCediAlerts = useMemo(() => {
    if (!shifts || !locations || !employees) return [];
    const now = new Date();
    return shifts
      .filter((s) => s.clockOut === null)
      .map((shift) => {
        const loc = locations.find((l) => l.id === shift.locationId);
        const status = getNightConfirmationStatus(shift, loc, now);
        if (!status.isEligible || !status.isPromptActive || !status.activeTier) return null;
        const emp = employees.find((e) => e.id === shift.employeeId);
        return {
          shift,
          status,
          employee: emp,
        };
      })
      .filter(
        (item): item is { shift: ShiftWithId; status: ReturnType<typeof getNightConfirmationStatus>; employee: EmployeeWithId | undefined } =>
          item !== null
      );
  }, [shifts, locations, employees]);

  // Vigilancia y Cierre Automático para CEDI con Alarma Sonora, Voz y Disparo Automático Silencioso de WhatsApp
  useEffect(() => {
    if (!shifts || !locations) return;

    const sweepNightShifts = () => {
      const now = new Date();
      const nowMs = now.getTime();

      shifts.forEach((shift) => {
        if (shift.clockOut !== null) return;
        const loc = locations.find((l) => l.id === shift.locationId);
        const status = getNightConfirmationStatus(shift, loc, now);

        // 1. Cierre automático inmediato si venció la ventana de gracia
        if (status.isOverdueForAutoClose && status.autoCloseTime) {
          updateShift(shift.id, {
            clockOut: status.autoCloseTime,
            autoClosed: true,
            autoClosedReason: status.autoCloseReason,
          });
          return;
        }

        // 2. Alarma Sonora (Chime), Llamado por Voz y Disparo Automático en Segundo Plano
        if (status.isPromptActive && status.activeTier) {
          const emp = employees.find((e) => e.id === shift.employeeId);
          const shiftKey = `${shift.id}_tier_${status.activeTier}`;

          // Disparo automático en segundo plano (sin botones ni opciones en pantalla)
          if (!notifiedWhatsAppTiersRef.current[shiftKey] && emp?.phone) {
            notifiedWhatsAppTiersRef.current[shiftKey] = true;
            const deadlineTimeStr = status.graceDeadline
              ? formatTimeForVoice(new Date(status.graceDeadline))
              : 'próximos minutos';

            fetch('/api/notify-cedi', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phone: emp.phone,
                employeeName: emp.name,
                tierLabel: status.tierLabel,
                deadlineTimeStr,
                shiftId: shift.id,
                tier: status.activeTier,
              }),
            }).catch((err) => console.warn('Background WhatsApp dispatch warning:', err));
          }

          // Alarma sonora y voz cada 3 minutos + apertura automática en pantalla si está libre
          const lastAlertMs = lastAudioAlertTimeRef.current[shiftKey] || 0;
          if (nowMs - lastAlertMs > 3 * 60 * 1000) {
            lastAudioAlertTimeRef.current[shiftKey] = nowMs;
            playChimeSound();
            const empFirstName = emp?.name?.split(' ')[0] || 'Colaborador';
            const alertMsg = `Atención: ${empFirstName}, favor confirmar continuidad de turno en CEDI para evitar el cierre automático.`;
            speakCustomText(alertMsg, voiceEnabled);
            setLastAnnouncement(alertMsg);
            if (emp) {
              setIdentifiedEmployee((prev) => prev || emp);
              setSelectedLocationId((prev) => prev || shift.locationId);
            }
          }
        }
      });
    };

    sweepNightShifts();
    const intervalId = setInterval(sweepNightShifts, 30000);
    return () => clearInterval(intervalId);
  }, [shifts, locations, updateShift, employees, voiceEnabled]);

  const handleConfirmNightShift = (activeShift: ShiftWithId, tier: NightTier) => {
    if (!identifiedEmployee) return;
    const now = new Date();
    const existingConfirmations = activeShift.nightConfirmations || [];
    if (existingConfirmations.some(c => c.tier === tier)) {
      toast({ title: 'Aviso', description: 'Esta confirmación ya fue registrada.' });
      return;
    }

    const updated = [
      ...existingConfirmations,
      { tier, confirmedAt: now }
    ];

    updateShift(activeShift.id, {
      nightConfirmations: updated,
    });

    playChimeSound();
    setIsSpeaking(true);
    const msg = `Continuidad de turno confirmada para ${identifiedEmployee.name.split(' ')[0]}. Tu labor sigue activa en CEDI.`;
    speakCustomText(msg, voiceEnabled);
    setLastAnnouncement(msg);
    setTimeout(() => setIsSpeaking(false), 5000);

    toast({
      title: '✅ Continuidad de Turno Confirmada',
      description: `Confirmación (${tier}/3) registrada con éxito. Se ha evitado el cierre automático de turno.`,
    });
  };

  if (isLoading) {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-background">
            <div className="text-center text-muted-foreground p-4">
                <Loader2 className="mx-auto h-12 w-12 animate-spin" />
                <p className="mt-2 text-sm font-medium">Cargando aplicación...</p>
            </div>
        </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 h-screen">
      <div className="flex flex-col justify-center items-center p-4 bg-background overflow-y-auto">
        <Card className="w-full max-w-md shadow-md border-border">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-xl">Control de Asistencia</CardTitle>
                        <CardDescription>Reconocimiento facial y voz en español.</CardDescription>
                    </div>
                    <div className="flex items-center gap-1 bg-muted/60 px-2 py-1 rounded-full border border-border">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full text-foreground"
                            onClick={() => setVoiceEnabled(!voiceEnabled)}
                            title={voiceEnabled ? 'Desactivar voz' : 'Activar voz'}
                        >
                            {voiceEnabled ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={handleTestVoice}
                        >
                            <Bot className="h-3 w-3 mr-1 text-primary" /> Probar
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Banner Visual Permanente para Alertas CEDI (Opción 2) */}
                {pendingCediAlerts.length > 0 && (
                    <div className="p-3 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white rounded-lg shadow-md border border-amber-400 space-y-2 animate-pulse">
                        <div className="flex items-center gap-2">
                            <BellRing className="h-5 w-5 text-amber-200 animate-bounce shrink-0" />
                            <div>
                                <p className="text-xs font-black uppercase tracking-wider">
                                    ⚠️ Alerta Nocturna CEDI: Confirmación Requerida
                                </p>
                                <p className="text-[11px] text-amber-100 font-medium">
                                    {pendingCediAlerts.length} colaborador{pendingCediAlerts.length > 1 ? 'es' : ''} pendiente{pendingCediAlerts.length > 1 ? 's' : ''} de confirmar labor.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-1.5 pt-1">
                            {pendingCediAlerts.map(({ shift, status, employee }: any) => {
                                return (
                                    <div key={shift.id} className="bg-black/25 backdrop-blur-sm p-2 rounded flex items-center justify-between gap-2 border border-white/10 text-xs">
                                        <div className="flex flex-col">
                                            <span className="font-bold">{employee?.name || 'Colaborador'}</span>
                                            <span className="text-[10px] text-amber-200">
                                                {status.tierLabel} · Cierre en ~{status.minutesRemainingInGrace} min
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="h-7 px-2 text-[11px] bg-white/20 hover:bg-white/30 text-white border-white/30 shadow-sm"
                                                onClick={() => {
                                                    playChimeSound();
                                                    const empFirstName = employee?.name?.split(' ')[0] || 'Colaborador';
                                                    const alertMsg = `Atención: ${empFirstName}, favor confirmar continuidad de turno en CEDI para evitar el cierre automático.`;
                                                    setIsSpeaking(true);
                                                    speakCustomText(alertMsg, true);
                                                    setLastAnnouncement(alertMsg);
                                                    setTimeout(() => setIsSpeaking(false), 5000);
                                                    if (employee) {
                                                        setIdentifiedEmployee(employee);
                                                        setSelectedLocationId(shift.locationId);
                                                    }
                                                }}
                                                title="Simular identificación y escuchar alerta"
                                            >
                                                <Volume2 className="h-3 w-3 mr-1" /> Probar / Abrir
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {lastAnnouncement && (
                    <div className={cn(
                        "rounded-lg p-3 text-xs flex items-start gap-2.5 transition-all border",
                        isSpeaking ? "bg-primary/10 border-primary/40 text-foreground animate-pulse" : "bg-muted/50 border-border text-muted-foreground"
                    )}>
                        <Bot className={cn("h-4 w-4 mt-0.5 shrink-0", isSpeaking ? "text-primary" : "text-muted-foreground")} />
                        <div className="flex-1">
                            <span className="font-semibold text-foreground block text-[11px]">
                                {isSpeaking ? '🔊 Bot hablando:' : 'Última respuesta:'}
                            </span>
                            <p className="mt-0.5 italic">&ldquo;{lastAnnouncement}&rdquo;</p>
                        </div>
                    </div>
                )}

                <div className="relative w-full aspect-video rounded-md overflow-hidden bg-muted flex items-center justify-center border border-border">
                    <video ref={videoRef} autoPlay muted playsInline className={cn("w-full h-full object-cover", !isCameraReady && "hidden")} />
                    {isCameraReady && !modelsLoaded && (
                        <div className="absolute top-2 left-2 bg-background/85 backdrop-blur px-2.5 py-1 rounded-md text-[11px] text-muted-foreground border border-border flex items-center gap-1.5 shadow-sm">
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            <span>Conectando IA facial...</span>
                        </div>
                    )}
                    {isCameraReady && identifiedEmployee && (
                        <div className="absolute top-2 right-2 bg-emerald-600/90 text-white backdrop-blur px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 shadow-sm">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            <span>Rostro Verificado</span>
                        </div>
                    )}
                    {!isCameraReady && (
                        <div className="text-center p-4 space-y-2.5 max-w-xs">
                            {isCameraLoading || isInitializing ? (
                                <Loader2 className="mx-auto h-9 w-9 animate-spin text-primary" />
                            ) : (
                                <VideoOff className="mx-auto h-9 w-9 text-muted-foreground" />
                            )}
                            <div>
                                <p className="text-xs font-semibold text-foreground">
                                    {cameraError ? 'Acceso a cámara no disponible' : (isCameraLoading ? 'Conectando cámara...' : 'Cámara en espera')}
                                </p>
                                <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                                    {cameraError ? 'Activa los permisos de la cámara en tu navegador para continuar.' : detectionMessage}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2.5 text-xs"
                                    onClick={restartCamera}
                                >
                                    <RefreshCw className="h-3 w-3 mr-1" /> Reintentar cámara
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Muestra únicamente el colaborador reconocido por la cámara, sin lista ni selector desplegable */}
                {identifiedEmployee ? (
                    <div className="p-3.5 bg-emerald-50/90 dark:bg-emerald-950/40 rounded-lg border border-emerald-500/50 space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                <span>Colaborador Identificado</span>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                    setIdentifiedEmployee(null);
                                    setDetectionMessage('Apunta la cámara a tu rostro para identificarte.');
                                }}
                                title="Volver a escanear"
                            >
                                <RefreshCw className="h-3 w-3 mr-1" /> Volver a escanear
                            </Button>
                        </div>
                        
                        <div className="flex items-center justify-between p-2.5 bg-background/90 dark:bg-background/60 rounded-md border border-emerald-500/30">
                            <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-xs">
                                    {identifiedEmployee.name.charAt(0)}
                                </div>
                                <span className="font-semibold text-sm text-foreground">
                                    {identifiedEmployee.name}
                                </span>
                            </div>
                            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                                <ShieldCheck className="h-3 w-3" /> Verificado
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="p-3 bg-muted/40 rounded-lg border border-border flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                        </div>
                        <div className="text-xs flex-1">
                            <p className="font-semibold text-foreground">Reconocimiento Facial</p>
                            <p className="text-muted-foreground text-[11px] leading-snug">
                                Colócate frente a la cámara para identificar tu perfil y registrar tu marca.
                            </p>
                        </div>
                    </div>
                )}
                
                <Alert variant={identifiedEmployee ? 'default' : 'destructive'} className={cn("py-2 px-3", identifiedEmployee && "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700")}>
                    <div className="flex items-center justify-between">
                        <div>
                            <AlertTitle className="text-xs">{identifiedEmployee ? 'Personal Validado' : 'Estado'}</AlertTitle>
                            <AlertDescription className="text-sm font-bold uppercase tracking-wide truncate">
                                {identifiedEmployee ? identifiedEmployee.name : detectionMessage}
                            </AlertDescription>
                        </div>
                        {identifiedEmployee ? (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                                <ShieldCheck className="h-3 w-3" /> Biometría OK
                            </span>
                        ) : (
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                                Esperando rostro
                            </span>
                        )}
                    </div>
                </Alert>

                <Select onValueChange={setSelectedLocationId} value={selectedLocationId}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Seleccionar Ubicación" /></SelectTrigger>
                    <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>

                {/* Panel de Acciones Biométricas y Descansos */}
                {(() => {
                    const activeShift = identifiedEmployee ? shifts?.find(s => s.employeeId === identifiedEmployee.id && s.clockOut === null) : null;
                    const activeBreak = activeShift?.breaks?.find(b => !b.end);
                    const breakSummary = activeShift ? calculateShiftBreakSummary(activeShift.clockIn, null, activeShift.breaks || [], identifiedEmployee?.hourlyRate || 0) : null;
                    const shiftLocation = activeShift ? locations.find(l => l.id === activeShift.locationId) : locations.find(l => l.id === selectedLocationId);
                    const nightStatus = activeShift ? getNightConfirmationStatus(activeShift, shiftLocation, new Date()) : null;

                    if (!identifiedEmployee) {
                        return (
                            <div className="grid grid-cols-2 gap-2">
                                <Button 
                                    disabled 
                                    className="h-12 text-base font-semibold bg-muted text-muted-foreground"
                                >
                                    <LogIn className="mr-2 h-5 w-5" /> Entrada
                                </Button>
                                <Button 
                                    variant="outline" 
                                    disabled 
                                    className="h-12 text-base font-semibold"
                                >
                                    <LogOut className="mr-2 h-5 w-5" /> Salida
                                </Button>
                            </div>
                        );
                    }

                    if (!activeShift) {
                        return (
                            <div className="space-y-2">
                                <Button 
                                    onClick={handleClockIn} 
                                    disabled={!selectedLocationId || isInsideGeofence === false}
                                    className="w-full h-12 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
                                >
                                    <LogIn className="mr-2 h-5 w-5" /> Iniciar Turno (Entrada)
                                </Button>
                            </div>
                        );
                    }

                    if (activeBreak) {
                        return (
                            <div className="space-y-3">
                                <div className="p-3.5 bg-amber-500/15 border-2 border-amber-500/50 rounded-lg text-amber-950 dark:text-amber-200">
                                    <div className="flex items-center justify-between font-bold text-sm">
                                        <span className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                                            <Coffee className="h-4 w-4 text-amber-600 animate-bounce" /> 
                                            {activeBreak.name || 'Descanso'} en Curso
                                        </span>
                                        <span className="font-mono text-xs bg-amber-500/20 px-2 py-0.5 rounded">
                                            Iniciado: {formatTimeForVoice(new Date(activeBreak.start))}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                        Tiempo transcurrido estimado: <strong className="text-foreground">{Math.max(1, Math.round((new Date().getTime() - new Date(activeBreak.start).getTime()) / 60000))} min</strong>. Recuerda desinfectarte las manos al reincorporarte.
                                    </p>
                                </div>

                                <Button 
                                    onClick={handleEndBreak}
                                    disabled={isInsideGeofence === false}
                                    className="w-full h-13 text-base font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md animate-pulse"
                                >
                                    <CheckCircle2 className="mr-2 h-5 w-5" /> Regresar a Labores (Fin Descanso)
                                </Button>
                            </div>
                        );
                    }

                    return (
                        <div className="space-y-2.5">
                            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs">
                                <div className="flex items-center justify-between font-medium">
                                    <span className="text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 font-bold">
                                        <Clock className="h-3.5 w-3.5" /> Turno Activo (Entrada: {formatTimeForVoice(new Date(activeShift.clockIn))})
                                    </span>
                                    <span className="text-[11px] font-mono font-semibold text-muted-foreground">
                                        {breakSummary?.categoryLabel}
                                    </span>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-emerald-500/20">
                                    <span>Descansos tomados hoy: <strong className="text-foreground font-mono">{breakSummary?.totalMinutes || 0} min</strong></span>
                                    <span>Límite de descanso: <strong className="text-foreground font-mono">{breakSummary?.allowedMinutes || 30} min</strong></span>
                                </div>
                                {nightStatus?.isEligible && (
                                    <div className="mt-1 flex items-center justify-between text-[11px] text-amber-800 dark:text-amber-300 pt-1 border-t border-emerald-500/20 font-medium">
                                        <span className="flex items-center gap-1">
                                            <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
                                            CEDI Nocturno: {nightStatus.completedTiers.length}/3 confirmaciones
                                        </span>
                                        <span className="text-[10px] font-mono font-semibold text-muted-foreground">
                                            {nightStatus.completedTiers.length === 3 ? '✓ Verificado completo' : 'Monitoreo activo (>10 p.m.)'}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Alerta y Botón de Confirmación de Cierre Automático (CEDI) */}
                            {nightStatus?.isPromptActive && nightStatus.activeTier && (
                                <div className="p-3.5 bg-amber-500/15 border-2 border-amber-500 rounded-lg text-amber-950 dark:text-amber-200 space-y-2.5 shadow-sm">
                                    <div className="flex items-center gap-2 font-bold text-sm text-amber-800 dark:text-amber-300">
                                        <AlertTriangle className="h-4 w-4 text-amber-600 animate-bounce" />
                                        <span>⚠️ {NIGHT_SHIFT_UI.TITLE}</span>
                                    </div>
                                    <p className="text-xs text-foreground leading-relaxed">
                                        {NIGHT_SHIFT_UI.MESSAGE}
                                    </p>
                                    <div className="flex items-center justify-between text-[11px] bg-background/80 px-2.5 py-1.5 rounded border border-amber-500/30 font-medium">
                                        <span className="text-amber-900 dark:text-amber-200 font-semibold">{nightStatus.tierLabel}</span>
                                        <span className="font-mono text-amber-800 dark:text-amber-300 font-bold">
                                            Cierre en: ~{nightStatus.minutesRemainingInGrace} min
                                        </span>
                                    </div>
                                    <Button
                                        type="button"
                                        onClick={() => handleConfirmNightShift(activeShift, nightStatus.activeTier!)}
                                        className="w-full h-12 text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md animate-pulse"
                                    >
                                        <ShieldCheck className="mr-2 h-5 w-5" />
                                        {NIGHT_SHIFT_UI.BUTTON_TEXT}
                                    </Button>
                                </div>
                            )}

                            <Button 
                                type="button"
                                variant="outline"
                                onClick={() => handleStartBreak('general', 'Descanso')}
                                disabled={isInsideGeofence === false}
                                className="w-full h-11 text-sm font-bold border-amber-500/50 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-900 dark:text-amber-200"
                            >
                                <Coffee className="mr-2 h-4 w-4 text-amber-600" /> Descanso
                            </Button>

                            <Button 
                                onClick={handleClockOut} 
                                disabled={!selectedLocationId || isInsideGeofence === false}
                                variant="destructive"
                                className="w-full h-11 text-sm font-bold shadow-sm"
                            >
                                <LogOut className="mr-2 h-4 w-4" /> Salida Definitiva del Turno
                            </Button>
                        </div>
                    );
                })()}

                <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground border-t border-border">
                    <div className="flex items-center gap-2">
                        {gpsStatus === 'ready' && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">📍 GPS activo</span>
                        )}
                        <span>{voiceEnabled ? '🔊 Voz activa' : '🔇 Mudo'}</span>
                    </div>
                </div>
                
                {isInsideGeofence === false && (
                    <p className="text-[10px] text-center text-destructive font-bold uppercase animate-pulse">
                        Ubicación no autorizada para marcar.
                    </p>
                )}
            </CardContent>
        </Card>
      </div>
      <div className="hidden md:flex flex-col justify-center items-center bg-muted/50 p-10 gap-8">
        <div className="relative w-full max-w-xs h-40">
            {logoUrl && (
              <Image src={logoUrl} alt="Logo" fill className="object-contain" priority />
            )}
        </div>
        <DigitalClock />
        <Button asChild variant="link" className="text-muted-foreground absolute bottom-10">
            <Link href="/dashboard"><LogInIcon className="mr-2 h-4 w-4" /> Acceso Administrativo</Link>
        </Button>
      </div>
    </div>
  );
}
