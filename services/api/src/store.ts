import type { Address, Hex } from "viem";
import type postgres from "postgres";

export interface VoucherRecord {
  round: Address;
  wallet: Address;
  identityId: Hex;
  funder: Address | null;
  evidenceHash: Hex;
}

export interface StoredEpoch {
  id: number;
  start: number;
  end: number;
  root: Hex;
  tx: Hex | null;
  /** JSON of the epoch's claims: { account, asset, amount (decimal string), proof }[] */
  claims: string;
  tree: string | null;
}

export interface Store {
  putEpoch(e: StoredEpoch): Promise<void>;
  getEpoch(id: number): Promise<StoredEpoch | null>;
  listEpochs(): Promise<StoredEpoch[]>;
  putEvidence(hash: Hex, json: string): Promise<void>;
  getEvidence(hash: Hex): Promise<string | null>;
  vouchersForRound(round: Address): Promise<VoucherRecord[]>;
  putVoucher(v: VoucherRecord): Promise<void>;
  countDrips(key: string, sinceMs: number): Promise<number>;
  putDrip(key: string, atMs: number): Promise<void>;
  /** Removes one drip recorded at `atMs`, for a drip that was never paid. */
  dropDrip(key: string, atMs: number): Promise<void>;
}

export class MemoryStore implements Store {
  private epochs = new Map<number, StoredEpoch>();
  private evidence = new Map<string, string>();
  private vouchers: VoucherRecord[] = [];
  private drips: { key: string; at: number }[] = [];

  async putEpoch(e: StoredEpoch) {
    this.epochs.set(e.id, e);
  }
  async getEpoch(id: number) {
    return this.epochs.get(id) ?? null;
  }
  async listEpochs() {
    return [...this.epochs.values()].sort((a, b) => a.id - b.id);
  }
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
  async dropDrip(key: string, atMs: number) {
    const i = this.drips.findIndex((d) => d.key === key && d.at === atMs);
    if (i >= 0) this.drips.splice(i, 1);
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
    await this.sql`create table if not exists updraft.epochs (id int primary key, start_ts bigint not null, end_ts bigint not null, root text not null, tx text, claims text not null, tree text)`;
  }

  async putEpoch(e: StoredEpoch) {
    await this.sql`insert into updraft.epochs (id, start_ts, end_ts, root, tx, claims, tree)
      values (${e.id}, ${e.start}, ${e.end}, ${e.root}, ${e.tx}, ${e.claims}, ${e.tree})
      on conflict (id) do update set tx = excluded.tx`;
  }
  async getEpoch(id: number) {
    const rows = await this.sql`select * from updraft.epochs where id = ${id}`;
    return rows.length ? this.toEpoch(rows[0]) : null;
  }
  async listEpochs() {
    const rows = await this.sql`select * from updraft.epochs order by id`;
    return rows.map((r) => this.toEpoch(r));
  }
  private toEpoch(r: Record<string, unknown>): StoredEpoch {
    return {
      id: Number(r.id),
      start: Number(r.start_ts),
      end: Number(r.end_ts),
      root: r.root as Hex,
      tx: (r.tx as Hex | null) ?? null,
      claims: r.claims as string,
      tree: (r.tree as string | null) ?? null,
    };
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
  async dropDrip(key: string, atMs: number) {
    await this.sql`delete from updraft.drips where ctid = (select ctid from updraft.drips where key = ${key} and at = ${atMs} limit 1)`;
  }
}
