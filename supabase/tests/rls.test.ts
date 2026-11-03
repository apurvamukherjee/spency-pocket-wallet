import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

// Runs the real migration in an in-process Postgres with a small stand-in for Supabase's auth schema, then
// tries to break row level security as another user and as an anonymous visitor.

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const ENV_A = "aaaaaaaa-0000-0000-0000-000000000001";
const BILL_A = "aaaaaaaa-0000-0000-0000-000000000002";
const TABLES = ["profiles", "month_plans", "envelopes", "commitments", "transactions", "merchant_memory", "reconcile_checks"];

const db = new PGlite();

async function as<T>(user: string | "anon", fn: () => Promise<T>): Promise<T> {
  await db.exec(user === "anon" ? "set role anon" : `set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  }
}

const count = async (sql: string) => (await db.query<{ n: number }>(`select (${sql})::int as n`)).rows[0].n;

beforeAll(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `);
  await db.exec(await readFile(new URL("../migrations/20261103000000_init.sql", import.meta.url), "utf8"));
  await db.exec(`
    insert into auth.users values ('${A}', 'a@example.com', '{"display_name":"Asha","currency":"EUR","locale":"de-DE","time_zone":"Europe/Berlin"}');
    insert into auth.users values ('${B}', 'b@example.com', '{"currency":"not-a-code","locale":"x","time_zone":""}');
  `);
  await as(A, () =>
    db.exec(`
      insert into month_plans (month, opening_bank, balance_at, target) values ('2026-11', 8000000, now(), 7000000);
      insert into envelopes (id, name, weekly_limit) values ('${ENV_A}', 'Groceries', 50000);
      insert into commitments (id, name, amount, frequency, next_debit) values ('${BILL_A}', 'Rent', 1800000, 'monthly', '2026-11-05');
      insert into transactions (wallet, amount, direction, merchant, envelope_id, occurred_at, upi_ref) values ('bank', 24900, 'debit', 'Shop', '${ENV_A}', now(), 'REF-1');
      insert into merchant_memory (merchant, envelope_id) values ('shop', '${ENV_A}');
      insert into reconcile_checks (date, computed, actual, resolution) values ('2026-11-03', 1, 1, 'matched');
    `),
  );
}, 30_000);

describe("signup trigger", () => {
  it("keeps valid metadata and falls back on malformed values", async () => {
    const rows = (await db.query<Record<string, string>>("select id, currency, locale, time_zone from public.profiles order by id")).rows;
    expect(rows[0]).toMatchObject({ currency: "EUR", locale: "de-DE", time_zone: "Europe/Berlin" });
    expect(rows[1]).toMatchObject({ currency: "USD", locale: "en-US", time_zone: "UTC" });
  });
});

describe("another user", () => {
  it.each(TABLES)("sees only their own rows in %s", async (t) => {
    expect(await as(B, () => count(`select count(*) from ${t}`))).toBe(t === "profiles" ? 1 : 0);
  });

  it("cannot change or delete the owner's rows", async () => {
    await as(B, async () => {
      expect((await db.query(`update envelopes set weekly_limit = 1 where id = '${ENV_A}'`)).affectedRows).toBe(0);
      expect((await db.query(`delete from transactions where user_id = '${A}'`)).affectedRows).toBe(0);
      expect((await db.query(`update profiles set display_name = 'x' where id = '${A}'`)).affectedRows).toBe(0);
    });
  });

  it.each([
    ["insert rows as the owner", `insert into transactions (user_id, wallet, amount, direction, occurred_at) values ('${A}', 'bank', 100, 'debit', now())`],
    ["attach a payment to the owner's envelope", `insert into transactions (wallet, amount, direction, occurred_at, envelope_id) values ('bank', 100, 'debit', now(), '${ENV_A}')`],
    ["attach a payment to the owner's bill", `insert into transactions (wallet, amount, direction, occurred_at, commitment_id) values ('bank', 100, 'debit', now(), '${BILL_A}')`],
    ["point merchant memory at the owner's envelope", `insert into merchant_memory (merchant, envelope_id) values ('x', '${ENV_A}')`],
    ["create profiles", `insert into profiles (id) values ('${B}')`],
  ])("cannot %s", async (_, sql) => {
    await expect(as(B, () => db.exec(sql))).rejects.toThrow();
  });
});

describe("anonymous visitors", () => {
  it.each(TABLES)("are denied %s", async (t) => {
    await expect(as("anon", () => db.query(`select * from ${t}`))).rejects.toThrow(/permission denied/);
  });
});

describe("integrity", () => {
  it("rejects invalid values", async () => {
    await as(A, async () => {
      await expect(db.exec("update profiles set currency = 'usd'")).rejects.toThrow();
      await expect(db.exec("insert into transactions (wallet, amount, direction, occurred_at) values ('bank', 0, 'debit', now())")).rejects.toThrow();
      await expect(db.exec("insert into month_plans (month, opening_bank, balance_at, target, salary_amount) values ('2026-12', 1, now(), 1, 100)")).rejects.toThrow();
    });
  });

  it("allows a payment reference once while live, again after dismissal", async () => {
    await as(A, async () => {
      const add = "insert into transactions (wallet, amount, direction, occurred_at, upi_ref) values ('bank', 1, 'debit', now(), 'REF-1')";
      await expect(db.exec(add)).rejects.toThrow();
      await db.exec("update transactions set status = 'rejected' where upi_ref = 'REF-1'");
      await expect(db.exec(add)).resolves.toBeDefined();
    });
  });

  it("moves history and merchant memory to flex when an envelope is deleted", async () => {
    await as(A, async () => {
      await db.exec(`delete from envelopes where id = '${ENV_A}'`);
      expect(await count(`select count(*) from transactions where merchant = 'Shop' and envelope_id is null and user_id = '${A}'`)).toBe(1);
      expect(await count("select count(*) from merchant_memory where merchant = 'shop' and envelope_id is null")).toBe(1);
    });
  });

  it("hard reset clears only the caller's data and keeps their profile", async () => {
    await as(A, async () => {
      for (const t of ["transactions", "merchant_memory", "reconcile_checks", "month_plans", "envelopes", "commitments"]) {
        await db.exec(`delete from ${t} where user_id = '${A}'`);
      }
      expect(await count("select (select count(*) from transactions) + (select count(*) from month_plans) + (select count(*) from commitments)")).toBe(0);
      expect(await count("select count(*) from profiles")).toBe(1);
    });
    expect(await count(`select count(*) from profiles where id = '${B}'`)).toBe(1);
  });

  it("removes the profile when the auth user is deleted", async () => {
    await db.exec(`delete from auth.users where id = '${A}'`);
    expect(await count(`select count(*) from profiles where id = '${A}'`)).toBe(0);
  });
});
