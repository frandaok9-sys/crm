"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InitialsAvatar } from "@/components/initials-avatar";
import { AssistantMessage } from "@/components/assistant-message";
import { askAssistant } from "@/app/(app)/asistente/actions";

type Message = { role: "user" | "assistant"; content: string; error?: boolean };

const GREETING =
  "Hola, soy el asistente del CRM. Preguntame por tus clientes, oportunidades, presupuestos, métricas o cobranzas.";

const SUGGESTIONS = [
  "¿Cómo viene mi cartera?",
  "Oportunidades en Propuesta enviada",
  "Presupuestos aprobados este mes",
];

export function AssistantChat({ userName }: { userName: string }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isPending]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");

    startTransition(async () => {
      const result = await askAssistant(history, trimmed);
      if ("error" in result) {
        setMessages((prev) => [...prev, { role: "assistant", content: result.error, error: true }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: result.reply }]);
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[12px] border bg-card">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((m, i) => (
          <ChatBubble key={i} message={m} userName={userName} />
        ))}
        {isPending && (
          <ChatBubble
            message={{ role: "assistant", content: "…" }}
            userName={userName}
            thinking
          />
        )}
      </div>

      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 border-t border-border2 px-5 py-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-[10px] border border-border2 bg-chip px-3 py-1.5 text-[12.5px] text-text2 transition-colors hover:bg-hoverbg"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2.5 border-t border-border2 p-3.5"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder="Escribí tu consulta…"
          className="max-h-32 flex-1 resize-none rounded-[10px] border border-border bg-field px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted2 focus:border-muted-foreground"
        />
        <Button type="submit" size="cta" disabled={isPending || !input.trim()}>
          Enviar
        </Button>
      </form>
    </div>
  );
}

function ChatBubble({
  message,
  userName,
  thinking,
}: {
  message: Message;
  userName: string;
  thinking?: boolean;
}) {
  const isUser = message.role === "user";
  // Solo el asistente (respuesta real, no error ni "pensando") usa la plantilla
  // gráfica; usuario/errores van como texto plano.
  const rich = !isUser && !message.error && !thinking;
  return (
    <div className={cn("flex items-start gap-2.5", isUser && "flex-row-reverse")}>
      {isUser ? (
        <InitialsAvatar name={userName} size={28} />
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
          IA
        </span>
      )}
      <div
        className={cn(
          "min-w-0 rounded-[12px] px-3.5 py-2.5 text-[13.5px] leading-relaxed",
          rich ? "max-w-[88%]" : "max-w-[75%] whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground"
            : message.error
              ? "bg-destructive/10 text-destructive"
              : "bg-card2 text-text1",
          thinking && "text-muted-foreground italic"
        )}
      >
        {rich ? <AssistantMessage content={message.content} /> : message.content}
      </div>
    </div>
  );
}
