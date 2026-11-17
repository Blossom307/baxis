# Baxis

**Secure transactions for deals made outside marketplaces.**

Baxis is a blockchain-powered escrow platform for deals that start on X, WhatsApp, Telegram, Discord, or through a direct message. A buyer's funds are locked in a smart contract and released only when the deal is confirmed or a dispute is resolved, so neither side has to rely on trust alone.

**Live app:** https://baxis.netlify.app
**API:** https://baxis.onrender.com
**Contract (Base mainnet):** [0xebc5…Df5b on BaseScan](PASTE_FULL_BASESCAN_LINK)
**Status:** Launched, pre-revenue

![Baxis screenshot](images/PASTE_SCREENSHOT_FILENAME.png)

## The Problem

Many online deals happen outside marketplaces. Freelancers get clients through X, editors take jobs on WhatsApp, and creators sell through DMs. These deals depend on personal trust, which leads to non-delivery, non-payment, and no way to settle disputes.

## How It Works

1. **Create:** One party creates an escrow with the deal terms.
2. **Invite:** The other party is invited to review the agreement.
3. **Fund:** The buyer deposits funds into the escrow contract through their wallet.
4. **Deliver:** The seller delivers what was agreed.
5. **Release or dispute:** The buyer confirms delivery and the funds are released, or either side opens a dispute with evidence for admin review.

```text
Created → Invited → Reviewed → Funded → Delivered
                                          ├── Approved → Funds released
                                          └── Disputed → Admin review → Resolution
```

## Features

- **On-chain escrow:** Solidity contract deployed on Base mainnet
- **Wallet integration:** ethers.js with the injected EIP-1193 provider, including mobile wallets
- **Dispute handling:** evidence upload through Supabase Storage, plus an admin dashboard
- **Authentication and profiles:** powered by Supabase
- **Notifications and transaction dashboard**
- **Responsive UI** for desktop and mobile

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript (Netlify) |
| Backend | Node.js, Express.js (Render) |
| Database and auth | Supabase (PostgreSQL, Auth, Storage) |
| Blockchain | Solidity, ethers.js, Base |

## Architecture

- **Frontend:** the user interface for authentication, escrow creation and details, wallet connection, disputes, and the admin panel.
- **Backend:** a Node.js/Express API that connects the frontend to Supabase for user data, disputes, and file storage.
- **Smart contract:** `BaxisEscrow.sol` holds and releases funds on-chain. Database records support the app experience, but the contract is the source of truth for funds.

## Project Structure

```text
baxis/
├── css/             # page styles
├── js/              # wallet, escrow, profile, and notification logic
├── images/
├── server/          # Express backend (server.js)
├── BaxisEscrow.sol  # escrow smart contract
├── index.html, auth.html, create.html, dashboard.html, profile.html ...
└── package.json
```

## Run Locally

```bash
git clone https://github.com/Blossom307/baxis.git
cd baxis
npm install
```

Create a `.env` file in the project root:

```env
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
PORT=
```

Then start the server:

```bash
npm start
```

You need Node.js, a Supabase project, and a Web3 wallet such as MetaMask connected to Base to test the full flow. Never commit `.env` or any private keys.

## Security Notes

- Verify the contract address and the Base network before confirming any transaction.
- Never share seed phrases or private keys.
- Baxis facilitates escrow but does not guarantee against every form of fraud or loss. Smart contracts and wallets carry inherent risk, and the contract has not had a formal third-party audit.

## Roadmap

- More payment options
- Smoother onboarding
- Better dispute transparency
- Integrations with the platforms where deals start

## Author

**Blossom Olusegun**: designed and built Baxis end to end.
[Portfolio](https://blossomolusegun.netlify.app) · [LinkedIn](https://linkedin.com/in/blossom-olusegun) · olusegunblossom307@gmail.com
