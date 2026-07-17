import {
  M1_ROLE_ABILITY_FRAMEWORK_PACKAGE,
  ROLE_ABILITY_FRAMEWORK_VERSION,
  calculateRoleAbilityPackageIntegrity,
  createRoleAbilityPackage,
  isRoleAbilityPackageError,
} from "@/domain/abilities";
import { DomainProtocolError, M1_RULESET_IDENTITY } from "@/domain/protocol";

const 空处理器 = Object.freeze({});

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
