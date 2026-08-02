import { eq } from 'drizzle-orm';
import { auditEvents, households } from '@watch-bracket/db';
import { HouseRulesSchema, type HouseRules } from '@watch-bracket/realtime-protocol';
import type { DomainContext } from './domain.js';
import { DomainError } from './domain.js';

export async function getHouseholdSetup(ctx: DomainContext) {
  const [household] = await ctx.db.select().from(households).limit(1);
  if (!household) throw new DomainError('HOUSEHOLD_MISSING', 'Household configuration is missing.', 500);
  return { id: household.id, name: household.name, region: household.region, timeZone: household.timeZone, defaultRules: HouseRulesSchema.parse(household.defaultRules), completed: Boolean(household.onboardingCompletedAt) };
}

export async function saveHouseholdSetup(ctx: DomainContext, adminId: string, input: { name: string; region: string; timeZone: string; defaultRules: HouseRules; completed: boolean }) {
  const current = await getHouseholdSetup(ctx);
  const rules = HouseRulesSchema.parse(input.defaultRules);
  try { new Intl.DateTimeFormat('en', { timeZone: input.timeZone }).format(); }
  catch { throw new DomainError('TIME_ZONE_INVALID', 'Use a valid IANA time zone, such as America/Toronto.', 400); }
  const [updated] = await ctx.db.update(households).set({ name: input.name.trim(), region: input.region.toUpperCase(), timeZone: input.timeZone, defaultRules: rules, onboardingCompletedAt: input.completed ? new Date() : null, updatedAt: new Date() }).where(eq(households.id, current.id)).returning();
  await ctx.db.insert(auditEvents).values({ householdId: current.id, actorType: 'ADMIN', actorId: adminId, eventType: 'HOUSEHOLD_SETUP_UPDATED', metadata: { region: input.region.toUpperCase(), timeZone: input.timeZone, preset: rules.preset, completed: input.completed } });
  return { ...updated!, defaultRules: rules, completed: Boolean(updated!.onboardingCompletedAt) };
}
