<template>
  <div class="chat-panel" :class="{ closed: !panels.chat }" :style="panelStyle">
    <h3 class="chat-header">
      <span>聊天</span>
      <font-awesome-icon icon="times-circle" @click.stop="toggleCollapse" />
      <font-awesome-icon icon="plus-circle" @click.stop="toggleCollapse" />
    </h3>
    <div class="chat-body" ref="chatBody">
      <div class="chat-line" v-for="message in messages" :key="message.id">
        <span class="chat-label" :class="labelClass(message)">
          【{{ formatSender(message) }}】
        </span>
        <span class="chat-text">{{ message.text }}</span>
      </div>
    </div>
    <div class="chat-input">
      <select
        v-if="!session.isSpectator"
        v-model="targetSelection"
        class="chat-target"
      >
        <option value="all">全体</option>
        <option
          v-for="option in playerOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
      <input
        v-model="draft"
        class="chat-field"
        type="text"
        placeholder="输入消息"
        @keydown.enter.prevent="send"
      />
      <button class="chat-send" @click="send">发送</button>
    </div>
  </div>
</template>

<script>
import { mapState } from "vuex";

export default {
  computed: {
    ...mapState(["session", "panels"]),
    ...mapState("players", ["players"]),
    ...mapState("chat", ["messages"]),
    panelStyle() {
      const top = 124;
      const bottom = this.players.length ? (this.panels.bluffs ? 190 : 72) : 10;
      if (!this.panels.chat) {
        return {
          top: `${top}px`,
          bottom: "auto",
        };
      }
      return {
        top: `${top}px`,
        bottom: `${bottom}px`,
      };
    },
    playerOptions() {
      return this.players
        .map((player, index) => ({
          index,
          id: player.id,
          name: player.name,
        }))
        .filter((player) => player.id)
        .map((player) => ({
          value: player.id,
          label: player.name
            ? `${player.index + 1}. ${player.name}`
            : `${player.index + 1}`,
        }));
    },
  },
  data() {
    return {
      draft: "",
      targetSelection: "all",
    };
  },
  watch: {
    messages() {
      this.$nextTick(() => {
        const el = this.$refs.chatBody;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
      });
    },
  },
  methods: {
    toggleCollapse() {
      this.$store.commit("togglePanel", "chat");
    },
    labelClass(message) {
      return {
        host: message.from === "host",
      };
    },
    formatPlayerLabel(playerId) {
      const index = this.players.findIndex((player) => player.id === playerId);
      if (index < 0) return this.session.isSpectator ? "你" : "玩家";
      const player = this.players[index];
      return player.name || `${index + 1}`;
    },
    formatSender(message) {
      if (message.from === "host" && message.scope === "direct") {
        const targetLabel = message.target?.playerId
          ? this.formatPlayerLabel(message.target.playerId)
          : this.session.isSpectator
          ? "你"
          : "玩家";
        return `主持人对${targetLabel}私聊`;
      }
      if (message.from === "host") return "主持人";
      if (message.from === "ai") return "AI";
      if (message.fromName) return message.fromName;
      if (message.fromSeat) return message.fromSeat;
      if (message.fromPlayerId) {
        const index = this.players.findIndex(
          (player) => player.id === message.fromPlayerId,
        );
        if (index >= 0) {
          const player = this.players[index];
          return player.name || index + 1;
        }
      }
      return "玩家";
    },
    parseTargetFromDraft(text) {
      const match = text.match(/^@(\S+)\s+(.*)$/);
      if (!match) return null;
      const tag = match[1].toLowerCase();
      const content = match[2].trim();
      if (!content) return null;
      if (tag === "all") {
        return { text: content, target: { type: "broadcast" } };
      }
      if (/^\d+$/.test(tag)) {
        const seatIndex = parseInt(tag, 10) - 1;
        const player = this.players[seatIndex];
        if (player && player.id) {
          return {
            text: content,
            target: { type: "direct", playerId: player.id, seatIndex },
          };
        }
      }
      return null;
    },
    targetFromSelection() {
      if (this.targetSelection === "all") {
        return { type: "broadcast" };
      }
      return { type: "direct", playerId: this.targetSelection };
    },
    send() {
      const trimmed = this.draft.trim();
      if (!trimmed) return;
      let text = trimmed;
      let target = null;
      if (!this.session.isSpectator) {
        const parsed = this.parseTargetFromDraft(trimmed);
        if (parsed) {
          text = parsed.text;
          target = parsed.target;
        } else {
          target = this.targetFromSelection();
        }
      } else {
        target = { type: "direct", playerId: "host" };
      }
      if (!text) return;
      this.$store.dispatch("chat/send", { text, target });
      this.draft = "";
    },
  },
};
</script>

<style lang="scss" scoped>
@import "../vars.scss";

.chat-panel {
  position: fixed;
  left: 10px;
  width: 300px;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 3px solid black;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.5));
  overflow: hidden;
  transition: all 200ms ease-in-out;
  z-index: 45;
}

.chat-header {
  display: flex;
  align-items: center;
  margin: 5px 1vh 0;
  justify-content: center;

  span {
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  svg {
    cursor: pointer;
    flex-grow: 0;

    &.fa-times-circle {
      margin-left: 1vh;
    }

    &.fa-plus-circle {
      margin-left: 1vh;
      display: none;
    }

    &:hover path {
      fill: url(#demon);
      stroke-width: 30px;
      stroke: white;
    }
  }
}

.chat-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 10px;
  transition: all 200ms ease-in-out;
}

.chat-line {
  margin-bottom: 6px;
  word-break: break-word;
  font-size: 0.9em;
}

.chat-label {
  color: $townsfolk;
  margin-right: 4px;

  &.host {
    color: #ffd166;
  }
}

.chat-input {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.8);
  transition: all 200ms ease-in-out;
}

.chat-target {
  max-width: 90px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.chat-field {
  flex: 1;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 4px 6px;
}

.chat-send {
  background: $townsfolk;
  border: none;
  color: white;
  padding: 4px 10px;
  cursor: pointer;
}

.chat-panel.closed {
  width: 126px;
  height: auto !important;

  .chat-header {
    svg.fa-times-circle {
      display: none;
    }

    svg.fa-plus-circle {
      display: block;
    }
  }

  .chat-body,
  .chat-input {
    max-height: 0;
    opacity: 0;
    overflow: hidden;
    padding-top: 0;
    padding-bottom: 0;
    border-top-width: 0;
  }
}
</style>
