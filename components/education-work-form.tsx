"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function EducationWorkForm({ formData, updateFormData }) {
  const handleChange = (e) => {
    const { name, value } = e.target
    updateFormData({ [name]: value })
  }

  const handleSelectChange = (name, value) => {
    updateFormData({ [name]: value })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>
          Working or studying currently? <span className="text-red-500">*</span>
        </Label>
        <RadioGroup
          value={formData.workingOrStudying}
          onValueChange={(value) => handleSelectChange("workingOrStudying", value)}
          className="flex space-x-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="working" id="working" />
            <Label htmlFor="working">Working</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="studying" id="studying" />
            <Label htmlFor="studying">Studying</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="both" id="both" />
            <Label htmlFor="both">Both</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="neither" id="neither" />
            <Label htmlFor="neither">Neither</Label>
          </div>
        </RadioGroup>
      </div>

      {(formData.workingOrStudying === "studying" || formData.workingOrStudying === "both") && (
        <>
          <div className="space-y-2">
            <Label htmlFor="currentStudy">
              What are you currently studying? <span className="text-red-500">*</span>
            </Label>
            <Input
              id="currentStudy"
              name="currentStudy"
              value={formData.currentStudy}
              onChange={handleChange}
              placeholder="Enter your current course/program"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="currentGrade">
              What is your current grade? <span className="text-red-500">*</span>
            </Label>
            <Input
              id="currentGrade"
              name="currentGrade"
              value={formData.currentGrade}
              onChange={handleChange}
              placeholder="Enter your current grade/GPA"
            />
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="highestQualification">
          What is your highest qualification? <span className="text-red-500">*</span>
        </Label>
        <Select
          value={formData.highestQualification}
          onValueChange={(value) => handleSelectChange("highestQualification", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select your highest qualification" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="primary">Primary School</SelectItem>
            <SelectItem value="secondary">Secondary School</SelectItem>
            <SelectItem value="ite">ITE</SelectItem>
            <SelectItem value="diploma">Diploma</SelectItem>
            <SelectItem value="bachelor">Bachelor's Degree</SelectItem>
            <SelectItem value="master">Master's Degree</SelectItem>
            <SelectItem value="phd">PhD</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="lastSchoolAttended">
          Last school attended <span className="text-red-500">*</span>
        </Label>
        <Input
          id="lastSchoolAttended"
          name="lastSchoolAttended"
          value={formData.lastSchoolAttended}
          onChange={handleChange}
          placeholder="Enter the name of your last school"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="qualificationGradePoints">
          Grade and points of highest qualification <span className="text-red-500">*</span>
        </Label>
        <Input
          id="qualificationGradePoints"
          name="qualificationGradePoints"
          value={formData.qualificationGradePoints}
          onChange={handleChange}
          placeholder="E.g., GPA 3.5, A-levels BBB, etc."
        />
      </div>
    </div>
  )
}
