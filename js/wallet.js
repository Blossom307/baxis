/**
 * BAXIS PROTOCOL — GLOBAL WEB3 WALLET CONNECTOR (`wallet.js`)
 * Powered by Ethers.js v6
 */

(function () {
  'use strict';

  class BaxisWallet {
    constructor() {
      this.provider = null;
      this.signer = null;
      this.userAddress = null;
      this.targetChainId = '0x14a34'; // Base Sepolia Testnet (84532 in hex)

      this.init();
    }

    async init() {
      if (window.ethereum) {
        this.provider = new ethers.BrowserProvider(window.ethereum);
        
        window.ethereum.on('accountsChanged', (accounts) => {
          if (accounts.length > 0) {
            this.userAddress = accounts[0];
            this.updateUIAddress(accounts[0]);
          } else {
            this.userAddress = null;
            this.updateUIAddress(null);
          }
        });

        window.ethereum.on('chainChanged', () => {
          window.location.reload();
        });

        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            this.signer = await this.provider.getSigner();
            this.userAddress = accounts[0];
            this.updateUIAddress(accounts[0]);
          }
        } catch (e) {
          console.warn('Silent account check failed:', e);
        }
      }
    }

    async connectWallet() {
      if (!window.ethereum) {
        alert('Web3 wallet not detected! Please install MetaMask or Coinbase Wallet.');
        return null;
      }

      try {
        await this.ensureCorrectNetwork();
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        this.provider = new ethers.BrowserProvider(window.ethereum);
        this.signer = await this.provider.getSigner();
        this.userAddress = accounts[0];

        this.updateUIAddress(accounts[0]);
        return this.signer;
      } catch (err) {
        console.error('Wallet Connection Error:', err);
        if (err.code === -32002) {
          alert('MetaMask popup is already open! Please click the MetaMask extension icon in your browser to approve the request.');
        }
        return null;
      }
    }

    async ensureCorrectNetwork() {
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (currentChainId !== this.targetChainId) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: this.targetChainId }]
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x14a34',
                chainName: 'Base Sepolia Testnet',
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://base-sepolia.blockpi.network/v1/rpc/public', 'https://sepolia.base.org'],
                blockExplorerUrls: ['https://sepolia.basescan.org']
              }]
            });
          }
        }
      }
    }

    updateUIAddress(address) {
      const formatted = address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : null;
      
      document.querySelectorAll('.user-name, .prof-address').forEach((el) => {
        if (formatted) el.textContent = formatted;
      });

      document.querySelectorAll('.user-status').forEach((el) => {
        if (address) {
          el.innerHTML = '<span class="status-dot green"></span> Wallet Connected';
        }
      });
    }
  }

  window.baxisWallet = new BaxisWallet();

})();