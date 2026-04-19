import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

const BASE = 'https://knockouts.in';

const PAGES = [
  '/worldcup2026',
  '/worldcup2026/group-a',
  '/worldcup2026/group-b',
  '/worldcup2026/group-c',
  '/worldcup2026/group-d',
  '/worldcup2026/group-a/team/mexico',
  '/worldcup2026/group-a/team/czech-republic',
  '/worldcup2026/fixtures',
  '/worldcup2026/knockout-bracket',
  '/worldcup2026/fifa-ranking',
  '/predictions',
];

export const options = {
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '3m', target: 100 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    errors: ['rate<0.01'],
  },
  userAgent: 'k6-loadtest/1.0 (owner: radek.budar@gmail.com)',
};

export function setup() {
  console.log(`Load test starting against ${BASE}`);
  console.log(`Pages under test: ${PAGES.length}`);
}

export default function () {
  const visitCount = 2 + Math.floor(Math.random() * 3);
  const visited = new Set();

  group('user session', () => {
    for (let i = 0; i < visitCount; i++) {
      let path;
      do {
        path = PAGES[Math.floor(Math.random() * PAGES.length)];
      } while (visited.has(path) && visited.size < PAGES.length);
      visited.add(path);

      const url = BASE + path;
      const res = http.get(url, {
        tags: { name: path },
        timeout: '30s',
      });

      const ok = check(res, {
        'status is 200': (r) => r.status === 200,
        'body not empty': (r) => r.body && r.body.length > 0,
      });
      errorRate.add(!ok);

      sleep(1 + Math.random() * 3);
    }
  });
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data),
    'scripts/loadtest-summary.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  const m = data.metrics;
  const fmt = (v) => (v === undefined ? 'n/a' : Number(v).toFixed(2));
  const dur = m.http_req_duration?.values || {};
  const failed = m.http_req_failed?.values || {};
  const reqs = m.http_reqs?.values || {};
  const vus = m.vus_max?.values || {};
  const data_received = m.data_received?.values || {};
  const data_sent = m.data_sent?.values || {};

  return `
==============================================
  Load Test Summary
==============================================
  Duration:          ${fmt(data.state?.testRunDurationMs / 1000)} s
  Max VUs:           ${vus.max || 'n/a'}
  Total requests:    ${reqs.count || 0}
  Requests/sec avg:  ${fmt(reqs.rate)}
  Failed rate:       ${fmt((failed.rate || 0) * 100)} %

  Response time (ms)
    avg:             ${fmt(dur.avg)}
    med:             ${fmt(dur.med)}
    p90:             ${fmt(dur['p(90)'])}
    p95:             ${fmt(dur['p(95)'])}
    p99:             ${fmt(dur['p(99)'])}
    max:             ${fmt(dur.max)}

  Data received:     ${fmt((data_received.count || 0) / 1024 / 1024)} MB
  Data sent:         ${fmt((data_sent.count || 0) / 1024 / 1024)} MB
==============================================
`;
}
