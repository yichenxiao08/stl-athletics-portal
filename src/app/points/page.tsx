"use client";
import Navigation from "@/components/navbar";
import { DataTable } from "./data-table";
import { columns, PlayerWithPoints } from "./columns";
import { PreviousWinner } from "./previous-winners/columns";
import { useEffect, useState } from "react";
import {
  isStudentActiveForSchoolYear,
  selectData,
} from "../functions/students";
import {
  selectPreviousWinners,
  saveAwardWinners,
} from "../functions/awards";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSchoolYear } from "@/lib/school-year-context";
export default function Points() {
  const { selectedYear } = useSchoolYear();
  const [data, setData] = useState<PlayerWithPoints[]>();
  const [prevWinners, setPrevWinners] = useState<PreviousWinner[]>();
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => {
    const getPoints = async () => {
      setLoading(true);
      try {
        const [data, prevData] = await Promise.all([
          selectData(),
          selectPreviousWinners(),
        ]);
        setData(
          data
            ?.filter(
              (student) =>
                student.points > 0 &&
                isStudentActiveForSchoolYear(student.grad, selectedYear)
            )
            .map((student) => ({
              student_id: student.id,
              name: student.name,
              points: student.points,
              grade: student.grade,
            }))
        );
        setPrevWinners(
          prevData
            ?.filter((winner) => winner.student_points?.points > 0)
            .map((winner) => ({
              student_id: winner.id,
              name: winner.student_points?.name || "",
              points: winner.student_points?.points || 0,
              year: winner.year,
              award: winner.award,
            }))
        );
      } catch {
        setFetchError("Failed to load points data. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    getPoints();
  }, [selectedYear]);

  const filteredData = data?.filter((student) => {
    // Filter by name - check both "Last, First" and "First Last" formats
    const filterLower = filter.toLowerCase();
    const nameLower = student.name.toLowerCase();

    // Check original format (e.g., "Doe, John")
    const originalMatch = nameLower.includes(filterLower);
    const noComma = nameLower.replace(",", "").includes(filterLower);
    // Check reversed format (e.g., "John Doe" when name is stored as "Doe, John")
    const nameParts = nameLower.split(", ");
    const reversedName =
      nameParts.length === 2 ? `${nameParts[1]} ${nameParts[0]}` : nameLower;
    const reversedMatch = reversedName.includes(filterLower);

    const nameMatch = originalMatch || reversedMatch || noComma;

    // Filter by grade if any grade filters are selected
    return nameMatch;
  });

  const getCurrentAwardEntries = () => {
    const year = Number(selectedYear.slice(0, 4));

    return (data ?? []).flatMap((student) => {
      if (student.points >= 100 && student.grade === 12) {
        return [
          {
            id: student.student_id,
            award: "Outstanding Contribution",
            year,
          },
        ];
      }
      if (student.points >= 90) {
        return [
          {
            id: student.student_id,
            award: "Letter of Distinction",
            year,
          },
        ];
      }
      if (student.points >= 70) {
        return [
          {
            id: student.student_id,
            award: "Letter of Merit",
            year,
          },
        ];
      }
      return [];
    });
  };

  const saveCurrentEntries = async () => {
    setSaveError(null);
    setSaveMessage(null);
    setIsSaving(true);
    try {
      const entries = getCurrentAwardEntries();
      const savedCount = await saveAwardWinners(entries);
      setSaveMessage(`Saved ${savedCount} current award entries.`);

      const prevData = await selectPreviousWinners();
      setPrevWinners(
        prevData
          ?.filter((winner) => winner.student_points?.points > 0)
          .map((winner) => ({
            student_id: winner.id,
            name: winner.student_points?.name || "",
            points: winner.student_points?.points || 0,
            year: winner.year,
            award: winner.award,
          }))
      );
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Failed to save current award entries."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const copyWinners = async () => {
    const outstandingAchievement = (data ?? [])
      .filter((entry) => entry.points >= 100)
      .map((entry) => `${entry.name}`)
      .join("\n");

    const letterDistinction = (data ?? [])
      .filter((entry) => entry.points < 100 && entry.points>=90)
      .map((entry) => `${entry.name}`)
      .join("\n");

    const letterMerit = (data ?? [])
      .filter((entry) => entry.points > 90 && entry.points >=70)
      .map((entry) => `${entry.name}`)
      .join("\n");

    const formatted = [
      "Outstanding Achievement",
      outstandingAchievement,
      "",
      "Letter of Distinction",
      letterDistinction,
      "",
      "Letter of Merit",
      letterMerit,
    ].join("\n");
    await navigator.clipboard.writeText(formatted);
  };

  return (
    <>
      <Navigation />
      <div className="px-16 py-8">
        <div className="justify-self-center w-full">
          <div className="mb-2 justify-between">
            <div className="flex flex-row gap-4 items-center mb-2">
              <div className="font-bold text-4xl">
                This year&apos;s recipients
              </div>
              <Button variant="outline" size="sm" onClick={() => void copyWinners()}>
                Copy Winners
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void saveCurrentEntries()}
                disabled={isSaving || loading || !data?.length}
                className="hidden"
              >
                {isSaving ? "Saving..." : "Save Award Entries"}
              </Button>
            </div>
            {fetchError && (
              <p className="text-sm text-destructive">{fetchError}</p>
            )}
            {saveError && (
              <p className="text-sm text-destructive">{saveError}</p>
            )}
            {saveMessage && (
              <p className="text-sm text-green-600">{saveMessage}</p>
            )}
                  <div>
                    <div className="font-semibold text-2xl mb-1 mt-3">
                      Outstanding Contribution
                    </div>
                    <div className="text-lg">Gr. 12 & 100+ points</div>
                  </div>
                  {(() => {
                    const filtered = data?.filter((student) => {
                      const hasWonBefore = prevWinners?.some((winner) => {
                        const match =
                          winner.student_id === student.student_id &&
                          winner.award === "Outstanding Contribution";
                        return match;
                      });
                      return (
                        student.points >= 100 &&
                        student.grade === 12 &&
                        !hasWonBefore
                      );
                    });

                    return filtered && filtered.length > 0 ? (
                      filtered.map((student) => (
                        <div
                          key={student.student_id}
                          className="text-sm text-gray-500"
                        >
                          {student.name}: {student.points} points
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-gray-500">
                        There are no Outstanding Contributions at this time.
                      </div>
                    );
                  })()}
                  <div>
                    <div className="font-semibold text-2xl mb-1 mt-4">
                      Letter of Distinction
                    </div>
                    <div className="text-lg">90 points</div>
                  </div>
                  {(() => {
                    const filtered = data?.filter((student) => {
                      const hasWonBefore = prevWinners?.some((winner) => {
                        const match =
                          winner.student_id === student.student_id &&
                          winner.award === "Letter of Distinction";
                        return match;
                      });
                      return (
                        student.points >= 90 &&
                        (student.points < 100 || student.grade !== 12) &&
                        !hasWonBefore
                      );
                    });

                    return filtered && filtered.length > 0 ? (
                      filtered.map((student) => (
                        <div
                          key={student.student_id}
                          className="text-sm text-gray-500"
                        >
                          {student.name}: {student.points} points
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-gray-500">
                        There are no Letter of Distinctions at this time.
                      </div>
                    );
                  })()}
                  <div>
                    <div className="font-semibold text-2xl mb-1 mt-4">
                      Letter of Merit
                    </div>
                    <div className="text-lg">70 points</div>
                  </div>
                  {(() => {
                    const filtered = data?.filter((student) => {
                      const hasWonBefore = prevWinners?.some((winner) => {
                        const match =
                          winner.student_id === student.student_id &&
                          winner.award === "Letter of Merit";
                        return match;
                      });
                      return (
                        student.points >= 70 &&
                        student.points < 90 &&
                        !hasWonBefore
                      );
                    });

                    return filtered && filtered.length > 0 ? (
                      filtered.map((student) => (
                        <div
                          key={student.student_id}
                          className="text-sm text-gray-500"
                        >
                          {student.name}: {student.points} points
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-gray-500">
                        There are no Letter of Merits at this time.
                      </div>
                    );
                  })()}
          </div>
          <div className="font-bold text-3xl mb-3 mt-4">Points</div>
          <div className="flex items-center gap-4 mb-2">
            <Input
              placeholder="Filter by name"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>
        <DataTable columns={columns} data={filteredData ?? []} isLoading={loading} />
      </div>
    </>
  );
}
