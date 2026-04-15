import { Link, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getRoleHomePath } from "../utils/roleRoutes";

export default function Unauthorized() {
  const location = useLocation();
  const { user } = useAuth();
  const requestedPath = location.state?.from?.pathname || null;

  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="rounded-2xl bg-amber-50 p-3 text-amber-600">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900">Access Restricted</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your current role does not have permission to open this page.
          </p>
          <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
            <p>
              Signed in as: <span className="font-semibold capitalize">{user?.role || "User"}</span>
            </p>
            {requestedPath ? (
              <p>
                Requested page: <span className="font-mono text-xs text-slate-900">{requestedPath}</span>
              </p>
            ) : null}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to={getRoleHomePath(user)}
              className="rounded-lg bg-[#002366] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0b2a66]"
            >
              Back to Dashboard
            </Link>
            <Link
              to="/login"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Switch Account
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
