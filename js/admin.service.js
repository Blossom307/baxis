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
    return this.disputeService.getClient();
  }

  /**
   * Check if current authenticated user has Admin/Arbitrator role
   */
  async verifyAdminAccess() {
    const supabase = this.getClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const { data: roleRow, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id)
      .in('role', ['admin', 'arbitrator'])
      .maybeSingle();

    if (error || !roleRow) return false;
    return true;
  }

  /**
   * Fetch dispute metrics for top dashboard cards
   */
  async getMetrics() {
    const supabase = this.getClient();
    
    const { data: disputes, error } = await supabase
      .from('disputes')
      .select('id, status');

    if (error) throw error;

    const active = disputes.filter(d => d.status === 'OPEN' || d.status === 'UNDER_REVIEW').length;
    const resolved = disputes.filter(d => d.status.startsWith('RESOLVED')).length;

    return {
      total: disputes.length,
      active,
      resolved
    };
  }

  /**
   * Record dispute resolution in DB & write audit log
   */
  async recordResolution({ disputeId, freelancerPayout, clientRefund, notes, txHash }) {
    const supabase = this.getClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Admin auth session required.');

    const status = (freelancerPayout > 0 && clientRefund > 0) ? 'RESOLVED_SPLIT' : 
                   (freelancerPayout > 0 ? 'RESOLVED_FREELANCER' : 'RESOLVED_CLIENT');

    // 1. Update Dispute Record
    const { data: dispute, error } = await supabase
      .from('disputes')
      .update({
        status: status,
        freelancer_payout_amount: freelancerPayout,
        client_refund_amount: clientRefund,
        resolution_notes: notes,
        resolution_tx_hash: txHash,
        resolved_by: session.user.id,
        resolved_at: new Date().toISOString()
      })
      .eq('id', disputeId)
      .select()
      .single();

    if (error) throw error;

    // 2. Insert Audit Log
    await supabase.from('audit_logs').insert({
      admin_id: session.user.id,
      action: 'DISPUTE_RESOLVED',
      target_entity: 'dispute',
      target_id: disputeId,
      metadata: {
        freelancerPayout,
        clientRefund,
        txHash,
        notes
      }
    });

    return dispute;
  }
}

window.adminService = new AdminService();