// admin-application/app/(protected)/applications/page.tsx

import { createClient } from "@/utils/supabase/server"
import { ApplicationsTable } from "@/components/applications-table"

// Helper function to ensure red_flag_reasons is always handled correctly
const processApplicationData = (applications: any[]) => {
  return applications.map(app => {
    // Ensure red_flag_reasons is properly parsed if it's a JSON string
    if (typeof app.red_flag_reasons === 'string') {
      try {
        app.red_flag_reasons = JSON.parse(app.red_flag_reasons)
      } catch (error) {
        // If parsing fails, treat it as a single item array
        app.red_flag_reasons = [app.red_flag_reasons]
      }
    } else if (app.red_flag_reasons === null) {
      app.red_flag_reasons = []
    }
    
    return app
  })
}

export default async function ApplicationsPage() {
  const supabase = await createClient()

  // Fetch applications
  const { data: rawApplications, error } = await supabase
    .from("applications")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching applications:", error)
  }

  // Process the application data to ensure red_flag_reasons is handled correctly
  const applications = rawApplications ? processApplicationData(rawApplications) : []

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Job Applications</h1>
      </div>

      <ApplicationsTable applications={applications} />
    </div>
  )
}