import { query } from '@/lib/db';
import { buildReactivationEmail, REACTIVATION_SUBJECT } from './reactivate-sleeping-users';
import { buildPlayoffLaunchEmail, PLAYOFF_LAUNCH_SUBJECT } from './playoff-launch';

/** A tipster_user row reduced to what an e-mail campaign needs. */
export interface CampaignRecipient {
  id: number;
  email: string;
  name: string;
}

/**
 * An admin-triggered e-mail campaign template. Each template pre-selects a
 * default recipient list (the admin can edit it in the UI before sending) and
 * builds a personalized e-mail per recipient. To add a new template, append an
 * entry to ADMIN_EMAIL_CAMPAIGNS.
 */
export interface AdminEmailCampaign {
  id: string;
  label: string;
  description: string;
  subject: string;
  build(recipient: CampaignRecipient): { subject: string; html: string };
  defaultRecipients(): Promise<CampaignRecipient[]>;
}

export const ADMIN_EMAIL_CAMPAIGNS: AdminEmailCampaign[] = [
  {
    id: 'reactivate-sleeping-users',
    label: 'Reactivate sleeping users',
    description:
      'Nudge tipsters who signed up for the Pick’em but have placed at most one tip. ' +
      'The e-mail reminds them the World Cup is about to start, with one CTA leading to their tips page.',
    subject: REACTIVATION_SUBJECT,
    build: (recipient) => buildReactivationEmail({ userName: recipient.name }),
    defaultRecipients: () =>
      query<CampaignRecipient>(
        `SELECT u.id, u.email, u.name
         FROM tipster_user u
         LEFT JOIN tip t ON t.user_id = u.id
         GROUP BY u.id, u.email, u.name
         HAVING COUNT(t.id) <= 1
         ORDER BY u.name, u.email`,
      ),
  },
  {
    id: 'playoff-launch',
    label: 'Play-off Pick’em promo',
    description:
      'Announce the launch of the knockout-stage prediction game. One CTA leading to the ' +
      'play-off landing page, with the rules and when it opens. Default recipients: tipsters ' +
      'who placed at least one group-stage tip.',
    subject: PLAYOFF_LAUNCH_SUBJECT,
    build: (recipient) => buildPlayoffLaunchEmail({ userName: recipient.name }),
    defaultRecipients: () =>
      query<CampaignRecipient>(
        `SELECT u.id, u.email, u.name
         FROM tipster_user u
         JOIN tip t ON t.user_id = u.id
         GROUP BY u.id, u.email, u.name
         HAVING COUNT(t.id) >= 1
         ORDER BY u.name, u.email`,
      ),
  },
];

export function getAdminEmailCampaign(id: string): AdminEmailCampaign | undefined {
  return ADMIN_EMAIL_CAMPAIGNS.find((c) => c.id === id);
}
