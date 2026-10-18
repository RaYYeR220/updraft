import type { Address, Hex } from "viem";
import type postgres from "postgres";

export interface VoucherRecord {
  round: Address;
  wallet: Address;
  identityId: Hex;
  funder: Address | null;
  evidenceHash: Hex;
}

export interface Store {
  putEvidence(hash: Hex, json: string): Promise<void>;
  getEvidence(hash: Hex): Promise<string | null>;
  vouchersForRound(round: Address): Promise<VoucherRecord[]>;
  putVoucher(v: VoucherRecord): Promise<void>;
  countDrips(key: string, sinceMs: number): Promise<number>;
  putDrip(key: string, atMs: number): Promise<void>;
}

export class MemoryStore implements Store {
  private evidence = new Map<string, string>();
  private vouchers: VoucherRecord[] = [];
  private drips: { key: string; at: number }[] = [];

  async putEvidence(hash: Hex, json: string) {
    this.evidence.set(hash, json);
  }
  async getEvidence(hash: Hex) {
    return this.evidence.get(hash) ?? null;
  }
  async vouchersForRound(round: Address) {
    return this.vouchers.filter((v) => v.round.toLowerCase() === round.toLowerCase());
  }
  async putVoucher(v: VoucherRecord) {
    this.vouchers = this.vouchers.filter(
      (x) => !(x.round.toLowerCase() === v.round.toLowerCase() && x.wallet.toLowerCase() === v.wallet.toLowerCase()),
    );
    this.vouchers.push(v);
  }
  async countDrips(key: string, sinceMs: number) {
    return this.drips.filter((d) => d.key === key && d.at >= sinceMs).length;
  }
  async putDrip(key: string, atMs: number) {
    this.drips.push({ key, at: atMs });
  }
}

/** Postgres-backed store; everything lives in the `updraft` schema. */
export class PgStore implements Store {
  constructor(private sql: postgres.Sql) {}

  async migrate() {
    await this.sql`create schema if not exists updraft`;
    await this.sql`create table if not exists updraft.evidence (hash text primary key, json text not null, created_at timestamptz not null default now())`;
    await this.sql`create table if not exists updraft.vouchers (round text not null, wallet text not null, identity_id text not null, funder text, evidence_hash text not null, created_at timestamptz not null default now(), primary key (round, wallet))`;
    await this.sql`create table if not exists updraft.drips (key text not null, at bigint not null)`;
    await this.sql`create index if not exists drips_key_at on updraft.drips (key, at)`;
  }

  async putEvidence(hash: Hex, json: string) {
    await this.sql`insert into updraft.evidence (hash, json) values (${hash}, ${json}) on conflict (hash) do nothing`;
  }
  async getEvidence(hash: Hex) {
    const rows = await this.sql`select json from updraft.evidence where hash = ${hash}`;
    return rows.length ? (rows[0].json as string) : null;
  }
  async vouchersForRound(round: Address) {
    const rows = await this.sql`select round, wallet, identity_id, funder, evidence_hash from updraft.vouchers where round = ${round.toLowerCase()}`;
    return rows.map((r) => ({
      round: r.round as Address,
      wallet: r.wallet as Address,
      identityId: r.identity_id as Hex,
      funder: (r.funder as Address | null) ?? null,
      evidenceHash: r.evidence_hash as Hex,
    }));
  }
  async putVoucher(v: VoucherRecord) {
    await this.sql`insert into updraft.vouchers (round, wallet, identity_id, funder, evidence_hash)
      values (${v.round.toLowerCase()}, ${v.wallet.toLowerCase()}, ${v.identityId}, ${v.funder?.toLowerCase() ?? null}, ${v.evidenceHash})
      on conflict (round, wallet) do update set identity_id = excluded.identity_id, funder = excluded.funder, evidence_hash = excluded.evidence_hash`;
  }
  async countDrips(key: string, sinceMs: number) {
    const rows = await this.sql`select count(*)::int as n from updraft.drips where key = ${key} and at >= ${sinceMs}`;
    return rows[0].n as number;
  }
  async putDrip(key: string, atMs: number) {
    await this.sql`insert into updraft.drips (key, at) values (${key}, ${atMs})`;
  }
}
