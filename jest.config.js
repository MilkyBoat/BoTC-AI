module.exports = {
  preset: "@vue/cli-plugin-unit-jest",
  clearMocks: true,
  testMatch: [
    "<rootDir>/tests/unit/**/*.spec.js",
    "<rootDir>/tests/component/**/*.spec.js",
    "<rootDir>/tests/scenario/**/*.spec.js",
    "<rootDir>/tests/integration/**/*.spec.js",
  ],
  collectCoverageFrom: [
    "src/**/*.{js,vue}",
    "!src/main.js",
    "scripts/wiki-sync/**/*.js",
    "!scripts/wiki-sync/cli.js",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text-summary", "html", "lcov"],
  moduleNameMapper: {
    "^cheerio/slim$": "<rootDir>/node_modules/cheerio/dist/commonjs/slim.js",
  },
  coverageThreshold: {
    "./src/domain/protocol/": {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
    "./src/domain/views/": {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
    "./src/domain/rules/": {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
    "./src/domain/abilities/": {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95,
    },
    "./scripts/wiki-sync/": {
      statements: 75,
      branches: 60,
      functions: 70,
      lines: 75,
    },
  },
};
