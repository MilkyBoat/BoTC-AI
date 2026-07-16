import { shallowMount } from "@vue/test-utils";
import Modal from "@/components/modals/Modal.vue";

const mountModal = () =>
  shallowMount(Modal, {
    slots: {
      default: '<p data-testid="modal-content">测试内容</p>',
    },
    stubs: {
      "font-awesome-icon": {
        props: ["icon"],
        template: '<button class="icon-stub" @click="$emit(\'click\')" />',
      },
    },
  });

describe("Modal", () => {
  test("展示插槽内容，并在点击遮罩时通知调用方关闭", async () => {
    const wrapper = mountModal();

    expect(wrapper.find("[role='dialog']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='modal-content']").text()).toBe(
      "测试内容",
    );

    await wrapper.find(".modal-backdrop").trigger("click");

    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  test("点击弹窗正文不会关闭，最大化按钮会更新可观察样式", async () => {
    const wrapper = mountModal();

    await wrapper.find(".modal").trigger("click");
    expect(wrapper.emitted("close")).toBeUndefined();

    await wrapper.findAll(".icon-stub").at(0).trigger("click");
    expect(wrapper.find(".modal").classes()).toContain("maximized");
  });
});
