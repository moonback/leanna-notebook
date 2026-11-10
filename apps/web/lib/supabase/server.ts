import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

/** Client lié à l'utilisateur (cookies de session) : toutes les lectures passent ici, sous RLS. */
export async function createUserClient() {
  const store = await cookies();
  return createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // appelé depuis un Server Component : le middleware rafraîchit la session
        }
      },
    },
  });
}

/** Client service_role : écritures uniquement, APRÈS contrôle d'identité et de rôle. Jamais exposé au navigateur. */
export function createServiceClient() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Utilisateur authentifié, vérifié auprès du serveur d'auth (jamais la session brute du cookie). */
export async function getUser() {
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}
