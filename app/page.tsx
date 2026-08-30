import AuthGate from "@/components/AuthGate";

export default function Home() {
  return (
    <main className="mx-auto flex h-[100dvh] w-full max-w-6xl flex-col gap-3 p-2 sm:p-3 lg:h-auto lg:min-h-screen lg:gap-5 lg:p-5">
      {/* заголовок съедает высоту карты, поэтому на телефоне его нет */}
      <header className="hidden items-baseline gap-3 lg:flex">
        <h1 className="text-2xl font-black uppercase tracking-tight">Skladron</h1>
        <p className="text-sm uppercase tracking-[0.2em] text-red-400">Складская оборона</p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:block lg:flex-none">
        <AuthGate />
      </div>
    </main>
  );
}
