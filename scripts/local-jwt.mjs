// Firma JWT HS256 para el entorno LOCAL de pruebas (nunca para producción).
import { createHmac } from 'node:crypto'
const [secret, role, sub = '', email = ''] = process.argv.slice(2)
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const payload = { role, iss: 'local-test', iat: now, exp: now + 7 * 24 * 3600, ...(sub ? { sub, email, aud: 'authenticated' } : {}) }
const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`
console.log(`${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`)
