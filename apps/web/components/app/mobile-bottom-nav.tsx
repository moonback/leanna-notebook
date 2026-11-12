"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Compass, Settings } from "lucide-react";

const items = [
  { href: "/", label: "Notebooks", icon: BookOpen, match: (path: string) => path === "/" },
  { href: "/discover", label: "Découvrir", icon: Compass, match: (path: string) => path.startsWith("/discover") },
  { href: "/settings", label: "Réglages", icon: Settings, match: (path: string) => path.startsWith("/settings") },
];

export function MobileBottomNav() {
  const pathname = usePathname();
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
