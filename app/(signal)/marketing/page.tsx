import { SignalTopbar } from '@/components/signal/topbar'
import { ComposeCanvas } from '@/components/signal/compose-canvas'

export default function SignalComposePage() {
  return (
    <div className="flex flex-col">
      <SignalTopbar
        title="Compose"
        description="Write once. Signal shapes it per channel in ANC's voice."
      />
      <ComposeCanvas />
    </div>
  )
}
