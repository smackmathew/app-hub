import { Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../data/auth";
import { useOpenInbox } from "../data/hooks";
import Spinner from "./Spinner";

export default function Layout() {
  const { user, logout } = useAuth();
  const open = useOpenInbox();
  const items = [
    { to: "/", label: "Overview", end: true },
    { to: "/inbox", label: "Inbox", badge: open.data.length },
    { to: "/sales", label: "Sales" },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <NavLink to="/" className="flex shrink-0 items-center gap-2 font-semibold">
              <img src="/favicon.svg" alt="" className="h-6 w-6" />
              <span className="hidden sm:inline">App Hub</span>
            </NavLink>
            <nav className="flex gap-1 overflow-x-auto">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
                      isActive ? "bg-sel text-ink" : "text-ink-2 hover:bg-hover"
                    }`
                  }
                >
                  {item.label}
                  {!!item.badge && (
                    <span className="tabular rounded-full bg-accent px-1.5 text-xs font-semibold text-white" aria-label={`${item.badge} open`}>
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden max-w-[16rem] truncate text-sm text-ink-muted md:inline">{user?.email}</span>
            <button onClick={logout} className="text-sm font-medium text-ink-2 hover:text-ink">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
