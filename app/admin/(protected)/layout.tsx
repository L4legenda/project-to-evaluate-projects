import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/app/lib/auth";

/**
 * Все страницы /admin/* требуют входа. Страница входа лежит отдельно —
 * app/admin/login, поэтому под этот guard не попадает.
 */
export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  return children;
}
