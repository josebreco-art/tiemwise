'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { useAppData } from '@/context/app-data-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

export default function HolidaysPage() {
  const { holidays, addHoliday, deleteHoliday } = useAppData();
  const [newHolidayName, setNewHolidayName] = useState('');
  const { toast } = useToast();

  const holidayDates = holidays.map(h => h.date);

  const handleDayClick = (day: Date, modifiers: any) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const isSelected = !!modifiers.selected;

    if (isSelected) {
      const holiday = holidays.find(h => format(h.date, 'yyyy-MM-dd') === dayStr);
      if (holiday) {
        deleteHoliday(holiday.id);
        toast({
          title: 'Feriado Eliminado',
          description: `El día ${dayStr} ha sido eliminado de la lista de feriados.`,
          variant: 'destructive',
        });
      }
    } else {
      if (!newHolidayName) {
        toast({
          title: 'Error',
          description:
            'Por favor, introduce un nombre para el feriado antes de seleccionar una fecha.',
          variant: 'destructive',
        });
        return;
      }
      addHoliday({ name: newHolidayName, date: day });
      toast({
        title: 'Feriado Añadido',
        description: `${newHolidayName} (${dayStr}) ha sido añadido.`,
      });
      setNewHolidayName('');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Gestionar Días Feriados</CardTitle>
          <CardDescription>
            Selecciona los días en el calendario para marcarlos como feriados.
            Estos días se usarán para calcular el pago doble.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-8 items-start">
          <div className="flex-grow flex justify-center">
            <Calendar
              mode="multiple"
              selected={holidayDates}
              onDayClick={handleDayClick}
              className="rounded-md border"
            />
          </div>
          <div className="w-full md:w-80 space-y-4">
             <div>
              <Label htmlFor="holiday-name" className="mb-2 block">
                Nombre del Feriado
              </Label>
              <Input
                id="holiday-name"
                value={newHolidayName}
                onChange={e => setNewHolidayName(e.target.value)}
                placeholder="p. ej. Día de la Madre"
              />
              <p className="text-sm text-muted-foreground mt-2">
                Introduce un nombre y luego haz clic en una fecha del calendario para añadir un nuevo feriado.
              </p>
            </div>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Feriados Guardados</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {holidays.length > 0 ? (
                    holidays
                      .sort((a, b) => a.date.getTime() - b.date.getTime())
                      .map(holiday => (
                        <li key={holiday.id} className="text-sm flex justify-between items-center">
                           <span>{format(holiday.date, 'dd MMMM', { locale: es })} - <span className="text-muted-foreground">{holiday.name}</span></span>
                           <Button variant="ghost" size="sm" onClick={() => deleteHoliday(holiday.id)}>X</Button>
                        </li>
                      ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No hay feriados guardados.
                    </p>
                  )}
                </ul>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
