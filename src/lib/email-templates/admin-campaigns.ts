import { query } from '@/lib/db';
import { buildReactivationEmail, REACTIVATION_SUBJECT } from './reactivate-sleeping-users';
import { buildPlayoffLaunchEmail, PLAYOFF_LAUNCH_SUBJECT } from './playoff-launch';
import { buildPlayoffOpenEmail, PLAYOFF_OPEN_SUBJECT } from './playoff-open';
import {
  buildGroupResultsEmail,
  fetchGroupTopStandings,
  GROUP_RESULTS_SUBJECT,
  type GroupResultsShared,
} from './group-results';

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
  /**
   * Optional async hook to fetch data shared by every recipient (e.g. the
   * leaderboard standings). Called once per preview/send; its result is passed
   * to each build() as the second argument. Campaigns that need no shared data
   * omit it.
   */
  prepare?(): Promise<unknown>;
  build(recipient: CampaignRecipient, shared?: unknown): { subject: string; html: string };
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
  {
    id: 'playoff-open',
    label: 'Play-off Pick’em is LIVE',
    description:
      'Sent the moment the group stage finishes and knockout tipping opens. An urgent call ' +
      'to act: the top-4 picks (champion + medalists) lock at the first play-off kick-off ' +
      '(21:00 Czech time), only ~12–15 hours away. Also introduces the three leaderboards ' +
      '(Overall / Group stage / Play-off) and the play-off-only league option. Default ' +
      'recipients: everyone registered for the Pick’em who has NOT yet locked in a top-4 pick.',
    subject: PLAYOFF_OPEN_SUBJECT,
    build: (recipient) => buildPlayoffOpenEmail({ userName: recipient.name }),
    defaultRecipients: () =>
      query<CampaignRecipient>(
        `SELECT u.id, u.email, u.name
         FROM tipster_user u
         WHERE NOT EXISTS (
           SELECT 1 FROM playoff_pick p WHERE p.user_id = u.id
         )
         ORDER BY u.name, u.email`,
      ),
  },
  {
    id: 'group-results',
    label: 'Group stage results & Top 10',
    description:
      'Sent once the group-stage Pick’em is fully scored. Celebrates the top 3 with ' +
      'medals, lists the final Top 10, links to the full leaderboard, then hands off ' +
      'to the now-live Play-off Pick’em and closes with a support-us ask. Default ' +
      'recipients: everyone who scored at least one group-stage point.',
    subject: GROUP_RESULTS_SUBJECT,
    prepare: async (): Promise<GroupResultsShared> => ({
      standings: await fetchGroupTopStandings(10),
    }),
    build: (recipient, shared) =>
      buildGroupResultsEmail({ userName: recipient.name }, shared as GroupResultsShared | undefined),
    defaultRecipients: () =>
      query<CampaignRecipient>(
        `SELECT u.id, u.email, u.name
         FROM tipster_user u
         JOIN tip t ON t.user_id = u.id
         GROUP BY u.id, u.email, u.name
         HAVING COALESCE(SUM(t.points), 0) >= 1
         ORDER BY u.name, u.email`,
      ),
  },
];

export function getAdminEmailCampaign(id: string): AdminEmailCampaign | undefined {
  return ADMIN_EMAIL_CAMPAIGNS.find((c) => c.id === id);
}
