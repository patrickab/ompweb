import { readdirSync } from "fs";
import { basename, join } from "path";
import type { NextConfig } from "next";
import { withFraming } from "./framing";

type WebpackConfig = Parameters<NonNullable<NextConfig["webpack"]>>[0];

const OVERRIDES_DIR = "custom/overrides";
const MODULE_EXTENSION = /\.(tsx?|jsx?)$/;

/** Upstream module path (e.g. `components/ThemeSwitcher`) and the file replacing it. */
type ModuleOverride = { upstreamModule: string; replacementFile: string };

/** Every file under custom/overrides replaces the upstream module at the same path. */
function listModuleOverrides(projectRoot: string): ModuleOverride[] {
  const overridesRoot = join(projectRoot, OVERRIDES_DIR);
  const files = readdirSync(overridesRoot, { recursive: true, encoding: "utf8" }).filter((file) => MODULE_EXTENSION.test(file));
  return files.map((file) => ({
    upstreamModule: file.replace(MODULE_EXTENSION, "").split("\\").join("/"),
    replacementFile: join(overridesRoot, file),
  }));
}

/** Turbopack aliases requests, not files: cover the `@/` import and a sibling's `./` import. */
function turbopackAliases(override: ModuleOverride): [string, string][] {
  const target = `./${OVERRIDES_DIR}/${override.upstreamModule}`;
  return [[`@/${override.upstreamModule}`, target], [`./${basename(override.upstreamModule)}`, target]];
}

/** Webpack swaps the resolved upstream file, whatever the import request looked like. */
function upstreamFilePattern(override: ModuleOverride): RegExp {
  const escaped = override.upstreamModule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\//g, "[\\\\/]");
  return new RegExp(`[\\\\/]${escaped}\\.(tsx?|jsx?)$`);
}

/**
 * Apply the fork's changes to upstream's Next config.
 *
 * - Module overrides: `next dev` runs Turbopack, `next build --webpack` runs webpack, so both get them
 * - A replacement must not import the module it replaces, the alias would point back at itself
 * - Framing by configured origins, see `custom/framing.ts`
 */
export function withCustom(upstreamConfig: (phase: string) => NextConfig) {
  return (phase: string): NextConfig => {
    const config = withFraming(upstreamConfig(phase));
    const overrides = listModuleOverrides(config.outputFileTracingRoot ?? process.cwd());
    return {
      ...config,
      turbopack: {
        ...config.turbopack,
        resolveAlias: { ...config.turbopack?.resolveAlias, ...Object.fromEntries(overrides.flatMap(turbopackAliases)) },
      },
      webpack(webpackConfig: WebpackConfig, context) {
        const result = config.webpack ? config.webpack(webpackConfig, context) : webpackConfig;
        for (const override of overrides) {
          result.plugins.push(new context.webpack.NormalModuleReplacementPlugin(upstreamFilePattern(override), override.replacementFile));
        }
        return result;
      },
    };
  };
}
