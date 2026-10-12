import { notFound } from "next/navigation";
import { getPublicFeedback } from "@/lib/feedback";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";

// Formulario público de opinión: el cliente llega desde un enlace con token único, sin cuenta.
export const dynamic = "force-dynamic";
export const metadata = { title: "Tu opinión", robots: { index: false, follow: false } };

export default async function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getPublicFeedback(token);
  if (!view) notFound();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <FeedbackForm token={token} view={view} />
    </main>
  );
}
