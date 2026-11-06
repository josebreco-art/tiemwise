'use client';

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, VideoOff, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface FaceCaptureProps {
  onFaceCaptured: (descriptor: Float32Array | null) => void;
  initialDescriptor?: string;
}

export interface FaceCaptureHandle {
  reset: () => void;
}

const FaceCapture = forwardRef<FaceCaptureHandle, FaceCaptureProps>(({ onFaceCaptured, initialDescriptor }, ref) => {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [isInitializing, setIsInitializing] = useState(true);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [hasCaptured, setHasCaptured] = useState(!!initialDescriptor);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  
  const streamRef = useRef<MediaStream | null>(null);
  const faceapiRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    reset() {
      setHasCaptured(!!initialDescriptor);
      stopCamera();
    },
  }));

  useEffect(() => {
    const loadModels = async () => {
      if (modelsLoaded) {
        setIsInitializing(false);
        return;
      }

      setIsInitializing(true);
      
      try {
        // Importación dinámica obligatoria para evitar que node-fetch intente cargar 'encoding'
        // durante el proceso de build de Next.js
        faceapiRef.current = await import('face-api.js');
        
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
        await Promise.all([
          faceapiRef.current.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapiRef.current.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapiRef.current.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
      } catch (error) {
        console.error("Error loading models:", error);
      } finally {
        setIsInitializing(false);
      }
    };
    
    if (typeof window !== 'undefined') {
      loadModels();
    }
  }, [modelsLoaded]);
  
  useEffect(() => {
    setHasCaptured(!!initialDescriptor);
  }, [initialDescriptor]);
  
  const stopCamera = () => {
      if(streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setIsCameraActive(false);
  }

  const startCamera = async () => {
    setIsCameraActive(true);

    try {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;
      setHasCameraPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(() => {});
          };
        }
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setHasCameraPermission(false);
      setIsCameraActive(false);
      toast({
        title: "Cámara no disponible",
        description: "No se pudo acceder a la cámara. Por favor autoriza los permisos en tu navegador.",
        variant: "destructive"
      });
    }
  };

  const handleCaptureFace = async () => {
    if (!modelsLoaded || !faceapiRef.current) {
      toast({
        title: "Preparando IA biométrica",
        description: "Los modelos de detección se están conectando. Espera un momento y vuelve a presionar Capturar.",
        variant: "destructive"
      });
      return;
    }

    if (!videoRef.current) return;

    try {
      const detections = await faceapiRef.current.detectSingleFace(
        videoRef.current, 
        new faceapiRef.current.TinyFaceDetectorOptions()
      ).withFaceLandmarks().withFaceDescriptor();

      if (detections) {
          onFaceCaptured(detections.descriptor);
          setHasCaptured(true);
          toast({ title: 'Rostro Capturado', description: 'La firma facial ha sido guardada exitosamente.' });
          stopCamera();
      } else {
          toast({ title: 'No se detectó rostro', description: 'Asegúrate de que tu rostro esté bien iluminado y centrado.', variant: 'destructive' });
      }
    } catch (err) {
      console.error("Face capture error:", err);
    }
  };


  if (hasCaptured) {
      return (
        <Alert variant="default" className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800">Rostro Registrado</AlertTitle>
          <AlertDescription className="text-green-700">
            Este empleado ya tiene una firma facial guardada.
            <Button variant="link" className="p-0 h-auto ml-2 text-green-800" onClick={() => { setHasCaptured(false); onFaceCaptured(null); }}>
                Volver a capturar
            </Button>
          </AlertDescription>
        </Alert>
      )
  }

  if (!isCameraActive) {
    return (
        <div className="space-y-2">
            <Button type="button" onClick={startCamera} disabled={isInitializing || !modelsLoaded}>
                {isInitializing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                Activar Cámara para Registro Facial
            </Button>
            {hasCameraPermission === false && (
                 <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Permiso de Cámara Requerido</AlertTitle>
                    <AlertDescription>
                        Debes permitir el acceso a la cámara en la configuración de tu navegador para continuar.
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative w-full aspect-video rounded-md overflow-hidden bg-muted flex items-center justify-center">
        <video 
          ref={videoRef} 
          autoPlay 
          muted 
          playsInline 
          className="w-full h-full object-cover"
        />
      </div>
      <Alert variant="default">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Cámara Activa</AlertTitle>
        <AlertDescription>
          Apunta la cámara a tu rostro para capturar. Asegúrate de que esté bien iluminado y centrado.
        </AlertDescription>
      </Alert>
      <div className="flex gap-2">
        <Button type="button" onClick={handleCaptureFace}>
          <Camera className="mr-2 h-4 w-4" /> Capturar Rostro
        </Button>
        <Button type="button" variant="outline" onClick={stopCamera}>
          Cerrar Cámara
        </Button>
      </div>
    </div>
  );
});

FaceCapture.displayName = 'FaceCapture';
export default FaceCapture;
