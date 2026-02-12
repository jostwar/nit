import { Sidebar } from "@/components/sidebar";
import { DateFilters } from "@/components/date-filters";
import { AuthGate } from "@/components/auth-gate";
import { UserMenu } from "@/components/user-menu";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-screen min-w-0 bg-slate-50">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="relative border-b border-slate-200 bg-slate-50/80 px-4 py-4 pl-4 pr-24 sm:px-6 sm:pr-28 md:px-8 md:pr-32">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 shrink-0">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">Panel BI</h1>
                <p className="mt-0.5 text-xs text-slate-500">
                  Insights de ventas y cartera por cliente
                </p>
              </div>
              <div className="min-w-0 max-w-4xl flex-1 lg:flex-none">
                <DateFilters />
              </div>
            </div>
            {/* Menú usuario siempre en esquina superior derecha */}
            <div className="fixed right-4 top-4 z-50 sm:right-6 md:right-8">
              <UserMenu />
            </div>
          </header>
          <main className="min-w-0 flex-1 overflow-x-auto px-4 py-6 pl-4 pr-24 sm:pl-6 sm:pr-28 md:pl-8 md:pr-32">{children}</main>
        </div>
      </div>
    </AuthGate>
  );
}
