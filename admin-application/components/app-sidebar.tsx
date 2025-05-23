"use client"

import type * as React from "react"
import { LayoutDashboard, Briefcase, ShieldAlert } from "lucide-react"
import { NavProjects } from "@/components/sidebar-nav"
import { NavUser } from "@/components/nav-user"
import { ModeToggle } from "@/components/mode-toggler"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar"
export function AppSidebar({
  user,
  ...props
}: { user: { name: string; email: string; avatar: string } } & React.ComponentProps<typeof Sidebar>) {
  const { state, isMobile } = useSidebar()
  const isExpanded = state === "expanded"

  const navItems = [
    { name: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { name: "Applications", url: "/applications", icon: Briefcase },
    { name: "Requirements", url: "/requirements", icon: ShieldAlert },
  ]

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#" className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex aspect-square size-8 items-center justify-center text-sidebar-primary-foreground">
                    <img src="/logo.png" alt="Logo" className="size-7 " />
                  </div>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="font-semibold">DND</span>
                    <span className="">DND</span>
                  </div>
                </div>
                {(isExpanded || isMobile) && <ModeToggle />}
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavProjects navItems={navItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
