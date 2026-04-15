'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface Task {
  id: string
  title: string
  body?: string
  dueAt?: string
  status: string
  taskType?: string
  taskPriority?: string
  taskCategory?: string
  createdAt: string
  updatedAt: string
}

const statusColumns = ['TODO', 'IN_PROGRESS', 'DONE'] as const
const statusLabels: Record<string, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
}
const statusColors: Record<string, string> = {
  TODO: 'bg-zinc-100 border-zinc-300',
  IN_PROGRESS: 'bg-blue-50 border-blue-300',
  DONE: 'bg-green-50 border-green-300',
}

const priorityDot: Record<string, string> = {
  URGENT: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-amber-400',
  LOW: 'bg-zinc-400',
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<'kanban' | 'table'>('kanban')

  useEffect(() => {
    fetch('/api/twenty/tasks')
      .then(r => r.json())
      .then(data => {
        setTasks(data.data || [])
        setLoading(false)
      })
      .catch(err => {
        setError('Failed to load tasks from Twenty CRM')
        setLoading(false)
      })
  }, [])

  const tasksByStatus = (status: string) => tasks.filter(t => t.status === status)

  const formatDate = (d?: string) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const isOverdue = (t: Task) => t.dueAt && new Date(t.dueAt) < new Date() && t.status !== 'DONE'

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Tasks</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Managed in Twenty CRM — {tasks.length} tasks loaded
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setView('kanban')}
              className={`px-3 py-1.5 text-sm rounded-lg border ${view === 'kanban' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'}`}
            >
              Kanban
            </button>
            <button
              onClick={() => setView('table')}
              className={`px-3 py-1.5 text-sm rounded-lg border ${view === 'table' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'}`}
            >
              Table
            </button>
            <a
              href={`${process.env.NEXT_PUBLIC_TWENTY_URL || 'https://abc-twenty.izcgmb.easypanel.host'}/objects/tasks`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-sm rounded-lg border bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
            >
              Open in Twenty
            </a>
          </div>
        </div>

        {loading && (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            {error}
          </div>
        )}

        {!loading && !error && view === 'kanban' && (
          <div className="grid grid-cols-3 gap-4">
            {statusColumns.map(status => (
              <div key={status} className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-sm font-semibold text-zinc-700">{statusLabels[status]}</h2>
                  <span className="text-xs bg-zinc-200 text-zinc-600 px-1.5 py-0.5 rounded-full">
                    {tasksByStatus(status).length}
                  </span>
                </div>
                <div className="space-y-2">
                  {tasksByStatus(status).map(task => (
                    <div
                      key={task.id}
                      className={`rounded-lg border p-3 ${statusColors[status]} ${isOverdue(task) ? 'ring-2 ring-red-400' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-medium text-zinc-900 leading-tight">{task.title}</h3>
                        {task.taskPriority && (
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${priorityDot[task.taskPriority] || 'bg-zinc-300'}`} />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
                        {task.taskCategory && (
                          <span className="bg-white/60 px-1.5 py-0.5 rounded">{task.taskCategory}</span>
                        )}
                        {task.dueAt && (
                          <span className={isOverdue(task) ? 'text-red-600 font-medium' : ''}>
                            {isOverdue(task) ? 'Overdue: ' : 'Due: '}{formatDate(task.dueAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {tasksByStatus(status).length === 0 && (
                    <div className="text-xs text-zinc-400 text-center py-8 border border-dashed rounded-lg">
                      No tasks
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && view === 'table' && (
          <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="text-left p-3 font-medium text-zinc-600">Task</th>
                  <th className="text-left p-3 font-medium text-zinc-600">Status</th>
                  <th className="text-left p-3 font-medium text-zinc-600">Priority</th>
                  <th className="text-left p-3 font-medium text-zinc-600">Category</th>
                  <th className="text-left p-3 font-medium text-zinc-600">Due</th>
                  <th className="text-left p-3 font-medium text-zinc-600">Type</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => (
                  <tr key={task.id} className={`border-b border-zinc-100 hover:bg-zinc-50 ${isOverdue(task) ? 'bg-red-50' : ''}`}>
                    <td className="p-3">
                      <span className="font-medium text-zinc-900">{task.title}</span>
                    </td>
                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        task.status === 'DONE' ? 'bg-green-100 text-green-700' :
                        task.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                        'bg-zinc-100 text-zinc-700'
                      }`}>
                        {statusLabels[task.status] || task.status}
                      </span>
                    </td>
                    <td className="p-3">
                      {task.taskPriority && (
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${priorityDot[task.taskPriority] || 'bg-zinc-300'}`} />
                          <span className="text-zinc-600">{task.taskPriority}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-zinc-600">{task.taskCategory || '—'}</td>
                    <td className="p-3">
                      <span className={isOverdue(task) ? 'text-red-600 font-medium' : 'text-zinc-600'}>
                        {formatDate(task.dueAt) || '—'}
                      </span>
                    </td>
                    <td className="p-3 text-zinc-600">{task.taskType || '—'}</td>
                  </tr>
                ))}
                {tasks.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-zinc-400">
                      No tasks in Twenty CRM yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
