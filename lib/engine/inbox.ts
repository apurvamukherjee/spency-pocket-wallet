import type { Envelope, Minor, Txn } from "./types";

const TWO_MINUTES = 2 * 60_000;

export function normalizeMerchant(merchant: string): string {
  return merchant.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Same UPI ref, or (when either side has no ref) same merchant + amount within 2 minutes.
 * Rejected txns never count, so a user can re-add something they dismissed by mistake.
 */
export function findDuplicate(
  candidate: { id?: string; upiRef: string | null; merchant: string; amount: Minor; occurredAt: string },
  existing: Txn[],
): Txn | undefined {
  const at = Date.parse(candidate.occurredAt);
  const merchant = normalizeMerchant(candidate.merchant);
  return existing.find((t) => {
    if (t.status === "rejected" || t.id === candidate.id) return false;
    if (candidate.upiRef && t.upiRef) return candidate.upiRef === t.upiRef;
    return (
      t.amount === candidate.amount &&
      normalizeMerchant(t.merchant) === merchant &&
      Math.abs(Date.parse(t.occurredAt) - at) <= TWO_MINUTES
    );
  });
}

/** merchant (normalized) → envelope id, or null for flex. */
export type MerchantMemory = Record<string, string | null>;

export function rememberMerchant(memory: MerchantMemory, merchant: string, envelopeId: string | null): MerchantMemory {
  return { ...memory, [normalizeMerchant(merchant)]: envelopeId };
}

export function recallEnvelope(memory: MerchantMemory, merchant: string): string | null | undefined {
  return memory[normalizeMerchant(merchant)];
}

/**
 * Where a payment goes when nothing else places it: the user's chosen envelope, else one named "Small stuff",
 * else Flex (null). Flex is otherwise only used when the user picks it.
 */
export function defaultEnvelopeId(envelopes: Envelope[], preferred: string | null | undefined): string | null {
  if (preferred && envelopes.some((e) => e.id === preferred)) return preferred;
  return envelopes.find((e) => e.name.trim().toLowerCase() === "small stuff")?.id ?? null;
}
