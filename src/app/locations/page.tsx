'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { type LocationWithId } from '@/lib/data';
import { MapPin, PlusCircle, Pencil, Trash2, Navigation, Building2, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAppData } from '@/context/app-data-provider';
import { Badge } from '@/components/ui/badge';

const LocationMap = dynamic(() => import('@/components/location-map'), { ssr: false });

type LocationType = 'Punto de Venta' | 'CEDI';

interface NewLocationState {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  type: LocationType;
}

const initialNewLocationState: NewLocationState = {
  name: '',
  address: '',
  latitude: 0,
  longitude: 0,
  type: 'Punto de Venta',
};

export default function LocationsPage() {
  const { locations, addLocation, updateLocation, deleteLocation } = useAppData();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const [newLocation, setNewLocation] = useState<NewLocationState>(initialNewLocationState);
  const [editingLocation, setEditingLocation] = useState<LocationWithId | null>(null);

  const { toast } = useToast();

  const handleAddLocation = () => {
    if (!newLocation.name || !newLocation.address || !newLocation.type) {
      toast({ title: 'Error', description: 'Por favor, rellena todos los campos.', variant: 'destructive' });
      return;
    }
    addLocation({
      ...newLocation,
      latitude: Number(newLocation.latitude) || 0,
      longitude: Number(newLocation.longitude) || 0,
    });
    setNewLocation(initialNewLocationState);
    setIsAddDialogOpen(false);
    toast({ title: 'Ubicación Añadida', description: `${newLocation.name} ha sido añadida.` });
  };

  const handleEditLocation = () => {
    if (!editingLocation) return;
    if (!editingLocation.name || !editingLocation.address || !editingLocation.type) {
      toast({ title: 'Error', description: 'Por favor, introduce el nombre, dirección y tipo.', variant: 'destructive' });
      return;
    }
    updateLocation(editingLocation.id, {
      name: editingLocation.name,
      address: editingLocation.address,
      latitude: Number(editingLocation.latitude) || 0,
      longitude: Number(editingLocation.longitude) || 0,
      type: editingLocation.type as LocationType,
    });
    setIsEditDialogOpen(false);
    setEditingLocation(null);
    toast({ title: 'Ubicación Actualizada', description: `Los datos de ${editingLocation.name} han sido actualizados.` });
  };

  const getCurrentLocation = (isEditing: boolean) => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        if (isEditing && editingLocation) {
          setEditingLocation({ ...editingLocation, latitude, longitude });
        } else {
          setNewLocation({ ...newLocation, latitude, longitude });
        }
        toast({ title: 'Coordenadas Obtenidas', description: 'Se han capturado las coordenadas actuales.' });
      }, () => {
        toast({ title: 'Error de GPS', description: 'No se pudo obtener la ubicación actual.', variant: 'destructive' });
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold font-headline">Ubicaciones del Negocio</h1>
          <p className="text-muted-foreground">Gestiona puntos de venta y centros de distribución.</p>
        </div>
        <Button onClick={() => { setIsAddDialogOpen(true); setNewLocation(initialNewLocationState); }}>
          <PlusCircle className="mr-2 h-4 w-4" /> Añadir Ubicación
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {locations.map((location) => {
          const lat = location.latitude || 9.9281;
          const lon = location.longitude || -84.0907;

          return (
            <Card key={location.id} className="overflow-hidden flex flex-col">
              <CardHeader className="p-0">
                <div className="relative h-40 w-full group">
                   <LocationMap center={[lat, lon]} zoom={16} markers={[{ position: [lat, lon], label: location.name }]} />
                   <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors pointer-events-none" />
                </div>
              </CardHeader>
              <CardContent className="p-6 flex-grow space-y-3">
                <div className="flex justify-between items-start">
                  <CardTitle>{location.name}</CardTitle>
                  <Badge variant={location.type === 'CEDI' ? 'secondary' : 'default'}>
                    {location.type === 'CEDI' ? <Building2 className="mr-1 h-3 w-3" /> : <Store className="mr-1 h-3 w-3" />}
                    {location.type}
                  </Badge>
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <MapPin className="mr-2 h-4 w-4" />
                  <span>{location.address}</span>
                </div>
                {location.latitude && (
                   <div className="flex items-center text-xs text-primary font-mono bg-primary/10 p-2 rounded">
                    <Navigation className="mr-2 h-3 w-3" />
                    <span>Lat: {location.latitude.toFixed(5)}, Lon: {location.longitude?.toFixed(5)}</span>
                  </div>
                )}
              </CardContent>
              <CardFooter className="bg-muted/50 p-2 flex justify-end gap-2">
                <Button variant="ghost" size="icon" onClick={() => { setEditingLocation(location); setIsEditDialogOpen(true); }}>
                  <Pencil className="h-4 w-4 text-primary" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar {location.name}?</AlertDialogTitle>
                      <AlertDialogDescription>Esta acción es irreversible.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteLocation(location.id)}>Eliminar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>Añadir Nueva Ubicación</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2"><Label>Nombre</Label><Input value={newLocation.name} onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Tipo de Ubicación</Label>
              <Select 
                value={newLocation.type} 
                onValueChange={(val: LocationType) => setNewLocation({...newLocation, type: val})}
              >
                <SelectTrigger><SelectValue placeholder="Selecciona tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Punto de Venta">Punto de Venta (Límite 42h/semanal)</SelectItem>
                  <SelectItem value="CEDI">CEDI (Límite 42h/semanal)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Dirección</Label><Input value={newLocation.address} onChange={(e) => setNewLocation({ ...newLocation, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Latitud</Label><Input type="number" step="any" value={newLocation.latitude} onChange={(e) => setNewLocation({ ...newLocation, latitude: parseFloat(e.target.value) || 0 })} /></div>
              <div className="space-y-2"><Label>Longitud</Label><Input type="number" step="any" value={newLocation.longitude} onChange={(e) => setNewLocation({ ...newLocation, longitude: parseFloat(e.target.value) || 0 })} /></div>
            </div>
            <Button variant="outline" size="sm" onClick={() => getCurrentLocation(false)} className="w-full">
              <Navigation className="mr-2 h-4 w-4" /> Capturar Mi Posición Actual
            </Button>
          </div>
          <DialogFooter><Button onClick={handleAddLocation}>Añadir</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>Editar Ubicación</DialogTitle></DialogHeader>
          {editingLocation && (
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><Label>Nombre</Label><Input value={editingLocation.name} onChange={(e) => setEditingLocation({ ...editingLocation, name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Tipo de Ubicación</Label>
                <Select 
                  value={editingLocation.type as LocationType} 
                  onValueChange={(val: LocationType) => setEditingLocation({...editingLocation, type: val})}
                >
                  <SelectTrigger><SelectValue placeholder="Selecciona tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Punto de Venta">Punto de Venta (Límite 42h/semanal)</SelectItem>
                    <SelectItem value="CEDI">CEDI (Límite 42h/semanal)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Dirección</Label><Input value={editingLocation.address} onChange={(e) => setEditingLocation({ ...editingLocation, address: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Latitud</Label><Input type="number" step="any" value={editingLocation.latitude ?? 0} onChange={(e) => setEditingLocation({ ...editingLocation, latitude: parseFloat(e.target.value) || 0 })} /></div>
                <div className="space-y-2"><Label>Longitud</Label><Input type="number" step="any" value={editingLocation.longitude ?? 0} onChange={(e) => setEditingLocation({ ...editingLocation, longitude: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              <Button variant="outline" size="sm" onClick={() => getCurrentLocation(true)} className="w-full">
                <Navigation className="mr-2 h-4 w-4" /> Capturar Mi Posición Actual
              </Button>
            </div>
          )}
          <DialogFooter><Button onClick={handleEditLocation}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}