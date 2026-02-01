import { Sidebar } from "@/components/sidebar";
import { DateFilters } from "@/components/date-filters";
import { AuthGate } from "@/components/auth-gate";
import { UserMenu } from "@/components/user-menu";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar />
        <div className="flex w-full flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Panel BI</h1>
              <p className="text-xs text-slate-500">
                Insights de ventas y cartera por cliente
              </p>
            </div>
            <div className="flex items-center gap-4">
              <DateFilters />
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 px-8 py-6">{children}</main>
        </div>
      </div>
    </AuthGate>
  );
}
