import { createClient } from "@/lib/supabase/client";
import { Team } from "../teams/columns";

export const selectData = async () => {
  const supabase = createClient();
  const { data, error } = await supabase.from("teams").select(`
      *,
      sport:sports!sport_id (id, name, points),
      team_coaches2 (coach)
    `);
  if (!error) {
    // Sort the data alphabetically by sport, then grade, then gender
    const sortedData = (data as Team[]).sort((a, b) => {
      // First sort by sport
      if ((a.sport?.name || "") !== (b.sport?.name || "")) {
        return (a.sport?.name || "").localeCompare(b.sport?.name || "");
      }
      // Then by grade
      if (a.grade !== b.grade) {
        return a.grade.localeCompare(b.grade);
      }
      // Finally by gender
      return a.gender.localeCompare(b.gender);
    });
    return sortedData as Team[];
  }
};


export const addTeam = async ({
  sport,
  year,
  season,
  grade,
  gender,
  teachers,
}: {
  sport: string;
  year: string;
  season: string;
  grade: string;
  gender: string;
  teachers: string[]; // array of coach emails/names
}) => {
  const supabase = createClient();

  // Step 1: Get the sport_id from the sports table
  const { data: sportData, error: sportError } = await supabase
    .from("sports")
    .select("id, points")
    .eq("name", sport)
    .single();

  if (sportError || !sportData) {
    return;
  }

  // Step 2: Insert the team with sport_id
  const { data: teamData, error: teamError } = await supabase
    .from("teams")
    .insert({
      sport,
      grade,
      gender,
      season,
      points: sportData.points, // Get points from sport
      year,
      sport_id: sportData.id,
    })
    .select()
    .single();

  if (teamError || !teamData) {
    return;
  }

  // Step 3: Insert into team_coaches2 table
  const normalizedTeachers = Array.from(
    new Set(
      (teachers ?? [])
        .map((coach) => coach.trim())
        .filter((coach) => coach.length > 0)
    )
  );

  if (normalizedTeachers.length > 0) {
    const teamCoachInserts = normalizedTeachers.map((coach) => ({
      team_id: teamData.id,
      coach,
    }));

    const { error: junctionError } = await supabase
      .from("team_coaches2")
      .upsert(teamCoachInserts, {
        onConflict: "team_id,coach",
        ignoreDuplicates: true,
      })
      .select();

    if (junctionError) {
      return;
    }
  }

  return [teamData] as Team[];
};

export const copyTeamsFromPreviousYear = async ({
  sourceYear,
  targetYear,
}: {
  sourceYear: string;
  targetYear: string;
}) => {
  const supabase = createClient();

  // Keep this guard in the data layer as well as the UI so a second tab or
  // concurrent request cannot accidentally duplicate the target year's teams.
  const { data: existingTargetTeams, error: targetTeamsError } = await supabase
    .from("teams")
    .select("id")
    .eq("year", targetYear)
    .limit(1);

  if (targetTeamsError) {
    throw new Error(targetTeamsError.message);
  }

  if (existingTargetTeams.length > 0) {
    throw new Error(`Teams already exist for ${targetYear}.`);
  }

  const { data: sourceTeams, error: sourceTeamsError } = await supabase
    .from("teams")
    .select(`
      sport,
      sport_id,
      gender,
      grade,
      points,
      season,
      team_coaches2 (coach)
    `)
    .eq("year", sourceYear);

  if (sourceTeamsError) {
    throw new Error(sourceTeamsError.message);
  }

  if (!sourceTeams || sourceTeams.length === 0) {
    throw new Error(`No teams were found for ${sourceYear}.`);
  }

  const createdTeamIds: number[] = [];

  try {
    for (const sourceTeam of sourceTeams) {
      const { data: newTeam, error: teamError } = await supabase
        .from("teams")
        .insert({
          sport: sourceTeam.sport,
          sport_id: sourceTeam.sport_id,
          gender: sourceTeam.gender,
          grade: sourceTeam.grade,
          points: sourceTeam.points,
          season: sourceTeam.season,
          year: targetYear,
          seasonHighlights: null,
          yearbookMessage: null,
        })
        .select("id")
        .single();

      if (teamError || !newTeam) {
        throw new Error(teamError?.message ?? "Failed to create a copied team.");
      }

      createdTeamIds.push(newTeam.id);

      const coaches = (sourceTeam.team_coaches2 ?? [])
        .map((teamCoach: { coach: string }) => teamCoach.coach?.trim())
        .filter((coach: string | undefined): coach is string => Boolean(coach));

      if (coaches.length > 0) {
        const { error: coachesError } = await supabase
          .from("team_coaches2")
          .insert(
            Array.from(new Set(coaches)).map((coach) => ({
              team_id: newTeam.id,
              coach,
            }))
          );

        if (coachesError) {
          throw new Error(coachesError.message);
        }
      }
    }
  } catch (error) {
    // Avoid leaving a partially copied year if any team or coach insert fails.
    if (createdTeamIds.length > 0) {
      await supabase.from("teams").delete().in("id", createdTeamIds);
    }
    throw error instanceof Error
      ? error
      : new Error("Failed to copy teams from the previous year.");
  }

  return createdTeamIds;
};

export const updateTeam = async ({
  id,
  sport_id,
  year,
  season,
  grade,
  gender,
  teachers,
  seasonHighlights,
  yearbookMessage,
}: {
  id: number;
  sport_id: number;
  year: string;
  season: string;
  grade: string;
  gender: string;
  teachers: string[]; // array of coach emails/names
  seasonHighlights: string;
  yearbookMessage: string;
}) => {
  const supabase = createClient();

  // Step 1: Update the team basic info
  const { data: teamData, error: teamError } = await supabase
    .from("teams")
    .update({
      sport_id,
      grade,
      gender,
      season,
      year,
      seasonHighlights,
      yearbookMessage,
    })
    .eq("id", id)
    .select()
    .single();

  if (teamError) {
    return;
  }

  // Step 2: Delete existing coach assignments
  const { error: deleteError } = await supabase
    .from("team_coaches2")
    .delete()
    .eq("team_id", id);

  if (deleteError) {
    return;
  }

  // Step 3: Insert new coach assignments
  const normalizedTeachers = Array.from(
    new Set(
      (teachers ?? [])
        .map((coach) => coach.trim())
        .filter((coach) => coach.length > 0)
    )
  );

  if (normalizedTeachers.length > 0) {
    const teamCoachInserts = normalizedTeachers.map((coach) => ({
      team_id: id,
      coach,
    }));

    const { error: junctionError } = await supabase
      .from("team_coaches2")
      .upsert(teamCoachInserts, {
        onConflict: "team_id,coach",
        ignoreDuplicates: true,
      })
      .select();

    if (junctionError) {
      return;
    }
  }

  return [teamData] as Team[];
};

export const deleteTeam = async ({ id }: { id: number }) => {
  const supabase = createClient();
  // The team_coaches2 entries will be deleted automatically due to ON DELETE CASCADE
  const { data, error } = await supabase
    .from("teams")
    .delete()
    .eq("id", id)
    .select();
  if (!error) {
    return data as Team[];
  }
};
