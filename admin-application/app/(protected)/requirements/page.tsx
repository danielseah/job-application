import { createClient } from "@/utils/supabase/server"
import { RequirementsManager } from "@/components/requirements-manager"

export default async function RequirementsPage() {
  const supabase = await createClient()

  // Fetch existing requirements
  const { data: requirements, error } = await supabase
    .from("requirements")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching requirements:", error)
  }

  // Get a list of available form fields by fetching the most recent form submission
  const { data: latestSubmission, error: submissionError } = await supabase
    .from("form_submissions")
    .select("form_data")
    .order("created_at", { ascending: false })
    .limit(1)

  if (submissionError) {
    console.error("Error fetching latest submission:", submissionError)
  }

  // Extract field names from the latest submission
  let availableFields: string[] = []
  if (latestSubmission && latestSubmission.length > 0) {
    availableFields = Object.keys(latestSubmission[0].form_data)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Application Requirements</h1>
      </div>

      <div className="rounded-md border bg-card">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Red Flag Requirements</h2>
          <p className="text-muted-foreground mb-6">
            Define conditions that will flag applications for additional review. These rules will be applied
            automatically when applications are submitted.
          </p>

          <RequirementsManager requirements={requirements || []} availableFields={availableFields} />
        </div>
      </div>
    </div>
  )
}
