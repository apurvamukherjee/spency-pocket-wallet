"use client";

import { type Category, FLEX } from "@/lib/data/category";
import type { Commitment, Envelope } from "@/lib/engine/types";
import { Chip } from "@/components/ui/controls";

export function CategoryPicker({
  envelopes,
  bills,
  value,
  onChange,
}: {
  envelopes: Envelope[];
  bills: Commitment[];
  value: Category;
  onChange: (c: Category) => void;
}) {
  const isFlex = value.envelopeId === null && value.commitmentId === null;
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Envelope" className="flex flex-wrap gap-2">
        {envelopes.map((e) => (
          <Chip key={e.id} active={value.envelopeId === e.id} onClick={() => onChange({ envelopeId: e.id, commitmentId: null })}>
            {e.name}
          </Chip>
        ))}
        <Chip active={isFlex} onClick={() => onChange(FLEX)}>
          Flex
        </Chip>
      </div>
      {bills.length > 0 && (
        <div role="group" aria-label="Bill" className="space-y-1.5">
          <p className="text-xs text-muted">Or a bill</p>
          <div className="flex flex-wrap gap-2">
            {bills.map((c) => (
              <Chip key={c.id} active={value.commitmentId === c.id} onClick={() => onChange({ envelopeId: null, commitmentId: c.id })}>
                {c.name}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
