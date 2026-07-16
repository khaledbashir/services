'use client'

import { CgDesignDetail } from '@/components/cg-design-detail'

export default function CgDesignDetailPage({ params }: { params: { id: string } }) {
  return <CgDesignDetail params={params} />
}
