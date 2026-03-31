<template>
  <aside v-if="visible && !session.isSpectator" id="ai-debug-panel">
    <div class="header">
      <h3>AI Debug Panel</h3>
      <button type="button" @click="toggleVisible(false)">×</button>
    </div>
    <section class="config">
      <h4>LLM 配置</h4>
      <div class="config-grid">
        <label>
          Provider
          <select v-model="draftConfig.provider">
            <option value="ark">ark</option>
            <option value="claude">claude</option>
          </select>
        </label>
        <label>
          Model
          <input v-model="draftConfig.model" type="text" />
        </label>
        <label class="full">
          Base URL
          <input v-model="draftConfig.baseURL" type="text" />
        </label>
        <label class="full">
          API Key
          <input v-model="draftConfig.apiKey" type="password" />
        </label>
      </div>
      <button class="primary" type="button" @click="persistConfig">
        保存配置
      </button>
    </section>
    <section class="input-panel">
      <h4>调试输入</h4>
      <div v-if="pendingRequest" class="pending-request">
        <div class="meta">
          <strong>{{ pendingRequest.kind }}</strong>
          <span>{{ formatTs(pendingRequest.ts) }}</span>
        </div>
        <pre>{{ pendingRequest.prompt }}</pre>
        <label v-if="pendingRequest.requireSeat">
          回答座位
          <input v-model.number="draftSeat" type="number" min="0" />
        </label>
        <label>
          回答内容
          <textarea v-model="draftText" rows="4"></textarea>
        </label>
        <button class="primary" type="button" @click="submitPendingInput">
          提交输入
        </button>
      </div>
      <div v-else class="empty">当前没有等待中的输入请求</div>
    </section>
    <section class="latest-state">
      <h4>最新状态</h4>
      <pre>{{ latestState || "暂无状态" }}</pre>
    </section>
    <section class="entries">
      <h4>工具调用</h4>
      <div v-if="!entries.length" class="empty">暂无调用记录</div>
      <div v-for="entry in orderedEntries" :key="entry.id" class="entry">
        <div class="meta">
          <span>{{ formatTs(entry.ts) }}</span>
          <strong>{{ entry.toolName }}</strong>
          <em>{{ entry.commandType }}</em>
        </div>
        <pre>{{ stringify(entry.args) }}</pre>
        <pre>{{ stringify(entry.result) }}</pre>
      </div>
    </section>
    <section class="entries input-history">
      <h4>输入历史</h4>
      <div v-if="!inputHistory.length" class="empty">暂无输入历史</div>
      <div v-for="entry in orderedInputHistory" :key="entry.id" class="entry">
        <div class="meta">
          <span>{{ formatTs(entry.ts) }}</span>
          <strong>{{ entry.kind }}</strong>
          <em>{{ entry.type }}</em>
        </div>
        <pre>{{ stringify(entry.prompt || entry.text || "") }}</pre>
      </div>
    </section>
  </aside>
</template>

<script>
import { mapActions, mapMutations, mapState } from "vuex";

export default {
  data() {
    return {
      draftConfig: {
        apiKey: "",
        baseURL: "",
        model: "",
        provider: "ark",
      },
      draftSeat: 0,
      draftText: "",
    };
  },
  computed: {
    ...mapState(["session"]),
    ...mapState("aiDebug", [
      "config",
      "entries",
      "inputHistory",
      "latestState",
      "pendingRequest",
      "visible",
    ]),
    orderedEntries() {
      return this.entries.slice().reverse().slice(0, 20);
    },
    orderedInputHistory() {
      return this.inputHistory.slice().reverse().slice(0, 20);
    },
  },
  watch: {
    config: {
      handler(nextConfig) {
        this.draftConfig = { ...nextConfig };
      },
      immediate: true,
    },
    pendingRequest: {
      handler(nextRequest) {
        this.draftSeat = Number(nextRequest?.seat || 0);
        this.draftText = "";
      },
      immediate: true,
    },
  },
  methods: {
    ...mapMutations("aiDebug", ["toggleVisible"]),
    ...mapActions("aiDebug", ["saveConfig", "submitInput"]),
    formatTs(ts) {
      return new Date(ts).toLocaleTimeString("zh-CN", {
        hour12: false,
      });
    },
    stringify(value) {
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    },
    persistConfig() {
      this.saveConfig(this.draftConfig);
    },
    submitPendingInput() {
      if (!this.pendingRequest) return;
      this.submitInput({
        seat: this.pendingRequest.requireSeat
          ? this.draftSeat
          : this.pendingRequest.seat,
        text: this.draftText,
      });
      this.draftText = "";
    },
  },
};
</script>

<style scoped lang="scss">
#ai-debug-panel {
  position: fixed;
  right: 0;
  top: 60px;
  width: min(56vw, 640px);
  height: calc(100vh - 80px);
  background: rgba(0, 0, 0, 0.55);
  border-left: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 0 24px rgba(0, 0, 0, 0.45);
  z-index: 70;
  display: block;
  padding: 12px;
  backdrop-filter: blur(6px);
  overflow-x: hidden;
  overflow-y: auto;
  box-sizing: border-box;
}

.header,
.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.header button {
  background: transparent;
  color: white;
  border: 0;
  font-size: 20px;
  cursor: pointer;
}

.header h3,
.config h4,
.input-panel h4,
.latest-state h4,
.entries h4 {
  margin: 0 0 8px;
}

.config,
.input-panel,
.latest-state,
.entries {
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 10px;
  overflow: visible;
  margin-bottom: 12px;
}

.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.config-grid .full {
  grid-column: 1 / -1;
}

.config label,
.input-panel label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.config input,
.config select,
.input-panel input,
.input-panel textarea {
  width: 100%;
  background: rgba(255, 255, 255, 0.08);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 6px 8px;
  box-sizing: border-box;
}

.primary {
  margin-top: 8px;
  background: rgba(71, 112, 255, 0.7);
  color: white;
  border: 0;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
}

.input-panel {
  overflow: visible;
}

.entry,
pre {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
}

.entry {
  padding: 8px;
  margin-bottom: 10px;
  overflow: hidden;
}

pre {
  margin: 6px 0 0;
  padding: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  max-height: none;
  overflow-x: auto;
  overflow-y: hidden;
}

.empty {
  opacity: 0.7;
}
</style>
