import { M1_RULESET_IDENTITY, PROTOCOL_VERSION } from "@/domain/protocol";

export const VIEW_GAME_ID = "game-m1-r3-001";

export const TEST_CREDENTIALS = Object.freeze({
  storyteller: "credential-storyteller",
  seatA: "credential-seat-a",
  seatAAi: "credential-seat-a-ai",
  seatB: "credential-seat-b",
  public: "credential-public",
  observer: "credential-observer",
  unknownSeat: "credential-seat-missing",
});

export const resolveTestPrincipal = (credential) => {
  const principals = {
    [TEST_CREDENTIALS.storyteller]: {
      kind: "storyteller",
      principalId: "principal-storyteller",
    },
    [TEST_CREDENTIALS.seatA]: {
      kind: "seat",
      principalId: "principal-human-a",
      seatId: "seat-a",
    },
    [TEST_CREDENTIALS.seatAAi]: {
      kind: "seat",
      principalId: "principal-ai-a",
      seatId: "seat-a",
    },
    [TEST_CREDENTIALS.seatB]: {
      kind: "seat",
      principalId: "principal-human-b",
      seatId: "seat-b",
    },
    [TEST_CREDENTIALS.public]: { kind: "public" },
    [TEST_CREDENTIALS.observer]: {
      kind: "observer",
      principalId: "principal-observer",
    },
    [TEST_CREDENTIALS.unknownSeat]: {
      kind: "seat",
      principalId: "principal-missing",
      seatId: "seat-missing",
    },
  };
  return principals[credential];
};

export const createParticipantViewSourceFixture = () => ({
  schemaVersion: "0.1.0",
  game: {
    gameId: VIEW_GAME_ID,
    ruleset: M1_RULESET_IDENTITY,
    status: "running",
    phase: "day",
    publicSpecialRules: [
      {
        ruleId: "special-rule-fiddler",
        order: 1,
        text: "公开特殊规则：提琴手已加入本局。",
      },
    ],
  },
  seats: [
    {
      seatId: "seat-a",
      order: 1,
      displayName: "甲",
      controllerKind: "human",
      publicState: { alive: true, publicRoleId: null },
      truth: {
        roleId: "truth-role-imp-a",
        alignment: "evil",
        statuses: [
          {
            statusId: "truth-status-poison-a",
            type: "poisoned",
            active: true,
            sourceId: "truth-source-b",
          },
        ],
        storytellerNotes: [
          {
            noteId: "truth-note-a",
            order: 1,
            text: "truth-note-marker-a",
          },
        ],
      },
      perception: {
        roleId: "perceived-role-empath-a",
        alignment: "good",
        knownStatuses: [
          {
            knowledgeId: "known-status-a",
            order: 1,
            type: "protected",
            text: "known-status-marker-a",
          },
        ],
      },
      legalActions: [
        {
          actionId: "legal-action-a",
          order: 1,
          type: "nominate",
          label: "legal-action-marker-a",
        },
      ],
      actionHistory: [
        {
          actionId: "history-action-a",
          order: 1,
          type: "whisper",
          summary: "history-action-marker-a",
          status: "completed",
        },
      ],
    },
    {
      seatId: "seat-b",
      order: 2,
      displayName: "乙",
      controllerKind: "ai",
      publicState: { alive: false, publicRoleId: "washerwoman" },
      truth: {
        roleId: "truth-role-drunk-b",
        alignment: "good",
        statuses: [
          {
            statusId: "truth-status-drunk-b",
            type: "drunk",
            active: true,
          },
        ],
        storytellerNotes: [
          {
            noteId: "truth-note-b",
            order: 1,
            text: "truth-note-marker-b",
          },
        ],
      },
      perception: {
        roleId: "perceived-role-washerwoman-b",
        alignment: "good",
        knownStatuses: [],
      },
      legalActions: [],
      actionHistory: [
        {
          actionId: "history-action-b",
          order: 1,
          type: "vote",
          summary: "history-action-marker-b",
          status: "rejected",
        },
      ],
    },
    {
      seatId: "seat-c",
      order: 3,
      displayName: "丙",
      controllerKind: "unassigned",
      publicState: { alive: true, publicRoleId: null },
      truth: {
        roleId: "truth-role-saint-c",
        alignment: "good",
        statuses: [],
        storytellerNotes: [],
      },
      perception: {
        roleId: "perceived-role-saint-c",
        alignment: "good",
        knownStatuses: [],
      },
      legalActions: [],
      actionHistory: [],
    },
  ],
  publicRecords: [
    {
      recordId: "record-announcement",
      order: 1,
      type: "announcement",
      text: "public-announcement-marker",
      historical: true,
    },
    {
      recordId: "record-message",
      order: 2,
      type: "public-message",
      senderSeatId: "seat-a",
      text: "public-message-marker",
      historical: false,
    },
    {
      recordId: "record-nomination",
      order: 3,
      type: "nomination",
      nominatorSeatId: "seat-a",
      nomineeSeatId: "seat-b",
      status: "resolved",
      historical: true,
    },
    {
      recordId: "record-vote",
      order: 4,
      type: "vote-result",
      nomineeSeatId: "seat-b",
      total: 2,
      threshold: 2,
      voterSeatIds: ["seat-a", "seat-c"],
      historical: true,
    },
  ],
  seatInformation: [
    {
      informationId: "information-a",
      order: 1,
      seatId: "seat-a",
      kind: "role-information",
      text: "private-information-marker-a",
    },
    {
      informationId: "information-b",
      order: 2,
      seatId: "seat-b",
      kind: "storyteller-message",
      text: "private-information-marker-b",
    },
  ],
  adjudicationTasks: [
    {
      taskId: "task-storyteller",
      order: 1,
      kind: "choose-red-herring",
      status: "pending",
      summary: "adjudication-marker",
      candidateSeatIds: ["seat-a", "seat-c"],
    },
  ],
  auditEntries: [
    {
      auditId: "audit-entry",
      order: 1,
      kind: "command",
      summary: "audit-marker",
    },
  ],
  observerPolicy: {
    includePublicMessages: true,
    includeVoteDetails: true,
    includeHistory: true,
  },
});

export const createDomainEventFixture = ({
  type = "public.announcement-published",
  payload = { text: "event-public-announcement-marker" },
  sequence = 10,
} = {}) => ({
  protocolVersion: PROTOCOL_VERSION,
  eventId: `event-view-${sequence}`,
  gameId: VIEW_GAME_ID,
  sequence,
  type,
  causationId: `command-view-${sequence}`,
  actor: { kind: "host", id: "host-view-test" },
  recordedAt: "2026-07-17T10:00:00.000Z",
  ruleset: M1_RULESET_IDENTITY,
  payload,
});
