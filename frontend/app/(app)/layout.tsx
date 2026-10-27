import { AuthProvider } from "@/components/auth-provider";
import { Sidebar } from "@/components/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 overflow-x-hidden p-6">{children}</main>
      </div>
    </AuthProvider>
  );
}
