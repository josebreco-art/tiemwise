# Guía de Mantenimiento - TimeWise Dining

Este documento detalla la arquitectura técnica y la lógica de negocio para facilitar el mantenimiento y escalabilidad.

## 1. Stack Tecnológico
- **Frontend**: Next.js 14 (App Router), React 18, Tailwind CSS.
- **Base de Datos**: Firebase Cloud Firestore.
- **Biometría**: face-api.js para reconocimiento facial en el navegador.

## 2. Requisitos de Migración (GCP / App Hosting)
Para un despliegue exitoso en Google Cloud:
1.  **Secret Manager API**: DEBE estar habilitada en la consola de Google Cloud (`secretmanager.googleapis.com`).
2.  **Developer Connect**: Asegurar que la API esté activa para vincular el repositorio.
3.  **Configuración Standalone**: El proyecto usa `output: 'standalone'` en `next.config.mjs`.
4.  **Parche de Webpack**: Se han añadido fallbacks en `next.config.mjs` para ignorar los módulos `fs`, `encoding` y `canvas` en el cliente, permitiendo que `face-api.js` funcione sin errores de resolución de módulos.

## 3. Lógica del Motor de Cálculos (`src/lib/calculations.ts`)
### Regla del Jueves (ISO-8601)
Una semana completa se asigna al mes que contenga su **Jueves**. Esto asegura que el aguinaldo y los promedios mensuales se basen en periodos laborales completos y no en cortes de calendario arbitrarios. El salario se calcula estrictamente de Lunes a Domingo.

### Jornada Laboral
- **General**: Máximo 8h regulares diarias.
- **Tope Semanal**: 42 horas para todas las ubicaciones (POS y CEDI).
- **Tiempo Extra**: Cualquier exceso diario sobre 8h o semanal sobre 42h se contabiliza a 1.5x. Excesos sobre 60h semanales se pagan a 2.0x.

### Feriados
- **Trabajados**: Se pagan doble (2x) y NO cuentan para el tope de horas regulares semanales.
- **No Trabajados**: Se pagan sencillo (8h) si el feriado cae de lunes a sábado.

## 4. Estructura de Datos Crítica
- `/payslips`: Guarda los comprobantes "congelados". El cálculo de Aguinaldo y Estado de Cuenta **prioriza estos registros** sobre las marcas brutas para garantizar coherencia con lo pagado.
- `Employee.manualSalaries`: Objeto que almacena salarios de meses previos a la implementación de la app.

## 5. Solución de Problemas
Si el build falla en producción, verifique que `next.config.mjs` contenga los fallbacks de Webpack para módulos de Node.js.