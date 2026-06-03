import { Sidebar } from '@/components/sidebar';
import { Copilot } from '@/components/ai/copilot';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-black">
        {children}
      </main>
      <Copilot />
    </div>
  );
}
