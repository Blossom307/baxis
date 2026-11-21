/**
 * ============================================================================
 * Baxis Protocol — Dispute Service
 * Business logic for disputes, evidence file uploads, and status queries.
 * ============================================================================
 */

class DisputeService {
  // Shared limits (static so they cannot clash with globals from other scripts)
  static MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB per evidence file
  static MIN_REASON_LENGTH = 10;
  static MAX_REASON_LENGTH = 2000;
  static SIGNED_URL_TTL_SECONDS = 3600;
  static UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  constructor() {
    this.bucketName = 'dispute-evidence';
    this.supabaseUrl = 'https://sytnwsuqoeqlwybkkhhj.supabase.co';
    this.supabaseKey = 'sb_publishable_Qtiz_CfMKreLNiDHgVjYag_nFulAMjt'; // Publishable key: safe to ship, RLS protects the data
  }

  /**
   * Helper to ensure an initialized Supabase Client instance is returned
   */
  getClient() {
    // 1. Reuse any already-initialized client instance
    const existing = [window.baxisSupabase, window.supabaseClient, window.supabase].find(
      (client) => client && client.auth
    );
    if (existing) return existing;

    // 2. Fallback: initialize a client from the global Supabase JS SDK library
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

    // Newest first: if an earlier attempt left a duplicate row, we still return the latest one
    const { data: dispute, error } = await supabase
      .from('disputes')
      .select('*')
      .eq('escrow_gig_id', gigId)
      .order('created_at', { ascending: false })
      .limit(1)
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

    // Generate temporary signed URLs for private evidence files (one batched request)
    const files = evidenceFiles || [];
    const signedUrls = await this.getSignedUrls(files.map((file) => file.file_path));

    return {
      ...dispute,
      evidence: files.map((file, index) => ({ ...file, signedUrl: signedUrls[index] }))
    };
  }

  /**
   * Create a new dispute and upload evidence files.
   * The result includes `failedFiles`: names of any evidence files that could not be saved.
   */
  async createDispute({ gigId, clientId, freelancerId, reason, files = [] }) {
    const supabase = this.getClient();

    // Check auth session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    const user = session ? session.user : null;

    if (sessionError || !user) {
      throw new Error('You must be logged in to open a dispute. Please sign in first.');
    }

    // Validate everything BEFORE creating any record, so bad input can't leave a half-created dispute
    const cleanReason = (reason || '').trim();
    if (cleanReason.length < DisputeService.MIN_REASON_LENGTH) {
      throw new Error('Please provide a detailed dispute reason (minimum 10 characters).');
    }
    if (cleanReason.length > DisputeService.MAX_REASON_LENGTH) {
      throw new Error(`Please keep the dispute reason under ${DisputeService.MAX_REASON_LENGTH} characters.`);
    }

    const oversized = files.find((file) => file.size > DisputeService.MAX_FILE_BYTES);
    if (oversized) {
      throw new Error(`File ${oversized.name} exceeds the 10MB limit.`);
    }

    // Ensure valid UUID format for client_id and freelancer_id (fallback: the current user)
    const asUuid = (value) => (
      typeof value === 'string' && DisputeService.UUID_PATTERN.test(value) ? value : user.id
    );

    // 1. Insert Dispute Record
    const { data: dispute, error: disputeError } = await supabase
      .from('disputes')
      .insert({
        escrow_gig_id: String(gigId),
        raised_by: user.id,
        client_id: asUuid(clientId),
        freelancer_id: asUuid(freelancerId),
        reason: cleanReason,
        status: 'OPEN'
      })
      .select()
      .single();

    if (disputeError) {
      console.error('[DisputeService] Create dispute DB error:', disputeError);
      throw new Error(disputeError.message || 'Failed to initialize dispute record.');
    }

    // 2. Upload Evidence Files to Private Bucket (in parallel)
    const results = await Promise.all(
      files.map((file) => this.uploadEvidence(dispute.id, user.id, file))
    );

    const savedRows = results.filter(Boolean);
    const failedFiles = files.filter((_, index) => !results[index]).map((file) => file.name);

    const signedUrls = await this.getSignedUrls(savedRows.map((row) => row.file_path));

    return {
      ...dispute,
      evidence: savedRows.map((row, index) => ({ ...row, signedUrl: signedUrls[index] })),
      failedFiles
    };
  }

  /**
   * Uploads one evidence file and records it. Returns the evidence row, or null on failure.
   */
  async uploadEvidence(disputeId, userId, file) {
    const supabase = this.getClient();

    // Safe, unique storage name (the original name is kept separately in file_name)
    const rawExt = file.name.includes('.') ? file.name.split('.').pop() : '';
    const fileExt = rawExt.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const sanitizedFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
    const filePath = `${disputeId}/${sanitizedFileName}`;

    const { error: uploadError } = await supabase.storage
      .from(this.bucketName)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('[DisputeService] File upload error:', uploadError);
      return null;
    }

    const { data: evidenceRow, error: metaError } = await supabase
      .from('dispute_evidence')
      .insert({
        dispute_id: disputeId,
        uploaded_by: userId,
        file_path: filePath,
        file_name: file.name,
        file_type: file.type || 'application/octet-stream',
        file_size_bytes: file.size
      })
      .select()
      .single();

    if (metaError || !evidenceRow) {
      console.error('[DisputeService] Evidence record error:', metaError);
      // Don't leave an unreferenced file behind in storage
      await supabase.storage.from(this.bucketName).remove([filePath]);
      return null;
    }

    return evidenceRow;
  }

  /**
   * Generates a secure, temporary signed URL for viewing a private storage object
   */
  async getSignedUrl(filePath, expiresInSeconds = DisputeService.SIGNED_URL_TTL_SECONDS) {
    const [signedUrl] = await this.getSignedUrls([filePath], expiresInSeconds);
    return signedUrl;
  }

  /**
   * Generates signed URLs for several files in one request.
   * Returns an array in the same order as `filePaths` ('#' for any file that fails).
   */
  async getSignedUrls(filePaths, expiresInSeconds = DisputeService.SIGNED_URL_TTL_SECONDS) {
    if (!filePaths.length) return [];

    try {
      const { data, error } = await this.getClient().storage
        .from(this.bucketName)
        .createSignedUrls(filePaths, expiresInSeconds);

      if (error) throw error;

      const urlByPath = new Map(data.map((item) => [item.path, item.signedUrl]));
      return filePaths.map((path) => urlByPath.get(path) || '#');
    } catch (err) {
      console.warn('[DisputeService] Could not generate signed URLs:', err);
      return filePaths.map(() => '#');
    }
  }

  /**
   * Fetch all disputes (Used by Admin Panel).
   * statusFilter: 'ALL' / null for everything, 'RESOLVED' for any resolved outcome, or an exact status.
   */
  async getAllDisputes(statusFilter = null, limit = 200) {
    const supabase = this.getClient();

    let query = supabase
      .from('disputes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (statusFilter && statusFilter !== 'ALL') {
      query = statusFilter === 'RESOLVED'
        ? query.like('status', 'RESOLVED%')
        : query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Best-effort rollback of a dispute that never reached the chain (e.g. the wallet pop-up was rejected).
   * Only removes disputes that are still OPEN. Never throws: returns true if the row was removed.
   * Needs delete permission in your Supabase RLS policies; without it this just logs a warning.
   */
  async deleteDispute(disputeId) {
    try {
      const supabase = this.getClient();

      const { data: files } = await supabase
        .from('dispute_evidence')
        .select('file_path')
        .eq('dispute_id', disputeId);

      const paths = (files || []).map((file) => file.file_path);
      if (paths.length) await supabase.storage.from(this.bucketName).remove(paths);

      await supabase.from('dispute_evidence').delete().eq('dispute_id', disputeId);

      const { error } = await supabase
        .from('disputes')
        .delete()
        .eq('id', disputeId)
        .eq('status', 'OPEN');

      if (error) throw error;
      return true;
    } catch (err) {
      console.warn('[DisputeService] Could not roll back dispute:', err);
      return false;
    }
  }
}

// Export singleton to global scope
window.disputeService = new DisputeService();