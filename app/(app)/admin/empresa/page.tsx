import { redirect } from "next/navigation";

// La configuración de la empresa ahora vive en el panel de Administración.
export default function AdminCompanyRedirect() {
  redirect("/admin");
}
