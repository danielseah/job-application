import { createClient } from "@/utils/supabase/server"
import { ApplicationsTable } from "@/components/applications-table"

export default async function ApplicationsPage() {
  const supabase = await createClient()

  // Fetch applications
  const { data: applications, error } = await supabase
    .from("applications")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching applications:", error)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Job Applications</h1>
      </div>

      <ApplicationsTable applications={applications || []} />
    </div>
  )
}
