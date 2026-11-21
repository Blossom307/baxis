
/**
 * ============================================================================
 * Baxis Protocol — Admin Service
 * Handles RBAC checks, metrics aggregation, dispute resolutions, and audit logging.
 * ============================================================================
 */

class AdminService {
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
   * Check if current authenticated user has Admin/Arbitrator role.
   */
  async verifyAdminAccess() {
    try {
      const supabase = this.getClient();

      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession();

      if (sessionError || !session) return false;

      const { data: roleRow, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .in('role', ['admin', 'arbitrator'])
        .limit(1)
        .maybeSingle();

      if (error || !roleRow) return false;

      return true;

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

    const [totalResult, activeResult, resolvedResult] = await Promise.all([
      supabase
        .from('disputes')
        .select('id', { count: 'exact', head: true }),

      supabase
        .from('disputes')
        .select('id', { count: 'exact', head: true })
        .in('status', ['OPEN', 'UNDER_REVIEW']),

      supabase
        .from('disputes')
        .select('id', { count: 'exact', head: true })
        .like('status', 'RESOLVED%')
    ]);

    if (totalResult.error) throw totalResult.error;
    if (activeResult.error) throw activeResult.error;
    if (resolvedResult.error) throw resolvedResult.error;

    return {
      total: totalResult.count ?? 0,
      active: activeResult.count ?? 0,
      resolved: resolvedResult.count ?? 0
    };
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

    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError) throw sessionError;

    if (!session) {
      throw new Error('Admin auth session required.');
    }

    // Validate required identifiers.
    if (!disputeId) {
      throw new Error('A valid dispute ID is required.');
    }

    if (
      typeof txHash !== 'string' ||
      !/^0x[a-fA-F0-9]{64}$/.test(txHash)
    ) {
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

    // 1. Update dispute record.
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
      .in('status', ['OPEN', 'UNDER_REVIEW'])
      .select()
      .single();

    if (updateError) {
      throw updateError;
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
