import { mkdir, writeFile } from "node:fs/promises";

const username = process.env.GITHUB_USERNAME ?? "s4ngw0n";
const token = process.env.GITHUB_TOKEN;

if (!token) {
  throw new Error("GITHUB_TOKEN is required to fetch contribution data.");
}

const query = `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          months {
            name
            firstDay
          }
          weeks {
            contributionDays {
              date
              weekday
              contributionCount
              color
            }
          }
        }
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "s4ngw0n.github.io-contribution-chart",
  },
  body: JSON.stringify({ query, variables: { login: username } }),
});

const payload = await response.json();

if (!response.ok || payload.errors) {
  const details = payload.errors?.map(({ message }) => message).join("; ");
  throw new Error(details || `GitHub API request failed with ${response.status}.`);
}

const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;

if (!calendar) {
  throw new Error(`GitHub user ${username} was not found.`);
}

const cellSize = 10;
const cellGap = 3;
const step = cellSize + cellGap;
const leftPadding = 31;
const topPadding = 20;
const width = leftPadding + calendar.weeks.length * step + 5;
const height = topPadding + 7 * step + 5;

const escapeXml = (value) =>
  String(value).replace(/[<>&"']/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);

const monthLabels = calendar.months.map((month) => {
  const weekIndex = calendar.weeks.findIndex((week) =>
    week.contributionDays.some((day) => day.date === month.firstDay),
  );

  if (weekIndex < 0) {
    return "";
  }

  const x = leftPadding + weekIndex * step;
  return `  <text class="chart-label" x="${x}" y="10">${escapeXml(month.name)}</text>`;
});

const weekdayLabels = [
  { name: "Mon", weekday: 1 },
  { name: "Wed", weekday: 3 },
  { name: "Fri", weekday: 5 },
].map(({ name, weekday }) => {
  const y = topPadding + weekday * step + 8;
  return `  <text class="chart-label" x="0" y="${y}">${name}</text>`;
});

const cells = calendar.weeks.flatMap((week, weekIndex) =>
  week.contributionDays.map((day) => {
    const x = leftPadding + weekIndex * step;
    const y = topPadding + day.weekday * step;
    const countLabel = `${day.contributionCount} contribution${day.contributionCount === 1 ? "" : "s"}`;

    return [
      `  <rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${escapeXml(day.color)}">`,
      `    <title>${escapeXml(`${day.date}: ${countLabel}`)}</title>`,
      "  </rect>",
    ].join("\n");
  }),
);

const svg = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="chart-title chart-description" viewBox="0 0 ${width} ${height}">`,
  `  <title id="chart-title">${escapeXml(username)} GitHub contribution chart</title>`,
  '  <desc id="chart-description">GitHub contributions during the past year.</desc>',
  '  <style>.chart-label { fill: #57606a; font: 10px Arial, sans-serif; }</style>',
  ...monthLabels,
  ...weekdayLabels,
  ...cells,
  "</svg>",
  "",
].join("\n");

await mkdir("assets", { recursive: true });
await writeFile("assets/github-contributions.svg", svg, "utf8");

console.log(`Generated contribution chart for ${username}.`);
