import Link from "next/link";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/customers", label: "Cliente 360" },
  { href: "/alerts", label: "Alertas" },
  { href: "/ai", label: "AI Copilot" },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-64 flex-col gap-6 border-r border-slate-200 bg-white px-6 py-8">
      <div className="text-xl font-semibold tracking-tight text-slate-900">
        NITIQ
      </div>
      <nav className="flex flex-col gap-2 text-sm text-slate-600">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-2 transition hover:bg-slate-100 hover:text-slate-900"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto text-xs text-slate-400">Multi-tenant BI</div>
    </aside>
  );
}
