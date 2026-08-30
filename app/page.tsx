import AuthGate from "@/components/AuthGate";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 p-5">
      <header className="flex items-baseline gap-3">
        <h1 className="text-2xl font-black uppercase tracking-tight">Skladron</h1>
        <p className="text-sm uppercase tracking-[0.2em] text-red-400">Складская оборона</p>
      </header>
      <AuthGate />
    </main>
  );
}
