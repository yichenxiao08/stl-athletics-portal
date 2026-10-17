import { createClient } from "@/lib/supabase/client";
import { Player } from "../teams/[id]/columns";
import { Finance } from "../finances/columns";

export async function markAsPaid({
  playerId,
  teamId,
}: {
  playerId: number;
  teamId: number;
}) {
  const supabase = createClient();
  const { error } = await supabase
    .from("players")
    .update({ paid: true })
    .eq("id", playerId)
    .eq("team_id", teamId);
  const { data: players, error: selectError } = await supabase
    .from("players")
    .select()
    .eq("team_id", teamId);
  if (error) {
    throw new Error(error.message);
  }
  if (selectError) {
    throw new Error(selectError.message);
  }
  return (players ?? []) as Player[];
}
export async function markAsUnpaid({
  playerId,
  teamId,
}: {
  playerId: number;
  teamId: number;
}) {
  const supabase = createClient();
  const { error } = await supabase
    .from("players")
    .update({ paid: false })
    .eq("id", playerId)
    .eq("team_id", teamId);
  const { data: players, error: selectError } = await supabase
    .from("players")
    .select()
    .eq("team_id", teamId);
  if (error) {
    throw new Error(error.message);
  }
  if (selectError) {
    throw new Error(selectError.message);
  }
  return (players ?? []) as Player[];
}

// Read actual payment rows for the team's year instead of the all-years
// finance view, which can carry a previous year's payment forward.
export async function getTeamPayments(teamId: number): Promise<Finance[]> {
  const supabase = createClient();
  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("year")
    .eq("id", teamId)
    .single();
  if (teamError) throw new Error(teamError.message);

  const { data, error } = await supabase
    .from("players")
    .select("student_id, team_id, teams!inner(year)")
    .eq("paid", true)
    .eq("teams.year", team.year)
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((payment) => ({
    student_id: payment.student_id,
    name: "",
    paid_to_team: payment.team_id,
    year: team.year,
  }));
}

export async function getFinances() {
  const supabase = createClient();
  const { data, error } = await supabase.from("finances").select();
  if (error) {
    throw new Error(error.message);
  }
  const sortedData = (data as Finance[])
    .map((student) => {
      let firstName = "";
      let lastName = "";
      // Check if name is already in "Last, First" format
      if (student.name.includes(",")) {
        const parts = student.name.split(",").map((part) => part.trim());
        lastName = parts[0] || "";
        firstName = parts[1] || "";
      } else {
        // Names are stored as "Last Name First Name" - find the last space to split
        const trimmedName = student.name.trim();
        const lastSpaceIndex = trimmedName.indexOf(" ");

        if (lastSpaceIndex !== -1) {
          lastName = trimmedName.substring(0, lastSpaceIndex);
          firstName = trimmedName.substring(lastSpaceIndex + 1);
        } else {
          // Single name case - treat as first name
          firstName = trimmedName;
          lastName = "";
        }
      }

      return {
        ...student,
        name: lastName ? `${lastName}, ${firstName}` : firstName,
        // Store original name parts for sorting
        _firstName: firstName,
        _lastName: lastName,
      };
    })
    .sort((a, b) => {
      // Sort by last name, then by first name
      const lastNameCompare = a._lastName.localeCompare(b._lastName);
      if (lastNameCompare !== 0) return lastNameCompare;
      return a._firstName.localeCompare(b._firstName);
    })
    .map(({ _lastName, _firstName, ...student }) => student); // Remove temp sorting fields

  return sortedData as Finance[];
}

export const markManagerAsPaid = async ({
  managerId,
  teamId,
}: {
  managerId: number;
  teamId: number;
}) => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("managers")
    .update({ paid: true })
    .eq("id", managerId)
    .select();

  if (error) throw error;
  return data;
};

export const markManagerAsUnpaid = async ({
  managerId,
  teamId,
}: {
  managerId: number;
  teamId: number;
}) => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("managers")
    .update({ paid: false })
    .eq("id", managerId)
    .select();

  if (error) throw error;
  return data;
};
