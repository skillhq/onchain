import type { Command } from 'commander';
import kleur from 'kleur';
import { loadConfig, type OnchainConfig } from '../lib/config.js';
import { type ResolvedCredentials, resolveCredentials } from '../lib/credentials.js';
import type { OnchainClientOptions } from '../lib/onchain-client-types.js';
import {
  type LabelKind,
  labelPrefix,
  type OutputConfig,
  resolveOutputConfigFromArgv,
  resolveOutputConfigFromCommander,
  type StatusKind,
  statusPrefix,
} from '../lib/output.js';

export type CliContext = {
  isTty: boolean;
  getOutput: () => OutputConfig;
  colors: {
    banner: (t: string) => string;
    subtitle: (t: string) => string;
    section: (t: string) => string;
    bullet: (t: string) => string;
    command: (t: string) => string;
    option: (t: string) => string;
    argument: (t: string) => string;
    description: (t: string) => string;
    muted: (t: string) => string;
    accent: (t: string) => string;
    positive: (t: string) => string;
    negative: (t: string) => string;
  };
  p: (kind: StatusKind) => string;
  l: (kind: LabelKind) => string;
  config: OnchainConfig;
  applyOutputFromCommand: (command: Command) => void;
  resolveTimeoutFromOptions: (options: { timeout?: string | number }) => number | undefined;
  resolveCredentials: () => ResolvedCredentials;
  getClientOptions: () => OnchainClientOptions;
  outputJson: (data: unknown) => void;
};

function resolveTimeoutMs(...values: Array<string | number | undefined | null>): number | undefined {
  for (const value of values) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

export function createCliContext(normalizedArgs: string[], env: NodeJS.ProcessEnv = process.env): CliContext {
  const isTty = process.stdout.isTTY ?? false;
  let output: OutputConfig = resolveOutputConfigFromArgv(normalizedArgs, env, isTty);
  kleur.enabled = output.color;

  const wrap =
    (styler: (text: string) => string): ((text: string) => string) =>
    (text: string): string =>
      isTty ? styler(text) : text;

  const colors = {
    banner: wrap((t) => kleur.bold().magenta(t)),
    subtitle: wrap((t) => kleur.dim(t)),
    section: wrap((t) => kleur.bold().white(t)),
    bullet: wrap((t) => kleur.magenta(t)),
    command: wrap((t) => kleur.bold().cyan(t)),
    option: wrap((t) => kleur.cyan(t)),
    argument: wrap((t) => kleur.magenta(t)),
    description: wrap((t) => kleur.white(t)),
    muted: wrap((t) => kleur.gray(t)),
    accent: wrap((t) => kleur.cyan(t)),
    positive: wrap((t) => kleur.green(t)),
    negative: wrap((t) => kleur.red(t)),
  };

  const p = (kind: StatusKind): string => {
    const prefix = statusPrefix(kind, output);
    if (output.plain || !output.color) {
      return prefix;
    }
    if (kind === 'ok') {
      return kleur.green(prefix);
    }
    if (kind === 'warn') {
      return kleur.yellow(prefix);
    }
    if (kind === 'err') {
      return kleur.red(prefix);
    }
    if (kind === 'info') {
      return kleur.cyan(prefix);
    }
    return kleur.gray(prefix);
  };

  const l = (kind: LabelKind): string => {
    const prefix = labelPrefix(kind, output);
    if (output.plain || !output.color) {
      return prefix;
    }
    const colorMap: Record<LabelKind, (s: string) => string> = {
      url: kleur.cyan,
      date: kleur.magenta,
      wallet: kleur.yellow,
      chain: kleur.blue,
      token: kleur.cyan,
      price: kleur.green,
      value: kleur.yellow,
      change: kleur.magenta,
      balance: kleur.blue,
      position: kleur.cyan,
      exchange: kleur.yellow,
    };
    return colorMap[kind](prefix);
  };

  const config = loadConfig((message) => {
    console.error(colors.muted(`${p('warn')}${message}`));
  });

  function applyOutputFromCommand(command: Command): void {
    const opts = command.optsWithGlobals() as { plain?: boolean; emoji?: boolean; color?: boolean; json?: boolean };
    output = resolveOutputConfigFromCommander(opts, env, isTty);
    kleur.enabled = output.color;
  }

  function resolveTimeoutFromOptions(options: { timeout?: string | number }): number | undefined {
    return resolveTimeoutMs(options.timeout, config.timeoutMs, env.ONCHAIN_TIMEOUT_MS);
  }

  function getResolvedCredentials(): ResolvedCredentials {
    return resolveCredentials(config, env);
  }

  function getClientOptions(): OnchainClientOptions {
    const creds = getResolvedCredentials();
    return {
      debankApiKey: creds.debankApiKey,
      heliusApiKey: creds.heliusApiKey,
      coinbaseApiKeyId: creds.coinbaseApiKeyId,
      coinbaseApiKeySecret: creds.coinbaseApiKeySecret,
      binanceApiKey: creds.binanceApiKey,
      binanceApiSecret: creds.binanceApiSecret,
      coingeckoApiKey: creds.coingeckoApiKey,
      coinmarketcapApiKey: creds.coinmarketcapApiKey,
      etherscanApiKey: creds.etherscanApiKey,
      solscanApiKey: creds.solscanApiKey,
      walletConnectProjectId: creds.walletConnectProjectId,
      timeoutMs: config.timeoutMs,
    };
  }

  function outputJson(data: unknown): void {
    console.log(JSON.stringify(data, null, 2));
  }

  return {
    isTty,
    getOutput: () => output,
    colors,
    p,
    l,
    config,
    applyOutputFromCommand,
    resolveTimeoutFromOptions,
    resolveCredentials: getResolvedCredentials,
    getClientOptions,
    outputJson,
  };
}
