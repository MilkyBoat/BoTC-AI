module.exports = {
  preset: "@vue/cli-plugin-unit-jest",
  clearMocks: true,
  testMatch: [
    "<rootDir>/tests/unit/**/*.spec.js",
    "<rootDir>/tests/component/**/*.spec.js",
    "<rootDir>/tests/scenario/**/*.spec.js",
  ],
  collectCoverageFrom: ["src/**/*.{js,vue}", "!src/main.js"],
  coverageDirectory: "coverage",
  coverageReporters: ["text-summary", "html", "lcov"],
};
