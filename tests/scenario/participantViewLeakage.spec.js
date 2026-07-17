import { createParticipantViewService } from "@/domain/views";
import {
  TEST_CREDENTIALS,
  createParticipantViewSourceFixture,
  resolveTestPrincipal,
} from "../fixtures/participantViewSource";

const 创建服务 = () =>
  createParticipantViewService({ resolvePrincipal: resolveTestPrincipal });

const 遍历 = (值, 访问) => {
  if (Array.isArray(值)) {
    值.forEach((子项) => 遍历(子项, 访问));
    return;
  }
  if (值 && typeof 值 === "object") {
    Object.entries(值).forEach(([键, 子项]) => {
      访问(键, 子项);
      遍历(子项, 访问);
    });
  }
};

const 扫描禁止键 = (视图, 禁止键) => {
  const 命中 = [];
  遍历(视图, (键) => {
    if (禁止键.has(键)) 命中.push(键);
  });
  return 命中;
};

const 固定种子随机数 = (初始值) => {
  let 状态 = 初始值 >>> 0;
  return () => {
    状态 = (状态 * 1664525 + 1013904223) >>> 0;
    return 状态 / 0x100000000;
  };
};

describe("M1-R3 参与者视图信息泄漏场景", () => {
  test("公开、旁观和席位视图递归扫描不到禁止的真相与内部字段", () => {
    const 服务 = 创建服务();
    const 源 = createParticipantViewSourceFixture();
    const 禁止键 = new Set([
      "truth",
      "perception",
      "roleId",
      "alignment",
      "statuses",
      "storytellerNotes",
      "adjudicationTasks",
      "auditEntries",
      "principalId",
      "credential",
      "eventId",
      "sequence",
      "causationId",
    ]);

    [TEST_CREDENTIALS.public, TEST_CREDENTIALS.observer].forEach((凭证) => {
      expect(扫描禁止键(服务.createSnapshot(源, 凭证), 禁止键)).toEqual([]);
    });
    expect(
      扫描禁止键(
        服务.createSnapshot(源, TEST_CREDENTIALS.seatA),
        new Set([
          "truth",
          "roleId",
          "alignment",
          "statuses",
          "storytellerNotes",
        ]),
      ),
    ).toEqual([]);
  });

  test("交换席位真相只改变说书人视图，不改变任何席位或公开视图", () => {
    const 服务 = 创建服务();
    const 原源 = createParticipantViewSourceFixture();
    const 交换源 = createParticipantViewSourceFixture();
    [交换源.seats[0].truth, 交换源.seats[1].truth] = [
      交换源.seats[1].truth,
      交换源.seats[0].truth,
    ];
    const 非说书人 = [
      TEST_CREDENTIALS.public,
      TEST_CREDENTIALS.observer,
      TEST_CREDENTIALS.seatA,
      TEST_CREDENTIALS.seatB,
    ];

    非说书人.forEach((凭证) => {
      expect(服务.createSnapshot(交换源, 凭证)).toEqual(
        服务.createSnapshot(原源, 凭证),
      );
    });
    expect(
      服务.createSnapshot(交换源, TEST_CREDENTIALS.storyteller),
    ).not.toEqual(服务.createSnapshot(原源, TEST_CREDENTIALS.storyteller));
  });

  test("更换单席位认知、动作和私密信息只改变说书人及该席位视图", () => {
    const 服务 = 创建服务();
    const 原源 = createParticipantViewSourceFixture();
    const 变更源 = createParticipantViewSourceFixture();
    变更源.seats[0].perception.roleId = "mutated-perception-only-a";
    变更源.seats[0].legalActions[0].label = "mutated-legal-only-a";
    变更源.seatInformation[0].text = "mutated-private-only-a";

    [
      TEST_CREDENTIALS.public,
      TEST_CREDENTIALS.observer,
      TEST_CREDENTIALS.seatB,
    ].forEach((凭证) => {
      expect(服务.createSnapshot(变更源, 凭证)).toEqual(
        服务.createSnapshot(原源, 凭证),
      );
    });
    [TEST_CREDENTIALS.storyteller, TEST_CREDENTIALS.seatA].forEach((凭证) => {
      expect(服务.createSnapshot(变更源, 凭证)).not.toEqual(
        服务.createSnapshot(原源, 凭证),
      );
    });
  });

  test("固定种子生成的唯一敏感值不会跨席位或进入公开/旁观视图", () => {
    const 随机 = 固定种子随机数(20260717);
    const 服务 = 创建服务();

    for (let 轮次 = 0; 轮次 < 24; 轮次 += 1) {
      const 源 = createParticipantViewSourceFixture();
      const 标记A = `fuzz-secret-a-${轮次}-${Math.floor(随机() * 1e9)}`;
      const 标记B = `fuzz-secret-b-${轮次}-${Math.floor(随机() * 1e9)}`;
      源.seats[0].truth.storytellerNotes[0].text = 标记A;
      源.seats[1].truth.storytellerNotes[0].text = 标记B;
      源.seatInformation[0].text = `${标记A}-private`;
      源.seatInformation[1].text = `${标记B}-private`;

      const 公开旁观 = JSON.stringify([
        服务.createSnapshot(源, TEST_CREDENTIALS.public),
        服务.createSnapshot(源, TEST_CREDENTIALS.observer),
      ]);
      const 席位A = JSON.stringify(
        服务.createSnapshot(源, TEST_CREDENTIALS.seatA),
      );
      const 席位B = JSON.stringify(
        服务.createSnapshot(源, TEST_CREDENTIALS.seatB),
      );
      const 说书人 = JSON.stringify(
        服务.createSnapshot(源, TEST_CREDENTIALS.storyteller),
      );

      expect(公开旁观).not.toContain(标记A);
      expect(公开旁观).not.toContain(标记B);
      expect(席位A).not.toContain(标记B);
      expect(席位B).not.toContain(标记A);
      expect(席位A).toContain(`${标记A}-private`);
      expect(席位B).toContain(`${标记B}-private`);
      expect(说书人).toContain(标记A);
      expect(说书人).toContain(标记B);
    }
  });
});
