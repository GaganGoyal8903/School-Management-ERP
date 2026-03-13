import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Menu, Search } from "lucide-react";
import CrestLogo from "./CrestLogo";

export default function Header({ title = "Dashboard", showMenuButton = false, onMenuClick }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    // Clear all localStorage items
    localStorage.removeItem("sms_token");
    localStorage.removeItem("sms_user");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("sms_token");
    sessionStorage.removeItem("sms_user");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    setOpen(false);
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-30 bg-[#002366] px-3 text-[#fffbf2] md:px-6">
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {showMenuButton && (
            <button
              type="button"
              onClick={onMenuClick}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#C5A059] text-[#C5A059] hover:bg-[#1f3a75] lg:hidden"
              aria-label="Open sidebar"
            >
              <Menu size={18} />
            </button>
          )}

          <CrestLogo sizeClass="h-10 w-10" />
          <p className="truncate text-base font-semibold text-white" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Mayo College
          </p>
        </div>

        <div className="relative hidden w-full max-w-md md:block">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#C5A059]" />
          <input
            type="text"
            placeholder="Quick Search Students/Staff"
            className="w-full rounded-lg border border-[#C5A059] bg-[#fffbf2] py-2 pl-9 pr-3 text-sm text-slate-800 outline-none focus:ring-4 focus:ring-[#C5A059]/20"
          />
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#C5A059] bg-[#fffbf2] px-2.5 py-1.5 text-[#002366]"
            aria-label="User menu"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#C5A059] bg-[#002366] text-xs font-semibold text-[#fffbf2]">
              U
            </span>
            <span className="hidden text-xs font-semibold sm:inline">{title}</span>
            <ChevronDown size={15} />
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-32 rounded-lg border border-[#C5A059] bg-[#fffff0] p-1 shadow-lg">
              <button
                type="button"
                onClick={handleLogout}
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-[#fff7e6]"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="h-px w-full bg-[#C5A059]" />
    </header>
  );
}
