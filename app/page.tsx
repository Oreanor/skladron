import AuthGate from "@/components/AuthGate";

export default function Home() {
  // Заголовок и аккаунт живут внутри лобби, одной строкой со счётчиками:
  // отдельная шапка над игрой только съедала бы высоту карты.
  return (
    <main className="mx-auto flex h-[100dvh] w-full max-w-6xl flex-col p-2 sm:p-3 lg:p-5">
      <div className="flex min-h-0 flex-1 flex-col">
        <AuthGate />
      </div>
    </main>
  );
}
