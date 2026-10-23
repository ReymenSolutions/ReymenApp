import { redirect } from 'next/navigation'

// proxy.ts ya garantiza sesión + membresía activa antes de llegar aquí --
// esta ruta no muestra nada propio, solo entra directo al dashboard.
export default function RootPage() {
  redirect('/dashboard')
}
