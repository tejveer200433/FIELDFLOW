import TeamActivityLoadingState from "@/components/activity/TeamActivityLoadingState";

export default function AdminActivityLoadingState({ label = "Loading administrative activity data…" }) {
  return <TeamActivityLoadingState label={label} />;
}
