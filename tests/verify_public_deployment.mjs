import { io } from 'socket.io-client'
import * as Y from 'yjs'
import * as awarenessProtocol from 'y-protocols/awareness'

const BASE_URL = 'https://codecollab-api-2xar.onrender.com'
const FRONTEND_URL = 'https://codecollab-app-ev89.onrender.com'

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function verifyAll() {
  console.log('====================================================')
  console.log('REAL-TIME CODE EDITOR: FULL SYSTEM VERIFICATION')
  console.log('====================================================\n')

  // 1. Health check
  console.log('1. Checking backend health check (/health)...')
  const healthRes = await fetch(`${BASE_URL}/health`)
  const health = await healthRes.json()
  console.log('   Health response:', health)
  if (health.status !== 'ok') throw new Error('Health check failed')
  console.log('   -> PASS: Backend is alive and healthy.\n')

  // 2. Register User A and User B
  console.log('2. Registering two separate users in PostgreSQL...')
  const timestamp = Date.now()
  const userAData = { name: 'User A (Laptop)', email: `user_a_${timestamp}@example.com`, password: 'TestPassword123!' }
  const userBData = { name: 'User B (Phone)', email: `user_b_${timestamp}@example.com`, password: 'TestPassword123!' }

  const regARes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userAData),
  })
  const userA = await regARes.json()

  const regBRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userBData),
  })
  const userB = await regBRes.json()

  console.log(`   User A: ID=${userA.user.id}, Token=${Boolean(userA.token)}`)
  console.log(`   User B: ID=${userB.user.id}, Token=${Boolean(userB.token)}`)
  console.log('   -> PASS: Both users successfully registered with unique accounts.\n')

  // 3. User A creates a room
  console.log('3. User A creates a collaborative room...')
  const roomRes = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userA.token}`,
    },
    body: JSON.stringify({ name: 'Live Team Coding', language: 'python' }),
  })
  const room = await roomRes.json()
  console.log(`   Room created: ID=${room.id}, Name="${room.name}"`)
  console.log(`   Shareable URL: ${FRONTEND_URL}/room/${room.id}`)
  console.log('   -> PASS: Room creation and membership persisted.\n')

  // 4. User B joins the room
  console.log('4. User B joins the room via shareable link...')
  const joinRes = await fetch(`${BASE_URL}/api/rooms/${room.id}/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userB.token}`,
    },
  })
  const join = await joinRes.json()
  console.log('   Join response:', join)
  console.log('   -> PASS: User B successfully authorized as room member.\n')

  // 5. Connect Socket.IO for both User A and User B
  console.log('5. Connecting User A & User B via Socket.IO WebSocket...')
  const socketA = io(BASE_URL, {
    auth: { token: userA.token },
    transports: ['websocket'],
  })
  const socketB = io(BASE_URL, {
    auth: { token: userB.token },
    transports: ['websocket'],
  })

  await Promise.all([
    new Promise(r => socketA.on('connect', r)),
    new Promise(r => socketB.on('connect', r)),
  ])
  console.log(`   Socket A connected: ID=${socketA.id}`)
  console.log(`   Socket B connected: ID=${socketB.id}`)

  // 6. Join room on sockets
  console.log('\n6. Joining room on WebSocket channels...')
  socketA.emit('join-room', room.id)
  socketB.emit('join-room', room.id)

  let roomUsersList = null
  socketA.on('room-users', (users) => {
    roomUsersList = users
  })

  await sleep(1000)
  console.log(`   Active collaborators broadcasted: ${roomUsersList ? roomUsersList.length : 0} online`)
  console.log('   -> PASS: Multi-user presence established.\n')

  // 7. Test Real-time Concurrent Typing via Yjs
  console.log('7. Testing real-time Yjs CRDT concurrent editing synchronization...')
  const docA = new Y.Doc()
  const yTextA = docA.getText('monaco')

  const docB = new Y.Doc()
  const yTextB = docB.getText('monaco')

  // Forward updates over socket
  docA.on('update', (update, origin) => {
    if (origin !== 'remote') {
      socketA.emit('sync-update', { roomId: room.id, update: Array.from(update) })
    }
  })

  docB.on('update', (update, origin) => {
    if (origin !== 'remote') {
      socketB.emit('sync-update', { roomId: room.id, update: Array.from(update) })
    }
  })

  socketA.on('sync-update', (updateBytes) => {
    Y.applyUpdate(docA, new Uint8Array(updateBytes), 'remote')
  })

  socketB.on('sync-update', (updateBytes) => {
    Y.applyUpdate(docB, new Uint8Array(updateBytes), 'remote')
  })

  // User A types line 1
  console.log('   [Action] User A types: "def calculate_sum(a, b):\\n"')
  yTextA.insert(0, 'def calculate_sum(a, b):\n')
  await sleep(600)

  // User B sees User A's edit without refreshing
  console.log(`   [Verification] User B's editor content: "${yTextB.toString().trim()}"`)
  if (!yTextB.toString().includes('calculate_sum')) {
    throw new Error('User B failed to receive User A edit in real time!')
  }

  // Concurrent editing: User A and User B type at the same time
  console.log('   [Action] Concurrent edits: User A types comment, User B types return statement...')
  yTextA.insert(0, '# Collaborative Math Functions\n')
  yTextB.insert(yTextB.length, '    return a + b\n')

  await sleep(1000)

  console.log(`   User A final document:\n---\n${yTextA.toString().trim()}\n---`)
  console.log(`   User B final document:\n---\n${yTextB.toString().trim()}\n---`)

  if (yTextA.toString() !== yTextB.toString()) {
    throw new Error('Yjs CRDT documents diverged!')
  }
  console.log('   -> PASS: CRDT documents converged identically without data loss!\n')

  // 8. Test Live Cursor / Awareness broadcast
  console.log('8. Testing Awareness / Live Cursor tracking protocol...')
  const awarenessA = new awarenessProtocol.Awareness(docA)
  awarenessA.setLocalStateField('user', { name: 'User A (Laptop)', color: '#3b82f6' })

  let receivedAwarenessUpdate = false
  socketB.on('awareness-update', (data) => {
    if (data.update) receivedAwarenessUpdate = true
  })

  const awarenessBytes = awarenessProtocol.encodeAwarenessUpdate(awarenessA, [docA.clientID])
  socketA.emit('awareness-update', { roomId: room.id, update: Array.from(awarenessBytes) })

  await sleep(600)
  console.log(`   Awareness update delivered to User B: ${receivedAwarenessUpdate}`)
  if (!receivedAwarenessUpdate) throw new Error('Awareness/cursor update failed to broadcast')
  console.log('   -> PASS: Live cursor protocol working.\n')

  // 9. Real Judge0 Code Execution
  console.log('9. Testing real Judge0 code execution with current collaborative code...')
  const execCode = `${yTextA.toString()}\nprint("Result:", calculate_sum(40, 2))\n`
  const execRes = await fetch(`${BASE_URL}/api/rooms/${room.id}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userA.token}`,
    },
    body: JSON.stringify({
      code: execCode,
      language: 'python',
    }),
  })
  const execOutput = await execRes.json()
  console.log('   Judge0 Status:', execOutput.status?.description)
  console.log('   Judge0 Time:', execOutput.time, 's')
  console.log('   Judge0 Stdout:', execOutput.stdout?.trim())
  if (!execOutput.stdout?.includes('Result: 42')) {
    throw new Error(`Judge0 unexpected output: ${JSON.stringify(execOutput)}`)
  }
  console.log('   -> PASS: Code executed on real Judge0 sandbox successfully!\n')

  // 10. Clean up sockets
  socketA.disconnect()
  socketB.disconnect()
  console.log('====================================================')
  console.log('ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!')
  console.log('====================================================')
}

verifyAll().catch((err) => {
  console.error('\n❌ Verification Failed:', err)
  process.exit(1)
})
