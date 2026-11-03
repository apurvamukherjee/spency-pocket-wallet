"use client";

import type { Envelope } from "@/lib/engine/types";
import { Chip } from "@/components/ui/controls";

export function CategoryPicker({
  envelopes,
  value,
  onChange,
}: {
  envelopes: Envelope[];
  value: string | null;
  onChange: (envelopeId: string | null) => void;
}) {
  return (
    <div role="group" aria-label="Category" className="flex flex-wrap gap-2">
      {envelopes.map((e) => (
        <Chip key={e.id} active={value === e.id} onClick={() => onChange(e.id)}>
          {e.name}
        </Chip>
      ))}
      <Chip active={value === null} onClick={() => onChange(null)}>
        Flex
      </Chip>
    </div>
  );
}

export function categoryName(envelopes: Envelope[], id: string | null): string {
  return id === null ? "Flex" : (envelopes.find((e) => e.id === id)?.name ?? "Flex");
}
