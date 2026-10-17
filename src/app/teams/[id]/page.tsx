"use client";
import { Student } from "@/app/students/columns";
import Navigation from "@/components/navbar";
import { Team } from "../columns";
import { Player, createColumns } from "./columns";
import { Manager, createManagerColumns } from "./managerColumns";
import { DataTable } from "./data-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useState, use, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { selectData as selectCoaches } from "@/app/functions/coaches";
import {
  selectData,
  updateTeam,
  deleteTeam,
} from "../../functions/teams";
import {selectData as selectSports} from "@/app/functions/sports"
import {
  selectablePlayers,
  selectTeamPlayers,
  addPlayer as addPlayerApi,
  deletePlayer as deletePlayerApi,
  updateCheckbox,
  selectableManagers,
  selectTeamManagers,
  addManager,
  deleteManager,
  updateManagerPaid,
} from "@/app/functions/team";
import { selectData as selectStudents } from "@/app/functions/students";
import { Input } from "@/components/ui/input";
import { useSchoolYear } from "@/lib/school-year-context";
import {
  getTeamPayments,
  markManagerAsPaid,
  markManagerAsUnpaid,
} from "@/app/functions/finances";
import { Finance } from "@/app/finances/columns";
import { Sport } from "@/app/sports/columns";
import { Coach } from "@/app/coaches/columns";
const createEditTeamSchema = (
  existingTeams: Team[] = [],
  currentTeamId?: number
) =>
      z
    .object({
      sport_id: z.number().int().min(1, "Sport is required"),
      gender: z.string().min(1, "Gender is required"),
      grade: z.string().min(1, "Grade is required"),
      season: z.string().min(1, "Season is required"),
      year: z.string().min(1, "Year is required"),
      teachers: z
        .array(z.email("Invalid email address"))
        .min(1, "At least one coach is required"),
      points: z.number().int().min(0, "Points must be a non-negative integer"),
      seasonHighlights: z.string().optional(),
      yearbookMessage: z.string().optional(),
    })
    .superRefine((values, ctx) => {
      const existingTeam = existingTeams.find(
        (team) =>
          team.id !== currentTeamId &&
          team.sport_id === values.sport_id &&
          team.gender === values.gender &&
          team.grade === values.grade &&
          team.year === values.year
      );

      if (existingTeam && existingTeam.id !== currentTeamId) {
        ctx.addIssue({
          code: "custom",
          message:
            "A team with this sport, gender, and grade combination already exists",
          path: ["sport_id"],
        });
      }
    });
export default function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { selectedYear } = useSchoolYear();
  const resolvedParams = use(params);
  const teamId = Number(resolvedParams.id);

  const [data, setData] = useState<Team[]>([]);
  const [finances, setFinances] = useState<Finance[]>();
  const [sports, setSports] = useState<Sport[]>([]);
  const [selectedSport, setSelectedSport] = useState<string | null>();
  const [availableCoaches, setAvailableCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteIsOpen, setDeleteIsOpen] = useState(false);
  const [toBeDeleted, setToBeDeleted] = useState<Player | null>(null);
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [coachSearchOpen, setCoachSearchOpen] = useState(false);
  const [coachDraft, setCoachDraft] = useState("");
  const [deleteTeamIsOpen, setDeleteTeamIsOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingTeam, setIsDeletingTeam] = useState(false);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [addManagerOpen, setAddManagerOpen] = useState(false);
  const [toBeDeletedManager, setToBeDeletedManager] = useState<Manager | null>(
    null
  );
  const [deleteManagerIsOpen, setDeleteManagerIsOpen] = useState(false);

  const [players, setPlayers] = useState<Player[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);

  // Add Player / Add Manager dialogs use server-side search (see effects below)
  // instead of loading every student into memory and filtering on the client.
  const [addablePlayers, setAddablePlayers] = useState<Student[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerSearchLoading, setPlayerSearchLoading] = useState(false);
  const [addableManagers, setAddableManagers] = useState<Student[]>([]);
  const [managerSearch, setManagerSearch] = useState("");
  const [managerSearchLoading, setManagerSearchLoading] = useState(false);

  const router = useRouter();
  const getPayments = async () => {
    try {
      const financesResult = await getTeamPayments(teamId);
      if (financesResult) {
        setFinances(financesResult);
      }
    } catch {
      setActionError("Failed to load payment information. Please try again.");
    }
  };
  const columns = createColumns({
    actions: {
      onDelete: (player) => {
        setToBeDeleted(player);
        setDeleteIsOpen(true);
      },
      onUpdateCheckbox: (playerId, field, value) => {
        // Optimistic update - update players state immediately
        setPlayers((prevPlayers) =>
          prevPlayers.map((player) =>
            player.id === playerId ? { ...player, [field]: value } : player
          )
        );
      },
      onSelectAll: (field) => {
        setPlayers((prevPlayers) =>
          prevPlayers.map((player) => ({
            ...player,
            [field]: true,
          }))
        );
        players.map((player) => {
          updateCheckbox({ playerId: player.id, param: field, value: true });
        });
      },
      onUpdateRadio: (playerId, field, value) => {
        // For radio buttons, we need to clear other radio options and set the selected one
        setPlayers((prevPlayers) =>
          prevPlayers.map((player) =>
            player.id === playerId
              ? {
                  ...player,
                  mvp: field === "mvp" ? true : player.mvp,
                  lca: field === "lca" ? true : player.lca,
                }
              : {
                  ...player,
                  mvp: field === "mvp" ? false : player.mvp,
                  lca: field === "lca" ? false : player.lca,
                }
          )
        );
      },
    },
    reloadData: (data: Player[]) => {
      setPlayers(data);
      getPayments();
    },
    finances: finances ?? [],
  });

  // Initial data load — all independent fetches run in parallel.
  useEffect(() => {
    const loadData = async () => {
      try {
        const [
          teamsResult,
          sportsResult,
          coachesResult,
          playersResult,
          studentsResult,
          managersResult,
          financesResult,
        ] = await Promise.all([
          selectData(),
          selectSports(),
          selectCoaches(),
          selectTeamPlayers(teamId),
          selectStudents(),
          selectTeamManagers(teamId),
          getTeamPayments(teamId),
        ]);

        if (teamsResult) setData(teamsResult);
        if (sportsResult) setSports(sportsResult);
        if (coachesResult) setAvailableCoaches(coachesResult);
        if (playersResult) setPlayers(playersResult);
        if (studentsResult) setAllStudents(studentsResult);
        if (managersResult) setManagers(managersResult);
        if (financesResult) setFinances(financesResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [teamId]);

  // Debounced server-side search for the Add Player dialog.
  useEffect(() => {
    if (!addPlayerOpen) return;
    let active = true;
    setPlayerSearchLoading(true);
    const handle = setTimeout(async () => {
      try {
        const results = await selectablePlayers(teamId, playerSearch);
        if (active) setAddablePlayers(results);
      } catch {
        if (active)
          setActionError("Failed to search players. Please try again.");
      } finally {
        if (active) setPlayerSearchLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [playerSearch, addPlayerOpen, teamId]);

  // Debounced server-side search for the Add Manager dialog.
  useEffect(() => {
    if (!addManagerOpen) return;
    let active = true;
    setManagerSearchLoading(true);
    const handle = setTimeout(async () => {
      try {
        const results = await selectableManagers(teamId, managerSearch);
        if (active) setAddableManagers(results);
      } catch {
        if (active)
          setActionError("Failed to search students. Please try again.");
      } finally {
        if (active) setManagerSearchLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [managerSearch, addManagerOpen, teamId]);

  const onDeletePlayer = async (player: Player) => {
    setActionError(null);
    try {
      await deletePlayerApi(player.id);
      setPlayers((prev) => prev.filter((p) => p.id !== player.id));
      setDeleteIsOpen(false);
      // Refresh the add-player results so the removed player is selectable again.
      if (addPlayerOpen) {
        const results = await selectablePlayers(teamId, playerSearch);
        setAddablePlayers(results);
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to delete player"
      );
    }
  };

  const team = data.find((item) => item.id === teamId);
  const editTeamSchema = createEditTeamSchema(data, team?.id);
  const editTeamForm = useForm<z.infer<typeof editTeamSchema>>({
    resolver: zodResolver(editTeamSchema),
    defaultValues: {
      sport_id: 0,
      gender: "",
      grade: "",
      season: "",
      teachers: [],
      points: 0,
      year: "",
      seasonHighlights: "",
      yearbookMessage: "",
    },
  });
  const selectedCoaches = editTeamForm.watch("teachers") ?? [];

  const [formInitialized, setFormInitialized] = useState(false);

  useEffect(() => {
    if (team && !formInitialized) {
      const coaches = team.team_coaches2?.map((tc) => tc.coach) ?? [];
      setSelectedSport(team.sport?.name);

      editTeamForm.reset({
        sport_id: team.sport_id,
        gender: team.gender,
        grade: team.grade,
        season: team.season,
        teachers: coaches,
        points: team.sport?.points ?? 0,
        year: team.year,
        seasonHighlights: team.seasonHighlights || "",
        yearbookMessage: team.yearbookMessage || "",
      });

      setFormInitialized(true);
    }
  }, [team, formInitialized]);

  if (loading || !formInitialized) {
    return <div className="px-16 py-8">Loading team data...</div>;
  }

  if (error) {
    return <div className="px-16 py-8">Error loading team data: {error}</div>;
  }

  if (!team) {
    return <div className="px-16 py-8">Team not found</div>;
  }

  const addPlayer = async (player: Student) => {
    setActionError(null);
    try {
      const result = await addPlayerApi({
        team_id: teamId,
        student_id: Number(player.id),
        yraa: false,
        ofsaa: false,
        mvp: false,
        lca: false,
        paid: false,
      });
      if (result) {
        const refreshedPlayers = await selectTeamPlayers(teamId);
        if (refreshedPlayers) {
          setPlayers(refreshedPlayers);
        }
        setAddablePlayers((prev) => prev.filter((p) => p.id !== player.id));
        setAddPlayerOpen(false);
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to add player"
      );
    }
  };

  const addManagerHandler = async (student: Student) => {
    setActionError(null);
    try {
      await addManager({
        team_id: teamId,
        student_id: student.id,
        paid: false,
      });

      const refreshed = await selectTeamManagers(teamId);
      setManagers(refreshed);
      setAddableManagers((prev) => prev.filter((p) => p.id !== student.id));
      setAddManagerOpen(false);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to add manager"
      );
    }
  };

  const onDeleteManager = async (manager: Manager) => {
    setActionError(null);
    try {
      await deleteManager(manager.id);
      setManagers((prev) => prev.filter((m) => m.id !== manager.id));
      setDeleteManagerIsOpen(false);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to delete manager"
      );
    }
  };

  const reloadManagers = async (data?: Manager[]) => {
    if (data) setManagers(data);
    await getPayments(); // refresh finances
    const refreshedPlayers = await selectTeamPlayers(teamId);
    setPlayers(refreshedPlayers);
  };

  const removeCoach = (coach: string) => {
    const trimmed = coach.trim();
    const newCoaches = editTeamForm
      .getValues("teachers")
      .filter((c) => c.trim() !== trimmed);
    editTeamForm.setValue("teachers", newCoaches, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const getCoachDisplayName = (email: string) => {
    const name = email.split("@")[0];
    return name
      .split(".")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };
  const addCoach = (coach: string) => {
    const trimmed = coach.trim();
    const currentCoaches = editTeamForm.getValues("teachers").map(c => c.trim());
    if (!trimmed || currentCoaches.includes(trimmed)) return;
    const newCoaches = [...editTeamForm.getValues("teachers"), trimmed];
    editTeamForm.setValue("teachers", newCoaches, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };
  const onEditSportSave = async (values: z.infer<typeof editTeamSchema>) => {
    setSaveError(null);
    setIsSaving(true);
    try {
      const result = await updateTeam({
        id: team.id,
        sport_id: values.sport_id,
        year: values.year,
        season: values.season,
        grade: values.grade,
        gender: values.gender,
        teachers: values.teachers,
        seasonHighlights: values.seasonHighlights || "",
        yearbookMessage: values.yearbookMessage || "",
      });

      if (result) {
        // Refresh the team data
        const refreshedData = await selectData();
        if (refreshedData) {
          setData(refreshedData);
        }
      } else {
        setSaveError(
          "Unable to save team. Please check the coach assignments and try again."
        );
      }
    } catch {
      setSaveError("Failed to update team. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const onDeleteTeam = async () => {
    setActionError(null);
    setIsDeletingTeam(true);
    try {
      const result = await deleteTeam({ id: team.id });

      if (result) {
        // Navigate back to teams page
        router.push("/teams");
      } else {
        setActionError("Failed to delete team. Please try again.");
      }
    } catch {
      setActionError("Failed to delete team. Please try again.");
    } finally {
      setIsDeletingTeam(false);
    }
  };

  return (
    <>
      <Navigation />
      <div className="px-16 py-8">
        <div className="font-bold text-3xl mb-4">
          {team.grade} {team.gender} {team.sport?.name}
        </div>
        {actionError && (
          <p className="mb-4 text-sm text-destructive">{actionError}</p>
        )}
        <div className="grid grid-cols-[1fr_2fr] gap-16">
          <div>
            <div className="text-xl font-semibold mb-4">
              Edit Team Information
            </div>
            <Form {...editTeamForm}>
              <form
                onSubmit={editTeamForm.handleSubmit(onEditSportSave, () =>
                  setSaveError("Please fix the highlighted fields above.")
                )}
                className="space-y-4"
              >
                <FormField
                  control={editTeamForm.control}
                  name="sport_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sport</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          const sportId = parseInt(value);
                          field.onChange(sportId);
                          // Find the selected sport and set its name and points
                          const selectedSport = sports.find(
                            (s) => s.id === sportId
                          );
                          if (selectedSport) {
                            setSelectedSport(selectedSport.name);
                            editTeamForm.setValue(
                              "points",
                              selectedSport.points
                            );
                          }
                        }}
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select sport" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sports.map((sport) => (
                            <SelectItem key={sport.id} value={sport.id.toString()}>
                              {sport.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editTeamForm.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Boys">Boys</SelectItem>
                          <SelectItem value="Girls">Girls</SelectItem>
                          <SelectItem value="Co-ed">Co-ed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editTeamForm.control}
                  name="grade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grade</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select grade level" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Jr.">Junior</SelectItem>
                          <SelectItem value="Sr.">Senior</SelectItem>
                          <SelectItem value="Varsity">Varsity</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editTeamForm.control}
                  name="points"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Points</FormLabel>
                      <Input {...field} disabled />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editTeamForm.control}
                  name="season"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Season</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select season" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Fall">Fall</SelectItem>
                          <SelectItem value="Winter">Winter</SelectItem>
                          <SelectItem value="Spring">Spring</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editTeamForm.control}
                  name="year"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Year</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select year" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={selectedYear}>
                            {selectedYear}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editTeamForm.control}
                  name="teachers"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between items-center">
                        <FormLabel>Coaches</FormLabel>
                        <Button
                          type="button"
                          className="p-0 h-auto text-gray-500"
                          variant="link"
                          onClick={() => setCoachSearchOpen(true)}
                        >
                          Add Coaches
                        </Button>
                      </div>
                      <FormControl>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2 min-h-[2.5rem] px-3 py-2 border rounded-md">
                            {field.value.length === 0 ? (
                              <div className="text-muted-foreground text-sm">
                                No coaches selected
                              </div>
                            ) : (
                              Array.from(new Set(field.value.map(c => c.trim()))).map((coach) => (
                                <Badge
                                  key={coach}
                                  variant="secondary"
                                  className="flex items-center gap-1"
                                >
                                  {getCoachDisplayName(coach)}
                                  <X
                                    className="h-3 w-3 cursor-pointer rounded-full"
                                    onClick={() => removeCoach(coach)}
                                  />
                                </Badge>
                              ))
                            )}
                          </div>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editTeamForm.control}
                  name="seasonHighlights"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Season Highlights</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter season highlights"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editTeamForm.control}
                  name="yearbookMessage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Yearbook Message</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter a message for the yearbook"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {saveError && (
                  <p className="text-sm text-destructive">{saveError}</p>
                )}
                <div className="flex justify-between items-center">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setDeleteTeamIsOpen(true)}
                  >
                    Delete Team
                  </Button>
                  <div className="gap-2 flex">
                    <Button type="button" variant="secondary" disabled={isSaving}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          </div>
          <div>
            <div className="flex gap-6 items-center mb-4 ">
              <div className="text-xl font-semibold">Players</div>
              <Button
                onClick={() => {
                  setAddPlayerOpen(true);
                }}
                className="text-xs h-8"
              >
                Add Player
              </Button>
            </div>
            <DataTable
              columns={columns}
              data={players.map((player) => {
                const student = allStudents.find(
                  (s) => String(s.id) === String(player.student_id)
                );
                return {
                  ...player,
                  name: student?.name || `Student ${player.student_id}`,
                  grade: student?.grade || 0,
                };
              })}
            />
            <AlertDialog>
              <AlertDialog open={deleteIsOpen} onOpenChange={setDeleteIsOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Are you absolutely sure you want to delete{" "}
                      {toBeDeleted?.name}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        if (toBeDeleted) onDeletePlayer(toBeDeleted);
                      }}
                    >
                      Continue
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </AlertDialog>
            <AlertDialog>
              <AlertDialog
                open={deleteTeamIsOpen}
                onOpenChange={setDeleteTeamIsOpen}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Are you absolutely sure you want to delete {team.grade}{" "}
                      {team.gender} {team.sport?.name || ""}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeletingTeam}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault();
                        onDeleteTeam();
                      }}
                      disabled={isDeletingTeam}
                    >
                      {isDeletingTeam ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Continue"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </AlertDialog>
            <CommandDialog
              open={addPlayerOpen}
              onOpenChange={(open) => {
                setAddPlayerOpen(open);
                if (!open) setPlayerSearch("");
              }}
              shouldFilter={false}
            >
              <DialogTitle className="sr-only">Add Player</DialogTitle>
              <DialogDescription className="sr-only">
                Search and add a player to this team.
              </DialogDescription>
              <CommandInput
                placeholder="Search for a player to add..."
                value={playerSearch}
                onValueChange={setPlayerSearch}
              />
              <CommandList>
                <CommandEmpty>
                  {playerSearchLoading ? "Searching..." : "No results found."}
                </CommandEmpty>
                <CommandGroup>
                  {addablePlayers.map((player) => (
                    <CommandItem
                      key={player.id}
                      value={String(player.id)}
                      onSelect={() => addPlayer(player)}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{player.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {player.email}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </CommandDialog>

            <div className="flex gap-6 items-center mt-8 mb-4">
              <div className="text-xl font-semibold">Managers</div>
              <Button
                onClick={() => setAddManagerOpen(true)}
                className="text-xs h-8"
              >
                Add Manager
              </Button>
            </div>

            <DataTable
              columns={createManagerColumns({
                onDelete: (manager) => {
                  setToBeDeletedManager(manager);
                  setDeleteManagerIsOpen(true);
                },
                reloadData: reloadManagers,
                finances: finances ?? [],
              })}
              data={managers.map((manager) => {
                const student = allStudents.find(
                  (s) => String(s.id) === String(manager.student_id)
                );
                return {
                  ...manager,
                  name: student?.name || `Student ${manager.student_id}`,
                };
              })}
            />

            <AlertDialog
              open={deleteManagerIsOpen}
              onOpenChange={setDeleteManagerIsOpen}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Are you sure you want to delete {toBeDeletedManager?.name}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      if (toBeDeletedManager)
                        onDeleteManager(toBeDeletedManager);
                    }}
                  >
                    Continue
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <CommandDialog
              open={addManagerOpen}
              onOpenChange={(open) => {
                setAddManagerOpen(open);
                if (!open) setManagerSearch("");
              }}
              shouldFilter={false}
            >
              <DialogTitle className="sr-only">Add Manager</DialogTitle>
              <DialogDescription className="sr-only">
                Search and add a manager to this team.
              </DialogDescription>
              <CommandInput
                placeholder="Search for a manager..."
                value={managerSearch}
                onValueChange={setManagerSearch}
              />
              <CommandList>
                <CommandEmpty>
                  {managerSearchLoading ? "Searching..." : "No results found."}
                </CommandEmpty>
                <CommandGroup>
                  {addableManagers.map((manager) => (
                    <CommandItem
                      key={manager.id}
                      value={String(manager.id)}
                      onSelect={() => addManagerHandler(manager)}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{manager.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {manager.email}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </CommandDialog>

            <CommandDialog
              open={coachSearchOpen}
              onOpenChange={setCoachSearchOpen}
            >
              <DialogTitle className="sr-only">Search Coaches</DialogTitle>
              <DialogDescription className="sr-only">
                Search and add coach emails for this team.
              </DialogDescription>
              <CommandInput
                placeholder="Search for a coach email to add..."
                value={coachDraft}
                onValueChange={(value) => setCoachDraft(value)}
              />
              <CommandList>
                <CommandEmpty>
                  {coachDraft.trim() ? "No matches." : "No coaches found."}
                </CommandEmpty>
                <CommandGroup>
                  {Array.from(new Set(availableCoaches?.map(c => c.coach.trim()) ?? []))
                    .filter(
                      (coach) =>
                        coach
                          .toLowerCase()
                          .includes(coachDraft.trim().toLowerCase()) &&
                        !selectedCoaches.map(c => c.trim()).includes(coach)
                    )
                    .map((coach) => (
                      <CommandItem
                        key={coach}
                        value={coach}
                        onSelect={() => {
                          addCoach(coach);
                          setCoachSearchOpen(false);
                          setCoachDraft("");
                        }}
                        className="cursor-pointer"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {getCoachDisplayName(coach)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {coach}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  {coachDraft.trim() &&
                    !selectedCoaches.includes(coachDraft.trim()) && (
                      <CommandItem
                        value={coachDraft.trim()}
                        onSelect={() => {
                          addCoach(coachDraft.trim());
                          setCoachSearchOpen(false);
                          setCoachDraft("");
                        }}
                        className="cursor-pointer"
                      >
                        Add &quot;{coachDraft.trim()}&quot;
                      </CommandItem>
                    )}
                </CommandGroup>
              </CommandList>
            </CommandDialog>

          </div>
        </div>
      </div>
    </>
  );
}
