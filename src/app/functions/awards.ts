import { createClient } from "@/lib/supabase/client";

export type AwardWinnerEntry = {
  id: number;
  award: string;
  year: number;
};

export async function saveAwardWinners(entries: AwardWinnerEntry[]) {
  if (entries.length === 0) {
    return 0;
  }

  const uniqueEntries = Array.from(
    new Map(entries.map((entry) => [entry.id, entry])).values()
  );
  const supabase = createClient();
  const { data, error } = await supabase
    .from("award_winners")
    .upsert(uniqueEntries, { onConflict: "id" })
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  return data?.length ?? uniqueEntries.length;
}

export async function selectPreviousWinners(){
  const supabase = createClient();
  const { data, error } = await supabase
    .from("award_winners")
    .select("*, student_points!inner(points, name)");
  if(!data){
    throw new Error(error.message);
  }
  
  return data;
}

export async function addWinner({id, award, year} : {id: number; award: string; year: number}){
  const supabase = createClient();
  const {data , error} = await supabase.from("award_winners").insert({id, award, year}).select("*, student_points!inner(points,name)");
  if(!data){
    throw new Error(error.message);
  }
  return data;
}
export async function updateWinner({
  id,
  award,
  year,
}: {
  id: number;
  award: string;
  year: number;
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("award_winners")
    .update({ id, award, year })
    .eq("id", id)
    .select("*, student_points!inner(points,name)");
  if (!data) {
    throw new Error(error.message);
  }
  return data;
}
