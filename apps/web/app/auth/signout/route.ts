import { NextResponse, type NextRequest } from "next/server";
import { createUserClient } from "@/lib/supabase/server";

/** Déconnexion (POST uniquement : un lien GET pourrait être déclenché par un tiers). */
export async function POST(request: NextRequest) {
  const supabase = await createUserClient();
  await supabase.auth.signOut();
  // Location relative : le navigateur reste sur l'hôte public, même derrière un proxy
  // où `nextUrl.origin` correspond à l'adresse interne (ex. localhost:8080).
  return new NextResponse(null, { status: 303, headers: { Location: "/login" } });
}
