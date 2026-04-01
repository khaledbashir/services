'use client'

import { useState, useRef, DragEvent, ChangeEvent, ReactNode } from 'react'

interface DropZoneProps {
  onFile: (file: File) => void
  accept?: string
  disabled?: boolean
  className?: string
  activeClassName?: string
  children: ReactNode
  dragChildren?: ReactNode
}

export function DropZone({ onFile, accept, disabled, className = '', activeClassName, children, dragChildren }: DropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.items?.length > 0) setDragging(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) setDragging(false)
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    dragCounter.current = 0
    if (disabled) return
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  const handleClick = () => {
    if (!disabled) inputRef.current?.click()
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    e.target.value = ''
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`cursor-pointer transition-all ${dragging ? (activeClassName || 'ring-2 ring-[#0A52EF] ring-offset-2 bg-blue-50/50') : ''} ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleChange} disabled={disabled} />
      {dragging && dragChildren ? dragChildren : children}
    </div>
  )
}
