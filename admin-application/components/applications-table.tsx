// admin-application/components/applications-table.tsx
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
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { createClient } from "@/utils/supabase/client"
import { useToast } from "@/hooks/use-toast"

type Application = {
  id: string
  name: string
  phone_number: string
  resume_step: boolean
  commitment_step: boolean
  form_step: boolean
  red_flags: number
  red_flag_reasons: string[]
  calendar_step: boolean
  pass_step: boolean
  interview_step: boolean
  status: string
  created_at: string
}

type SortConfig = {
  key: keyof Application
  direction: "asc" | "desc"
}

export function ApplicationsTable({ applications: initialApplications }: { applications: Application[] }) {
  const [applications, setApplications] = useState<Application[]>(initialApplications)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "created_at", direction: "desc" })
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
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
      // Map decision to appropriate status for database
      const newStatus = decision === "approved" ? "interview_pending" : "rejected"
      
      // Update status in Supabase
      const { error } = await supabase.from("applications").update({ status: newStatus }).eq("id", id)

      if (error) {
        console.error("Error updating application status:", error)
        toast({
          title: "Error",
          description: `Failed to update application status: ${error.message}`,
          variant: "destructive",
        })
        return
      }

      // Update local state
      setApplications(applications.map((app) => (app.id === id ? { ...app, status: newStatus } : app)))
      
      if (selectedApplication && selectedApplication.id === id) {
        setSelectedApplication({...selectedApplication, status: newStatus})
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
          description: "Application status updated but failed to notify messaging system.",
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

      // Update local state
      const updatedApplications = applications.map((app) =>
        app.id === application.id ? { ...app, red_flags: redFlags.length, red_flag_reasons: redFlags } : app,
      )

      setApplications(updatedApplications)

      // If we're viewing the application details, update the selected application
      if (selectedApplication && selectedApplication.id === application.id) {
        setSelectedApplication({
          ...selectedApplication,
          red_flags: redFlags.length,
          red_flag_reasons: redFlags,
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
      // Apply status filter
      if (statusFilter) {
        return app.status === statusFilter
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

  // Get status badge color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline">Pending</Badge>
      case "form_submitted":
        return <Badge className="bg-blue-500 text-white">Form Submitted</Badge>
      case "accepted":
        return <Badge className="bg-green-500 text-white">Accepted</Badge>
      case "interview_pending":
        return <Badge className="bg-yellow-500 text-white">Interview Pending</Badge>
      case "rejected":
        return <Badge className="bg-red-500 text-white">Rejected</Badge>
      case "interview_scheduled":
        return <Badge className="bg-purple-500 text-white">Interview Scheduled</Badge>
      case "interview_completed":
        return <Badge className="bg-indigo-500 text-white">Interview Completed</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
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
              {statusFilter ? `Status: ${statusFilter}` : "Filter by Status"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setStatusFilter(null)}>All Statuses</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter("pending")}>Pending</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter("form_submitted")}>Form Submitted</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter("interview_pending")}>Interview Pending</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter("rejected")}>Rejected</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter("interview_scheduled")}>
              Interview Scheduled
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter("interview_completed")}>
              Interview Completed
            </DropdownMenuItem>
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
              <TableHead className="cursor-pointer" onClick={() => handleSort("status")}>
                Status
                {sortConfig.key === "status" &&
                  (sortConfig.direction === "asc" ? (
                    <ChevronUp className="inline ml-1 h-4 w-4" />
                  ) : (
                    <ChevronDown className="inline ml-1 h-4 w-4" />
                  ))}
              </TableHead>
              <TableHead>Progress</TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("red_flags")}>
                Red Flags
                {sortConfig.key === "red_flags" &&
                  (sortConfig.direction === "asc" ? (
                    <ChevronUp className="inline ml-1 h-4 w-4" />
                  ) : (
                    <ChevronDown className="inline ml-1 h-4 w-4" />
                  ))}
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("created_at")}>
                Date
                {sortConfig.key === "created_at" &&
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
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No applications found
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedApplications.map((application) => (
                <TableRow key={application.id}>
                  <TableCell className="font-medium">{application.name}</TableCell>
                  <TableCell>{application.phone_number}</TableCell>
                  <TableCell>{getStatusBadge(application.status)}</TableCell>
                  <TableCell>
                    <div className="flex space-x-1">
                      <Badge
                        variant={application.resume_step ? "default" : "outline"}
                        className="h-6 w-6 p-0 flex items-center justify-center"
                      >
                        <FileText className="h-3 w-3" />
                      </Badge>
                      <Badge
                        variant={application.form_step ? "default" : "outline"}
                        className="h-6 w-6 p-0 flex items-center justify-center"
                      >
                        <Check className="h-3 w-3" />
                      </Badge>
                      <Badge
                        variant={application.calendar_step ? "default" : "outline"}
                        className="h-6 w-6 p-0 flex items-center justify-center"
                      >
                        <Calendar className="h-3 w-3" />
                      </Badge>
                      <Badge
                        variant={application.interview_step ? "default" : "outline"}
                        className="h-6 w-6 p-0 flex items-center justify-center"
                      >
                        <Check className="h-3 w-3" />
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    {application.red_flags > 0 ? (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 text-red-500">
                            <AlertTriangle className="h-4 w-4" />
                            <span className="ml-1">{application.red_flags}</span>
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Red Flags</DialogTitle>
                            <DialogDescription>The following issues were detected:</DialogDescription>
                          </DialogHeader>
                          <ul className="list-disc pl-5 mt-2">
                            {application.red_flag_reasons.map((reason, index) => (
                              <li key={index} className="text-red-500">
                                {reason}
                              </li>
                            ))}
                          </ul>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <span>None</span>
                    )}
                  </TableCell>
                  <TableCell>{new Date(application.created_at).toLocaleDateString()}</TableCell>
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
                    <span className="font-medium">Status:</span>
                    <span>{getStatusBadge(selectedApplication.status)}</span>
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
                      {selectedApplication.red_flag_reasons.map((reason, index) => (
                        <li key={index} className="text-red-500">
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4">
                  <h4 className="font-medium mb-1">Application Progress:</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Resume Submitted:</span>
                      <span>{selectedApplication.resume_step ? "Yes" : "No"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Commitment Confirmed:</span>
                      <span>{selectedApplication.commitment_step ? "Yes" : "No"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Form Completed:</span>
                      <span>{selectedApplication.form_step ? "Yes" : "No"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Calendar Scheduled:</span>
                      <span>{selectedApplication.calendar_step ? "Yes" : "No"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pass Created:</span>
                      <span>{selectedApplication.pass_step ? "Yes" : "No"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Interview Completed:</span>
                      <span>{selectedApplication.interview_step ? "Yes" : "No"}</span>
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