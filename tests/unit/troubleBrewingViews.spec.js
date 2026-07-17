import {
  createTroubleBrewingDomainProtocol,
  createTroubleBrewingGameCommand,
  createTroubleBrewingParticipantView,
  createTroubleBrewingStartCommand,
} from "@/domain/rulesets/trouble-brewing";

const HOST = Object.freeze({ kind: "host", id: "host-tb-view" });

const start = (roleIds, { perceived = {}, demonBluffs = [] } = {}) => {
  const gameId = `game-view-${roleIds.length}`;
  let sequence = 0;
  const engine = createTroubleBrewingDomainProtocol({
    gameId,
    clock: () => "2026-07-17T21:30:00.000Z",
    idFactory: (kind) => `${kind}-tb-view-${++sequence}`,
  });
  engine.dispatch(
    createTroubleBrewingGameCommand({
      commandId: "command-create",
      gameId,
      expectedRevision: 0,
      actor: HOST,
      seed: "fixed-seed-tb-view",
    }),
  );
  engine.dispatch(
    createTroubleBrewingStartCommand({
      commandId: "command-start",
      gameId,
      expectedRevision: 1,
      actor: HOST,
      assignments: roleIds.map((actualRoleId, index) => ({
        seatId: `seat-${index + 1}`,
        order: index + 1,
        actualRoleId,
        perceivedRoleId: perceived[actualRoleId] ?? actualRoleId,
        roleInstanceId: `role-${index + 1}`,
      })),
      redHerringSeatId: null,
      demonBluffs,
    }),
  );
  return engine.getState();
};

describe("M1-R7《暗流涌动》权限投影", () => {
  test("公开与旁观视图不含真相角色、感知角色、邪恶信息或裁量状态", () => {
    const state = start(
      ["imp", "poisoner", "slayer", "chef", "empath", "monk", "virgin"],
      { demonBluffs: ["washerwoman", "librarian", "saint"] },
    );
    for (const kind of ["public", "observer"]) {
      const view = createTroubleBrewingParticipantView(state, { kind });
      const serialized = JSON.stringify(view);
      expect(serialized).not.toContain("actualRoleId");
      expect(serialized).not.toContain("perceivedRoleId");
      expect(serialized).not.toContain("demonBluffs");
      expect(serialized).not.toContain("adjudication");
    }
  });

  test("爪牙只获知恶魔，恶魔获知爪牙与三个伪装角色，善良玩家均不可见", () => {
    const state = start(
      ["imp", "poisoner", "slayer", "chef", "empath", "monk", "virgin"],
      { demonBluffs: ["washerwoman", "librarian", "saint"] },
    );
    const minion = createTroubleBrewingParticipantView(state, {
      kind: "seat",
      seatId: "seat-2",
    });
    expect(minion.self.information[0].content).toMatchObject({
      kind: "evil-recognition",
      content: { demonSeatIds: ["seat-1"] },
    });
    expect(JSON.stringify(minion)).not.toContain("demonBluffs");

    const demon = createTroubleBrewingParticipantView(state, {
      kind: "seat",
      seatId: "seat-1",
    });
    expect(demon.self.information[0].content).toMatchObject({
      kind: "demon-information",
      content: {
        minionSeatIds: ["seat-2"],
        demonBluffs: ["washerwoman", "librarian", "saint"],
      },
    });
    const good = createTroubleBrewingParticipantView(state, {
      kind: "seat",
      seatId: "seat-3",
    });
    expect(good.self.information).toEqual([]);
  });

  test("酒鬼只看到伪装镇民，只有说书人能读取真实外来者身份", () => {
    const state = start(["imp", "baron", "drunk", "saint", "chef"], {
      perceived: { drunk: "empath" },
    });
    const drunk = createTroubleBrewingParticipantView(state, {
      kind: "seat",
      seatId: "seat-3",
    });
    expect(drunk.self).toMatchObject({
      perceivedRoleId: "empath",
      perceivedAlignment: "good",
    });
    expect(JSON.stringify(drunk)).not.toContain('"drunk"');

    const storyteller = createTroubleBrewingParticipantView(state, {
      kind: "storyteller",
    });
    expect(storyteller.seats[2]).toMatchObject({
      actualRoleId: "drunk",
      perceivedRoleId: "empath",
      characterType: "outsider",
    });
  });
});
