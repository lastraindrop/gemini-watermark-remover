// eslint.config.js
export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Browser
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        URL: "readonly",
        ImageData: "readonly",
        Uint8ClampedArray: "readonly",
        Float32Array: "readonly",
        ArrayBuffer: "readonly",
        Worker: "readonly",
        Blob: "readonly",
        fetch: "readonly",
        MessageChannel: "readonly",
        Image: "readonly",
        // Node
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        // Userscript
        GM_xmlhttpRequest: "readonly",
        GM_info: "readonly",
        unsafeWindow: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "no-console": "off",
      "no-undef": "error",
      "no-constant-condition": "warn",
      "semi": ["error", "always"],
      "quotes": ["error", "single", { "avoidEscape": true }],
      "curly": ["error", "multi-line"]
    }
  }
];
