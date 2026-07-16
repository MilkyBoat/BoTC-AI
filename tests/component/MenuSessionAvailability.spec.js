import Vuex from "vuex";
import { createLocalVue, shallowMount } from "@vue/test-utils";
import Menu from "@/components/Menu.vue";

const localVue = createLocalVue();
localVue.use(Vuex);

afterEach(() => {
  jest.restoreAllMocks();
});

const mountMenu = (relayStatus) => {
  const store = new Vuex.Store({
    state: {
      grimoire: {
        isMenuOpen: true,
        isPublic: false,
        isNight: false,
        isNightOrder: false,
        isMuted: false,
        isStatic: false,
        isImageOptIn: false,
        zoom: 0,
      },
      edition: { isOfficial: true },
    },
    modules: {
      session: {
        namespaced: true,
        state: {
          sessionId: "",
          isSpectator: false,
          isReconnecting: false,
          playerCount: 0,
          ping: 0,
          voteHistory: [],
          relayStatus,
        },
      },
      players: {
        namespaced: true,
        state: { players: [] },
      },
    },
  });
  jest.spyOn(store, "commit");

  return shallowMount(Menu, {
    localVue,
    store,
    stubs: {
      "font-awesome-icon": true,
    },
  });
};

describe("会话菜单可用性", () => {
  test("中继不可用时显示原因并拒绝打开建房输入", async () => {
    const promptSpy = jest.spyOn(window, "prompt").mockReturnValue("room1");
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    const wrapper = mountMenu({
      available: false,
      url: "",
      message: "当前构建未配置会话中继",
    });

    await wrapper.setData({ tab: "session" });

    expect(wrapper.find("[data-testid='relay-unavailable']").text()).toContain(
      "当前构建未配置会话中继",
    );

    wrapper.vm.hostSession();

    expect(alertSpy).toHaveBeenCalledWith("当前构建未配置会话中继");
    expect(promptSpy).not.toHaveBeenCalled();
    expect(wrapper.vm.$store.commit).not.toHaveBeenCalledWith(
      "session/setSessionId",
      expect.anything(),
    );
  });
});
