import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { claimPlate } from "./actions";
import { Inbox, AlertCircle } from "lucide-react";
import ClaimPlateForm from "@/components/features/ClaimPlateForm";

export default async function DashboardPage() {
  // Get authenticated user
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  // Fetch verified plates for this user
  const { data: verifiedPlatesData, error: platesError } = await supabase
    .from("verified_plates")
    .select("plate_number, is_verified, created_at")
    .eq("user_id", userData.user.id)
    .eq("is_verified", true);

  if (platesError) {
    console.error("Error fetching verified plates:", platesError);
  }

  const verifiedPlates = verifiedPlatesData || [];
  const plateNumbers = verifiedPlates.map((p) => p.plate_number);

  // Fetch messages for all verified plates
  let messages: Array<{
    id: string;
    plate_number: string;
    message_text: string;
    created_at: string;
  }> = [];

  if (plateNumbers.length > 0) {
    const { data: messagesData, error: messagesError } = await supabase
      .from("messages")
      .select("id, plate_number, message_text, created_at")
      .in("plate_number", plateNumbers)
      .order("created_at", { ascending: false });

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
    } else {
      messages = messagesData || [];
    }
  }

  // Group messages by plate
  const messagesByPlate: Record<string, typeof messages> = {};
  messages.forEach((msg) => {
    if (!messagesByPlate[msg.plate_number]) {
      messagesByPlate[msg.plate_number] = [];
    }
    messagesByPlate[msg.plate_number].push(msg);
  });

  const hasNoContent = verifiedPlates.length === 0 && messages.length === 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Section A: Claim Plate */}
      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">
          Kennzeichen registrieren
        </h2>
        <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
          Registrieren Sie ein deutsches Kennzeichen, um Nachrichten dafür zu
          lesen.
        </p>
        <ClaimPlateForm action={claimPlate} />
      </section>

      {/* Section B: Messages Inbox */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-2">
          <Inbox className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Nachrichten ({messages.length})
          </h2>
        </div>

        {hasNoContent ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-slate-50 py-12 dark:bg-slate-700">
            <AlertCircle className="h-8 w-8 text-slate-400 dark:text-slate-500" />
            <p className="text-center text-sm text-slate-600 dark:text-slate-400">
              Keine Kennzeichen registriert.
              <br />
              Registrieren Sie ein Kennzeichen oben, um Nachrichten zu sehen.
            </p>
          </div>
        ) : plateNumbers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-slate-50 py-12 dark:bg-slate-700">
            <AlertCircle className="h-8 w-8 text-slate-400 dark:text-slate-500" />
            <p className="text-center text-sm text-slate-600 dark:text-slate-400">
              Keine bestätigten Kennzeichen.
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-slate-50 py-12 dark:bg-slate-700">
            <Inbox className="h-8 w-8 text-slate-400 dark:text-slate-500" />
            <p className="text-center text-sm text-slate-600 dark:text-slate-400">
              Noch keine Nachrichten für Ihre Kennzeichen.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {verifiedPlates.map((plate) => {
              const plateMessages = messagesByPlate[plate.plate_number] || [];

              return (
                <div
                  key={plate.plate_number}
                  className="border-t border-slate-200 pt-6 first:border-t-0 first:pt-0 dark:border-slate-700"
                >
                  {/* Plate Header */}
                  <div className="mb-4 inline-block rounded-lg border-2 border-slate-900 bg-yellow-300 px-3 py-2 font-mono font-bold text-slate-900 dark:border-white dark:bg-yellow-200">
                    {plate.plate_number}
                  </div>

                  {plateMessages.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Keine Nachrichten für dieses Kennzeichen.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {plateMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-700"
                        >
                          <p className="text-sm text-slate-900 dark:text-white">
                            {msg.message_text}
                          </p>
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {new Date(msg.created_at).toLocaleDateString(
                              "de-DE",
                              {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
