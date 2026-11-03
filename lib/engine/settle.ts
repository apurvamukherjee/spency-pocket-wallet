import { allocateWhole, type FormatMoney } from "./money";
import type { LeftoverRule, Minor } from "./types";

export type EnvelopeWeek = {
  id: string;
  name: string;
  /** Weekly limit including any rollover carried in. */
  limit: Minor;
  spent: Minor;
  locked: boolean;
  leftover: LeftoverRule;
};

export type EnvelopeResult = EnvelopeWeek & {
  /** limit − spent; positive = saved, negative = over. */
  variance: Minor;
  /** Savings handed to other envelopes. */
  gave: Minor;
  /** Overspend absorbed by other envelopes' savings. */
  coveredBySavings: Minor;
  fromFlex: Minor;
  hitTarget: Minor;
  /** Savings still unused after cover; what the leftover rule acts on. */
  left: Minor;
};

export type Cover = { from: string; to: string; amount: Minor };

export type SettlementStatus = "covered" | "managed" | "target_hit";

export type Settlement = {
  envelopes: EnvelopeResult[];
  covers: Cover[];
  overspend: Minor;
  coveredBySavings: Minor;
  fromFlex: Minor;
  hitTarget: Minor;
  toFlex: Minor;
  toTarget: Minor;
  /** Next week's extra limit per envelope id. */
  rollover: Record<string, Minor>;
  status: SettlementStatus;
};

/**
 * Overspend is covered by unlocked savings first, then flex, then the month-end target.
 * Cover is shared proportionally on both sides so no single envelope is drained first.
 * Works the same mid-week: pass spending so far for a live projection.
 */
/** `unit` is minor units per major unit; cover is split in whole major units. */
export function settleWeek(envs: EnvelopeWeek[], flexAvailable: Minor, unit: number): Settlement {
  const variance = envs.map((e) => e.limit - e.spent);
  const overBy = variance.map((v) => Math.max(0, -v));
  const canGive = envs.map((e, i) => (e.locked ? 0 : Math.max(0, variance[i])));

  const overspend = overBy.reduce((a, b) => a + b, 0);
  const coveredBySavings = Math.min(overspend, canGive.reduce((a, b) => a + b, 0));
  const gave = allocateWhole(coveredBySavings, canGive, unit);
  const received = allocateWhole(coveredBySavings, overBy, unit);

  const residual = overBy.map((o, i) => o - received[i]);
  const remaining = overspend - coveredBySavings;
  const fromFlex = Math.min(remaining, Math.max(0, flexAvailable));
  const flexShare = allocateWhole(fromFlex, residual, unit);
  const targetShare = residual.map((r, i) => r - flexShare[i]);

  const envelopes: EnvelopeResult[] = envs.map((e, i) => ({
    ...e,
    variance: variance[i],
    gave: gave[i],
    coveredBySavings: received[i],
    fromFlex: flexShare[i],
    hitTarget: targetShare[i],
    left: Math.max(0, variance[i]) - gave[i],
  }));

  let toFlex = 0;
  let toTarget = 0;
  const rollover: Record<string, Minor> = {};
  for (const e of envelopes) {
    if (e.left <= 0) continue;
    if (e.leftover === "rollover") rollover[e.id] = e.left;
    else if (e.leftover === "to_flex") toFlex += e.left;
    else toTarget += e.left;
  }

  const hitTarget = remaining - fromFlex;
  return {
    envelopes,
    covers: matchCovers(envelopes),
    overspend,
    coveredBySavings,
    fromFlex,
    hitTarget,
    toFlex,
    toTarget,
    rollover,
    status: hitTarget > 0 ? "target_hit" : fromFlex > 0 ? "managed" : "covered",
  };
}

/** Pairs givers with receivers; both sides already sum to the same total. */
function matchCovers(envs: EnvelopeResult[]): Cover[] {
  const givers = envs.filter((e) => e.gave > 0).map((e) => ({ id: e.id, n: e.gave }));
  const takers = envs.filter((e) => e.coveredBySavings > 0).map((e) => ({ id: e.id, n: e.coveredBySavings }));
  const covers: Cover[] = [];
  for (let g = 0, t = 0; g < givers.length && t < takers.length; ) {
    const amount = Math.min(givers[g].n, takers[t].n);
    covers.push({ from: givers[g].id, to: takers[t].id, amount });
    givers[g].n -= amount;
    takers[t].n -= amount;
    if (givers[g].n === 0) g++;
    if (takers[t].n === 0) t++;
  }
  return covers;
}

export function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** One line under an over-budget envelope, e.g. "Covered by Blinkit savings". */
export function coverLine(s: Settlement, envelopeId: string, fmt: FormatMoney): string | null {
  const e = s.envelopes.find((x) => x.id === envelopeId);
  if (!e || e.variance >= 0) return null;
  const donors = s.covers
    .filter((c) => c.to === envelopeId)
    .map((c) => s.envelopes.find((x) => x.id === c.from)?.name ?? "");
  const parts: string[] = [];
  if (e.coveredBySavings > 0) {
    const by = `${joinNames(donors)} savings`;
    parts.push(e.fromFlex + e.hitTarget === 0 ? `Covered by ${by}` : `${fmt(e.coveredBySavings)} covered by ${by}`);
  }
  if (e.fromFlex > 0) parts.push(`${fmt(e.fromFlex)} from flex`);
  if (e.hitTarget > 0) parts.push(`${fmt(e.hitTarget)} from your month-end`);
  return parts.join(" · ");
}

/** Warm, honest summary. `live` phrases it as "so far this week". */
export function describeSettlement(
  s: Settlement,
  ctx: { live: boolean; target: Minor; projected: Minor; fmt: FormatMoney },
): string {
  const { fmt } = ctx;
  const overs = s.envelopes.filter((e) => e.variance < 0);
  const tail =
    ctx.projected >= ctx.target
      ? ` You're still on track for ${fmt(ctx.target)}.`
      : ` You're heading for ${fmt(ctx.projected)} — a lighter few days will close the gap.`;

  if (overs.length === 0) {
    return (ctx.live ? "Everything is within budget so far this week." : "Every envelope stayed within budget this week.") + tail;
  }

  const head =
    overs.length === 1
      ? `You went ${fmt(-overs[0].variance)} over on ${overs[0].name}`
      : `You went ${fmt(s.overspend)} over across ${joinNames(overs.map((e) => e.name))}`;
  const donors = joinNames(s.envelopes.filter((e) => e.gave > 0).map((e) => e.name));
  const soFar = ctx.live ? " so far" : "";

  let text: string;
  if (s.coveredBySavings === s.overspend) {
    text = `${head}${soFar}, and all of it was covered because you spent less on ${donors}.`;
  } else if (s.coveredBySavings > 0) {
    text = `${head}${soFar}, but ${fmt(s.coveredBySavings)} was covered because you spent less on ${donors}.`;
    if (s.fromFlex > 0) text += ` Only ${fmt(s.fromFlex)} came from flex.`;
  } else {
    text = `${head}${soFar}.`;
    if (s.fromFlex > 0) text += ` Flex covered ${s.hitTarget === 0 ? "it" : fmt(s.fromFlex)}.`;
  }
  if (s.hitTarget > 0) text += ` ${fmt(s.hitTarget)} comes out of your month-end balance.`;
  return text + tail;
}
