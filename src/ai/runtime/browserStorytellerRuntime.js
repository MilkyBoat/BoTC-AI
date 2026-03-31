
import {
  startBrowserStoryteller,
  stopBrowserStoryteller,
} from "./startBrowserStoryteller";

const RUNTIME_KEY = "__blood_on_clocktower_ai_storyteller_runtime__";

const createBrowserStorytellerRuntime = () => ({
  status: "idle",
  startedAt: null,
  stoppedAt: null,
  instanceId: null,
  interactionSubscriptions: 0,
  logCount: 0,
  session: null,
  startPromise: null,
  lifecycleToken: 0,
  async start() {
    if (this.status === "running") {
      return {
        status: this.status,
        startedAt: this.startedAt,
        instanceId: this.instanceId,
        interactionSubscriptions: this.interactionSubscriptions,
        stoppedAt: this.stoppedAt,
        logCount: this.logCount,
        reused: true,
      };
    }
    if (this.startPromise) {
      return this.startPromise;
    }
    const token = ++this.lifecycleToken;
    this.status = "starting";
    this.stoppedAt = null;
    this.startPromise = startBrowserStoryteller({
      existingSession: this.session,
    })
      .then((session) => {
        if (token !== this.lifecycleToken) {
          return {
            status: this.status,
            startedAt: this.startedAt,
            stoppedAt: this.stoppedAt,
            instanceId: this.instanceId,
            cancelled: true,
          };
        }
        this.session = session;
        this.instanceId = session?.sessionId || `runtime-${Date.now()}`;
        this.startedAt = session?.startedAt || Date.now();
        this.status = session?.status || "running";
        this.interactionSubscriptions = Number(
          session?.interactionSubscriptions || 0,
        );
        this.logCount = Number(session?.logCount || 0);
        return {
          status: this.status,
          startedAt: this.startedAt,
          stoppedAt: this.stoppedAt,
          instanceId: this.instanceId,
          interactionSubscriptions: this.interactionSubscriptions,
          logCount: this.logCount,
          mode: session?.mode || "browser-shell",
          reused: Boolean(session?.reused),
        };
      })
      .finally(() => {
        this.startPromise = null;
      });
    return this.startPromise;
  },
  async stop() {
    this.lifecycleToken += 1;
    this.startPromise = null;
    const result = await stopBrowserStoryteller({
      existingSession: this.session,
    });
    this.session = null;
    this.status = result.status;
    this.startedAt = result.startedAt;
    this.instanceId = result.sessionId;
    this.stoppedAt = result.stoppedAt;
    this.interactionSubscriptions = Number(result.interactionSubscriptions || 0);
    this.logCount = Number(result.logCount || 0);
    return {
      status: this.status,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      instanceId: this.instanceId,
      interactionSubscriptions: this.interactionSubscriptions,
      logCount: this.logCount,
      mode: result.mode || "browser-shell",
    };
  },
});

export const getBrowserStorytellerRuntime = () => {
  const scope = globalThis;
  if (!scope[RUNTIME_KEY]) {
    scope[RUNTIME_KEY] = createBrowserStorytellerRuntime();
  }
  return scope[RUNTIME_KEY];
};
