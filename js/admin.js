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
  let currentContractAmount = 10.00; // Fallback default contract amount

  // Load Initial Metrics & Table
  await loadMetrics();
  await loadDisputeTable('ALL');

  // Filter Tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      loadDisputeTable(e.target.dataset.filter);
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

        row.innerHTML = `
          <td><code>${dispute.escrow_gig_id.substring(0, 10)}...</code></td>
          <td><span class="status-pill ${dispute.status === 'OPEN' ? 'rust' : 'green'}">${dispute.status}</span></td>
          <td>${dispute.reason.substring(0, 35)}...</td>
          <td>${createdDate}</td>
          <td>
            <button class="btn btn-review btn-sm" data-id="${dispute.escrow_gig_id}">Review & Arbitrate</button>
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

    document.getElementById('modal-dispute-id').textContent = `Contract ID: ${activeDispute.escrow_gig_id}`;
    document.getElementById('modal-dispute-reason').textContent = activeDispute.reason;
    document.getElementById('modal-dispute-status').textContent = activeDispute.status;

    // Fetch escrow amount from database if available
    const supabase = adminService.getClient();
    const { data: escrowRow } = await supabase
      .from('escrows')
      .select('amount')
      .eq('id', activeDispute.escrow_gig_id)
      .maybeSingle();

    if (escrowRow && escrowRow.amount) {
      currentContractAmount = parseFloat(escrowRow.amount);
    } else {
      currentContractAmount = 10.00;
    }

    document.getElementById('modal-escrow-amount').textContent = `$${currentContractAmount.toFixed(2)} USDC`;

    // Render Evidence Files
    const evidenceContainer = document.getElementById('modal-evidence-list');
    evidenceContainer.innerHTML = '';
    if (activeDispute.evidence && activeDispute.evidence.length > 0) {
      activeDispute.evidence.forEach(file => {
        const a = document.createElement('a');
        a.className = 'evidence-link-item';
        a.href = file.signedUrl;
        a.target = '_blank';
        a.innerHTML = `<span>📄 ${file.file_name}</span> <span>Download File ➔</span>`;
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

  // Auto-calculate Client Refund on Freelancer payout change
  if (inputFreelancer) {
    inputFreelancer.addEventListener('input', () => {
      const freelancerVal = parseFloat(inputFreelancer.value) || 0;
      const clientRefund = Math.max(0, currentContractAmount - freelancerVal);
      inputClient.value = clientRefund.toFixed(2);
    });
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

      try {
        const btnText = btnExecute.querySelector('.btn-text') || btnExecute;
        btnExecute.disabled = true;
        btnText.textContent = 'Confirming On-Chain Tx...';

        const provider = new ethers.BrowserProvider(window.ethereum);
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

        const parsedFreelancerAmount = ethers.parseUnits(freelancerPayout.toString(), 6); // 6 Decimals for USDC

        // Encode calldata
        const calldata = contractInterface.encodeFunctionData('resolveDispute', [bytes32GigId, parsedFreelancerAmount]);

        const txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{
            from: userAddr,
            to: BAXIS_CONTRACT_ADDRESS,
            data: calldata
          }]
        });

        // Record Resolution in Supabase DB & Audit Log
        await adminService.recordResolution({
          disputeId: activeDispute.id,
          freelancerPayout,
          clientRefund,
          notes,
          txHash
        });

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