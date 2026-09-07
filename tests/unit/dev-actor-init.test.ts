import { describe, expect, it } from "vitest";
import {
  chooseActorAction,
  parseInitArguments,
} from "../../database/init-dev-actor.mjs";

describe("local development actor initialization", () => {
  it("creates only from an empty users table and reuses exactly one reserved actor", () => {
    expect(chooseActorAction(0, [])).toEqual({ action: "create" });
    expect(chooseActorAction(1, ["9"])).toEqual({
      action: "reuse",
      actorId: "9",
    });
  });

  it("stops for existing unknown, duplicate, or malformed user states", () => {
    for (const state of [
      [1, []],
      [1, ["1", "2"]],
      [2, ["1"]],
      [1, ["0"]],
    ] as const)
      expect(() => chooseActorAction(...state)).toThrow();
  });

  it("requires paired internal write flags and has a non-connecting help path", () => {
    expect(parseInitArguments([])).toEqual({ help: false, apply: false });
    expect(parseInitArguments(["--apply", "--confirm"])).toEqual({
      help: false,
      apply: true,
    });
    expect(parseInitArguments(["--help"])).toEqual({
      help: true,
      apply: false,
    });
    expect(() => parseInitArguments(["--apply"])).toThrow();
    expect(() => parseInitArguments(["--force"])).toThrow();
  });
});
