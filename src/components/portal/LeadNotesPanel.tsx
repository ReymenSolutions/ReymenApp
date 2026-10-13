"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePreferences } from "@/context/preferences";
import { createNote, deleteNote } from "@/actions/notes";
import { formatDateTime } from "@/lib/utils";
import { getErrorMessage } from "@/lib/user-error";

interface NoteItem {
  id: string;
  content: string;
  createdAt: Date;
  authorName: string | null;
  canDelete: boolean;
}

export function LeadNotesPanel({ leadId, initialNotes }: { leadId: string; initialNotes: NoteItem[] }) {
  const { lang } = usePreferences();
  const [notes, setNotes] = useState(initialNotes);
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    const value = content.trim();
    if (!value) return;
    startTransition(async () => {
      try {
        const result = await createNote({ leadId, content: value });
        setNotes([{ id: result.noteId, content: value, createdAt: new Date(), authorName: lang === "es" ? "Tú" : "You", canDelete: true }, ...notes]);
        setContent("");
      } catch (e) {
        toast.error(getErrorMessage(e, (lang === "es" ? "Error al guardar la nota" : "Error saving note")));
      }
    });
  }

  function handleDelete(noteId: string) {
    startTransition(async () => {
      try {
        await deleteNote(noteId);
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
      } catch (e) {
        toast.error(getErrorMessage(e, (lang === "es" ? "Error al eliminar la nota" : "Error deleting note")));
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={lang === "es" ? "Escribe una nota..." : "Write a note..."}
          className="min-h-[70px] text-sm"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={handleAdd} disabled={isPending || !content.trim()}>
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {lang === "es" ? "Agregar nota" : "Add note"}
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="text-xs text-slate-400">{lang === "es" ? "Sin notas todavía" : "No notes yet"}</p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="rounded-md border border-slate-100 bg-slate-50 p-2.5">
              <p className="whitespace-pre-wrap text-sm text-slate-700">{note.content}</p>
              <div className="mt-1.5 flex items-center justify-between text-xs text-slate-400">
                <span>{note.authorName ?? "—"} · {formatDateTime(note.createdAt, lang)}</span>
                {note.canDelete && (
                  <button onClick={() => handleDelete(note.id)} disabled={isPending} className="hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
