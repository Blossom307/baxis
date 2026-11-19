// monitor.js
// Watches the BaxisEscrow contract on Base and sends Telegram alerts for
// admin actions, disputes, and deal activity.

require("dotenv").config();
const { ethers } = require("ethers");

const CONTRACT = "0xebc5942d0053B1acEfF18B01086272667209Df5b";
const EXPLORER = "https://basescan.org";
const USDC_DECIMALS = 6;
const POLL_INTERVAL_MS = 15_000;
const MAX_BLOCK_RANGE = 2_000;

const { BASE_RPC_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
if (!BASE_RPC_URL || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error("Missing BASE_RPC_URL, TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const usdc = (value) => `${ethers.formatUnits(value, USDC_DECIMALS)} USDC`;
const short = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const escapeHtml = (text) =>
  String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function formatAlert(level, title, fields, txHash) {
  const lines = [`<b>${level}</b>  ${escapeHtml(title)}`];
  for (const [label, value] of Object.entries(fields)) {
    lines.push(`${label}: <code>${escapeHtml(value)}</code>`);
  }
  if (txHash) lines.push(`<a href="${EXPLORER}/tx/${txHash}">View transaction</a>`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Watched events: ABI fragment, alert level, title, and the fields to display
// ---------------------------------------------------------------------------

const EVENTS = {
  // Admin actions: these should only ever be you
  SupportedTokenUpdated: {
    abi: "event SupportedTokenUpdated(address indexed token, bool supported)",
    level: "ADMIN",
    title: "Token support changed",
    fields: (a) => ({ Token: a.token, Supported: a.supported }),
  },
  ArbitratorUpdated: {
    abi: "event ArbitratorUpdated(address indexed arbitrator, bool status)",
    level: "ADMIN",
    title: "Arbitrator changed",
    fields: (a) => ({ Address: a.arbitrator, Enabled: a.status }),
  },
  ConfigUpdated: {
    abi: "event ConfigUpdated(string setting, address indexed value)",
    level: "ADMIN",
    title: "Configuration changed",
    fields: (a) => ({ Setting: a.setting, Value: a.value }),
  },
  FeeUpdated: {
    abi: "event FeeUpdated(uint256 newFeeBps)",
    level: "ADMIN",
    title: "Platform fee changed",
    fields: (a) => ({ "New fee": `${Number(a.newFeeBps) / 100}%` }),
  },
  MaxEscrowAmountUpdated: {
    abi: "event MaxEscrowAmountUpdated(uint256 newMaxAmount)",
    level: "ADMIN",
    title: "Max escrow amount changed",
    fields: (a) => ({ "New max": usdc(a.newMaxAmount) }),
  },
  Paused: {
    abi: "event Paused(address account)",
    level: "ADMIN",
    title: "Contract paused",
    fields: (a) => ({ By: a.account }),
  },
  Unpaused: {
    abi: "event Unpaused(address account)",
    level: "ADMIN",
    title: "Contract unpaused",
    fields: (a) => ({ By: a.account }),
  },
  OwnershipTransferStarted: {
    abi: "event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner)",
    level: "ADMIN",
    title: "Ownership transfer started",
    fields: (a) => ({ From: a.previousOwner, To: a.newOwner }),
  },
  OwnershipTransferred: {
    abi: "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
    level: "ADMIN",
    title: "Ownership transferred",
    fields: (a) => ({ From: a.previousOwner, To: a.newOwner }),
  },

  // Disputes
  DisputeRaised: {
    abi: "event DisputeRaised(bytes32 indexed gigId, address indexed initiator, bytes32 indexed evidenceHash)",
    level: "DISPUTE",
    title: "Dispute raised",
    fields: (a) => ({ Escrow: a.gigId, "Raised by": a.initiator }),
  },
  DisputeResolved: {
    abi: "event DisputeResolved(bytes32 indexed gigId, address indexed freelancer, uint256 freelancerAmount, address indexed client, uint256 clientRefund)",
    level: "DISPUTE",
    title: "Dispute resolved",
    fields: (a) => ({
      Escrow: a.gigId,
      Freelancer: usdc(a.freelancerAmount),
      "Client refund": usdc(a.clientRefund),
    }),
  },
  DisputeTimeoutClaimed: {
    abi: "event DisputeTimeoutClaimed(bytes32 indexed gigId, uint256 freelancerAmount, uint256 clientAmount)",
    level: "DISPUTE",
    title: "Dispute timeout fallback claimed",
    fields: (a) => ({
      Escrow: a.gigId,
      Freelancer: usdc(a.freelancerAmount),
      Client: usdc(a.clientAmount),
    }),
  },

  // Deal activity
  EscrowFunded: {
    abi: "event EscrowFunded(bytes32 indexed gigId, address indexed client, address indexed freelancer, address token, uint256 gigAmount, uint256 feePaid, uint64 inspectionWindow, bytes32 agreementHash)",
    level: "DEAL",
    title: "Escrow funded",
    fields: (a) => ({
      Amount: usdc(a.gigAmount),
      Fee: usdc(a.feePaid),
      Client: short(a.client),
      Freelancer: short(a.freelancer),
    }),
  },
  EscrowReleased: {
    abi: "event EscrowReleased(bytes32 indexed gigId, address indexed freelancer, uint256 amount)",
    level: "DEAL",
    title: "Escrow released",
    fields: (a) => ({ Amount: usdc(a.amount), Freelancer: short(a.freelancer) }),
  },
};

const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
const iface = new ethers.Interface(Object.values(EVENTS).map((event) => event.abi));

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

async function sendTelegram(text) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });
      if (res.ok) return;
      console.error(`Telegram error (attempt ${attempt}):`, await res.text());
    } catch (err) {
      console.error(`Telegram request failed (attempt ${attempt}):`, err.message);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

// ---------------------------------------------------------------------------
// Log handling and polling
// ---------------------------------------------------------------------------

async function handleLog(log) {
  let parsed;
  try {
    parsed = iface.parseLog({ topics: log.topics, data: log.data });
  } catch {
    return;
  }

  const event = parsed && EVENTS[parsed.name];
  if (!event) return;

  await sendTelegram(
    formatAlert(event.level, event.title, event.fields(parsed.args), log.transactionHash)
  );
  console.log(`Alert sent: ${parsed.name} (${log.transactionHash})`);
}

let lastBlock = null;
let polling = false;

async function poll() {
  if (polling) return;
  polling = true;

  try {
    const latest = await provider.getBlockNumber();

    if (lastBlock === null) {
      lastBlock = latest;
      console.log(`Monitoring ${CONTRACT} from block ${latest}`);
      await sendTelegram(
        formatAlert("MONITOR", "Started", { Contract: CONTRACT, "From block": latest })
      );
      return;
    }

    while (lastBlock < latest) {
      const fromBlock = lastBlock + 1;
      const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE - 1, latest);
      const logs = await provider.getLogs({ address: CONTRACT, fromBlock, toBlock });

      for (const log of logs) await handleLog(log);
      lastBlock = toBlock; // advance only after the range is fully processed
    }
  } catch (err) {
    console.error("Poll error (will retry):", err.message);
  } finally {
    polling = false;
  }
}

poll();
setInterval(poll, POLL_INTERVAL_MS);