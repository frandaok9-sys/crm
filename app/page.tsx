import { redirect } from "next/navigation";

// Entry point: send everyone to the dashboard, which enforces auth and status.
export default function Home() {
  redirect("/dashboard");
}
