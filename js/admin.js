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
  // (UI only: the real protection is Supabase RLS + the contract's arbitrator check)
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

  // State (declared before anything that uses it)
  let activeDispute = null;
  let currentContractAmount = 0; // Set from the contract when a dispute is opened (no guessed fallback)
  let tableRequestId = 0; // Ignores stale table responses when filter tabs are clicked quickly

  // Icons (inline SVG, they inherit the surrounding text color)
  const ICON_FILE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  const ICON_ARROW = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

  // Security: escape user-written text before it goes into innerHTML
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Security: only allow https links
  const safeUrl = (url) => {
    if (!url) return '#';
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.protocol === 'https:' ? parsed.href : '#';
    } catch { return '#'; }
  };

  // Formats an amount with at least 2 decimals but keeps up to 6 (USDC precision): 10 -> "10.00", 0.125 -> "0.125"
  const fmtAmount = (n) => {
    const s = Number(n).toFixed(6).replace(/0+$/, '');
    return s.endsWith('.') ? `${s}00` : s.replace(/\.(\d)$/, (_, d) => `.${d}0`);
  };

  // Rounds to 6 decimals (1 USDC base unit) so typed values match what the contract can represent
  const round6 = (n) => Math.round(n * 1e6) / 1e6;

  // --- PRESET SETTLEMENT BUTTON HANDLERS ---
  const btnPresetClient = document.getElementById('btn-preset-client');
  const btnPresetSplit = document.getElementById('btn-preset-split');
  const btnPresetFreelancer = document.getElementById('btn-preset-freelancer');

  if (btnPresetClient) {
    btnPresetClient.addEventListener('click', () => {
      inputFreelancer.value = '0.00';
      inputClient.value = fmtAmount(currentContractAmount);
    });
  }

  if (btnPresetSplit) {
    btnPresetSplit.addEventListener('click', () => {
      // Split in USDC base units so the two halves always add up exactly
      // (same rounding as the contract's timeout split)
      const totalUnits = Math.round(currentContractAmount * 1e6);
      const freelancerUnits = Math.floor(totalUnits / 2);
      inputFreelancer.value = fmtAmount(freelancerUnits / 1e6);
      inputClient.value = fmtAmount((totalUnits - freelancerUnits) / 1e6);
    });
  }

  if (btnPresetFreelancer) {
    btnPresetFreelancer.addEventListener('click', () => {
      inputFreelancer.value = fmtAmount(currentContractAmount);
      inputClient.value = '0.00';
    });
  }

  // --- BI-DIRECTIONAL INPUT CALCULATOR ---
  if (inputFreelancer) {
    inputFreelancer.addEventListener('input', () => {
      const freelancerVal = parseFloat(inputFreelancer.value) || 0;
      const clientRefund = Math.max(0, currentContractAmount - freelancerVal);
      inputClient.value = fmtAmount(clientRefund);
    });
  }

  if (inputClient) {
    inputClient.addEventListener('input', () => {
      const clientVal = parseFloat(inputClient.value) || 0;
      const freelancerPayout = Math.max(0, currentContractAmount - clientVal);
      inputFreelancer.value = fmtAmount(freelancerPayout);
    });
  }

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
    const requestId = ++tableRequestId;

    try {
      tableBody.innerHTML = '<tr><td colspan="5" class="table-loading-text" style="text-align:center; padding: 2rem;">Loading disputes queue...</td></tr>';
      const disputes = await disputeService.getAllDisputes(filter);

      // A newer request was started while this one was loading, so drop this result
      if (requestId !== tableRequestId) return;

      if (!disputes || disputes.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2.5rem; color:var(--text-muted);">No disputes found in queue.</td></tr>';
        return;
      }

      tableBody.innerHTML = '';
      disputes.forEach(dispute => {
        const row = document.createElement('tr');
        const createdDate = new Date(dispute.created_at).toLocaleDateString();
        const isActive = dispute.status === 'OPEN' || dispute.status === 'UNDER_REVIEW';

        // Security: every user-written value is escaped
        row.innerHTML = `
          <td><code>${escapeHtml(String(dispute.escrow_gig_id).substring(0, 10))}...</code></td>
          <td><span class="status-pill ${isActive ? 'rust' : 'green'}">${escapeHtml(dispute.status)}</span></td>
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
        btn.addEventListener('click', async () => {
          const gigId = btn.dataset.id;
          try {
            await openArbitrationModal(gigId);
          } catch (err) {
            console.error('Could not open dispute:', err);
            alert('Could not open this dispute. Please try again.');
          }
        });
      });

    } catch (err) {
      if (requestId !== tableRequestId) return;
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
    if (!window.ethereum) {
      activeDispute = null;
      return alert('A wallet is required to read the escrow from the contract.');
    }

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

    document.getElementById('modal-escrow-amount').textContent = `$${fmtAmount(currentContractAmount)} USDC`;

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
        a.innerHTML = `
          <span style="display:inline-flex; align-items:center; gap:8px;">${ICON_FILE}${escapeHtml(file.file_name)}</span>
          <span style="display:inline-flex; align-items:center; gap:6px;">Download File ${ICON_ARROW}</span>
        `;
        evidenceContainer.appendChild(a);
      });
    } else {
      evidenceContainer.innerHTML = '<span class="subtext">No evidence files uploaded.</span>';
    }

    // Default Split Inputs
    inputFreelancer.value = fmtAmount(currentContractAmount);
    inputClient.value = '0.00';

    modalBackdrop.classList.add('active');
  }

  function closeModal() {
    modalBackdrop.classList.remove('active');
    activeDispute = null;
    currentContractAmount = 0;
    if (inputNotes) inputNotes.value = ''; // Don't carry old notes into the next dispute
  }

  if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);

  // EXECUTE ON-CHAIN SETTLEMENT
  if (btnExecute) {
    const btnText = btnExecute.querySelector('.btn-text') || btnExecute;

    btnExecute.addEventListener('click', async () => {
      if (!activeDispute) return;

      // Keep our own copies: the modal can be closed while the transaction is still pending
      const dispute = activeDispute;
      const escrowAmount = currentContractAmount;

      // Round to 1 USDC base unit so typed values match what the contract can represent
      const freelancerPayout = round6(parseFloat(inputFreelancer.value) || 0);
      const clientRefund = round6(parseFloat(inputClient.value) || 0);
      const notes = inputNotes ? inputNotes.value.trim() : '';

      if (!window.ethereum) return alert('MetaMask wallet required to execute on-chain resolution.');

      // Validation: the split must add up to the escrow amount
      // (half a base unit of tolerance covers floating-point noise only)
      if (freelancerPayout < 0 || clientRefund < 0 ||
          Math.abs((freelancerPayout + clientRefund) - escrowAmount) > 0.0000005) {
        return alert(`The payout and refund must add up to the escrow amount ($${fmtAmount(escrowAmount)} USDC).`);
      }

      // Safety: settlement is final, so ask for confirmation first
      if (!confirm(`Settle this dispute on-chain?\n\nFreelancer: $${fmtAmount(freelancerPayout)} USDC\nClient refund: $${fmtAmount(clientRefund)} USDC\n\nThis cannot be undone.`)) return;

      try {
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
          ? getGigIdBytes32(dispute.escrow_gig_id)
          : (dispute.escrow_gig_id.startsWith('0x') ? dispute.escrow_gig_id : ethers.id(dispute.escrow_gig_id));

        // toFixed(6) avoids floating-point tails (e.g. 0.30000000000000004) that make parseUnits throw
        const parsedFreelancerAmount = ethers.parseUnits(freelancerPayout.toFixed(6), 6); // 6 decimals for USDC

        // Encode calldata
        const calldata = contractInterface.encodeFunctionData('resolveDispute', [bytes32GigId, parsedFreelancerAmount]);

        // Dry run: the contract rejects wrong wallet / wrong state / bad amount BEFORE we send (no gas spent)
        try {
          await provider.call({ from: userAddr, to: BAXIS_CONTRACT_ADDRESS, data: calldata });
        } catch (simErr) {
          console.warn('Dry run failed:', simErr);
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
            disputeId: dispute.id,
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
        btnText.textContent = 'Execute On-Chain Settlement';
      }
    });
  }
});