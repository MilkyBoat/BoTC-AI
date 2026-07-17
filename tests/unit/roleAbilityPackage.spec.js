import {
  M1_ROLE_ABILITY_FRAMEWORK_PACKAGE,
  ROLE_ABILITY_FRAMEWORK_VERSION,
  calculateRoleAbilityPackageIntegrity,
  createRoleAbilityPackage,
  isRoleAbilityPackageError,
} from "@/domain/abilities";
import { DomainProtocolError, M1_RULESET_IDENTITY } from "@/domain/protocol";
import 暗流涌动来源 from "../../knowledge/rulesets/trouble-brewing-sources.json";

const 空处理器 = Object.freeze({});

const 创建包内来源 = (覆盖 = {}) => ({
  id: "zh-wiki-role-fictional",
  title: "虚构角色",
  language: "zh-CN",
  authority: "official-zh",
  url: "https://clocktower-wiki.gstonegames.com/index.php?title=虚构角色&oldid=100",
  revision: 100,
  revisedAt: "2026-07-17T00:00:00Z",
  contentHash:
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  contentHashScope: "mediawiki-wikitext",
  ...覆盖,
});

const 创建虚构清单 = (覆盖 = {}) => {
  const 清单 = {
    $schema: "./role-ability-package.schema.json",
    packageId: "test.fictional-role-package",
    version: "1.0.0",
    frameworkVersion: ROLE_ABILITY_FRAMEWORK_VERSION,
    canonicalLanguage: "zh-CN",
    ruleset: M1_RULESET_IDENTITY,
    eventTypes: ["test.ability-applied"],
    abilities: [
      {
        abilityId: "test.fictional-ability",
        roleId: "test.fictional-role",
        handlerId: "test.fictional-handler",
        sourceRefs: [{ sourceId: "zh-wiki-important-details" }],
        triggers: [
          {
            triggerId: "test.first-night",
            kind: "first-night",
            priority: 100,
            actor: "storyteller",
            skippable: false,
          },
        ],
        actionInputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
        allowedEventTypes: ["test.ability-applied"],
        usageLimit: 1,
        retainsAfterDeath: false,
        intoxicationPolicy: "suppress",
      },
    ],
    ...覆盖,
  };
  清单.integrity = {
    algorithm: "sha256",
    scope: "manifest-without-integrity",
    value: calculateRoleAbilityPackageIntegrity(清单),
  };
  return 清单;
};

const 处理器 = {
  "test.fictional-handler": Object.freeze({
    resolve: () => ({
      events: [{ type: "test.ability-applied", payload: {} }],
      ongoingEffects: [],
      delayedEffects: [],
      adjudicationTask: null,
      consumeUse: true,
    }),
  }),
};

const 事件定义 = [
  {
    type: "test.ability-applied",
    payloadSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    reduce: (state) => state,
  },
];

const 捕获错误 = (执行, code) => {
  expect(执行).toThrow(DomainProtocolError);
  try {
    执行();
  } catch (错误) {
    expect(错误.code).toBe(code);
  }
};

describe("M1-R6 版本化角色能力规则包", () => {
  test("仓库空框架包身份固定且不宣称实现具体角色", () => {
    expect(M1_ROLE_ABILITY_FRAMEWORK_PACKAGE.identity).toEqual({
      id: "botc-ai.m1-role-ability-framework",
      version: "0.1.0",
      frameworkVersion: ROLE_ABILITY_FRAMEWORK_VERSION,
      integrity:
        "sha256:8d8cf6a02185c5bc9791e31e04b58070e8fd007a5c75a64a64e1d546ebbbbf26",
    });
    expect(M1_ROLE_ABILITY_FRAMEWORK_PACKAGE.manifest.abilities).toEqual([]);
    expect(M1_ROLE_ABILITY_FRAMEWORK_PACKAGE.manifest.ruleset).toEqual(
      M1_RULESET_IDENTITY,
    );
    expect(Object.isFrozen(M1_ROLE_ABILITY_FRAMEWORK_PACKAGE)).toBe(true);
  });

  test("编译严格清单、处理器和语义事件定义", () => {
    const 规则包 = createRoleAbilityPackage({
      manifest: 创建虚构清单(),
      handlers: 处理器,
      eventDefinitions: 事件定义,
    });

    expect(规则包.identity).toMatchObject({
      id: "test.fictional-role-package",
      version: "1.0.0",
      frameworkVersion: ROLE_ABILITY_FRAMEWORK_VERSION,
    });
    expect(规则包.getAbilityDefinition("test.fictional-ability")).toMatchObject(
      { roleId: "test.fictional-role" },
    );
    expect(规则包.getHandler("test.fictional-handler")).toBe(
      处理器["test.fictional-handler"],
    );
    expect(规则包.getAbilityDefinition("missing")).toBeNull();
    expect(规则包.getHandler("missing")).toBeNull();
    expect(规则包.getValidators("missing")).toBeNull();
    expect(规则包.eventDefinitions).toHaveLength(1);
  });

  test("包内固定来源参与引用校验、完整性计算和不可变运行时", () => {
    const 清单 = 创建虚构清单({
      sources: 暗流涌动来源.sources,
    });
    清单.abilities[0].sourceRefs = [
      { sourceId: "zh-wiki-important-details" },
      { sourceId: "zh-wiki-role-washerwoman" },
    ];
    清单.integrity.value = calculateRoleAbilityPackageIntegrity(清单);

    const 规则包 = createRoleAbilityPackage({
      manifest: 清单,
      handlers: 处理器,
      eventDefinitions: 事件定义,
    });

    expect(规则包.manifest.sources).toHaveLength(22);
    expect(规则包.manifest.sources[0]).toMatchObject({
      id: "zh-wiki-role-baron",
      revision: 6143,
      contentHashScope: "mediawiki-wikitext",
    });
    expect(Object.isFrozen(规则包.manifest.sources)).toBe(true);
    expect(规则包.identity.integrity).toBe(
      calculateRoleAbilityPackageIntegrity(清单),
    );
  });

  test.each([
    [
      "包内来源未按稳定 ID 排序",
      () => {
        const 清单 = 创建虚构清单({
          sources: [
            创建包内来源({ id: "zh-wiki-role-z" }),
            创建包内来源({
              id: "zh-wiki-role-a",
              title: "另一个虚构角色",
              url: "https://clocktower-wiki.gstonegames.com/index.php?title=另一个虚构角色&oldid=100",
            }),
          ],
        });
        清单.integrity.value = calculateRoleAbilityPackageIntegrity(清单);
        return { manifest: 清单, handlers: 处理器, eventDefinitions: 事件定义 };
      },
    ],
    [
      "包内来源 ID 重复",
      () => {
        const 清单 = 创建虚构清单({
          sources: [
            创建包内来源(),
            创建包内来源({
              revision: 101,
              url: "https://clocktower-wiki.gstonegames.com/index.php?title=虚构角色&oldid=101",
            }),
          ],
        });
        清单.integrity.value = calculateRoleAbilityPackageIntegrity(清单);
        return { manifest: 清单, handlers: 处理器, eventDefinitions: 事件定义 };
      },
    ],
    [
      "包内来源与 M1 范围来源冲突",
      () => {
        const 清单 = 创建虚构清单({
          sources: [创建包内来源({ id: "zh-wiki-important-details" })],
        });
        清单.integrity.value = calculateRoleAbilityPackageIntegrity(清单);
        return { manifest: 清单, handlers: 处理器, eventDefinitions: 事件定义 };
      },
    ],
    [
      "包内来源固定 URL 与修订号不一致",
      () => {
        const 清单 = 创建虚构清单({
          sources: [创建包内来源({ revision: 101 })],
        });
        清单.integrity.value = calculateRoleAbilityPackageIntegrity(清单);
        return { manifest: 清单, handlers: 处理器, eventDefinitions: 事件定义 };
      },
    ],
    [
      "包内来源标题与固定 URL 不一致",
      () => {
        const 清单 = 创建虚构清单({
          sources: [创建包内来源({ title: "另一标题" })],
        });
        清单.integrity.value = calculateRoleAbilityPackageIntegrity(清单);
        return { manifest: 清单, handlers: 处理器, eventDefinitions: 事件定义 };
      },
    ],
    [
      "能力引用不存在于 M1 或包内来源",
      () => {
        const 清单 = 创建虚构清单({ sources: [创建包内来源()] });
        清单.abilities[0].sourceRefs = [{ sourceId: "zh-wiki-role-missing" }];
        清单.integrity.value = calculateRoleAbilityPackageIntegrity(清单);
        return { manifest: 清单, handlers: 处理器, eventDefinitions: 事件定义 };
      },
    ],
  ])("%s时拒绝加载规则包", (_名称, 输入) => {
    捕获错误(() => createRoleAbilityPackage(输入()), "INVALID_ROLE_PACKAGE");
  });

  test.each([
    ["非官方中文来源", { authority: "community" }],
    ["非 Wikitext 哈希范围", { contentHashScope: "cleaned-markdown" }],
    ["非法修订时间", { revisedAt: "2026-07-17" }],
    ["非法内容哈希", { contentHash: "sha256:abc" }],
  ])("包内来源包含%s时不符合 Schema", (_名称, 覆盖) => {
    const 清单 = 创建虚构清单({ sources: [创建包内来源(覆盖)] });
    清单.integrity.value = calculateRoleAbilityPackageIntegrity(清单);
    捕获错误(
      () =>
        createRoleAbilityPackage({
          manifest: 清单,
          handlers: 处理器,
          eventDefinitions: 事件定义,
        }),
      "INVALID_ROLE_PACKAGE",
    );
  });

  test.each([
    [
      "清单不符合 Schema",
      () => {
        const 清单 = 创建虚构清单();
        delete 清单.version;
        return { manifest: 清单, handlers: 处理器, eventDefinitions: 事件定义 };
      },
      "INVALID_ROLE_PACKAGE",
    ],
    [
      "事件类型未按稳定 ID 排序",
      () => {
        const 清单 = 创建虚构清单({
          eventTypes: ["test.z-event", "test.ability-applied"],
        });
        return { manifest: 清单, handlers: 处理器, eventDefinitions: 事件定义 };
      },
      "INVALID_ROLE_PACKAGE",
    ],
    [
      "能力定义未按稳定 ID 排序",
      () => {
        const 清单 = 创建虚构清单();
        清单.abilities = [
          { ...清单.abilities[0], abilityId: "test.z-ability" },
          {
            ...清单.abilities[0],
            abilityId: "test.a-ability",
            handlerId: "test.another-handler",
          },
        ];
        清单.integrity.value = calculateRoleAbilityPackageIntegrity(清单);
        return { manifest: 清单, handlers: 处理器, eventDefinitions: 事件定义 };
      },
      "INVALID_ROLE_PACKAGE",
    ],
    [
      "能力触发 ID 重复",
      () => {
        const 清单 = 创建虚构清单();
        清单.abilities[0].triggers.push({ ...清单.abilities[0].triggers[0] });
        清单.integrity.value = calculateRoleAbilityPackageIntegrity(清单);
        return { manifest: 清单, handlers: 处理器, eventDefinitions: 事件定义 };
      },
      "INVALID_ROLE_PACKAGE",
    ],
    [
      "运行时容器类型非法",
      () => ({
        manifest: 创建虚构清单(),
        handlers: [],
        eventDefinitions: 事件定义,
      }),
      "INVALID_ROLE_PACKAGE_RUNTIME",
    ],
    [
      "处理器缺少 resolve",
      () => ({
        manifest: 创建虚构清单(),
        handlers: { "test.fictional-handler": {} },
        eventDefinitions: 事件定义,
      }),
      "INVALID_ROLE_PACKAGE_RUNTIME",
    ],
    [
      "信息能力缺少裁量函数",
      () => {
        const 清单 = 创建虚构清单();
        清单.abilities[0].intoxicationPolicy = "storyteller-information";
        清单.abilities[0].adjudicationResultSchema = {
          type: "object",
          additionalProperties: false,
          properties: {},
        };
        清单.integrity.value = calculateRoleAbilityPackageIntegrity(清单);
        return { manifest: 清单, handlers: 处理器, eventDefinitions: 事件定义 };
      },
      "INVALID_ROLE_PACKAGE_RUNTIME",
    ],
    [
      "语义事件定义结构非法",
      () => ({
        manifest: 创建虚构清单(),
        handlers: 处理器,
        eventDefinitions: [{ ...事件定义[0], reduce: undefined }],
      }),
      "INVALID_ROLE_PACKAGE_RUNTIME",
    ],
    [
      "动态输入 Schema 无法编译",
      () => {
        const 清单 = 创建虚构清单();
        清单.abilities[0].actionInputSchema = { type: "not-a-json-type" };
        清单.integrity.value = calculateRoleAbilityPackageIntegrity(清单);
        return { manifest: 清单, handlers: 处理器, eventDefinitions: 事件定义 };
      },
      "INVALID_ROLE_PACKAGE",
    ],
  ])("%s时给出确定性包错误", (_名称, 输入, code) => {
    捕获错误(() => createRoleAbilityPackage(输入()), code);
  });

  test("非 JSON 清单与错误类型识别均失败关闭", () => {
    let 捕获;
    try {
      createRoleAbilityPackage({ manifest: { invalid: 1n } });
    } catch (错误) {
      捕获 = 错误;
    }
    expect(捕获).toMatchObject({ code: "INVALID_ROLE_PACKAGE" });
    expect(isRoleAbilityPackageError(捕获)).toBe(true);
    expect(isRoleAbilityPackageError(new Error("普通错误"))).toBe(false);
  });

  test.each([
    [
      "内容被篡改",
      () => {
        const 清单 = 创建虚构清单();
        清单.version = "1.0.1";
        return { manifest: 清单, handlers: 处理器, eventDefinitions: 事件定义 };
      },
      "ROLE_PACKAGE_INTEGRITY_MISMATCH",
    ],
    [
      "规则集漂移",
      () => ({
        manifest: 创建虚构清单({
          ruleset: { ...M1_RULESET_IDENTITY, version: "9.0.0" },
        }),
        handlers: 处理器,
        eventDefinitions: 事件定义,
      }),
      "ROLE_PACKAGE_RULESET_MISMATCH",
    ],
    [
      "来源不存在",
      () => {
        const 清单 = 创建虚构清单();
        清单.abilities[0].sourceRefs = [{ sourceId: "source-missing" }];
        清单.integrity.value = calculateRoleAbilityPackageIntegrity(清单);
        return { manifest: 清单, handlers: 处理器, eventDefinitions: 事件定义 };
      },
      "INVALID_ROLE_PACKAGE",
    ],
    [
      "处理器缺失",
      () => ({
        manifest: 创建虚构清单(),
        handlers: 空处理器,
        eventDefinitions: 事件定义,
      }),
      "INVALID_ROLE_PACKAGE_RUNTIME",
    ],
    [
      "语义事件定义缺失",
      () => ({
        manifest: 创建虚构清单(),
        handlers: 处理器,
        eventDefinitions: [],
      }),
      "INVALID_ROLE_PACKAGE_RUNTIME",
    ],
  ])("%s时失败关闭", (_名称, 输入, code) => {
    捕获错误(() => createRoleAbilityPackage(输入()), code);
  });
});
