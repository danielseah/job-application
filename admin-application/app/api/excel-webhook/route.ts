import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { createClient } from "@/utils/supabase/server"

export async function POST(request: Request) {
  try {
    // Get the request body
    const formData = await request.json()

    // Get headers for verification
    const headersList = headers()
    const signature = headersList.get("x-signature") || ""

    // TODO: Verify webhook signature (implementation depends on the service)
    // const isValid = verifySignature(body, signature);
    // if (!isValid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });

    console.log("Webhook received:", formData)

    // Initialize Supabase client
    const supabase = await createClient()

    // Extract phone number from form data to find the existing application
    const phoneNumber = formData["Please provide us with your mobile phone number  (eg. 6512345678)"] || ""

    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number not found in form data" }, { status: 400 })
    }

    // Find the existing application created by the chatbot
    const { data: existingApplications, error: findError } = await supabase
      .from("applications")
      .select("*")
      .eq("phone_number", phoneNumber)
      .order("created_at", { ascending: false })
      .limit(1)

    if (findError) {
      console.error("Error finding application:", findError)
      return NextResponse.json({ error: "Failed to find application" }, { status: 500 })
    }

    if (!existingApplications || existingApplications.length === 0) {
      return NextResponse.json({ error: "No application found for this phone number" }, { status: 404 })
    }

    const application = existingApplications[0]

    // Fetch all requirements from the database
    const { data: requirements, error: requirementsError } = await supabase.from("requirements").select("*")

    if (requirementsError) {
      console.error("Error fetching requirements:", requirementsError)
      return NextResponse.json({ error: "Failed to fetch requirements" }, { status: 500 })
    }

    // Check for red flags based on requirements
    const redFlags = []

    if (requirements && requirements.length > 0) {
      for (const req of requirements) {
        // Get the form field value, handling missing fields gracefully
        const fieldValue = formData[req.field_name]

        // Skip if field doesn't exist in the form
        if (fieldValue === undefined) continue

        // Convert field value to string for comparison (handles arrays)
        const stringValue = Array.isArray(fieldValue) ? fieldValue.join(", ") : String(fieldValue)

        let conditionMet = false

        // Apply the condition
        switch (req.condition) {
          case "equals":
            conditionMet = stringValue === req.value
            break
          case "not_equals":
            conditionMet = stringValue !== req.value
            break
          case "contains":
            conditionMet = stringValue.toLowerCase().includes(req.value.toLowerCase())
            break
          case "not_contains":
            conditionMet = !stringValue.toLowerCase().includes(req.value.toLowerCase())
            break
          case "is_empty":
            conditionMet = stringValue === "" || stringValue === null
            break
          case "is_not_empty":
            conditionMet = stringValue !== "" && stringValue !== null
            break
          default:
            // For unrecognized conditions, skip this requirement
            continue
        }

        if (conditionMet) {
          redFlags.push(req.red_flag_reason)
        }
      }
    }

    // Update the application with form completion and red flags
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        form_step: true,
        red_flags: redFlags.length,
        red_flag_reasons: redFlags,
        status: "form_submitted",
      })
      .eq("id", application.id)

    if (updateError) {
      console.error("Error updating application:", updateError)
      return NextResponse.json({ error: "Failed to update application" }, { status: 500 })
    }

    // Store the complete form data
    const { error: formError } = await supabase.from("form_submissions").insert({
      application_id: application.id,
      form_data: formData,
    })

    if (formError) {
      console.error("Error storing form data:", formError)
      return NextResponse.json({ error: "Failed to store form data" }, { status: 500 })
    }

    // Return a success response
    return NextResponse.json({
      success: true,
      message: "Application updated and form processed",
      applicationId: application.id,
    })
  } catch (error) {
    console.error("Webhook error:", error)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}
