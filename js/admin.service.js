/**
 * ============================================================================
 * Baxis Protocol — Admin Service
 * Handles RBAC checks, metrics aggregation, dispute resolutions, and audit logging.
 * ============================================================================
 */

class AdminService {
  // Shared constants (static so they cannot clash with globals from other scripts)
  static ADMIN_ROLES = ['admin', 'arbitrator'];
  static OPEN_STATUSES = ['OPEN', 'UNDER_REVIEW'];
  static TX_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

  constructor() {
    this.disputeService = window.disputeService;
  }

  getClient() {
    if (!this.disputeService) {
      throw new Error('Dispute service is not initialized.');
    }

    return this.disputeService.getClient();
  }

  /**
   * Returns the current auth session (or null). Throws if the session lookup itself fails.
   */
  async getSession() {
    const {
      data: { session },
      error
    } = await this.getClient().auth.getSession();

    if (error) throw error;
    return session;
  }

  /**
   * Check if current authenticated user has Admin/Arbitrator role.
   * Note: this is a UI check only. Real enforcement must come from Supabase RLS
   * and from the contract's own arbitrator/owner check.
   */
  async verifyAdminAccess() {
    try {
      const session = await this.getSession();
      if (!session) return false;

      const { data: roleRow, error } = await this.getClient()
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .in('role', AdminService.ADMIN_ROLES)
        .limit(1)
        .maybeSingle();

      return !error && !!roleRow;

    } catch (err) {
      console.error('Admin access verification failed:', err);
      return false;
    }
  }

  /**
   * Fetch dispute metrics for dashboard cards.
   * Uses database counts instead of downloading every dispute.
   */
  async getMetrics() {
    const supabase = this.getClient();

    // Runs one count-only query, optionally narrowed by a filter
    const countWhere = async (applyFilter = (query) => query) => {
      const { count, error } = await applyFilter(
        supabase.from('disputes').select('id', { count: 'exact', head: true })
      );

      if (error) throw error;
      return count ?? 0;
    };

    const [total, active, resolved] = await Promise.all([
      countWhere(),
      countWhere((query) => query.in('status', AdminService.OPEN_STATUSES)),
      countWhere((query) => query.like('status', 'RESOLVED%'))
    ]);

    return { total, active, resolved };
  }

  /**
   * Record dispute resolution in DB and write audit log.
   * Requires a confirmed on-chain transaction hash.
   */
  async recordResolution({
    disputeId,
    freelancerPayout,
    clientRefund,
    notes,
    txHash
  }) {
    const supabase = this.getClient();

    const session = await this.getSession();
    if (!session) {
      throw new Error('Admin auth session required.');
    }

    // Validate required identifiers.
    if (!disputeId) {
      throw new Error('A valid dispute ID is required.');
    }

    if (typeof txHash !== 'string' || !AdminService.TX_HASH_PATTERN.test(txHash)) {
      throw new Error('A valid transaction hash is required.');
    }

    // Validate settlement amounts.
    const freelancerAmount = Number(freelancerPayout);
    const clientAmount = Number(clientRefund);

    if (
      !Number.isFinite(freelancerAmount) ||
      !Number.isFinite(clientAmount) ||
      freelancerAmount < 0 ||
      clientAmount < 0
    ) {
      throw new Error('Invalid settlement amounts.');
    }

    if (freelancerAmount + clientAmount <= 0) {
      throw new Error('At least one settlement amount must be greater than zero.');
    }

    const status =
      freelancerAmount > 0 && clientAmount > 0
        ? 'RESOLVED_SPLIT'
        : freelancerAmount > 0
          ? 'RESOLVED_FREELANCER'
          : 'RESOLVED_CLIENT';

    // 1. Update dispute record (only if it is still open, so a resolved dispute is never overwritten).
    const { data: dispute, error: updateError } = await supabase
      .from('disputes')
      .update({
        status,
        freelancer_payout_amount: freelancerAmount,
        client_refund_amount: clientAmount,
        resolution_notes: notes || null,
        resolution_tx_hash: txHash,
        resolved_by: session.user.id,
        resolved_at: new Date().toISOString()
      })
      .eq('id', disputeId)
      .in('status', AdminService.OPEN_STATUSES)
      .select()
      .maybeSingle();

    if (updateError) {
      throw updateError;
    }

    // No row matched: the dispute does not exist, is already resolved, or is hidden by RLS.
    if (!dispute) {
      throw new Error(
        'No open dispute matched this ID (it may already be resolved, or you may lack permission). ' +
        'The on-chain settlement is already confirmed, so reconcile this dispute manually.'
      );
    }

    // 2. Insert audit log.
    const { error: auditError } = await supabase
      .from('audit_logs')
      .insert({
        admin_id: session.user.id,
        action: 'DISPUTE_RESOLVED',
        target_entity: 'dispute',
        target_id: disputeId,
        metadata: {
          freelancerPayout: freelancerAmount,
          clientRefund: clientAmount,
          txHash,
          notes: notes || null
        }
      });

    if (auditError) {
      console.error('Audit log insertion failed:', auditError);

      throw new Error(
        'The dispute was updated, but the audit log could not be saved. ' +
        'Contact an administrator before attempting another settlement.'
      );
    }

    return dispute;
  }
}

window.adminService = new AdminService();