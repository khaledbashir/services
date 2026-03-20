'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface AuthInfo {
  userId: string
  userName: string
  role: 'admin' | 'manager' | 'technician'
  isAdmin: boolean
  isManager: boolean
  loaded: boolean
}

export function useAuth(minRole?: 'manager' | 'admin'): AuthInfo {
  const [auth, setAuth] = useState<AuthInfo>({
    userId: '',
    userName: '',
    role: 'technician',
    isAdmin: false,
    isManager: false,
    loaded: false,
  })
  const router = useRouter()

  useEffect(() => {
    const userId = localStorage.getItem('userId') || ''
    const userName = localStorage.getItem('userName') || ''
    const role = (localStorage.getItem('userRole') || 'technician') as AuthInfo['role']
    const isAdmin = role === 'admin'
    const isManager = role === 'manager' || isAdmin

    const ROLE_LEVEL: Record<string, number> = {
      technician: 1,
      manager: 2,
      admin: 3,
    }

    if (minRole && ROLE_LEVEL[role] < ROLE_LEVEL[minRole]) {
      router.push('/dashboard')
      return
    }

    setAuth({ userId, userName, role, isAdmin, isManager, loaded: true })
  }, [minRole, router])

  return auth
}
