// admin-application\components\applications-table.tsx

"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Check,
  X,
  Calendar,
  FileText,
  AlertTriangle,
  MoreVertical,
  Search,
  ChevronUp,
  ChevronDown,
  Filter,
  RefreshCw,
  ClipboardCheck,
  UserCheck,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger 
} from "@/components/ui/dialog"
import { createClient } from "@/utils/supabase/client"
import { useToast } from "@/hooks/use-toast"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Progress } from "@/components/ui/progress"

type Application = {
  id: string
  name: string
  phone_number: string
  resume_step: boolean
  commitment_step: boolean
  form_step: boolean
  red_flags: number
  red_flag_reasons: string[] | string | null
  interview_confirmation: boolean
  pass_step: boolean
  interview_step: boolean
  current_step: string
  created_at: string
}

type SortConfig = {
  key: keyof Application
  direction: "asc" | "desc"
}

// Helper function to ensure red_flag_reasons is always an array
const ensureArray = (value: string[] | string | null | undefined): string[] => {
  if (Array.isArray(value)) {
    return value
  }
  
  if (typeof value === 'string') {
    try {
      // Try to parse it as JSON
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : [value]
    } catch {
      // If parsing fails, treat it as a single string item
      return [value]
    }
  }
  
  // Default to empty array for null/undefined
  return []
}

export function ApplicationsTable({ applications: initialApplications }: { applications: Application[] }) {
  // Normalize all applications to ensure red_flag_reasons is an array
  const normalizedApplications = initialApplications.map(app => ({
    ...app,
    red_flag_reasons: ensureArray(app.red_flag_reasons)
  }))
  
  const [applications, setApplications] = useState<Application[]>(normalizedApplications)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "created_at", direction: "desc" })
  const [stepFilter, setStepFilter] = useState<string | null>(null)
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null)
  const [formData, setFormData] = useState<any>(null)
  const [isCheckingRedFlags, setIsCheckingRedFlags] = useState(false)
  const [isProcessingAction, setIsProcessingAction] = useState(false)

  const supabase = createClient()
  const { toast } = useToast()

  // Fetch form data for a specific application
  const fetchFormData = async (applicationId: string) => {
    const { data, error } = await supabase
      .from("form_submissions")
      .select("form_data")
      .eq("application_id", applicationId)
      .single()

    if (error) {
      console.error("Error fetching form data:", error)
      return null
    }

    setFormData(data.form_data)
    return data.form_data
  }

  // Update application status and notify chatbot
  const updateApplicationStatus = async (id: string, decision: "approved" | "rejected") => {
    setIsProcessingAction(true)
    try {
      // Map decision to appropriate current_step and status for database
      const updateData = decision === "approved" 
        ? { 
            current_step: "request_interview_details",
            status: "interview_pending" 
        } 
        : {
            current_step: "rejected",
            status: "rejected"
        }
      
      // Update both current_step and status in Supabase
      const { error } = await supabase.from("applications").update(updateData).eq("id", id)

      if (error) {
        console.error("Error updating application:", error)
        toast({
          title: "Error",
          description: `Failed to update application: ${error.message}`,
          variant: "destructive",
        })
        return
      }

      // Update local state
      setApplications(applications.map((app) => (app.id === id ? { ...app, ...updateData } : app)))
      
      if (selectedApplication && selectedApplication.id === id) {
        setSelectedApplication({...selectedApplication, ...updateData})
      }

      // Send webhook to chatbot to notify of status change
      try {
        const response = await fetch("/api/notify-chatbot", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            application_id: id,
            event_type: "application_review",
            decision,
            timestamp: new Date().toISOString()
          }),
        })

        if (!response.ok) {
          throw new Error(`Server responded with status: ${response.status}`)
        }

        toast({
          title: "Success",
          description: `Application ${decision === "approved" ? "approved" : "rejected"} successfully.`,
          variant: "default",
        })
      } catch (error) {
        console.error("Error notifying chatbot:", error)
        toast({
          title: "Warning",
          description: "Application updated but failed to notify messaging system.",
          variant: "warning",
        })
      }
    } catch (err) {
      console.error("Error in updateApplicationStatus:", err)
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      })
    } finally {
      setIsProcessingAction(false)
    }
  }

  // Check for red flags based on latest requirements
  const checkForRedFlags = async (application: Application) => {
    setIsCheckingRedFlags(true)

    try {
      // Fetch form data if not already loaded
      const formDataToCheck = formData || (await fetchFormData(application.id))

      if (!formDataToCheck) {
        toast({
          title: "Error",
          description: "Could not find form data for this application",
          variant: "destructive",
        })
        setIsCheckingRedFlags(false)
        return
      }

      // Fetch latest requirements
      const { data: requirements, error: requirementsError } = await supabase.from("requirements").select("*")

      if (requirementsError) {
        console.error("Error fetching requirements:", requirementsError)
        toast({
          title: "Error",
          description: "Failed to fetch requirements",
          variant: "destructive",
        })
        setIsCheckingRedFlags(false)
        return
      }

      // Check for red flags based on requirements
      const redFlags: string[] = []

      if (requirements && requirements.length > 0) {
        for (const req of requirements) {
          // Get the form field value, handling missing fields gracefully
          const fieldValue = formDataToCheck[req.field_name]

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

      // Update the application with new red flags
      const { error: updateError } = await supabase
        .from("applications")
        .update({
          red_flags: redFlags.length,
          red_flag_reasons: redFlags,
        })
        .eq("id", application.id)

      if (updateError) {
        console.error("Error updating application:", updateError)
        toast({
          title: "Error",
          description: "Failed to update application with red flags",
          variant: "destructive",
        })
        setIsCheckingRedFlags(false)
        return
      }

      // Update local state with properly structured red_flag_reasons
      const updatedApplications = applications.map((app) =>
        app.id === application.id ? { 
          ...app, 
          red_flags: redFlags.length, 
          red_flag_reasons: redFlags  // This is now a proper array
        } : app
      )

      setApplications(updatedApplications)

      // If we're viewing the application details, update the selected application
      if (selectedApplication && selectedApplication.id === application.id) {
        setSelectedApplication({
          ...selectedApplication,
          red_flags: redFlags.length,
          red_flag_reasons: redFlags,  // This is now a proper array
        })
      }

      // Show success message
      toast({
        title: "Red Flags Checked",
        description:
          redFlags.length > 0
            ? `Found ${redFlags.length} red flag${redFlags.length === 1 ? "" : "s"}`
            : "No red flags found for this application",
      })
    } catch (error) {
      console.error("Error checking red flags:", error)
      toast({
        title: "Error",
        description: "An error occurred while checking for red flags",
        variant: "destructive",
      })
    } finally {
      setIsCheckingRedFlags(false)
    }
  }

  // Handle sorting
  const handleSort = (key: keyof Application) => {
    let direction: "asc" | "desc" = "asc"

    if (sortConfig.key === key) {
      direction = sortConfig.direction === "asc" ? "desc" : "asc"
    }

    setSortConfig({ key, direction })
  }

  // Calculate progress percentage for progress bar
  const calculateProgress = (application: Application) => {
    const steps = [
      application.commitment_step,
      application.resume_step,
      application.form_step, 
      application.pass_step,
      application.interview_confirmation,
      application.interview_step
    ];
    
    const completedSteps = steps.filter(Boolean).length;
    return Math.round((completedSteps / steps.length) * 100);
  }

  // Filter and sort applications
  const filteredAndSortedApplications = applications
    .filter((app) => {
      // Apply search filter
      if (searchTerm) {
        return app.name.toLowerCase().includes(searchTerm.toLowerCase()) || app.phone_number.includes(searchTerm)
      }
      return true
    })
    .filter((app) => {
      // Apply current_step filter
      if (stepFilter) {
        return app.current_step === stepFilter
      }
      return true
    })
    .sort((a, b) => {
      // Apply sorting
      const { key, direction } = sortConfig

      if (a[key] < b[key]) {
        return direction === "asc" ? -1 : 1
      }
      if (a[key] > b[key]) {
        return direction === "asc" ? 1 : -1
      }
      return 0
    })

  // Get step badge color and style
  const getStepBadge = (step: string) => {
    switch (step) {
      case "initial_contact":
        return <Badge variant="outline">Initial Contact</Badge>
      case "confirm_intent":
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Confirming Intent</Badge>
      case "commitment_check":
        return <Badge className="bg-blue-200 text-blue-800 border-blue-300">Commitment Check</Badge>
      case "request_resume":
        return <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">Resume Requested</Badge>
      case "request_form":
        return <Badge className="bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-300">Form Requested</Badge>
      case "waiting_review":
        return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Under Review</Badge>
      case "request_interview_details":
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Interview Details</Badge>
      case "waiting_interview_booking":
      case "waiting_calendly_booking":  // Support older naming for compatibility
        return <Badge className="bg-green-100 text-green-700 border-green-200">Booking Interview</Badge>
      case "confirmation":
        return <Badge className="bg-green-500 text-white">Interview Confirmed</Badge>
      case "completed":
        return <Badge className="bg-green-700 text-white">Completed</Badge>
      case "rejected":
        return <Badge className="bg-red-500 text-white">Rejected</Badge>
      default:
        return <Badge variant="outline">{step}</Badge>
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto">
              <Filter className="mr-2 h-4 w-4" />
              {stepFilter ? `Step: ${stepFilter}` : "Filter by Step"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setStepFilter(null)}>All Steps</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStepFilter("initial_contact")}>Initial Contact</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStepFilter("confirm_intent")}>Confirming Intent</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStepFilter("commitment_check")}>Commitment Check</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStepFilter("request_resume")}>Resume Requested</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStepFilter("request_form")}>Form Requested</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStepFilter("waiting_review")}>Under Review</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStepFilter("request_interview_details")}>Interview Details</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStepFilter("waiting_interview_booking")}>Booking Interview</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStepFilter("confirmation")}>Interview Confirmed</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStepFilter("completed")}>Completed</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStepFilter("rejected")}>Rejected</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px] cursor-pointer" onClick={() => handleSort("name")}>
                Name
                {sortConfig.key === "name" &&
                  (sortConfig.direction === "asc" ? (
                    <ChevronUp className="inline ml-1 h-4 w-4" />
                  ) : (
                    <ChevronDown className="inline ml-1 h-4 w-4" />
                  ))}
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("phone_number")}>
                Phone
                {sortConfig.key === "phone_number" &&
                  (sortConfig.direction === "asc" ? (
                    <ChevronUp className="inline ml-1 h-4 w-4" />
                  ) : (
                    <ChevronDown className="inline ml-1 h-4 w-4" />
                  ))}
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("current_step")}>
                Current Step
                {sortConfig.key === "current_step" &&
                  (sortConfig.direction === "asc" ? (
                    <ChevronUp className="inline ml-1 h-4 w-4" />
                  ) : (
                    <ChevronDown className="inline ml-1 h-4 w-4" />
                  ))}
              </TableHead>
              <TableHead className="w-[300px]">Progress</TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("red_flags")}>
                Red Flags
                {sortConfig.key === "red_flags" &&
                  (sortConfig.direction === "asc" ? (
                    <ChevronUp className="inline ml-1 h-4 w-4" />
                  ) : (
                    <ChevronDown className="inline ml-1 h-4 w-4" />
                  ))}
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedApplications.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No applications found
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedApplications.map((application) => (
                <TableRow key={application.id}>
                  <TableCell className="font-medium">{application.name}</TableCell>
                  <TableCell>{application.phone_number}</TableCell>
                  <TableCell>{getStepBadge(application.current_step)}</TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Progress value={calculateProgress(application)} className="h-2" />
                      <div className="flex space-x-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                                application.commitment_step 
                                  ? 'bg-green-100 border-green-400 text-green-600' 
                                  : 'bg-gray-100 border-gray-300 text-gray-400'
                              } border`}>
                                <UserCheck className="h-4 w-4" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Commitment Check</p>
                              <p className="text-xs text-gray-500">
                                {application.commitment_step ? "Completed" : "Pending"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                                application.resume_step 
                                  ? 'bg-green-100 border-green-400 text-green-600' 
                                  : 'bg-gray-100 border-gray-300 text-gray-400'
                              } border`}>
                                <FileText className="h-4 w-4" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Resume Submission</p>
                              <p className="text-xs text-gray-500">
                                {application.resume_step ? "Uploaded" : "Not Submitted"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                                application.form_step 
                                  ? 'bg-green-100 border-green-400 text-green-600' 
                                  : 'bg-gray-100 border-gray-300 text-gray-400'
                              } border`}>
                                <ClipboardCheck className="h-4 w-4" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Form Completion</p>
                              <p className="text-xs text-gray-500">
                                {application.form_step ? "Completed" : "Incomplete"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                                application.pass_step 
                                  ? 'bg-green-100 border-green-400 text-green-600' 
                                  : 'bg-gray-100 border-gray-300 text-gray-400'
                              } border`}>
                                <UserCheck className="h-4 w-4" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Visitor Pass Details</p>
                              <p className="text-xs text-gray-500">
                                {application.pass_step ? "Provided" : "Not Provided"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                                application.interview_confirmation 
                                  ? 'bg-green-100 border-green-400 text-green-600' 
                                  : 'bg-gray-100 border-gray-300 text-gray-400'
                              } border`}>
                                <Calendar className="h-4 w-4" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Interview Scheduled</p>
                              <p className="text-xs text-gray-500">
                                {application.interview_confirmation ? "Booked" : "Not Scheduled"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                                application.interview_step 
                                  ? 'bg-green-100 border-green-400 text-green-600' 
                                  : 'bg-gray-100 border-gray-300 text-gray-400'
                              } border`}>
                                <Check className="h-4 w-4" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Interview Completed</p>
                              <p className="text-xs text-gray-500">
                                {application.interview_step ? "Completed" : "Not Completed"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {application.red_flags > 0 ? (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" className="h-8 p-1 text-red-500 flex items-center gap-1">
                            <AlertTriangle className="h-4 w-4" />
                            <span>{application.red_flags}</span>
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Red Flags</DialogTitle>
                            <DialogDescription>The following issues were detected:</DialogDescription>
                          </DialogHeader>
                          <ul className="list-disc pl-5 mt-2">
                            {ensureArray(application.red_flag_reasons).map((reason, index) => (
                              <li key={index} className="text-red-500">
                                {reason}
                              </li>
                            ))}
                          </ul>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <span className="text-green-600 flex items-center gap-1">
                        <Check className="h-4 w-4" /> None
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedApplication(application)
                            fetchFormData(application.id)
                          }}
                        >
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => checkForRedFlags(application)} disabled={isCheckingRedFlags}>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Check for Red Flags
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => updateApplicationStatus(application.id, "approved")}
                          className="text-green-600"
                          disabled={isProcessingAction}
                        >
                          Accept Application
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => updateApplicationStatus(application.id, "rejected")}
                          className="text-red-600"
                          disabled={isProcessingAction}
                        >
                          Reject Application
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Application Details Dialog */}
      {selectedApplication && (
        <Dialog open={!!selectedApplication} onOpenChange={(open) => !open && setSelectedApplication(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Application Details: {selectedApplication.name}</DialogTitle>
              <DialogDescription>
                Submitted on {new Date(selectedApplication.created_at).toLocaleString()}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <h3 className="text-lg font-medium mb-2">Applicant Information</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium">Name:</span>
                    <span>{selectedApplication.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Phone:</span>
                    <span>{selectedApplication.phone_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Current Step:</span>
                    <span>{getStepBadge(selectedApplication.current_step)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Red Flags:</span>
                    <span>{selectedApplication.red_flags}</span>
                  </div>
                </div>

                {selectedApplication.red_flags > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-1">Red Flag Reasons:</h4>
                    <ul className="list-disc pl-5">
                      {ensureArray(selectedApplication.red_flag_reasons).map((reason, index) => (
                        <li key={index} className="text-red-500">
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-6">
                  <h4 className="font-medium mb-3">Application Progress:</h4>
                  <div className="bg-gray-50 p-4 rounded-md border">
                    <div className="mb-3">
                      <Progress 
                        value={calculateProgress(selectedApplication)} 
                        className="h-2 mb-2"
                      />
                      <div className="text-sm text-center text-gray-500">
                        {calculateProgress(selectedApplication)}% Complete
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          selectedApplication.commitment_step 
                            ? 'bg-green-100 text-green-600' 
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          <UserCheck className="h-3 w-3" />
                        </div>
                        <span className={`text-sm ${selectedApplication.commitment_step ? 'text-green-600' : 'text-gray-600'}`}>
                          Commitment Check
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          selectedApplication.resume_step 
                            ? 'bg-green-100 text-green-600' 
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          <FileText className="h-3 w-3" />
                        </div>
                        <span className={`text-sm ${selectedApplication.resume_step ? 'text-green-600' : 'text-gray-600'}`}>
                          Resume Submitted
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          selectedApplication.form_step 
                            ? 'bg-green-100 text-green-600' 
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          <ClipboardCheck className="h-3 w-3" />
                        </div>
                        <span className={`text-sm ${selectedApplication.form_step ? 'text-green-600' : 'text-gray-600'}`}>
                          Form Completed
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          selectedApplication.pass_step 
                            ? 'bg-green-100 text-green-600' 
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          <UserCheck className="h-3 w-3" />
                        </div>
                        <span className={`text-sm ${selectedApplication.pass_step ? 'text-green-600' : 'text-gray-600'}`}>
                          Pass Details
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          selectedApplication.interview_confirmation 
                            ? 'bg-green-100 text-green-600' 
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          <Calendar className="h-3 w-3" />
                        </div>
                        <span className={`text-sm ${selectedApplication.interview_confirmation ? 'text-green-600' : 'text-gray-600'}`}>
                          Interview Scheduled
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          selectedApplication.interview_step 
                            ? 'bg-green-100 text-green-600' 
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          <Check className="h-3 w-3" />
                        </div>
                        <span className={`text-sm ${selectedApplication.interview_step ? 'text-green-600' : 'text-gray-600'}`}>
                          Interview Completed
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-x-2">
                  <Button
                    onClick={() => checkForRedFlags(selectedApplication)}
                    disabled={isCheckingRedFlags}
                    variant="outline"
                    className="mb-2"
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${isCheckingRedFlags ? "animate-spin" : ""}`} />
                    Check for Red Flags
                  </Button>
                  <Button
                    onClick={() => updateApplicationStatus(selectedApplication.id, "approved")}
                    className="bg-green-600 hover:bg-green-700"
                    disabled={isProcessingAction}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Accept Application
                  </Button>
                  <Button
                    onClick={() => updateApplicationStatus(selectedApplication.id, "rejected")}
                    variant="destructive"
                    disabled={isProcessingAction}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Reject Application
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-2">Form Submission</h3>
                {formData ? (
                  <div className="border rounded-md p-4 max-h-[500px] overflow-y-auto">
                    {Object.entries(formData).map(([key, value]) => (
                      <div key={key} className="mb-3 pb-2 border-b">
                        <div className="font-medium text-sm">{key}</div>
                        <div className="mt-1">{Array.isArray(value) ? value.join(", ") : String(value)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-40 border rounded-md">
                    <p className="text-muted-foreground">Loading form data...</p>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}