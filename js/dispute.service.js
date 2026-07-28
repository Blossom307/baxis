/**
 * ============================================================================
 * Baxis Protocol — Dispute Service
 * Business logic for disputes, evidence file uploads, and status queries.
 * ============================================================================
 */

class DisputeService {
  constructor() {
    this.bucketName = 'dispute-evidence';
    this.supabaseUrl = 'https://sytnwsuqoeqlwybkkhhj.supabase.co';
    this.supabaseKey = 'sb_publishable_Qtiz_CfMKreLNiDHgVjYag_nFulAMjt';
  }

  /**
   * Helper to ensure an initialized Supabase Client instance is returned
   */
  getClient() {
    // 1. Check existing initialized client instances
    if (window.baxisSupabase && window.baxisSupabase.auth) return window.baxisSupabase;
    if (window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;

    // 2. If window.supabase is already an initialized client instance
    if (window.supabase && window.supabase.auth) return window.supabase;

    // 3. Fallback: Initialize client from global Supabase JS SDK library
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      window.baxisSupabase = window.supabase.createClient(this.supabaseUrl, this.supabaseKey);
      return window.baxisSupabase;
    }

    throw new Error('Supabase client SDK is not loaded. Please ensure supabase.js is included.');
  }

  /**
   * Fetch dispute and associated evidence for a specific gig ID
   * @param {string} gigId - On-chain bytes32 gig ID (0x...)
   */
  async getDisputeByGigId(gigId) {
    const supabase = this.getClient();

    const { data: dispute, error } = await supabase
      .from('disputes')
      .select('*')
      .eq('escrow_gig_id', gigId)
      .maybeSingle();

    if (error) {
      console.error('[DisputeService] Error fetching dispute:', error);
      throw error;
    }

    if (!dispute) return null;

    // Fetch evidence files
    const { data: evidenceFiles, error: evidenceError } = await supabase
      .from('dispute_evidence')
      .select('*')
      .eq('dispute_id', dispute.id)
      .order('created_at', { ascending: true });

    if (evidenceError) {
      console.error('[DisputeService] Error fetching evidence:', evidenceError);
    }

    // Generate temporary signed URLs for private evidence files
    const evidenceWithSignedUrls = await Promise.all(
      (evidenceFiles || []).map(async (file) => {
        const signedUrl = await this.getSignedUrl(file.file_path);
        return { ...file, signedUrl };
      })
    );

    return {
      ...dispute,
      evidence: evidenceWithSignedUrls
    };
  }

  /**
   * Create a new dispute and upload evidence files
   */
  async createDispute({ gigId, clientId, freelancerId, reason, files = [] }) {
    const supabase = this.getClient();

    // Check auth session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    const user = session ? session.user : null;

    if (sessionError || !user) {
      throw new Error('You must be logged in to open a dispute. Please sign in first.');
    }

    if (!reason || reason.trim().length < 10) {
      throw new Error('Please provide a detailed dispute reason (minimum 10 characters).');
    }

    // Ensure valid UUID format for client_id and freelancer_id fallback
    const validClientId = (clientId && clientId.length === 36) ? clientId : user.id;
    const validFreelancerId = (freelancerId && freelancerId.length === 36) ? freelancerId : user.id;

    // 1. Insert Dispute Record
    const { data: dispute, error: disputeError } = await supabase
      .from('disputes')
      .insert({
        escrow_gig_id: String(gigId),
        raised_by: user.id,
        client_id: validClientId,
        freelancer_id: validFreelancerId,
        reason: reason.trim(),
        status: 'OPEN'
      })
      .select()
      .single();

    if (disputeError) {
      console.error('[DisputeService] Create dispute DB error:', disputeError);
      throw new Error(disputeError.message || 'Failed to initialize dispute record.');
    }

    // 2. Upload Evidence Files to Private Bucket
    const uploadedEvidence = [];
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error(`File ${file.name} exceeds the 10MB limit.`);
      }

      const fileExt = file.name.split('.').pop();
      const sanitizedFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
      const filePath = `${dispute.id}/${sanitizedFileName}`;

      const { error: uploadError } = await supabase.storage
        .from(this.bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('[DisputeService] File upload error:', uploadError);
        continue;
      }

      const { data: evidenceRow, error: metaError } = await supabase
        .from('dispute_evidence')
        .insert({
          dispute_id: dispute.id,
          uploaded_by: user.id,
          file_path: filePath,
          file_name: file.name,
          file_type: file.type || 'application/octet-stream',
          file_size_bytes: file.size
        })
        .select()
        .single();

      if (!metaError && evidenceRow) {
        const signedUrl = await this.getSignedUrl(filePath);
        uploadedEvidence.push({ ...evidenceRow, signedUrl });
      }
    }

    return {
      ...dispute,
      evidence: uploadedEvidence
    };
  }

  /**
   * Generates a secure, temporary signed URL for viewing private storage objects
   */
  async getSignedUrl(filePath, expiresInSeconds = 3600) {
    try {
      const supabase = this.getClient();
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .createSignedUrl(filePath, expiresInSeconds);

      if (error) throw error;
      return data.signedUrl;
    } catch (err) {
      console.warn('[DisputeService] Could not generate signed URL:', err);
      return '#';
    }
  }

  /**
   * Fetch all disputes (Used by Admin Panel)
   */
  async getAllDisputes(statusFilter = null) {
    const supabase = this.getClient();

    let query = supabase
      .from('disputes')
      .select('*')
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'ALL') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }
}

// Export singleton to global scope
window.disputeService = new DisputeService();