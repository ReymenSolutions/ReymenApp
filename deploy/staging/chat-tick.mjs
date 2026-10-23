// Runs inside the staging app container: no secret on the command line or in logs.
if (process.env.REYMEN_STAGING !== 'true' || process.env.AI_MARK_PRIVATE_CHAT_ENABLED !== 'true') process.exit(0);
if (!process.env.CRON_SECRET) process.exit(1);
try {
  const response = await fetch('http://127.0.0.1:3000/api/cron/mark-chat', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(175000),
  });
  if (!response.ok) process.exit(1);
} catch { process.exit(1); }
