"use client";
import Navigation from "@/components/navbar";
import AddTeamForm from "@/components/add-team-form";
import { Team, columns } from "./columns";
import { DataTable } from "./data-table";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { copyTeamsFromPreviousYear, selectData } from "../functions/teams";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useSchoolYear } from "@/lib/school-year-context";
import { SCHOOL_YEARS } from "@/lib/constants";
export default function TeamList() {
  const { selectedYear } = useSchoolYear();
  const [data, setData] = useState<Team[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const filteredData = data.filter((team) => team.year === selectedYear);
  const previousYear =
    SCHOOL_YEARS[SCHOOL_YEARS.indexOf(selectedYear) + 1];
  const previousYearTeams = previousYear
    ? data.filter((team) => team.year === previousYear)
    : [];
  const canCopyPreviousYear =
    !loading && filteredData.length === 0 && previousYearTeams.length > 0;

  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await selectData();
        if (result) {
          setData(result);
        }
      } catch {
        setError("Failed to load teams. Please refresh and try again.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleCopyPreviousYear = async () => {
    if (!previousYear) return;

    setCopyError(null);
    setIsCopying(true);
    try {
      await copyTeamsFromPreviousYear({
        sourceYear: previousYear,
        targetYear: selectedYear,
      });

      const result = await selectData();
      if (result) {
        setData(result);
      }
    } catch (copyException) {
      setCopyError(
        copyException instanceof Error
          ? copyException.message
          : "Failed to copy teams from the previous year."
      );
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <>
      <Navigation />
      <div className="px-16 py-8">
        <div className="flex justify-between items-center mb-8">
          <div className="text-3xl font-bold">Team List</div>
          <div className="flex items-center gap-2">
            {canCopyPreviousYear && previousYear && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={isCopying}>
                    Copy {previousYear} teams
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Copy previous year&apos;s teams?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will create the {previousYearTeams.length} teams from {previousYear} for {selectedYear},
                      including their sport, gender, grade, points, season, and coaches. Players, managers, highlights,
                      and yearbook messages will be left blank.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCopyPreviousYear} disabled={isCopying}>
                      {isCopying ? "Copying..." : "Copy teams"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button onClick={() => setAddFormOpen(true)}>Add Team</Button>
          </div>
        </div>
        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
        {copyError && <p className="mb-4 text-sm text-destructive">{copyError}</p>}
        <DataTable columns={columns} data={filteredData} isLoading={loading} />
        <Dialog open={addFormOpen} onOpenChange={setAddFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="mb-4">Add Team</DialogTitle>
              <AddTeamForm
                onCancel={() => setAddFormOpen(false)}
                onSuccess={async () => {
                  setAddFormOpen(false);
                  // Refresh the data after successful submission
                  try {
                    const result = await selectData();
                    if (result) {
                      setData(result);
                    }
                  } catch {
                    setError("Failed to refresh teams. Please refresh the page.");
                  }
                }}
              />
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
