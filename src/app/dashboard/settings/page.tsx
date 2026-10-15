import DisplayNameForm from "@/components/features/DisplayNameForm";
import NotificationSettingsForm from "@/components/features/NotificationSettingsForm";
import ThemeSetting from "@/components/features/ThemeSetting";
import { requireUser } from "@/lib/auth/session";
import { getNotificationSettings } from "@/lib/db/queries";
import SettingsForms from "./SettingsForms";

/**
 * Server Component: lädt die gespeicherten Benachrichtigungs-Einstellungen; die
 * Formulare darunter sind Client Components.
 */
export default async function SettingsPage() {
  const user = await requireUser();
  const notifications = await getNotificationSettings(user.id);

  return (
    <div className="mx-auto max-w-xl space-y-9 px-4 pt-6 pb-8">
      <h1 className="large-title">Einstellungen</h1>
      <NotificationSettingsForm initial={notifications} />
      <ThemeSetting />
      <DisplayNameForm current={user.name} />
      <SettingsForms />
    </div>
  );
}
