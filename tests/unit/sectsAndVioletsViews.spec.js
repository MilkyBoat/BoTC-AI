import {
  createSectsAndVioletsDomainProtocol,
  createSectsAndVioletsGameCommand,
  createSectsAndVioletsParticipantView,
  createSectsAndVioletsStartCommand,
} from "@/domain/rulesets/sects-and-violets";

const assignments = [
  "clockmaker",
  "dreamer",
  "snakecharmer",
  "mathematician",
  "mutant",
  "sweetheart",
  "eviltwin",
  "fanggu",
].map((actualRoleId, index) => ({
  seatId: `seat-${index + 1}`,
  order: index + 1,
  actualRoleId,
  perceivedRoleId: actualRoleId,
  roleInstanceId: `role-${index + 1}`,
}));

const start = () => {
  let sequence = 0;
  const engine = createSectsAndVioletsDomainProtocol({
    gameId: "game-snv-view",
    clock: () => "2026-07-17T12:00:00.000Z",
    idFactory: (kind) => `${kind}-snv-view-${++sequence}`,
  });
  engine.dispatch(
    createSectsAndVioletsGameCommand({
      commandId: "create-snv-view",
      gameId: "game-snv-view",
      expectedRevision: 0,
      actor: { kind: "host", id: "host-snv-view" },
      seed: "snv-view-seed",
    }),
  );
  engine.dispatch(
    createSectsAndVioletsStartCommand({
      commandId: "start-snv-view",
      gameId: "game-snv-view",
      expectedRevision: 1,
      actor: { kind: "host", id: "host-snv-view" },
      assignments,
      evilTwinSeatId: "seat-7",
      goodTwinSeatId: "seat-1",
      demonBluffs: ["seamstress", "barber", "juggler"],
    }),
  );
  return engine.getState();
};

describe("M1-R9《梦殒春宵》权限投影", () => {
  test("公开与旁观不含角色真相、恶魔伪装、双子绑定或私密信息", () => {
    const state = start();
    for (const kind of ["public", "observer"]) {
      const serialized = JSON.stringify(
        createSectsAndVioletsParticipantView(state, { kind }),
      );
      expect(serialized).not.toContain("actualRoleId");
      expect(serialized).not.toContain("demonBluffs");
      expect(serialized).not.toContain("goodTwinSeatId");
      expect(serialized).not.toContain("ruleSourceIds");
    }
  });

  test("爪牙只看到恶魔和恶魔应知信息，善良双子只看到对立双子", () => {
    const state = start();
    const demon = createSectsAndVioletsParticipantView(state, {
      kind: "seat",
      seatId: "seat-8",
    });
    expect(demon.self.information).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.objectContaining({
            delivered: expect.objectContaining({
              minionSeatIds: ["seat-7"],
              demonBluffs: ["seamstress", "barber", "juggler"],
            }),
          }),
        }),
      ]),
    );
    const goodTwin = createSectsAndVioletsParticipantView(state, {
      kind: "seat",
      seatId: "seat-1",
    });
    expect(JSON.stringify(goodTwin.self)).toContain("seat-7");
    expect(JSON.stringify(goodTwin.self)).not.toContain("seat-8");
  });

  test("只有说书人看到完整真相、设置、裁量和来源", () => {
    const state = start();
    const storyteller = createSectsAndVioletsParticipantView(state, {
      kind: "storyteller",
    });
    expect(storyteller.seats[7]).toMatchObject({
      actualRoleId: "fanggu",
      alignment: "evil",
    });
    expect(storyteller.setup).toMatchObject({
      evilTwinSeatId: "seat-7",
      goodTwinSeatId: "seat-1",
    });
    expect(storyteller.information.length).toBeGreaterThan(0);
  });
});
