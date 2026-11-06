'use client';

import { useState, useRef } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAppData } from '@/context/app-data-provider';
import { Timestamp } from 'firebase/firestore';

function ActiveShiftsTable() {
    const { employees, locations, shifts } = useAppData();
    
    const activeShifts = shifts ? shifts.filter((shift) => !shift.clockOut) : [];

    const getShiftDuration = (clockIn: any) => {
        if (!clockIn) return '';
        const clockInDate = clockIn instanceof Timestamp ? clockIn.toDate() : new Date(clockIn);
        return formatDistanceToNow(clockInDate, { addSuffix: true, locale: es });
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Tiempo en Turno</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {activeShifts.length > 0 ? (
                    activeShifts.map((shift) => {
                        const employee = employees.find((e) => e.id === shift.employeeId);
                        const location = locations.find((l) => l.id === shift.locationId);
                        return (
                            <TableRow key={shift.id}>
                                <TableCell className="font-medium">{employee?.name}</TableCell>
                                <TableCell>{location?.name}</TableCell>
                                <TableCell>
                                    {getShiftDuration(shift.clockIn)}
                                </TableCell>
                            </TableRow>
                        );
                    })
                ) : (
                    <TableRow>
                        <TableCell colSpan={3} className="text-center">
                            No hay empleados en turno actualmente.
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    );
}

export default function DashboardPage() {
  const { setLogoUrl } = useAppData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  const handleLogoUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          setLogoUrl(result);
          toast({
            title: 'Logo Actualizado',
            description: 'El nuevo logo ha sido cargado exitosamente.',
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-6">
        
        <Card>
          <CardHeader>
            <CardTitle>Configuración del Logo</CardTitle>
            <CardDescription>Sube una imagen desde tu dispositivo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept="image/*"
            />
            <Button onClick={handleLogoUploadClick}>
              <ImageIcon className="mr-2 h-4 w-4" /> Subir Logo
            </Button>
          </CardContent>
        </Card>

      </div>

      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Actualmente en Turno</CardTitle>
            <CardDescription>
              Empleados que están actualmente en turno en todas las ubicaciones.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActiveShiftsTable />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
