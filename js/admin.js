/**
 * ============================================================================
 * Baxis Protocol — Admin Dashboard Controller
 * Handles table rendering, modal actions, and Web3 settlement transactions.
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', async () => {
  const adminService = window.adminService;
  const disputeService = window.disputeService;

  // 1. GATEKEEPER CHECK: Ensure user is Admin
  const isAdmin = await adminService.verifyAdminAccess();
  if (!isAdmin) {
    alert('Unauthorized access. Redirecting to user dashboard.');
    window.location.href = 'dashboard.html';
    return;
  }

  // UI References
  const tableBody = document.getElementById('dispute-table-body');
  const modalBackdrop = document.getElementById('arbitration-modal-backdrop');
  const btnCloseModal = document.getElementById('btn-close-admin-modal');
  const btnCancelModal = document.getElementById('btn-cancel-admin-modal');
  const btnExecute = document.getElementById('btn-execute-settlement');

  const inputFreelancer = document.getElementById('input-freelancer-payout');
  const inputClient = document.getElementById('input-client-refund');
  const inputNotes = document.getElementById('input-resolution-notes');

    // Security: escape user-written text before it goes into innerHTML
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Security: only allow https links
  const safeUrl = (url) => {
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.protocol === 'https:' ? parsed.href : '#';
    } catch { return '#'; }
  };

  // --- PRESET SETTLEMENT BUTTON HANDLERS ---
  const btnPresetClient = document.getElementById('btn-preset-client');
  const btnPresetSplit = document.getElementById('btn-preset-split');
  const btnPresetFreelancer = document.getElementById('btn-preset-freelancer');

  if (btnPresetClient) {
    btnPresetClient.addEventListener('click', () => {
      inputFreelancer.value = '0.00';
      inputClient.value = currentContractAmount.toFixed(2);
    });
  }

  if (btnPresetSplit) {
    btnPresetSplit.addEventListener('click', () => {
      const half = (currentContractAmount / 2).toFixed(2);
      inputFreelancer.value = half;
      inputClient.value = half;
    });
  }

  if (btnPresetFreelancer) {
    btnPresetFreelancer.addEventListener('click', () => {
      inputFreelancer.value = currentContractAmount.toFixed(2);
      inputClient.value = '0.00';
    });
  }

  // --- BI-DIRECTIONAL INPUT CALCULATOR ---
  if (inputFreelancer) {
    inputFreelancer.addEventListener('input', () => {
      const freelancerVal = parseFloat(inputFreelancer.value) || 0;
      const clientRefund = Math.max(0, currentContractAmount - freelancerVal);
      inputClient.value = clientRefund.toFixed(2);
    });
  }

  if (inputClient) {
    inputClient.addEventListener('input', () => {
      const clientVal = parseFloat(inputClient.value) || 0;
      const freelancerPayout = Math.max(0, currentContractAmount - clientVal);
      inputFreelancer.value = freelancerPayout.toFixed(2);
    });
  }

  let activeDispute = null;
  let currentContractAmount = 0; // Set from the contract when a dispute is opened (no guessed fallback)

  // Load Initial Metrics & Table
  await loadMetrics();
  await loadDisputeTable('ALL');

  // Filter Tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
   tab.addEventListener('click', () => {
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  loadDisputeTable(tab.dataset.filter);
    });
  });

  async function loadMetrics() {
    try {
      const stats = await adminService.getMetrics();
      document.getElementById('stat-active-disputes').textContent = stats.active;
      document.getElementById('stat-resolved-cases').textContent = stats.resolved;
      document.getElementById('stat-total-disputes').textContent = stats.total;
    } catch (err) {
      console.error('Error loading metrics:', err);
    }
  }

  async function loadDisputeTable(filter = 'ALL') {
    try {
      tableBody.innerHTML = '<tr><td colspan="5" class="table-loading-text" style="text-align:center; padding: 2rem;">Loading disputes queue...</td></tr>';
      const disputes = await disputeService.getAllDisputes(filter);

      if (!disputes || disputes.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2.5rem; color:var(--text-muted);">No disputes found in queue.</td></tr>';
        return;
      }

      tableBody.innerHTML = '';
      disputes.forEach(dispute => {
        const row = document.createElement('tr');
        const createdDate = new Date(dispute.created_at).toLocaleDateString();

               // Security: every user-written value is escaped
        row.innerHTML = `
          <td><code>${escapeHtml(String(dispute.escrow_gig_id).substring(0, 10))}...</code></td>
          <td><span class="status-pill ${dispute.status === 'OPEN' ? 'rust' : 'green'}">${escapeHtml(dispute.status)}</span></td>
          <td>${escapeHtml(String(dispute.reason || '').substring(0, 35))}...</td>
          <td>${createdDate}</td>
          <td>
            <button class="btn btn-review btn-sm" data-id="${escapeHtml(dispute.escrow_gig_id)}">Review & Arbitrate</button>
          </td>
        `;

        tableBody.appendChild(row);
      });

      // Attach Review Click Listeners
      tableBody.querySelectorAll('.btn-review').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const gigId = e.target.dataset.id;
          await openArbitrationModal(gigId);
        });
      });

    } catch (err) {
      console.error('Failed to load table:', err);
      tableBody.innerHTML = '<tr><td colspan="5" style="color:var(--state-error); text-align:center; padding:2rem;">Error loading disputes.</td></tr>';
    }
  }

  async function openArbitrationModal(gigId) {
    activeDispute = await disputeService.getDisputeByGigId(gigId);
    if (!activeDispute) return alert('Dispute details not found.');
    if (btnExecute) btnExecute.disabled = true;

    document.getElementById('modal-dispute-id').textContent = `Contract ID: ${activeDispute.escrow_gig_id}`;
    document.getElementById('modal-dispute-reason').textContent = activeDispute.reason;
    document.getElementById('modal-dispute-status').textContent = activeDispute.status;

        // Read the real amount and dispute state from the contract (source of truth).
    // If this fails we stop instead of guessing an amount.
    if (!window.ethereum) { activeDispute = null; return alert('A wallet is required to read the escrow from the contract.'); }
    try {
      const readProvider = new ethers.BrowserProvider(window.ethereum);
      const readNetwork = await readProvider.getNetwork();
      if (readNetwork.chainId !== 8453n) {
        activeDispute = null;
        return alert('Wrong network. Switch your wallet to Base mainnet and try again.');
      }
      const readAbi = [
        'function escrows(bytes32) view returns (address client, address freelancer, address token, uint256 amount, bytes32 agreementHash, uint64 createdAt, uint64 submittedAt, uint64 inspectionWindow, uint64 disputedAt, uint64 completedAt, uint8 status)'
      ];
      const readContract = new ethers.Contract(BAXIS_CONTRACT_ADDRESS, readAbi, readProvider);
      const gigBytes32 = (typeof getGigIdBytes32 === 'function')
        ? getGigIdBytes32(activeDispute.escrow_gig_id)
        : (activeDispute.escrow_gig_id.startsWith('0x') ? activeDispute.escrow_gig_id : ethers.id(activeDispute.escrow_gig_id));
      const onChain = await readContract.escrows(gigBytes32);

      currentContractAmount = parseFloat(ethers.formatUnits(onChain.amount, 6));

      // Status 5 = DISPUTED. Settlement only works in that state.
      const disputedOnChain = Number(onChain.status) === 5;
      if (btnExecute) btnExecute.disabled = !disputedOnChain;
      if (!disputedOnChain) {
        alert('This escrow is not in a disputed state on-chain, so it cannot be settled yet.');
      }
    } catch (readErr) {
      console.error('On-chain read failed:', readErr);
      activeDispute = null;
      return alert('Could not read this escrow from the contract. Nothing was changed.');
    }

    document.getElementById('modal-escrow-amount').textContent = `$${currentContractAmount.toFixed(2)} USDC`;

    // Render Evidence Files
    const evidenceContainer = document.getElementById('modal-evidence-list');
    evidenceContainer.innerHTML = '';
    if (activeDispute.evidence && activeDispute.evidence.length > 0) {
      activeDispute.evidence.forEach(file => {
        const a = document.createElement('a');
        a.className = 'evidence-link-item';
        a.href = safeUrl(file.signedUrl); // Security: https links only
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.innerHTML = `<span>📄 ${escapeHtml(file.file_name)}</span> <span>Download File ➔</span>`;
        evidenceContainer.appendChild(a);
      });
    } else {
      evidenceContainer.innerHTML = '<span class="subtext">No evidence files uploaded.</span>';
    }

    // Default Split Inputs
    inputFreelancer.value = (currentContractAmount).toFixed(2);
    inputClient.value = '0.00';

    modalBackdrop.classList.add('active');
  }

  

  function closeModal() {
    modalBackdrop.classList.remove('active');
    activeDispute = null;
  }

  if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);

  // EXECUTE ON-CHAIN SETTLEMENT
  if (btnExecute) {
    btnExecute.addEventListener('click', async () => {
      if (!activeDispute) return;

      const freelancerPayout = parseFloat(inputFreelancer.value) || 0;
      const clientRefund = parseFloat(inputClient.value) || 0;
      const notes = inputNotes ? inputNotes.value.trim() : '';

      if (!window.ethereum) return alert('MetaMask wallet required to execute on-chain resolution.');

            // Validation: the split must add up to the escrow amount (tiny tolerance for rounding)
      if (freelancerPayout < 0 || clientRefund < 0 ||
          Math.abs((freelancerPayout + clientRefund) - currentContractAmount) > 0.000001) {
        return alert(`The payout and refund must add up to the escrow amount ($${currentContractAmount.toFixed(2)} USDC).`);
      }

      // Safety: settlement is final, so ask for confirmation first
      if (!confirm(`Settle this dispute on-chain?\n\nFreelancer: $${freelancerPayout.toFixed(2)} USDC\nClient refund: $${clientRefund.toFixed(2)} USDC\n\nThis cannot be undone.`)) return;

      try {
        const btnText = btnExecute.querySelector('.btn-text') || btnExecute;
        btnExecute.disabled = true;
        btnText.textContent = 'Confirming On-Chain Tx...';

        const provider = new ethers.BrowserProvider(window.ethereum);

        // Safety: refuse to send on the wrong network
        const network = await provider.getNetwork();
        if (network.chainId !== 8453n) throw new Error('Wrong network. Switch your wallet to Base mainnet.');

        const signer = await provider.getSigner();
        const userAddr = await signer.getAddress();

        // Safe Human-Readable ABI definition for resolveDispute
        const resolveAbi = [
          "function resolveDispute(bytes32 _gigId, uint256 _freelancerAmount) external"
        ];
        const contractInterface = new ethers.Interface(resolveAbi);

        // Convert gigId to 32-byte hex string
        const bytes32GigId = (typeof getGigIdBytes32 === 'function') 
          ? getGigIdBytes32(activeDispute.escrow_gig_id) 
          : (activeDispute.escrow_gig_id.startsWith('0x') ? activeDispute.escrow_gig_id : ethers.id(activeDispute.escrow_gig_id));

           // toFixed(6) avoids floating-point tails (e.g. 0.30000000000000004) that make parseUnits throw
        const parsedFreelancerAmount = ethers.parseUnits(freelancerPayout.toFixed(6), 6); // 6 decimals for USDC

        // Encode calldata
        const calldata = contractInterface.encodeFunctionData('resolveDispute', [bytes32GigId, parsedFreelancerAmount]);

            // Dry run: the contract rejects wrong wallet / wrong state / bad amount BEFORE we send (no gas spent)
        try {
          await provider.call({ from: userAddr, to: BAXIS_CONTRACT_ADDRESS, data: calldata });
        } catch (simErr) {
          throw new Error('The contract would reject this settlement. Check that this wallet is the owner or an arbitrator and that the escrow is disputed on-chain.');
        }

        const txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{
            from: userAddr,
            to: BAXIS_CONTRACT_ADDRESS,
            data: calldata
          }]
        });

          // Only record the resolution after the chain confirms it
        btnText.textContent = 'Waiting for confirmation...';
        const receipt = await provider.waitForTransaction(txHash);
        if (!receipt || receipt.status !== 1) {
          throw new Error('Settlement transaction failed on-chain. Nothing was recorded.');
        }

        // Record Resolution in Supabase DB & Audit Log
try {
  await adminService.recordResolution({
    disputeId: activeDispute.id,
    freelancerPayout,
    clientRefund,
    notes,
    txHash
  });
} catch (dbErr) {
  console.error('Blockchain settlement confirmed, but database recording failed:', dbErr);

  alert(
    `IMPORTANT: The blockchain settlement was confirmed, but database recording failed.\n\n` +
    `Transaction: ${txHash}\n\n` +
    `Do NOT execute this settlement again. Database reconciliation is required.\n\n` +
    `Error: ${dbErr.message}`
  );

  closeModal();
  await loadMetrics();
  await loadDisputeTable('ALL');
  return;
}

alert(`Settlement Executed Successfully!\nTX Hash: ${txHash}`);

closeModal();
await loadMetrics();
await loadDisputeTable('ALL');
       

      } catch (err) {
        console.error('Settlement failed:', err);
        alert('Settlement failed: ' + (err.reason || err.message));
      } finally {
        btnExecute.disabled = false;
        const btnText = btnExecute.querySelector('.btn-text') || btnExecute;
        btnText.textContent = 'Execute On-Chain Settlement';
      }
    });
  }
});