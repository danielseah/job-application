import { signInAction } from "@/app/actions"
import { FormMessage, type Message } from "@/components/form-message"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { AtSign, Lock, ArrowRight } from "lucide-react"

export default async function Login(props: { searchParams: Promise<Message> }) {
  const searchParams = await props.searchParams
  return (
    <div className="flex justify-center items-center w-full py-12 px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Welcome back</CardTitle>
          <CardDescription className="text-center">Sign in to your account to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email
                </Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground">
                    <AtSign size={18} />
                  </div>
                  <Input name="email" id="email" placeholder="you@example.com" required className="pl-10" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password" className="text-sm font-medium">
                    Password
                  </Label>

                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground">
                    <Lock size={18} />
                  </div>
                  <Input
                    type="password"
                    name="password"
                    id="password"
                    placeholder="Your password"
                    required
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            <SubmitButton
              pendingText="Signing In..."
              formAction={signInAction}
              className="w-full py-2.5 font-medium flex items-center justify-center gap-2"
            >
              Sign in <ArrowRight size={16} />
            </SubmitButton>

            <FormMessage message={searchParams} />

            
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
