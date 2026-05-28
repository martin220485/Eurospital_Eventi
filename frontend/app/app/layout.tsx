import { UserNav } from "@/components/app/user-nav";
import { UserTopbar } from "@/components/app/user-topbar";

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <UserNav />
      <div className="flex flex-1 flex-col">
        <UserTopbar />
        <main className="flex-1 bg-gray-50 p-6">{children}</main>
      </div>
    </div>
  );
}
