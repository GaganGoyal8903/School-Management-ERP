import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { LogIn } from "lucide-react";
import CrestLogo from "./CrestLogo";
import { login } from "../services/api";

const sms_roleOptions = ["Admin", "Teacher", "Student", "Parent"];
const sms_bgImageUrl = "https://www.mayocollege.com/wp-content/uploads/2021/04/Mayo_Main_Building_Ajmer.jpg";

export default function MultiRoleLoginPage({ initialMode = "login" }) {
  const navigate = useNavigate();
  const [sms_mode, sms_setMode] = useState(initialMode);
  const [sms_formData, sms_setFormData] = useState({
    email: "",
    password: "",
    role: "",
  });
  const [sms_errors, sms_setErrors] = useState({});
  const [sms_loading, setSms_loading] = useState(false);

  const sms_inputClass =
    "w-full rounded-xl border border-[#C5A059] bg-[#fffff0] px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#C5A059] focus:ring-2 focus:ring-[#C5A059]/30";

  const sms_handleChange = (event) => {
    const { name, value } = event.target;
    sms_setFormData((prev) => ({ ...prev, [name]: value }));

    if (sms_errors[name]) {
      sms_setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const sms_validate = () => {
    const nextErrors = {};

    if (!sms_formData.email.trim()) {
      nextErrors.email = "Email is required.";
    }

    if (!sms_formData.password.trim()) {
      nextErrors.password = "Password is required.";
    }

    if (!sms_formData.role) {
      nextErrors.role = "Please select a role.";
    }

    sms_setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const sms_handleSubmit = async (event) => {
    event.preventDefault();
    if (!sms_validate()) return;
    setSms_loading(true);

    try {
      const loginResponse = await login({
        email: sms_formData.email,
        password: sms_formData.password,
        role: sms_formData.role.toLowerCase(),
      });

      const { token, user } = loginResponse.data;
      
      // Store with sms_ prefix
      localStorage.setItem("sms_token", token);
      localStorage.setItem("sms_user", JSON.stringify(user));

      toast.success(`Welcome back, ${user.fullName}!`);

      const roleToPath = {
        admin: "/dashboard/admin/user-management",
        teacher: "/dashboard/teacher/my-classes",
        student: "/dashboard/student/my-profile",
        parent: "/dashboard/parent/ward-progress",
      };

      navigate(roleToPath[(user?.role || "").toLowerCase()] || "/dashboard/admin/user-management");
    } catch (error) {
      const serverMessage =
        error?.response?.data?.message ||
        "Unable to process request. Please check your credentials.";
      toast.error(serverMessage);
    } finally {
      setSms_loading(false);
    }
  };

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${sms_bgImageUrl}')` }}
      />
      <div className="absolute inset-0 bg-white/70" />
      <div className="absolute inset-0 bg-[#002366] opacity-10" />

      <div className="relative w-full max-w-md rounded-3xl border border-[#C5A059] bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 text-center">
          <CrestLogo sizeClass="h-24 w-24" className="mx-auto border-2" />
          <h1
            className="mt-4 text-lg font-bold tracking-[0.18em] text-[#002366] sm:text-xl"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            MAYO COLLEGE, AJMER
          </h1>
          <p
            className="mt-1 text-xs italic text-[#C5A059]"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Let there be Light
          </p>
        </div>

        <form onSubmit={sms_handleSubmit} className="space-y-3" noValidate>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={sms_formData.email}
              onChange={sms_handleChange}
              className={sms_inputClass}
              placeholder="your.email@mayocollege.edu.in"
            />
            {sms_errors.email && <p className="mt-1 text-xs text-red-600">{sms_errors.email}</p>}
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={sms_formData.password}
              onChange={sms_handleChange}
              className={sms_inputClass}
              placeholder="Enter your password"
            />
            {sms_errors.password && <p className="mt-1 text-xs text-red-600">{sms_errors.password}</p>}
          </div>

          <div>
            <label htmlFor="role" className="mb-1 block text-sm text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Role
            </label>
            <select
              id="role"
              name="role"
              value={sms_formData.role}
              onChange={sms_handleChange}
              className={sms_inputClass}
            >
              <option value="">Select role</option>
              {sms_roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            {sms_errors.role && <p className="mt-1 text-xs text-red-600">{sms_errors.role}</p>}
          </div>

          <button
            type="submit"
            disabled={sms_loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#002366] bg-[#002366] px-4 py-2.5 text-sm font-semibold text-white transition duration-200 hover:border-[#C5A059] hover:shadow-[0_0_0_1px_#C5A059] disabled:opacity-50"
          >
            <LogIn size={18} />
            {sms_loading ? "Please wait..." : "Login"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-500">
          For new user registration, please contact your school administrator.
        </p>
      </div>
    </section>
  );
}

