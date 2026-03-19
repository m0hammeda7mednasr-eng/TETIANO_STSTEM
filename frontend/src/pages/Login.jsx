import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail } from "lucide-react";
import { authAPI, getErrorMessage } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import LanguageToggle from "../components/LanguageToggle";
import tetianoLogo from "../assets/tetiano-logo.jpeg";

export default function Login() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refreshAuth } = useAuth();
  const { isRTL, select, t } = useLocale();

  const iconPositionClass = isRTL ? "right-3" : "left-3";
  const inputPaddingClass = isRTL ? "pr-10 pl-4" : "pl-10 pr-4";
  const togglePositionClass = isRTL ? "left-4" : "right-4";

  const handleChange = (event) => {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      localStorage.removeItem("currentStoreId");
      const response = await authAPI.login(formData);
      localStorage.setItem("token", response.data.token);
      localStorage.setItem("user", JSON.stringify(response.data.user));

      if (response.data.permissions) {
        localStorage.setItem(
          "permissions",
          JSON.stringify(response.data.permissions),
        );
      }

      await refreshAuth();
      navigate("/dashboard");
    } catch (requestError) {
      console.error("Login error:", requestError);
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-sky-900 flex items-center justify-center p-4">
      <div className={`fixed top-4 ${togglePositionClass} z-20`}>
        <LanguageToggle />
      </div>

      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 h-16 w-16 overflow-hidden rounded-2xl ring-4 ring-sky-100 shadow-lg">
            <img
              src={tetianoLogo}
              alt="Tetiano logo"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            {t("auth.appName", "Tetiano")}
          </h1>
          <p className="mt-2 text-gray-600">
            {t("auth.loginSubtitle", "Sign in to your Tetiano account")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              {t("auth.email", "Email")}
            </label>
            <div className="relative">
              <Mail className={`absolute top-3 text-gray-400 ${iconPositionClass}`} size={20} />
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                autoComplete="username"
                placeholder="example@email.com"
                className={`w-full ${inputPaddingClass} py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              {t("auth.password", "Password")}
            </label>
            <div className="relative">
              <Lock className={`absolute top-3 text-gray-400 ${iconPositionClass}`} size={20} />
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                autoComplete="current-password"
                placeholder="........"
                className={`w-full ${inputPaddingClass} py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                required
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-400 bg-red-100 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-2 font-semibold text-white transition duration-300 hover:bg-blue-700 disabled:opacity-50"
          >
            {loading
              ? t("auth.signingIn", "Signing in...")
              : t("auth.signIn", "Sign in")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          {t("auth.noAccount", "Don't have an account?")}{" "}
          <a href="/register" className="font-medium text-blue-600 hover:underline">
            {t("auth.createAccount", "Create one")}
          </a>
        </p>
        <p className="mt-2 text-center text-xs text-gray-500">
          {select(
            "التسجيل الذاتي يظل متاحًا فقط أثناء الإعداد الأولي أو إذا قامت الإدارة بتفعيله.",
            "Self-registration stays available only during initial setup or when the admin enables it.",
          )}
        </p>
      </div>
    </div>
  );
}
