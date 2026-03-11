import { useState } from "react";
import {
  BadgeDollarSign,
  BookOpen,
  CalendarCheck2,
  ChevronDown,
  GraduationCap,
  LayoutDashboard,
  Menu,
  School,
  Users,
  X,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "#" },
  { label: "Students", icon: GraduationCap, href: "#" },
  { label: "Teachers", icon: Users, href: "#" },
  { label: "Classes", icon: School, href: "#" },
  { label: "Attendance", icon: CalendarCheck2, href: "#" },
  { label: "Fees", icon: BadgeDollarSign, href: "#" },
  { label: "Exams", icon: BookOpen, href: "#" },
];

export default function DashboardShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-72 transform bg-slate-900 text-slate-100 transition-transform duration-200 lg:static lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-16 items-center justify-between border-b border-slate-700 px-5">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400">School ERP</p>
              <h2 className="text-lg font-semibold">Mayo College</h2>
            </div>
            <button
              type="button"
              className="rounded-md p-2 text-slate-300 hover:bg-slate-800 lg:hidden"
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
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
                >
                  <Icon size={18} />
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

        <div className="flex min-h-screen flex-1 flex-col lg:ml-0">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6">
            <button
              type="button"
              className="rounded-md border border-slate-200 p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu size={18} />
            </button>

            <h1 className="text-lg font-semibold text-slate-800">Dashboard</h1>

            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                  U
                </span>
                <span className="hidden sm:inline">User Profile</span>
                <ChevronDown size={16} />
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                  <button type="button" className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100">
                    My Account
                  </button>
                  <button type="button" className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100">
                    Settings
                  </button>
                  <button type="button" className="block w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                    Logout
                  </button>
                </div>
              )}
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6">{children || <div className="rounded-xl border border-slate-200 bg-white p-6">Select a module from the sidebar.</div>}</main>
        </div>
      </div>
    </div>
  );
}

