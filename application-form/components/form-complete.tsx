"use client"

import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CheckCircle, XCircle } from "lucide-react"
import InterviewScheduler from "./interview-scheduler"

type FormCompleteProps = {
  result: {
    success: boolean
    status: "accepted" | "rejected"
    reasons?: string[]
    applicantId?: string
    applicantName?: string
  } | null
}

export default function FormComplete({ result }: FormCompleteProps) {
  const [showScheduler, setShowScheduler] = useState(false)
  const [interviewScheduled, setInterviewScheduled] = useState(false)

  if (!result || !result.success) {
    return (
      <div className="text-center py-8">
        <Alert variant="destructive" className="mb-6">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>There was a problem submitting your application. Please try again later.</AlertDescription>
        </Alert>
      </div>
    )
  }

  const isAccepted = result.status === "accepted"

  const handleScheduleInterview = () => {
    setShowScheduler(true)
  }

  const handleScheduleComplete = (success: boolean) => {
    setInterviewScheduled(success)
    setShowScheduler(false)
  }

  if (showScheduler && result.applicantId && result.applicantName) {
    return (
      <InterviewScheduler
        applicantId={result.applicantId}
        applicantName={result.applicantName}
        onComplete={handleScheduleComplete}
      />
    )
  }

  return (
    <div className="text-center py-8">
      {isAccepted ? (
        <>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-6">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Application Accepted!</h2>
          <p className="text-muted-foreground mb-6">
            Thank you for completing the application form. Your application has been accepted for review.
          </p>

          {interviewScheduled ? (
            <Alert className="mb-6 max-w-md mx-auto">
              <AlertTitle>Interview Scheduled</AlertTitle>
              <AlertDescription>Your interview has been scheduled. We look forward to meeting you!</AlertDescription>
            </Alert>
          ) : (
            <Button onClick={handleScheduleInterview} className="mb-6">
              Schedule Interview
            </Button>
          )}
        </>
      ) : (
        <>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-6">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Application Not Successful</h2>
          <p className="text-muted-foreground mb-4">
            Thank you for your interest. Unfortunately, your application does not meet our current requirements.
          </p>

          {result.reasons && result.reasons.length > 0 && (
            <Alert className="mb-6 text-left max-w-md mx-auto">
              <AlertTitle className="mb-2">Reasons:</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5 space-y-1">
                  {result.reasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  )
}
