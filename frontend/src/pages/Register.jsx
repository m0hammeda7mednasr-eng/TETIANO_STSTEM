import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Lock, Mail, User } from "lucide-react";
import { useLocale } from "../context/LocaleContext";
import LanguageToggle from "../components/LanguageToggle";

export default function Register() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { isRTL, t } = useLocale();

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
      if (formData.password !== formData.confirmPassword) {
        setError(t("auth.passwordMismatch", "Passwords do not match"));
        setLoading(false);
        return;
      }

      if (formData.password.length < 6) {
        setError(
          t(
            "auth.passwordTooShort",
            "Password must be at least 6 characters",
          ),
        );
        setLoading(false);
        return;
      }

      const response = await axios.post("/api/auth/register", {
        name: formData.name,
        email: formData.email,
        password: formData.password,
      });

      localStorage.setItem("token", response.data.token);
      localStorage.setItem("user", JSON.stringify(response.data.user));
      navigate("/dashboard");
    } catch (requestError) {
      console.error("Registration error:", requestError);
      const errorMessage =
        requestError.response?.data?.error ||
        t(
          "auth.registerFailed",
          "Failed to create account. Please try again.",
        );
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 flex items-center justify-center p-4">
      <div className={`fixed top-4 ${togglePositionClass} z-20`}>
        <LanguageToggle />
      </div>

      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-800">
            {t("auth.registerTitle", "Create a New Account")}
          </h1>
          <p className="mt-2 text-gray-600">
            {t("auth.registerSubtitle", "Join the store management system")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              {t("auth.fullName", "Full name")}
            </label>
            <div className="relative">
              <User className={`absolute top-3 text-gray-400 ${iconPositionClass}`} size={20} />
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                autoComplete="name"
                placeholder={t("auth.fullNamePlaceholder", "Enter your name")}
                className={`w-full ${inputPaddingClass} py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                required
              />
            </div>
          </div>

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
                autoComplete="new-password"
                placeholder="........"
                className={`w-full ${inputPaddingClass} py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              {t("auth.confirmPassword", "Confirm password")}
            </label>
            <div className="relative">
              <Lock className={`absolute top-3 text-gray-400 ${iconPositionClass}`} size={20} />
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                autoComplete="new-password"
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
              ? t("auth.creatingAccount", "Creating account...")
              : t("auth.createAccountButton", "Create Account")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          {t("auth.haveAccount", "Already have an account?")}{" "}
          <a href="/login" className="font-medium text-blue-600 hover:underline">
            {t("auth.login", "Sign in")}
          </a>
        </p>
      </div>
    </div>
  );
}
