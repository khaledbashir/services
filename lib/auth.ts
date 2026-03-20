import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { query } from './db'
import bcrypt from 'bcryptjs'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key-change-in-production')

export interface JWTPayload {
  userId: number
  email: string
  fullName: string
  role: string
  [key: string]: any
}

export async function createJWT(payload: JWTPayload): Promise<string> {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET)
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const verified = await jwtVerify(token, JWT_SECRET)
    return verified.payload as unknown as JWTPayload
  } catch (err) {
    return null
  }
}

export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) return null
  return verifyJWT(token)
}

export async function authenticateUser(email: string, password: string): Promise<JWTPayload | null> {
  try {
    const result = await query(
      'SELECT id, full_name, email, role FROM staff WHERE email = $1 AND is_active = true',
      [email]
    )
    
    if (result.rows.length === 0) return null
    
    const user = result.rows[0]
    
    // Get the password hash for verification
    const hashResult = await query(
      'SELECT password_hash FROM staff WHERE id = $1',
      [user.id]
    )
    
    if (hashResult.rows.length === 0) return null
    
    const passwordHash = hashResult.rows[0].password_hash
    const isValidPassword = await bcrypt.compare(password, passwordHash)
    
    if (!isValidPassword) return null
    
    return {
      userId: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    }
  } catch (err) {
    console.error('Auth error:', err)
    return null
  }
}
