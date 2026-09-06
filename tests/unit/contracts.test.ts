import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  dateOnly,
  parseContractWrite,
  parseContractQuery,
  shanghaiToday,
} from "../../server/db/contracts-rules";
import { parseMigration, parseS1Migration } from "../../server/db/safety";
import { contractFilter } from "../../server/db/contracts";

const base = {
  studentId: "1",
  subject: "合成数学",
  contractType: "month",
  startDate: "2026-09-06",
  endDate: "2026-09-06",
  attendedLessons: null,
  totalLessons: null,
  makeupLessons: 0,
};
describe("S2 contracts", () => {
  it("validates all four types and mutually exclusive fields", () => {
    for (const type of ["month", "half_year", "year"])
      expect(
        parseContractWrite({ ...base, contractType: type }).contractType,
      ).toBe(type);
    const lesson = {
      ...base,
      contractType: "lessons",
      startDate: null,
      endDate: null,
      attendedLessons: 0,
      totalLessons: 1,
    };
    expect(parseContractWrite(lesson).totalLessons).toBe(1);
    for (const patch of [
      { startDate: base.startDate },
      { totalLessons: 0 },
      { attendedLessons: 2 },
      { attendedLessons: -1 },
      { totalLessons: 1.5 },
      { makeupLessons: -1 },
      { makeupLessons: 4294967296 },
      { attendedLessons: null },
    ])
      expect(() => parseContractWrite({ ...lesson, ...patch })).toThrow();
    for (const patch of [
      { totalLessons: 1 },
      { startDate: null },
      { startDate: "2026-09-07" },
      { endDate: "2026-02-30" },
      { subject: " " },
      { subject: "字".repeat(65) },
      { contractType: "other" },
      { studentId: "0" },
    ])
      expect(() => parseContractWrite({ ...base, ...patch })).toThrow();
  });
  it("rejects supplied numbers, actors, dates and invalid optimistic versions", () => {
    for (const patch of [
      { contractNo: "ignored" },
      { contract_no: "ignored" },
      { actorId: "1" },
      { asOfDate: "2026-09-06" },
    ])
      expect(() => parseContractWrite({ ...base, ...patch })).toThrow();
    expect(
      parseContractWrite({ ...base, id: "2", expectedVersion: 1 }, true),
    ).toMatchObject({ id: "2", expectedVersion: 1 });
    for (const expectedVersion of [undefined, 0, -1, "1", 1.5])
      expect(() =>
        parseContractWrite({ ...base, id: "2", expectedVersion }, true),
      ).toThrow();
  });
  it("uses Shanghai dates across UTC midnight and validates calendar dates", () => {
    expect(shanghaiToday(new Date("2026-09-05T15:59:59Z"))).toBe("2026-09-05");
    expect(shanghaiToday(new Date("2026-09-05T16:00:00Z"))).toBe("2026-09-06");
    expect(dateOnly("2024-02-29")).toBe("2024-02-29");
    for (const date of [
      "2026-02-29",
      "2026-13-01",
      "0001-01-01",
      "2026-09-06T00:00:00Z",
    ])
      expect(() => dateOnly(date)).toThrow();
  });
  it("bounds filter and options pagination and binds SQL values", () => {
    expect(parseContractQuery({}).pageSize).toBe(8);
    expect(parseContractQuery({}, true).pageSize).toBe(20);
    for (const query of [
      { page: "0" },
      { pageSize: "101" },
      { subject: [] },
      { status: "other" },
      { asOfDate: "2026-01-01" },
      { contractType: "other" },
    ])
      expect(() => parseContractQuery(query)).toThrow();
    const filter = contractFilter(
      { keyword: "%' OR 1=1", studentId: "1", status: "生效中" },
      "2026-09-06",
    );
    expect(filter.sql).not.toContain("OR 1=1");
    expect(filter.values).toContain("%!%' OR 1=1%");
    expect(filter.values.slice(-3)).toEqual([
      "2026-09-06",
      "2026-09-06",
      "生效中",
    ]);
  });
  it("S2 migration creates only contracts and cannot expand S1 scope", () => {
    const sql = readFileSync(
      new URL("../../database/migrations/002_contracts.sql", import.meta.url),
      "utf8",
    );
    expect(
      parseMigration(sql, ["contracts"], ["students", "users"]),
    ).toHaveLength(1);
    expect(() => parseS1Migration(sql)).toThrow();
    expect(() =>
      parseMigration("CREATE TABLE tasks (id INT)", ["contracts"], []),
    ).toThrow();
    expect(sql).toContain("UNIQUE KEY uq_contracts_no");
    expect(sql).toContain("chk_contracts_fields");
  });
});
