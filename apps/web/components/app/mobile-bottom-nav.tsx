"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Compass, Settings } from "lucide-react";

const items = [
  { href: "/", label: "Notebooks", icon: BookOpen, match: (path: string) => path === "/" },
  { href: "/discover", label: "Découvrir", icon: Compass, match: (path: string) => path.startsWith("/discover") },
  { href: "/settings", label: "Réglages", icon: Settings, match: (path: string) => path.startsWith("/settings") },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  React.useEffect(() => {
    const routes = ["/", "/discover", "/settings"];
    const current = routes.indexOf(pathname);
    if (current < 0) return;
    let start: { x: number; y: number; target: EventTarget | null } | null = null;
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      start = { x: touch.clientX, y: touch.clientY, target: event.target };
    };
    const onEnd = (event: TouchEvent) => {
      if (!start) return;
      const origin = start;
      start = null;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const target = origin.target instanceof Element ? origin.target : null;
      if (target?.closest('a, button, input, textarea, select, [contenteditable="true"], [data-no-page-swipe]')) return;
      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
      const next = dx < 0 ? Math.min(routes.length - 1, current + 1) : Math.max(0, current - 1);
      if (next !== current) router.push(routes[next]);
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [pathname, router]);

  if (pathname.startsWith("/notebook/") || pathname.startsWith("/login") || pathname.startsWith("/signup")) return null;

  return (
    <nav className="mobile-bottom-nav" aria-label="Navigation principale">
      {items.map(({ href, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={active ? "mobile-bottom-nav__item is-active" : "mobile-bottom-nav__item"}>
            <span className="mobile-bottom-nav__icon"><Icon aria-hidden className="size-[19px]" /></span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
