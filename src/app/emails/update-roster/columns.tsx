"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { ColumnDef } from "@tanstack/react-table";
import {Team} from "@/app/teams/columns";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const seasonOrder = ["Fall", "Winter", "Spring"];

const seasonRank = (season?: string) => {
  const index = seasonOrder.indexOf(season ?? "");
  return index === -1 ? seasonOrder.length : index;
};

export const columns = (
  toggleTeam: (team: Team) => void,
  selectedTeams: Team[],
  setSelectedTeams: (teams: Team[]) => void,
  allTeams: Team[],
): ColumnDef<Team>[] => [
  {
    id: "sport",
    accessorFn: (team) =>
      `${team.sport?.name ?? ""} ${team.grade} ${team.gender}`,
    sortingFn: "alphanumeric",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() =>
            column.toggleSorting(column.getIsSorted() === "asc", true)
          }
        >
          Team Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <span>
        {row.original.sport?.name +
          " " +
          row.original.grade +
          " " +
          row.original.gender}
      </span>
    ),
  },
  {
    id: "season",
    accessorFn: (team) => team.season,
    header: "Season",
    sortingFn: (a, b) =>
      seasonRank(a.original.season) - seasonRank(b.original.season),
  },
  {
    accessorKey: "teachers",
    header: "Emails",
    cell: ({ row }) => (
      <div className="w-[900px] truncate whitespace-normal break-words">
        {row.original.team_coaches2?.map((tc) => tc.coach).join(", ") ??
          ""}
      </div>
    ),
  },
  {
    id: "select",
    header: ({ table }) => {
      const rows = table.getRowModel().rows;
      const allSelected =
        rows.length > 0 &&
        rows.every((row) => selectedTeams.includes(row.original));

      return (
        <div className="flex items-center justify-end gap-3 text-right pr-4">
          <span>Check All:</span>
          <Checkbox
            checked={allSelected}
            onCheckedChange={() => {
              if (allSelected) {
                // Uncheck all
                setSelectedTeams([]);
              } else {
                // Check all
                setSelectedTeams([...allTeams]);
              }
            }}
            className="h-4 w-4 accent-blue-500"
            title="Select All"
          />
        </div>
      );
    },
    cell: ({ row }) => {
      const id = row.original;
      return (
        <div className="flex justify-end pr-4">
          <Checkbox
            checked={selectedTeams.includes(id)}
            onCheckedChange={() => toggleTeam(id)}
            className="h-4 w-4 accent-blue-500"
          />
        </div>
      );
    },
  },
];
