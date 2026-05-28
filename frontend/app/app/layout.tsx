import { UserNav } from "@/components/app/user-nav";
import { UserTopbar } from "@/components/app/user-topbar";

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-secondary/30">
      <div className="hidden md:block">
        <UserNav />
      </div>
      <div className="flex flex-1 flex-col">
        <UserTopbar />
        <main className="flex-1 overflow-x-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
