import {
  createBadMoonRisingDomainProtocol,
  createBadMoonRisingGameCommand,
  createBadMoonRisingParticipantView,
  createBadMoonRisingStartCommand,
} from "@/domain/rulesets/bad-moon-rising";

const roleIds = [
  "pukka",
  "godfather",
  "lunatic",
  "moonchild",
  "grandmother",
  "sailor",
  "chambermaid",
  "gambler",
];
const assignments = roleIds.map((actualRoleId, index) => ({
  seatId: `seat-${index + 1}`,
  order: index + 1,
  actualRoleId,
  perceivedRoleId: actualRoleId === "lunatic" ? "shabaloth" : actualRoleId,
  roleInstanceId: `role-${index + 1}`,
}));

const start = () => {
  let sequence = 0;
  const engine = createBadMoonRisingDomainProtocol({
    gameId: "game-bmr-view",
    clock: () => "2026-07-17T12:00:00Z",
    idFactory: (kind) => `${kind}-bmr-view-${++sequence}`,
  });
  engine.dispatch(
    createBadMoonRisingGameCommand({
      commandId: "create-bmr-view",
      gameId: "game-bmr-view",
      expectedRevision: 0,
      actor: { kind: "host", id: "host-view" },
      seed: "bmr-view-seed",
    }),
  );
  engine.dispatch(
    createBadMoonRisingStartCommand({
      commandId: "start-bmr-view",
      gameId: "game-bmr-view",
      expectedRevision: 1,
      actor: { kind: "host", id: "host-view" },
      assignments,
      godfatherDelta: 1,
      grandchildSeatId: "seat-6",
      demonBluffs: ["innkeeper", "professor", "tinker"],
      lunaticMinionSeatIds: ["seat-5"],
      lunaticBluffs: ["tealady", "pacifist", "fool"],
    }),
  );
  return engine.getState();
};

describe("M1-R8《黯月初升》权限投影", () => {
  test("公开与旁观不含角色真相、疯子信息、来源或裁量", () => {
    const state = start();
    for (const kind of ["public", "observer"]) {
      const serialized = JSON.stringify(
        createBadMoonRisingParticipantView(state, { kind }),
      );
      expect(serialized).not.toContain("actualRoleId");
      expect(serialized).not.toContain("perceivedRoleId");
      expect(serialized).not.toContain("lunaticBluffs");
      expect(serialized).not.toContain("demonBluffs");
      expect(serialized).not.toContain("ruleSourceIds");
    }
  });

  test("疯子只看到感知恶魔和自己的伪信息，不得知真实身份", () => {
    const state = start();
    const view = createBadMoonRisingParticipantView(state, {
      kind: "seat",
      seatId: "seat-3",
    });
    expect(view.self).toMatchObject({
      perceivedRoleId: "shabaloth",
      perceivedAlignment: "evil",
    });
    expect(view.self.information).toHaveLength(1);
    expect(view.self.information[0].content.result).toMatchObject({
      kind: "lunatic-information",
      minionSeatIds: ["seat-5"],
    });
    expect(JSON.stringify(view.self)).not.toContain('"lunatic"');
  });

  test("真实恶魔获知疯子，祖母与教父信息只投递各自席位", () => {
    const state = start();
    const demon = createBadMoonRisingParticipantView(state, {
      kind: "seat",
      seatId: "seat-1",
    });
    expect(demon.self.information[0].content.result).toMatchObject({
      kind: "demon-information",
      lunaticSeatId: "seat-3",
    });
    const grandmother = createBadMoonRisingParticipantView(state, {
      kind: "seat",
      seatId: "seat-5",
    });
    expect(grandmother.self.information[0].content.result).toMatchObject({
      kind: "grandchild-information",
      grandchildSeatId: "seat-6",
      roleId: "sailor",
    });
    expect(JSON.stringify(grandmother)).not.toContain("outsider-information");
  });

  test("只有说书人看到完整真相、设置、死亡来源和全部私密信息", () => {
    const state = start();
    const storyteller = createBadMoonRisingParticipantView(state, {
      kind: "storyteller",
    });
    expect(storyteller.seats[2]).toMatchObject({
      actualRoleId: "lunatic",
      perceivedRoleId: "shabaloth",
      alignment: "good",
    });
    expect(storyteller.setup).toMatchObject({ lunaticSeatId: "seat-3" });
    expect(storyteller.information.length).toBeGreaterThanOrEqual(5);
  });
});
