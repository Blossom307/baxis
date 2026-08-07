/**
 * BAXIS PROTOCOL — MULTI-WALLET CONNECTOR (`wallet.js`)
 * Live Base Mainnet (Chain ID 8453 / 0x2105) Configuration
 * Standard Web3 Auto-Resume Session Engine
 * Powered by Ethers.js v6
 */

(function () {
  'use strict';

  class BaxisWallet {
    constructor() {
      this.provider = null;
      this.signer = null;
      this.userAddress = null;
      this.targetChainId = '0x2105'; // Base Mainnet (8453 in hex)

      this.init();
    }

    getInjectedProvider() {
      if (window.ethereum) return window.ethereum;
      if (window.coinbaseWalletExtension) return window.coinbaseWalletExtension;
      if (window.trustwallet) return window.trustwallet;
      return null;
    }

    async init() {
      const ethereum = this.getInjectedProvider();
      if (ethereum) {
        try {
          this.provider = new ethers.BrowserProvider(ethereum);

          // Handle live account switching inside user's wallet
          ethereum.on('accountsChanged', (accounts) => {
            if (accounts && accounts.length > 0) {
              this.userAddress = accounts[0];
              this.updateUIAddress(accounts[0]);
            } else {
              this.userAddress = null;
              this.updateUIAddress(null);
            }
          });

          ethereum.on('chainChanged', () => {
            window.location.reload();
          });

          // Standard Web3 Auto-Resume: Check if THIS device's browser was previously connected
          const accounts = await ethereum.request({ method: 'eth_accounts' });
          if (accounts && accounts.length > 0) {
            this.signer = await this.provider.getSigner();
            this.userAddress = accounts[0];
            this.updateUIAddress(accounts[0]);
          } else {
            this.updateUIAddress(null);
          }
        } catch (e) {
          console.warn('[BaxisWallet] Silent init check:', e);
          this.updateUIAddress(null);
        }
      } else {
        this.updateUIAddress(null);
      }
    }

    /**
     * Primary Wallet Connection Handler (Triggered on-demand or by Connect button)
     */
    async connectWallet() {
      const ethereum = this.getInjectedProvider();

      // Mobile Safari/Chrome without extension -> Show Mobile App Selector Modal
      if (!ethereum) {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
          this.showMobileWalletModal();
          return null;
        }

        alert('Web3 wallet not detected. Please install MetaMask, Coinbase Wallet, or Trust Wallet extension.');
        return null;
      }

      try {
        const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
        if (!accounts || accounts.length === 0) return null;

        await this.ensureCorrectNetwork(ethereum);

        this.provider = new ethers.BrowserProvider(ethereum);
        this.signer = await this.provider.getSigner();
        this.userAddress = accounts[0];

        this.updateUIAddress(accounts[0]);
        return this.signer;

      } catch (err) {
        console.error('[BaxisWallet] Connection error:', err);
        if (err.code === -32002) {
          alert('Wallet popup is open. Check your browser extension icon.');
        } else if (err.message) {
          alert('Wallet Error: ' + err.message);
        }
        return null;
      }
    }

    /**
     * Ensures Base Mainnet Network (0x2105 / 8453)
     */
    async ensureCorrectNetwork(ethereum) {
      const currentChainId = await ethereum.request({ method: 'eth_chainId' });
      if (currentChainId !== this.targetChainId) {
        try {
          await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: this.targetChainId }]
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            await ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x2105',
                chainName: 'Base Mainnet',
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://mainnet.base.org', 'https://developer-access-mainnet.base.org'],
                blockExplorerUrls: ['https://basescan.org']
              }]
            });
          }
        }
      }
    }

    /**
     * Mobile Deep-Link Selector Modal
     */
    showMobileWalletModal() {
      const fullTargetUrl = encodeURIComponent(window.location.href);
      const cleanUrl = window.location.href.replace(/^https?:\/\//, '');

      const metaMaskLink = `https://metamask.app.link/dapp/${cleanUrl}`;
      const coinbaseLink = `https://go.cb-w.com/dapp?cb_url=${fullTargetUrl}`;
      const trustLink = `https://link.trustwallet.com/open_url?coin_id=60&url=${fullTargetUrl}`;

      let modal = document.getElementById('baxis-mobile-wallet-modal');
      if (modal) modal.remove();

      modal = document.createElement('div');
      modal.id = 'baxis-mobile-wallet-modal';
      modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);
        z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 16px;
      `;

      modal.innerHTML = `
        <div style="background: #111111; border: 1px solid #2A2A2A; border-radius: 16px; padding: 24px; max-width: 400px; width: 100%; text-align: center; color: #FFFFFF; box-shadow: 0 16px 40px rgba(0,0,0,0.8);">
          <h3 style="font-size: 16px; font-weight: 800; margin-bottom: 6px;">Connect Mobile Wallet</h3>
          <p style="font-size: 12px; color: #A0A0A0; margin-bottom: 20px; line-height: 1.5;">
            Select your Web3 wallet app to open this vault directly inside its dApp browser:
          </p>

          <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px;">
            <a href="${metaMaskLink}" target="_blank" style="background: #171717; border: 1px solid #2A2A2A; color: #FFFFFF; padding: 12px; border-radius: 8px; font-weight: 600; font-size: 13px; text-decoration: none; display: flex; align-items: center; justify-content: space-between;">
              <span>MetaMask App</span>
              <span style="color: #38BDF8;">Open</span>
            </a>
            <a href="${coinbaseLink}" target="_blank" style="background: #171717; border: 1px solid #2A2A2A; color: #FFFFFF; padding: 12px; border-radius: 8px; font-weight: 600; font-size: 13px; text-decoration: none; display: flex; align-items: center; justify-content: space-between;">
              <span>Coinbase Wallet</span>
              <span style="color: #38BDF8;">Open</span>
            </a>
            <a href="${trustLink}" target="_blank" style="background: #171717; border: 1px solid #2A2A2A; color: #FFFFFF; padding: 12px; border-radius: 8px; font-weight: 600; font-size: 13px; text-decoration: none; display: flex; align-items: center; justify-content: space-between;">
              <span>Trust Wallet</span>
              <span style="color: #38BDF8;">Open</span>
            </a>
          </div>

          <button type="button" id="btn-close-wallet-modal" style="background: none; border: none; color: #6B6B6B; font-size: 13px; cursor: pointer; text-decoration: underline;">
            Cancel
          </button>
        </div>
      `;

      document.body.appendChild(modal);

      const closeBtn = document.getElementById('btn-close-wallet-modal');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => modal.remove());
      }
    }

    /**
     * Updates Wallet UI elements (DOES NOT OVERWRITE USER ACCOUNT NAMES)
     */
    updateUIAddress(address) {
      const formatted = address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : null;

      document.querySelectorAll('.prof-address, #display-wallet-address').forEach((el) => {
        if (el) el.textContent = formatted || 'Not Connected';
      });

      const walletTag = document.getElementById('wallet-status-tag');
      if (walletTag) {
        if (address) {
          walletTag.textContent = 'Connected';
          walletTag.className = 'wallet-tag active';
        } else {
          walletTag.textContent = 'Disconnected';
          walletTag.className = 'wallet-tag';
        }
      }

      const profileAddrCode = document.getElementById('profile-address-code');
      if (profileAddrCode) {
        profileAddrCode.textContent = address 
          ? `${formatted} • Base Network Connected` 
          : 'Wallet Not Connected';
      }

      document.querySelectorAll('.user-status').forEach((el) => {
        if (address) {
          el.innerHTML = '<span class="status-dot green"></span> Wallet Connected';
        } else {
          el.innerHTML = '<span class="status-dot"></span> Base Network';
        }
      });
    }
  }

  window.baxisWallet = new BaxisWallet();

})();