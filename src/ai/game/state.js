class AgentState {
  constructor({ players }) {
    this.players = Array.isArray(players)
      ? players.map((player) => ({
          ...player,
          alive: true,
          executed: false,
          tokens: Array.isArray(player.tokens) ? player.tokens.slice() : [],
        }))
      : [];
    this.tokenMap = new Map();
    for (const player of this.players) {
      this.tokenMap.set(
        player.seat,
        new Set((player.tokens || []).map((token) => String(token))),
      );
    }
  }

  getPlayer(seat) {
    return this.players.find((player) => player.seat === seat);
  }

  getTokens(seat) {
    const tokens = this.tokenMap.get(seat);
    return tokens ? Array.from(tokens) : [];
  }

  replaceTokens(seat, tokens) {
    const nextTokens = Array.isArray(tokens)
      ? tokens.map((token) => String(token))
      : [];
    this.tokenMap.set(seat, new Set(nextTokens));
    const player = this.getPlayer(seat);
    if (player) {
      player.tokens = this.getTokens(seat);
    }
  }

  kill(seat) {
    const player = this.getPlayer(seat);
    if (player) {
      player.alive = false;
      player.death = player.death || {};
      player.death.phase = "night";
    }
  }

  markExecuted(seat) {
    const player = this.getPlayer(seat);
    if (player) {
      player.executed = true;
      player.alive = false;
      player.death = player.death || {};
      player.death.phase = "day";
    }
  }

  revive(seat) {
    const player = this.getPlayer(seat);
    if (player) {
      player.alive = true;
      player.executed = false;
      player.death = {};
    }
  }

  isAlive(seat) {
    const player = this.getPlayer(seat);
    return Boolean(player && player.alive);
  }

  aliveCount() {
    return this.players.filter((player) => player.alive).length;
  }

  loadTokenMap(players) {
    for (const item of Array.isArray(players) ? players : []) {
      const player = this.getPlayer(item.seat);
      if (!player) continue;
      player.knownRole = item.knownRole || player.knownRole || null;
      player.realRole = item.realRole || player.realRole || null;
      const tokens = this.tokenMap.get(item.seat) || new Set();
      for (const token of Array.isArray(item.tokens) ? item.tokens : []) {
        tokens.add(String(token));
      }
      this.tokenMap.set(item.seat, tokens);
      player.tokens = this.getTokens(item.seat);
    }
  }

  seatsByRole(roleName) {
    const role = String(roleName);
    return this.players
      .filter((player) => player.alive)
      .filter(
        (player) => player.realRole === role || player.knownRole === role,
      )
      .map((player) => player.seat);
  }

  setRealRole(seat, role) {
    const player = this.getPlayer(seat);
    if (player) {
      player.realRole = role;
    }
  }

  setKnownRole(seat, role) {
    const player = this.getPlayer(seat);
    if (player) {
      player.knownRole = role;
    }
  }

  snapshot() {
    return {
      players: this.players.map((player) => ({
        seat: player.seat,
        alive: player.alive,
        executed: player.executed,
        knownRole: player.knownRole,
        realRole: player.realRole,
        tokens: this.getTokens(player.seat),
      })),
    };
  }
}

function renderStateTable(state) {
  const lines = [];
  const globalTokens = state?.tokenMap?.get(0);
  if (globalTokens && globalTokens.size) {
    lines.push(`全局: ${Array.from(globalTokens).join(", ")}`);
  }
  lines.push("座位\t状态\t可见身份\t真实身份\tTokens");
  for (const player of state.players) {
    lines.push(
      `${player.seat}\t${player.alive ? "存活" : "死亡"}\t${
        player.knownRole || ""
      }\t${player.realRole || ""}\t${state.getTokens(player.seat).join(", ")}`,
    );
  }
  return `\n${lines.join("\n")}`;
}

module.exports = { AgentState, renderStateTable };
