"use server"

import { google } from "googleapis"
import { JWT } from "google-auth-library"

// Define the form data type
type FormData = {
  fullName: string
  nric: string
  age: string
  gender: string
  contactNumber: string
  nearestMRT: string
  workingOrStudying: string
  isStudent: string
  currentStudy: string
  currentGrade: string
  highestQualification: string
  lastSchoolAttended: string
  qualificationGradePoints: string
  commitment: string
  holidaysDuringCommitment: string
  reasonForJob: string
  hasExperience: string
  mostRecentJob: string
  durationOfRecentJob: string
  electronicsExperience: string
  excelFamiliarity: string
  medication: string
  smoking: string
  medicalConditions: string
  criminalInvestigation: string
  courtCharges: string
  startDate: string
}

// Define the result type
type SubmissionResult = {
  success: boolean
  status: "accepted" | "rejected"
  reasons?: string[]
}

// Define interview slot type
type InterviewSlot = {
  date: string
  time: string
  applicantId: string
  applicantName: string
}

// Function to validate the form data against rejection criteria
function validateApplication(formData: FormData): SubmissionResult {
  const rejectionReasons: string[] = []

  // Check age criteria
  const age = Number.parseInt(formData.age)
  if (age > 50) {
    rejectionReasons.push("Age exceeds maximum limit")
  }
  if (age < 16) {
    rejectionReasons.push("Age below minimum requirement")
  }

  // Check smoking status
  if (formData.smoking === "yes") {
    rejectionReasons.push("Smoking not permitted for this position")
  }

  // Check criminal record
  if (formData.criminalInvestigation === "yes" || formData.courtCharges === "yes") {
    rejectionReasons.push("Criminal record check failed")
  }

  // Check medication
  if (formData.medication === "yes") {
    rejectionReasons.push("Medical requirements not met")
  }

  // Check commitment period vs holidays
  // This is a simplified check - in a real app you'd need more detailed logic
  if (formData.commitment === "1-3months" && formData.holidaysDuringCommitment === "yes") {
    rejectionReasons.push("Commitment period insufficient with planned holidays")
  }

  // Check electronics industry experience
  if (formData.electronicsExperience && formData.electronicsExperience.trim() !== "") {
    rejectionReasons.push("Experience profile does not match requirements")
  }

  // Determine if application is accepted or rejected
  if (rejectionReasons.length > 0) {
    return {
      success: true,
      status: "rejected",
      reasons: rejectionReasons,
    }
  }

  return {
    success: true,
    status: "accepted",
  }
}

// Function to get Google Sheets client
async function getGoogleSheetsClient() {
  const auth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })

  return google.sheets({ version: "v4", auth })
}

// Function to submit form data to appropriate Google Sheet
async function submitToGoogleSheets(formData: FormData, result: SubmissionResult) {
  try {
    const sheets = await getGoogleSheetsClient()
    const spreadsheetId = process.env.GOOGLE_SHEET_ID

    // Generate a unique ID for the applicant
    const applicantId = `APP-${Date.now()}-${Math.floor(Math.random() * 1000)}`

    // Prepare the data row with all form fields
    const values = [
      [
        applicantId,
        formData.fullName,
        formData.nric,
        formData.age,
        formData.gender,
        formData.contactNumber,
        formData.nearestMRT,
        formData.workingOrStudying,
        formData.currentStudy,
        formData.highestQualification,
        formData.lastSchoolAttended,
        formData.commitment,
        formData.holidaysDuringCommitment,
        formData.reasonForJob,
        formData.hasExperience,
        formData.mostRecentJob,
        formData.electronicsExperience,
        formData.excelFamiliarity,
        formData.medication,
        formData.smoking,
        formData.medicalConditions,
        formData.criminalInvestigation,
        formData.courtCharges,
        formData.startDate,
        new Date().toISOString(), // Submission timestamp
      ],
    ]

    // Determine which sheet to write to
    const sheetName = result.status === "accepted" ? "Accepted" : "Rejected"

    // Add rejection reasons if applicable
    if (result.status === "rejected" && result.reasons) {
      values[0].push(result.reasons.join(", "))
    }

    // Append the data to the appropriate sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueInputOption: "RAW",
      requestBody: {
        values,
      },
    })

    return {
      success: true,
      applicantId,
    }
  } catch (error) {
    console.error("Error submitting to Google Sheets:", error)
    return {
      success: false,
      error: "Failed to save application data",
    }
  }
}

// Main submission handler
export async function submitApplication(formData: FormData): Promise<SubmissionResult & { applicantId?: string }> {
  // Validate the application
  const result = validateApplication(formData)

  // Submit to Google Sheets
  const sheetSubmission = await submitToGoogleSheets(formData, result)

  if (!sheetSubmission.success) {
    return {
      success: false,
      status: "rejected",
      reasons: ["Technical error occurred during submission. Please try again later."],
    }
  }

  return {
    ...result,
    applicantId: sheetSubmission.applicantId,
  }
}

// Function to get available interview slots
export async function getAvailableInterviewSlots() {
  // Generate interview slots for the next 4 weeks
  // Only weekdays (Monday-Friday) at 3pm
  const slots = []
  const today = new Date()

  // Start from tomorrow
  const startDate = new Date(today)
  startDate.setDate(today.getDate() + 1)

  // Generate slots for the next 4 weeks
  for (let i = 0; i < 28; i++) {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + i)

    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (date.getDay() === 0 || date.getDay() === 6) {
      continue
    }

    // Format date as YYYY-MM-DD
    const formattedDate = date.toISOString().split("T")[0]

    // Add 3pm slot
    slots.push({
      date: formattedDate,
      time: "15:00", // 3pm in 24-hour format
      available: true,
    })
  }

  try {
    // Check which slots are already booked
    const sheets = await getGoogleSheetsClient()
    const spreadsheetId = process.env.GOOGLE_SHEET_ID

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Interviews!A:C",
    })

    const bookedSlots = response.data.values || []

    // Skip header row if it exists
    const startIndex = bookedSlots.length > 0 && bookedSlots[0][0] === "Date" ? 1 : 0

    // Mark booked slots as unavailable
    for (let i = startIndex; i < bookedSlots.length; i++) {
      const [bookedDate, bookedTime] = bookedSlots[i]

      // Find and mark the slot as unavailable
      const slotIndex = slots.findIndex((slot) => slot.date === bookedDate && slot.time === bookedTime)

      if (slotIndex !== -1) {
        slots[slotIndex].available = false
      }
    }

    return {
      success: true,
      slots: slots.filter((slot) => slot.available),
    }
  } catch (error) {
    console.error("Error fetching interview slots:", error)
    return {
      success: false,
      error: "Failed to fetch available interview slots",
      slots: [],
    }
  }
}

// Function to book an interview slot
export async function bookInterviewSlot(applicantId: string, applicantName: string, date: string, time: string) {
  try {
    const sheets = await getGoogleSheetsClient()
    const spreadsheetId = process.env.GOOGLE_SHEET_ID

    // Add the interview to the Interviews sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Interviews!A:E",
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            date,
            time,
            applicantId,
            applicantName,
            new Date().toISOString(), // Booking timestamp
          ],
        ],
      },
    })

    return {
      success: true,
      message: "Interview scheduled successfully",
    }
  } catch (error) {
    console.error("Error booking interview slot:", error)
    return {
      success: false,
      error: "Failed to book interview slot",
    }
  }
}
