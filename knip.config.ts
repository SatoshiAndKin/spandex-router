import type { KnipConfig } from "knip";

const config: KnipConfig = {
  project: ["src/**/*.ts"],
  ignoreDependencies: ["pino-pretty"],
  ignoreExportsUsedInFile: true,
};

export default config;
