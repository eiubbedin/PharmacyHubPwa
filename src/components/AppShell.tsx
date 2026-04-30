"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { usePushNotifications } from "@/lib/usePushNotifications";
import { useDarkMode } from "@/contexts/DarkModeContext";

type Profile = {
  role: "pharmacist_admin" | "pharmacist_staff" | "department";
  department: "TABLETA" | "IMPORT" | "TM" | null;
};

function IconNomenclator() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}
function IconOrder() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}
function IconHistory() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function IconSuggestions() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}
function IconReception() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}
function IconDashboard() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
};

function SidebarNavItem({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? "bg-blue-50 text-blue-600"
          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      <span className={isActive ? "text-blue-600" : "text-gray-400"}>{item.icon}</span>
      <span>{item.label}</span>
    </Link>
  );
}

function BottomNavItem({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2"
    >
      <span className={isActive ? "text-blue-600" : "text-gray-400"}>{item.icon}</span>
      <span className={`text-[10px] font-medium ${
        isActive ? "text-blue-600" : "text-gray-500"
      }`}>
        {item.shortLabel}
      </span>
    </Link>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { darkMode, toggleDarkMode } = useDarkMode();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showLogoutToast, setShowLogoutToast] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const userMenuRefDesktop = useRef<HTMLDivElement | null>(null);
  const userMenuRefMobile = useRef<HTMLDivElement | null>(null);
  const { state: pushState, subscribe: subscribePush } = usePushNotifications(
    profile?.role === "department" ? userId : null
  );

  useEffect(() => {
    let mounted = true;
    async function refreshUser() {
      if (!mounted) return;
      setProfileLoaded(false);
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setUserEmail(data.user?.email ?? null);
      setUserId(data.user?.id ?? null);
      if (!data.user) { setProfile(null); setProfileLoaded(true); return; }
      const { data: p } = await supabase.from("profiles").select("role, department").eq("user_id", data.user.id).limit(1);
      if (!mounted) return;
      setProfile(((p as Profile[] | null) ?? [])[0] ?? null);
      setProfileLoaded(true);
    }
    void refreshUser();
    const { data: subscription } = supabase.auth.onAuthStateChange(() => void refreshUser());
    return () => { mounted = false; subscription.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!userMenuOpen) return;
    function onMouseDown(e: MouseEvent) {
      const elD = userMenuRefDesktop.current;
      const elM = userMenuRefMobile.current;
      const target = e.target as Node;
      if (
        (!elD || !elD.contains(target)) &&
        (!elM || !elM.contains(target))
      ) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [userMenuOpen]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setUserMenuOpen(false);
    try {
      await supabase.auth.signOut();
      setShowLogoutToast(true);
      setTimeout(() => { window.location.href = "/login"; }, 1200);
    } catch {
      setLoggingOut(false);
      window.location.href = "/login";
    }
  }

  const isPharmacist = profileLoaded && profile?.role !== "department";

  const pharmacistNav: NavItem[] = [
    { href: "/", label: "Nomenclator", shortLabel: "Nomenclator", icon: <IconNomenclator /> },
    { href: "/comanda", label: "Comandă activă", shortLabel: "Comandă", icon: <IconOrder /> },
    { href: "/comenzi", label: "Istoric comenzi", shortLabel: "Istoric", icon: <IconHistory /> },
    { href: "/sugestii", label: "Sugestii", shortLabel: "Sugestii", icon: <IconSuggestions /> },
    { href: "/receptie", label: "Recepție", shortLabel: "Recepție", icon: <IconReception /> },
    ...(profile?.role === "pharmacist_admin" ? [{ href: "/admin/dashboard", label: "Dashboard", shortLabel: "Dashboard", icon: <IconDashboard /> }] : []),
  ];

  const deptNav: NavItem[] = [
    { href: "/depozit", label: "Comandă activă", shortLabel: "Comandă", icon: <IconOrder /> },
    { href: "/depozit/istoric", label: "Istoric comenzi", shortLabel: "Istoric", icon: <IconHistory /> },
  ];

  const navItems = isPharmacist ? pharmacistNav : deptNav;

  const pageTitle = (() => {
    if (pathname === "/comanda" || pathname === "/dept") return "Comandă activă";
    if (pathname?.startsWith("/dept/alte")) return "Alte departamente";
    if (pathname?.startsWith("/comenzi")) return "Istoric comenzi";
    if (pathname?.startsWith("/sugestii")) return "Sugestii";
    if (pathname?.startsWith("/receptie")) return "Recepție";
    if (pathname?.startsWith("/admin/dashboard")) return "Dashboard";
    if (pathname === "/depozit") return "Comandă activă";
    if (pathname?.startsWith("/depozit/istoric")) return "Istoric comenzi";
    return "Nomenclator";
  })();

  const userInitial = userEmail ? userEmail[0].toUpperCase() : "U";

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors">
      {/* Toast logout */}
      {showLogoutToast && (
        <div className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          <svg className="h-4 w-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Deconectat cu succes
        </div>
      )}

      {/* ── Desktop layout ── */}
      <div className="hidden lg:flex lg:min-h-screen">
        {/* Sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          {/* Logo */}
          <div className="flex h-14 items-center border-b border-gray-200 dark:border-gray-700 px-4">
            <Image
              src="/logo-heliofarm.png"
              alt="Farmaciile Heliofarm"
              width={160}
              height={40}
              className="object-contain"
              priority
            />
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
            {navItems.map((item) => (
              <SidebarNavItem key={item.href} item={item} />
            ))}
          </nav>

          {/* Dark mode toggle */}
          <div className="px-3 pb-2">
            <button
              onClick={toggleDarkMode}
              className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              {darkMode ? (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
              {darkMode ? "Mod luminos" : "Mod întunecat"}
            </button>
          </div>

          {/* Push notifications button – doar pentru department */}
          {profile?.role === "department" && pushState !== "unsupported" && (
            <div className="px-3 pb-4">
              <button
                disabled={pushState === "loading" || pushState === "granted" || pushState === "denied"}
                onClick={() => void subscribePush()}
                className={`w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  pushState === "granted"
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    : pushState === "denied"
                    ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                    : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                }`}
              >
                {pushState === "granted" && "Notificări active"}
                {pushState === "denied" && "Notificări blocate"}
                {pushState === "prompt" && "Activează notificări"}
                {pushState === "loading" && "Se procesează..."}
              </button>
            </div>
          )}

          {/* User section */}
          <div className="border-t border-gray-200 p-3">
            <div className="relative" ref={userMenuRefDesktop}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                  {userInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-gray-800">{userEmail || "—"}</div>
                  <div className="text-[10px] text-gray-400">{profile?.role ?? "—"}</div>
                </div>
                <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {userMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg" onMouseDown={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    disabled={loggingOut}
                    onClick={() => void handleLogout()}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    {loggingOut ? "Se deloghează..." : "Deconectare"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="ml-60 flex min-h-screen flex-1 flex-col bg-white dark:bg-gray-900">
          <header className="sticky top-0 z-20 flex h-14 items-center border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6">
            <h1 className="text-base font-semibold text-gray-900">{pageTitle}</h1>
          </header>
          <main className="flex-1 px-6 py-5">
            {children}
          </main>
          <footer className="border-t border-gray-200 dark:border-gray-700 px-6 py-3 text-xs text-gray-400 dark:text-gray-500">
            Farm. Eiub Bedin-Edis · Măcin TL
          </footer>
        </div>
      </div>

      {/* ── Mobile layout ── */}
      <div className="flex flex-col lg:hidden">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4">
          <div className="flex items-center gap-3">
            <Image
              src="/logo-heliofarm.png"
              alt="Farmaciile Heliofarm"
              width={110}
              height={28}
              className="object-contain"
              priority
            />
            <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">|</span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{pageTitle}</span>
          </div>
          <div className="relative" ref={userMenuRefMobile}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-sm font-semibold text-blue-700 dark:text-blue-300"
            >
              {userInitial}
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
                <div className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400 break-all">{userEmail || "—"}</div>
                <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                <button
                  type="button"
                  disabled={loggingOut}
                  onClick={() => void handleLogout()}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  {loggingOut ? "Se deloghează..." : "Deconectare"}
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 pb-20 px-4 py-4">
          {children}
        </main>

        <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-gray-200 bg-white">
          {navItems.map((item) => (
            <BottomNavItem key={item.href} item={item} />
          ))}
        </nav>
      </div>
    </div>
  );
}
