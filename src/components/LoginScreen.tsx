import { LogIn } from "lucide-react";
import type React from "react";
import { useState } from "react";

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<void>;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await onLogin(email, password);
    } catch {
      setError("Não foi possível entrar. Confira e-mail e senha.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef3f8] px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-normal text-cyan-700">CRM Kanban</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">Acesse sua operação comercial</h1>
          <p className="mt-2 text-sm text-slate-500">
            Gestores visualizam todo o funil. Vendedores acessam suas próprias oportunidades.
          </p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-normal text-slate-500">E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-500 focus:bg-white"
            required
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-normal text-slate-500">Senha</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-500 focus:bg-white"
            required
          />
        </label>
        {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          <LogIn size={17} />
          {isSubmitting ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
