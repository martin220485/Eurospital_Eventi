import { Sidebar } from "@/components/admin/sidebar";
import { Topbar } from "@/components/admin/topbar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-secondary/50">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-x-auto p-6">{children}</main>
      </div>
    </div>
  );
}
