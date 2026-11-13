/** Offres donnant accès à Leanna Browser (module sans dépendance serveur, utilisable côté client). */
export const BROWSER_PLANS: readonly string[] = ["pro", "team"];

export const hasBrowserPlan = (planId: string | null | undefined): boolean => !!planId && BROWSER_PLANS.includes(planId);
