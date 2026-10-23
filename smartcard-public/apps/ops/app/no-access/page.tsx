export default function NoAccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">Sin acceso todavía</h1>
      <p className="text-sm text-neutral-600">
        Tu cuenta existe, pero no tiene ninguna membresía activa en una empresa de REYMEN Ops. Si
        recibiste una invitación, revisa tu correo; si crees que esto es un error, contacta al
        dueño de tu cuenta o a soporte de REYMEN.
      </p>
    </main>
  )
}
