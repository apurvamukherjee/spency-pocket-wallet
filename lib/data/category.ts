import type { Commitment, Envelope, Txn } from "@/lib/engine/types";

/** Where a payment counts: an envelope, a bill (paying it), or Flex (both null). */
export type Category = { envelopeId: string | null; commitmentId: string | null };

export const FLEX: Category = { envelopeId: null, commitmentId: null };

export function categoryLabel(
  envelopes: Envelope[],
  commitments: Commitment[],
  t: Pick<Txn, "envelopeId" | "commitmentId"> & Partial<Pick<Txn, "kind">>,
): string {
  if (t.kind === "transfer") return "Cash withdrawal";
  if (t.kind === "adjustment") return "Adjustment";
  if (t.commitmentId) return commitments.find((c) => c.id === t.commitmentId)?.name ?? "Bill";
  return t.envelopeId ? (envelopes.find((e) => e.id === t.envelopeId)?.name ?? "Flex") : "Flex";
}
