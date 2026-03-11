import { useState } from "react";
import { GraduationCap, Settings, UserCog, Users2, WalletCards, X } from "lucide-react";
import GlobalHeader from "./GlobalHeader";
import CrestLogo, { MAYO_CREST_URL } from "./CrestLogo";

const navItems = [
  { label: "User Management", icon: UserCog, href: "#" },
  { label: "Fee Records", icon: WalletCards, href: "#" },
  { label: "System Settings", icon: Settings, href: "#" },
];

const cards = [
  { label: "Total Students", value: "1,248", icon: GraduationCap },
  { label: "Staff Count", value: "154", icon: Users2 },
  { label: "Today's Revenue", value: "INR 2,45,000", icon: WalletCards },
  { label: "Active Notices", value: "12", icon: Settings },
];

const noticeItems = [
  { id: "NB-1", text: "Board meeting at 4:00 PM in the principal's office." },
  { id: "NB-2", text: "Fee reconciliation closes today at 6:00 PM." },
  { id: "NB-3", text: "Annual day rehearsal schedule has been updated." },
];

export default function AdminDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f7f7f2] text-slate-900">
      <div className="flex min-h-screen">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-72 transform bg-[#002366] text-slate-100 transition-transform duration-200 lg:static lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-16 items-center justify-between border-b border-[#c5a059] px-5">
            <div className="flex items-center gap-2">
              <CrestLogo sizeClass="h-10 w-10" className="border-2 border-[#c5a059] bg-[#fffbf2]" imgClassName="h-full w-full rounded-full object-contain p-0.5" />
              <h2 className="text-lg font-semibold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                Admin Panel
              </h2>
            </div>
            <button
              type="button"
              className="rounded-md p-2 text-[#c5a059] hover:bg-[#1f3a75] lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <X size={18} />
            </button>
          </div>

          <nav className="space-y-1 p-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.label}
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-[#1f3a75]"
                >
                  <Icon size={18} color="#c5a059" />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>
        </aside>

        {sidebarOpen && (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar overlay"
          />
        )}

        <section className="flex min-h-screen flex-1 flex-col">
          <GlobalHeader title="Admin" showMenuButton onMenuClick={() => setSidebarOpen(true)} />

          <main className="p-4 md:p-6">
            <div className="mb-5">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                Admin Dashboard
              </h1>
              <p className="mt-1 text-sm text-slate-600">Overview of school operations and strategic controls.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.label} className="rounded-xl border border-[#c5a059] bg-[#fffff0] p-4 shadow-lg">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm text-slate-500">{item.label}</p>
                      <Icon size={18} color="#c5a059" />
                    </div>
                    <h2 className="mt-2 text-2xl font-bold text-slate-900">{item.value}</h2>
                  </article>
                );
              })}
            </div>

            <article className="relative mt-4 overflow-hidden rounded-xl border-2 border-[#c5a059] bg-[#fffbf2] p-4 shadow-sm">
              <img
                src={MAYO_CREST_URL}
                alt="Crest watermark"
                className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full object-contain opacity-10"
              />

              <div className="relative z-10 mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  Notice Board
                </h3>
                <span className="rounded-full border border-[#d8c08a] bg-[#fff7e6] px-2.5 py-1 text-xs font-semibold text-[#8a6d3b]">Formal Bulletin</span>
              </div>

              <ul className="relative z-10 space-y-2">
                {noticeItems.map((item) => (
                  <li key={item.id} className="rounded-lg border border-[#d8c08a] bg-[#fffdf6] px-3 py-2 text-sm text-slate-700">
                    {item.text}
                  </li>
                ))}
              </ul>
            </article>
          </main>
        </section>
      </div>
    </div>
  );
}

