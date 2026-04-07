"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  role: "pharmacist_admin" | "pharmacist_staff" | "department";
  department: "TABLETA" | "IMPORT" | "TM" | null;
};

function TabItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const isActive =
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`flex flex-1 items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        isActive
          ? "bg-blue-50 text-blue-700"
          : "text-zinc-600 hover:bg-zinc-100"
      }`}
    >
      {label}
    </Link>
  );
}

function MobileMenu({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  
  const isPharmacist = profileLoaded && profile?.role !== "department";
  const isAdminPharmacist = profileLoaded && profile?.role === "pharmacist_admin";
  const menuItems = isPharmacist
    ? [
        { href: "/comanda", label: "Comandă", icon: "🛒" },
        { href: "/dept", label: "Departament", icon: "🏭" },
        { href: "/", label: "Nomenclator", icon: "📋" },
        { href: "/comenzi", label: "Istoric", icon: "📚" },
        { href: "/sugestii", label: "Sugestii", icon: "💡" },
        ...(isAdminPharmacist
          ? [
              { href: "/receptie", label: "Recepție", icon: "📦" },
              { href: "/admin", label: "Admin", icon: "🔒" },
            ]
          : []),
      ]
    : [
        { href: "/dept", label: "Comandă", icon: "🛒" },
        { href: "/dept/alte-departamente", label: "Alte departamente", icon: "📦" },
        { href: "/comenzi", label: "Istoric", icon: "📚" },
        { href: "/", label: "Nomenclator", icon: "📋" },
      ];

  useEffect(() => {
    if (!isOpen) return;
    setProfileLoaded(false);
    supabase.auth.getUser().then(async ({ data }) => {
      setUserEmail(data.user?.email ?? null);
      if (!data.user) {
        setProfile(null);
        setProfileLoaded(true);
        return;
      }
      const { data: p } = await supabase
        .from("profiles")
        .select("role, department")
        .eq("user_id", data.user.id)
        .limit(1);
      setProfile(((p as Profile[] | null) ?? [])[0] ?? null);
      setProfileLoaded(true);
    });
  }, [isOpen]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      onClose();
      router.push(`/login?next=${encodeURIComponent(pathname || "/")}`);
      setLoggingOut(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Menu Panel */}
      <div className="fixed bottom-0 left-0 right-0 max-h-[85vh] overflow-auto bg-white rounded-t-2xl shadow-2xl">
        <div className="p-4 pb-6">
          {/* Handle */}
          <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-zinc-300" />
          
          {/* Menu Items */}
          <div className="space-y-2">
            {menuItems.map((item) => {
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                  {isActive && (
                    <div className="ml-auto h-2 w-2 rounded-full bg-blue-600" />
                  )}
                </Link>
              );
            })}
          </div>

          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-700">
            <div className="font-semibold text-zinc-900">Info</div>
            <div className="mt-1">Farm. Eiub Bedin-Edis</div>
            <div className="mt-0.5">eiubbedin@icloud.com</div>
            <div className="mt-0.5">0040751843300</div>
            <div className="mt-0.5">Măcin TL</div>
          </div>

          <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs text-zinc-700">
            <div className="font-semibold text-zinc-900">User</div>
            <div className="mt-1 break-all text-zinc-600">{userEmail || "-"}</div>
            <button
              type="button"
              disabled={loggingOut}
              onClick={() => void handleLogout()}
              className="mt-2 w-full rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {loggingOut ? "Se deloghează..." : "Logout"}
            </button>
          </div>
          
          {/* Close Button */}
          <button
            onClick={onClose}
            className="mt-4 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Închide
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;

    async function refreshUser() {
      if (!mounted) return;
      setProfileLoaded(false);
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;

      setUserEmail(data.user?.email ?? null);
      if (!data.user) {
        setProfile(null);
        setProfileLoaded(true);
        return;
      }

      const { data: p } = await supabase
        .from("profiles")
        .select("role, department")
        .eq("user_id", data.user.id)
        .limit(1);
      if (!mounted) return;
      setProfile(((p as Profile[] | null) ?? [])[0] ?? null);
      setProfileLoaded(true);
    }

    void refreshUser();

    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void refreshUser();
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const isPharmacist = profileLoaded && profile?.role !== "department";
  const isAdminPharmacist = profileLoaded && profile?.role === "pharmacist_admin";
  const desktopTabs = isPharmacist
    ? [
        { href: "/comanda", label: "Comandă" },
        { href: "/dept", label: "Departament" },
        { href: "/", label: "Nomenclator" },
        { href: "/comenzi", label: "Istoric" },
        { href: "/sugestii", label: "Sugestii" },
        ...(isAdminPharmacist
          ? [
              { href: "/receptie", label: "Recepție" },
              { href: "/admin", label: "Admin" },
            ]
          : []),
      ]
    : [
        { href: "/dept", label: "Comandă" },
        { href: "/dept/alte-departamente", label: "Alte dept." },
        { href: "/comenzi", label: "Istoric" },
        { href: "/", label: "Nomenclator" },
      ];

  useEffect(() => {
    if (!userMenuOpen) return;
    function onMouseDown(e: MouseEvent) {
      const el = userMenuRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [userMenuOpen]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setUserMenuOpen(false);
      router.push(`/login?next=${encodeURIComponent(pathname || "/")}`);
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Header desktop */}
      <header className="sticky top-0 z-20 hidden border-b border-zinc-200 bg-white/80 px-6 py-3 backdrop-blur lg:block">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-zinc-900">
              Comenzi Medicamente F35
            </h1>
            <p className="text-xs text-zinc-500">
              {pathname === "/comanda"
                ? "Comandă activă"
                : pathname === "/dept"
                ? "Comandă activă"
                : pathname === "/comenzi"
                ? "Istoric comenzi"
                : pathname === "/sugestii"
                ? "Sugestii medicamente"
                : pathname === "/receptie"
                ? "Recepție comenzi"
                : "Nomenclator medicamente"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-2 text-xs">
              {desktopTabs.map((t) => (
                <TabItem key={t.href} href={t.href} label={t.label} />
              ))}
            </nav>
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
              >
                {userEmail || "User"}
              </button>
              {userMenuOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 rounded-xl border border-zinc-200 bg-white p-2 text-xs shadow-lg"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="px-2 py-1 text-zinc-600 break-all">
                    {userEmail || "-"}
                  </div>
                  <button
                    type="button"
                    disabled={loggingOut}
                    onClick={() => void handleLogout()}
                    className="mt-1 w-full rounded-lg bg-zinc-900 px-3 py-2 text-left text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {loggingOut ? "Se deloghează..." : "Logout"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Header mobil */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <h1 className="text-base font-semibold tracking-tight text-zinc-900">
              Comenzi F35
            </h1>
            <p className="text-xs text-zinc-500">
              {pathname === "/comanda"
                ? "Comandă activă"
                : pathname === "/dept"
                ? "Comandă activă"
                : pathname === "/comenzi"
                ? "Istoric comenzi"
                : pathname === "/sugestii"
                ? "Sugestii medicamente"
                : pathname === "/receptie"
                ? "Recepție comenzi"
                : "Nomenclator medicamente"}
            </p>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl pb-16 sm:pb-0">
        {children}
        <footer className="mt-8 border-t border-zinc-200 px-4 py-4 text-xs text-zinc-600 sm:px-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="font-medium text-zinc-800">Farm. Eiub Bedin-Edis</div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
              <span>eiubbedin@icloud.com</span>
              <span className="hidden sm:inline">•</span>
              <span>0040751843300</span>
              <span className="hidden sm:inline">•</span>
              <span>Măcin TL</span>
            </div>
          </div>
        </footer>
      </div>

      {/* Mobile Menu */}
      <MobileMenu 
        isOpen={isMobileMenuOpen} 
        onClose={() => setIsMobileMenuOpen(false)} 
      />
    </div>
  );
}
