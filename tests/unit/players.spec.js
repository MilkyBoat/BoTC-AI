import players from "@/store/modules/players";

describe("玩家状态模块", () => {
  let state;

  beforeEach(() => {
    state = players.state();
  });

  test("新增、更新和移除玩家时只改变目标记录", () => {
    players.mutations.add(state, "Alice");
    players.mutations.add(state, "Bob");

    const alice = state.players[0];
    players.mutations.update(state, {
      player: alice,
      property: "pronouns",
      value: "她",
    });
    players.mutations.remove(state, 1);

    expect(state.players).toHaveLength(1);
    expect(state.players[0]).toMatchObject({
      name: "Alice",
      pronouns: "她",
      isDead: false,
      isVoteless: false,
    });
  });

  test("更新不存在的玩家时保持状态不变", () => {
    players.mutations.add(state, "Alice");
    const snapshot = JSON.parse(JSON.stringify(state));

    players.mutations.update(state, {
      player: { name: "Unknown" },
      property: "name",
      value: "Changed",
    });

    expect(state).toEqual(snapshot);
  });
});
