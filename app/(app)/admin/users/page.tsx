import { redirect } from "next/navigation";

// La gestión de usuarios ahora vive en el panel de Administración.
export default function AdminUsersRedirect() {
  redirect("/admin");
}
