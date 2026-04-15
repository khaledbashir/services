const API = 'https://abc-twenty.izcgmb.easypanel.host/rest';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc1NTQ2MzA3LCJleHAiOjQ5MjkxNDYzMDYsImp0aSI6IjZlNjhiOWYxLTI3NjMtNGMwMS1iMjc3LWRjN2E0YzkxYzI5MiJ9.1JNTqjsFdOJAlGGOibOgR4g5no6PqpVDDP9a7KQNmX4';

async function main() {
  const res = await fetch(`${API}/designRequests?limit=100`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  const data = await res.json();
  if (data.statusCode) {
    console.error(data);
    return;
  }
  const records = (data.data?.designRequests || []).filter(r => !!r.ftpProofLink);
  console.log("Records with ftpProofLink found:", records.length);
  for (const r of records.slice(0, 3)) {
    console.log(r.id, r.name, r.ftpProofLink, r.proofShareUrl);
  }
  const fs = require('fs');
  fs.writeFileSync('records.json', JSON.stringify(records, null, 2));
}
main().catch(console.error);
