import { query } from '../config/database';
import { logger } from '../utils/logger';

export type LoginEvent =
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'refresh'
  | 'password_change'
  | 'password_reset'
  | 'password_reset_requested'
  | 'register'
  | 'email_verified'
  | 'profile_updated'
  | 'email_changed'
  | 'tokens_revoked'
  | 'account_locked'
  | 'sso_ticket_issued'
  | 'sso_redeem';

export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
  /** Calling application, from the service client credential. */
  client?: string | null;
}

export class LoginHistoryRepository {
  /**
   * Audit trail write. Deliberately never throws: losing an audit row must not
   * fail the login or password change that triggered it.
   */
  async record(userId: number, event: LoginEvent, ctx: RequestContext = {}): Promise<void> {
    const agent = ctx.userAgent || '';

    try {
      await query(
        `INSERT INTO login_history (user_id, event, ip_address, device, browser, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId,
          event,
          ctx.ip || null,
          deviceOf(agent),
          browserOf(agent),
          agent.slice(0, 500) || null,
        ]
      );
    } catch (err) {
      logger.error('Failed to record login history', {
        userId,
        event,
        error: (err as Error).message,
      });
    }
  }
}

/**
 * Coarse device and browser labels parsed from the user agent.
 *
 * Deliberately crude — this is for a human scanning "where was I logged in",
 * not analytics. A full UA-parsing dependency is not worth the maintenance for
 * that, and the raw string is kept alongside for anything more precise.
 */
function deviceOf(agent: string): string | null {
  if (!agent) return null;
  if (/iPad|Tablet/i.test(agent)) return 'Tablet';
  if (/Mobile|iPhone|Android/i.test(agent)) return 'Mobile';
  if (/Windows|Macintosh|Linux|X11/i.test(agent)) return 'Desktop';
  return 'Unknown';
}

function browserOf(agent: string): string | null {
  if (!agent) return null;
  // Order matters: Edge and Opera both advertise Chrome, Chrome advertises Safari.
  if (/Edg\//i.test(agent)) return 'Edge';
  if (/OPR\/|Opera/i.test(agent)) return 'Opera';
  if (/Chrome\//i.test(agent)) return 'Chrome';
  if (/Firefox\//i.test(agent)) return 'Firefox';
  if (/Safari\//i.test(agent)) return 'Safari';
  if (/curl|wget|PostmanRuntime|axios|Guzzle/i.test(agent)) return 'API client';
  return 'Other';
}
