import "./globals.css";
import "leaflet/dist/leaflet.css";

export const metadata = {
  title: "FieldFlow | Field workforce management",
  description: "Manage employees, tasks, attendance, expenses, reports and locations."
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
