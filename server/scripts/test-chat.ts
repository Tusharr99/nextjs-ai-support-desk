import fetch from 'node-fetch';

async function test() {
  const res = await fetch('http://localhost:5000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: "What is Next.js?" })
  });

  const body = await res.text();
  console.log('Response:', body.substring(0, 500) + '...');
}

test().catch(console.error);
