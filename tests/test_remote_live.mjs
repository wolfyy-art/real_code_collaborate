const BASE_URL = 'https://codecollab-api-2xar.onrender.com'

async function testRemote() {
  console.log('Testing live backend:', BASE_URL)
  
  // 1. Health
  const health = await fetch(BASE_URL + '/health').then(r => r.json())
  console.log('Health:', health)

  // 2. Register
  const email = `render_test_${Date.now()}@example.com`
  const password = 'Password123!'
  const reg = await fetch(BASE_URL + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'RenderTester' })
  }).then(r => r.json())
  console.log('Registered user:', reg.user?.name, 'Token received:', Boolean(reg.token))

  // 3. Create Room
  const room = await fetch(BASE_URL + '/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reg.token}` },
    body: JSON.stringify({ name: 'Live Render Room', language: 'python' })
  }).then(r => r.json())
  console.log('Created room:', room.id)

  // 4. Execute Code via Judge0 on the live deployment
  const exec = await fetch(`${BASE_URL}/api/rooms/${room.id}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reg.token}` },
    body: JSON.stringify({
      code: 'print("LIVE RENDER EXECUTION ON JUDGE0 SUCCESSFUL!")',
      language: 'python'
    })
  }).then(r => r.json())
  console.log('Code Execution Output:\n', exec)
}

testRemote().catch(console.error)

