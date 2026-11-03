-- Where payments go when nothing else places them (null → the app falls back to "Small stuff", then Flex).
-- The composite key keeps it pointing at one of the owner's own envelopes.
alter table public.profiles
  add column default_envelope_id uuid,
  add foreign key (default_envelope_id, id) references public.envelopes (id, user_id) on delete set null (default_envelope_id);
