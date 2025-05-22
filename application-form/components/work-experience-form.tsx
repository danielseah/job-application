"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function WorkExperienceForm({ formData, updateFormData }) {
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
        <Label htmlFor="commitment">
          Commitment (how long you can work) <span className="text-red-500">*</span>
        </Label>
        <Select value={formData.commitment} onValueChange={(value) => handleSelectChange("commitment", value)}>
          <SelectTrigger>
            <SelectValue placeholder="Select your commitment period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1-3months">1-3 months</SelectItem>
            <SelectItem value="3-6months">3-6 months</SelectItem>
            <SelectItem value="6-12months">6-12 months</SelectItem>
            <SelectItem value="1year+">More than 1 year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>
          Will you be taking any holidays during this commitment? <span className="text-red-500">*</span>
        </Label>
        <RadioGroup
          value={formData.holidaysDuringCommitment}
          onValueChange={(value) => handleSelectChange("holidaysDuringCommitment", value)}
          className="flex space-x-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="yes" id="holidays-yes" />
            <Label htmlFor="holidays-yes">Yes</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="no" id="holidays-no" />
            <Label htmlFor="holidays-no">No</Label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reasonForJob">
          Why are you looking for this part-time job? <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="reasonForJob"
          name="reasonForJob"
          value={formData.reasonForJob}
          onChange={handleChange}
          placeholder="Please explain your reasons"
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>
          Do you have any work experience? <span className="text-red-500">*</span>
        </Label>
        <RadioGroup
          value={formData.hasExperience}
          onValueChange={(value) => handleSelectChange("hasExperience", value)}
          className="flex space-x-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="yes" id="experience-yes" />
            <Label htmlFor="experience-yes">Yes</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="no" id="experience-no" />
            <Label htmlFor="experience-no">No</Label>
          </div>
        </RadioGroup>
      </div>

      {formData.hasExperience === "yes" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="mostRecentJob">
              What's your most recent job? <span className="text-red-500">*</span>
            </Label>
            <Input
              id="mostRecentJob"
              name="mostRecentJob"
              value={formData.mostRecentJob}
              onChange={handleChange}
              placeholder="Enter your most recent job title and company"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="durationOfRecentJob">
              How long did you work at your most recent job? <span className="text-red-500">*</span>
            </Label>
            <Input
              id="durationOfRecentJob"
              name="durationOfRecentJob"
              value={formData.durationOfRecentJob}
              onChange={handleChange}
              placeholder="E.g., 6 months, 2 years, etc."
            />
          </div>
        </>
      )}
    </div>
  )
}
