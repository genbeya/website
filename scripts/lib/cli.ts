/** Small helpers shared by the scripts: arguments, paths and logging. */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The website repository's root folder. */
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const generatedDir = path.join(root, "src", "generated");

/** `--name value` and `--flag` arguments; values may also be written `--name=value`. */
export function parseArgs(argv = process.argv.slice(2)): Map<string, string | true> {
  const args = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq > 0) {
      args.set(arg.slice(2, eq), arg.slice(eq + 1));
    } else if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("--")) {
      args.set(arg.slice(2), argv[++i]!);
    } else {
      args.set(arg.slice(2), true);
    }
  }
  return args;
}

/** A string option from the arguments, then the environment. */
export function option(args: Map<string, string | true>, name: string, env: string): string | undefined {
  const value = args.get(name);
  if (typeof value === "string" && value !== "") return value;
  const fromEnv = process.env[env];
  return fromEnv && fromEnv !== "" ? fromEnv : undefined;
}

export const isDirectory = (dir: string) => existsSync(dir);

export function log(script: string, message: string): void {
  console.log(`[${script}] ${message}`);
}

export const toPosix = (value: string) => value.split(path.sep).join("/");
