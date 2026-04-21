'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface AuthInfo {
  userId: string
  userName: string
  role: 'admin' | 'tech_support' | 'manager' | 'technician'
  isAdmin: boolean
  isTechSupport: boolean
  isManager: boolean
  loaded: boolean
}

export function useAuth(minRole?: 'manager' | 'tech_support' | 'admin'): AuthInfo {
  const [auth, setAuth] = useState<AuthInfo>({
    userId: '',
    userName: '',
    role: 'technician',
    isAdmin: false,
    isTechSupport: false,
    isManager: false,
    loaded: false,
  })
  const router = useRouter()

  useEffect(() => {
    const userId = localStorage.getItem('userId') || ''
    const userName = localStorage.getItem('userName') || ''
    const role = (localStorage.getItem('userRole') || 'technician') as AuthInfo['role']
    const isAdmin = role === 'admin'
    const isTechSupport = role === 'tech_support' || isAdmin
    const isManager = role === 'manager' || isTechSupport

    const ROLE_LEVEL: Record<string, number> = {
      technician: 1,
      manager: 2,
      tech_support: 3,
      admin: 4,
    }

    if (minRole && ROLE_LEVEL[role] < ROLE_LEVEL[minRole]) {
      router.push('/dashboard')
      return
    }

    setAuth({ userId, userName, role, isAdmin, isTechSupport, isManager, loaded: true })
  }, [minRole, router])

  return auth
}
