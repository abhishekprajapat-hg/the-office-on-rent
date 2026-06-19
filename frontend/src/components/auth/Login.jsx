import React, { useState } from "react";
import { motion as Motion } from "framer-motion";
import { ChevronRight, Lock, ScanFace } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../services/api";
import { toErrorMessage } from "../../utils/errorMessage";
import { persistTenantSlug } from "../../utils/tenantRouting";
import BrandLogo from "../common/BrandLogo";

const Login = ({ onLogin, portal = "GENERAL" }) => {
  const [email, setEmail] = useState("");
  const [passcode, setPasscode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await api.post("/auth/login", {
        email,
        password: passcode,
        portal,
      });

      const { token, refreshToken, user } = res.data;
      const tenantSlug = String(res.data?.tenant?.subdomain || "").trim().toLowerCase();

      localStorage.setItem("token", token);
      if (refreshToken) {
        localStorage.setItem("refreshToken", refreshToken);
      } else {
        localStorage.removeItem("refreshToken");
      }
      localStorage.setItem("role", user.role);
      localStorage.setItem("user", JSON.stringify(user));
      persistTenantSlug(tenantSlug);

      onLogin(user.role);
    } catch (err) {
      setError(toErrorMessage(err, "Login failed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 top-12 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
      </div>

      <Motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35 }}
        className="relative w-full max-w-md rounded-[28px] border border-slate-700/70 bg-slate-900/88 p-6 shadow-[0_28px_70px_-36px_rgba(2,6,23,0.95)] backdrop-blur-xl sm:p-8"
      >
        <div className="mb-6 text-center">
          <BrandLogo className="mx-auto mb-4 h-20 w-20" />
          <div className="inline-flex items-center rounded-full border border-cyan-300/35 bg-cyan-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100">
            {portal}
          </div>
          <h1 className="mt-3 font-display text-2xl font-semibold text-slate-100">
            Secure Workspace Login
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">
            Command access for authorized users
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-600 bg-slate-950/80 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
          />

          <div className="relative">
            <Lock
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="password"
              required
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Password"
              className="h-11 w-full rounded-xl border border-slate-600 bg-slate-950/80 py-3 pl-9 pr-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
            />
          </div>

          {error ? (
            <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/40 bg-gradient-to-r from-cyan-500 to-sky-500 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-70"
          >
            {isLoading ? (
              <>
                <ScanFace className="animate-spin" size={16} />
                Verifying...
              </>
            ) : (
              <>
                Login <ChevronRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="mt-5 border-t border-slate-700 pt-4 text-center text-[11px] text-slate-400">
          By continuing, you agree to our{" "}
          <Link
            to="/service-terms"
            className="font-semibold text-slate-200 hover:text-cyan-200"
          >
            Terms
          </Link>{" "}
          and{" "}
          <Link
            to="/data-use-notice"
            className="font-semibold text-slate-200 hover:text-cyan-200"
          >
            Privacy Policy
          </Link>
          .
        </div>
      </Motion.div>
    </div>
  );
};

export default Login;
