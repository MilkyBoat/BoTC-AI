module.exports = {
  root: true,
  env: {
    node: true,
  },
  extends: ["plugin:vue/essential", "eslint:recommended", "@vue/prettier"],
  parserOptions: {
    ecmaVersion: 2020,
  },
  overrides: [
    {
      files: [
        "tests/unit/**/*.spec.js",
        "tests/component/**/*.spec.js",
        "tests/scenario/**/*.spec.js",
      ],
      env: {
        jest: true,
      },
    },
  ],
  rules: {
    "no-console": process.env.NODE_ENV === "production" ? "warn" : "off",
    "no-debugger": process.env.NODE_ENV === "production" ? "warn" : "off",
    "vue/multi-word-component-names": "off",
    "vue/no-reserved-component-names": "off",
  },
};
