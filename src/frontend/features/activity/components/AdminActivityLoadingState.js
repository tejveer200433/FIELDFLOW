import TeamActivityLoadingState from "@/frontend/features/activity/components/TeamActivityLoadingState";

export default function AdminActivityLoadingState({ label = "Loading administrative activity data…" }) {
  return <TeamActivityLoadingState label={label} />;
}
