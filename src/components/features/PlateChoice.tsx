import type { PlateCandidate } from "@/lib/utils/plateUtils";

/** Auswahl bei mehrdeutiger Eingabe (K-AB / KA-B): ein Tipp übernimmt die Schreibweise. */
export default function PlateChoice({
  candidates,
  onPick,
}: {
  candidates: PlateCandidate[];
  onPick: (plate: string) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2 px-1">
      {candidates.map((candidate) => (
        <button
          key={candidate.plate}
          type="button"
          onClick={() => onPick(candidate.plate)}
          className="btn btn-sm btn-secondary"
        >
          {candidate.plate} · {candidate.district}
        </button>
      ))}
    </div>
  );
}
