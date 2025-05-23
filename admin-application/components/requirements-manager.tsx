"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Plus, Trash, Edit } from "lucide-react"
import { createClient } from "@/utils/supabase/client"

type Requirement = {
  id: string
  field_name: string
  condition: string
  value: string
  red_flag_reason: string
}

type RequirementsManagerProps = {
  requirements: Requirement[]
  availableFields: string[]
}

export function RequirementsManager({ requirements: initialRequirements, availableFields }: RequirementsManagerProps) {
  const [requirements, setRequirements] = useState<Requirement[]>(initialRequirements)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [currentRequirement, setCurrentRequirement] = useState<Requirement | null>(null)

  // Form fields for adding/editing a requirement
  const [fieldName, setFieldName] = useState("")
  const [condition, setCondition] = useState("equals")
  const [value, setValue] = useState("")
  const [redFlagReason, setRedFlagReason] = useState("")

  const supabase = createClient()

  const conditions = [
    { value: "equals", label: "Equals" },
    { value: "not_equals", label: "Does Not Equal" },
    { value: "contains", label: "Contains" },
    { value: "not_contains", label: "Does Not Contain" },
    { value: "is_empty", label: "Is Empty" },
    { value: "is_not_empty", label: "Is Not Empty" },
  ]

  const resetForm = () => {
    setFieldName("")
    setCondition("equals")
    setValue("")
    setRedFlagReason("")
    setCurrentRequirement(null)
  }

  const handleOpenAddDialog = () => {
    resetForm()
    setIsAddDialogOpen(true)
  }

  const handleOpenEditDialog = (requirement: Requirement) => {
    setCurrentRequirement(requirement)
    setFieldName(requirement.field_name)
    setCondition(requirement.condition)
    setValue(requirement.value)
    setRedFlagReason(requirement.red_flag_reason)
    setIsEditDialogOpen(true)
  }

  const handleAddRequirement = async () => {
    try {
      // Validate inputs
      if (
        !fieldName ||
        !condition ||
        (condition !== "is_empty" && condition !== "is_not_empty" && !value) ||
        !redFlagReason
      ) {
        alert("Please fill all required fields")
        return
      }

      const { data, error } = await supabase
        .from("requirements")
        .insert({
          field_name: fieldName,
          condition,
          value: value,
          red_flag_reason: redFlagReason,
        })
        .select()
        .single()

      if (error) {
        console.error("Error adding requirement:", error)
        alert("Failed to add requirement")
        return
      }

      setRequirements([data, ...requirements])
      setIsAddDialogOpen(false)
      resetForm()
    } catch (error) {
      console.error("Error adding requirement:", error)
      alert("An error occurred while adding the requirement")
    }
  }

  const handleUpdateRequirement = async () => {
    if (!currentRequirement) return

    try {
      // Validate inputs
      if (
        !fieldName ||
        !condition ||
        (condition !== "is_empty" && condition !== "is_not_empty" && !value) ||
        !redFlagReason
      ) {
        alert("Please fill all required fields")
        return
      }

      const { error } = await supabase
        .from("requirements")
        .update({
          field_name: fieldName,
          condition,
          value: value,
          red_flag_reason: redFlagReason,
        })
        .eq("id", currentRequirement.id)

      if (error) {
        console.error("Error updating requirement:", error)
        alert("Failed to update requirement")
        return
      }

      setRequirements(
        requirements.map((req) =>
          req.id === currentRequirement.id
            ? {
                ...req,
                field_name: fieldName,
                condition,
                value: value,
                red_flag_reason: redFlagReason,
              }
            : req,
        ),
      )

      setIsEditDialogOpen(false)
      resetForm()
    } catch (error) {
      console.error("Error updating requirement:", error)
      alert("An error occurred while updating the requirement")
    }
  }

  const handleDeleteRequirement = async (id: string) => {
    if (!confirm("Are you sure you want to delete this requirement?")) return

    try {
      const { error } = await supabase.from("requirements").delete().eq("id", id)

      if (error) {
        console.error("Error deleting requirement:", error)
        alert("Failed to delete requirement")
        return
      }

      setRequirements(requirements.filter((req) => req.id !== id))
    } catch (error) {
      console.error("Error deleting requirement:", error)
      alert("An error occurred while deleting the requirement")
    }
  }

  // Function to get condition display text
  const getConditionText = (conditionValue: string) => {
    const condition = conditions.find((c) => c.value === conditionValue)
    return condition ? condition.label : conditionValue
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={handleOpenAddDialog}>
          <Plus className="mr-2 h-4 w-4" /> Add Requirement
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Form Field</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Red Flag Reason</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requirements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No requirements defined yet. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              requirements.map((requirement) => (
                <TableRow key={requirement.id}>
                  <TableCell className="font-medium">{requirement.field_name}</TableCell>
                  <TableCell>{getConditionText(requirement.condition)}</TableCell>
                  <TableCell>
                    {requirement.condition === "is_empty" || requirement.condition === "is_not_empty" ? (
                      <span className="text-muted-foreground italic">Not applicable</span>
                    ) : (
                      requirement.value
                    )}
                  </TableCell>
                  <TableCell>{requirement.red_flag_reason}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(requirement)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleDeleteRequirement(requirement.id)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Requirement Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Requirement</DialogTitle>
            <DialogDescription>Define a new condition that will flag applications for review.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="field-name" className="text-right">
                Form Field
              </label>
              {availableFields.length > 0 ? (
                <Select value={fieldName} onValueChange={setFieldName}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select a form field" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFields.map((field) => (
                      <SelectItem key={field} value={field}>
                        {field}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="field-name"
                  className="col-span-3"
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  placeholder="Enter form field name"
                />
              )}
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="condition" className="text-right">
                Condition
              </label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  {conditions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {condition !== "is_empty" && condition !== "is_not_empty" && (
              <div className="grid grid-cols-4 items-center gap-4">
                <label htmlFor="value" className="text-right">
                  Value
                </label>
                <Input
                  id="value"
                  className="col-span-3"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Value to compare against"
                />
              </div>
            )}

            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="red-flag-reason" className="text-right">
                Red Flag Reason
              </label>
              <Input
                id="red-flag-reason"
                className="col-span-3"
                value={redFlagReason}
                onChange={(e) => setRedFlagReason(e.target.value)}
                placeholder="Reason for flagging this application"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddRequirement}>Add Requirement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Requirement Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Requirement</DialogTitle>
            <DialogDescription>Update this requirement's conditions and details.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="field-name-edit" className="text-right">
                Form Field
              </label>
              {availableFields.length > 0 ? (
                <Select value={fieldName} onValueChange={setFieldName}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select a form field" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFields.map((field) => (
                      <SelectItem key={field} value={field}>
                        {field}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="field-name-edit"
                  className="col-span-3"
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  placeholder="Enter form field name"
                />
              )}
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="condition-edit" className="text-right">
                Condition
              </label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  {conditions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {condition !== "is_empty" && condition !== "is_not_empty" && (
              <div className="grid grid-cols-4 items-center gap-4">
                <label htmlFor="value-edit" className="text-right">
                  Value
                </label>
                <Input
                  id="value-edit"
                  className="col-span-3"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Value to compare against"
                />
              </div>
            )}

            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="red-flag-reason-edit" className="text-right">
                Red Flag Reason
              </label>
              <Input
                id="red-flag-reason-edit"
                className="col-span-3"
                value={redFlagReason}
                onChange={(e) => setRedFlagReason(e.target.value)}
                placeholder="Reason for flagging this application"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateRequirement}>Update Requirement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
