import "./env.js";
import http from "node:http";
import { getQuote, serializeWithBigInt } from "@spandex/core";
import type { Address } from "viem";
import { parseUnits, formatUnits } from "viem";
import { parseQuoteParams } from "./quote.js";
import {
  getSpandexConfig,
  getTokenDecimals,
  getTokenSymbol,
  SUPPORTED_CHAINS,
  DEFAULT_TOKENS,
} from "./config.js";
import { defaultTokens } from "./default-tokenlist.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

function log(message: string) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function logError(message: string, err?: unknown) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ERROR: ${message}`, err instanceof Error ? err.message : err || "");
}

const config = getSpandexConfig();

interface QuoteResult {
  chainId: number;
  from: string;
  from_symbol: string;
  to: string;
  to_symbol: string;
  amount: string;
  output_amount: string;
  output_amount_raw: string;
  input_amount_raw: string;
  provider: string;
  slippage_bps: number;
  gas_used: string;
  router_address: string;
  router_calldata: string;
  router_value?: string;
  approval_token?: string;
  approval_spender?: string;
}

const FALLBACK_ACCOUNT = "0xEe7aE85f2Fe2239E27D9c1E23fFFe168D63b4055" as Address;

async function findQuote(
  chainId: number,
  from: string,
  to: string,
  amount: string,
  slippageBps: number,
  sender?: string
): Promise<QuoteResult> {
  const [inputDecimals, outputDecimals, fromSymbol, toSymbol] = await Promise.all([
    getTokenDecimals(chainId, from),
    getTokenDecimals(chainId, to),
    getTokenSymbol(chainId, from),
    getTokenSymbol(chainId, to),
  ]);

  const inputAmount = parseUnits(amount, inputDecimals);

  const swapRequest = {
    chainId,
    inputToken: from as Address,
    outputToken: to as Address,
    mode: "exactIn" as const,
    inputAmount,
    slippageBps,
  };

  let quote = null;

  if (sender) {
    quote = await getQuote({
      config,
      swap: { ...swapRequest, swapperAccount: sender as Address },
      strategy: "bestPrice",
    });
  }

  if (!quote) {
    quote = await getQuote({
      config,
      swap: { ...swapRequest, swapperAccount: FALLBACK_ACCOUNT },
      strategy: "bestPrice",
    });
  }

  if (!quote) {
    throw new Error("No providers returned a successful quote");
  }

  const outputHuman = formatUnits(quote.simulation.outputAmount, outputDecimals);

  const result: QuoteResult = {
    chainId,
    from,
    from_symbol: fromSymbol,
    to,
    to_symbol: toSymbol,
    amount,
    output_amount: outputHuman,
    output_amount_raw: quote.simulation.outputAmount.toString(),
    input_amount_raw: quote.inputAmount.toString(),
    provider: quote.provider,
    slippage_bps: slippageBps,
    gas_used: quote.simulation.gasUsed?.toString() ?? "0",
    router_address: quote.txData.to,
    router_calldata: quote.txData.data,
  };

  if (quote.txData.value) {
    result.router_value = quote.txData.value.toString();
  }

  if (quote.approval) {
    result.approval_token = quote.approval.token;
    result.approval_spender = quote.approval.spender;
  }

  return result;
}

function sendJson(res: http.ServerResponse, status: number, data: object) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(serializeWithBigInt(data));
}

function sendError(res: http.ServerResponse, status: number, message: string) {
  sendJson(res, status, { error: message });
}

function sendHtml(res: http.ServerResponse, html: string) {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(html);
}

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spandex Quote Finder</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
    h1 { margin: 0 0 16px; color: #333; }
    form { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
    .form-group { margin-bottom: 16px; position: relative; }
    label { display: block; font-weight: 600; margin-bottom: 6px; color: #555; }
    input { width: 100%; padding: 10px; font-size: 14px; font-family: monospace; border: 1px solid #ddd; border-radius: 4px; }
    input:focus { outline: none; border-color: #0066cc; }
    .form-row { display: flex; gap: 16px; }
    .form-row .form-group { flex: 1; }
    button { padding: 12px 24px; font-size: 16px; cursor: pointer; background: #0066cc; color: white; border: none; border-radius: 4px; }
    button:hover { background: #0052a3; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    #result { background: #1e1e1e; color: #d4d4d4; padding: 20px; border-radius: 8px; display: none; }
    #result.show { display: block; }
    .error { color: #e74c3c; }
    .result-header { color: #888; margin-bottom: 12px; font-size: 14px; }
    .field { margin-bottom: 12px; }
    .field-label { color: #888; font-size: 12px; text-transform: uppercase; }
    .field-value { color: #4ec9b0; word-break: break-all; }
    .field-value.number { color: #b5cea8; }
    .provider-tag { display: inline-block; background: #264f78; color: #9cdcfe; padding: 3px 10px; border-radius: 4px; font-size: 13px; margin-left: 8px; }
    .autocomplete-list { position: absolute; z-index: 10; background: white; border: 1px solid #ddd; border-top: none; border-radius: 0 0 4px 4px; max-height: 200px; overflow-y: auto; width: 100%; display: none; }
    .autocomplete-list.show { display: block; }
    .autocomplete-item { padding: 8px 10px; cursor: pointer; font-size: 13px; font-family: monospace; }
    .autocomplete-item:hover, .autocomplete-item.active { background: #e8f0fe; }
    .autocomplete-item .symbol { font-weight: 600; color: #333; font-family: system-ui, sans-serif; }
    .autocomplete-item .addr { color: #888; font-size: 11px; margin-left: 6px; }
    .tokenlist-section { background: white; padding: 16px 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
    .tokenlist-section summary { cursor: pointer; font-weight: 600; color: #555; }
    .tokenlist-section textarea { width: 100%; height: 120px; margin-top: 10px; font-family: monospace; font-size: 12px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
    .tokenlist-actions { margin-top: 8px; display: flex; gap: 8px; }
    .tokenlist-actions button { padding: 6px 14px; font-size: 13px; }
    .btn-secondary { background: #666; }
    .btn-secondary:hover { background: #555; }
    .btn-danger { background: #c0392b; }
    .btn-danger:hover { background: #a93226; }
  </style>
</head>
<body>
  <h1>Spandex Quote Finder</h1>

  <details class="tokenlist-section">
    <summary>Token List (autocomplete)</summary>
    <p style="color: #888; font-size: 13px; margin: 8px 0 4px;">
      Paste a <a href="https://tokenlists.org" target="_blank">tokenlist.json</a> URL or raw JSON. Tokens for the selected chain will appear as autocomplete suggestions.
    </p>
    <textarea id="tokenlistInput" placeholder='https://tokens.uniswap.org or paste raw JSON...'></textarea>
    <div class="tokenlist-actions">
      <button type="button" id="loadTokenlist">Load</button>
      <button type="button" id="clearTokenlist" class="btn-danger">Clear</button>
    </div>
    <div id="tokenlistStatus" style="font-size: 12px; color: #888; margin-top: 6px;"></div>
  </details>

  <form id="form">
    <div class="form-row">
      <div class="form-group">
        <label for="chainId">Chain</label>
        <select id="chainId" style="width: 200px; padding: 10px; font-size: 14px; border: 1px solid #ddd; border-radius: 4px;">
          <option value="1">Ethereum (1)</option>
          <option value="8453" selected>Base (8453)</option>
          <option value="42161">Arbitrum (42161)</option>
          <option value="10">Optimism (10)</option>
          <option value="137">Polygon (137)</option>
          <option value="56">BSC (56)</option>
          <option value="43114">Avalanche (43114)</option>
        </select>
      </div>
      <div class="form-group">
        <label for="slippageBps">Slippage (bps)</label>
        <input type="text" id="slippageBps" value="50" style="width: 120px;">
      </div>
    </div>
    <div class="form-group">
      <label for="from">From (token address)</label>
      <input type="text" id="from" placeholder="0x... or search by symbol" autocomplete="off">
      <div class="autocomplete-list" id="fromAutocomplete"></div>
    </div>
    <div class="form-group">
      <label for="to">To (token address)</label>
      <input type="text" id="to" placeholder="0x... or search by symbol" autocomplete="off">
      <div class="autocomplete-list" id="toAutocomplete"></div>
    </div>
    <div class="form-group">
      <label for="amount">Input Amount (human-readable)</label>
      <input type="text" id="amount" value="1000" style="width: 200px;">
    </div>
    <div class="form-group">
      <label for="sender">Sender (optional, for approval check)</label>
      <input type="text" id="sender" placeholder="0x...">
    </div>
    <button type="submit" id="submit">Get Quote</button>
  </form>

  <div id="result"></div>

  <script>
    const DEFAULT_TOKENS = ${JSON.stringify(DEFAULT_TOKENS)};
    const BUILTIN_TOKENS = ${JSON.stringify(defaultTokens)};

    const TOKENLIST_STORAGE_KEY = 'spandex_tokenlist';
    let userTokens = [];

    function loadStoredTokenlist() {
      try {
        const stored = localStorage.getItem(TOKENLIST_STORAGE_KEY);
        if (stored) {
          userTokens = JSON.parse(stored);
          document.getElementById('tokenlistStatus').textContent =
            userTokens.length + ' custom tokens loaded from storage';
        }
      } catch {}
    }

    function saveTokenlist(tokens) {
      userTokens = tokens;
      localStorage.setItem(TOKENLIST_STORAGE_KEY, JSON.stringify(tokens));
    }

    function getTokensForChain(chainId) {
      const cid = Number(chainId);
      const all = [...BUILTIN_TOKENS, ...userTokens];
      const seen = new Set();
      return all.filter(t => {
        if (t.chainId !== cid) return false;
        const addr = t.address.toLowerCase();
        if (seen.has(addr)) return false;
        seen.add(addr);
        return true;
      });
    }

    async function handleLoadTokenlist() {
      const input = document.getElementById('tokenlistInput').value.trim();
      const status = document.getElementById('tokenlistStatus');
      if (!input) { status.textContent = 'Please enter a URL or JSON.'; return; }

      status.textContent = 'Loading...';
      try {
        let data;
        if (input.startsWith('http://') || input.startsWith('https://')) {
          const res = await fetch(input);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          data = await res.json();
        } else {
          data = JSON.parse(input);
        }
        const tokens = data.tokens || data;
        if (!Array.isArray(tokens)) throw new Error('Expected tokens array');
        saveTokenlist(tokens);
        status.textContent = tokens.length + ' custom tokens loaded and saved.';
      } catch (err) {
        status.textContent = 'Error: ' + err.message;
      }
    }

    function handleClearTokenlist() {
      userTokens = [];
      localStorage.removeItem(TOKENLIST_STORAGE_KEY);
      document.getElementById('tokenlistStatus').textContent = 'Custom token list cleared. Built-in tokens still available.';
      document.getElementById('tokenlistInput').value = '';
    }

    document.getElementById('loadTokenlist').addEventListener('click', handleLoadTokenlist);
    document.getElementById('clearTokenlist').addEventListener('click', handleClearTokenlist);

    function setupAutocomplete(inputId, listId) {
      const input = document.getElementById(inputId);
      const list = document.getElementById(listId);
      let activeIdx = -1;

      function render(matches) {
        list.innerHTML = '';
        activeIdx = -1;
        if (!matches.length) { list.classList.remove('show'); return; }
        list.classList.add('show');
        matches.slice(0, 20).forEach((token, i) => {
          const div = document.createElement('div');
          div.className = 'autocomplete-item';
          div.innerHTML = '<span class="symbol">' + token.symbol + '</span>' +
            '<span class="addr">' + token.address + '</span>';
          div.addEventListener('mousedown', (e) => {
            e.preventDefault();
            input.value = token.address;
            list.classList.remove('show');
          });
          list.appendChild(div);
        });
      }

      input.addEventListener('input', () => {
        const val = input.value.trim().toLowerCase();
        if (!val || val.startsWith('0x')) { list.classList.remove('show'); return; }
        const chainId = document.getElementById('chainId').value;
        const chainTokens = getTokensForChain(chainId);
        const matches = chainTokens.filter(t =>
          t.symbol.toLowerCase().includes(val) || t.name?.toLowerCase().includes(val)
        );
        render(matches);
      });

      input.addEventListener('keydown', (e) => {
        const items = list.querySelectorAll('.autocomplete-item');
        if (!items.length) return;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          activeIdx = Math.min(activeIdx + 1, items.length - 1);
          items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          activeIdx = Math.max(activeIdx - 1, 0);
          items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
        } else if (e.key === 'Enter' && activeIdx >= 0) {
          e.preventDefault();
          items[activeIdx].dispatchEvent(new Event('mousedown'));
        } else if (e.key === 'Escape') {
          list.classList.remove('show');
        }
      });

      input.addEventListener('blur', () => { setTimeout(() => list.classList.remove('show'), 150); });
    }

    setupAutocomplete('from', 'fromAutocomplete');
    setupAutocomplete('to', 'toAutocomplete');

    function applyDefaults(chainId) {
      const defaults = DEFAULT_TOKENS[chainId];
      if (defaults) {
        document.getElementById('from').value = defaults.from;
        document.getElementById('to').value = defaults.to;
      }
    }

    document.getElementById('chainId').addEventListener('change', function() {
      applyDefaults(Number(this.value));
    });

    const form = document.getElementById('form');
    const result = document.getElementById('result');
    const submit = document.getElementById('submit');

    function showResult(data) {
      result.className = 'show';
      result.innerHTML = \`
        <div class="result-header">Quote Found <span class="provider-tag">\${data.provider}</span></div>
        <div class="field">
          <div class="field-label">Chain</div>
          <div class="field-value number">\${data.chainId}</div>
        </div>
        <div class="field">
          <div class="field-label">From</div>
          <div class="field-value">\${data.from_symbol ? data.from_symbol + ' ' : ''}<span style="color: #888; font-size: 11px;">\${data.from}</span></div>
        </div>
        <div class="field">
          <div class="field-label">To</div>
          <div class="field-value">\${data.to_symbol ? data.to_symbol + ' ' : ''}<span style="color: #888; font-size: 11px;">\${data.to}</span></div>
        </div>
        <div class="field">
          <div class="field-label">Input Amount</div>
          <div class="field-value number">\${data.amount}\${data.from_symbol ? ' ' + data.from_symbol : ''}</div>
        </div>
        <div class="field">
          <div class="field-label">Output Amount</div>
          <div class="field-value number">\${data.output_amount}\${data.to_symbol ? ' ' + data.to_symbol : ''}</div>
        </div>
        <div class="field">
          <div class="field-label">Output (raw)</div>
          <div class="field-value number" style="font-size: 11px;">\${data.output_amount_raw}</div>
        </div>
        <div class="field">
          <div class="field-label">Slippage</div>
          <div class="field-value number">\${data.slippage_bps} bps</div>
        </div>
        <div class="field">
          <div class="field-label">Gas Used</div>
          <div class="field-value number">\${data.gas_used}</div>
        </div>
        \${data.approval_token ? \`
        <div class="field">
          <div class="field-label">Approval Token</div>
          <div class="field-value">\${data.approval_token}</div>
        </div>
        <div class="field">
          <div class="field-label">Approval Spender</div>
          <div class="field-value">\${data.approval_spender}</div>
        </div>
        \` : ''}
        <div class="field">
          <div class="field-label">Router Address</div>
          <div class="field-value">\${data.router_address}</div>
        </div>
        <div class="field">
          <div class="field-label">Router Calldata</div>
          <div class="field-value" style="font-size: 11px;">\${data.router_calldata}</div>
        </div>
        \${data.router_value ? \`
        <div class="field">
          <div class="field-label">Router Value (wei)</div>
          <div class="field-value number">\${data.router_value}</div>
        </div>
        \` : ''}
      \`;
    }

    function showError(msg) {
      result.className = 'show';
      result.innerHTML = '<div class="error">' + msg + '</div>';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const chainId = document.getElementById('chainId').value.trim();
      const from = document.getElementById('from').value.trim();
      const to = document.getElementById('to').value.trim();
      const amount = document.getElementById('amount').value.trim();
      const slippageBps = document.getElementById('slippageBps').value.trim();
      const sender = document.getElementById('sender').value.trim();

      submit.disabled = true;
      submit.textContent = 'Finding Quote...';
      result.className = 'show';
      result.innerHTML = '<div class="result-header">Querying aggregators for best price...</div>';

      try {
        const params = new URLSearchParams({ chainId, from, to, amount, slippageBps });
        if (sender) params.set('sender', sender);

        const res = await fetch('/quote?' + params.toString());
        const data = await res.json();

        if (data.error) {
          showError(data.error);
        } else {
          showResult(data);
          const url = new URL(window.location.href);
          url.searchParams.set('chainId', chainId);
          url.searchParams.set('from', from);
          url.searchParams.set('to', to);
          url.searchParams.set('amount', amount);
          url.searchParams.set('slippageBps', slippageBps);
          if (sender) url.searchParams.set('sender', sender);
          else url.searchParams.delete('sender');
          window.history.replaceState({}, '', url.toString());
        }
      } catch (err) {
        showError('Request failed: ' + err.message);
      } finally {
        submit.disabled = false;
        submit.textContent = 'Get Quote';
      }
    });

    // Restore from URL params or apply chain defaults
    const params = new URLSearchParams(window.location.search);
    if (params.get('chainId')) document.getElementById('chainId').value = params.get('chainId');
    if (params.get('from')) document.getElementById('from').value = params.get('from');
    else applyDefaults(Number(document.getElementById('chainId').value));
    if (params.get('to')) document.getElementById('to').value = params.get('to');
    if (params.get('amount')) document.getElementById('amount').value = params.get('amount');
    if (params.get('slippageBps')) document.getElementById('slippageBps').value = params.get('slippageBps');
    if (params.get('sender')) document.getElementById('sender').value = params.get('sender');
    if (!params.get('from') && !params.get('to')) applyDefaults(Number(document.getElementById('chainId').value));

    loadStoredTokenlist();
  </script>
</body>
</html>`;

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (url.pathname === "/" && req.method === "GET") {
    sendHtml(res, INDEX_HTML);
    return;
  }

  if (url.pathname === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (url.pathname === "/chains" && req.method === "GET") {
    sendJson(res, 200, SUPPORTED_CHAINS);
    return;
  }

  if (url.pathname === "/quote" && req.method === "GET") {
    const parsed = parseQuoteParams(url.searchParams);
    if (!parsed.success) {
      sendError(res, 400, parsed.error);
      return;
    }

    const { chainId, from, to, amount, slippageBps, sender } = parsed.data;

    const startTime = Date.now();
    try {
      const result = await findQuote(chainId, from, to, amount, slippageBps, sender);
      const duration = Date.now() - startTime;
      log(
        `Quote: chain=${chainId} ${result.from_symbol || from.slice(0, 10)} -> ` +
          `${result.to_symbol || to.slice(0, 10)}, amount=${amount}, ` +
          `output=${result.output_amount}, provider=${result.provider}, ${duration}ms`
      );
      sendJson(res, 200, result);
    } catch (err) {
      const duration = Date.now() - startTime;
      logError(
        `Quote failed: chain=${chainId} ${from.slice(0, 10)} -> ${to.slice(0, 10)}, ${duration}ms`,
        err
      );
      sendError(res, 500, err instanceof Error ? err.message : "Unknown error");
    }
    return;
  }

  log(`404: ${req.method} ${url.pathname}`);
  sendError(res, 404, "Not found");
}

const server = http.createServer(handleRequest);
server.listen(PORT, HOST, () => {
  log(`Server listening on http://${HOST}:${PORT}`);
});
