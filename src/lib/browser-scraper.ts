import { execSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

/**
 * Browser scraper using agent-browser CLI for fallback when API keys aren't available.
 * Uses the agent-browser CLI for browser automation.
 *
 * IMPORTANT: Uses unique session names to avoid "Browser not launched" errors
 * from corrupted default sessions.
 */

export interface ScrapedBalance {
  symbol: string;
  name: string;
  amount: number;
  valueUsd: number | null;
  chain?: string;
}

export interface BrowserScrapeResult {
  success: true;
  balances: ScrapedBalance[];
  totalValueUsd: number;
}

export interface BrowserScrapeError {
  success: false;
  error: string;
}

export type ScrapeResult = BrowserScrapeResult | BrowserScrapeError;

/**
 * Generate a unique session name to avoid conflicts with corrupted default sessions.
 */
function generateSessionName(): string {
  return `onchain-${randomBytes(4).toString('hex')}`;
}

/**
 * Execute an agent-browser command with a specific session and return the output.
 */
function runAgentBrowser(session: string, args: string[], timeoutMs = 30000): string {
  const result = spawnSync('agent-browser', ['--session', session, ...args], {
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || `agent-browser exited with code ${result.status}`);
  }

  return result.stdout;
}

/**
 * Close browser session, ignoring errors.
 */
function closeBrowser(session: string): void {
  try {
    runAgentBrowser(session, ['close'], 5000);
  } catch {
    // Ignore close errors
  }
}

/**
 * Check if agent-browser CLI is available.
 */
export function isAgentBrowserAvailable(): boolean {
  try {
    execSync('which agent-browser', { encoding: 'utf8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// JavaScript to extract balance data from DeBank page
// Returns a plain object (agent-browser will JSON-stringify the result)
const DEBANK_EXTRACT_SCRIPT = `
(function() {
  const text = document.body.innerText;
  const totalMatch = text.match(/\\$[\\d,]+(?:\\.\\d+)?/);
  const totalValueUsd = totalMatch ? parseFloat(totalMatch[0].replace(/[$,]/g, "")) : 0;

  const tableStart = text.indexOf("Token\\nPrice\\nAmount\\nUSD Value");
  const balances = [];
  if (tableStart > -1) {
    const tableText = text.substring(tableStart + "Token\\nPrice\\nAmount\\nUSD Value".length);
    const lines = tableText.split("\\n").filter(l => l.trim());
    let i = 0;
    while (i < lines.length && balances.length < 100) {
      const symbol = lines[i];
      if (symbol.includes("Protocol") || symbol.includes("Show all") || symbol.includes("Unfold")) break;
      if (i + 3 < lines.length) {
        const priceStr = lines[i + 1];
        const valueStr = lines[i + 3];
        if (priceStr.startsWith("$") && valueStr.startsWith("$")) {
          const amount = parseFloat(lines[i + 2].replace(/,/g, "")) || 0;
          const valueUsd = parseFloat(valueStr.replace(/[$,]/g, "")) || 0;
          balances.push({
            symbol: symbol.replace(/\\s*\\([^)]*\\)/g, "").trim(),
            amount,
            valueUsd
          });
          i += 4;
        } else i++;
      } else break;
    }
  }
  return {totalValueUsd, balances};
})()
`.trim();

// JavaScript to extract balance data from Solscan page
// Returns a plain object (agent-browser will JSON-stringify the result)
const SOLSCAN_EXTRACT_SCRIPT = `
(function() {
  const text = document.body.innerText;

  // Extract SOL balance
  const solMatch = text.match(/(\\d+\\.?\\d*)\\s*SOL/);
  const solBalance = solMatch ? parseFloat(solMatch[1]) : 0;

  // Try to extract total value
  const totalMatch = text.match(/\\$[\\d,]+(?:\\.\\d+)?/);
  const totalValueUsd = totalMatch ? parseFloat(totalMatch[0].replace(/[$,]/g, "")) : 0;

  const balances = [];

  // Add SOL balance
  if (solBalance > 0) {
    balances.push({symbol: "SOL", amount: solBalance, valueUsd: null});
  }

  // Look for token table (Portfolio section)
  const portfolioStart = text.indexOf("Token");
  if (portfolioStart > -1) {
    const portfolioText = text.substring(portfolioStart);
    const lines = portfolioText.split("\\n").filter(l => l.trim());
    let i = 0;
    while (i < lines.length && balances.length < 100) {
      const line = lines[i];
      // Look for token symbols (uppercase letters)
      if (/^[A-Z][A-Z0-9]{1,9}$/.test(line) && line !== "SOL") {
        const symbol = line;
        // Try to find amount and value in next lines
        let amount = 0;
        let valueUsd = null;
        for (let j = 1; j <= 3 && i + j < lines.length; j++) {
          const nextLine = lines[i + j];
          if (/^[\\d,]+\\.?\\d*$/.test(nextLine.replace(/,/g, ""))) {
            amount = parseFloat(nextLine.replace(/,/g, "")) || 0;
          }
          if (nextLine.startsWith("$")) {
            valueUsd = parseFloat(nextLine.replace(/[$,]/g, "")) || null;
          }
        }
        if (amount > 0 && !balances.some(b => b.symbol === symbol)) {
          balances.push({symbol, amount, valueUsd});
        }
      }
      i++;
    }
  }

  return {totalValueUsd, balances};
})()
`.trim();

/**
 * Scrape DeBank profile page for EVM wallet balances.
 * Uses agent-browser CLI to navigate and extract data via JavaScript.
 */
export async function scrapeDebankProfile(address: string, timeoutMs = 60000): Promise<ScrapeResult> {
  const session = generateSessionName();

  try {
    const url = `https://debank.com/profile/${address}`;

    // Open the page (this launches the browser)
    runAgentBrowser(session, ['open', url], timeoutMs);

    // Wait for JS to render (DeBank is heavy)
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Extract data using JavaScript evaluation
    const output = runAgentBrowser(session, ['eval', DEBANK_EXTRACT_SCRIPT], timeoutMs);

    // Parse the JSON output - agent-browser returns clean JSON when returning objects
    const data = JSON.parse(output.trim()) as {
      totalValueUsd: number;
      balances: Array<{ symbol: string; amount: number; valueUsd: number }>;
    };

    // Close the browser
    closeBrowser(session);

    // Convert to our format
    const balances: ScrapedBalance[] = data.balances.map((b) => ({
      symbol: b.symbol,
      name: b.symbol,
      amount: b.amount,
      valueUsd: b.valueUsd,
      chain: 'evm',
    }));

    return { success: true, balances, totalValueUsd: data.totalValueUsd };
  } catch (error) {
    closeBrowser(session);
    return {
      success: false,
      error: `Browser scraping failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Scrape Solscan profile page for Solana wallet balances.
 * Uses agent-browser CLI to navigate and extract data via JavaScript.
 */
export async function scrapeSolscanProfile(address: string, timeoutMs = 60000): Promise<ScrapeResult> {
  const session = generateSessionName();

  try {
    const url = `https://solscan.io/account/${address}`;

    // Open the page
    runAgentBrowser(session, ['open', url], timeoutMs);

    // Wait for JS to render
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Extract data using JavaScript evaluation
    const output = runAgentBrowser(session, ['eval', SOLSCAN_EXTRACT_SCRIPT], timeoutMs);

    // Parse the JSON output - agent-browser returns clean JSON when returning objects
    const data = JSON.parse(output.trim()) as {
      totalValueUsd: number;
      balances: Array<{ symbol: string; amount: number; valueUsd: number | null }>;
    };

    // Close the browser
    closeBrowser(session);

    // Convert to our format
    const balances: ScrapedBalance[] = data.balances.map((b) => ({
      symbol: b.symbol,
      name: b.symbol,
      amount: b.amount,
      valueUsd: b.valueUsd,
      chain: 'solana',
    }));

    // Calculate total from individual values if not set
    const totalValueUsd = data.totalValueUsd || balances.reduce((sum, b) => sum + (b.valueUsd ?? 0), 0);

    return { success: true, balances, totalValueUsd };
  } catch (error) {
    closeBrowser(session);
    return {
      success: false,
      error: `Browser scraping failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
