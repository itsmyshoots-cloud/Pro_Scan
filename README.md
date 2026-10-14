# Pro Scan

Production serial-number scanning system for mobile camera scanning.

## Stack
- Vite + React
- Supabase
- Mobile camera via browser BarcodeDetector with QR/barcode fallback
- Vercel-ready

## Environment
Create `.env.local` from `.env.example` and add the Supabase project URL and publishable/anon key.

Do not commit service-role keys or other secrets.

## V1.1
Production planning uses uploaded serial-batch quantity as the production requirement. Shift capacity is derived from production quantity/hour × available shift hours, with manpower stored on the plan.

V1.1 planner finalization in progress.
