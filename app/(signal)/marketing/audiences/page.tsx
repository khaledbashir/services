import { SignalTopbar } from '@/components/signal/topbar'
import { AudienceBuilder } from '@/components/signal/audience-builder'

export default function AudiencesPage() {
  return (
    <div className="flex flex-col">
      <SignalTopbar
        title="Audiences"
        description="Describe an audience in plain English. Signal turns it into safe SQL and previews who's in."
      />
      <AudienceBuilder />
    </div>
  )
}
