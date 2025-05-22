"use client"

import { useState } from "react"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import PersonalInfoForm from "@/components/personal-info-form"
import EducationWorkForm from "@/components/education-work-form"
import WorkExperienceForm from "@/components/work-experience-form"
import SkillsForm from "@/components/skills-form"
import HealthLegalForm from "@/components/health-legal-form"
import AvailabilityForm from "@/components/availability-form"
import FormComplete from "@/components/form-complete"
import { submitApplication } from "./actions"

export default function MultiStepForm() {
  const [currentStep, setCurrentStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionResult, setSubmissionResult] = useState(null)
  const [formData, setFormData] = useState({
    // Personal Info
    fullName: "",
    nric: "",
    age: "",
    gender: "",
    contactNumber: "",
    nearestMRT: "",

    // Education/Work
    workingOrStudying: "",
    isStudent: "",
    currentStudy: "",
    currentGrade: "",
    highestQualification: "",
    lastSchoolAttended: "",
    qualificationGradePoints: "",

    // Work Experience
    commitment: "",
    holidaysDuringCommitment: "",
    reasonForJob: "",
    hasExperience: "",
    mostRecentJob: "",
    durationOfRecentJob: "",

    // Skills
    electronicsExperience: "",
    excelFamiliarity: "",

    // Health & Legal
    medication: "",
    smoking: "",
    medicalConditions: "",
    criminalInvestigation: "",
    courtCharges: "",

    // Availability
    startDate: "",
  })

  const formSteps = [
    { title: "Personal Information", component: PersonalInfoForm },
    { title: "Education & Work Status", component: EducationWorkForm },
    { title: "Work Experience", component: WorkExperienceForm },
    { title: "Skills & Experience", component: SkillsForm },
    { title: "Health & Legal", component: HealthLegalForm },
    { title: "Availability", component: AvailabilityForm },
    { title: "Complete", component: FormComplete },
  ]

  const updateFormData = (data) => {
    setFormData({ ...formData, ...data })
  }

  const handleNext = () => {
    if (currentStep < formSteps.length - 1) {
      setCurrentStep(currentStep + 1)
      window.scrollTo(0, 0)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
      window.scrollTo(0, 0)
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const result = await submitApplication(formData)
      setSubmissionResult({
        ...result,
        applicantName: formData.fullName, // Pass the applicant's name
      })
      handleNext() // Move to completion step
    } catch (error) {
      console.error("Error submitting form:", error)
      setSubmissionResult({
        success: false,
        status: "rejected",
        reasons: ["An unexpected error occurred. Please try again later."],
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const CurrentFormComponent = formSteps[currentStep].component
  const isLastStep = currentStep === formSteps.length - 2
  const isComplete = currentStep === formSteps.length - 1

  const progressPercentage = (currentStep / (formSteps.length - 1)) * 100

  return (
    <div className="container mx-auto py-10 px-4 max-w-3xl">
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold text-center">Application Form</h1>
        <p className="text-muted-foreground text-center">Please complete all sections of the form</p>
      </div>

      <div className="mb-8 space-y-2">
        <div className="flex justify-between text-sm mb-1">
          <span>Progress</span>
          <span>{Math.round(progressPercentage)}%</span>
        </div>
        <Progress value={progressPercentage} className="h-2" />

        <div className="flex justify-between text-sm mt-2">
          {formSteps.slice(0, -1).map((step, index) => (
            <span
              key={index}
              className={`${currentStep >= index ? "text-primary font-medium" : "text-muted-foreground"} hidden sm:inline-block`}
            >
              {index + 1}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-card border rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">{formSteps[currentStep].title}</h2>

        {isComplete ? (
          <FormComplete result={submissionResult} />
        ) : (
          <CurrentFormComponent formData={formData} updateFormData={updateFormData} />
        )}
      </div>

      {!isComplete && (
        <div className="flex justify-between">
          <Button variant="outline" onClick={handlePrevious} disabled={currentStep === 0}>
            Previous
          </Button>

          {isLastStep ? (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          ) : (
            <Button onClick={handleNext}>Next</Button>
          )}
        </div>
      )}
    </div>
  )
}
